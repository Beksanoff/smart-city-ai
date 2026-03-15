import { Car, AlertTriangle, Gauge, TrendingDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Traffic } from '../../services/api'

interface TrafficData extends Traffic {
    yandex_score?: number
}

interface TrafficWidgetProps {
    data?: TrafficData
    isLoading?: boolean
}

function TrafficWidget({ data, isLoading }: TrafficWidgetProps) {
    const { t } = useTranslation()

    if (isLoading || !data) {
        return (
            <div className="cyber-card animate-pulse">
                <div className="h-64 bg-cyber-border rounded-lg" />
            </div>
        )
    }

    const congestionRaw = Number.isFinite(data.congestion_index) ? data.congestion_index : 0
    const congestionValue = Math.max(0, Math.min(100, congestionRaw))
    const avgSpeedValue = Number.isFinite(data.average_speed_kmh) ? data.average_speed_kmh : 0
    const freeFlowValue = Number.isFinite(data.free_flow_speed_kmh) ? data.free_flow_speed_kmh : 0
    const incidentsCount = Number.isFinite(data.incident_count) ? Math.max(0, data.incident_count) : 0

    const translateLevel = (level: string) => {
        const key = `trafficLevel.${level.toLowerCase()}`
        const translated = t(key)
        return typeof translated === 'string' && translated !== key ? translated : level
    }

    const getTrafficColor = (level: string) => {
        switch (level.toLowerCase()) {
            case 'free flow': return 'traffic-free'
            case 'light': return 'traffic-light'
            case 'moderate': return 'traffic-moderate'
            case 'heavy': return 'traffic-heavy'
            case 'severe': return 'traffic-severe'
            default: return 'text-cyber-text'
        }
    }

    const getProgressColor = (index: number) => {
        if (index < 15) return 'from-green-500 to-green-400'
        if (index < 40) return 'from-yellow-500 to-yellow-400'
        if (index < 60) return 'from-orange-500 to-orange-400'
        if (index < 80) return 'from-red-500 to-red-400'
        return 'from-red-700 to-red-600'
    }

    return (
        <div className="cyber-card">
            <div className="flex items-start justify-between mb-4 gap-2 min-w-0">
                <div className="min-w-0">
                    <h3 className="text-sm text-cyber-muted mb-1">{t('traffic.title')}</h3>
                    <p className={`font-semibold truncate ${getTrafficColor(data.congestion_level)}`}>
                        {translateLevel(data.congestion_level)}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {data.yandex_score != null && (
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] text-cyber-muted">{t('traffic.yandex')}</span>
                            <span className={`text-lg font-bold font-mono ${
                                data.yandex_score <= 3 ? 'text-green-400' :
                                data.yandex_score <= 6 ? 'text-yellow-400' :
                                data.yandex_score <= 8 ? 'text-orange-400' :
                                'text-red-400'
                            }`}>{data.yandex_score}</span>
                            <span className="text-[10px] text-cyber-muted">{t('traffic.points')}</span>
                        </div>
                    )}
                    <div className="w-12 h-12 rounded-lg bg-cyber-border flex items-center justify-center">
                        <Car className="w-6 h-6 text-cyber-cyan" />
                    </div>
                </div>
            </div>

            {/* Индекс загруженности */}
            <div className="mb-6">
                <div className="flex justify-between text-sm mb-2 gap-2 min-w-0">
                    <span className="text-cyber-muted truncate">{t('traffic.congestionIndex')}</span>
                    <span className="font-mono font-bold text-cyber-cyan shrink-0">
                        {Math.round(congestionValue)}%
                    </span>
                </div>
                <div className="h-3 bg-cyber-border rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full bg-gradient-to-r ${getProgressColor(congestionValue)} transition-all duration-500`}
                        style={{ width: `${congestionValue}%` }}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                    <Gauge className="w-4 h-4 text-cyber-cyan shrink-0" />
                    <span className="text-cyber-muted truncate">{t('traffic.avgSpeed')}</span>
                    <span className="ml-auto shrink-0">{Math.round(avgSpeedValue)} {t('traffic.kmh')}</span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                    <TrendingDown className="w-4 h-4 text-cyber-purple shrink-0" />
                    <span className="text-cyber-muted truncate">{t('traffic.norm')}</span>
                    <span className="ml-auto shrink-0">{freeFlowValue} {t('traffic.kmh')}</span>
                </div>
                <div className="flex items-center gap-2 col-span-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                    <span className="text-cyber-muted truncate">{t('traffic.incidents')}</span>
                    <span className="ml-auto shrink-0">{t('traffic.incidentsCount', { count: incidentsCount })}</span>
                </div>
            </div>

            <div className="mt-4 pt-3 border-t border-cyber-border text-[11px] text-cyber-muted break-words">
                {data.yandex_score != null ? t('traffic.dataYandex') : data.is_mock ? t('traffic.dataSimulation') : t('traffic.dataTomTom')}
            </div>
        </div>
    )
}

export default TrafficWidget
