package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smartcity/backend/internal/domain"
)

// PostgresRepository implements domain.DataRepository
type PostgresRepository struct {
	pool *pgxpool.Pool
}

// NewPostgresRepository creates a new PostgreSQL repository
func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

// SaveWeatherData persists weather data to PostgreSQL
func (r *PostgresRepository) SaveWeatherData(ctx context.Context, data domain.Weather) error {
	query := `
		INSERT INTO weather_data (
			temperature, feels_like, humidity, description, icon,
			wind_speed, visibility, pressure, aqi, city, country, timestamp
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`

	_, err := r.pool.Exec(ctx, query,
		data.Temperature, data.FeelsLike, data.Humidity, data.Description, data.Icon,
		data.WindSpeed, data.Visibility, data.Pressure, data.AQI, data.City, data.Country, data.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("postgres: failed to save weather data: %w", err)
	}

	return nil
}

// SaveTrafficData persists traffic data to PostgreSQL
func (r *PostgresRepository) SaveTrafficData(ctx context.Context, data domain.Traffic) error {
	query := `
		INSERT INTO traffic_data (
			congestion_index, congestion_level, average_speed, free_flow_speed,
			incident_count, timestamp
		) VALUES ($1, $2, $3, $4, $5, $6)
	`

	_, err := r.pool.Exec(ctx, query,
		data.CongestionIndex, data.CongestionLevel, data.AverageSpeed, data.FreeFlowSpeed,
		data.IncidentCount, data.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("postgres: failed to save traffic data: %w", err)
	}

	return nil
}

// GetHistoricalWeather retrieves weather history from PostgreSQL
func (r *PostgresRepository) GetHistoricalWeather(ctx context.Context, from, to time.Time) ([]domain.Weather, error) {
	query := `
		SELECT temperature, feels_like, humidity, description, icon,
			   wind_speed, visibility, pressure, aqi, city, country, timestamp
		FROM weather_data
		WHERE timestamp BETWEEN $1 AND $2
		ORDER BY timestamp DESC
		LIMIT 100
	`

	rows, err := r.pool.Query(ctx, query, from, to)
	if err != nil {
		return nil, fmt.Errorf("postgres: failed to query weather data: %w", err)
	}
	defer rows.Close()

	var results []domain.Weather
	for rows.Next() {
		var w domain.Weather
		err := rows.Scan(
			&w.Temperature, &w.FeelsLike, &w.Humidity, &w.Description, &w.Icon,
			&w.WindSpeed, &w.Visibility, &w.Pressure, &w.AQI, &w.City, &w.Country, &w.Timestamp,
		)
		if err != nil {
			return nil, fmt.Errorf("postgres: failed to scan weather row: %w", err)
		}
		results = append(results, w)
	}

	return results, nil
}

// GetHistoricalTraffic retrieves traffic history from PostgreSQL
func (r *PostgresRepository) GetHistoricalTraffic(ctx context.Context, from, to time.Time) ([]domain.Traffic, error) {
	query := `
		SELECT congestion_index, congestion_level, average_speed, free_flow_speed,
			   incident_count, timestamp
		FROM traffic_data
		WHERE timestamp BETWEEN $1 AND $2
		ORDER BY timestamp DESC
		LIMIT 100
	`

	rows, err := r.pool.Query(ctx, query, from, to)
	if err != nil {
		return nil, fmt.Errorf("postgres: failed to query traffic data: %w", err)
	}
	defer rows.Close()

	var results []domain.Traffic
	for rows.Next() {
		var t domain.Traffic
		err := rows.Scan(
			&t.CongestionIndex, &t.CongestionLevel, &t.AverageSpeed, &t.FreeFlowSpeed,
			&t.IncidentCount, &t.Timestamp,
		)
		if err != nil {
			return nil, fmt.Errorf("postgres: failed to scan traffic row: %w", err)
		}
		results = append(results, t)
	}

	return results, nil
}

// Health checks database connectivity
func (r *PostgresRepository) Health(ctx context.Context) error {
	if err := r.pool.Ping(ctx); err != nil {
		return fmt.Errorf("postgres: health check failed: %w", err)
	}
	return nil
}

// SavePredictionLog persists a prediction request/response to PostgreSQL
func (r *PostgresRepository) SavePredictionLog(ctx context.Context, req domain.PredictionRequest, resp domain.PredictionResponse) error {
	query := `
		INSERT INTO prediction_logs (
			request_date, request_temperature, request_query,
			prediction, confidence_score, aqi_prediction, traffic_prediction, is_mock
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`

	// Handle empty date — use nil instead of empty string for nullable DATE column
	var date interface{}
	if req.Date != "" {
		date = req.Date
	}

	_, err := r.pool.Exec(ctx, query,
		date, req.Temperature, req.Query,
		resp.Prediction, resp.ConfidenceScore, resp.AQIPrediction, resp.TrafficIndex, resp.IsMock,
	)
	if err != nil {
		return fmt.Errorf("postgres: failed to save prediction log: %w", err)
	}

	return nil
}
