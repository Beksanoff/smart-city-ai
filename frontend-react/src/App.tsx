import { useState, useCallback, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
    Cloud,
    Car,
    Brain,
    Activity,
    MapPin,
    Globe
} from 'lucide-react'
import { api } from './services/api'
import type { YandexTrafficScore } from './components/map/AlmatyMap'
import WeatherWidget from './components/dashboard/WeatherWidget'
import TrafficWidget from './components/dashboard/TrafficWidget'
import AQIWidget from './components/dashboard/AQIWidget'
import AlmatyMap from './components/map/AlmatyMap'
import TripPlanner from './components/dashboard/TripPlanner'
import AnalyticsDashboard from './components/analytics/AnalyticsDashboard'
import ErrorBoundary from './components/ErrorBoundary'

const LANG_OPTIONS = [
  { code: 'ru', label: 'Рус' },
  { code: 'en', label: 'Eng' },
  { code: 'kk', label: 'Қаз' },
] as const

type TabType = 'monitor' | 'planner' | 'analytics'

function App() {
    const { t, i18n } = useTranslation()
    const [activeTab, setActiveTab] = useState<TabType>('monitor')
    const [yandexScore, setYandexScore] = useState<YandexTrafficScore | null>(null)

    useEffect(() => {
        document.documentElement.lang = i18n.language
    }, [i18n.language])

    const setLang = (code: string) => {
        if (code === 'ru' || code === 'en' || code === 'kk') {
            i18n.changeLanguage(code)
            try { localStorage.setItem('smartcity_lang', code) } catch {}
        }
    }

    // Получение данных дашборда
    const { data: dashboardData, isLoading } = useQuery({
        queryKey: ['dashboard'],
        queryFn: api.getDashboard,
        refetchInterval: 30000,
    })

    // Callback: получаем балл пробок от Яндекса через карту
    const handleTrafficScore = useCallback((score: YandexTrafficScore) => {
        setYandexScore(score)
    }, [])

    // Переопределяем данные трафика, используя реальный балл Яндекса
    const trafficData = useMemo(() => {
        if (!dashboardData?.traffic) return undefined
        if (!yandexScore) return dashboardData.traffic

        return {
            ...dashboardData.traffic,
            congestion_index: yandexScore.congestionIndex,
            congestion_level: yandexScore.congestionLevel,
            average_speed_kmh: yandexScore.averageSpeed,
            free_flow_speed_kmh: yandexScore.freeFlowSpeed,
            yandex_score: yandexScore.level,
        }
    }, [dashboardData?.traffic, yandexScore])

    return (
        <div className="min-h-screen">
            {/* Шапка */}
            <header className="border-b border-cyber-border bg-cyber-dark/50 backdrop-blur-lg sticky top-0 z-50">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyber-cyan to-cyber-purple flex items-center justify-center">
                                <Activity className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold neon-text">{t('header.title')}</h1>
                                <p className="text-sm text-cyber-muted flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {t('header.subtitle')}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1 rounded-lg border border-cyber-border bg-cyber-dark/50 p-1">
                                <Globe className="w-4 h-4 text-cyber-muted shrink-0" />
                                {LANG_OPTIONS.map(({ code, label }) => (
                                    <button
                                        key={code}
                                        type="button"
                                        onClick={() => setLang(code)}
                                        className={`px-2 py-1 text-xs font-medium rounded transition-colors ${i18n.language === code ? 'bg-cyber-cyan/20 text-cyber-cyan' : 'text-cyber-muted hover:text-cyber-text'}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="w-2 h-2 rounded-full bg-green-500 live-pulse" />
                                <span className="text-cyber-muted">{t('common.onlineData')}</span>
                                {dashboardData?.weather.is_mock && (
                                    <span className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-500">
                                        {t('common.demoMode')}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Навигация по вкладкам */}
            <nav className="border-b border-cyber-border bg-cyber-dark/30">
                <div className="container mx-auto px-6">
                    <div className="flex gap-1">
                        <button
                            onClick={() => setActiveTab('monitor')}
                            className={`flex items-center gap-2 px-6 py-4 border-b-2 transition-all ${activeTab === 'monitor'
                                ? 'border-cyber-cyan text-cyber-cyan tab-active'
                                : 'border-transparent text-cyber-muted hover:text-cyber-text'
                                }`}
                        >
                            <Cloud className="w-4 h-4 shrink-0" />
                            <span className="truncate">{t('nav.monitor')}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('analytics')}
                            className={`flex items-center gap-2 px-6 py-4 border-b-2 transition-all ${activeTab === 'analytics'
                                ? 'border-pink-500 text-pink-500 tab-active'
                                : 'border-transparent text-cyber-muted hover:text-cyber-text'
                                }`}
                        >
                            <Activity className="w-4 h-4 shrink-0" />
                            <span className="truncate">{t('nav.analytics')}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('planner')}
                            className={`flex items-center gap-2 px-6 py-4 border-b-2 transition-all ${activeTab === 'planner'
                                ? 'border-cyber-purple text-cyber-purple tab-active'
                                : 'border-transparent text-cyber-muted hover:text-cyber-text'
                                }`}
                        >
                            <Brain className="w-4 h-4 shrink-0" />
                            <span className="truncate">{t('nav.planner')}</span>
                        </button>
                    </div>
                </div>
            </nav>

            {/* Основной контент */}
            <main className="container mx-auto px-6 py-8">
                {activeTab === 'monitor' && (
                    <div className="space-y-8">
                        {/* Сетка виджетов */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <WeatherWidget
                                data={dashboardData?.weather}
                                isLoading={isLoading}
                            />
                            <TrafficWidget
                                data={trafficData}
                                isLoading={isLoading}
                            />
                            <AQIWidget
                                aqi={dashboardData?.weather.aqi}
                                isLoading={isLoading}
                            />
                        </div>

                        {/* Карта */}
                        <ErrorBoundary>
                        <div className="cyber-card">
                            <div className="flex items-center justify-between mb-4 gap-2 min-w-0">
                                <h2 className="text-lg font-semibold flex items-center gap-2 truncate min-w-0">
                                    <Car className="w-5 h-5 text-cyber-cyan shrink-0" />
                                    {t('map.title')}
                                </h2>
                                <span className="text-sm text-cyber-muted shrink-0">
                                    {t('map.roadsTracked', { count: dashboardData?.traffic.road_segments?.length || 0 })}
                                </span>
                            </div>
                            <div className="h-[500px] rounded-lg overflow-hidden">
                                <AlmatyMap
                                    roadSegments={dashboardData?.traffic.road_segments || []}
                                    incidents={dashboardData?.traffic.incidents || []}
                                    onTrafficScore={handleTrafficScore}
                                />
                            </div>
                        </div>
                        </ErrorBoundary>
                    </div>
                )}

                {activeTab === 'analytics' && <ErrorBoundary><AnalyticsDashboard /></ErrorBoundary>}

                {activeTab === 'planner' && <ErrorBoundary><TripPlanner /></ErrorBoundary>}
            </main>

            {/* Подвал */}
            <footer className="border-t border-cyber-border bg-cyber-dark/30 py-6 mt-12">
                <div className="container mx-auto px-6 text-center text-cyber-muted text-sm">
                    <p>{t('footer.text')}</p>
                </div>
            </footer>
        </div>
    )
}

export default App
