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
	// Almaty is UTC+5, Docker container is UTC
	localTime := time.Now().Add(5 * time.Hour)
	hour := localTime.Hour()
	weekday := localTime.Weekday()

	// Calculate congestion based on time patterns
	congestionIndex := s.calculateCongestionIndex(hour, weekday)
	congestionLevel := s.getCongestionLevel(congestionIndex)

	// Generate heatmap points clustered around Almaty
	heatmapPoints := s.generateHeatmapPoints(congestionIndex)

	// Generate incidents (accidents, roadworks) based on congestion
	incidents := s.generateIncidents(congestionIndex)

	// Calculate speeds
	freeFlowSpeed := 60.0
	averageSpeed := freeFlowSpeed * (1 - congestionIndex/100)

	return domain.Traffic{
		CongestionIndex: congestionIndex,
		CongestionLevel: congestionLevel,
		AverageSpeed:    math.Round(averageSpeed*10) / 10,
		FreeFlowSpeed:   freeFlowSpeed,
		HeatmapPoints:   heatmapPoints,
		Incidents:       incidents,
		IncidentCount:   len(incidents),
		Timestamp:       time.Now(),
		IsMock:          s.apiKey == "",
	}
}

// generateIncidents creates random road events based on traffic density
func (s *TrafficService) generateIncidents(congestionIndex float64) []domain.Incident {
	incidents := make([]domain.Incident, 0)

	// Higher congestion = more incidents
	baseCount := int(congestionIndex / 15)
	count := baseCount + rand.Intn(3)

	types := []string{"accident", "roadwork", "police"}
	descriptions := map[string][]string{
		"accident": {"Minor collision", "Stalled vehicle", "Rear-end collision", "Multi-car accident"},
		"roadwork": {"Pothole repair", "Lane closure", "Utility work"},
		"police":   {"Speed trap", "Traffic control", "Checkpoint"},
	}

	// Major roads for realistic placement
	roads := []struct {
		name     string
		lat, lon float64
	}{
		{"Al-Farabi", 43.203, 76.850},
		{"Abay", 43.239, 76.850},
		{"Dostyk", 43.264, 76.960},
		{"Seifullin", 43.270, 76.932},
		{"Sain", 43.220, 76.850},
	}

	for i := 0; i < count; i++ {
		road := roads[rand.Intn(len(roads))]

		// Random position along the general road direction
		latOffset := (rand.Float64() - 0.5) * 0.05
		lonOffset := (rand.Float64() - 0.5) * 0.05

		incType := types[rand.Intn(len(types))]
		descList := descriptions[incType]
		desc := descList[rand.Intn(len(descList))]

		incidents = append(incidents, domain.Incident{
			Latitude:    road.lat + latOffset,
			Longitude:   road.lon + lonOffset,
			Type:        incType,
			Description: desc + " on " + road.name,
		})
	}

	return incidents
}

// calculateCongestionIndex returns 0-100 based on time patterns
func (s *TrafficService) calculateCongestionIndex(hour int, weekday time.Weekday) float64 {
	// Weekend: less traffic
	if weekday == time.Saturday || weekday == time.Sunday {
		return 25 + rand.Float64()*20
	}

	// Rush hours
	// Rush hours
	switch {
	case hour >= 7 && hour <= 9: // Morning rush
		// Peak variability: 65-95
		return 65 + rand.Float64()*30
	case hour >= 17 && hour <= 19: // Evening rush
		// Peak variability: 70-95
		return 70 + rand.Float64()*25
	case hour >= 12 && hour <= 14: // Lunch
		return 45 + rand.Float64()*20
	case hour >= 22 || hour <= 5: // Night
		return 5 + rand.Float64()*15
	default:
		// Normal traffic
		return 30 + rand.Float64()*25
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

// generateHeatmapPoints creates synthetic traffic points along major Almaty roads
func (s *TrafficService) generateHeatmapPoints(congestionIndex float64) []domain.HeatmapPoint {
	points := make([]domain.HeatmapPoint, 0)

	// Major Almaty Streets (name, startLat, startLon, endLat, endLon)
	roads := []struct {
		name           string
		x1, y1, x2, y2 float64
	}{
		{"Al-Farabi", 43.203, 76.850, 43.218, 76.955}, // East-West major
		{"Abay", 43.239, 76.850, 43.243, 76.960},      // Central East-West
		{"Dostyk", 43.200, 76.960, 43.260, 76.955},    // North-South
		{"Seifullin", 43.220, 76.932, 43.300, 76.935}, // North-South
		{"Sain", 43.200, 76.850, 43.280, 76.855},      // West Ring
	}

	rand.Seed(time.Now().UnixNano())

	for _, road := range roads {
		// Generate points along each road
		numPoints := 40 + rand.Intn(20) // 40-60 points per road

		for i := 0; i < numPoints; i++ {
			// Linear interpolation with jitter
			t := float64(i) / float64(numPoints)
			lat := road.x1 + t*(road.x2-road.x1) + (rand.Float64()-0.5)*0.003
			lon := road.y1 + t*(road.y2-road.y1) + (rand.Float64()-0.5)*0.003

			// Intensity based on congestion index and road "load"
			baseIntensity := (congestionIndex / 100.0)
			intensity := baseIntensity * (0.6 + rand.Float64()*0.4) // Random variation

			points = append(points, domain.HeatmapPoint{
				Latitude:  lat,
				Longitude: lon,
				Intensity: intensity,
			})
		}
	}

	return points
}
