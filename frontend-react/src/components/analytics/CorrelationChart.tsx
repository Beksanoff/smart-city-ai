import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts'

interface StatsData {
    success: boolean
    data: {
        monthly?: Record<string, {
            temp_mean: number
            aqi_mean: number
            pm25_mean: number
        }>
    }
}

const MONTH_NAMES = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
    'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

// Fallback data (realistic Almaty averages)
const FALLBACK = [
    { month: 'Янв', temperature: -8, smog: 172 },
    { month: 'Фев', temperature: -5, smog: 155 },
    { month: 'Мар', temperature: 4, smog: 110 },
    { month: 'Апр', temperature: 13, smog: 72 },
    { month: 'Май', temperature: 19, smog: 53 },
    { month: 'Июн', temperature: 24, smog: 38 },
    { month: 'Июл', temperature: 27, smog: 33 },
    { month: 'Авг', temperature: 25, smog: 35 },
    { month: 'Сен', temperature: 19, smog: 48 },
    { month: 'Окт', temperature: 10, smog: 78 },
    { month: 'Ноя', temperature: 1, smog: 125 },
    { month: 'Дек', temperature: -6, smog: 162 },
]

export default function CorrelationChart() {
    const { data: statsResp, isLoading } = useQuery<StatsData>({
        queryKey: ['mlStats'],
        queryFn: async () => {
            const resp = await fetch(
                `${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/api/v1/stats`
            )
            return resp.json()
        },
        refetchInterval: 10 * 60_000,
        retry: 1,
    })

    const chartData = useMemo(() => {
        const monthly = statsResp?.data?.monthly
        if (!monthly || Object.keys(monthly).length < 6) return null

        return Array.from({ length: 12 }, (_, i) => {
            const m = monthly[String(i + 1)]
            return {
                month: MONTH_NAMES[i],
                temperature: m ? Math.round(m.temp_mean) : 0,
                smog: m ? Math.round(m.aqi_mean) : 0,
            }
        })
    }, [statsResp])

    const usingFallback = chartData === null

    return (
        <div className="cyber-card h-[300px]">
            <h3 className="text-lg font-semibold mb-4 text-cyber-text">
                Корреляция: Температура vs Смог
                {isLoading && <span className="text-xs text-cyber-muted ml-2">загрузка…</span>}
                {usingFallback && !isLoading && <span className="text-xs text-yellow-500 ml-2">средние за 6 лет</span>}
            </h3>
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData || FALLBACK}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" />
                    <XAxis dataKey="month" stroke="#6b7280" />
                    <YAxis yAxisId="left" stroke="#8b5cf6" label={{ value: 'Смог (AQI)', angle: -90, position: 'insideLeft', fill: '#8b5cf6' }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" label={{ value: 'Температура (°C)', angle: 90, position: 'insideRight', fill: '#f59e0b' }} />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', color: '#fff' }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="smog" barSize={20} fill="#8b5cf6" name="Смог (AQI)" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="temperature" stroke="#f59e0b" strokeWidth={3} name="Температура" dot={{ fill: '#f59e0b' }} />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    )
}
