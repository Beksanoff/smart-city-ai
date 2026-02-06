package service

import (
	"context"
	"encoding/json"
	"fmt"
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

	weather := domain.Weather{
		Temperature: owResp.Main.Temp,
		FeelsLike:   owResp.Main.FeelsLike,
		Humidity:    owResp.Main.Humidity,
		Pressure:    owResp.Main.Pressure,
		WindSpeed:   owResp.Wind.Speed,
		Visibility:  owResp.Visibility,
		City:        owResp.Name,
		Country:     owResp.Sys.Country,
		Timestamp:   time.Now(),
		IsMock:      false,
	}

	if len(owResp.Weather) > 0 {
		weather.Description = owResp.Weather[0].Description
		weather.Icon = owResp.Weather[0].Icon
	}

	// Calculate AQI based on Almaty winter correlation
	weather.AQI = s.calculateAQI(weather.Temperature)

	return weather, nil
}

// calculateAQI estimates AQI based on Almaty temperature correlation
func (s *WeatherService) calculateAQI(temp float64) int {
	// Almaty-specific: Winter cold = high smog due to coal heating
	month := time.Now().Month()
	isWinter := month == 12 || month == 1 || month == 2

	if isWinter && temp < -10 {
		return 180 // Unhealthy
	} else if isWinter && temp < 0 {
		return 150 // Unhealthy for sensitive groups
	} else if temp > 25 {
		return 50 // Good (summer, less heating)
	}
	return 80 // Moderate
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
		Pressure:    1015,
		AQI:         aqi,
		City:        "Almaty",
		Country:     "KZ",
		Timestamp:   time.Now(),
		IsMock:      true,
	}
}
