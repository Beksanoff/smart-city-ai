import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts'
import { Clock3 } from 'lucide-react'
import type { AnalyticsHourlyPatterns } from '../../services/api'

interface HourlyTrafficPatternChartProps {
    hourlyPatterns: AnalyticsHourlyPatterns | null
    isLoading: boolean
}

type SupportedLang = 'ru' | 'en' | 'kk'

const TEXT: Record<SupportedLang, {
    title: string
    description: string
    weekday: string
    weekend: string
    morning: string
    day: string
    evening: string
    night: string
}> = {
    ru: {
        title: 'Почасовой трафик: будни и выходные',
        description: 'Реальный профиль по времени суток из ML-статистики (утро/день/вечер/ночь).',
        weekday: 'Будни',
        weekend: 'Выходные',
        morning: 'Утро 7-10',
        day: 'День 10-16',
        evening: 'Вечер 16-20',
        night: 'Ночь 20-7',
    },
    en: {
        title: 'Hourly traffic: weekday vs weekend',
        description: 'Real time-of-day profile from ML stats (morning/day/evening/night).',
        weekday: 'Weekday',
        weekend: 'Weekend',
        morning: 'Morning 7-10',
        day: 'Day 10-16',
        evening: 'Evening 16-20',
        night: 'Night 20-7',
    },
    kk: {
        title: 'Сағаттық трафик: жұмыс күні және демалыс',
        description: 'ML статистикасынан алынған тәулік уақыты профилі (таң/күн/кеш/түн).',
        weekday: 'Жұмыс күні',
        weekend: 'Демалыс',
        morning: 'Таң 7-10',
        day: 'Күн 10-16',
        evening: 'Кеш 16-20',
        night: 'Түн 20-7',
    },
}

export default function HourlyTrafficPatternChart({
    hourlyPatterns,
    isLoading,
}: HourlyTrafficPatternChartProps) {
    const { t, i18n } = useTranslation()
    const lang = (i18n.language.slice(0, 2) as SupportedLang)
    const text = TEXT[lang] ?? TEXT.ru

    const chartData = useMemo(() => {
        const weekday = hourlyPatterns?.weekday ?? null
        const weekend = hourlyPatterns?.weekend ?? null

        return [
            {
                slot: text.morning,
                weekday: weekday?.morning_7_10 ?? null,
                weekend: weekend?.morning_7_10 ?? null,
            },
            {
                slot: text.day,
                weekday: weekday?.day_10_16 ?? null,
                weekend: weekend?.day_10_16 ?? null,
            },
            {
                slot: text.evening,
                weekday: weekday?.evening_16_20 ?? null,
                weekend: weekend?.evening_16_20 ?? null,
            },
            {
                slot: text.night,
                weekday: weekday?.night_20_7 ?? null,
                weekend: weekend?.night_20_7 ?? null,
            },
        ]
    }, [hourlyPatterns, text.day, text.evening, text.morning, text.night])

    const hasData = chartData.some((item) => (
        Number.isFinite(item.weekday ?? NaN) || Number.isFinite(item.weekend ?? NaN)
    ))

    const yDomainMax = useMemo(() => {
        const maxValue = chartData.reduce((max, row) => {
            const weekday = Number.isFinite(row.weekday ?? NaN) ? (row.weekday ?? 0) : 0
            const weekend = Number.isFinite(row.weekend ?? NaN) ? (row.weekend ?? 0) : 0
            return Math.max(max, weekday, weekend)
        }, 0)
        const padded = Math.ceil((maxValue + 5) / 10) * 10
        return Math.max(100, Math.min(140, padded))
    }, [chartData])

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
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Clock3 className="w-5 h-5 text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-cyber-text truncate">
                        {text.title}
                    </h3>
                    <p className="text-xs text-cyber-muted mt-0.5 leading-relaxed">
                        {text.description}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[11px]">
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm shrink-0 bg-cyber-cyan" />
                    {text.weekday}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm shrink-0 bg-blue-400" />
                    {text.weekend}
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
                        <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f2e" />
                            <XAxis dataKey="slot" stroke="#6b7280" tick={{ fontSize: 11 }} />
                            <YAxis
                                stroke="#6b7280"
                                tick={{ fontSize: 11 }}
                                domain={[0, yDomainMax]}
                                tickFormatter={(value) => `${value}%`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="weekday" name={text.weekday} fill="#22d3ee" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="weekend" name={text.weekend} fill="#60a5fa" radius={[3, 3, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                ) : !isLoading ? (
                    <div className="flex flex-col items-center justify-center h-[300px] text-center px-4">
                        <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
                            <Clock3 className="w-8 h-8 text-yellow-500/50" />
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

