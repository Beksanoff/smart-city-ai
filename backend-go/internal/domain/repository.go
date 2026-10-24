package domain

import (
	"context"
	"time"
)

type DashboardData struct {
	Weather   Weather   `json:"weather"`
	Traffic   Traffic   `json:"traffic"`
	Timestamp time.Time `json:"timestamp"`
}

type PredictionRequest struct {
	Date        string   `json:"date"`
	Temperature *float64 `json:"temperature,omitempty"`
	Query       string   `json:"query,omitempty"`
	Language    string   `json:"language,omitempty"`
	// Enriched by Go backend before sending to ML service
	LiveAQI     *int     `json:"live_aqi,omitempty"`
	LiveTraffic *float64 `json:"live_traffic,omitempty"`
	LiveTemp    *float64 `json:"live_temp,omitempty"`
}

type PredictionResponse struct {
	Prediction      string  `json:"prediction"`
	ConfidenceScore float64 `json:"confidence_score"`
	AQIPrediction   int     `json:"aqi_prediction"`
	TrafficIndex    float64 `json:"traffic_index_prediction"`
	Reasoning       string  `json:"reasoning"`
	IsMock          bool    `json:"is_mock"`
}

type DataRepository interface {
	SaveWeatherData(ctx context.Context, data Weather) error
	SaveTrafficData(ctx context.Context, data Traffic) error
	SavePredictionLog(ctx context.Context, req PredictionRequest, resp PredictionResponse) error
	GetHistoricalWeather(ctx context.Context, from, to time.Time) ([]Weather, error)
	GetHistoricalTraffic(ctx context.Context, from, to time.Time) ([]Traffic, error)
	Health(ctx context.Context) error
}
