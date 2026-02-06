import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    Cloud,
    Car,
    Brain,
    Activity,
    MapPin
} from 'lucide-react'
import { api } from './services/api'
import WeatherWidget from './components/dashboard/WeatherWidget'
import TrafficWidget from './components/dashboard/TrafficWidget'
import AQIWidget from './components/dashboard/AQIWidget'
import AlmatyMap from './components/map/AlmatyMap'
import TripPlanner from './components/dashboard/TripPlanner'

type TabType = 'monitor' | 'planner'

function App() {
    const [activeTab, setActiveTab] = useState<TabType>('monitor')

    // Получение данных дашборда
    const { data: dashboardData, isLoading } = useQuery({
        queryKey: ['dashboard'],
        queryFn: api.getDashboard,
        refetchInterval: 30000,
    })

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
                                <h1 className="text-xl font-bold neon-text">Умный Город AI</h1>
                                <p className="text-sm text-cyber-muted flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    Система мониторинга Алматы
                                </p>
                            </div>
                        </div>

                        {/* Индикатор данных */}
                        <div className="flex items-center gap-2 text-sm">
                            <span className="w-2 h-2 rounded-full bg-green-500 live-pulse" />
                            <span className="text-cyber-muted">Онлайн данные</span>
                            {dashboardData?.weather.is_mock && (
                                <span className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-500">
                                    Демо режим
                                </span>
                            )}
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
                            <Cloud className="w-4 h-4" />
                            Мониторинг
                        </button>
                        <button
                            onClick={() => setActiveTab('planner')}
                            className={`flex items-center gap-2 px-6 py-4 border-b-2 transition-all ${activeTab === 'planner'
                                ? 'border-cyber-purple text-cyber-purple tab-active'
                                : 'border-transparent text-cyber-muted hover:text-cyber-text'
                                }`}
                        >
                            <Brain className="w-4 h-4" />
                            Планировщик
                        </button>
                    </div>
                </div>
            </nav>

            {/* Основной контент */}
            <main className="container mx-auto px-6 py-8">
                {activeTab === 'monitor' ? (
                    <div className="space-y-8">
                        {/* Сетка виджетов */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <WeatherWidget
                                data={dashboardData?.weather}
                                isLoading={isLoading}
                            />
                            <TrafficWidget
                                data={dashboardData?.traffic}
                                isLoading={isLoading}
                            />
                            <AQIWidget
                                aqi={dashboardData?.weather.aqi}
                                isLoading={isLoading}
                            />
                        </div>

                        {/* Карта */}
                        <div className="cyber-card">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <Car className="w-5 h-5 text-cyber-cyan" />
                                    Тепловая карта трафика
                                </h2>
                                <span className="text-sm text-cyber-muted">
                                    {dashboardData?.traffic.heatmap_points.length || 0} точек данных
                                </span>
                            </div>
                            <div className="h-[500px] rounded-lg overflow-hidden">
                                <AlmatyMap
                                    heatmapPoints={dashboardData?.traffic.heatmap_points || []}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <TripPlanner />
                )}
            </main>

            {/* Подвал */}
            <footer className="border-t border-cyber-border bg-cyber-dark/30 py-6 mt-12">
                <div className="container mx-auto px-6 text-center text-cyber-muted text-sm">
                    <p>Умный Город AI • Дипломный проект 2026 • Алматы, Казахстан</p>
                </div>
            </footer>
        </div>
    )
}

export default App
