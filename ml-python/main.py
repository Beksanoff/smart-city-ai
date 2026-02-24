"""
Smart City AI Core — ML Service v2.0
FastAPI application with:
- Real ML models (GradientBoosting + RandomForest) trained on 2234 days
- Open-Meteo 3-day forecast integration
- Enhanced Groq LLM with live data context
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import logging

from services.logic import PredictionService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="SmartCity ML Service",
    description="AI-powered predictions with real ML models for Almaty urban monitoring",
    version="2.0.0",
)

# CORS middleware — restricted to known origins
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

# Initialize prediction service (trains ML models on startup)
prediction_service = PredictionService()


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on shutdown."""
    prediction_service.forecast_service.close()
    logger.info("Forecast HTTP client closed")


class PredictionRequest(BaseModel):
    """Request model for predictions — now accepts live data from backend."""
    date: Optional[str] = None
    temperature: Optional[float] = None
    query: Optional[str] = None
    language: Optional[str] = None
    # Live data fields (sent by Go backend)
    live_aqi: Optional[int] = None
    live_traffic: Optional[float] = None
    live_temp: Optional[float] = None


class PredictionResponse(BaseModel):
    """Response model for predictions"""
    prediction: str
    confidence_score: float
    aqi_prediction: int
    traffic_index_prediction: float
    reasoning: str
    is_mock: bool


@app.get("/health")
async def health_check():
    """Health check endpoint with ML model status."""
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
    """
    Generate AI prediction for Almaty urban conditions.
    
    Enhanced with:
    - Real ML models (GradientBoosting + RandomForest)
    - Open-Meteo 3-day forecast
    - Live data context (AQI/traffic from Go backend)
    - Adaptive Groq LLM prompt
    """
    try:
        logger.info(f"Prediction request: date={request.date}, temp={request.temperature}, "
                     f"lang={request.language}, live_aqi={request.live_aqi}, live_traffic={request.live_traffic}")
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
    """Get historical data statistics + ML model metrics."""
    try:
        stats = prediction_service.get_data_stats()
        return {"success": True, "data": stats}
    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail="Internal stats error")


@app.get("/model/info")
async def model_info():
    """Get ML model training metrics, feature importance, and status."""
    try:
        info = prediction_service.ml_model.get_info()
        return {"success": True, "data": info}
    except Exception as e:
        logger.error(f"Model info error: {e}")
        raise HTTPException(status_code=500, detail="Internal error")


@app.post("/model/retrain")
async def retrain_model():
    """Re-train ML models from CSV data. Useful after data updates."""
    try:
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
