import { BarChart3 } from 'lucide-react'
import AQIHistoryChart from './AQIHistoryChart'
import TrafficByHourChart from './TrafficByHourChart'
import CorrelationChart from './CorrelationChart'

export default function AnalyticsDashboard() {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyber-purple to-pink-500 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h2 className="text-xl font-bold neon-text">Аналитика</h2>
                    <p className="text-sm text-cyber-muted">Исторические тренды и корреляции</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <AQIHistoryChart />
                    <p className="text-xs text-cyber-muted px-4">
                        * Показатели выше 100 считаются вредными для чувствительных групп.
                    </p>
                </div>
                <div className="space-y-2">
                    <TrafficByHourChart />
                    <p className="text-xs text-cyber-muted px-4">
                        * Пиковые часы: 08:00-09:00 и 18:00-19:00. Планируйте поездки заранее.
                    </p>
                </div>
                <div className="lg:col-span-2 space-y-2">
                    <CorrelationChart />
                    <p className="text-xs text-cyber-muted px-4">
                        * График показывает зависимость концентрации PM2.5 от снижения температуры (инверсия).
                    </p>
                </div>
            </div>
        </div>
    )
}
