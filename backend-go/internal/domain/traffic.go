package domain

import "time"

type HeatmapPoint struct {
	Latitude  float64 `json:"lat"`
	Longitude float64 `json:"lon"`
	Intensity float64 `json:"intensity"`
}

type RoadSegment struct {
	Name       string       `json:"name"`
	Path       [][2]float64 `json:"path"`
	Congestion float64      `json:"congestion"`
	Speed      float64      `json:"speed"`
	FreeFlow   float64      `json:"free_flow"`
}

type Incident struct {
	Latitude    float64 `json:"lat"`
	Longitude   float64 `json:"lon"`
	Type        string  `json:"type"`
	Description string  `json:"description"`
}

type Traffic struct {
	CongestionIndex float64        `json:"congestion_index"`
	CongestionLevel string         `json:"congestion_level"`
	AverageSpeed    float64        `json:"average_speed_kmh"`
	FreeFlowSpeed   float64        `json:"free_flow_speed_kmh"`
	RoadSegments    []RoadSegment  `json:"road_segments"`
	HeatmapPoints   []HeatmapPoint `json:"heatmap_points"`
	Incidents       []Incident     `json:"incidents"`
	IncidentCount   int            `json:"incident_count"`
	Timestamp       time.Time      `json:"timestamp"`
	IsMock          bool           `json:"is_mock"`
}

type TrafficResponse struct {
	Data    Traffic `json:"data"`
	Success bool    `json:"success"`
	Message string  `json:"message,omitempty"`
}


const (
	AlmatyCenterLat = 43.2389
	AlmatyCenterLon = 76.8897
)
