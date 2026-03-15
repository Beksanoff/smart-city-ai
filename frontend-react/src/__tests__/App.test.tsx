import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// ---------------------------------------------------------------------------
// Mock heavy child components so tests stay fast & don't hit real APIs
// ---------------------------------------------------------------------------

vi.mock('../components/dashboard/WeatherWidget', () => ({
    default: () => <div data-testid="weather-widget">WeatherWidget</div>,
}))
vi.mock('../components/dashboard/TrafficWidget', () => ({
    default: () => <div data-testid="traffic-widget">TrafficWidget</div>,
}))
vi.mock('../components/dashboard/AQIWidget', () => ({
    default: () => <div data-testid="aqi-widget">AQIWidget</div>,
}))
vi.mock('../components/map/AlmatyMap', () => ({
    default: () => <div data-testid="almaty-map">AlmatyMap</div>,
}))
vi.mock('../components/dashboard/TripPlanner', () => ({
    default: () => <div data-testid="trip-planner">TripPlanner</div>,
}))
vi.mock('../components/analytics/AnalyticsDashboard', () => ({
    default: () => <div data-testid="analytics-dashboard">AnalyticsDashboard</div>,
}))
vi.mock('../components/ErrorBoundary', () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock react-query to return loading state by default
vi.mock('@tanstack/react-query', () => ({
    useQuery: () => ({ data: undefined, isLoading: true }),
    QueryClient: vi.fn(),
    QueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Import AFTER mocks are set up
import App from '../App'

// i18n is initialized on import; the default language is 'ru'
// We import it so the module is evaluated
import '../i18n'

describe('App', () => {
    beforeEach(() => {
        // Reset DOM lang attribute
        document.documentElement.lang = ''
    })

    it('renders the header title', () => {
        render(<App />)
        // Default language is 'ru', header.title = 'Умный Город AI'
        expect(screen.getByText('Умный Город AI')).toBeInTheDocument()
    })

    it('renders all three navigation tabs', () => {
        render(<App />)
        // Nav texts depend on current language (ru by default)
        // In Russian: 'Мониторинг', 'Аналитика', 'Планировщик'
        const nav = document.querySelector('nav')
        expect(nav).toBeInTheDocument()
        // There should be exactly 3 tab buttons inside nav
        const buttons = nav!.querySelectorAll('button')
        expect(buttons.length).toBe(3)
    })

    it('renders language switcher with 3 options', () => {
        render(<App />)
        // Language buttons: Рус, Eng, Қаз
        expect(screen.getByText('Рус')).toBeInTheDocument()
        expect(screen.getByText('Eng')).toBeInTheDocument()
        expect(screen.getByText('Қаз')).toBeInTheDocument()
    })

    it('shows monitor tab content by default', () => {
        render(<App />)
        // Monitor tab should show weather, traffic, AQI widgets
        expect(screen.getByTestId('weather-widget')).toBeInTheDocument()
        expect(screen.getByTestId('traffic-widget')).toBeInTheDocument()
        expect(screen.getByTestId('aqi-widget')).toBeInTheDocument()
    })

    it('switches to analytics tab on click', () => {
        render(<App />)
        const nav = document.querySelector('nav')!
        const buttons = nav.querySelectorAll('button')
        // Second button is analytics
        fireEvent.click(buttons[1])
        expect(screen.getByTestId('analytics-dashboard')).toBeInTheDocument()
    })

    it('switches to planner tab on click', () => {
        render(<App />)
        const nav = document.querySelector('nav')!
        const buttons = nav.querySelectorAll('button')
        // Third button is planner
        fireEvent.click(buttons[2])
        expect(screen.getByTestId('trip-planner')).toBeInTheDocument()
    })

    it('renders footer text', () => {
        render(<App />)
        // Footer contains diploma text
        const footer = document.querySelector('footer')
        expect(footer).toBeInTheDocument()
    })
})
