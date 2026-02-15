package http

import (
	"context"
	"log"
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
