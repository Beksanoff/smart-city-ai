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

var dateRegex = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

type Handler struct {
	dashboardSvc *service.DashboardService
	mlBridge     *service.MLBridge
	repo         service.DataRepository
}

func NewHandler(dashboardSvc *service.DashboardService, mlBridge *service.MLBridge, repo service.DataRepository) *Handler {
	return &Handler{
		dashboardSvc: dashboardSvc,
		mlBridge:     mlBridge,
		repo:         repo,
	}
}

func (h *Handler) HealthCheck(c *fiber.Ctx) error {
	dbStatus := "ok"
	if err := h.repo.Health(c.Context()); err != nil {
		dbStatus = "degraded"
		log.Printf("Health check: DB ping failed: %v", err)
	}

	return c.JSON(fiber.Map{
		"status":  dbStatus,
		"service": "smartcity-backend",
		"version": "1.0.0",
	})
}

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

func (h *Handler) Predict(c *fiber.Ctx) error {
	ctx := c.Context()

	var req domain.PredictionRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}


	if req.Query != "" && len(req.Query) > 1000 {
		return fiber.NewError(fiber.StatusBadRequest, "Query too long (max 1000 characters)")
	}
	if req.Date != "" {
		if !dateRegex.MatchString(req.Date) {
			return fiber.NewError(fiber.StatusBadRequest, "Date must be in YYYY-MM-DD format")
		}

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

	// Enrich with live data
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

	// Async persist to DB
	h.dashboardSvc.TrackBackground(func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if saveErr := h.repo.SavePredictionLog(bgCtx, req, prediction); saveErr != nil {
			log.Printf("Failed to save prediction log: %v", saveErr)
		}
	})

	return c.JSON(fiber.Map{
		"success": true,
		"data":    prediction,
	})
}

func (h *Handler) GetStats(c *fiber.Ctx) error {
	result, err := h.mlBridge.GetStats(c.Context())
	if err != nil {
		log.Printf("Stats fetch error: %v", err)
		return fiber.NewError(fiber.StatusServiceUnavailable, "ML service unavailable")
	}

	return c.JSON(result)
}

func (h *Handler) GetAnalytics(c *fiber.Ctx) error {
	ctx := c.Context()
	req := domain.PredictionRequest{}

	dashData, dashErr := h.dashboardSvc.GetDashboardData(ctx)
	if dashErr == nil {
		aqi := dashData.Weather.AQI
		traffic := dashData.Traffic.CongestionIndex
		temp := dashData.Weather.Temperature
		req.LiveAQI = &aqi
		req.LiveTraffic = &traffic
		req.LiveTemp = &temp
	} else {
		log.Printf("Could not fetch live data for analytics enrichment: %v", dashErr)
	}

	result, err := h.mlBridge.GetAnalytics(ctx, req)
	if err != nil {
		log.Printf("Analytics fetch error: %v", err)
		return fiber.NewError(fiber.StatusServiceUnavailable, "ML analytics unavailable")
	}

	return c.JSON(result)
}

func (h *Handler) GetHistoricalWeather(c *fiber.Ctx) error {
	ctx := c.Context()
	hours := c.QueryInt("hours", 24)
	if hours < 1 || hours > 720 {
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
