package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand/v2"
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
		cacheTTL:   15 * time.Minute, // 15 min to stay within TomTom free-tier (2,500/day)
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
// Expanded network: ~25 major roads covering the full city grid
var almatyRoadPoints = []struct {
	name               string
	queryLat, queryLon float64
	startLat, startLon float64
	endLat, endLon     float64
}{
	// ===== East-West major arteries =====
	{"Al-Farabi Ave", 43.210, 76.900, 43.2065, 76.8430, 43.2190, 76.9620},
	{"Abay Ave", 43.240, 76.905, 43.2380, 76.8450, 43.2425, 76.9620},
	{"Rayimbek Ave", 43.255, 76.910, 43.2540, 76.8500, 43.2575, 76.9700},
	{"Tole Bi St", 43.262, 76.910, 43.2610, 76.8520, 43.2640, 76.9650},
	{"Gogol St", 43.268, 76.930, 43.2670, 76.8750, 43.2695, 76.9580},
	{"Zhibek Zholy Ave", 43.258, 76.930, 43.2570, 76.8900, 43.2590, 76.9600},
	{"Timiryazev St", 43.273, 76.920, 43.2720, 76.8650, 43.2750, 76.9500},
	{"Satpayev St", 43.235, 76.905, 43.2340, 76.8650, 43.2360, 76.9550},
	{"Zhandosov St", 43.220, 76.890, 43.2190, 76.8500, 43.2220, 76.9400},
	{"VOKR (Outer Ring)", 43.290, 76.920, 43.2880, 76.8550, 43.2920, 76.9600},

	// ===== North-South major arteries =====
	{"Dostyk Ave", 43.230, 76.957, 43.2020, 76.9580, 43.2680, 76.9530},
	{"Seifullin Ave", 43.260, 76.933, 43.2200, 76.9310, 43.3050, 76.9360},
	{"Sain Ave", 43.240, 76.852, 43.2000, 76.8500, 43.2850, 76.8550},
	{"Nauryzbay Batyr St", 43.255, 76.945, 43.2200, 76.9440, 43.2850, 76.9460},
	{"Furmanov St", 43.245, 76.950, 43.2100, 76.9490, 43.2750, 76.9510},
	{"Zharokov St", 43.240, 76.910, 43.2150, 76.9090, 43.2700, 76.9110},
	{"Gagarin Ave", 43.225, 76.885, 43.2020, 76.8840, 43.2500, 76.8860},
	{"Rozybakiev St", 43.230, 76.870, 43.2100, 76.8690, 43.2600, 76.8710},
	{"Abylay Khan Ave", 43.260, 76.940, 43.2300, 76.9390, 43.2900, 76.9410},
	{"Masanchi St", 43.248, 76.948, 43.2250, 76.9470, 43.2700, 76.9490},

	// ===== Ring / Bypass roads =====
	{"BAKAD (South)", 43.195, 76.910, 43.1930, 76.8400, 43.2000, 76.9800},
	{"Raiymbek-East", 43.257, 76.970, 43.2560, 76.9600, 43.2580, 77.0100},
	{"Ryskulov St", 43.280, 76.910, 43.2790, 76.8600, 43.2810, 76.9700},
	{"Momyshuly Ave", 43.240, 76.840, 43.2100, 76.8390, 43.2750, 76.8410},
}

// Almaty bounding box for incident queries
const (
	almatyMinLat = 43.15
	almatyMaxLat = 43.35
	almatyMinLon = 76.80
	almatyMaxLon = 77.00

	// Minimum free-flow speed baseline for Almaty roads.
	// TomTom reports conservatively low freeflow (~42 km/h) because it
	// factors in signals and intersections. Real free-flow on major
	// Almaty roads is 55-65 km/h. Using a higher baseline produces
	// congestion indices that match perceived congestion (e.g. 2GIS scores).
	minFreeFlowSpeedKmh = 55.0
)

// GetCurrentTraffic fetches real traffic data from TomTom API with cache
func (s *TrafficService) GetCurrentTraffic(ctx context.Context) (domain.Traffic, error) {
	// Check cache first (read lock)
	s.mu.RLock()
	if s.cachedData != nil && time.Now().Before(s.cacheExpiry) {
		cached := *s.cachedData
		s.mu.RUnlock()
		return cached, nil
	}
	s.mu.RUnlock()

	// Double-check under write lock to prevent thundering herd
	s.mu.Lock()
	if s.cachedData != nil && time.Now().Before(s.cacheExpiry) {
		cached := *s.cachedData
		s.mu.Unlock()
		return cached, nil
	}
	// Hold lock during fetch — only one goroutine fetches; others wait.
	defer s.mu.Unlock()

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

	// Cache the result (still under write lock)
	s.cachedData = &traffic
	s.cacheExpiry = time.Now().Add(s.cacheTTL)

	return traffic, nil
}

// fetchTomTomTraffic queries TomTom APIs for real traffic data
func (s *TrafficService) fetchTomTomTraffic(ctx context.Context) (domain.Traffic, error) {
	var totalCurrentSpeed, totalFreeFlowSpeed float64
	var roadCount int
	var heatmapPoints []domain.HeatmapPoint
	var roadSegments []domain.RoadSegment

	// Query flow data for each major road
	for _, road := range almatyRoadPoints {
		flow, err := s.queryFlowSegment(ctx, road.queryLat, road.queryLon)
		if err != nil {
			log.Printf("TomTom flow query failed for %s: %v", road.name, err)
			continue
		}

		currentSpeed := flow.FlowSegmentData.CurrentSpeed
		freeFlowSpd := flow.FlowSegmentData.FreeFlowSpeed
		// Use the higher of TomTom's freeflow and our Almaty baseline
		effectiveFreeFlow := math.Max(freeFlowSpd, minFreeFlowSpeedKmh)
		totalCurrentSpeed += currentSpeed
		totalFreeFlowSpeed += effectiveFreeFlow
		roadCount++

		congestion := 1.0 - (currentSpeed / math.Max(effectiveFreeFlow, 1))
		congestion = math.Max(0, math.Min(1, congestion))

		// Build road segment from real coordinates
		var path [][2]float64
		if len(flow.FlowSegmentData.Coordinates.Coordinate) > 0 {
			for _, coord := range flow.FlowSegmentData.Coordinates.Coordinate {
				path = append(path, [2]float64{coord.Longitude, coord.Latitude})
				// Also keep heatmap points for backward compat
				heatmapPoints = append(heatmapPoints, domain.HeatmapPoint{
					Latitude:  coord.Latitude,
					Longitude: coord.Longitude,
					Intensity: math.Max(0, math.Min(1, congestion+(rand.Float64()-0.5)*0.1)),
				})
			}
		} else {
			// Interpolate along road if no coordinates returned
			path = interpolatePath(road.startLat, road.startLon, road.endLat, road.endLon, 20)
			pts := s.interpolateRoadPoints(road.startLat, road.startLon, road.endLat, road.endLon, congestion)
			heatmapPoints = append(heatmapPoints, pts...)
		}

		if len(path) >= 2 {
			roadSegments = append(roadSegments, domain.RoadSegment{
				Name:       road.name,
				Path:       path,
				Congestion: math.Round(congestion*100) / 100,
				Speed:      math.Round(currentSpeed*10) / 10,
				FreeFlow:   math.Round(effectiveFreeFlow*10) / 10,
			})
		}
	}

	if roadCount == 0 {
		return domain.Traffic{}, fmt.Errorf("all TomTom flow queries failed")
	}

	avgCurrentSpeed := totalCurrentSpeed / float64(roadCount)
	avgFreeFlowSpeed := totalFreeFlowSpeed / float64(roadCount)

	// Raw linear ratio
	rawRatio := 1 - avgCurrentSpeed/math.Max(avgFreeFlowSpeed, 1)
	rawRatio = math.Max(0, math.Min(1, rawRatio))

	// Non-linear scaling: amplify mid-range congestion so that
	// 28 km/h avg (rawRatio ~0.49) maps to ~75% instead of ~49%.
	// Uses a power curve: scaled = 1 - (1-raw)^1.6
	// This makes the index feel closer to 2GIS / Yandex 10-point scale.
	scaled := 1 - math.Pow(1-rawRatio, 1.6)
	congestionIndex := scaled * 100
	congestionIndex = math.Max(0, math.Min(100, congestionIndex))

	// Fetch real incidents
	incidents := s.fetchTomTomIncidents(ctx)

	traffic := domain.Traffic{
		CongestionIndex: math.Round(congestionIndex*10) / 10,
		CongestionLevel: s.getCongestionLevel(congestionIndex),
		AverageSpeed:    math.Round(avgCurrentSpeed*10) / 10,
		FreeFlowSpeed:   math.Round(avgFreeFlowSpeed*10) / 10,
		RoadSegments:    roadSegments,
		HeatmapPoints:   heatmapPoints,
		Incidents:       incidents,
		IncidentCount:   len(incidents),
		Timestamp:       time.Now(),
		IsMock:          false,
	}

	log.Printf("TomTom traffic: congestion=%.1f%% (raw=%.1f%%), speed=%.1f/%.1f km/h, incidents=%d, segments=%d, heatmap=%d pts",
		congestionIndex, rawRatio*100, avgCurrentSpeed, avgFreeFlowSpeed, len(incidents), len(roadSegments), len(heatmapPoints))

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

// interpolatePath generates a path (array of [lon,lat] pairs) along a straight segment
func interpolatePath(startLat, startLon, endLat, endLon float64, numPoints int) [][2]float64 {
	path := make([][2]float64, numPoints)
	for i := 0; i < numPoints; i++ {
		t := float64(i) / float64(numPoints-1)
		lat := startLat + t*(endLat-startLat)
		lon := startLon + t*(endLon-startLon)
		path[i] = [2]float64{lon, lat} // GeoJSON order: [lon, lat]
	}
	return path
}

// generateTrafficData creates simulated traffic patterns for Almaty (fallback when API unavailable)
func (s *TrafficService) generateTrafficData() domain.Traffic {
	// Use proper timezone instead of hardcoded UTC+5
	loc, err := time.LoadLocation("Asia/Almaty")
	if err != nil {
		loc = time.FixedZone("Asia/Almaty", 5*3600)
	}
	localTime := time.Now().In(loc)
	hour := localTime.Hour()
	weekday := localTime.Weekday()

	// Calculate congestion based on time patterns
	congestionIndex := s.calculateCongestionIndex(hour, weekday)
	congestionLevel := s.getCongestionLevel(congestionIndex)

	// Calculate speeds
	freeFlowSpeed := 60.0
	averageSpeed := freeFlowSpeed * (1 - congestionIndex/100)

	// Generate heatmap points clustered around Almaty
	heatmapPoints := s.generateHeatmapPoints(congestionIndex)

	// Generate road segments for PathLayer rendering
	roadSegments := s.generateRoadSegments(congestionIndex, freeFlowSpeed)

	// Generate incidents (accidents, roadworks) based on congestion
	incidents := s.generateIncidents(congestionIndex)

	return domain.Traffic{
		CongestionIndex: congestionIndex,
		CongestionLevel: congestionLevel,
		AverageSpeed:    math.Round(averageSpeed*10) / 10,
		FreeFlowSpeed:   freeFlowSpeed,
		RoadSegments:    roadSegments,
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
	count := baseCount + rand.IntN(3)

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
		road := roads[rand.IntN(len(roads))]

		// Random position along the general road direction
		latOffset := (rand.Float64() - 0.5) * 0.05
		lonOffset := (rand.Float64() - 0.5) * 0.05

		incType := types[rand.IntN(len(types))]
		descList := descriptions[incType]
		desc := descList[rand.IntN(len(descList))]

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

// getCongestionLevel returns human-readable level.
// Thresholds calibrated to match 2GIS/Yandex-style 10-point scale:
//
//	 0-15  → Free Flow  (1-2 балла)
//	15-40  → Light      (3-4 балла)
//	40-60  → Moderate   (5-6 баллов)
//	60-80  → Heavy      (7-8 баллов)
//	80-100 → Severe     (9-10 баллов)
func (s *TrafficService) getCongestionLevel(index float64) string {
	switch {
	case index >= 80:
		return "Severe"
	case index >= 60:
		return "Heavy"
	case index >= 40:
		return "Moderate"
	case index >= 15:
		return "Light"
	default:
		return "Free Flow"
	}
}

// generateHeatmapPoints creates synthetic traffic points along major Almaty roads
func (s *TrafficService) generateHeatmapPoints(congestionIndex float64) []domain.HeatmapPoint {
	points := make([]domain.HeatmapPoint, 0)

	for _, road := range almatyRoadPoints {
		numPoints := 25 + rand.IntN(15)
		for i := 0; i < numPoints; i++ {
			t := float64(i) / float64(numPoints)
			lat := road.startLat + t*(road.endLat-road.startLat) + (rand.Float64()-0.5)*0.003
			lon := road.startLon + t*(road.endLon-road.startLon) + (rand.Float64()-0.5)*0.003
			baseIntensity := (congestionIndex / 100.0)
			intensity := baseIntensity * (0.6 + rand.Float64()*0.4)
			points = append(points, domain.HeatmapPoint{
				Latitude:  lat,
				Longitude: lon,
				Intensity: intensity,
			})
		}
	}

	return points
}

// generateRoadSegments creates road segments for PathLayer rendering (fallback)
func (s *TrafficService) generateRoadSegments(congestionIndex float64, freeFlowSpeed float64) []domain.RoadSegment {
	segments := make([]domain.RoadSegment, 0, len(almatyRoadPoints))

	for _, road := range almatyRoadPoints {
		// Each road has slightly different congestion
		variation := (rand.Float64() - 0.5) * 0.3
		roadCongestion := math.Max(0, math.Min(1, congestionIndex/100.0+variation))
		roadSpeed := freeFlowSpeed * (1 - roadCongestion)

		path := interpolatePath(road.startLat, road.startLon, road.endLat, road.endLon, 15)

		segments = append(segments, domain.RoadSegment{
			Name:       road.name,
			Path:       path,
			Congestion: math.Round(roadCongestion*100) / 100,
			Speed:      math.Round(roadSpeed*10) / 10,
			FreeFlow:   freeFlowSpeed,
		})
	}

	return segments
}
