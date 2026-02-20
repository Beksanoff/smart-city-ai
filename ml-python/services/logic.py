"""
Prediction Logic Service
Uses real historical data from Open-Meteo archive (2,234 records of Almaty weather).
Correlations are computed from actual data using pandas, not hardcoded rules.
"""

import os
import asyncio
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Try to import groq, handle if not available
try:
    from groq import Groq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False
    logger.warning("Groq library not available, using mock predictions")


class PredictionService:
    """Service for generating urban condition predictions using real data statistics"""
    
    def __init__(self):
        self.data_path = Path(__file__).parent.parent / "data" / "almaty_history.csv"
        self.df = self._load_data()
        self.groq_client = self._init_groq()
        # Precompute statistics from real data
        self.monthly_stats = self._compute_monthly_stats()
        self.correlations = self._compute_correlations()
        
    def _load_data(self) -> Optional[pd.DataFrame]:
        """Load historical CSV data"""
        try:
            if self.data_path.exists():
                df = pd.read_csv(self.data_path, parse_dates=["date"])
                logger.info(f"Loaded {len(df)} historical records from {self.data_path}")
                return df
            else:
                logger.warning(f"Data file not found: {self.data_path}")
                return None
        except Exception as e:
            logger.error(f"Failed to load data: {e}")
            return None
    
    def _init_groq(self) -> Optional[Any]:
        """Initialize Groq client"""
        api_key = os.getenv("GROQ_API_KEY")
        if api_key and GROQ_AVAILABLE:
            try:
                return Groq(api_key=api_key)
            except Exception as e:
                logger.error(f"Failed to initialize Groq: {e}")
        return None

    def _compute_monthly_stats(self) -> Dict[int, Dict[str, float]]:
        """Compute per-month statistics from actual data"""
        if self.df is None or self.df.empty:
            return {}
        stats = {}
        cols = self.df.columns
        for month in range(1, 13):
            m = self.df[self.df["month"] == month]
            if m.empty:
                continue
            s: Dict[str, float] = {
                "temp_mean": round(float(m["temperature"].mean()), 1),
                "temp_std": round(float(m["temperature"].std()), 1),
                "aqi_mean": round(float(m["aqi"].mean()), 0),
                "aqi_std": round(float(m["aqi"].std()), 0),
                "aqi_p25": round(float(m["aqi"].quantile(0.25)), 0),
                "aqi_p75": round(float(m["aqi"].quantile(0.75)), 0),
                "traffic_mean": round(float(m["traffic_index"].mean()), 1),
                "traffic_std": round(float(m["traffic_index"].std()), 1),
                "records": len(m),
            }
            # Optional columns (only in the real Open-Meteo dataset)
            if "pm25" in cols:
                s["pm25_mean"] = round(float(m["pm25"].mean()), 1)
            if "humidity" in cols:
                s["humidity_mean"] = round(float(m["humidity"].mean()), 0)
            if "wind_speed" in cols:
                s["wind_mean"] = round(float(m["wind_speed"].mean()), 1)
            if "precipitation" in cols:
                s["precip_mean"] = round(float(m["precipitation"].mean()), 1)
            stats[month] = s
        logger.info(f"Computed monthly stats for {len(stats)} months")
        return stats

    def _compute_correlations(self) -> Dict[str, float]:
        """Compute actual correlation coefficients from data"""
        if self.df is None or self.df.empty:
            return {}
        desired = ["temperature", "aqi", "traffic_index", "pm25", "humidity", "wind_speed"]
        existing = [c for c in desired if c in self.df.columns]
        if len(existing) < 2:
            return {}
        corr_matrix = self.df[existing].corr()
        result = {}
        for i, c1 in enumerate(existing):
            for c2 in existing[i+1:]:
                key = f"{c1}_vs_{c2}"
                val = corr_matrix.loc[c1, c2]
                if pd.notna(val):
                    result[key] = round(float(val), 3)
        logger.info(f"Key correlation: temp vs AQI = {result.get('temperature_vs_aqi', 'N/A')}")
        return result

    async def predict(
        self,
        date: Optional[str] = None,
        temperature: Optional[float] = None,
        query: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate prediction using real data statistics"""
        # Parse date or use current
        if date:
            try:
                target_date = datetime.strptime(date, "%Y-%m-%d")
            except ValueError:
                target_date = datetime.now()
        else:
            target_date = datetime.now()
        
        month = target_date.month
        is_weekend = target_date.weekday() >= 5
        
        # Get prediction from real statistics
        aqi_prediction, traffic_prediction, confidence, base_insight = self._predict_from_data(
            month=month,
            temperature=temperature,
            is_weekend=is_weekend,
        )
        
        # Get AI-enhanced prediction via Groq
        if self.groq_client and query:
            prediction_text = await self._get_groq_prediction(
                month=month,
                temperature=temperature,
                aqi=aqi_prediction,
                traffic=traffic_prediction,
                query=query,
                stats=self.monthly_stats.get(month, {}),
            )
            is_mock = False
        else:
            prediction_text = base_insight
            is_mock = not bool(self.groq_client)
        
        return {
            "prediction": prediction_text,
            "confidence_score": round(confidence, 2),
            "aqi_prediction": aqi_prediction,
            "traffic_index_prediction": round(traffic_prediction, 1),
            "reasoning": self._get_reasoning(month, temperature),
            "is_mock": is_mock,
        }
    
    def _predict_from_data(
        self,
        month: int,
        temperature: Optional[float],
        is_weekend: bool,
    ) -> tuple:
        """
        Predict AQI and traffic using actual monthly distributions.
        When temperature is provided, uses temperature-AQI regression slope.
        Returns (aqi, traffic, confidence, insight_text).
        """
        stats = self.monthly_stats.get(month)
        if not stats:
            # Fallback to overall averages
            if self.df is not None and not self.df.empty:
                aqi = int(self.df["aqi"].mean())
                traffic = float(self.df["traffic_index"].mean())
                return aqi, traffic, 0.50, "Нет данных за этот месяц. Показаны общие средние."
            return 80, 55.0, 0.30, "Нет исторических данных."

        base_aqi = stats["aqi_mean"]
        base_traffic = stats["traffic_mean"]
        n = stats["records"]
        
        # Confidence scales with data volume (min 0.55 with 30 records, up to 0.92 with 200+)
        confidence = min(0.92, 0.55 + 0.002 * n)

        # Adjust AQI if temperature is given (use temperature→AQI slope from data)
        if temperature is not None and self.df is not None:
            m_data = self.df[self.df["month"] == month]
            if len(m_data) > 10:
                # Linear regression: AQI = a + b * temperature
                temp_mean = m_data["temperature"].mean()
                temp_diff = temperature - temp_mean
                # Compute slope from data
                cov = ((m_data["temperature"] - temp_mean) * (m_data["aqi"] - m_data["aqi"].mean())).mean()
                var = ((m_data["temperature"] - temp_mean) ** 2).mean()
                if var > 0:
                    slope = cov / var
                    base_aqi += slope * temp_diff
                    confidence += 0.03  # slight boost for having temperature

        # Weekend traffic reduction (from data)
        if is_weekend and self.df is not None:
            weekend_data = self.df[(self.df["month"] == month) & (self.df["is_weekend"] == True)]
            weekday_data = self.df[(self.df["month"] == month) & (self.df["is_weekend"] == False)]
            if not weekend_data.empty and not weekday_data.empty:
                ratio = weekend_data["traffic_index"].mean() / max(weekday_data["traffic_index"].mean(), 1)
                base_traffic *= ratio

        aqi_pred = max(0, min(500, int(round(base_aqi))))
        traffic_pred = max(0, min(100, base_traffic))
        confidence = min(0.95, confidence)

        # Generate insight in Russian
        insight = self._generate_data_insight(month, aqi_pred, traffic_pred, stats, temperature)

        return aqi_pred, traffic_pred, confidence, insight

    def _generate_data_insight(
        self, month: int, aqi: int, traffic: float,
        stats: Dict, temperature: Optional[float]
    ) -> str:
        """Generate Russian-language insight from real statistics"""
        season = self._get_season_name(month)
        temp_str = f"{temperature:.0f}°C" if temperature is not None else f"~{stats['temp_mean']}°C"
        
        # AQI category
        if aqi <= 50:
            aqi_cat = "хорошее"
        elif aqi <= 100:
            aqi_cat = "умеренное"
        elif aqi <= 150:
            aqi_cat = "вредное для чувствительных групп"
        elif aqi <= 200:
            aqi_cat = "вредное"
        else:
            aqi_cat = "опасное"

        lines = [
            f"Статус: {temp_str}, {season}. Качество воздуха: {aqi_cat} (AQI {aqi}).",
            f"Трафик: {traffic:.0f}% загруженность (среднее за {stats.get('records', '?')} дней данных).",
        ]

        if aqi > 150:
            lines.append("Совет: Рекомендуется ограничить пребывание на улице.")
        elif traffic > 70:
            lines.append("Совет: Ожидаются пробки, рассмотрите альтернативные маршруты.")
        else:
            lines.append("Совет: Условия благоприятные для поездок.")

        return " ".join(lines)

    async def _get_groq_prediction(
        self,
        month: int,
        temperature: Optional[float],
        aqi: int,
        traffic: float,
        query: str,
        stats: Dict,
    ) -> str:
        """Get AI-enhanced prediction from Groq (runs in thread to avoid blocking)"""
        try:
            season = self._get_season_name(month)
            temp_str = f"{temperature}°C" if temperature else "неизвестно"
            
            # Build context from real data
            data_context = ""
            if stats:
                data_context = f"""
Статистика из {stats.get('records', '?')} дней реальных данных:
- Средняя температура за месяц: {stats.get('temp_mean', '?')}°C (±{stats.get('temp_std', '?')})
- Средний AQI: {stats.get('aqi_mean', '?')} (25-й перцентиль: {stats.get('aqi_p25', '?')}, 75-й: {stats.get('aqi_p75', '?')})
- Средний трафик: {stats.get('traffic_mean', '?')}%
- PM2.5: {stats.get('pm25_mean', '?')} мкг/м³
- Влажность: {stats.get('humidity_mean', '?')}%"""

            system_prompt = """Ты - AI-диспетчер города Алматы. Даёшь чёткие советы на русском языке.
Используй предоставленную статистику из реальных данных.
Обязательный формат:
1. Статус: [Температура], [Погода], [Уровень пробок]
2. Прогноз: Когда пробки спадут/вырастут?
3. Совет: Ехать или нет?
Не более 4 предложений. Будь полезным и учитывай местные особенности Алматы."""

            user_prompt = f"""Текущие условия в Алматы:
- Сезон: {season}, Месяц: {month}
- Температура: {temp_str}
- Прогноз AQI: {aqi}
- Индекс трафика: {traffic}%
{data_context}

Корреляция температура↔AQI: {self.correlations.get('temperature_vs_aqi', 'N/A')}

Вопрос пользователя: {query}

Отвечай строго по формату на русском языке."""

            # Run synchronous Groq call in thread to avoid blocking the event loop
            response = await asyncio.to_thread(
                self.groq_client.chat.completions.create,
                model="llama-3.1-8b-instant",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=250,
                temperature=0.7,
            )
            
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"Groq API error: {e}")
            return self._get_fallback_prediction(month, temperature)
    
    def _get_fallback_prediction(self, month: int, temperature: Optional[float]) -> str:
        """Fallback prediction using real data statistics"""
        stats = self.monthly_stats.get(month, {})
        if not stats:
            return "Нет достаточных данных для прогноза. Обратитесь позже."
        
        temp_str = f"{temperature:.0f}°C" if temperature is not None else f"~{stats['temp_mean']}°C"
        aqi = int(stats["aqi_mean"])
        traffic = stats["traffic_mean"]
        
        return (
            f"Статус: {temp_str}, AQI ~{aqi}, трафик ~{traffic:.0f}%. "
            f"На основе {stats['records']} дней реальных данных."
        )
    
    def _get_season_name(self, month: int) -> str:
        """Get season name from month"""
        if month in [12, 1, 2]:
            return "Зима"
        elif month in [3, 4, 5]:
            return "Весна"
        elif month in [6, 7, 8]:
            return "Лето"
        else:
            return "Осень"
    
    def _get_reasoning(self, month: int, temperature: Optional[float]) -> str:
        """Get explanation for the prediction backed by real data"""
        reasons = []
        stats = self.monthly_stats.get(month, {})
        
        if stats:
            reasons.append(f"Основано на {stats.get('records', '?')} днях реальных данных для месяца {month}")
        
        temp_aqi_corr = self.correlations.get("temperature_vs_aqi")
        if temp_aqi_corr is not None:
            reasons.append(f"Корреляция температуры и AQI: {temp_aqi_corr:.3f}")
        
        if month in [12, 1, 2]:
            reasons.append("Зимний сезон: угольное отопление повышает PM2.5")
            if stats:
                reasons.append(f"Средний зимний AQI: {stats.get('aqi_mean', '?')}")
        elif month in [6, 7, 8]:
            reasons.append("Летом выбросы от отопления минимальны")
            if stats:
                reasons.append(f"Средний летний AQI: {stats.get('aqi_mean', '?')}")
        else:
            reasons.append("Переходный сезон с переменчивыми условиями")
        
        if temperature is not None and stats:
            diff = temperature - stats.get("temp_mean", 0)
            if abs(diff) > 5:
                direction = "выше" if diff > 0 else "ниже"
                reasons.append(f"Температура {abs(diff):.0f}°C {direction} нормы для этого месяца")
        
        return ". ".join(reasons) + "."
    
    def get_data_stats(self) -> Dict[str, Any]:
        """Get comprehensive statistics from historical data"""
        if self.df is None:
            return {"error": "No data available"}

        seasonal_stats = {}
        for name, months in [("winter", [12, 1, 2]), ("spring", [3, 4, 5]),
                              ("summer", [6, 7, 8]), ("autumn", [9, 10, 11])]:
            s = self.df[self.df["month"].isin(months)]
            if not s.empty:
                entry: Dict[str, Any] = {
                    "temp_avg": round(float(s["temperature"].mean()), 1),
                    "aqi_avg": round(float(s["aqi"].mean()), 0),
                    "traffic_avg": round(float(s["traffic_index"].mean()), 1),
                    "records": len(s),
                }
                if "pm25" in s.columns:
                    entry["pm25_avg"] = round(float(s["pm25"].mean()), 1)
                seasonal_stats[name] = entry

        return {
            "total_records": len(self.df),
            "date_range": {
                "start": str(self.df["date"].min().date()),
                "end": str(self.df["date"].max().date()),
            },
            "avg_temperature": round(float(self.df["temperature"].mean()), 1),
            "avg_aqi": round(float(self.df["aqi"].mean()), 0),
            "avg_traffic": round(float(self.df["traffic_index"].mean()), 1),
            "correlations": self.correlations,
            "seasonal": seasonal_stats,
            "monthly": {str(k): v for k, v in self.monthly_stats.items()},
        }
