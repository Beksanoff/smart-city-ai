import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts'
import { api } from '../../services/api'

// Day name in Russian
const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

export default function AQIHistoryChart() {
    const { data: weatherHistory, isLoading } = useQuery({
        queryKey: ['weatherHistory', 168], // 7 days
        queryFn: () => api.getWeatherHistory(168),
        refetchInterval: 5 * 60_000,
    })

    const chartData = useMemo(() => {
        if (!weatherHistory || weatherHistory.length === 0) {
            // Fallback: current AQI as single point
            return null
        }

        // Group by day and average AQI
        const byDay: Record<string, { total: number; count: number; dayIndex: number }> = {}
        weatherHistory.forEach((w) => {
            const d = new Date(w.timestamp)
            const key = d.toISOString().slice(0, 10)
            if (!byDay[key]) {
                byDay[key] = { total: 0, count: 0, dayIndex: d.getDay() }
            }
            byDay[key].total += w.aqi
            byDay[key].count += 1
        })

        return Object.entries(byDay)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-7)
            .map(([, v]) => ({
                day: DAY_NAMES[v.dayIndex],
                aqi: Math.round(v.total / v.count),
            }))
    }, [weatherHistory])

    const fallback = chartData === null

    return (
        <div className="cyber-card h-[300px]">
            <h3 className="text-lg font-semibold mb-4 text-cyber-text">
                История AQI (7 дней)
                {isLoading && <span className="text-xs text-cyber-muted ml-2">загрузка…</span>}
                {fallback && !isLoading && <span className="text-xs text-yellow-500 ml-2">нет данных из БД</span>}
            </h3>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData || [{ day: 'Сейчас', aqi: 0 }]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" />
                    <XAxis dataKey="day" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', color: '#fff' }}
                        itemStyle={{ color: '#22d3ee' }}
                    />
                    <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="3 3" label="Опасно" />
                    <Line
                        type="monotone"
                        dataKey="aqi"
                        stroke="#22d3ee"
                        strokeWidth={3}
                        dot={{ fill: '#22d3ee' }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}
