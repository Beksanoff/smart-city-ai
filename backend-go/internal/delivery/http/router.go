package http

import (
	"github.com/gofiber/fiber/v2"
	"github.com/smartcity/backend/internal/service"
)

func SetupRoutes(app *fiber.App, dashboardSvc *service.DashboardService, mlBridge *service.MLBridge, repo service.DataRepository) {
	handler := NewHandler(dashboardSvc, mlBridge, repo)

	app.Get("/health", handler.HealthCheck)

	api := app.Group("/api/v1")
	{
		api.Get("/dashboard", handler.GetDashboard)
		api.Get("/weather", handler.GetWeather)
		api.Get("/traffic", handler.GetTraffic)

		api.Get("/history/weather", handler.GetHistoricalWeather)
		api.Get("/history/traffic", handler.GetHistoricalTraffic)

		api.Post("/predict", handler.Predict)

		api.Get("/stats", handler.GetStats)
		api.Get("/analytics", handler.GetAnalytics)
	}
}
