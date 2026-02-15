package postgres

import (
	"context"
	"time"

	"github.com/smartcity/backend/internal/domain"
)

// MockRepository implements domain.DataRepository for testing/demo mode
type MockRepository struct{}

// NewMockRepository creates a new mock repository
func NewMockRepository() *MockRepository {
	return &MockRepository{}
}

// SaveWeatherData is a no-op in mock mode
func (r *MockRepository) SaveWeatherData(ctx context.Context, data domain.Weather) error {
	return nil
}

// SaveTrafficData is a no-op in mock mode
func (r *MockRepository) SaveTrafficData(ctx context.Context, data domain.Traffic) error {
	return nil
}

// GetHistoricalWeather returns mock historical data
func (r *MockRepository) GetHistoricalWeather(ctx context.Context, from, to time.Time) ([]domain.Weather, error) {
	return []domain.Weather{
		{
			Temperature: -5.0,
			FeelsLike:   -10.0,
			Humidity:    75,
			Description: "Overcast clouds",
			Icon:        "04d",
			WindSpeed:   3.5,
			Visibility:  5000,
			Pressure:    1020,
			AQI:         120,
			City:        "Almaty",
			Country:     "KZ",
			Timestamp:   time.Now().Add(-24 * time.Hour),
			IsMock:      true,
		},
	}, nil
}

// GetHistoricalTraffic returns mock historical data
func (r *MockRepository) GetHistoricalTraffic(ctx context.Context, from, to time.Time) ([]domain.Traffic, error) {
	return []domain.Traffic{
		{
			CongestionIndex: 65.0,
			CongestionLevel: "Moderate",
			AverageSpeed:    35.0,
			FreeFlowSpeed:   60.0,
			IncidentCount:   3,
			Timestamp:       time.Now().Add(-24 * time.Hour),
			IsMock:          true,
		},
	}, nil
}

// Health always returns nil in mock mode
func (r *MockRepository) Health(ctx context.Context) error {
	return nil
}

// SavePredictionLog is a no-op in mock mode
func (r *MockRepository) SavePredictionLog(ctx context.Context, req domain.PredictionRequest, resp domain.PredictionResponse) error {
	return nil
}
