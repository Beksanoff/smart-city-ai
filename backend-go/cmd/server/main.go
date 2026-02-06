package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/smartcity/backend/internal/delivery/http"
	"github.com/smartcity/backend/internal/repository/postgres"
	"github.com/smartcity/backend/internal/service"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment")
	}

	// Configuration
	cfg := loadConfig()

	// Database connection
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Printf("Warning: Could not connect to database: %v", err)
		log.Println("Running with mock data only")
		pool = nil
	} else {
		defer pool.Close()
		log.Println("Connected to PostgreSQL")
	}

	// Dependency Injection: Repositories
	var dataRepo service.DataRepository
	if pool != nil {
		dataRepo = postgres.NewPostgresRepository(pool)
	} else {
		dataRepo = postgres.NewMockRepository()
	}

	// Dependency Injection: Services
	weatherSvc := service.NewWeatherService(cfg.OpenWeatherAPIKey)
	trafficSvc := service.NewTrafficService(cfg.TomTomAPIKey)
	mlBridge := service.NewMLBridge(cfg.MLServiceURL)
	dashboardSvc := service.NewDashboardService(weatherSvc, trafficSvc, dataRepo)

	// Fiber App
	app := fiber.New(fiber.Config{
		AppName:      "SmartCity API v1.0",
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		ErrorHandler: customErrorHandler,
	})

	// Middleware
	app.Use(recover.New())
	app.Use(logger.New(logger.Config{
		Format: "[${time}] ${status} - ${method} ${path} (${latency})\n",
	}))
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders: "Origin,Content-Type,Accept,Authorization",
	}))

	// Routes
	http.SetupRoutes(app, dashboardSvc, mlBridge)

	// Graceful shutdown
	go func() {
		port := cfg.Port
		if port == "" {
			port = "8080"
		}
		log.Printf("Server starting on :%s", port)
		if err := app.Listen(":" + port); err != nil {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	if err := app.ShutdownWithTimeout(5 * time.Second); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	}
	log.Println("Server exited gracefully")
}

type Config struct {
	DatabaseURL       string
	OpenWeatherAPIKey string
	TomTomAPIKey      string
	MLServiceURL      string
	Port              string
	Env               string
}

func loadConfig() *Config {
	return &Config{
		DatabaseURL:       getEnv("DATABASE_URL", ""),
		OpenWeatherAPIKey: getEnv("OPENWEATHER_API_KEY", ""),
		TomTomAPIKey:      getEnv("TOMTOM_API_KEY", ""),
		MLServiceURL:      getEnv("ML_SERVICE_URL", "http://localhost:8000"),
		Port:              getEnv("PORT", "8080"),
		Env:               getEnv("GO_ENV", "development"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func customErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	message := "Internal Server Error"

	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
		message = e.Message
	}

	return c.Status(code).JSON(fiber.Map{
		"error":   true,
		"message": message,
	})
}
