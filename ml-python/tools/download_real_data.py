"""
Download REAL historical data for Almaty from Open-Meteo Archive API.
Combines weather + air quality into a single CSV for ML training.

Data sources (all free, no API key):
- Open-Meteo Archive: temperature, humidity, wind, precipitation, weather code
- Open-Meteo Air Quality Archive: PM2.5, PM10, NO2, SO2, O3

Output: ml-python/data/almaty_history.csv (~2200 rows, one per day, 2020-2026)
"""

import requests
import pandas as pd
import numpy as np
from datetime import datetime
from pathlib import Path
import sys
import time

ALMATY_LAT = 43.2389
ALMATY_LON = 76.8897

OUTPUT_PATH = Path(__file__).parent.parent / "data" / "almaty_history.csv"


def fetch_weather_archive(start: str, end: str) -> pd.DataFrame:
    """Fetch daily weather from Open-Meteo Archive API."""
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": ALMATY_LAT,
        "longitude": ALMATY_LON,
        "start_date": start,
        "end_date": end,
        "daily": ",".join([
            "temperature_2m_mean",
            "temperature_2m_min",
            "temperature_2m_max",
            "relative_humidity_2m_mean",
            "wind_speed_10m_max",
            "precipitation_sum",
            "weather_code",
        ]),
        "timezone": "Asia/Almaty",
    }

    print(f"  Fetching weather {start} → {end} ...")
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()["daily"]

    df = pd.DataFrame({
        "date": pd.to_datetime(data["time"]),
        "temperature": data["temperature_2m_mean"],
        "temp_min": data["temperature_2m_min"],
        "temp_max": data["temperature_2m_max"],
        "humidity": data["relative_humidity_2m_mean"],
        "wind_speed": data["wind_speed_10m_max"],
        "precipitation": data["precipitation_sum"],
        "weather_code": data["weather_code"],
    })
    return df


def fetch_air_quality_archive(start: str, end: str) -> pd.DataFrame:
    """Fetch daily air quality from Open-Meteo Air Quality Archive API."""
    url = "https://air-quality-api.open-meteo.com/v1/air-quality"
    params = {
        "latitude": ALMATY_LAT,
        "longitude": ALMATY_LON,
        "start_date": start,
        "end_date": end,
        "hourly": "pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone",
        "timezone": "Asia/Almaty",
    }

    print(f"  Fetching air quality {start} → {end} ...")
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()["hourly"]

    df = pd.DataFrame({
        "datetime": pd.to_datetime(data["time"]),
        "pm25": data["pm2_5"],
        "pm10": data["pm10"],
        "no2": data["nitrogen_dioxide"],
        "so2": data["sulphur_dioxide"],
        "ozone": data["ozone"],
    })

    # Aggregate hourly → daily mean
    df["date"] = df["datetime"].dt.date
    daily = df.groupby("date").agg({
        "pm25": "mean",
        "pm10": "mean",
        "no2": "mean",
        "so2": "mean",
        "ozone": "mean",
    }).reset_index()
    daily["date"] = pd.to_datetime(daily["date"])
    return daily


def pm25_to_aqi(pm25: float) -> int:
    """Convert PM2.5 (μg/m³) to US EPA AQI."""
    if pd.isna(pm25):
        return 0
    breakpoints = [
        (0.0, 12.0, 0, 50),
        (12.1, 35.4, 51, 100),
        (35.5, 55.4, 101, 150),
        (55.5, 150.4, 151, 200),
        (150.5, 250.4, 201, 300),
        (250.5, 350.4, 301, 400),
        (350.5, 500.4, 401, 500),
    ]
    for c_low, c_high, i_low, i_high in breakpoints:
        if pm25 >= c_low and pm25 <= c_high:
            aqi = (i_high - i_low) / (c_high - c_low) * (pm25 - c_low) + i_low
            return int(round(aqi))
    if pm25 > 500.4:
        return 500
    return 0


def wmo_to_condition(code: int) -> str:
    """Convert WMO weather code to human-readable condition."""
    if code == 0:
        return "clear"
    elif code in [1, 2, 3]:
        return "partly_cloudy"
    elif code in [45, 48]:
        return "fog"
    elif code in [51, 53, 55, 56, 57]:
        return "drizzle"
    elif code in [61, 63, 65, 66, 67]:
        return "rain"
    elif code in [71, 73, 75, 77]:
        return "snow"
    elif code in [80, 81, 82]:
        return "rain_showers"
    elif code in [85, 86]:
        return "snow_showers"
    elif code in [95, 96, 99]:
        return "thunderstorm"
    else:
        return "cloudy"


def generate_traffic_from_patterns(df: pd.DataFrame) -> pd.Series:
    """
    Estimate daily traffic index from weather + calendar patterns.

    We don't have historical TomTom data, so we model traffic using
    known Almaty patterns:
    - Weekday > Weekend
    - Rush hours contribute more
    - Extreme cold/rain reduces traffic slightly
    - Summer = lower traffic (vacations)
    """
    traffic = pd.Series(index=df.index, dtype=float)

    for i, row in df.iterrows():
        day_of_week = row["date"].weekday()
        month = row["date"].month
        is_weekend = day_of_week >= 5
        temp = row["temperature"]

        # Base: weekday vs weekend
        if is_weekend:
            base = 35.0
        else:
            base = 65.0

        # Seasonal adjustment
        if month in [6, 7, 8]:  # Summer vacation
            base *= 0.8
        elif month in [12, 1, 2]:  # Winter
            if temp is not None and not pd.isna(temp) and temp < -15:
                base *= 0.85  # Very cold → fewer drivers

        # Weather adjustment
        precip = row.get("precipitation", 0) or 0
        if precip > 10:  # Heavy rain/snow → more congestion
            base *= 1.15
        elif precip > 2:
            base *= 1.05

        # Add realistic noise
        noise = np.random.normal(0, 8)
        traffic[i] = max(10, min(100, base + noise))

    return traffic.round(1)


def main():
    print("=" * 60)
    print("Downloading REAL Almaty historical data from Open-Meteo")
    print("=" * 60)

    # Date range: 2020-01-01 to yesterday
    # Open-Meteo archive has ~5 day delay, use 7 days ago to be safe
    start_date = "2020-01-01"
    end_date = (datetime.now() - pd.Timedelta(days=7)).strftime("%Y-%m-%d")

    print(f"\nDate range: {start_date} → {end_date}")

    # Fetch weather in yearly chunks (API limit)
    weather_frames = []
    years = range(2020, datetime.now().year + 1)
    for year in years:
        y_start = f"{year}-01-01"
        y_end = min(f"{year}-12-31", end_date)
        if y_start > end_date:
            break
        try:
            wf = fetch_weather_archive(y_start, y_end)
            weather_frames.append(wf)
            time.sleep(0.5)  # Be nice to API
        except Exception as e:
            print(f"  ⚠ Weather fetch failed for {year}: {e}")

    if not weather_frames:
        print("ERROR: No weather data fetched!")
        sys.exit(1)

    weather_df = pd.concat(weather_frames, ignore_index=True)
    print(f"\n✓ Weather: {len(weather_df)} days")

    # Fetch air quality in yearly chunks
    aq_frames = []
    for year in years:
        y_start = f"{year}-01-01"
        y_end = min(f"{year}-12-31", end_date)
        if y_start > end_date:
            break
        try:
            af = fetch_air_quality_archive(y_start, y_end)
            aq_frames.append(af)
            time.sleep(0.5)
        except Exception as e:
            print(f"  ⚠ Air quality fetch failed for {year}: {e}")

    if aq_frames:
        aq_df = pd.concat(aq_frames, ignore_index=True)
        print(f"✓ Air Quality: {len(aq_df)} days")
    else:
        print("⚠ No air quality data, will estimate AQI")
        aq_df = pd.DataFrame()

    # Merge weather + air quality
    if len(aq_df) > 0:
        merged = weather_df.merge(aq_df, on="date", how="left")
    else:
        merged = weather_df.copy()
        merged["pm25"] = None
        merged["pm10"] = None

    # Calculate EPA AQI from PM2.5
    if "pm25" in merged.columns:
        merged["aqi"] = merged["pm25"].apply(pm25_to_aqi)
    else:
        merged["aqi"] = 50  # fallback

    # Add calendar features
    merged["day_of_week"] = merged["date"].dt.weekday
    merged["month"] = merged["date"].dt.month
    merged["is_weekend"] = merged["day_of_week"] >= 5
    merged["condition"] = merged["weather_code"].apply(
        lambda x: wmo_to_condition(int(x)) if pd.notna(x) else "cloudy"
    )

    # Generate traffic estimation
    merged["traffic_index"] = generate_traffic_from_patterns(merged)

    # Round numeric columns
    for col in ["temperature", "temp_min", "temp_max", "humidity", "wind_speed",
                "precipitation", "pm25", "pm10", "no2", "so2", "ozone"]:
        if col in merged.columns:
            merged[col] = merged[col].round(1)

    # Select final columns
    final_cols = [
        "date", "temperature", "temp_min", "temp_max", "humidity",
        "wind_speed", "precipitation", "weather_code", "condition",
        "pm25", "pm10", "aqi", "traffic_index",
        "is_weekend", "month", "day_of_week",
    ]
    # Add optional AQ columns
    for col in ["no2", "so2", "ozone"]:
        if col in merged.columns:
            final_cols.append(col)

    result = merged[[c for c in final_cols if c in merged.columns]]

    # Save
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(OUTPUT_PATH, index=False)
    print(f"\n✓ Saved {len(result)} records to {OUTPUT_PATH}")

    # Statistics
    print("\n" + "=" * 60)
    print("DATASET STATISTICS")
    print("=" * 60)
    print(f"Date range: {result['date'].min()} → {result['date'].max()}")
    print(f"Total records: {len(result)}")
    print(f"\nTemperature (°C):")
    winter = result[result["month"].isin([12, 1, 2])]
    summer = result[result["month"].isin([6, 7, 8])]
    print(f"  Winter avg: {winter['temperature'].mean():.1f}")
    print(f"  Summer avg: {summer['temperature'].mean():.1f}")
    print(f"  Overall: {result['temperature'].mean():.1f}")
    if "pm25" in result.columns:
        print(f"\nPM2.5 (μg/m³):")
        print(f"  Winter avg: {winter['pm25'].mean():.1f}")
        print(f"  Summer avg: {summer['pm25'].mean():.1f}")
    print(f"\nAQI (US EPA):")
    print(f"  Winter avg: {winter['aqi'].mean():.0f}")
    print(f"  Summer avg: {summer['aqi'].mean():.0f}")
    print(f"\nTraffic Index:")
    wd = result[~result["is_weekend"]]
    we = result[result["is_weekend"]]
    print(f"  Weekday avg: {wd['traffic_index'].mean():.1f}")
    print(f"  Weekend avg: {we['traffic_index'].mean():.1f}")


if __name__ == "__main__":
    main()
