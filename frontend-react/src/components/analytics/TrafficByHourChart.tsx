import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../services/api'

export default function TrafficByHourChart() {
    const { data: trafficHistory, isLoading } = useQuery({
        queryKey: ['trafficHistory', 24],
        queryFn: () => api.getTrafficHistory(24),
        refetchInterval: 5 * 60_000,
    })

    const data = useMemo(() => {
        if (trafficHistory && trafficHistory.length > 0) {
            // Group real data by hour
            const byHour: Record<number, { total: number; count: number }> = {}
            for (let h = 0; h < 24; h++) {
                byHour[h] = { total: 0, count: 0 }
            }
            trafficHistory.forEach((t) => {
                const hour = new Date(t.timestamp).getHours()
                byHour[hour].total += t.congestion_index
                byHour[hour].count += 1
            })
            return Array.from({ length: 24 }, (_, i) => ({
                hour: `${i}:00`,
                congestion: byHour[i].count > 0
                    ? Math.round(byHour[i].total / byHour[i].count)
                    : 0,
            }))
        }

        // Fallback: realistic Almaty weekday pattern
        const HOURLY_PATTERN = [
            12, 8, 6, 5, 7, 15, 35, 72, 85, 68,
            52, 55, 62, 58, 50, 55, 68, 82, 78, 55,
            40, 30, 22, 15
        ]
        return HOURLY_PATTERN.map((base, i) => ({
            hour: `${i}:00`,
            congestion: base,
        }))
    }, [trafficHistory])

    const hasFallback = !trafficHistory || trafficHistory.length === 0

    return (
        <div className="cyber-card h-[300px]">
            <h3 className="text-lg font-semibold mb-4 text-cyber-text">
                Загруженность по часам
                {isLoading && <span className="text-xs text-cyber-muted ml-2">загрузка…</span>}
                {hasFallback && !isLoading && <span className="text-xs text-yellow-500 ml-2">типичный паттерн</span>}
            </h3>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" />
                    <XAxis dataKey="hour" stroke="#6b7280" interval={2} />
                    <YAxis stroke="#6b7280" />
                    <Tooltip
                        cursor={{ fill: '#18181b' }}
                        contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', color: '#fff' }}
                    />
                    <Bar dataKey="congestion" radius={[4, 4, 0, 0]}>
                        {data.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.congestion > 70 ? '#ef4444' : entry.congestion > 40 ? '#f59e0b' : '#10b981'}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
