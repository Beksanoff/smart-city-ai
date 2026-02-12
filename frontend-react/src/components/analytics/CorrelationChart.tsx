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

const data = [
    { month: 'Янв', temperature: -12, smog: 180 },
    { month: 'Фев', temperature: -8, smog: 160 },
    { month: 'Мар', temperature: 5, smog: 120 },
    { month: 'Апр', temperature: 15, smog: 80 },
    { month: 'Май', temperature: 22, smog: 50 },
    { month: 'Июн', temperature: 28, smog: 30 },
]

export default function CorrelationChart() {
    return (
        <div className="cyber-card h-[300px]">
            <h3 className="text-lg font-semibold mb-4 text-cyber-text">Корреляция: Температура vs Смог</h3>
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data}>
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
