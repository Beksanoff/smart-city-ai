import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts'
import { api } from '../../services/api'
import { Thermometer } from 'lucide-react'

interface StatsData {
    success?: boolean
    data?: {
        monthly?: Record<string, {
            temp_mean: number
            aqi_mean: number
            pm25_mean: number
        }>
    }
}

const MONTH_KEYS = ['chart.monthJan', 'chart.monthFeb', 'chart.monthMar', 'chart.monthApr', 'chart.monthMay', 'chart.monthJun',
    'chart.monthJul', 'chart.monthAug', 'chart.monthSep', 'chart.monthOct', 'chart.monthNov', 'chart.monthDec'] as const

export default function CorrelationChart() {
    const { t } = useTranslation()
    const { data: statsResp, isLoading } = useQuery<StatsData | null>({
        queryKey: ['mlStats'],
        queryFn: () => api.getStats(),
        refetchInterval: 10 * 60_000,
        retry: 1,
    })

    const chartData = useMemo(() => {
        const monthly = statsResp?.data?.monthly
        if (!monthly || Object.keys(monthly).length < 6) return null

        return Array.from({ length: 12 }, (_, i) => {
            const m = monthly[String(i + 1)]
            return {
                month: t(MONTH_KEYS[i]),
                temperature: m ? Math.round(m.temp_mean) : 0,
                smog: m ? Math.round(m.aqi_mean) : 0,
            }
        })
    }, [statsResp, t])

    const fallbackData = useMemo(() => {
        const temps = [-8, -5, 4, 13, 19, 24, 27, 25, 19, 10, 1, -6]
        const smog = [172, 155, 110, 72, 53, 38, 33, 35, 48, 78, 125, 162]
        return Array.from({ length: 12 }, (_, i) => ({
            month: t(MONTH_KEYS[i]),
            temperature: temps[i],
            smog: smog[i],
        }))
    }, [t])

    const usingFallback = chartData === null
    const displayData = chartData || fallbackData

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null
        return (
            <div className="bg-cyber-dark border border-cyber-border rounded-lg px-3 py-2 shadow-lg">
                <p className="text-xs text-cyber-muted mb-1.5 font-medium">{label}</p>
                {payload.map((p: any, i: number) => (
                    <p key={i} className="text-sm" style={{ color: p.color }}>
                        {p.name}: <span className="font-semibold">{p.value}{p.dataKey === 'temperature' ? '°C' : ''}</span>
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

            {/* Custom legend */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-[11px]">
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: '#8b5cf6' }} />
                    {t('chart.smogAqi')}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-5 h-[3px] rounded-full shrink-0" style={{ background: '#f59e0b' }} />
                    {t('chart.temperature')}
                </span>
                {usingFallback && !isLoading && (
                    <span className="text-yellow-500 ml-auto">
                        ⚠ {t('analytics.correlationFallback')}
                    </span>
                )}
            </div>

            {isLoading && (
                <div className="mb-2">
                    <span className="text-xs text-cyber-muted animate-pulse">{t('common.loading')}</span>
                </div>
            )}

            <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={displayData} margin={{ top: 5, right: 35, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f1f2e" />
                        <XAxis dataKey="month" stroke="#6b7280" tick={{ fontSize: 11 }} interval={0} />
                        <YAxis
                            yAxisId="left"
                            stroke="#8b5cf6"
                            tick={{ fontSize: 11 }}
                            width={40}
                        />
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            stroke="#f59e0b"
                            tick={{ fontSize: 11 }}
                            width={40}
                            tickFormatter={(v) => `${v}°`}
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
            </div>
        </div>
    )
}
