import { useMemo, useState } from 'react'
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
    ReferenceLine,
} from 'recharts'
import { Wind } from 'lucide-react'
import type { AnalyticsForecastDay } from '../../services/api'

interface AQIHistoryChartProps {
    forecastDays: AnalyticsForecastDay[]
    isLoading: boolean
}

export default function AQIHistoryChart({ forecastDays, isLoading }: AQIHistoryChartProps) {
    const { t, i18n } = useTranslation()
    const [selectedDay, setSelectedDay] = useState<(AnalyticsForecastDay & { label: string }) | null>(null)

    const chartData = useMemo(() => (
        forecastDays.map((day) => ({
            ...day,
            label: new Intl.DateTimeFormat(i18n.language, {
                weekday: 'short',
                day: 'numeric',
            }).format(new Date(`${day.date}T12:00:00`)),
        }))
    ), [forecastDays, i18n.language])

    const hasData = chartData.length > 0
    const handleChartClick = (event: unknown) => {
        const activePayload = (event as { activePayload?: Array<{ payload?: unknown }> } | undefined)?.activePayload
        const point = activePayload?.[0]?.payload as (AnalyticsForecastDay & { label: string }) | undefined
        if (point) setSelectedDay(point)
    }
    const aqiDomainMax = useMemo(() => {
        const maxAqi = chartData.reduce((max, day) => {
            const value = Number.isFinite(day.aqi_prediction) ? day.aqi_prediction : 0
            return Math.max(max, value)
        }, 0)

        // Keep readable steps while avoiding clipping when AQI spikes above 180.
        const paddedMax = Math.ceil((maxAqi + 20) / 25) * 25
        return Math.max(180, Math.min(500, paddedMax))
    }, [chartData])

    const CustomTooltip = ({
        active,
        payload,
        label,
    }: {
        active?: boolean
        payload?: Array<{ dataKey?: string | number; value?: number; color?: string }>
        label?: string
    }) => {
        if (!active || !payload?.length) return null

        const aqiValue = payload.find((item) => item.dataKey === 'aqi_prediction')?.value ?? 0
        const trafficValue = payload.find((item) => item.dataKey === 'traffic_prediction')?.value ?? 0
        const riskValue = payload.find((item) => item.dataKey === 'risk_score')?.value ?? 0

        return (
            <div className="bg-cyber-dark border border-cyber-border rounded-lg px-3 py-2 shadow-lg">
                <p className="text-xs text-cyber-muted mb-1">{label}</p>
                <p className="text-sm font-semibold text-cyber-cyan">{t('analytics.aqiValue', { value: aqiValue })}</p>
                <p className="text-sm font-semibold text-cyber-purple">{t('analytics.trafficPercent', { value: trafficValue })}</p>
                <p className="text-xs text-cyber-muted mt-1">{t('analytics.riskScore', { value: riskValue })}</p>
            </div>
        )
    }

    return (
        <>
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
                        <span className="w-5 h-[3px] rounded-full shrink-0 bg-cyber-cyan" />
                        {t('analytics.forecastAqi')}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm shrink-0 bg-cyber-purple" />
                        {t('analytics.forecastTraffic')}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-red-500" />
                        {t('analytics.legendBad')}
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
                            <ComposedChart
                                data={chartData}
                                margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                                onClick={handleChartClick}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f2e" />
                                <XAxis dataKey="label" stroke="#6b7280" tick={{ fontSize: 11 }} />
                                <YAxis
                                    yAxisId="left"
                                    stroke="#22d3ee"
                                    tick={{ fontSize: 11 }}
                                    domain={[0, aqiDomainMax]}
                                    width={38}
                                />
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    stroke="#8b5cf6"
                                    tick={{ fontSize: 11 }}
                                    width={38}
                                    domain={[0, 100]}
                                    tickFormatter={(value) => `${value}%`}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <ReferenceLine
                                    yAxisId="left"
                                    y={100}
                                    stroke="#ef4444"
                                    strokeDasharray="4 4"
                                    strokeWidth={1.5}
                                />
                                <Bar
                                    yAxisId="right"
                                    dataKey="traffic_prediction"
                                    barSize={16}
                                    fill="#8b5cf6"
                                    radius={[4, 4, 0, 0]}
                                    fillOpacity={0.72}
                                    style={{ cursor: 'pointer' }}
                                />
                                <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="aqi_prediction"
                                    stroke="#22d3ee"
                                    strokeWidth={2.5}
                                    dot={{ fill: '#22d3ee', r: 3, strokeWidth: 0 }}
                                    activeDot={{ r: 5, stroke: '#22d3ee', strokeWidth: 2, fill: '#0a0a0f' }}
                                    style={{ cursor: 'pointer' }}
                                />
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="risk_score"
                                    stroke="#f59e0b"
                                    strokeWidth={1.75}
                                    strokeDasharray="5 4"
                                    dot={false}
                                    activeDot={{ r: 4, fill: '#f59e0b', strokeWidth: 0, cursor: 'pointer' }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : !isLoading ? (
                        <div className="flex flex-col items-center justify-center h-[300px] text-center px-4">
                            <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
                                <Wind className="w-8 h-8 text-yellow-500/50" />
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

            {selectedDay && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cyber-dark/70 backdrop-blur-sm"
                    onClick={() => setSelectedDay(null)}
                >
                    <div
                        className="cyber-card w-full max-w-lg border border-cyber-border shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-base font-semibold text-cyber-text">{selectedDay.label}</p>
                                <p className="text-xs text-cyber-muted mt-1">
                                    {selectedDay.date} - {selectedDay.source}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedDay(null)}
                                className="text-xs px-2 py-1 rounded border border-cyber-border text-cyber-muted hover:text-cyber-text"
                            >
                                x
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-xs text-cyber-muted">
                            <span>{t('analytics.aqiValue', { value: selectedDay.aqi_prediction })}</span>
                            <span>{t('analytics.trafficPercent', { value: selectedDay.traffic_prediction })}</span>
                            <span>{t('analytics.riskScore', { value: selectedDay.risk_score })}</span>
                            <span>Confidence: {Math.round(selectedDay.confidence * 100)}%</span>
                            <span>Temp: {selectedDay.temperature} C</span>
                            <span>Humidity: {selectedDay.humidity}%</span>
                            <span>Wind: {selectedDay.wind_speed}</span>
                            <span>Precip: {selectedDay.precipitation}</span>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

