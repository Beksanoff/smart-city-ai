package domain

import (
	"context"
	"time"
)

// DashboardData aggregates all live monitoring data
type DashboardData struct {
	Weather   Weather   `json:"weather"`
	Traffic   Traffic   `json:"traffic"`
	Timestamp time.Time `json:"timestamp"`
}

// PredictionRequest represents input for AI prediction
type PredictionRequest struct {
	Date        string  `json:"date"`
	Temperature float64 `json:"temperature,omitempty"`
	Query       string  `json:"query,omitempty"`
}

// PredictionResponse represents AI prediction output
type PredictionResponse struct {
	Prediction      string  `json:"prediction"`
	ConfidenceScore float64 `json:"confidence_score"`
	AQIPrediction   int     `json:"aqi_prediction"`
	TrafficIndex    float64 `json:"traffic_index_prediction"`
	Reasoning       string  `json:"reasoning"`
	IsMock          bool    `json:"is_mock"`
}

// DataRepository defines the interface for data persistence
// This follows the Dependency Inversion Principle - domain defines the interface
type DataRepository interface {
	// SaveWeatherData persists weather data
	SaveWeatherData(ctx context.Context, data Weather) error

	// SaveTrafficData persists traffic data
	SaveTrafficData(ctx context.Context, data Traffic) error

	// GetHistoricalWeather retrieves weather history
	GetHistoricalWeather(ctx context.Context, from, to time.Time) ([]Weather, error)

	// GetHistoricalTraffic retrieves traffic history
	GetHistoricalTraffic(ctx context.Context, from, to time.Time) ([]Traffic, error)

	// Health checks database connectivity
	Health(ctx context.Context) error
}
