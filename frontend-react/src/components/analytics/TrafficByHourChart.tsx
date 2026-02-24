import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceLine
} from 'recharts'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../../services/api'
import { Car } from 'lucide-react'

export default function TrafficByHourChart() {
    const { t } = useTranslation()
    const { data: trafficHistory, isLoading } = useQuery({
        queryKey: ['trafficHistory', 24],
        queryFn: () => api.getTrafficHistory(24),
        refetchInterval: 5 * 60_000,
    })

    const { data, hasFallback } = useMemo(() => {
        if (trafficHistory && trafficHistory.length > 0) {
            const byHour: Record<number, { total: number; count: number }> = {}
            for (let h = 0; h < 24; h++) {
                byHour[h] = { total: 0, count: 0 }
            }
            trafficHistory.forEach((tr) => {
                const hour = new Date(tr.timestamp).getHours()
                byHour[hour].total += tr.congestion_index
                byHour[hour].count += 1
            })
            return {
                data: Array.from({ length: 24 }, (_, i) => ({
                    hour: `${String(i).padStart(2, '0')}:00`,
                    congestion: byHour[i].count > 0
                        ? Math.round(byHour[i].total / byHour[i].count)
                        : 0,
                })),
                hasFallback: false,
            }
        }

        const HOURLY_PATTERN = [
            12, 8, 6, 5, 7, 15, 35, 72, 85, 68,
            52, 55, 62, 58, 50, 55, 68, 82, 78, 55,
            40, 30, 22, 15
        ]
        return {
            data: HOURLY_PATTERN.map((base, i) => ({
                hour: `${String(i).padStart(2, '0')}:00`,
                congestion: base,
            })),
            hasFallback: true,
        }
    }, [trafficHistory])

    const getBarColor = (value: number) => {
        if (value > 70) return '#ef4444'
        if (value > 50) return '#f97316'
        if (value > 30) return '#f59e0b'
        return '#10b981'
    }

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null
        const value = payload[0]?.value
        return (
            <div className="bg-cyber-dark border border-cyber-border rounded-lg px-3 py-2 shadow-lg">
                <p className="text-xs text-cyber-muted mb-1">{label}</p>
                <p className="text-sm font-semibold" style={{ color: getBarColor(value) }}>
                    {t('analytics.trafficPercent', { value })}
                </p>
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

            {/* Color legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[11px]">
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                    {t('analytics.trafficLow')}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 shrink-0" />
                    {t('analytics.trafficMid')}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                    {t('analytics.trafficHigh')}
                </span>
                {hasFallback && !isLoading && (
                    <span className="text-yellow-500 ml-auto">
                        ⚠ {t('analytics.trafficFallback')}
                    </span>
                )}
            </div>

            {isLoading && (
                <div className="mb-2">
                    <span className="text-xs text-cyber-muted animate-pulse">{t('common.loading')}</span>
                </div>
            )}

            <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f1f2e" />
                        <XAxis
                            dataKey="hour"
                            stroke="#6b7280"
                            tick={{ fontSize: 11 }}
                            interval={2}
                        />
                        <YAxis
                            stroke="#6b7280"
                            tick={{ fontSize: 11 }}
                            domain={[0, 100]}
                            tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#18181b' }} />
                        <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} strokeOpacity={0.5} />
                        <Bar dataKey="congestion" radius={[3, 3, 0, 0]} maxBarSize={20}>
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={getBarColor(entry.congestion)}
                                    fillOpacity={0.85}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
