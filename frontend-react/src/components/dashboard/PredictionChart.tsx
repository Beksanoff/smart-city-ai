import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts'
import { useTranslation } from 'react-i18next'

interface PredictionChartProps {
    currentAQI: number
    predictedAQI: number
    currentTraffic: number
    predictedTraffic: number
}

export default function PredictionChart({ currentAQI, predictedAQI, currentTraffic, predictedTraffic }: PredictionChartProps) {
    const { t } = useTranslation()
    const data = [
        {
            name: t('predictionChart.aqiSeries'),
            current: currentAQI,
            predicted: predictedAQI,
            max: 300
        },
        {
            name: t('predictionChart.trafficSeries'),
            current: currentTraffic,
            predicted: predictedTraffic,
            max: 100
        }
    ]

    return (
        <div className="h-64 w-full mt-4 min-w-0">
            <h4 className="text-sm font-semibold text-cyber-muted mb-2 truncate">{t('predictionChart.title')}</h4>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" horizontal={false} />
                    <XAxis type="number" stroke="#6b7280" />
                    <YAxis dataKey="name" type="category" stroke="#6b7280" width={150} tick={{ fontSize: 11 }} />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', color: '#fff' }}
                        cursor={{ fill: 'transparent' }}
                    />
                    <Bar dataKey="current" name={t('predictionChart.now')} fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                    <Bar dataKey="predicted" name={t('predictionChart.predicted')} fill="#a855f7" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
