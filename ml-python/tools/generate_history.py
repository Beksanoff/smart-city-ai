"""
Generate Almaty Historical Dataset
Creates realistic historical data for Almaty with seasonal patterns.
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path
import random


def generate_almaty_history(
    start_date: str = "2023-01-01",
    end_date: str = "2025-12-31",
    output_path: str = None
) -> pd.DataFrame:
    """
    Generate synthetic historical data for Almaty.
    
    Implements realistic patterns:
    - Winter: Low temps, high AQI (coal heating), moderate traffic
    - Summer: High temps, low AQI, low traffic (vacations)
    - Rush hour patterns
    - Weekend vs weekday differences
    """
    
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    
    dates = []
    current = start
    while current <= end:
        dates.append(current)
        current += timedelta(days=1)
    
    records = []
    
    for date in dates:
        month = date.month
        day_of_week = date.weekday()
        is_weekend = day_of_week >= 5
        
        # Temperature based on month (Almaty continental climate)
        if month in [12, 1, 2]:  # Winter
            base_temp = random.gauss(-8, 8)
            temp = max(-30, min(5, base_temp))
        elif month in [3, 4, 5]:  # Spring
            base_temp = random.gauss(12, 8)
            temp = max(-5, min(25, base_temp))
        elif month in [6, 7, 8]:  # Summer
            base_temp = random.gauss(26, 5)
            temp = max(15, min(40, base_temp))
        else:  # Autumn
            base_temp = random.gauss(8, 8)
            temp = max(-10, min(20, base_temp))
        
        # AQI based on temperature and season (Almaty correlation)
        if month in [12, 1, 2]:  # Winter - high smog
            if temp < -15:
                base_aqi = random.gauss(200, 40)  # Very unhealthy
            elif temp < -5:
                base_aqi = random.gauss(160, 30)  # Unhealthy
            else:
                base_aqi = random.gauss(120, 25)  # USG
            aqi = max(50, min(300, int(base_aqi)))
        elif month in [6, 7, 8]:  # Summer - clean air
            base_aqi = random.gauss(40, 15)
            aqi = max(10, min(100, int(base_aqi)))
        else:
            base_aqi = random.gauss(80, 25)
            aqi = max(30, min(150, int(base_aqi)))
        
        # Traffic index (0-100)
        if is_weekend:
            base_traffic = random.gauss(35, 15)
        else:
            # Weekday - higher traffic
            if month in [6, 7, 8]:  # Summer vacation
                base_traffic = random.gauss(50, 15)
            elif month in [12, 1, 2] and temp < -15:
                # Very cold - people stay home
                base_traffic = random.gauss(55, 15)
            else:
                base_traffic = random.gauss(70, 15)
        
        traffic = max(10, min(100, base_traffic))
        
        # Humidity
        if month in [12, 1, 2]:
            humidity = random.randint(70, 90)
        elif month in [6, 7, 8]:
            humidity = random.randint(30, 50)
        else:
            humidity = random.randint(50, 70)
        
        # Wind speed (km/h)
        wind = max(0, random.gauss(8, 5))
        
        # Weather condition
        if month in [12, 1, 2]:
            conditions = ["snow", "cloudy", "clear", "fog"]
            weights = [0.4, 0.3, 0.2, 0.1]
        elif month in [6, 7, 8]:
            conditions = ["clear", "partly_cloudy", "hot", "rain"]
            weights = [0.5, 0.3, 0.15, 0.05]
        else:
            conditions = ["cloudy", "clear", "rain", "partly_cloudy"]
            weights = [0.3, 0.3, 0.2, 0.2]
        
        condition = random.choices(conditions, weights=weights)[0]
        
        records.append({
            "date": date,
            "temperature": round(temp, 1),
            "humidity": humidity,
            "wind_speed": round(wind, 1),
            "aqi": aqi,
            "traffic_index": round(traffic, 1),
            "condition": condition,
            "is_weekend": is_weekend,
            "month": month,
            "day_of_week": day_of_week
        })
    
    df = pd.DataFrame(records)
    
    # Save to file
    if output_path:
        output_file = Path(output_path)
    else:
        output_file = Path(__file__).parent.parent / "data" / "almaty_history.csv"
    
    output_file.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_file, index=False)
    print(f"Generated {len(df)} records to {output_file}")
    
    # Print some statistics
    print("\n=== Dataset Statistics ===")
    print(f"Date range: {df['date'].min()} to {df['date'].max()}")
    print(f"\nTemperature (°C):")
    print(f"  Winter avg: {df[df['month'].isin([12,1,2])]['temperature'].mean():.1f}")
    print(f"  Summer avg: {df[df['month'].isin([6,7,8])]['temperature'].mean():.1f}")
    print(f"\nAQI:")
    print(f"  Winter avg: {df[df['month'].isin([12,1,2])]['aqi'].mean():.0f}")
    print(f"  Summer avg: {df[df['month'].isin([6,7,8])]['aqi'].mean():.0f}")
    print(f"\nTraffic Index:")
    print(f"  Weekday avg: {df[~df['is_weekend']]['traffic_index'].mean():.1f}")
    print(f"  Weekend avg: {df[df['is_weekend']]['traffic_index'].mean():.1f}")
    
    return df


if __name__ == "__main__":
    generate_almaty_history()
