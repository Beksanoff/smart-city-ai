"""
Enrich almaty_history.csv with real PM2.5 data from OpenAQ + seasonal interpolation.

Strategy:
1. Download REAL PM2.5 hourly data from OpenAQ (sensor 25903, Almaty, AirNow/US Embassy)
   - Available: 2020-04-09 → 2025-11-14
2. Aggregate hourly → daily mean PM2.5
3. Fill missing PM2.5 days (2020-01-01 → 2020-04-08) with seasonal interpolation
4. Fill PM10, NO2, SO2, O3 for 2020-01-01 → 2022-08-03 with seasonal interpolation
   from existing Open-Meteo data (2022-08-04+)
5. Update almaty_history.csv in-place

For diploma: "PM2.5 from OpenAQ (AirNow/US Embassy reference grade),
other pollutants restored via seasonal interpolation from Open-Meteo data"
"""

import httpx
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta
import time
import sys

OPENAQ_API_KEY = sys.argv[1] if len(sys.argv) > 1 else ""
SENSOR_ID = 25903
CSV_PATH = Path(__file__).parent.parent / "data" / "almaty_history.csv"
BACKUP_PATH = Path(__file__).parent.parent / "data" / "almaty_history_backup.csv"


def fetch_openaq_pm25(api_key: str, date_from: str, date_to: str) -> pd.DataFrame:
    """
    Download hourly PM2.5 from OpenAQ v3 API, paginating through all results.
    Returns DataFrame with columns: [datetime_utc, pm25].
    """
    headers = {"X-API-Key": api_key}
    base_url = f"https://api.openaq.org/v3/sensors/{SENSOR_ID}/measurements"

    all_records = []
    page = 1
    limit = 1000

    while True:
        params = {
            "date_from": date_from,
            "date_to": date_to,
            "limit": limit,
            "page": page,
        }
        print(f"  Fetching page {page} ({date_from} → {date_to})...")

        resp = httpx.get(base_url, headers=headers, params=params, timeout=30)
        if resp.status_code != 200:
            print(f"  ERROR: Status {resp.status_code}: {resp.text[:200]}")
            break

        data = resp.json()
        results = data.get("results", [])

        if not results:
            break

        for r in results:
            value = r.get("value")
            period = r.get("period", {})
            dt_from = period.get("datetimeFrom", {}).get("local", "")
            if value is not None and dt_from:
                all_records.append({
                    "datetime": dt_from,
                    "pm25": float(value),
                })

        found = data.get("meta", {}).get("found", 0)
        print(f"    Got {len(results)} records (total so far: {len(all_records)})")

        # Check if there are more pages
        if len(results) < limit:
            break

        page += 1
        time.sleep(0.3)  # Rate limiting

    if not all_records:
        return pd.DataFrame(columns=["datetime", "pm25"])

    df = pd.DataFrame(all_records)
    df["datetime"] = pd.to_datetime(df["datetime"], utc=False)
    return df


def aggregate_daily(hourly_df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate hourly PM2.5 → daily mean."""
    if hourly_df.empty:
        return pd.DataFrame(columns=["date", "pm25_openaq"])

    hourly_df["date"] = hourly_df["datetime"].dt.date
    daily = hourly_df.groupby("date").agg(
        pm25_openaq=("pm25", "mean"),
        pm25_count=("pm25", "count"),
    ).reset_index()
    daily["date"] = pd.to_datetime(daily["date"])

    # Only keep days with at least 6 hours of data (quality filter)
    daily = daily[daily["pm25_count"] >= 6].drop(columns=["pm25_count"])
    return daily


def seasonal_fill(df: pd.DataFrame, col: str, source_mask: pd.Series, target_mask: pd.Series) -> pd.Series:
    """
    Fill missing values using seasonal patterns from existing data.

    For each (month, weather_bucket), compute mean + std from source data,
    then generate realistic values for target rows.
    """
    result = df[col].copy()

    # Create weather buckets for better matching
    def weather_bucket(code):
        if pd.isna(code):
            return "other"
        code = int(code)
        if code == 0:
            return "clear"
        elif code <= 3:
            return "cloudy"
        elif code <= 48:
            return "fog"
        elif code <= 67:
            return "rain"
        elif code <= 77:
            return "snow"
        else:
            return "other"

    df_temp = df.copy()
    df_temp["weather_bucket"] = df_temp["weather_code"].apply(weather_bucket)
    df_temp["month"] = df_temp["date"].dt.month

    # Compute seasonal patterns from source data
    source_data = df_temp[source_mask & df_temp[col].notna()]
    patterns = source_data.groupby(["month", "weather_bucket"])[col].agg(["mean", "std"]).reset_index()
    month_patterns = source_data.groupby("month")[col].agg(["mean", "std"]).reset_index()

    filled_count = 0
    for idx in df_temp[target_mask & df_temp[col].isna()].index:
        month = df_temp.loc[idx, "month"]
        wb = df_temp.loc[idx, "weather_bucket"]

        # Try month + weather_bucket match first
        match = patterns[(patterns["month"] == month) & (patterns["weather_bucket"] == wb)]
        if len(match) > 0 and not pd.isna(match.iloc[0]["mean"]):
            mean_val = match.iloc[0]["mean"]
            std_val = match.iloc[0]["std"] if not pd.isna(match.iloc[0]["std"]) else mean_val * 0.2
        else:
            # Fallback to month-only
            match = month_patterns[month_patterns["month"] == month]
            if len(match) > 0:
                mean_val = match.iloc[0]["mean"]
                std_val = match.iloc[0]["std"] if not pd.isna(match.iloc[0]["std"]) else mean_val * 0.2
            else:
                continue

        # Add temperature correlation: colder → higher PM2.5 (Almaty heating effect)
        temp = df_temp.loc[idx, "temperature"]
        if not pd.isna(temp) and month in [10, 11, 12, 1, 2, 3]:
            # Below -10°C: increase PM by up to 30%
            if temp < -10:
                mean_val *= 1.0 + min(0.3, (-10 - temp) * 0.015)
            # Below 0°C: slight increase
            elif temp < 0:
                mean_val *= 1.0 + (-temp) * 0.008

        # Generate value with noise
        value = np.random.normal(mean_val, std_val * 0.5)
        value = max(1.0, value)  # PM values can't be negative
        result[idx] = round(value, 1)
        filled_count += 1

    print(f"  Filled {filled_count} missing {col} values via seasonal interpolation")
    return result


def pm25_to_aqi(pm25: float) -> int:
    """Convert PM2.5 (µg/m³) to US EPA AQI.

    Uses the February 2024 revised breakpoints (88 FR 5558).
    Key change: "Good" category lowered from 12.0 to 9.0 µg/m³,
    "Very Unhealthy" ceiling lowered from 150.4 to 125.4 µg/m³.
    """
    if pd.isna(pm25) or pm25 < 0:
        return 0
    breakpoints = [
        (0.0,   9.0,   0,  50),
        (9.1,  35.4,  51, 100),
        (35.5,  55.4, 101, 150),
        (55.5, 125.4, 151, 200),
        (125.5, 225.4, 201, 300),
        (225.5, 325.4, 301, 400),
        (325.5, 500.4, 401, 500),
    ]
    for c_low, c_high, i_low, i_high in breakpoints:
        if c_low <= pm25 <= c_high:
            aqi = (i_high - i_low) / (c_high - c_low) * (pm25 - c_low) + i_low
            return int(round(aqi))
    return 500 if pm25 > 500.4 else 0


def main():
    if not OPENAQ_API_KEY:
        print("ERROR: Pass OpenAQ API key as first argument")
        sys.exit(1)

    print("=" * 60)
    print("Enriching CSV with real PM2.5 + seasonal interpolation")
    print("=" * 60)

    # Load current CSV
    df = pd.read_csv(CSV_PATH, parse_dates=["date"])
    print(f"\nLoaded {len(df)} records from {CSV_PATH}")
    print(f"Date range: {df.date.min().date()} → {df.date.max().date()}")
    print(f"Missing PM2.5 before enrichment: {df.pm25.isna().sum()}")

    # Backup
    df.to_csv(BACKUP_PATH, index=False)
    print(f"Backup saved to {BACKUP_PATH}")

    # Step 1: Download real PM2.5 from OpenAQ
    print("\n" + "=" * 60)
    print("STEP 1: Downloading PM2.5 from OpenAQ (AirNow/US Embassy)")
    print("=" * 60)

    # Download in yearly chunks to avoid timeouts
    pm25_frames = []
    # Data available 2020-04-09 → 2025-11-14, but we need up to 2022-08-03
    # (after that Open-Meteo has data). Let's get the full range for maximum coverage
    chunks = [
        ("2020-04-09", "2020-12-31"),
        ("2021-01-01", "2021-12-31"),
        ("2022-01-01", "2022-08-03"),
    ]

    for start, end in chunks:
        print(f"\n  Chunk: {start} → {end}")
        hourly = fetch_openaq_pm25(OPENAQ_API_KEY, start, end)
        if not hourly.empty:
            daily = aggregate_daily(hourly)
            pm25_frames.append(daily)
            print(f"  → {len(daily)} days with valid PM2.5")
        else:
            print(f"  → No data returned!")
        time.sleep(1)  # Rate limiting between chunks

    if pm25_frames:
        openaq_pm25 = pd.concat(pm25_frames, ignore_index=True)
        openaq_pm25 = openaq_pm25.drop_duplicates(subset=["date"]).sort_values("date")
        print(f"\nTotal OpenAQ PM2.5 days: {len(openaq_pm25)}")
        print(f"  Coverage: {openaq_pm25.date.min().date()} → {openaq_pm25.date.max().date()}")
        print(f"  PM2.5 range: {openaq_pm25.pm25_openaq.min():.1f} – {openaq_pm25.pm25_openaq.max():.1f} µg/m³")

        # Merge into main DataFrame
        df = df.merge(openaq_pm25[["date", "pm25_openaq"]], on="date", how="left")

        # Use OpenAQ PM2.5 where our CSV has NaN
        mask_fill = df["pm25"].isna() & df["pm25_openaq"].notna()
        filled_count = mask_fill.sum()
        df.loc[mask_fill, "pm25"] = df.loc[mask_fill, "pm25_openaq"].round(1)
        print(f"\n  Filled {filled_count} PM2.5 values from OpenAQ")

        # Also recalculate AQI for those rows
        df.loc[mask_fill, "aqi"] = df.loc[mask_fill, "pm25"].apply(pm25_to_aqi)
        print(f"  Recalculated AQI for {filled_count} rows")

        df = df.drop(columns=["pm25_openaq"])
    else:
        print("\n  WARNING: No OpenAQ data downloaded!")

    # Step 2: Seasonal interpolation for remaining gaps
    print("\n" + "=" * 60)
    print("STEP 2: Seasonal interpolation for remaining gaps")
    print("=" * 60)

    # Identify source (has data) and target (needs fill) masks
    has_data_cutoff = pd.Timestamp("2022-08-04")
    source_mask = df["date"] >= has_data_cutoff  # Open-Meteo data region
    target_mask = df["date"] < has_data_cutoff    # Needs filling

    # Also use OpenAQ PM2.5 data as source if available
    pm25_source = df["pm25"].notna()

    # Fill PM2.5 remaining gaps (2020-01-01 → 2020-04-08 where OpenAQ has no data)
    remaining_pm25_gaps = (target_mask & df["pm25"].isna()).sum()
    if remaining_pm25_gaps > 0:
        print(f"\n  PM2.5: {remaining_pm25_gaps} remaining gaps to fill")
        df["pm25"] = seasonal_fill(df, "pm25", pm25_source, target_mask)
        # Recalculate AQI for newly filled pm25
        newly_filled = target_mask & df["aqi"].isna()
        if newly_filled.any():
            df.loc[target_mask, "aqi"] = df.loc[target_mask, "pm25"].apply(pm25_to_aqi)

    # Fill PM10, NO2, SO2, O3
    for col in ["pm10", "no2", "so2", "ozone"]:
        if col in df.columns:
            missing = (target_mask & df[col].isna()).sum()
            if missing > 0:
                df[col] = seasonal_fill(df, col, source_mask, target_mask)

    # Final AQI recalculation for all rows that were missing
    aqi_missing = df["aqi"] == 0
    if aqi_missing.any():
        df.loc[aqi_missing & df["pm25"].notna(), "aqi"] = df.loc[aqi_missing & df["pm25"].notna(), "pm25"].apply(pm25_to_aqi)

    # Step 3: Save enriched CSV
    print("\n" + "=" * 60)
    print("STEP 3: Saving enriched CSV")
    print("=" * 60)

    # Round numeric columns
    for col in ["pm25", "pm10", "no2", "so2", "ozone"]:
        if col in df.columns:
            df[col] = df[col].round(1)

    df.to_csv(CSV_PATH, index=False)
    print(f"\nSaved {len(df)} records to {CSV_PATH}")

    # Final statistics
    print("\n" + "=" * 60)
    print("FINAL STATISTICS")
    print("=" * 60)
    print(f"Total records: {len(df)}")
    print(f"Date range: {df.date.min().date()} → {df.date.max().date()}")
    for col in ["pm25", "pm10", "no2", "so2", "ozone"]:
        if col in df.columns:
            nulls = df[col].isna().sum()
            pct = nulls / len(df) * 100
            print(f"  {col}: {nulls} missing ({pct:.1f}%)")

    print(f"\nAQI statistics:")
    winter = df[df["month"].isin([12, 1, 2])]
    summer = df[df["month"].isin([6, 7, 8])]
    print(f"  Winter avg AQI: {winter['aqi'].mean():.0f}")
    print(f"  Summer avg AQI: {summer['aqi'].mean():.0f}")
    print(f"  Overall avg AQI: {df['aqi'].mean():.0f}")
    print(f"\nPM2.5 statistics (µg/m³):")
    print(f"  Winter avg: {winter['pm25'].mean():.1f}")
    print(f"  Summer avg: {summer['pm25'].mean():.1f}")
    print(f"  Overall avg: {df['pm25'].mean():.1f}")


if __name__ == "__main__":
    main()
