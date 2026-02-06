package domain

import "time"

// HeatmapPoint represents a single point for Deck.gl visualization
type HeatmapPoint struct {
	Latitude  float64 `json:"lat"`
	Longitude float64 `json:"lon"`
	Intensity float64 `json:"intensity"`
}

// Traffic represents traffic data with congestion metrics
type Traffic struct {
	CongestionIndex float64        `json:"congestion_index"`
	CongestionLevel string         `json:"congestion_level"`
	AverageSpeed    float64        `json:"average_speed_kmh"`
	FreeFlowSpeed   float64        `json:"free_flow_speed_kmh"`
	HeatmapPoints   []HeatmapPoint `json:"heatmap_points"`
	IncidentCount   int            `json:"incident_count"`
	Timestamp       time.Time      `json:"timestamp"`
	IsMock          bool           `json:"is_mock"`
}

// TrafficResponse wraps traffic data with metadata
type TrafficResponse struct {
	Data    Traffic `json:"data"`
	Success bool    `json:"success"`
	Message string  `json:"message,omitempty"`
}

// AlmatyCenter coordinates
const (
	AlmatyCenterLat = 43.2389
	AlmatyCenterLon = 76.8897
)
