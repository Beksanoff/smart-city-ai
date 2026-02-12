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

const data = [
    { day: 'Пн', aqi: 45, text: 'Хорошо' },
    { day: 'Вт', aqi: 52, text: 'Средне' },
    { day: 'Ср', aqi: 110, text: 'Вредно' },
    { day: 'Чт', aqi: 85, text: 'Средне' },
    { day: 'Пт', aqi: 160, text: 'Опасно' },
    { day: 'Сб', aqi: 140, text: 'Вредно' },
    { day: 'Вс', aqi: 90, text: 'Средне' },
]

export default function AQIHistoryChart() {
    return (
        <div className="cyber-card h-[300px]">
            <h3 className="text-lg font-semibold mb-4 text-cyber-text">История AQI (7 дней)</h3>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
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
