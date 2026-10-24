

import asyncio
import logging
import time
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

ALMATY_LAT = 43.2389
ALMATY_LON = 76.8897

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AQI_FORECAST_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"


class ForecastService:

    CACHE_TTL = 3600  # 1 hour
    FORECAST_DAYS = 7

    def __init__(self):
        self._cache: Optional[Dict[str, Any]] = None
        self._cache_time: float = 0
        self._client: Optional[httpx.AsyncClient] = None
        self._lock = asyncio.Lock()

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=10.0)
        return self._client

    async def close(self):
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()

    async def get_forecast(self) -> Optional[Dict[str, Any]]:
        if self._cache and (time.time() - self._cache_time) < self.CACHE_TTL:
            return self._cache

        async with self._lock:
            if self._cache and (time.time() - self._cache_time) < self.CACHE_TTL:
                return self._cache

            try:
                weather, aqi = await asyncio.gather(
                    self._fetch_weather_forecast(),
                    self._fetch_aqi_forecast(),
                )
            except Exception as exc:
                logger.error("Forecast fetch error: %s", exc)
                return self._cache

            if weather is None:
                return self._cache

            result = self._merge_forecasts(weather, aqi)
            self._cache = result
            self._cache_time = time.time()
            logger.info(
                "Fetched %s-day forecast: %s daily points",
                self.FORECAST_DAYS,
                len(result.get("daily", [])),
            )
            return result

    async def _fetch_weather_forecast(self) -> Optional[Dict[str, Any]]:
        """Fetch daily and hourly weather forecast from Open-Meteo."""
        try:
            client = await self._get_client()
            params = {
                "latitude": ALMATY_LAT,
                "longitude": ALMATY_LON,
                "daily": ",".join(
                    [
                        "temperature_2m_max",
                        "temperature_2m_min",
                        "temperature_2m_mean",
                        "precipitation_sum",
                        "wind_speed_10m_max",
                        "weather_code",
                        "relative_humidity_2m_mean",
                    ]
                ),
                "hourly": ",".join(
                    [
                        "temperature_2m",
                        "relative_humidity_2m",
                        "precipitation",
                        "wind_speed_10m",
                        "weather_code",
                    ]
                ),
                "timezone": "Asia/Almaty",
                "forecast_days": self.FORECAST_DAYS,
            }
            response = await client.get(FORECAST_URL, params=params)
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            logger.error("Weather forecast API error: %s", exc)
            return None

    async def _fetch_aqi_forecast(self) -> Optional[Dict[str, Any]]:
        """Fetch AQI forecast from Open-Meteo Air Quality API."""
        try:
            client = await self._get_client()
            params = {
                "latitude": ALMATY_LAT,
                "longitude": ALMATY_LON,
                "hourly": "pm2_5,pm10,us_aqi",
                "timezone": "Asia/Almaty",
                "forecast_days": self.FORECAST_DAYS,
            }
            response = await client.get(AQI_FORECAST_URL, params=params)
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            logger.error("AQI forecast API error: %s", exc)
            return None

    @staticmethod
    def _series_value(series: Dict[str, Any], index: int, default: Any, *keys: str) -> Any:
        for key in keys:
            values = series.get(key)
            if values and index < len(values):
                return values[index]
        return default

    def _merge_forecasts(self, weather: Dict[str, Any], aqi: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Merge weather and AQI responses into daily and hourly structures."""
        daily_data = weather.get("daily", {})
        hourly_data = weather.get("hourly", {})

        daily = []
        dates = daily_data.get("time", [])
        aqi_hourly = (aqi or {}).get("hourly", {})
        aqi_times = aqi_hourly.get("time", [])
        aqi_values = aqi_hourly.get("us_aqi", [])
        pm25_values = aqi_hourly.get("pm2_5", [])

        for index, date in enumerate(dates):
            day_aqi = [
                value
                for timestamp, value in zip(aqi_times, aqi_values)
                if timestamp.startswith(date) and value is not None
            ]
            day_pm25 = [
                value
                for timestamp, value in zip(aqi_times, pm25_values)
                if timestamp.startswith(date) and value is not None
            ]

            daily.append(
                {
                    "date": date,
                    "temp_max": self._series_value(
                        daily_data,
                        index,
                        None,
                        "temperature_2m_max",
                    ),
                    "temp_min": self._series_value(
                        daily_data,
                        index,
                        None,
                        "temperature_2m_min",
                    ),
                    "temp_mean": self._series_value(
                        daily_data,
                        index,
                        None,
                        "temperature_2m_mean",
                    ),
                    "precipitation": self._series_value(
                        daily_data,
                        index,
                        0,
                        "precipitation_sum",
                    ),
                    "wind_max": self._series_value(
                        daily_data,
                        index,
                        None,
                        "wind_speed_10m_max",
                        "windspeed_10m_max",
                    ),
                    "weather_code": self._series_value(
                        daily_data,
                        index,
                        None,
                        "weather_code",
                        "weathercode",
                    ),
                    "humidity": self._series_value(
                        daily_data,
                        index,
                        None,
                        "relative_humidity_2m_mean",
                    ),
                    "aqi_mean": round(sum(day_aqi) / len(day_aqi)) if day_aqi else None,
                    "aqi_max": max(day_aqi) if day_aqi else None,
                    "pm25_mean": round(sum(day_pm25) / len(day_pm25), 1) if day_pm25 else None,
                }
            )

        hourly = []
        hourly_times = hourly_data.get("time", [])
        for index in range(min(self.FORECAST_DAYS * 24, len(hourly_times))):
            hourly.append(
                {
                    "time": hourly_times[index],
                    "temp": self._series_value(hourly_data, index, None, "temperature_2m"),
                    "humidity": self._series_value(
                        hourly_data,
                        index,
                        None,
                        "relative_humidity_2m",
                        "relativehumidity_2m",
                    ),
                    "wind": self._series_value(
                        hourly_data,
                        index,
                        None,
                        "wind_speed_10m",
                        "windspeed_10m",
                    ),
                    "precip": self._series_value(hourly_data, index, None, "precipitation"),
                    "weather_code": self._series_value(
                        hourly_data,
                        index,
                        None,
                        "weather_code",
                        "weathercode",
                    ),
                    "aqi": self._series_value(aqi_hourly, index, None, "us_aqi"),
                }
            )

        return {
            "daily": daily,
            "hourly": hourly,
            "fetched_at": time.time(),
        }

    @staticmethod
    def find_day_forecast(forecast: Optional[Dict[str, Any]], target_date: Optional[str]) -> Optional[Dict[str, Any]]:
        """Return a single day forecast entry matching YYYY-MM-DD, if present."""
        if not forecast or not target_date:
            return None
        for day in forecast.get("daily", []):
            if day.get("date") == target_date:
                return day
        return None

    def format_for_prompt(self, forecast: Optional[Dict[str, Any]], target_date: Optional[str] = None) -> str:
        """Format forecast data as compact text for the LLM prompt."""
        if not forecast or not forecast.get("daily"):
            return "Forecast data unavailable."

        lines = ["Open-Meteo forecast:"]
        for day in forecast["daily"]:
            marker = " <- target date" if target_date and day.get("date") == target_date else ""
            parts = [
                str(day.get("date")),
                f"temp {day.get('temp_min')}..{day.get('temp_max')} C",
                f"mean {day.get('temp_mean')} C",
                self._weather_code_to_text(day.get("weather_code")),
            ]
            precipitation = day.get("precipitation")
            if precipitation is not None:
                parts.append(f"precip {precipitation} mm")
            wind_max = day.get("wind_max")
            if wind_max is not None:
                parts.append(f"wind up to {wind_max} km/h")
            aqi_mean = day.get("aqi_mean")
            if aqi_mean is not None:
                parts.append(f"AQI ~{aqi_mean}")
            lines.append(", ".join(parts) + marker)
        return "\n".join(lines)

    @staticmethod
    def _weather_code_to_text(code: Optional[int]) -> str:
        if code is None:
            return "unknown conditions"
        mapping = {
            0: "clear sky",
            1: "mainly clear",
            2: "partly cloudy",
            3: "overcast",
            45: "fog",
            48: "rime fog",
            51: "light drizzle",
            53: "drizzle",
            55: "dense drizzle",
            61: "rain",
            63: "moderate rain",
            65: "heavy rain",
            71: "snow",
            73: "moderate snow",
            75: "heavy snow",
            77: "snow grains",
            80: "rain showers",
            81: "heavy showers",
            85: "snow showers",
            86: "heavy snow showers",
            95: "thunderstorm",
            96: "thunderstorm with hail",
            99: "severe thunderstorm with hail",
        }
        return mapping.get(code, f"weather code {code}")
