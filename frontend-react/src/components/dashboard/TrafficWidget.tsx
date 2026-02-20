import { Car, AlertTriangle, Gauge, TrendingDown } from 'lucide-react'
import type { Traffic } from '../../services/api'

interface TrafficData extends Traffic {
    yandex_score?: number
}

interface TrafficWidgetProps {
    data?: TrafficData
    isLoading?: boolean
}

function TrafficWidget({ data, isLoading }: TrafficWidgetProps) {
    if (isLoading || !data) {
        return (
            <div className="cyber-card animate-pulse">
                <div className="h-32 bg-cyber-border rounded-lg" />
            </div>
        )
    }

    const translateLevel = (level: string) => {
        const translations: Record<string, string> = {
            'free flow': 'Свободно',
            'light': 'Легкие пробки',
            'moderate': 'Умеренные пробки',
            'heavy': 'Сильные пробки',
            'severe': 'Критические пробки',
        }
        return translations[level.toLowerCase()] || level
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
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h3 className="text-sm text-cyber-muted mb-1">Трафик</h3>
                    <p className={`font-semibold ${getTrafficColor(data.congestion_level)}`}>
                        {translateLevel(data.congestion_level)}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {data.yandex_score != null && (
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] text-cyber-muted">Яндекс</span>
                            <span className={`text-lg font-bold font-mono ${
                                data.yandex_score <= 3 ? 'text-green-400' :
                                data.yandex_score <= 6 ? 'text-yellow-400' :
                                data.yandex_score <= 8 ? 'text-orange-400' :
                                'text-red-400'
                            }`}>{data.yandex_score}</span>
                            <span className="text-[10px] text-cyber-muted">баллов</span>
                        </div>
                    )}
                    <div className="w-12 h-12 rounded-lg bg-cyber-border flex items-center justify-center">
                        <Car className="w-6 h-6 text-cyber-cyan" />
                    </div>
                </div>
            </div>

            {/* Индекс загруженности */}
            <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                    <span className="text-cyber-muted">Индекс загруженности</span>
                    <span className="font-mono font-bold text-cyber-cyan">
                        {Math.round(data.congestion_index)}%
                    </span>
                </div>
                <div className="h-3 bg-cyber-border rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full bg-gradient-to-r ${getProgressColor(data.congestion_index)} transition-all duration-500`}
                        style={{ width: `${data.congestion_index}%` }}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-cyber-cyan" />
                    <span className="text-cyber-muted">Ср. скорость</span>
                    <span className="ml-auto">{Math.round(data.average_speed_kmh)} км/ч</span>
                </div>
                <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-cyber-purple" />
                    <span className="text-cyber-muted">Норма</span>
                    <span className="ml-auto">{data.free_flow_speed_kmh} км/ч</span>
                </div>
                <div className="flex items-center gap-2 col-span-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    <span className="text-cyber-muted">Инциденты</span>
                    <span className="ml-auto">{data.incident_count} зарегистрировано</span>
                </div>
            </div>

            {/* Источник данных */}
            <div className="mt-4 pt-3 border-t border-cyber-border text-[11px] text-cyber-muted">
                {data.yandex_score != null
                    ? '📊 Данные: Яндекс Карты (реальное время)'
                    : data.is_mock
                        ? '⚠️ Данные: симуляция (нет API-ключа)'
                        : '📊 Данные: TomTom Traffic Flow'
                }
            </div>
        </div>
    )
}

export default TrafficWidget
