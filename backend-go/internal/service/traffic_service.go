package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/smartcity/backend/internal/domain"
)

// TrafficService handles traffic data fetching from TomTom and heatmap generation
type TrafficService struct {
	apiKey     string
	httpClient *http.Client

	// In-memory cache to respect TomTom API rate limits (2,500/day free)
	mu          sync.RWMutex
	cachedData  *domain.Traffic
	cacheExpiry time.Time
	cacheTTL    time.Duration
}

// NewTrafficService creates a new traffic service
func NewTrafficService(apiKey string) *TrafficService {
	return &TrafficService{
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 15 * time.Second},
		cacheTTL:   3 * time.Minute,
	}
}

// TomTom API response structs

type TomTomFlowResponse struct {
	FlowSegmentData struct {
		CurrentSpeed  float64 `json:"currentSpeed"`
		FreeFlowSpeed float64 `json:"freeFlowSpeed"`
		Confidence    float64 `json:"confidence"`
		RoadClosure   bool    `json:"roadClosure"`
		Coordinates   struct {
			Coordinate []struct {
				Latitude  float64 `json:"latitude"`
				Longitude float64 `json:"longitude"`
			} `json:"coordinate"`
		} `json:"coordinates"`
	} `json:"flowSegmentData"`
}

type TomTomIncidentResponse struct {
	Incidents []TomTomIncident `json:"incidents"`
}

type TomTomIncident struct {
	Type     string `json:"type"`
	Geometry struct {
		Type        string          `json:"type"`
		Coordinates json.RawMessage `json:"coordinates"`
	} `json:"geometry"`
	Properties struct {
		ID               string `json:"id"`
		IconCategory     int    `json:"iconCategory"`
		MagnitudeOfDelay int    `json:"magnitudeOfDelay"`
		From             string `json:"from,omitempty"`
		To               string `json:"to,omitempty"`
		Delay            int    `json:"delay"`
		Events           []struct {
			Description string `json:"description"`
			Code        int    `json:"code"`
		} `json:"events"`
	} `json:"properties"`
}

// Major Almaty road query points for TomTom Flow API
var almatyRoadPoints = []struct {
	name               string
	queryLat, queryLon float64
	startLat, startLon float64
	endLat, endLon     float64
}{
	{"Al-Farabi", 43.210, 76.900, 43.203, 76.850, 43.218, 76.955},
	{"Abay", 43.240, 76.905, 43.239, 76.850, 43.243, 76.960},
	{"Dostyk", 43.230, 76.957, 43.200, 76.960, 43.260, 76.955},
	{"Seifullin", 43.260, 76.933, 43.220, 76.932, 43.300, 76.935},
	{"Sain", 43.240, 76.852, 43.200, 76.850, 43.280, 76.855},
}

// Almaty bounding box for incident queries
const (
	almatyMinLat = 43.15
	almatyMaxLat = 43.35
	almatyMinLon = 76.80
	almatyMaxLon = 77.00
)

// GetCurrentTraffic fetches real traffic data from TomTom API with cache
func (s *TrafficService) GetCurrentTraffic(ctx context.Context) (domain.Traffic, error) {
	// Check cache first
	s.mu.RLock()
	if s.cachedData != nil && time.Now().Before(s.cacheExpiry) {
		cached := *s.cachedData
		s.mu.RUnlock()
		return cached, nil
	}
	s.mu.RUnlock()

	// No API key → fallback to simulation
	if s.apiKey == "" {
		log.Println("TomTom API key not set, using simulated traffic data")
		traffic := s.generateTrafficData()
		return traffic, nil
	}

	// Fetch real data from TomTom
	traffic, err := s.fetchTomTomTraffic(ctx)
	if err != nil {
		log.Printf("TomTom API error, falling back to simulation: %v", err)
		traffic = s.generateTrafficData()
		return traffic, nil
	}

	// Cache the result
	s.mu.Lock()
	s.cachedData = &traffic
	s.cacheExpiry = time.Now().Add(s.cacheTTL)
	s.mu.Unlock()

	return traffic, nil
}

// fetchTomTomTraffic queries TomTom APIs for real traffic data
func (s *TrafficService) fetchTomTomTraffic(ctx context.Context) (domain.Traffic, error) {
	var totalCurrentSpeed, totalFreeFlowSpeed float64
	var roadCount int
	var heatmapPoints []domain.HeatmapPoint

	// Query flow data for each major road
	for _, road := range almatyRoadPoints {
		flow, err := s.queryFlowSegment(ctx, road.queryLat, road.queryLon)
		if err != nil {
			log.Printf("TomTom flow query failed for %s: %v", road.name, err)
			continue
		}

		totalCurrentSpeed += flow.FlowSegmentData.CurrentSpeed
		totalFreeFlowSpeed += flow.FlowSegmentData.FreeFlowSpeed
		roadCount++

		// Build heatmap from real road coordinates returned by TomTom
		congestion := 1.0 - (flow.FlowSegmentData.CurrentSpeed / math.Max(flow.FlowSegmentData.FreeFlowSpeed, 1))
		if len(flow.FlowSegmentData.Coordinates.Coordinate) > 0 {
			for _, coord := range flow.FlowSegmentData.Coordinates.Coordinate {
				heatmapPoints = append(heatmapPoints, domain.HeatmapPoint{
					Latitude:  coord.Latitude,
					Longitude: coord.Longitude,
					Intensity: math.Max(0, math.Min(1, congestion+(rand.Float64()-0.5)*0.1)),
				})
			}
		} else {
			// Interpolate along road if no coordinates returned
			pts := s.interpolateRoadPoints(road.startLat, road.startLon, road.endLat, road.endLon, congestion)
			heatmapPoints = append(heatmapPoints, pts...)
		}
	}

	if roadCount == 0 {
		return domain.Traffic{}, fmt.Errorf("all TomTom flow queries failed")
	}

	avgCurrentSpeed := totalCurrentSpeed / float64(roadCount)
	avgFreeFlowSpeed := totalFreeFlowSpeed / float64(roadCount)
	congestionIndex := (1 - avgCurrentSpeed/math.Max(avgFreeFlowSpeed, 1)) * 100
	congestionIndex = math.Max(0, math.Min(100, congestionIndex))

	// Fetch real incidents
	incidents := s.fetchTomTomIncidents(ctx)

	traffic := domain.Traffic{
		CongestionIndex: math.Round(congestionIndex*10) / 10,
		CongestionLevel: s.getCongestionLevel(congestionIndex),
		AverageSpeed:    math.Round(avgCurrentSpeed*10) / 10,
		FreeFlowSpeed:   math.Round(avgFreeFlowSpeed*10) / 10,
		HeatmapPoints:   heatmapPoints,
		Incidents:       incidents,
		IncidentCount:   len(incidents),
		Timestamp:       time.Now(),
		IsMock:          false,
	}

	log.Printf("TomTom traffic: congestion=%.1f%%, speed=%.1f/%.1f km/h, incidents=%d, heatmap=%d pts",
		congestionIndex, avgCurrentSpeed, avgFreeFlowSpeed, len(incidents), len(heatmapPoints))

	return traffic, nil
}

// queryFlowSegment queries TomTom Traffic Flow for a single road point
func (s *TrafficService) queryFlowSegment(ctx context.Context, lat, lon float64) (*TomTomFlowResponse, error) {
	url := fmt.Sprintf(
		"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=%f,%f&key=%s&unit=KMPH&thickness=1",
		lat, lon, s.apiKey,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("TomTom Flow API returned status %d", resp.StatusCode)
	}

	var flowResp TomTomFlowResponse
	if err := json.NewDecoder(resp.Body).Decode(&flowResp); err != nil {
		return nil, fmt.Errorf("failed to decode TomTom flow response: %w", err)
	}

	return &flowResp, nil
}

// fetchTomTomIncidents queries TomTom Traffic Incidents API v5 for Almaty area
func (s *TrafficService) fetchTomTomIncidents(ctx context.Context) []domain.Incident {
	url := fmt.Sprintf(
		"https://api.tomtom.com/traffic/services/5/incidentDetails?key=%s&bbox=%f,%f,%f,%f&language=ru-RU&categoryFilter=1,6,7,8,9,14&timeValidityFilter=present",
		s.apiKey, almatyMinLon, almatyMinLat, almatyMaxLon, almatyMaxLat,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		log.Printf("Failed to create incidents request: %v", err)
		return nil
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		log.Printf("TomTom Incidents API error: %v", err)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("TomTom Incidents API returned status %d", resp.StatusCode)
		return nil
	}

	var incResp TomTomIncidentResponse
	if err := json.NewDecoder(resp.Body).Decode(&incResp); err != nil {
		log.Printf("Failed to decode incidents response: %v", err)
		return nil
	}

	var incidents []domain.Incident
	for _, inc := range incResp.Incidents {
		lat, lon := s.extractIncidentPosition(inc)
		if lat == 0 && lon == 0 {
			continue
		}

		incidents = append(incidents, domain.Incident{
			Latitude:    lat,
			Longitude:   lon,
			Type:        s.mapTomTomCategory(inc.Properties.IconCategory),
			Description: s.buildIncidentDescription(inc),
		})
	}

	return incidents
}

// extractIncidentPosition gets the first coordinate from incident geometry
func (s *TrafficService) extractIncidentPosition(inc TomTomIncident) (float64, float64) {
	// TomTom uses [lon, lat] order in GeoJSON
	if inc.Geometry.Type == "Point" {
		var coords [2]float64
		if err := json.Unmarshal(inc.Geometry.Coordinates, &coords); err == nil {
			return coords[1], coords[0]
		}
	} else if inc.Geometry.Type == "LineString" {
		var coords [][2]float64
		if err := json.Unmarshal(inc.Geometry.Coordinates, &coords); err == nil && len(coords) > 0 {
			return coords[0][1], coords[0][0]
		}
	}
	return 0, 0
}

// mapTomTomCategory converts TomTom iconCategory to our incident type
func (s *TrafficService) mapTomTomCategory(category int) string {
	switch category {
	case 1, 14: // Accident, Broken Down Vehicle
		return "accident"
	case 9, 7, 8: // Road Works, Lane Closed, Road Closed
		return "roadwork"
	default: // Jam, other hazards
		return "police"
	}
}

// buildIncidentDescription creates a human-readable description
func (s *TrafficService) buildIncidentDescription(inc TomTomIncident) string {
	desc := ""
	if len(inc.Properties.Events) > 0 {
		desc = inc.Properties.Events[0].Description
	}
	if inc.Properties.From != "" {
		if desc != "" {
			desc += " — "
		}
		desc += inc.Properties.From
		if inc.Properties.To != "" {
			desc += " → " + inc.Properties.To
		}
	}
	if desc == "" {
		desc = s.mapTomTomCategory(inc.Properties.IconCategory)
	}
	return desc
}

// interpolateRoadPoints generates heatmap points along a road segment (fallback)
func (s *TrafficService) interpolateRoadPoints(x1, y1, x2, y2, congestion float64) []domain.HeatmapPoint {
	numPoints := 30
	points := make([]domain.HeatmapPoint, 0, numPoints)
	for i := 0; i < numPoints; i++ {
		t := float64(i) / float64(numPoints)
		lat := x1 + t*(x2-x1) + (rand.Float64()-0.5)*0.002
		lon := y1 + t*(y2-y1) + (rand.Float64()-0.5)*0.002
		intensity := math.Max(0, math.Min(1, congestion+(rand.Float64()-0.5)*0.15))
		points = append(points, domain.HeatmapPoint{
			Latitude:  lat,
			Longitude: lon,
			Intensity: intensity,
		})
	}
	return points
}

// generateTrafficData creates simulated traffic patterns for Almaty (fallback when API unavailable)
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
		IsMock:          true,
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
