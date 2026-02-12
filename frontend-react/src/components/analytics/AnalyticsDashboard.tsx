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
                    <p className="text-sm text-cyber-muted">Исторические тренды и корреляции (Mock Data)</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AQIHistoryChart />
                <TrafficByHourChart />
                <div className="lg:col-span-2">
                    <CorrelationChart />
                </div>
            </div>
        </div>
    )
}
