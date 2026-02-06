package http

import (
	"github.com/gofiber/fiber/v2"
	"github.com/smartcity/backend/internal/service"
)

// SetupRoutes configures all HTTP routes
func SetupRoutes(app *fiber.App, dashboardSvc *service.DashboardService, mlBridge *service.MLBridge) {
	handler := NewHandler(dashboardSvc, mlBridge)

	// Health check
	app.Get("/health", handler.HealthCheck)

	// API v1 routes
	api := app.Group("/api/v1")
	{
		// Dashboard endpoints
		api.Get("/dashboard", handler.GetDashboard)
		api.Get("/weather", handler.GetWeather)
		api.Get("/traffic", handler.GetTraffic)

		// Prediction endpoint (proxies to Python ML service)
		api.Post("/predict", handler.Predict)
	}
}
