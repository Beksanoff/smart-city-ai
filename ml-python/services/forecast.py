"""
Open-Meteo Forecast Service
Fetches 3-day weather forecast for Almaty — free API, no key needed.
Cached for 1 hour to avoid excessive requests.
"""

import asyncio
import logging
import time
from typing import Optional, Dict, Any, List

import httpx

logger = logging.getLogger(__name__)

# Almaty coordinates
ALMATY_LAT = 43.2389
ALMATY_LON = 76.8897

# Open-Meteo API endpoints
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AQI_FORECAST_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"


class ForecastService:
    """
    Fetches 3-day weather and AQI forecast from Open-Meteo.
    Results are cached in-memory for 1 hour.
    """

    CACHE_TTL = 3600  # 1 hour

    def __init__(self):
        self._cache: Optional[Dict[str, Any]] = None
        self._cache_time: float = 0
        self._client: Optional[httpx.AsyncClient] = None
        self._lock = asyncio.Lock()

    async def _get_client(self) -> httpx.AsyncClient:
        """Lazy-initialize async HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=10.0)
        return self._client

    async def close(self):
        """Close the underlying httpx client to release connections."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()

    async def get_forecast(self) -> Optional[Dict[str, Any]]:
        """
        Get 3-day forecast for Almaty.
        Returns structured forecast data or None on error.
        """
        # Check cache (lock-free read for performance)
        if self._cache and (time.time() - self._cache_time) < self.CACHE_TTL:
            return self._cache

        async with self._lock:
            # Double-check after acquiring lock (another coroutine may have refreshed)
            if self._cache and (time.time() - self._cache_time) < self.CACHE_TTL:
                return self._cache

            try:
                forecast = await self._fetch_weather_forecast()
                aqi_forecast = await self._fetch_aqi_forecast()

                if forecast is None:
                    return self._cache  # return stale cache if available

                result = self._merge_forecasts(forecast, aqi_forecast)
                self._cache = result
                self._cache_time = time.time()

                logger.info(f"Fetched 3-day forecast: {len(result.get('daily', []))} days")
                return result

            except Exception as e:
                logger.error(f"Forecast fetch error: {e}")
                return self._cache

    async def _fetch_weather_forecast(self) -> Optional[Dict]:
        """Fetch weather forecast from Open-Meteo."""
        try:
            client = await self._get_client()
            params = {
                "latitude": ALMATY_LAT,
                "longitude": ALMATY_LON,
                "daily": ",".join([
                    "temperature_2m_max", "temperature_2m_min", "temperature_2m_mean",
                    "precipitation_sum", "windspeed_10m_max", "weathercode",
                    "relative_humidity_2m_mean",
                ]),
                "hourly": ",".join([
                    "temperature_2m", "relativehumidity_2m", "precipitation",
                    "windspeed_10m", "weathercode",
                ]),
                "timezone": "Asia/Almaty",
                "forecast_days": 3,
            }
            response = await client.get(FORECAST_URL, params=params)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Weather forecast API error: {e}")
            return None

    async def _fetch_aqi_forecast(self) -> Optional[Dict]:
        """Fetch AQI forecast from Open-Meteo Air Quality API."""
        try:
            client = await self._get_client()
            params = {
                "latitude": ALMATY_LAT,
                "longitude": ALMATY_LON,
                "hourly": "pm2_5,pm10,us_aqi",
                "timezone": "Asia/Almaty",
                "forecast_days": 3,
            }
            response = await client.get(AQI_FORECAST_URL, params=params)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"AQI forecast API error: {e}")
    def _merge_forecasts(
        self, weather: Dict, aqi: Optional[Dict]
    ) -> Dict[str, Any]:
        """Merge weather and AQI forecasts into a unified structure."""
        daily_data = weather.get("daily", {})
        hourly_data = weather.get("hourly", {})

        # Build daily summaries
        daily = []
        dates = daily_data.get("time", [])
        for i, date in enumerate(dates):
            day = {
                "date": date,
                "temp_max": daily_data.get("temperature_2m_max", [None])[i],
                "temp_min": daily_data.get("temperature_2m_min", [None])[i],
                "temp_mean": daily_data.get("temperature_2m_mean", [None])[i],
                "precipitation": daily_data.get("precipitation_sum", [0])[i],
                "wind_max": daily_data.get("windspeed_10m_max", [None])[i],
                "weather_code": daily_data.get("weathercode", [None])[i],
                "humidity": daily_data.get("relative_humidity_2m_mean", [None])[i],
            }

            # Add daily AQI average
            if aqi:
                aqi_hourly = aqi.get("hourly", {})
                aqi_times = aqi_hourly.get("time", [])
                aqi_values = aqi_hourly.get("us_aqi", [])
                pm25_values = aqi_hourly.get("pm2_5", [])

                day_aqi = [v for t, v in zip(aqi_times, aqi_values)
                           if t.startswith(date) and v is not None]
                day_pm25 = [v for t, v in zip(aqi_times, pm25_values)
                            if t.startswith(date) and v is not None]

                day["aqi_mean"] = round(sum(day_aqi) / len(day_aqi)) if day_aqi else None
                day["aqi_max"] = max(day_aqi) if day_aqi else None
                day["pm25_mean"] = round(sum(day_pm25) / len(day_pm25), 1) if day_pm25 else None

            daily.append(day)

        # Build hourly data for next 24h (for time-of-day recommendations)
        hourly = []
        h_times = hourly_data.get("time", [])
        h_temps = hourly_data.get("temperature_2m", [])
        h_humidity = hourly_data.get("relativehumidity_2m", [])
        h_wind = hourly_data.get("windspeed_10m", [])
        h_precip = hourly_data.get("precipitation", [])

        for i in range(min(72, len(h_times))):  # up to 72 hours
            entry = {
                "time": h_times[i] if i < len(h_times) else None,
                "temp": h_temps[i] if i < len(h_temps) else None,
                "humidity": h_humidity[i] if i < len(h_humidity) else None,
                "wind": h_wind[i] if i < len(h_wind) else None,
                "precip": h_precip[i] if i < len(h_precip) else None,
            }

            # Hourly AQI
            if aqi:
                aqi_hourly = aqi.get("hourly", {})
                aqi_values = aqi_hourly.get("us_aqi", [])
                entry["aqi"] = aqi_values[i] if i < len(aqi_values) else None

            hourly.append(entry)

        return {
            "daily": daily,
            "hourly": hourly,
            "fetched_at": time.time(),
        }

    def format_for_prompt(self, forecast: Optional[Dict], target_date: Optional[str] = None) -> str:
        """
        Format forecast data as a concise string for the LLM prompt.
        If target_date is given, highlights that specific day.
        """
        if not forecast or not forecast.get("daily"):
            return "Прогноз погоды: недоступен"

        lines = ["Прогноз погоды Open-Meteo (реальные данные):"]

        for day in forecast["daily"]:
            date = day["date"]
            marker = " ← ЦЕЛЕВАЯ ДАТА" if target_date and date == target_date else ""
            temp_str = f"{day['temp_min']}..{day['temp_max']}°C (ср. {day['temp_mean']}°C)"
            precip = day.get("precipitation", 0) or 0
            aqi_str = f"AQI ~{day.get('aqi_mean', '?')}" if day.get('aqi_mean') else ""
            wind_str = f"ветер до {day.get('wind_max', '?')} км/ч"
            weather = self._weather_code_to_text(day.get("weather_code"))

            parts = [f"  {date}: {temp_str}, {weather}"]
            if precip > 0:
                parts.append(f"осадки {precip}мм")
            parts.append(wind_str)
            if aqi_str:
                parts.append(aqi_str)
            if marker:
                parts.append(marker)

            lines.append(", ".join(parts))

        return "\n".join(lines)

    @staticmethod
    def _weather_code_to_text(code: Optional[int]) -> str:
        """Convert WMO weather code to Russian text."""
        if code is None:
            return "нет данных"
        mapping = {
            0: "Ясно", 1: "Малооблачно", 2: "Облачно", 3: "Пасмурно",
            45: "Туман", 48: "Изморозь",
            51: "Морось", 53: "Морось", 55: "Сильная морось",
            61: "Дождь", 63: "Умеренный дождь", 65: "Сильный дождь",
            71: "Снег", 73: "Умеренный снег", 75: "Сильный снег",
            77: "Снежные зёрна", 80: "Ливень", 81: "Сильный ливень",
            85: "Снегопад", 86: "Сильный снегопад",
            95: "Гроза", 96: "Гроза с градом",
        }
        return mapping.get(code, f"код {code}")
