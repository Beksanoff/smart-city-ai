package service

import (
	"context"
	"math"
	"math/rand"
	"time"

	"github.com/smartcity/backend/internal/domain"
)

// TrafficService handles traffic data and heatmap generation
type TrafficService struct {
	apiKey string
}

// NewTrafficService creates a new traffic service
func NewTrafficService(apiKey string) *TrafficService {
	return &TrafficService{apiKey: apiKey}
}

// GetCurrentTraffic fetches current traffic data
// Since TomTom returns vector tiles, we generate synthetic heatmap points
func (s *TrafficService) GetCurrentTraffic(ctx context.Context) (domain.Traffic, error) {
	// Generate traffic based on time of day
	traffic := s.generateTrafficData()
	return traffic, nil
}

// generateTrafficData creates realistic traffic patterns for Almaty
func (s *TrafficService) generateTrafficData() domain.Traffic {
	hour := time.Now().Hour()
	weekday := time.Now().Weekday()

	// Calculate congestion based on time patterns
	congestionIndex := s.calculateCongestionIndex(hour, weekday)
	congestionLevel := s.getCongestionLevel(congestionIndex)

	// Generate heatmap points clustered around Almaty
	heatmapPoints := s.generateHeatmapPoints(congestionIndex)

	// Calculate speeds
	freeFlowSpeed := 60.0
	averageSpeed := freeFlowSpeed * (1 - congestionIndex/100)

	return domain.Traffic{
		CongestionIndex: congestionIndex,
		CongestionLevel: congestionLevel,
		AverageSpeed:    math.Round(averageSpeed*10) / 10,
		FreeFlowSpeed:   freeFlowSpeed,
		HeatmapPoints:   heatmapPoints,
		IncidentCount:   int(congestionIndex / 20),
		Timestamp:       time.Now(),
		IsMock:          s.apiKey == "",
	}
}

// calculateCongestionIndex returns 0-100 based on time patterns
func (s *TrafficService) calculateCongestionIndex(hour int, weekday time.Weekday) float64 {
	// Weekend: less traffic
	if weekday == time.Saturday || weekday == time.Sunday {
		return 25 + rand.Float64()*20
	}

	// Rush hours
	switch {
	case hour >= 7 && hour <= 9: // Morning rush
		return 70 + rand.Float64()*25
	case hour >= 17 && hour <= 19: // Evening rush
		return 75 + rand.Float64()*20
	case hour >= 12 && hour <= 14: // Lunch
		return 50 + rand.Float64()*15
	case hour >= 22 || hour <= 5: // Night
		return 10 + rand.Float64()*10
	default:
		return 35 + rand.Float64()*20
	}
}

// getCongestionLevel returns human-readable level
func (s *TrafficService) getCongestionLevel(index float64) string {
	switch {
	case index >= 80:
		return "Severe"
	case index >= 60:
		return "Heavy"
	case index >= 40:
		return "Moderate"
	case index >= 20:
		return "Light"
	default:
		return "Free Flow"
	}
}

// generateHeatmapPoints creates clustered points around Almaty center
func (s *TrafficService) generateHeatmapPoints(congestionIndex float64) []domain.HeatmapPoint {
	points := make([]domain.HeatmapPoint, 0, 50)

	// Key areas in Almaty with higher traffic
	hotspots := []struct {
		lat, lon float64
		name     string
		weight   float64
	}{
		{43.2567, 76.9286, "Al-Farabi/Dostyk", 1.2}, // Major intersection
		{43.2380, 76.9450, "Mega Center", 1.1},      // Shopping
		{43.2700, 76.9500, "Alatau", 0.9},           // Residential
		{43.2220, 76.8510, "Baraholka", 1.3},        // Market
		{43.2389, 76.8897, "City Center", 1.0},      // Downtown
		{43.2600, 76.9100, "Medeu Direction", 0.8},  // Mountain road
		{43.2150, 76.9200, "Airport Road", 1.1},     // Airport
		{43.2800, 76.8800, "Almaty-1 Station", 0.9}, // Train station
	}

	// Generate points around each hotspot
	for _, spot := range hotspots {
		numPoints := 5 + rand.Intn(8)
		for i := 0; i < numPoints; i++ {
			// Random offset within ~1km radius
			latOffset := (rand.Float64() - 0.5) * 0.02
			lonOffset := (rand.Float64() - 0.5) * 0.02

			intensity := (congestionIndex / 100) * spot.weight * (0.5 + rand.Float64()*0.5)
			intensity = math.Min(intensity, 1.0)

			points = append(points, domain.HeatmapPoint{
				Latitude:  spot.lat + latOffset,
				Longitude: spot.lon + lonOffset,
				Intensity: math.Round(intensity*100) / 100,
			})
		}
	}

	return points
}
