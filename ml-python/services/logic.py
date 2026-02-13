"""
Prediction Logic Service
Implements Almaty-specific correlation logic and Groq AI integration.
"""

import os
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from pathlib import Path

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
    """Service for generating urban condition predictions"""
    
    def __init__(self):
        self.data_path = Path(__file__).parent.parent / "data" / "almaty_history.csv"
        self.df = self._load_data()
        self.groq_client = self._init_groq()
        
    def _load_data(self) -> Optional[pd.DataFrame]:
        """Load historical CSV data"""
        try:
            if self.data_path.exists():
                df = pd.read_csv(self.data_path, parse_dates=["date"])
                logger.info(f"Loaded {len(df)} historical records")
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
    
    async def predict(
        self,
        date: Optional[str] = None,
        temperature: Optional[float] = None,
        query: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate prediction based on Almaty correlations.
        
        Almaty-specific rules:
        - Winter (Dec-Feb): Low Temp = High Smog (AQI > 150)
        - Summer: High Temp = Lower Traffic
        - Inversion layers cause AQI spikes
        """
        # Parse date or use current
        if date:
            try:
                target_date = datetime.strptime(date, "%Y-%m-%d")
            except ValueError:
                target_date = datetime.now()
        else:
            target_date = datetime.now()
        
        month = target_date.month
        
        # Apply Almaty correlation logic
        aqi_prediction, traffic_prediction, base_insight = self._apply_correlations(
            month=month,
            temperature=temperature
        )
        
        # Get AI-enhanced prediction
        if self.groq_client and query:
            prediction_text = await self._get_groq_prediction(
                month=month,
                temperature=temperature,
                aqi=aqi_prediction,
                traffic=traffic_prediction,
                query=query
            )
            is_mock = False
        else:
            prediction_text = base_insight
            is_mock = True
        
        return {
            "prediction": prediction_text,
            "confidence_score": 0.85 if not is_mock else 0.70,
            "aqi_prediction": aqi_prediction,
            "traffic_index_prediction": traffic_prediction,
            "reasoning": self._get_reasoning(month, temperature),
            "is_mock": is_mock
        }
    
    def _apply_correlations(
        self,
        month: int,
        temperature: Optional[float]
    ) -> tuple[int, float, str]:
        """
        Apply Almaty-specific seasonal correlations.
        
        Winter correlation: Coal heating + inversions = severe smog
        Summer correlation: Vacation season = reduced traffic
        """
        is_winter = month in [12, 1, 2]
        is_summer = month in [6, 7, 8]
        
        if is_winter:
            # Winter: High AQI due to heating
            if temperature is not None and temperature < -10:
                aqi = 180  # Unhealthy
                traffic = 60.0  # Moderate (people avoid going out)
                insight = "Суровая зима. Угольное отопление вызывает сильный смог. AQI нездоровый. Рекомендуется оставаться дома."
            elif temperature is not None and temperature < 0:
                aqi = 150  # Unhealthy for sensitive groups
                traffic = 65.0
                insight = "Холодный день. Ожидается повышенный уровень смога. Используйте общественный транспорт для снижения выбросов."
            else:
                aqi = 120
                traffic = 70.0
                insight = "Мягкая зима. Умеренное качество воздуха. Ожидается обычный трафик."
        elif is_summer:
            # Summer: Good air, vacation traffic reduction
            if temperature is not None and temperature > 30:
                aqi = 40  # Good
                traffic = 45.0  # Low (vacation)
                insight = "Жаркий летний день. Отличное качество воздуха. Низкий трафик из-за сезона отпусков."
            else:
                aqi = 55
                traffic = 55.0
                insight = "Приятные летние условия. Хороший воздух и умеренный трафик."
        else:
            # Spring/Autumn: Transition periods
            aqi = 85
            traffic = 65.0
            insight = "Переходный сезон. Умеренные условия качества воздуха и дорожного движения."
        
        return aqi, traffic, insight
    
    async def _get_groq_prediction(
        self,
        month: int,
        temperature: Optional[float],
        aqi: int,
        traffic: float,
        query: str
    ) -> str:
        """Get AI-enhanced prediction from Groq"""
        try:
            season = self._get_season_name(month)
            temp_str = f"{temperature}°C" if temperature else "неизвестно"
            
            system_prompt = """Ты - AI-диспетчер города Алматы.
            Давай четкие советы на русском языке.
            Обязательный формат:
            1. Статус: [Температура], [Погода], [Уровень пробок]
            2. Прогноз: Когда пробки спадут/вырастут? (например, "Пик через 30 мин" или "Свободно к 20:00")
            3. Совет: Ехать или нет? (например, "Лучше переждать, сильный смог" или "Отличное время для поездки")
            Не более 4 предложений. Будь полезным и учитывай местные особенности."""

            user_prompt = f"""Текущие условия в Алматы:
            - Сезон: {season}
            - Температура: {temp_str}
            - Прогноз AQI: {aqi}
            - Индекс трафика: {traffic}%
            
            Вопрос пользователя: {query}
            
            Отвечай строго по формату на русском языке."""

            response = self.groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=200,
                temperature=0.7
            )
            
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"Groq API error: {e}")
            return self._get_fallback_prediction(month, temperature)
    
    def _get_fallback_prediction(self, month: int, temperature: Optional[float]) -> str:
        """Fallback prediction when Groq is unavailable"""
        season = self._get_season_name(month)
        temp_str = f"{temperature}°C" if temperature else "N/A"
        
        if month in [12, 1, 2]:
            return f"Статус: {temp_str}, Высокий смог. Прогноз: Пик пробок в 18:00. Совет: Избегайте прогулок из-за выбросов отопления."
        elif month in [6, 7, 8]:
            return f"Статус: {temp_str}, Ясно. Прогноз: Низкий трафик весь день. Совет: Отличное время для поездок."
        else:
            return f"Статус: {temp_str}, Умеренно. Прогноз: Дороги освободятся к 19:30. Совет: Стандартный режим поездок."
    
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
        """Get explanation for the prediction"""
        reasons = []
        
        if month in [12, 1, 2]:
            reasons.append("Зимний сезон увеличивает использование угольного отопления")
            if temperature is not None and temperature < -10:
                reasons.append("Низкие температуры вызывают инверсию, удерживающую смог")
            reasons.append("Данные показывают рост AQI в декабре-феврале")
        elif month in [6, 7, 8]:
            reasons.append("Летом снижаются выбросы от отопления")
            reasons.append("Сезон отпусков уменьшает трафик")
        else:
            reasons.append("Переходный сезон с переменчивыми условиями")
        
        return ". ".join(reasons) + "."
    
    def get_data_stats(self) -> Dict[str, Any]:
        """Get statistics from historical data"""
        if self.df is None:
            return {"error": "No data available"}
        
        return {
            "total_records": len(self.df),
            "date_range": {
                "start": str(self.df["date"].min()),
                "end": str(self.df["date"].max())
            },
            "avg_temperature": round(self.df["temperature"].mean(), 1) if "temperature" in self.df.columns else None,
            "avg_aqi": round(self.df["aqi"].mean(), 1) if "aqi" in self.df.columns else None,
            "avg_traffic": round(self.df["traffic_index"].mean(), 1) if "traffic_index" in self.df.columns else None
        }
