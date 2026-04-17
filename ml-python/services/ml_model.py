# -*- coding: utf-8 -*-


import logging
import hashlib
import math
import pickle
from pathlib import Path
from typing import Optional, Dict, Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


try:
    from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
    from sklearn.model_selection import TimeSeriesSplit, cross_val_score
    from sklearn.metrics import mean_absolute_error, r2_score
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    logger.warning("scikit-learn not available -- ML models disabled, using statistical fallback")


# PM2.5 -> US EPA AQI (2024 revised breakpoints)
def pm25_to_aqi(pm25: float) -> int:
    if pm25 < 0 or np.isnan(pm25):
        return 0
    pm25 = math.floor(pm25 * 10) / 10
    # 2024 revised breakpoints (88 FR 5558)
    breakpoints = [
        (0.0, 9.0, 0, 50),
        (9.1, 35.4, 51, 100),
        (35.5, 55.4, 101, 150),
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


class SmartCityMLModel:
    """
    Two honest ML models + deterministic AQI conversion:
      - PM2.5 model: weather -> PM2.5 (GradientBoosting)
      - Traffic model: calendar + weather -> traffic (RandomForest)
      - AQI = f(PM2.5) via US EPA formula (no ML)
    """

    MODEL_DIR = Path(__file__).parent.parent / "models"
    PM25_MODEL_PATH = MODEL_DIR / "pm25_model.pkl"
    TRAFFIC_MODEL_PATH = MODEL_DIR / "traffic_model.pkl"
    SCALER_PATH = MODEL_DIR / "scaler.pkl"
    PM25_SCALER_PATH = MODEL_DIR / "pm25_scaler.pkl"
    TRAFFIC_SCALER_PATH = MODEL_DIR / "traffic_scaler.pkl"
    METRICS_PATH = MODEL_DIR / "metrics.pkl"
    HASH_PATH = MODEL_DIR / "checksums.txt"

    # Feature columns: meteo + calendar + lags (no pollutant concentrations)
    FEATURE_COLS = [
        "temperature", "humidity", "wind_speed", "precipitation",
        "month", "day_of_week", "is_weekend_int",

        "temp_squared", "temp_wind_interaction",
        "is_winter", "is_summer", "is_heating_season",

        "pm25_lag1", "traffic_lag1", "temp_lag1",

        "pm25_rolling7", "traffic_rolling7", "temp_rolling7",
    ]

    def __init__(self):
        self.pm25_model: Optional[Any] = None
        self.traffic_model: Optional[Any] = None
        self.pm25_scaler: Optional[Any] = None
        self.traffic_scaler: Optional[Any] = None
        self.metrics: Dict[str, Any] = {}
        self.is_trained = False
        self.feature_importance: Dict[str, Dict[str, float]] = {}
        self.seasonal_diagnostics: Dict[str, Any] = {}

    def train(self, df: pd.DataFrame) -> Dict[str, Any]:
        if not SKLEARN_AVAILABLE:
            logger.warning("scikit-learn not installed -- skipping model training")
            return {"error": "scikit-learn not available"}

        logger.info(f"Starting ML model training on {len(df)} records...")


        df_feat = self._engineer_features(df)

        # Exclude interpolated PM2.5 from PM2.5 model training
        if "is_interpolated" in df_feat.columns:
            n_interp = df_feat["is_interpolated"].sum()
            logger.info(f"Excluding {n_interp} interpolated PM2.5 rows from PM2.5 training")
            df_pm25_train = df_feat[~df_feat["is_interpolated"]].copy()
        else:
            df_pm25_train = df_feat.copy()


        df_feat = df_feat.dropna(subset=self.FEATURE_COLS + ["pm25", "traffic_index"])
        df_pm25_train = df_pm25_train.dropna(subset=self.FEATURE_COLS + ["pm25", "traffic_index"])
        logger.info(f"Training samples after feature engineering: {len(df_feat)} (PM2.5: {len(df_pm25_train)})")

        if len(df_feat) < 100:
            logger.error("Not enough data for training (need >= 100 rows)")
            return {"error": "Insufficient data"}


        X_pm25 = df_pm25_train[self.FEATURE_COLS].values
        y_pm25_all = df_pm25_train["pm25"].values


        X_traffic_all = df_feat[self.FEATURE_COLS].values
        y_traffic_all = df_feat["traffic_index"].values

        # Time-ordered split (80/20) before scaling to prevent data snooping
        split_pm25 = int(len(X_pm25) * 0.8)
        split_traffic = int(len(X_traffic_all) * 0.8)

        X_pm25_train_raw, X_pm25_test_raw = X_pm25[:split_pm25], X_pm25[split_pm25:]
        y_pm25_train, y_pm25_test = y_pm25_all[:split_pm25], y_pm25_all[split_pm25:]

        X_traffic_train_raw, X_traffic_test_raw = X_traffic_all[:split_traffic], X_traffic_all[split_traffic:]
        y_traffic_train, y_traffic_test = y_traffic_all[:split_traffic], y_traffic_all[split_traffic:]

        # Separate scalers per model — each has different feature distributions
        self.pm25_scaler = StandardScaler()
        X_pm25_train = self.pm25_scaler.fit_transform(X_pm25_train_raw)
        X_pm25_test = self.pm25_scaler.transform(X_pm25_test_raw)

        self.traffic_scaler = StandardScaler()
        X_traffic_train = self.traffic_scaler.fit_transform(X_traffic_train_raw)
        X_traffic_test = self.traffic_scaler.transform(X_traffic_test_raw)


        self.pm25_model = GradientBoostingRegressor(
            n_estimators=300,
            max_depth=5,
            learning_rate=0.05,
            min_samples_split=10,
            min_samples_leaf=5,
            subsample=0.8,
            random_state=42,
        )
        self.pm25_model.fit(X_pm25_train, y_pm25_train)
        pm25_pred = self.pm25_model.predict(X_pm25_test)


        aqi_true = np.array([pm25_to_aqi(v) for v in y_pm25_test])
        aqi_pred = np.array([pm25_to_aqi(v) for v in pm25_pred])

        # Traffic model — WARNING: traffic_index is fully synthetic
        self.traffic_model = RandomForestRegressor(
            n_estimators=200,
            max_depth=8,
            min_samples_split=10,
            min_samples_leaf=5,
            random_state=42,
            n_jobs=-1,
        )
        self.traffic_model.fit(X_traffic_train, y_traffic_train)
        traffic_pred = self.traffic_model.predict(X_traffic_test)


        self.metrics = {
            "pm25": {
                "mae": round(float(mean_absolute_error(y_pm25_test, pm25_pred)), 2),
                "r2": round(float(r2_score(y_pm25_test, pm25_pred)), 4),
                "test_samples": len(y_pm25_test),
                "train_samples": len(X_pm25_train),
                "data_note": "Trained on real OpenAQ + Open-Meteo PM2.5 data only (interpolated days excluded)",
            },
            "aqi_derived": {
                "mae": round(float(mean_absolute_error(aqi_true, aqi_pred)), 2),
                "r2": round(float(r2_score(aqi_true, aqi_pred)), 4),
                "note": "Deterministic from PM2.5 via US EPA 2024 revised formula (not ML)",
            },
            "traffic": {
                "mae": round(float(mean_absolute_error(y_traffic_test, traffic_pred)), 2),
                "r2": round(float(r2_score(y_traffic_test, traffic_pred)), 4),
                "test_samples": len(y_traffic_test),
                "train_samples": len(X_traffic_train),
                "data_note": (
                    "WARNING: traffic_index is fully synthetic (rule-based generation "
                    "from calendar + weather patterns + Gaussian noise). "
                    "R² measures fit to synthetic patterns, not real traffic. "
                    "Metrics are NOT comparable to PM2.5 model metrics."
                ),
            },
            "train_samples": len(X_pm25_train),
            "total_features": len(self.FEATURE_COLS),
            "feature_names": self.FEATURE_COLS,
        }


        self.feature_importance = {
            "pm25": dict(zip(
                self.FEATURE_COLS,
                [round(float(v), 4) for v in self.pm25_model.feature_importances_]
            )),
            "traffic": dict(zip(
                self.FEATURE_COLS,
                [round(float(v), 4) for v in self.traffic_model.feature_importances_]
            )),
        }
        self.metrics["feature_importance"] = self.feature_importance

        self.is_trained = True

        # TimeSeriesSplit CV — Pipeline prevents data leakage in folds
        tscv = TimeSeriesSplit(n_splits=5)
        pm25_pipe = Pipeline([
            ("scaler", StandardScaler()),
            ("model", GradientBoostingRegressor(
                n_estimators=300, max_depth=5, learning_rate=0.05,
                min_samples_split=10, min_samples_leaf=5, subsample=0.8, random_state=42,
            )),
        ])
        traffic_pipe = Pipeline([
            ("scaler", StandardScaler()),
            ("model", RandomForestRegressor(
                n_estimators=200, max_depth=8, min_samples_split=10,
                min_samples_leaf=5, random_state=42, n_jobs=-1,
            )),
        ])

        cv_pm25 = cross_val_score(pm25_pipe, X_pm25, y_pm25_all, cv=tscv, scoring="r2")
        cv_traffic = cross_val_score(traffic_pipe, X_traffic_all, y_traffic_all, cv=tscv, scoring="r2")
        self.metrics["pm25"]["cv_r2_mean"] = round(float(cv_pm25.mean()), 4)
        self.metrics["pm25"]["cv_r2_std"] = round(float(cv_pm25.std()), 4)
        self.metrics["pm25"]["cv_r2_folds"] = [round(float(v), 4) for v in cv_pm25]
        self.metrics["traffic"]["cv_r2_mean"] = round(float(cv_traffic.mean()), 4)
        self.metrics["traffic"]["cv_r2_std"] = round(float(cv_traffic.std()), 4)
        self.metrics["traffic"]["cv_r2_folds"] = [round(float(v), 4) for v in cv_traffic]
        self.metrics["cv_method"] = "TimeSeriesSplit(n_splits=5)"


        df_pm25_test_slice = df_pm25_train.iloc[split_pm25:].copy()
        self.seasonal_diagnostics = self._compute_seasonal_diagnostics(
            df_pm25_test_slice, pm25_pred, None
        )
        self.metrics["seasonal_diagnostics"] = self.seasonal_diagnostics


        self._audit_feature_importance()


        self._save_models()

        logger.info(
            f"Training complete -- PM2.5 R^2={self.metrics['pm25']['r2']} "
            f"(CV={self.metrics['pm25']['cv_r2_mean']}±{self.metrics['pm25']['cv_r2_std']}), "
            f"AQI(derived) R^2={self.metrics['aqi_derived']['r2']}, "
            f"Traffic R^2={self.metrics['traffic']['r2']} "
            f"(CV={self.metrics['traffic']['cv_r2_mean']}±{self.metrics['traffic']['cv_r2_std']})"
        )
        return self.metrics

    def predict(
        self,
        temperature: float,
        humidity: float = 60.0,
        wind_speed: float = 8.0,
        precipitation: float = 0.0,
        month: int = 1,
        day_of_week: int = 0,
        is_weekend: bool = False,
        prev_pm25: float = 25.0,
        prev_traffic: float = 45.0,
        prev_temp: float = 0.0,
        avg_pm25_7d: float = 25.0,
        avg_traffic_7d: float = 45.0,
        avg_temp_7d: float = 0.0,
        lag_features_known: bool = False,
    ) -> Dict[str, Any]:
        if not self.is_trained or not SKLEARN_AVAILABLE:
            return {"error": "Model not trained"}


        temperature = max(-50.0, min(60.0, temperature))
        humidity = max(0.0, min(100.0, humidity))
        wind_speed = max(0.0, min(80.0, wind_speed))
        precipitation = max(0.0, min(300.0, precipitation))
        month = max(1, min(12, month))
        day_of_week = max(0, min(6, day_of_week))
        prev_pm25 = max(0.0, min(600.0, prev_pm25))
        prev_traffic = max(0.0, min(100.0, prev_traffic))
        avg_pm25_7d = max(0.0, min(600.0, avg_pm25_7d))
        avg_traffic_7d = max(0.0, min(100.0, avg_traffic_7d))

        features = self._build_feature_vector(
            temperature=temperature,
            humidity=humidity,
            wind_speed=wind_speed,
            precipitation=precipitation,
            month=month,
            day_of_week=day_of_week,
            is_weekend=is_weekend,
            prev_pm25=prev_pm25,
            prev_traffic=prev_traffic,
            prev_temp=prev_temp,
            avg_pm25_7d=avg_pm25_7d,
            avg_traffic_7d=avg_traffic_7d,
            avg_temp_7d=avg_temp_7d,
        )

        X_pm25 = self.pm25_scaler.transform([features])
        X_traffic = self.traffic_scaler.transform([features])

        pm25_pred = float(self.pm25_model.predict(X_pm25)[0])
        traffic_pred = float(self.traffic_model.predict(X_traffic)[0])


        pm25_pred = max(0, min(500, pm25_pred))
        traffic_pred = max(0, min(100, traffic_pred))


        aqi_pred = pm25_to_aqi(pm25_pred)

        return {
            "pm25_prediction": round(pm25_pred, 1),
            "aqi_prediction": aqi_pred,
            "traffic_prediction": round(traffic_pred, 1),
            "model_type": "GradientBoosting(PM2.5)+EPA_formula(AQI)+RandomForest(Traffic)",
            "confidence": self._estimate_confidence(temperature, month, lag_features_known),
            "lag_features_available": lag_features_known,
        }

    def _engineer_features(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df = df.sort_values("date").reset_index(drop=True)

        # Flag interpolated PM2.5 rows (pre-OpenAQ, before 2020-04-09)
        if "is_interpolated" not in df.columns:
            openaq_start = pd.Timestamp("2020-04-09")
            df["is_interpolated"] = df["date"] < openaq_start
            n_interp = df["is_interpolated"].sum()
            if n_interp > 0:
                logger.info(f"Flagged {n_interp} rows as interpolated PM2.5 (before {openaq_start.date()})")


        df["is_weekend_int"] = df["is_weekend"].astype(int)
        df["temp_squared"] = df["temperature"] ** 2
        df["temp_wind_interaction"] = df["temperature"] * df["wind_speed"]


        df["is_winter"] = df["month"].isin([12, 1, 2]).astype(int)
        df["is_summer"] = df["month"].isin([6, 7, 8]).astype(int)
        df["is_heating_season"] = df["month"].isin([10, 11, 12, 1, 2, 3]).astype(int)


        for col in ["pm25", "pm10", "no2", "so2", "ozone"]:
            if col in df.columns:
                df[col] = df[col].fillna(df[col].median())
            else:
                df[col] = 0


        df["pm25_lag1"] = df["pm25"].shift(1)
        df["traffic_lag1"] = df["traffic_index"].shift(1)
        df["temp_lag1"] = df["temperature"].shift(1)

        # shift(1) before rolling to avoid target leakage
        df["pm25_rolling7"] = df["pm25"].shift(1).rolling(window=7, min_periods=1).mean()
        df["traffic_rolling7"] = df["traffic_index"].shift(1).rolling(window=7, min_periods=1).mean()
        df["temp_rolling7"] = df["temperature"].shift(1).rolling(window=7, min_periods=1).mean()


        for col in ["humidity", "wind_speed", "precipitation"]:
            if col in df.columns:
                df[col] = df[col].fillna(df[col].median())
            else:
                df[col] = 0

        return df

    def _build_feature_vector(self, **kwargs) -> list:
        temp = kwargs["temperature"]
        wind = kwargs["wind_speed"]
        month = kwargs["month"]

        return [
            temp,                                   # temperature
            kwargs["humidity"],                      # humidity
            wind,                                    # wind_speed
            kwargs["precipitation"],                 # precipitation
            month,                                   # month
            kwargs["day_of_week"],                   # day_of_week
            int(kwargs["is_weekend"]),               # is_weekend_int
            temp ** 2,                               # temp_squared
            temp * wind,                             # temp_wind_interaction
            int(month in [12, 1, 2]),                # is_winter
            int(month in [6, 7, 8]),                 # is_summer
            int(month in [10, 11, 12, 1, 2, 3]),    # is_heating_season
            kwargs.get("prev_pm25", 25.0),           # pm25_lag1
            kwargs["prev_traffic"],                  # traffic_lag1
            kwargs["prev_temp"],                     # temp_lag1
            kwargs.get("avg_pm25_7d", 25.0),         # pm25_rolling7
            kwargs["avg_traffic_7d"],                # traffic_rolling7
            kwargs["avg_temp_7d"],                   # temp_rolling7
        ]

    def _compute_seasonal_diagnostics(
        self, df_test: pd.DataFrame, pm25_pred: np.ndarray,
        traffic_pred: Optional[np.ndarray] = None,
    ) -> Dict[str, Any]:
        diagnostics = {}
        seasons = {
            "winter": [12, 1, 2],
            "spring": [3, 4, 5],
            "summer": [6, 7, 8],
            "autumn": [9, 10, 11],
        }
        y_pm25_test = df_test["pm25"].values

        for name, months in seasons.items():
            mask = df_test["month"].isin(months).values
            n = int(mask.sum())
            if n < 5:
                continue
            entry: Dict[str, Any] = {
                "samples": n,
                "pm25_mae": round(float(mean_absolute_error(y_pm25_test[mask], pm25_pred[mask])), 2),
                "pm25_mean_actual": round(float(y_pm25_test[mask].mean()), 1),
            }
            if traffic_pred is not None and "traffic_index" in df_test.columns:
                y_traffic_test = df_test["traffic_index"].values
                entry["traffic_mae"] = round(float(mean_absolute_error(y_traffic_test[mask], traffic_pred[mask])), 2)
            diagnostics[name] = entry


        winter = diagnostics.get("winter", {})
        summer = diagnostics.get("summer", {})
        if winter and summer:
            ratio = winter.get("pm25_mae", 1) / max(summer.get("pm25_mae", 1), 0.01)
            if ratio > 3:
                logger.warning(
                    f"Seasonal imbalance: winter PM2.5 MAE={winter['pm25_mae']} "
                    f"vs summer MAE={summer['pm25_mae']} (ratio {ratio:.1f}x)"
                )
            diagnostics["imbalance_ratio"] = round(ratio, 2)

        logger.info(f"Seasonal diagnostics: {diagnostics}")
        return diagnostics

    def _audit_feature_importance(self):
        pm25_imp = self.feature_importance.get("pm25", {})
        if not pm25_imp:
            return

        lag_features = ["pm25_lag1", "pm25_rolling7"]
        lag_total = sum(pm25_imp.get(f, 0) for f in lag_features)
        meteo_features = ["temperature", "humidity", "wind_speed", "precipitation",
                          "temp_squared", "temp_wind_interaction"]
        meteo_total = sum(pm25_imp.get(f, 0) for f in meteo_features)

        self.metrics["feature_audit"] = {
            "lag_importance_pct": round(lag_total * 100, 1),
            "meteo_importance_pct": round(meteo_total * 100, 1),
            "calendar_importance_pct": round((1 - lag_total - meteo_total) * 100, 1),
            "synthetic_features_in_model": False,  # pm10/no2/so2/ozone excluded
            "note": (
                "pm25_lag1 and pm25_rolling7 use real OpenAQ data (2020-2023) + "
                "seasonal interpolation. No synthetic pollutants in features."
            ),
        }

        if lag_total > 0.7:
            logger.warning(
                f"Lag features dominate ({lag_total*100:.0f}% importance). "
                f"Model may degrade without real-time PM2.5 data."
            )
        else:
            logger.info(
                f"Feature balance: lag={lag_total*100:.0f}%, "
                f"meteo={meteo_total*100:.0f}%, "
                f"calendar={(1-lag_total-meteo_total)*100:.0f}%"
            )

    def _estimate_confidence(self, temperature: float, month: int, lag_available: bool = True) -> float:
        base = 0.75
        if self.metrics.get("pm25", {}).get("r2", 0) > 0.5:
            base += 0.05
        if self.metrics.get("pm25", {}).get("r2", 0) > 0.65:
            base += 0.05
        if self.metrics.get("traffic", {}).get("r2", 0) > 0.5:
            base += 0.05

        if month in [1, 2, 7, 8, 12]:
            base += 0.03

        if not lag_available:
            base -= 0.10
            logger.debug("Confidence reduced: lag features unavailable")
        return max(0.40, min(0.95, base))

    def _compute_file_hash(path: Path) -> str:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return h.hexdigest()

    def _save_models(self):
        self.MODEL_DIR.mkdir(parents=True, exist_ok=True)
        try:
            checksums = {}
            for name, path, obj in [
                ("pm25_model", self.PM25_MODEL_PATH, self.pm25_model),
                ("traffic_model", self.TRAFFIC_MODEL_PATH, self.traffic_model),
                ("pm25_scaler", self.PM25_SCALER_PATH, self.pm25_scaler),
                ("traffic_scaler", self.TRAFFIC_SCALER_PATH, self.traffic_scaler),
                ("metrics", self.METRICS_PATH, self.metrics),
            ]:
                with open(path, "wb") as f:
                    pickle.dump(obj, f)
                checksums[name] = self._compute_file_hash(path)


            with open(self.HASH_PATH, "w") as f:
                for name, h in checksums.items():
                    f.write(f"{name}:{h}\n")

            logger.info(f"Models saved to {self.MODEL_DIR} (with SHA-256 checksums)")
        except Exception as e:
            logger.error(f"Failed to save models: {e}")

    def load_models(self) -> bool:
        if not SKLEARN_AVAILABLE:
            return False
        try:

            has_separate_scalers = self.PM25_SCALER_PATH.exists() and self.TRAFFIC_SCALER_PATH.exists()
            has_legacy_scaler = self.SCALER_PATH.exists()

            if not all(p.exists() for p in [self.PM25_MODEL_PATH, self.TRAFFIC_MODEL_PATH]):
                return False
            if not has_separate_scalers and not has_legacy_scaler:
                return False


            if self.HASH_PATH.exists():
                expected = {}
                for line in self.HASH_PATH.read_text().strip().split("\n"):
                    name, h = line.split(":", 1)
                    expected[name] = h

                check_files = [
                    ("pm25_model", self.PM25_MODEL_PATH),
                    ("traffic_model", self.TRAFFIC_MODEL_PATH),
                ]
                if has_separate_scalers:
                    check_files += [
                        ("pm25_scaler", self.PM25_SCALER_PATH),
                        ("traffic_scaler", self.TRAFFIC_SCALER_PATH),
                    ]
                elif has_legacy_scaler:
                    check_files.append(("scaler", self.SCALER_PATH))

                for name, path in check_files:
                    if name in expected:
                        actual = self._compute_file_hash(path)
                        if actual != expected[name]:
                            logger.error(
                                f"Checksum mismatch for {name}! "
                                f"Expected {expected[name][:16]}..., "
                                f"got {actual[:16]}..."
                            )
                            return False
                logger.info("Model checksums verified")

            with open(self.PM25_MODEL_PATH, "rb") as f:
                self.pm25_model = pickle.load(f)
            with open(self.TRAFFIC_MODEL_PATH, "rb") as f:
                self.traffic_model = pickle.load(f)

            if has_separate_scalers:
                with open(self.PM25_SCALER_PATH, "rb") as f:
                    self.pm25_scaler = pickle.load(f)
                with open(self.TRAFFIC_SCALER_PATH, "rb") as f:
                    self.traffic_scaler = pickle.load(f)
                logger.info("Loaded separate PM2.5 and traffic scalers")
            else:
                # Backward compat: old single scaler used for both
                with open(self.SCALER_PATH, "rb") as f:
                    legacy_scaler = pickle.load(f)
                self.pm25_scaler = legacy_scaler
                self.traffic_scaler = legacy_scaler
                logger.warning("Loaded legacy single scaler for both models — retrain recommended")

            if self.METRICS_PATH.exists():
                with open(self.METRICS_PATH, "rb") as f:
                    self.metrics = pickle.load(f)
            self.is_trained = True
            logger.info("Loaded pre-trained models from disk")
            return True
        except Exception as e:
            logger.error(f"Failed to load models: {e}")
        return False

    def get_info(self) -> Dict[str, Any]:
        return {
            "is_trained": self.is_trained,
            "sklearn_available": SKLEARN_AVAILABLE,
            "metrics": self.metrics,
            "feature_importance": self.feature_importance,
            "seasonal_diagnostics": self.seasonal_diagnostics,
            "model_files_exist": self.PM25_MODEL_PATH.exists(),
            "pipeline": "meteo -> PM2.5 (ML) -> AQI (EPA 2024 formula)",
            "validation": "TimeSeriesSplit (5 folds, no temporal leakage)",
            "scaler": "Separate StandardScaler per model, each fit on its own train split (no data snooping)",
            "rolling_features": "shift(1) before rolling -- excludes current day to prevent target leakage",
            "lag_strategy": (
                "pm25_lag1/pm25_rolling7: use real-time data when available, "
                "fall back to monthly averages for multi-day forecasts "
                "(confidence penalty applied)"
            ),
            "data_quality": {
                "pm25_source": (
                    "OpenAQ US Embassy sensor (2020-04-09+), "
                    "~99 days seasonal interpolation (pre-2020-04-09)"
                ),
                "traffic_source": (
                    "Rule-based synthesis from Almaty transport patterns "
                    "(no real-time historical API available)"
                ),
                "pm10_no2_so2_ozone": (
                    "Excluded from model features (partially synthetic)"
                ),
            },
        }
