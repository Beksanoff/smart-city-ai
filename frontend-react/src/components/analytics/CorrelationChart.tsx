import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts'
import { Thermometer } from 'lucide-react'
import type { AnalyticsMonthlyOverview } from '../../services/api'

interface CorrelationChartProps {
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

export default function CorrelationChart({ monthlyOverview, isLoading }: CorrelationChartProps) {
    const { t } = useTranslation()

    const chartData = useMemo(() => (
        monthlyOverview.map((monthData) => ({
            month: t(MONTH_KEYS[monthData.month - 1]),
            temperature: Math.round(monthData.temp_mean),
            smog: Math.round(monthData.aqi_mean),
        }))
    ), [monthlyOverview, t])

    const hasData = chartData.length > 0

    const CustomTooltip = ({
        active,
        payload,
        label,
    }: {
        active?: boolean
        payload?: Array<{ color?: string; name?: string | number; value?: number; dataKey?: string | number }>
        label?: string
    }) => {
        if (!active || !payload?.length) return null
        return (
            <div className="bg-cyber-dark border border-cyber-border rounded-lg px-3 py-2 shadow-lg">
                <p className="text-xs text-cyber-muted mb-1.5 font-medium">{label}</p>
                {payload.map((item, index) => (
                    <p key={index} className="text-sm" style={{ color: item.color }}>
                        {item.name}: <span className="font-semibold">{item.value}{item.dataKey === 'temperature' ? '°C' : ''}</span>
                    </p>
                ))}
            </div>
        )
    }

    return (
        <div className="cyber-card flex flex-col overflow-hidden">
            <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                    <Thermometer className="w-5 h-5 text-orange-400" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-cyber-text truncate">
                        {t('analytics.correlationTitle')}
                    </h3>
                    <p className="text-xs text-cyber-muted mt-0.5 leading-relaxed">
                        {t('analytics.correlationDescription')}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-[11px]">
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: '#8b5cf6' }} />
                    {t('chart.smogAqi')}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-5 h-[3px] rounded-full shrink-0" style={{ background: '#f59e0b' }} />
                    {t('chart.temperature')}
                </span>
            </div>

            {isLoading && (
                <div className="mb-2">
                    <span className="text-xs text-cyber-muted animate-pulse">{t('common.loading')}</span>
                </div>
            )}

            <div className="h-[320px]">
                {hasData ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 5, right: 35, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f2e" />
                            <XAxis dataKey="month" stroke="#6b7280" tick={{ fontSize: 11 }} interval={0} />
                            <YAxis yAxisId="left" stroke="#8b5cf6" tick={{ fontSize: 11 }} width={40} />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                stroke="#f59e0b"
                                tick={{ fontSize: 11 }}
                                width={40}
                                tickFormatter={(value) => `${value}°`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar
                                yAxisId="left"
                                dataKey="smog"
                                barSize={18}
                                fill="#8b5cf6"
                                name={t('chart.smogAqi')}
                                radius={[3, 3, 0, 0]}
                                fillOpacity={0.8}
                            />
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="temperature"
                                stroke="#f59e0b"
                                strokeWidth={2.5}
                                name={t('chart.temperature')}
                                dot={{ fill: '#f59e0b', r: 3, strokeWidth: 0 }}
                                activeDot={{ r: 5, stroke: '#f59e0b', strokeWidth: 2, fill: '#0a0a0f' }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                ) : !isLoading ? (
                    <div className="flex flex-col items-center justify-center h-[320px] text-center px-4">
                        <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
                            <Thermometer className="w-8 h-8 text-yellow-500/50" />
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
