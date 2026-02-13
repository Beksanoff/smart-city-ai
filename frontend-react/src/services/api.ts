/**
 * API Service
 * Typed API calls to the Go backend
 */

import axios, { AxiosInstance } from 'axios'

// Types
export interface Weather {
    temperature: number
    feels_like: number
    humidity: number
    description: string
    icon: string
    wind_speed: number
    visibility: number
    pressure: number
    aqi: number
    city: string
    country: string
    timestamp: string
    is_mock: boolean
}

export interface HeatmapPoint {
    lat: number
    lon: number
    intensity: number
}

export interface Incident {
    lat: number
    lon: number
    type: 'accident' | 'roadwork' | 'police'
    description: string
}

export interface Traffic {
    congestion_index: number
    congestion_level: string
    average_speed_kmh: number
    free_flow_speed_kmh: number
    heatmap_points: HeatmapPoint[]
    incidents: Incident[]
    incident_count: number
    timestamp: string
    is_mock: boolean
}

export interface DashboardData {
    weather: Weather
    traffic: Traffic
    timestamp: string
}

export interface PredictionRequest {
    date?: string
    temperature?: number
    query?: string
}

export interface PredictionResponse {
    prediction: string
    confidence_score: number
    aqi_prediction: number
    traffic_index_prediction: number
    reasoning: string
    is_mock: boolean
}

export interface ApiResponse<T> {
    success: boolean
    data: T
    message?: string
}

// API Client
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const apiClient: AxiosInstance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
})

// Error handler
// Error handler (unused)
// const handleApiError = (error: AxiosError) => { ... }

// API Functions
export const api = {
    /**
     * Get aggregated dashboard data (weather + traffic)
     */
    getDashboard: async (): Promise<DashboardData> => {
        try {
            const response = await apiClient.get<ApiResponse<DashboardData>>('/api/v1/dashboard')
            return response.data.data
        } catch (error) {
            // Return mock data on error for development
            return getMockDashboardData()
        }
    },

    /**
     * Get current weather
     */
    getWeather: async (): Promise<Weather> => {
        try {
            const response = await apiClient.get<ApiResponse<Weather>>('/api/v1/weather')
            return response.data.data
        } catch (error) {
            return getMockWeather()
        }
    },

    /**
     * Get current traffic with heatmap
     */
    getTraffic: async (): Promise<Traffic> => {
        try {
            const response = await apiClient.get<ApiResponse<Traffic>>('/api/v1/traffic')
            return response.data.data
        } catch (error) {
            return getMockTraffic()
        }
    },

    /**
     * Get AI prediction
     */
    predict: async (request: PredictionRequest): Promise<PredictionResponse> => {
        try {
            const response = await apiClient.post<ApiResponse<PredictionResponse>>('/api/v1/predict', request)
            return response.data.data
        } catch (error) {
            return getMockPrediction()
        }
    },

    /**
     * Health check
     */
    healthCheck: async (): Promise<boolean> => {
        try {
            await apiClient.get('/health')
            return true
        } catch {
            return false
        }
    },
}

// Mock data functions for development/demo
function getMockWeather(): Weather {
    const month = new Date().getMonth() + 1
    const isWinter = month >= 12 || month <= 2

    return {
        temperature: isWinter ? -8 : 26,
        feels_like: isWinter ? -15 : 28,
        humidity: 65,
        description: isWinter ? 'Light snow' : 'Clear sky',
        icon: '04d',
        wind_speed: 3.5,
        visibility: 8000,
        pressure: 1015,
        aqi: isWinter ? 165 : 45,
        city: 'Almaty',
        country: 'KZ',
        timestamp: new Date().toISOString(),
        is_mock: true,
    }
}

function getMockTraffic(): Traffic {
    const hour = new Date().getHours() // Browser time is already local
    const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)

    // Add jitter so it doesn't hang on a static value
    const baseCongestion = isRushHour ? 75 : 40
    const jitter = Math.random() * 15 - 5 // +/- 5-10
    const congestionIndex = Math.min(100, Math.max(0, baseCongestion + jitter))

    return {
        congestion_index: congestionIndex,
        congestion_level: getCongestionLevel(congestionIndex),
        average_speed_kmh: 60 * (1 - congestionIndex / 100),
        free_flow_speed_kmh: 60,
        heatmap_points: generateMockHeatmapPoints(congestionIndex),
        incidents: generateMockIncidents(congestionIndex),
        incident_count: Math.floor(congestionIndex / 25),
        timestamp: new Date().toISOString(),
        is_mock: true,
    }
}

function getCongestionLevel(index: number): string {
    if (index >= 80) return 'Severe'
    if (index >= 60) return 'Heavy'
    if (index >= 40) return 'Moderate'
    if (index >= 20) return 'Light'
    return 'Free Flow'
}

function generateMockIncidents(congestionIndex: number): Incident[] {
    const incidents: Incident[] = []
    const count = Math.floor(congestionIndex / 15) + 1
    const center = { lat: 43.2389, lon: 76.8897 }

    for (let i = 0; i < count; i++) {
        incidents.push({
            lat: center.lat + (Math.random() - 0.5) * 0.1,
            lon: center.lon + (Math.random() - 0.5) * 0.1,
            type: Math.random() > 0.7 ? 'accident' : (Math.random() > 0.5 ? 'roadwork' : 'police'),
            description: 'Mock incident'
        })
    }
    return incidents
}

function generateMockHeatmapPoints(congestionIndex: number): HeatmapPoint[] {
    const points: HeatmapPoint[] = []

    // Major Almaty Streets (startLat, startLon, endLat, endLon)
    const roads = [
        { name: "Al-Farabi", x1: 43.203, y1: 76.850, x2: 43.218, y2: 76.955 },
        { name: "Abay", x1: 43.239, y1: 76.850, x2: 43.243, y2: 76.960 },
        { name: "Dostyk", x1: 43.200, y1: 76.960, x2: 43.260, y2: 76.955 },
        { name: "Seifullin", x1: 43.220, y1: 76.932, x2: 43.300, y2: 76.935 },
        { name: "Sain", x1: 43.200, y1: 76.850, x2: 43.280, y2: 76.855 },
    ]

    roads.forEach(road => {
        const numPoints = 30 + Math.random() * 20
        for (let i = 0; i < numPoints; i++) {
            const t = i / numPoints
            const lat = road.x1 + t * (road.x2 - road.x1) + (Math.random() - 0.5) * 0.004
            const lon = road.y1 + t * (road.y2 - road.y1) + (Math.random() - 0.5) * 0.004

            // Intensity varies along the road
            const intensity = (congestionIndex / 100) * (0.6 + Math.random() * 0.4)

            points.push({
                lat: lat,
                lon: lon,
                intensity: intensity,
            })
        }
    })

    return points
}

function getMockDashboardData(): DashboardData {
    return {
        weather: getMockWeather(),
        traffic: getMockTraffic(),
        timestamp: new Date().toISOString(),
    }
}

function getMockPrediction(): PredictionResponse {
    const month = new Date().getMonth() + 1
    const isWinter = month >= 12 || month <= 2

    return {
        prediction: isWinter
            ? 'Зимние условия в Алматы: Высокий смог из-за угольного отопления. Рекомендуется оставаться в помещении и использовать маски N95 на улице.'
            : 'Летние условия в Алматы: Хорошее качество воздуха. Идеальные условия для прогулок.',
        confidence_score: 0.75,
        aqi_prediction: isWinter ? 160 : 45,
        traffic_index_prediction: isWinter ? 65 : 50,
        reasoning: 'Основано на исторических сезонных данных Алматы',
        is_mock: true,
    }
}

export default api
