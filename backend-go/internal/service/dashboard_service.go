package service

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/smartcity/backend/internal/domain"
)

type DashboardService struct {
	weatherSvc *WeatherService
	trafficSvc *TrafficService
	repo       DataRepository

	wgBg sync.WaitGroup

	// DB write throttle: max once per minute
	lastWriteMu sync.Mutex
	lastWriteAt time.Time
}

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

func (s *DashboardService) WaitBackground() {
	s.wgBg.Wait()
}

func (s *DashboardService) TrackBackground(fn func()) {
	s.wgBg.Add(1)
	go func() {
		defer s.wgBg.Done()
		fn()
	}()
}

func (s *DashboardService) GetDashboardData(ctx context.Context) (domain.DashboardData, error) {
	var (
		weather domain.Weather
		traffic domain.Traffic
		wg      sync.WaitGroup
		mu      sync.Mutex
		errs    []error
	)


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


	for _, err := range errs {
		log.Printf("Dashboard data fetch error: %v", err)
	}

	// Async DB persist (throttled to once per minute)
	s.lastWriteMu.Lock()
	shouldWrite := time.Since(s.lastWriteAt) >= time.Minute
	if shouldWrite {
		s.lastWriteAt = time.Now()
	}
	s.lastWriteMu.Unlock()

	if shouldWrite {
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
			if traffic.CongestionIndex >= 0 {
				if err := s.repo.SaveTrafficData(bgCtx, traffic); err != nil {
					log.Printf("Failed to save traffic data: %v", err)
				}
			}
		}()
	}


	var retErr error
	if len(errs) > 0 {
		msgs := make([]string, len(errs))
		for i, e := range errs {
			msgs[i] = e.Error()
		}
		retErr = fmt.Errorf("dashboard fetch errors: %s", strings.Join(msgs, "; "))
	}


	return domain.DashboardData{
		Weather:   weather,
		Traffic:   traffic,
		Timestamp: time.Now(),
	}, retErr
}

func (s *DashboardService) GetWeather(ctx context.Context) (domain.Weather, error) {
	return s.weatherSvc.GetCurrentWeather(ctx)
}

func (s *DashboardService) GetTraffic(ctx context.Context) (domain.Traffic, error) {
	return s.trafficSvc.GetCurrentTraffic(ctx)
}
