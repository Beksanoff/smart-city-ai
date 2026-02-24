package service

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/smartcity/backend/internal/domain"
)

// DashboardService aggregates all live data
type DashboardService struct {
	weatherSvc *WeatherService
	trafficSvc *TrafficService
	repo       DataRepository

	wgBg sync.WaitGroup // tracks background goroutines for graceful shutdown
}

// NewDashboardService creates a new dashboard service
func NewDashboardService(
	weatherSvc *WeatherService,
	trafficSvc *TrafficService,
	repo DataRepository,
) *DashboardService {
	return &DashboardService{
		weatherSvc: weatherSvc,
		trafficSvc: trafficSvc,
		repo:       repo,
	}
}

// WaitBackground blocks until all background save goroutines complete.
// Call during graceful shutdown to avoid dropped writes.
func (s *DashboardService) WaitBackground() {
	s.wgBg.Wait()
}

// GetDashboardData fetches all live data concurrently using goroutines
func (s *DashboardService) GetDashboardData(ctx context.Context) (domain.DashboardData, error) {
	var (
		weather domain.Weather
		traffic domain.Traffic
		wg      sync.WaitGroup
		mu      sync.Mutex
		errs    []error
	)

	// Fetch weather concurrently
	wg.Add(1)
	go func() {
		defer wg.Done()
		w, err := s.weatherSvc.GetCurrentWeather(ctx)
		mu.Lock()
		if err != nil {
			errs = append(errs, err)
		} else {
			weather = w
		}
		mu.Unlock()
	}()

	// Fetch traffic concurrently
	wg.Add(1)
	go func() {
		defer wg.Done()
		t, err := s.trafficSvc.GetCurrentTraffic(ctx)
		mu.Lock()
		if err != nil {
			errs = append(errs, err)
		} else {
			traffic = t
		}
		mu.Unlock()
	}()

	wg.Wait()

	// Log any errors that occurred
	for _, err := range errs {
		log.Printf("Dashboard data fetch error: %v", err)
	}

	// Persist data to database asynchronously (tracked for graceful shutdown)
	s.wgBg.Add(1)
	go func() {
		defer s.wgBg.Done()
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if weather.City != "" {
			if err := s.repo.SaveWeatherData(bgCtx, weather); err != nil {
				log.Printf("Failed to save weather data: %v", err)
			}
		}
		if traffic.CongestionIndex > 0 {
			if err := s.repo.SaveTrafficData(bgCtx, traffic); err != nil {
				log.Printf("Failed to save traffic data: %v", err)
			}
		}
	}()

	// Even with errors, return what we have
	return domain.DashboardData{
		Weather:   weather,
		Traffic:   traffic,
		Timestamp: time.Now(),
	}, nil
}

// GetWeather returns current weather
func (s *DashboardService) GetWeather(ctx context.Context) (domain.Weather, error) {
	return s.weatherSvc.GetCurrentWeather(ctx)
}

// GetTraffic returns current traffic
func (s *DashboardService) GetTraffic(ctx context.Context) (domain.Traffic, error) {
	return s.trafficSvc.GetCurrentTraffic(ctx)
}
