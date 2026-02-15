package http

import (
	"github.com/gofiber/fiber/v2"
	"github.com/smartcity/backend/internal/service"
)

// SetupRoutes configures all HTTP routes
func SetupRoutes(app *fiber.App, dashboardSvc *service.DashboardService, mlBridge *service.MLBridge, repo service.DataRepository) {
	handler := NewHandler(dashboardSvc, mlBridge, repo)

	// Health check
	app.Get("/health", handler.HealthCheck)

	// API v1 routes
	api := app.Group("/api/v1")
	{
		// Dashboard endpoints
		api.Get("/dashboard", handler.GetDashboard)
		api.Get("/weather", handler.GetWeather)
		api.Get("/traffic", handler.GetTraffic)

		// History endpoints
		api.Get("/history/weather", handler.GetHistoricalWeather)
		api.Get("/history/traffic", handler.GetHistoricalTraffic)

		// Prediction endpoint (proxies to Python ML service)
		api.Post("/predict", handler.Predict)
	}
}
