import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Car } from 'lucide-react'
import type { AnalyticsMonthlyOverview } from '../../services/api'

interface TrafficByHourChartProps {
    monthlyOverview: AnalyticsMonthlyOverview[]
    isLoading: boolean
}

const MONTH_KEYS = [
    'chart.monthJan',
    'chart.monthFeb',
    'chart.monthMar',
    'chart.monthApr',
    'chart.monthMay',
    'chart.monthJun',
    'chart.monthJul',
    'chart.monthAug',
    'chart.monthSep',
    'chart.monthOct',
    'chart.monthNov',
    'chart.monthDec',
] as const

export default function TrafficByHourChart({ monthlyOverview, isLoading }: TrafficByHourChartProps) {
    const { t } = useTranslation()

    const data = useMemo(() => (
        monthlyOverview.map((monthData) => ({
            ...monthData,
            monthLabel: t(MONTH_KEYS[monthData.month - 1]),
        }))
    ), [monthlyOverview, t])

    const hasData = data.length > 0

    const CustomTooltip = ({
        active,
        payload,
        label,
    }: {
        active?: boolean
        payload?: Array<{ color?: string; name?: string | number; value?: number }>
        label?: string
    }) => {
        if (!active || !payload?.length) return null
        return (
            <div className="bg-cyber-dark border border-cyber-border rounded-lg px-3 py-2 shadow-lg">
                <p className="text-xs text-cyber-muted mb-1">{label}</p>
                {payload.map((item, index) => (
                    <p key={index} className="text-sm" style={{ color: item.color }}>
                        {item.name}: <span className="font-semibold">{item.value}%</span>
                    </p>
                ))}
            </div>
        )
    }

    return (
        <div className="cyber-card flex flex-col overflow-hidden">
            <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                    <Car className="w-5 h-5 text-cyber-purple" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-cyber-text truncate">
                        {t('analytics.trafficByHourTitle')}
                    </h3>
                    <p className="text-xs text-cyber-muted mt-0.5 leading-relaxed">
                        {t('analytics.trafficByHourDescription')}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[11px]">
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm shrink-0 bg-orange-500" />
                    {t('analytics.riskAqiDays')}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm shrink-0 bg-cyber-purple" />
                    {t('analytics.riskTrafficDays')}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm shrink-0 bg-red-500" />
                    {t('analytics.riskCombinedDays')}
                </span>
            </div>

            {isLoading && (
                <div className="mb-2">
                    <span className="text-xs text-cyber-muted animate-pulse">{t('common.loading')}</span>
                </div>
            )}

            <div className="h-[300px]">
                {hasData ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f2e" />
                            <XAxis
                                dataKey="monthLabel"
                                stroke="#6b7280"
                                tick={{ fontSize: 11 }}
                                interval={0}
                            />
                            <YAxis
                                stroke="#6b7280"
                                tick={{ fontSize: 11 }}
                                domain={[0, 100]}
                                tickFormatter={(value) => `${value}%`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="high_aqi_pct" name={t('analytics.riskAqiDays')} fill="#f97316" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="high_traffic_pct" name={t('analytics.riskTrafficDays')} fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="combined_risk_pct" name={t('analytics.riskCombinedDays')} fill="#ef4444" radius={[3, 3, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                ) : !isLoading ? (
                    <div className="flex flex-col items-center justify-center h-[300px] text-center px-4">
                        <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
                            <Car className="w-8 h-8 text-yellow-500/50" />
                        </div>
                        <p className="text-sm text-yellow-500 font-medium mb-1">
                            {t('analytics.noDataTitle')}
                        </p>
                        <p className="text-xs text-cyber-muted max-w-[280px] leading-relaxed">
                            {t('analytics.noDataHint')}
                        </p>
                    </div>
                ) : null}
            </div>
        </div>
    )
}
