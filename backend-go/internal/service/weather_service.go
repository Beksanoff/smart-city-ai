package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/smartcity/backend/internal/domain"
)

// WeatherService fetches weather + AQI from Open-Meteo (free, no API key).
// Replaces OpenWeatherMap to avoid rate limits (1,000/day).
// Open-Meteo allows 10,000+ requests/day, no key needed.
type WeatherService struct {
	httpClient *http.Client

	// Cache to avoid excessive API calls
	mu          sync.RWMutex
	cachedData  *domain.Weather
	cacheExpiry time.Time
	cacheTTL    time.Duration
}

// NewWeatherService creates a weather service using Open-Meteo.
// The apiKey param is kept for backward compatibility but is unused.
func NewWeatherService(apiKey string) *WeatherService {
	return &WeatherService{
		httpClient: &http.Client{Timeout: 10 * time.Second},
		cacheTTL:   5 * time.Minute, // Cache 5 min (Open-Meteo updates every 15 min)
	}
}

// --- Open-Meteo response structs ---

type OpenMeteoCurrentResponse struct {
	Current struct {
		Time               string  `json:"time"`
		Temperature2m      float64 `json:"temperature_2m"`
		RelativeHumidity2m int     `json:"relative_humidity_2m"`
		ApparentTemp       float64 `json:"apparent_temperature"`
		WeatherCode        int     `json:"weather_code"`
		WindSpeed10m       float64 `json:"wind_speed_10m"`
		SurfacePressure    float64 `json:"surface_pressure"`
	} `json:"current"`
}

type OpenMeteoAirQualityResponse struct {
	Current struct {
		Time string   `json:"time"`
		PM25 *float64 `json:"pm2_5"`
		PM10 *float64 `json:"pm10"`
	} `json:"current"`
}

// GetCurrentWeather fetches live weather + AQI from Open-Meteo
func (s *WeatherService) GetCurrentWeather(ctx context.Context) (domain.Weather, error) {
	// Check cache first (read lock)
	s.mu.RLock()
	if s.cachedData != nil && time.Now().Before(s.cacheExpiry) {
		cached := *s.cachedData
		s.mu.RUnlock()
		return cached, nil
	}
	s.mu.RUnlock()

	// Upgrade to write lock, double-check to avoid thundering herd
	s.mu.Lock()
	if s.cachedData != nil && time.Now().Before(s.cacheExpiry) {
		cached := *s.cachedData
		s.mu.Unlock()
		return cached, nil
	}
	s.mu.Unlock()

	// Fetch weather from Open-Meteo
	weather, err := s.fetchOpenMeteoWeather(ctx)
	if err != nil {
		log.Printf("Open-Meteo weather error, using fallback: %v", err)
		return s.getMockWeather(), nil
	}

	// Fetch AQI from Open-Meteo Air Quality
	if aqi, err := s.fetchOpenMeteoAQI(ctx); err == nil {
		weather.AQI = aqi
	} else {
		log.Printf("Open-Meteo AQI error, estimating: %v", err)
		weather.AQI = s.estimateAQI(weather.Temperature)
	}

	// Cache result
	s.mu.Lock()
	s.cachedData = &weather
	s.cacheExpiry = time.Now().Add(s.cacheTTL)
	s.mu.Unlock()

	log.Printf("Open-Meteo weather: %.1f°C, humidity=%d%%, AQI=%d, %s",
		weather.Temperature, weather.Humidity, weather.AQI, weather.Description)

	return weather, nil
}

// fetchOpenMeteoWeather queries Open-Meteo Forecast API for current conditions
func (s *WeatherService) fetchOpenMeteoWeather(ctx context.Context) (domain.Weather, error) {
	url := fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure&timezone=Asia%%2FAlmaty",
		domain.AlmatyCenterLat, domain.AlmatyCenterLon,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return domain.Weather{}, fmt.Errorf("open-meteo: create request: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return domain.Weather{}, fmt.Errorf("open-meteo: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return domain.Weather{}, fmt.Errorf("open-meteo: status %d", resp.StatusCode)
	}

	var omResp OpenMeteoCurrentResponse
	if err := json.NewDecoder(resp.Body).Decode(&omResp); err != nil {
		return domain.Weather{}, fmt.Errorf("open-meteo: decode: %w", err)
	}

	c := omResp.Current
	description, icon := wmoToDescription(c.WeatherCode)

	return domain.Weather{
		Temperature: math.Round(c.Temperature2m*10) / 10,
		FeelsLike:   math.Round(c.ApparentTemp*10) / 10,
		Humidity:    c.RelativeHumidity2m,
		Description: description,
		Icon:        icon,
		WindSpeed:   math.Round(c.WindSpeed10m/3.6*10) / 10, // km/h → m/s
		Visibility:  10000,
		Pressure:    int(math.Round(c.SurfacePressure)),
		City:        "Almaty",
		Country:     "KZ",
		Timestamp:   time.Now(),
		IsMock:      false,
	}, nil
}

// fetchOpenMeteoAQI queries Open-Meteo Air Quality API
func (s *WeatherService) fetchOpenMeteoAQI(ctx context.Context) (int, error) {
	url := fmt.Sprintf(
		"https://air-quality-api.open-meteo.com/v1/air-quality?latitude=%.4f&longitude=%.4f&current=pm2_5,pm10&timezone=Asia%%2FAlmaty",
		domain.AlmatyCenterLat, domain.AlmatyCenterLon,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("air-quality: status %d", resp.StatusCode)
	}

	var aqResp OpenMeteoAirQualityResponse
	if err := json.NewDecoder(resp.Body).Decode(&aqResp); err != nil {
		return 0, err
	}

	if aqResp.Current.PM25 == nil {
		return 0, fmt.Errorf("air-quality: PM2.5 is null")
	}

	pm25 := *aqResp.Current.PM25
	aqi := pm25ToAQI(pm25)
	log.Printf("Open-Meteo AQI: PM2.5=%.1f μg/m³ → EPA AQI=%d", pm25, aqi)
	return aqi, nil
}

// wmoToDescription converts WMO weather code to description + icon
func wmoToDescription(code int) (string, string) {
	switch {
	case code == 0:
		return "Clear sky", "01d"
	case code <= 3:
		return "Partly cloudy", "02d"
	case code == 45 || code == 48:
		return "Fog", "50d"
	case code >= 51 && code <= 57:
		return "Drizzle", "09d"
	case code >= 61 && code <= 67:
		return "Rain", "10d"
	case code >= 71 && code <= 77:
		return "Snow", "13d"
	case code >= 80 && code <= 82:
		return "Rain showers", "09d"
	case code >= 85 && code <= 86:
		return "Snow showers", "13d"
	case code >= 95:
		return "Thunderstorm", "11d"
	default:
		return "Cloudy", "04d"
	}
}

// pm25ToAQI converts PM2.5 concentration (μg/m³) to US EPA AQI (0-500).
// Uses the February 2024 revised breakpoints (88 FR 5558).
// Key change: "Good" category lowered from 12.0 to 9.0 µg/m³,
// "Very Unhealthy" ceiling lowered from 150.4 to 125.4 µg/m³.
func pm25ToAQI(pm25 float64) int {
	type bp struct {
		cLow, cHigh float64
		iLow, iHigh int
	}
	breakpoints := []bp{
		{0.0, 9.0, 0, 50},
		{9.1, 35.4, 51, 100},
		{35.5, 55.4, 101, 150},
		{55.5, 125.4, 151, 200},
		{125.5, 225.4, 201, 300},
		{225.5, 325.4, 301, 400},
		{325.5, 500.4, 401, 500},
	}

	for _, b := range breakpoints {
		if pm25 >= b.cLow && pm25 <= b.cHigh {
			aqi := float64(b.iHigh-b.iLow)/(b.cHigh-b.cLow)*(pm25-b.cLow) + float64(b.iLow)
			return int(math.Round(aqi))
		}
	}

	if pm25 > 500.4 {
		return 500
	}
	return 0
}

// estimateAQI provides a rough AQI estimate when Air Pollution API is unavailable
func (s *WeatherService) estimateAQI(temp float64) int {
	month := time.Now().Month()
	isWinter := month == 12 || month == 1 || month == 2

	if isWinter && temp < -10 {
		return 200 // Almaty winter inversions
	} else if isWinter && temp < 0 {
		return 160
	} else if temp > 25 {
		return 45
	}
	return 80
}

// getMockWeather returns simulated Almaty weather
func (s *WeatherService) getMockWeather() domain.Weather {
	month := time.Now().Month()
	var temp, feelsLike float64
	var description string
	var aqi int

	switch {
	case month >= 12 || month <= 2: // Winter
		temp = -8.0
		feelsLike = -15.0
		description = "Light snow"
		aqi = 165
	case month >= 3 && month <= 5: // Spring
		temp = 12.0
		feelsLike = 10.0
		description = "Partly cloudy"
		aqi = 75
	case month >= 6 && month <= 8: // Summer
		temp = 28.0
		feelsLike = 30.0
		description = "Clear sky"
		aqi = 45
	default: // Autumn
		temp = 8.0
		feelsLike = 5.0
		description = "Overcast clouds"
		aqi = 90
	}

	return domain.Weather{
		Temperature: temp,
		FeelsLike:   feelsLike,
		Humidity:    65,
		Description: description,
		Icon:        "04d",
		WindSpeed:   3.5,
		Visibility:  8000,
		Pressure:    938,
		AQI:         aqi,
		City:        "Almaty",
		Country:     "KZ",
		Timestamp:   time.Now(),
		IsMock:      true,
	}
}
