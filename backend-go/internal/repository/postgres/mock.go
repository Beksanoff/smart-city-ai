package postgres

import (
	"context"
	"time"

	"github.com/smartcity/backend/internal/domain"
)

type MockRepository struct{}

func NewMockRepository() *MockRepository {
	return &MockRepository{}
}

func (r *MockRepository) SaveWeatherData(ctx context.Context, data domain.Weather) error {
	return nil
}

func (r *MockRepository) SaveTrafficData(ctx context.Context, data domain.Traffic) error {
	return nil
}

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

func (r *MockRepository) Health(ctx context.Context) error {
	return nil
}

func (r *MockRepository) SavePredictionLog(ctx context.Context, req domain.PredictionRequest, resp domain.PredictionResponse) error {
	return nil
}
