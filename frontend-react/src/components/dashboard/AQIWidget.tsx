import { Wind, Shield, AlertCircle, Skull } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface AQIWidgetProps {
    aqi?: number
    isLoading?: boolean
}

function AQIWidget({ aqi, isLoading }: AQIWidgetProps) {
    const { t } = useTranslation()

    if (isLoading || aqi === undefined) {
        return (
            <div className="cyber-card animate-pulse">
                <div className="h-64 bg-cyber-border rounded-lg" />
            </div>
        )
    }

    const getAQIInfo = (value: number) => {
        if (value <= 50) return {
            levelKey: 'aqi.good' as const,
            color: 'aqi-good',
            bg: 'bg-green-500/20',
            icon: Shield,
            adviceKey: 'aqi.adviceGood' as const,
        }
        if (value <= 100) return {
            levelKey: 'aqi.moderate' as const,
            color: 'aqi-moderate',
            bg: 'bg-yellow-500/20',
            icon: Wind,
            adviceKey: 'aqi.adviceModerate' as const,
        }
        if (value <= 150) return {
            levelKey: 'aqi.unhealthySensitive' as const,
            color: 'aqi-usg',
            bg: 'bg-orange-500/20',
            icon: AlertCircle,
            adviceKey: 'aqi.adviceUSG' as const,
        }
        if (value <= 200) return {
            levelKey: 'aqi.unhealthy' as const,
            color: 'aqi-unhealthy',
            bg: 'bg-red-500/20',
            icon: AlertCircle,
            adviceKey: 'aqi.adviceUnhealthy' as const,
        }
        if (value <= 300) return {
            levelKey: 'aqi.veryUnhealthy' as const,
            color: 'aqi-very-unhealthy',
            bg: 'bg-purple-500/20',
            icon: Skull,
            adviceKey: 'aqi.adviceVery' as const,
        }
        return {
            levelKey: 'aqi.hazardous' as const,
            color: 'aqi-hazardous',
            bg: 'bg-red-900/20',
            icon: Skull,
            adviceKey: 'aqi.adviceHazardous' as const,
        }
    }

    const safeAqi = Number.isFinite(aqi) ? Math.max(0, Math.min(500, aqi)) : 0
    const info = getAQIInfo(safeAqi)
    const Icon = info.icon
    const gaugePercent = Math.min((safeAqi / 500) * 100, 100)

    return (
        <div className="cyber-card">
            <div className="flex items-start justify-between mb-4 gap-2 min-w-0">
                <div className="min-w-0">
                    <h3 className="text-sm text-cyber-muted mb-1">{t('aqi.title')}</h3>
                    <p className={`font-semibold truncate ${info.color}`}>{t(info.levelKey)}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg ${info.bg} flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${info.color}`} />
                </div>
            </div>

            {/* Шкала AQI */}
            <div className="relative flex justify-center mb-4">
                <div className="relative w-40 h-20 overflow-hidden">
                    {/* SVG semicircular gauge */}
                    <svg viewBox="0 0 120 60" className="w-full h-full">
                        {/* Background arc */}
                        <path
                            d="M 10 55 A 50 50 0 0 1 110 55"
                            fill="none"
                            stroke="var(--cyber-border, #2a2a3e)"
                            strokeWidth="8"
                            strokeLinecap="round"
                        />
                        {/* Colored arc (proportional to AQI) */}
                        <path
                            d="M 10 55 A 50 50 0 0 1 110 55"
                            fill="none"
                            stroke={safeAqi <= 50 ? '#10b981' : safeAqi <= 100 ? '#f59e0b' : safeAqi <= 150 ? '#f97316' : safeAqi <= 200 ? '#ef4444' : '#8b5cf6'}
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={`${(gaugePercent / 100) * 157} 157`}
                            className="transition-all duration-500"
                        />
                    </svg>

                    {/* Центральное значение */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
                        <span className={`text-4xl font-bold ${info.color}`}>{safeAqi}</span>
                    </div>
                </div>
            </div>

            <p className="text-sm text-cyber-muted text-center break-words">{t(info.adviceKey)}</p>

            {/* Легенда шкалы AQI */}
            <div className="mt-4 flex justify-between text-xs">
                <span className="aqi-good">0</span>
                <span className="aqi-moderate">50</span>
                <span className="aqi-usg">100</span>
                <span className="aqi-unhealthy">150</span>
                <span className="aqi-very-unhealthy">200</span>
                <span className="aqi-very-unhealthy">300</span>
                <span className="aqi-hazardous">500</span>
            </div>
        </div>
    )
}

export default AQIWidget
