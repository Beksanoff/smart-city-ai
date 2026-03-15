package service

import (
	"testing"
)

func TestPm25ToAQI(t *testing.T) {
	tests := []struct {
		name     string
		pm25     float64
		expected int
	}{
		// Zero and negative
		{"zero", 0.0, 0},
		{"negative returns 0", -5.0, 0},

		// Good (0-9.0 -> AQI 0-50)
		{"low good", 3.0, 17},
		{"mid good", 5.0, 28},
		{"top of good", 9.0, 50},

		// Truncation edge case: 9.05 truncates to 9.0
		{"9.05 truncates to 9.0", 9.05, 50},

		// Moderate (9.1-35.4 -> AQI 51-100)
		{"start of moderate", 9.1, 51},
		{"mid moderate", 20.0, 71},
		{"top of moderate", 35.4, 100},

		// Unhealthy for Sensitive (35.5-55.4 -> AQI 101-150)
		{"start USG", 35.5, 101},
		{"mid USG", 45.0, 124},
		{"top USG", 55.4, 150},

		// Unhealthy (55.5-125.4 -> AQI 151-200)
		{"start unhealthy", 55.5, 151},
		{"mid unhealthy", 90.0, 175},
		{"top unhealthy", 125.4, 200},

		// Very Unhealthy (125.5-225.4 -> AQI 201-300)
		{"start very unhealthy", 125.5, 201},
		{"top very unhealthy", 225.4, 300},

		// Hazardous lower (225.5-325.4 -> AQI 301-400)
		{"start hazardous", 225.5, 301},
		{"top hazardous lower", 325.4, 400},

		// Hazardous upper (325.5-500.4 -> AQI 401-500)
		{"start hazardous upper", 325.5, 401},
		{"top hazardous upper", 500.4, 500},

		// Beyond scale -> capped at 500
		{"above 500.4 capped", 600.0, 500},
		{"way above capped", 1000.0, 500},

		// Boundary: exactly at breakpoint boundaries
		{"exactly 9.1", 9.1, 51},
		{"exactly 35.5", 35.5, 101},
		{"exactly 55.5", 55.5, 151},
		{"exactly 125.5", 125.5, 201},
		{"exactly 225.5", 225.5, 301},
		{"exactly 325.5", 325.5, 401},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := pm25ToAQI(tt.pm25)
			if got != tt.expected {
				t.Errorf("pm25ToAQI(%v) = %d, want %d", tt.pm25, got, tt.expected)
			}
		})
	}
}

func TestPm25ToAQI_Monotonic(t *testing.T) {
	// AQI should be monotonically non-decreasing as PM2.5 increases
	prev := 0
	for pm25 := 0.0; pm25 <= 500.0; pm25 += 0.1 {
		aqi := pm25ToAQI(pm25)
		if aqi < prev {
			t.Errorf("AQI decreased from %d to %d at PM2.5=%.1f", prev, aqi, pm25)
		}
		prev = aqi
	}
}

func TestPm25ToAQI_Range(t *testing.T) {
	// AQI should always be in [0, 500]
	for pm25 := -10.0; pm25 <= 600.0; pm25 += 0.5 {
		aqi := pm25ToAQI(pm25)
		if aqi < 0 || aqi > 500 {
			t.Errorf("pm25ToAQI(%v) = %d, out of range [0, 500]", pm25, aqi)
		}
	}
}
