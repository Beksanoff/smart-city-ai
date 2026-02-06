"""
Smart City AI Core - ML Service
FastAPI application for AI predictions using Groq and historical data analysis.
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
    description="AI-powered predictions for Almaty urban monitoring",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize prediction service
prediction_service = PredictionService()


class PredictionRequest(BaseModel):
    """Request model for predictions"""
    date: Optional[str] = None
    temperature: Optional[float] = None
    query: Optional[str] = None


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
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "smartcity-ml",
        "version": "1.0.0"
    }


@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """
    Generate AI prediction for Almaty urban conditions.
    
    Uses:
    - Historical CSV data correlation
    - Almaty-specific seasonal patterns
    - Groq LLM for natural language insights
    """
    try:
        logger.info(f"Prediction request: {request}")
        result = await prediction_service.predict(
            date=request.date,
            temperature=request.temperature,
            query=request.query
        )
        return result
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stats")
async def get_stats():
    """Get historical data statistics"""
    try:
        stats = prediction_service.get_data_stats()
        return {"success": True, "data": stats}
    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
