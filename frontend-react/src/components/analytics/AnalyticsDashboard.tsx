import { BarChart3, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import AQIHistoryChart from './AQIHistoryChart'
import TrafficByHourChart from './TrafficByHourChart'
import CorrelationChart from './CorrelationChart'

export default function AnalyticsDashboard() {
    const { t } = useTranslation()

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-2 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyber-purple to-pink-500 flex items-center justify-center shrink-0">
                    <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                    <h2 className="text-xl font-bold neon-text truncate">{t('analytics.title')}</h2>
                    <p className="text-sm text-cyber-muted truncate">{t('analytics.subtitle')}</p>
                </div>
            </div>

            {/* Top row: AQI + Traffic side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2 min-w-0">
                    <AQIHistoryChart />
                    <div className="flex items-start gap-1.5 px-2">
                        <Info className="w-3.5 h-3.5 text-cyber-muted shrink-0 mt-0.5" />
                        <p className="text-[11px] text-cyber-muted leading-relaxed">
                            {t('analytics.footnoteAqi')}
                        </p>
                    </div>
                </div>
                <div className="space-y-2 min-w-0">
                    <TrafficByHourChart />
                    <div className="flex items-start gap-1.5 px-2">
                        <Info className="w-3.5 h-3.5 text-cyber-muted shrink-0 mt-0.5" />
                        <p className="text-[11px] text-cyber-muted leading-relaxed">
                            {t('analytics.footnoteTraffic')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Bottom row: Correlation full-width */}
            <div className="space-y-2 min-w-0">
                <CorrelationChart />
                <div className="flex items-start gap-1.5 px-2">
                    <Info className="w-3.5 h-3.5 text-cyber-muted shrink-0 mt-0.5" />
                    <p className="text-[11px] text-cyber-muted leading-relaxed">
                        {t('analytics.footnoteCorrelation')}
                    </p>
                </div>
            </div>
        </div>
    )
}
