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

// Realistic Almaty weekday traffic pattern (based on typical congestion data)
const HOURLY_PATTERN = [
    12, 8, 6, 5, 7, 15, 35, 72, 85, 68,
    52, 55, 62, 58, 50, 55, 68, 82, 78, 55,
    40, 30, 22, 15
]

export default function TrafficByHourChart() {
    const data = useMemo(() =>
        HOURLY_PATTERN.map((base, i) => ({
            hour: `${i}:00`,
            congestion: base
        })),
        []
    )
    return (
        <div className="cyber-card h-[300px]">
            <h3 className="text-lg font-semibold mb-4 text-cyber-text">Загруженность по часам</h3>
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
