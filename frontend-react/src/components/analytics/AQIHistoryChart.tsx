import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts'
import { api } from '../../services/api'
import { Wind } from 'lucide-react'

const DAY_KEYS = ['chart.daySun', 'chart.dayMon', 'chart.dayTue', 'chart.dayWed', 'chart.dayThu', 'chart.dayFri', 'chart.daySat'] as const

export default function AQIHistoryChart() {
    const { t } = useTranslation()
    const { data: weatherHistory, isLoading } = useQuery({
        queryKey: ['weatherHistory', 168],
        queryFn: () => api.getWeatherHistory(168),
        refetchInterval: 5 * 60_000,
    })

    const chartData = useMemo(() => {
        if (!weatherHistory || weatherHistory.length === 0) return null

        const byDay: Record<string, { total: number; count: number; dayIndex: number; date: string }> = {}
        weatherHistory.forEach((w) => {
            const d = new Date(w.timestamp)
            const key = d.toISOString().slice(0, 10)
            if (!byDay[key]) {
                byDay[key] = { total: 0, count: 0, dayIndex: d.getDay(), date: key }
            }
            byDay[key].total += w.aqi
            byDay[key].count += 1
        })

        return Object.entries(byDay)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-7)
            .map(([, v]) => ({
                day: t(DAY_KEYS[v.dayIndex]),
                aqi: Math.round(v.total / v.count),
                date: v.date,
            }))
    }, [weatherHistory, t])

    const hasData = chartData !== null && chartData.length > 0

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null
        return (
            <div className="bg-cyber-dark border border-cyber-border rounded-lg px-3 py-2 shadow-lg">
                <p className="text-xs text-cyber-muted mb-1">{label}</p>
                <p className="text-sm font-semibold" style={{ color: payload[0]?.value > 100 ? '#ef4444' : '#22d3ee' }}>
                    {t('analytics.aqiValue', { value: payload[0]?.value })}
                </p>
            </div>
        )
    }

    return (
        <div className="cyber-card flex flex-col overflow-hidden">
            <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                    <Wind className="w-5 h-5 text-cyber-cyan" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-cyber-text truncate">
                        {t('analytics.aqiHistoryTitle')}
                    </h3>
                    <p className="text-xs text-cyber-muted mt-0.5 leading-relaxed">
                        {t('analytics.aqiHistoryDescription')}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[11px]">
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                    {t('analytics.legendGood')}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 shrink-0" />
                    {t('analytics.legendModerate')}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
                    {t('analytics.legendBad')}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                    {t('analytics.legendDangerous')}
                </span>
            </div>

            {isLoading && (
                <div className="mb-2">
                    <span className="text-xs text-cyber-muted animate-pulse">{t('common.loading')}</span>
                </div>
            )}

            <div className="h-[280px]">
                {hasData ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                            <defs>
                                <linearGradient id="aqiGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f2e" />
                            <XAxis dataKey="day" stroke="#6b7280" tick={{ fontSize: 12 }} />
                            <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} domain={[0, 'auto']} />
                            <Tooltip content={<CustomTooltip />} />
                            <ReferenceLine
                                y={100}
                                stroke="#ef4444"
                                strokeDasharray="4 4"
                                strokeWidth={1.5}
                                label={{ value: t('analytics.aqiDanger'), position: 'right', fill: '#ef4444', fontSize: 11 }}
                            />
                            <Area
                                type="monotone"
                                dataKey="aqi"
                                stroke="#22d3ee"
                                strokeWidth={2.5}
                                fill="url(#aqiGradient)"
                                dot={{ fill: '#22d3ee', r: 4, strokeWidth: 2, stroke: '#0a0a0f' }}
                                activeDot={{ r: 6, stroke: '#22d3ee', strokeWidth: 2, fill: '#0a0a0f' }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : !isLoading ? (
                    <div className="flex flex-col items-center justify-center h-[280px] text-center px-4">
                        <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
                            <Wind className="w-8 h-8 text-yellow-500/50" />
                        </div>
                        <p className="text-sm text-yellow-500 font-medium mb-1">
                            {t('analytics.dataCollecting')}
                        </p>
                        <p className="text-xs text-cyber-muted max-w-[280px] leading-relaxed">
                            {t('analytics.dataCollectingHint')}
                        </p>
                    </div>
                ) : null}
            </div>
        </div>
    )
}
