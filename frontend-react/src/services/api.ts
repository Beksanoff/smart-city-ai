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

export interface RoadSegment {
    name: string
    path: [number, number][]  // [[lon,lat], ...] GeoJSON order
    congestion: number        // 0.0 (free) - 1.0 (blocked)
    speed: number             // current speed km/h
    free_flow: number         // free flow speed km/h
}

export interface Traffic {
    congestion_index: number
    congestion_level: string
    average_speed_kmh: number
    free_flow_speed_kmh: number
    road_segments: RoadSegment[]
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
    language?: string
}

export interface PredictionResponse {
    prediction: string
    confidence_score: number
    aqi_prediction: number
    traffic_index_prediction: number
    reasoning: string
    is_mock: boolean
}

export interface AnalyticsForecastDay {
    date: string
    temperature: number
    humidity: number
    wind_speed: number
    precipitation: number
    weather_code?: number | null
    aqi_api_mean?: number | null
    aqi_prediction: number
    traffic_prediction: number
    confidence: number
    risk_score: number
    source: string
}

export interface AnalyticsMonthlyOverview {
    month: number
    records: number
    temp_mean: number
    aqi_mean: number
    traffic_mean: number
    pm25_mean?: number | null
    high_aqi_pct: number
    high_traffic_pct: number
    combined_risk_pct: number
}

export interface AnalyticsData {
    metadata: {
        total_records: number
        date_range: {
            start: string | null
            end: string | null
        }
        history_period: string
    }
    monthly_overview: AnalyticsMonthlyOverview[]
    forecast_days: AnalyticsForecastDay[]
    correlations: Record<string, number>
}

export interface ApiResponse<T> {
    success: boolean
    data: T
    message?: string
}

// API Client
// Always use same-origin API proxy (/api) in browser builds.
// This avoids cross-origin/CSP issues and works on localhost and LAN devices.
const API_BASE_URL = ''

const apiClient: AxiosInstance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
})

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
            console.warn('Dashboard API unavailable, using mock data:', (error as Error)?.message)
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
            console.warn('Weather API unavailable, using mock data:', (error as Error)?.message)
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
            console.warn('Traffic API unavailable, using mock data:', (error as Error)?.message)
            return getMockTraffic()
        }
    },

    /**
     * Get AI prediction
     * Uses extended timeout (35s) because Go→Python→Groq LLM chain can take up to 30s.
     */
    predict: async (request: PredictionRequest): Promise<PredictionResponse> => {
        try {
            const response = await apiClient.post<ApiResponse<PredictionResponse>>(
                '/api/v1/predict', request, { timeout: 35000 },
            )
            return response.data.data
        } catch (error) {
            console.warn('Predict API error, using mock:', (error as Error)?.message)
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

    /**
     * Get historical weather data
     */
    getWeatherHistory: async (hours: number = 24): Promise<Weather[]> => {
        try {
            const response = await apiClient.get<{ success: boolean; data: Weather[]; count: number }>(
                `/api/v1/history/weather?hours=${hours}`
            )
            return response.data.data || []
        } catch {
            return []
        }
    },

    /**
     * Get historical traffic data
     */
    getTrafficHistory: async (hours: number = 24): Promise<Traffic[]> => {
        try {
            const response = await apiClient.get<{ success: boolean; data: Traffic[]; count: number }>(
                `/api/v1/history/traffic?hours=${hours}`
            )
            return response.data.data || []
        } catch {
            return []
        }
    },

    /**
     * Get ML stats (correlations, seasonal data)
     */
    getStats: async (): Promise<Record<string, unknown> | null> => {
        try {
            const response = await apiClient.get('/api/v1/stats')
            return response.data
        } catch {
            return null
        }
    },

    /**
     * Get analytics built from historical CSV data and forecast-driven predictions
     */
    getAnalytics: async (): Promise<AnalyticsData | null> => {
        try {
            const response = await apiClient.get<ApiResponse<AnalyticsData>>('/api/v1/analytics')
            return response.data.data
        } catch {
            return null
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
    const jitter = Math.random() * 10 - 5 // symmetric [-5, +5)
    const congestionIndex = Math.min(100, Math.max(0, baseCongestion + jitter))

    return {
        congestion_index: congestionIndex,
        congestion_level: getCongestionLevel(congestionIndex),
        average_speed_kmh: 60 * (1 - congestionIndex / 100),
        free_flow_speed_kmh: 60,
        road_segments: generateMockRoadSegments(congestionIndex),
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

    ALMATY_ROADS.forEach(road => {
        const numPoints = 20 + Math.random() * 10
        for (let i = 0; i < numPoints; i++) {
            const t = i / numPoints
            const lat = road.x1 + t * (road.x2 - road.x1) + (Math.random() - 0.5) * 0.003
            const lon = road.y1 + t * (road.y2 - road.y1) + (Math.random() - 0.5) * 0.003
            const intensity = (congestionIndex / 100) * (0.6 + Math.random() * 0.4)
            points.push({ lat, lon, intensity })
        }
    })

    return points
}

function generateMockRoadSegments(congestionIndex: number): RoadSegment[] {
    return ALMATY_ROADS.map(road => {
        const variation = (Math.random() - 0.5) * 0.3
        const congestion = Math.max(0, Math.min(1, congestionIndex / 100 + variation))
        const numPoints = 15
        const path: [number, number][] = []
        for (let i = 0; i < numPoints; i++) {
            const t = i / (numPoints - 1)
            const lat = road.x1 + t * (road.x2 - road.x1)
            const lon = road.y1 + t * (road.y2 - road.y1)
            path.push([lon, lat]) // GeoJSON order
        }
        return {
            name: road.name,
            path,
            congestion: Math.round(congestion * 100) / 100,
            speed: Math.round(60 * (1 - congestion) * 10) / 10,
            free_flow: 60,
        }
    })
}

// Major Almaty roads for mock data
const ALMATY_ROADS = [
    { name: 'Al-Farabi Ave', x1: 43.2065, y1: 76.843, x2: 43.219, y2: 76.962 },
    { name: 'Abay Ave', x1: 43.238, y1: 76.845, x2: 43.2425, y2: 76.962 },
    { name: 'Rayimbek Ave', x1: 43.254, y1: 76.85, x2: 43.2575, y2: 76.97 },
    { name: 'Tole Bi St', x1: 43.261, y1: 76.852, x2: 43.264, y2: 76.965 },
    { name: 'Satpayev St', x1: 43.234, y1: 76.865, x2: 43.236, y2: 76.955 },
    { name: 'Zhandosov St', x1: 43.219, y1: 76.85, x2: 43.222, y2: 76.94 },
    { name: 'Timiryazev St', x1: 43.272, y1: 76.865, x2: 43.275, y2: 76.95 },
    { name: 'VOKR (Ring)', x1: 43.288, y1: 76.855, x2: 43.292, y2: 76.96 },
    { name: 'Dostyk Ave', x1: 43.202, y1: 76.958, x2: 43.268, y2: 76.953 },
    { name: 'Seifullin Ave', x1: 43.22, y1: 76.931, x2: 43.305, y2: 76.936 },
    { name: 'Sain Ave', x1: 43.2, y1: 76.85, x2: 43.285, y2: 76.855 },
    { name: 'Nauryzbay Batyr', x1: 43.22, y1: 76.944, x2: 43.285, y2: 76.946 },
    { name: 'Furmanov St', x1: 43.21, y1: 76.949, x2: 43.275, y2: 76.951 },
    { name: 'Zharokov St', x1: 43.215, y1: 76.909, x2: 43.27, y2: 76.911 },
    { name: 'Gagarin Ave', x1: 43.202, y1: 76.884, x2: 43.25, y2: 76.886 },
    { name: 'Rozybakiev St', x1: 43.21, y1: 76.869, x2: 43.26, y2: 76.871 },
    { name: 'Abylay Khan Ave', x1: 43.23, y1: 76.939, x2: 43.29, y2: 76.941 },
    { name: 'Momyshuly Ave', x1: 43.21, y1: 76.839, x2: 43.275, y2: 76.841 },
    { name: 'Ryskulov St', x1: 43.279, y1: 76.86, x2: 43.281, y2: 76.97 },
    { name: 'BAKAD (South)', x1: 43.193, y1: 76.84, x2: 43.2, y2: 76.98 },
]

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
    const lang = (typeof document !== 'undefined' ? document.documentElement.lang : 'ru').slice(0, 2)

    const text = {
        ru: {
            winter: 'Зимние условия в Алматы: Высокий смог из-за угольного отопления. Рекомендуется оставаться в помещении и использовать маски N95 на улице.',
            summer: 'Летние условия в Алматы: Хорошее качество воздуха. Идеальные условия для прогулок.',
            reasoning: 'Основано на исторических сезонных данных Алматы',
        },
        en: {
            winter: 'Winter conditions in Almaty: elevated smog due to coal heating. It is recommended to stay indoors and use N95 masks outside.',
            summer: 'Summer conditions in Almaty: good air quality and comfortable conditions for outdoor activity.',
            reasoning: 'Based on historical seasonal patterns in Almaty',
        },
        kk: {
            winter: 'Алматыдағы қысқы жағдай: көмір жағуға байланысты смог жоғары. Сыртта N95 маскасын қолдану және үйде көбірек болу ұсынылады.',
            summer: 'Алматыдағы жазғы жағдай: ауа сапасы жақсы, серуендеуге қолайлы.',
            reasoning: 'Алматы бойынша тарихи маусымдық деректер негізінде',
        },
    } as const

    const locale = text[lang as keyof typeof text] || text.ru

    return {
        prediction: isWinter ? locale.winter : locale.summer,
        confidence_score: 0.75,
        aqi_prediction: isWinter ? 160 : 45,
        traffic_index_prediction: isWinter ? 65 : 50,
        reasoning: locale.reasoning,
        is_mock: true,
    }
}

export default api
