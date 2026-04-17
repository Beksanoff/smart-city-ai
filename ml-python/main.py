

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from typing import Optional
import logging

from services.logic import PredictionService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

prediction_service = PredictionService()

_retrain_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await prediction_service.forecast_service.close()
    logger.info("Forecast HTTP client closed")



app = FastAPI(
    title="SmartCity ML Service",
    description="AI-powered predictions with real ML models for Almaty urban monitoring",
    version="2.0.0",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://smartcity-frontend",
        "http://backend-go:8080",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)


class PredictionRequest(BaseModel):
    date: Optional[str] = None
    temperature: Optional[float] = None
    query: Optional[str] = None
    language: Optional[str] = None

    live_aqi: Optional[int] = None
    live_traffic: Optional[float] = None
    live_temp: Optional[float] = None

    @field_validator('date')
    @classmethod
    def validate_date_format(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v != '':
            import re
            if not re.match(r'^\d{4}-\d{2}-\d{2}$', v):
                raise ValueError('Date must be in YYYY-MM-DD format')
        return v if v else None

    @field_validator('temperature')
    @classmethod
    def validate_temperature_range(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and (v < -60 or v > 60):
            raise ValueError('Temperature must be between -60 and 60')
        return v

    @field_validator('query')
    @classmethod
    def validate_query_length(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v != '' and len(v) > 2000:
            raise ValueError('Query must be less than 2000 characters')
        return v if v else None

    @field_validator('language')
    @classmethod
    def validate_language(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v != '' and v not in ('ru', 'en', 'kk'):
            raise ValueError('Language must be one of: ru, en, kk')
        return v if v else None

    @field_validator('live_aqi')
    @classmethod
    def validate_aqi_range(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and (v < 0 or v > 500):
            raise ValueError('AQI must be between 0 and 500')
        return v


class PredictionResponse(BaseModel):
    prediction: str
    confidence_score: float
    aqi_prediction: int
    traffic_index_prediction: float
    reasoning: str
    is_mock: bool


@app.get("/health")
async def health_check():
    ml_info = prediction_service.ml_model.get_info()
    return {
        "status": "ok",
        "service": "smartcity-ml",
        "version": "2.0.0",
        "ml_model_trained": ml_info["is_trained"],
        "sklearn_available": ml_info["sklearn_available"],
    }


@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    try:

        safe_date = (request.date or '').replace('\n', '').replace('\r', '')[:20]
        safe_lang = (request.language or '').replace('\n', '').replace('\r', '')[:5]
        logger.info(
            "Prediction request: date=%s, temp=%s, lang=%s, live_aqi=%s, live_traffic=%s",
            safe_date, request.temperature, safe_lang, request.live_aqi, request.live_traffic
        )
        result = await prediction_service.predict(
            date=request.date,
            temperature=request.temperature,
            query=request.query,
            language=request.language,
            live_aqi=request.live_aqi,
            live_traffic=request.live_traffic,
            live_temp=request.live_temp,
        )
        return result
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail="Internal prediction error")


@app.get("/stats")
async def get_stats():
    try:
        stats = prediction_service.get_data_stats()
        return {"success": True, "data": stats}
    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail="Internal stats error")


@app.post("/analytics")
async def get_analytics(request: PredictionRequest):
    try:
        data = await prediction_service.get_analytics_data(
            live_aqi=request.live_aqi,
            live_traffic=request.live_traffic,
            live_temp=request.live_temp,
        )
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Analytics error: {e}")
        raise HTTPException(status_code=500, detail="Internal analytics error")


@app.get("/model/info")
async def model_info():
    try:
        info = prediction_service.ml_model.get_info()
        return {"success": True, "data": info}
    except Exception as e:
        logger.error(f"Model info error: {e}")
        raise HTTPException(status_code=500, detail="Internal error")


@app.post("/model/retrain")
async def retrain_model():
    if _retrain_lock.locked():
        raise HTTPException(status_code=409, detail="Retraining already in progress")
    try:
        async with _retrain_lock:
            if prediction_service.df is None:
                raise HTTPException(status_code=400, detail="No data available")
            metrics = prediction_service.ml_model.train(prediction_service.df)
            return {"success": True, "data": metrics}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Retrain error: {e}")
        raise HTTPException(status_code=500, detail="Training failed")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
