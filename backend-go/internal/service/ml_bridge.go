package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/smartcity/backend/internal/domain"
)

// MLBridge handles communication with Python ML service
type MLBridge struct {
	serviceURL string
	httpClient *http.Client
}

// NewMLBridge creates a new ML bridge
func NewMLBridge(serviceURL string) *MLBridge {
	return &MLBridge{
		serviceURL: serviceURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Predict calls the Python ML service for predictions
func (b *MLBridge) Predict(ctx context.Context, req domain.PredictionRequest) (domain.PredictionResponse, error) {
	// Prepare request body
	body, err := json.Marshal(req)
	if err != nil {
		return domain.PredictionResponse{}, fmt.Errorf("ml_bridge: failed to marshal request: %w", err)
	}

	// Create HTTP request
	url := fmt.Sprintf("%s/predict", b.serviceURL)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return domain.PredictionResponse{}, fmt.Errorf("ml_bridge: failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	// Execute request
	resp, err := b.httpClient.Do(httpReq)
	if err != nil {
		// Return mock prediction on error
		return b.getMockPrediction(req), nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return b.getMockPrediction(req), nil
	}

	// Parse response
	var prediction domain.PredictionResponse
	if err := json.NewDecoder(resp.Body).Decode(&prediction); err != nil {
		return domain.PredictionResponse{}, fmt.Errorf("ml_bridge: failed to decode response: %w", err)
	}

	return prediction, nil
}

// Health checks ML service connectivity
func (b *MLBridge) Health(ctx context.Context) error {
	url := fmt.Sprintf("%s/health", b.serviceURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("ml_bridge: failed to create health request: %w", err)
	}

	resp, err := b.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("ml_bridge: health check failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("ml_bridge: health check returned status %d", resp.StatusCode)
	}

	return nil
}

// getMockPrediction returns a fallback prediction
func (b *MLBridge) getMockPrediction(req domain.PredictionRequest) domain.PredictionResponse {
	// Simple mock logic based on date
	month := time.Now().Month()
	var aqi int
	var traffic float64
	var prediction string

	switch {
	case month >= 12 || month <= 2:
		aqi = 160
		traffic = 70
		prediction = "Winter conditions expected. High smog levels due to coal heating. Recommend indoor activities and public transport."
	case month >= 6 && month <= 8:
		aqi = 45
		traffic = 50
		prediction = "Summer conditions expected. Good air quality. Traffic normal with vacation season reduction."
	default:
		aqi = 80
		traffic = 60
		prediction = "Moderate conditions expected. Normal traffic patterns and acceptable air quality."
	}

	return domain.PredictionResponse{
		Prediction:      prediction,
		ConfidenceScore: 0.75,
		AQIPrediction:   aqi,
		TrafficIndex:    traffic,
		Reasoning:       "Based on historical Almaty seasonal patterns",
		IsMock:          true,
	}
}
