package http

import (
	"context"
	"log"
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

	// Validation: use pointer/flag to distinguish 0°C from "not provided"
	if req.Query != "" && len(req.Query) > 1000 {
		return fiber.NewError(fiber.StatusBadRequest, "Query too long (max 1000 characters)")
	}
	if req.Date != "" {
		dateRe := regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
		if !dateRe.MatchString(req.Date) {
			return fiber.NewError(fiber.StatusBadRequest, "Date must be in YYYY-MM-DD format")
		}
		// Verify it's a real date (e.g. reject 2025-02-30)
		if _, err := time.Parse("2006-01-02", req.Date); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Invalid date value")
		}
	}
	if req.Temperature != nil && (*req.Temperature < -50 || *req.Temperature > 60) {
		return fiber.NewError(fiber.StatusBadRequest, "Temperature must be between -50 and 60")
	}
	if req.Language != "" {
		switch req.Language {
		case "ru", "en", "kk":
			// ok
		default:
			return fiber.NewError(fiber.StatusBadRequest, "Language must be one of: ru, en, kk")
		}
	}

	// Enrich request with live data from dashboard (weather + traffic)
	dashData, dashErr := h.dashboardSvc.GetDashboardData(ctx)
	if dashErr == nil {
		aqi := dashData.Weather.AQI
		traffic := dashData.Traffic.CongestionIndex
		temp := dashData.Weather.Temperature
		req.LiveAQI = &aqi
		req.LiveTraffic = &traffic
		req.LiveTemp = &temp
	} else {
		log.Printf("Could not fetch live data for prediction enrichment: %v", dashErr)
	}

	prediction, err := h.mlBridge.Predict(ctx, req)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get prediction")
	}

	// Log prediction to database asynchronously
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if saveErr := h.repo.SavePredictionLog(bgCtx, req, prediction); saveErr != nil {
			log.Printf("Failed to save prediction log: %v", saveErr)
		}
	}()

	return c.JSON(fiber.Map{
		"success": true,
		"data":    prediction,
	})
}

// GetStats proxies ML stats request to Python ML service via MLBridge
func (h *Handler) GetStats(c *fiber.Ctx) error {
	result, err := h.mlBridge.GetStats(c.Context())
	if err != nil {
		log.Printf("Stats fetch error: %v", err)
		return fiber.NewError(fiber.StatusServiceUnavailable, "ML service unavailable")
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
