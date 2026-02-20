package http

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/smartcity/backend/internal/domain"
	"github.com/smartcity/backend/internal/service"
)

// Handler contains all HTTP handlers
type Handler struct {
	dashboardSvc *service.DashboardService
	mlBridge     *service.MLBridge
	repo         service.DataRepository
}

// NewHandler creates a new handler
func NewHandler(dashboardSvc *service.DashboardService, mlBridge *service.MLBridge, repo service.DataRepository) *Handler {
	return &Handler{
		dashboardSvc: dashboardSvc,
		mlBridge:     mlBridge,
		repo:         repo,
	}
}

// HealthCheck returns service health status
func (h *Handler) HealthCheck(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"status":  "ok",
		"service": "smartcity-backend",
		"version": "1.0.0",
	})
}

// GetDashboard returns aggregated live data
func (h *Handler) GetDashboard(c *fiber.Ctx) error {
	ctx := c.Context()

	data, err := h.dashboardSvc.GetDashboardData(ctx)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to fetch dashboard data")
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    data,
	})
}

// GetWeather returns current weather data
func (h *Handler) GetWeather(c *fiber.Ctx) error {
	ctx := c.Context()

	weather, err := h.dashboardSvc.GetWeather(ctx)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to fetch weather data")
	}

	return c.JSON(domain.WeatherResponse{
		Data:    weather,
		Success: true,
	})
}

// GetTraffic returns current traffic data with heatmap
func (h *Handler) GetTraffic(c *fiber.Ctx) error {
	ctx := c.Context()

	traffic, err := h.dashboardSvc.GetTraffic(ctx)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to fetch traffic data")
	}

	return c.JSON(domain.TrafficResponse{
		Data:    traffic,
		Success: true,
	})
}

// Predict proxies prediction requests to Python ML service
func (h *Handler) Predict(c *fiber.Ctx) error {
	ctx := c.Context()

	var req domain.PredictionRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	// Validation
	if req.Query != "" && len(req.Query) > 1000 {
		return fiber.NewError(fiber.StatusBadRequest, "Query too long (max 1000 characters)")
	}
	if req.Date != "" {
		dateRe := regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
		if !dateRe.MatchString(req.Date) {
			return fiber.NewError(fiber.StatusBadRequest, "Date must be in YYYY-MM-DD format")
		}
	}
	if req.Temperature != 0 && (req.Temperature < -50 || req.Temperature > 55) {
		return fiber.NewError(fiber.StatusBadRequest, "Temperature must be between -50 and 55")
	}

	prediction, err := h.mlBridge.Predict(ctx, req)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get prediction")
	}

	// Log prediction to database asynchronously
	go func() {
		bgCtx := context.Background()
		if saveErr := h.repo.SavePredictionLog(bgCtx, req, prediction); saveErr != nil {
			log.Printf("Failed to save prediction log: %v", saveErr)
		}
	}()

	return c.JSON(fiber.Map{
		"success": true,
		"data":    prediction,
	})
}

// GetStats proxies ML stats request to Python ML service
func (h *Handler) GetStats(c *fiber.Ctx) error {
	mlURL := h.mlBridge.GetServiceURL()
	url := fmt.Sprintf("%s/stats", mlURL)

	httpReq, err := http.NewRequestWithContext(c.Context(), http.MethodGet, url, nil)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create stats request")
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "ML service unavailable")
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to read stats response")
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Invalid stats response")
	}

	return c.JSON(result)
}

// GetHistoricalWeather returns weather history within a time range
func (h *Handler) GetHistoricalWeather(c *fiber.Ctx) error {
	ctx := c.Context()

	hours := c.QueryInt("hours", 24)
	if hours < 1 || hours > 720 { // max 30 days
		hours = 24
	}

	to := time.Now()
	from := to.Add(-time.Duration(hours) * time.Hour)

	data, err := h.repo.GetHistoricalWeather(ctx, from, to)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to fetch weather history")
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    data,
		"count":   len(data),
	})
}

// GetHistoricalTraffic returns traffic history within a time range
func (h *Handler) GetHistoricalTraffic(c *fiber.Ctx) error {
	ctx := c.Context()

	hours := c.QueryInt("hours", 24)
	if hours < 1 || hours > 720 {
		hours = 24
	}

	to := time.Now()
	from := to.Add(-time.Duration(hours) * time.Hour)

	data, err := h.repo.GetHistoricalTraffic(ctx, from, to)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to fetch traffic history")
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    data,
		"count":   len(data),
	})
}
