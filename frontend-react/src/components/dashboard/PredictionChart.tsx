import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts'

interface PredictionChartProps {
    currentAQI: number
    predictedAQI: number
    currentTraffic: number
    predictedTraffic: number
}

export default function PredictionChart({ currentAQI, predictedAQI, currentTraffic, predictedTraffic }: PredictionChartProps) {
    const data = [
        {
            name: 'Качество воздуха (AQI)',
            current: currentAQI,
            predicted: predictedAQI,
            max: 300
        },
        {
            name: 'Трафик (Индекс)',
            current: currentTraffic,
            predicted: predictedTraffic,
            max: 100
        }
    ]

    return (
        <div className="h-64 w-full mt-4">
            <h4 className="text-sm font-semibold text-cyber-muted mb-2">Сравнение: Сейчас vs Прогноз</h4>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" horizontal={false} />
                    <XAxis type="number" stroke="#6b7280" />
                    <YAxis dataKey="name" type="category" stroke="#6b7280" width={150} />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', color: '#fff' }}
                        cursor={{ fill: 'transparent' }}
                    />
                    <Bar dataKey="current" name="Сейчас" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                    <Bar dataKey="predicted" name="Прогноз" fill="#a855f7" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
