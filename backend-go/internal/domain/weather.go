package domain

import "time"

// Weather represents weather data for a location
type Weather struct {
	Temperature float64   `json:"temperature"`
	FeelsLike   float64   `json:"feels_like"`
	Humidity    int       `json:"humidity"`
	Description string    `json:"description"`
	Icon        string    `json:"icon"`
	WindSpeed   float64   `json:"wind_speed"`
	Visibility  int       `json:"visibility"`
	Pressure    int       `json:"pressure"`
	AQI         int       `json:"aqi"`
	City        string    `json:"city"`
	Country     string    `json:"country"`
	Timestamp   time.Time `json:"timestamp"`
	IsMock      bool      `json:"is_mock"`
}

// WeatherResponse wraps weather data with metadata
type WeatherResponse struct {
	Data    Weather `json:"data"`
	Success bool    `json:"success"`
	Message string  `json:"message,omitempty"`
}
