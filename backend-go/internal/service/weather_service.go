package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"time"

	"github.com/smartcity/backend/internal/domain"
)

// WeatherService handles weather data fetching
type WeatherService struct {
	apiKey     string
	httpClient *http.Client
}

// NewWeatherService creates a new weather service
func NewWeatherService(apiKey string) *WeatherService {
	return &WeatherService{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// OpenWeatherResponse represents the OpenWeatherMap API response
type OpenWeatherResponse struct {
	Main struct {
		Temp      float64 `json:"temp"`
		FeelsLike float64 `json:"feels_like"`
		Humidity  int     `json:"humidity"`
		Pressure  int     `json:"pressure"`
	} `json:"main"`
	Weather []struct {
		Description string `json:"description"`
		Icon        string `json:"icon"`
	} `json:"weather"`
	Wind struct {
		Speed float64 `json:"speed"`
	} `json:"wind"`
	Visibility int    `json:"visibility"`
	Name       string `json:"name"`
	Sys        struct {
		Country string `json:"country"`
	} `json:"sys"`
}

// AirPollutionResponse represents OpenWeatherMap Air Pollution API response
type AirPollutionResponse struct {
	List []struct {
		Main struct {
			AQI int `json:"aqi"` // 1-5 European scale
		} `json:"main"`
		Components struct {
			PM25 float64 `json:"pm2_5"` // μg/m³
			PM10 float64 `json:"pm10"`
			NO2  float64 `json:"no2"`
			SO2  float64 `json:"so2"`
			CO   float64 `json:"co"`
			O3   float64 `json:"o3"`
		} `json:"components"`
	} `json:"list"`
}

// GetCurrentWeather fetches current weather for Almaty
func (s *WeatherService) GetCurrentWeather(ctx context.Context) (domain.Weather, error) {
	// Return mock data if no API key
	if s.apiKey == "" {
		return s.getMockWeather(), nil
	}

	url := fmt.Sprintf(
		"https://api.openweathermap.org/data/2.5/weather?lat=%f&lon=%f&appid=%s&units=metric",
		domain.AlmatyCenterLat, domain.AlmatyCenterLon, s.apiKey,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return domain.Weather{}, fmt.Errorf("weather: failed to create request: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		// Fallback to mock on network error
		return s.getMockWeather(), nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return s.getMockWeather(), nil
	}

	var owResp OpenWeatherResponse
	if err := json.NewDecoder(resp.Body).Decode(&owResp); err != nil {
		return domain.Weather{}, fmt.Errorf("weather: failed to decode response: %w", err)
	}

	// OpenWeatherMap returns neighborhood name (e.g. "Gornyy Gigant") for Almaty coords,
	// so we override with the canonical city name.
	weather := domain.Weather{
		Temperature: owResp.Main.Temp,
		FeelsLike:   owResp.Main.FeelsLike,
		Humidity:    owResp.Main.Humidity,
		Pressure:    owResp.Main.Pressure,
		WindSpeed:   owResp.Wind.Speed,
		Visibility:  owResp.Visibility,
		City:        "Almaty",
		Country:     "KZ",
		Timestamp:   time.Now(),
		IsMock:      false,
	}

	if len(owResp.Weather) > 0 {
		weather.Description = owResp.Weather[0].Description
		weather.Icon = owResp.Weather[0].Icon
	}

	// Fetch real AQI from OpenWeatherMap Air Pollution API
	if aqi, err := s.getAirQuality(ctx); err == nil {
		weather.AQI = aqi
	} else {
		log.Printf("Warning: could not fetch real AQI, using estimate: %v", err)
		weather.AQI = s.estimateAQI(weather.Temperature)
	}

	return weather, nil
}

// getAirQuality fetches real AQI from OpenWeatherMap Air Pollution API
func (s *WeatherService) getAirQuality(ctx context.Context) (int, error) {
	url := fmt.Sprintf(
		"https://api.openweathermap.org/data/2.5/air_pollution?lat=%f&lon=%f&appid=%s",
		domain.AlmatyCenterLat, domain.AlmatyCenterLon, s.apiKey,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, fmt.Errorf("air_pollution: failed to create request: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("air_pollution: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("air_pollution: API returned status %d", resp.StatusCode)
	}

	var apResp AirPollutionResponse
	if err := json.NewDecoder(resp.Body).Decode(&apResp); err != nil {
		return 0, fmt.Errorf("air_pollution: failed to decode: %w", err)
	}

	if len(apResp.List) == 0 {
		return 0, fmt.Errorf("air_pollution: empty response")
	}

	// Convert PM2.5 concentration to US EPA AQI scale
	pm25 := apResp.List[0].Components.PM25
	aqi := pm25ToAQI(pm25)
	log.Printf("Real AQI: PM2.5=%.1f μg/m³ → EPA AQI=%d", pm25, aqi)

	return aqi, nil
}

// pm25ToAQI converts PM2.5 concentration (μg/m³) to US EPA AQI (0-500)
func pm25ToAQI(pm25 float64) int {
	type bp struct {
		cLow, cHigh float64
		iLow, iHigh int
	}
	breakpoints := []bp{
		{0.0, 12.0, 0, 50},
		{12.1, 35.4, 51, 100},
		{35.5, 55.4, 101, 150},
		{55.5, 150.4, 151, 200},
		{150.5, 250.4, 201, 300},
		{250.5, 350.4, 301, 400},
		{350.5, 500.4, 401, 500},
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
