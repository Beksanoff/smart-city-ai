import { Wind, Shield, AlertCircle, Skull } from 'lucide-react'

interface AQIWidgetProps {
    aqi?: number
    isLoading?: boolean
}

function AQIWidget({ aqi, isLoading }: AQIWidgetProps) {
    if (isLoading || aqi === undefined) {
        return (
            <div className="cyber-card animate-pulse">
                <div className="h-32 bg-cyber-border rounded-lg" />
            </div>
        )
    }

    const getAQIInfo = (value: number) => {
        if (value <= 50) return {
            level: 'Хорошее',
            color: 'aqi-good',
            bg: 'bg-green-500/20',
            icon: Shield,
            advice: 'Качество воздуха отличное'
        }
        if (value <= 100) return {
            level: 'Умеренное',
            color: 'aqi-moderate',
            bg: 'bg-yellow-500/20',
            icon: Wind,
            advice: 'Приемлемо для большинства людей'
        }
        if (value <= 150) return {
            level: 'Вредное для чувствительных',
            color: 'aqi-usg',
            bg: 'bg-orange-500/20',
            icon: AlertCircle,
            advice: 'Чувствительным группам ограничить нагрузки'
        }
        if (value <= 200) return {
            level: 'Вредное',
            color: 'aqi-unhealthy',
            bg: 'bg-red-500/20',
            icon: AlertCircle,
            advice: 'Возможно влияние на здоровье всех'
        }
        if (value <= 300) return {
            level: 'Очень вредное',
            color: 'aqi-very-unhealthy',
            bg: 'bg-purple-500/20',
            icon: Skull,
            advice: 'Тревога: серьезный риск для здоровья'
        }
        return {
            level: 'Опасное',
            color: 'aqi-hazardous',
            bg: 'bg-red-900/20',
            icon: Skull,
            advice: 'Чрезвычайная ситуация!'
        }
    }

    const info = getAQIInfo(aqi)
    const Icon = info.icon

    // Расчет угла поворота (0-300 AQI = 0-180 градусов)
    const rotation = Math.min((aqi / 300) * 180, 180)

    return (
        <div className="cyber-card">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h3 className="text-sm text-cyber-muted mb-1">Индекс качества воздуха</h3>
                    <p className={`font-semibold ${info.color}`}>{info.level}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg ${info.bg} flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${info.color}`} />
                </div>
            </div>

            {/* Шкала AQI */}
            <div className="relative flex justify-center mb-4">
                <div className="relative w-40 h-20 overflow-hidden">
                    {/* Фоновая дуга */}
                    <div className="absolute inset-0 border-8 border-cyber-border rounded-t-full" />

                    {/* Цветная дуга */}
                    <div
                        className={`absolute inset-0 border-8 rounded-t-full transition-all duration-500`}
                        style={{
                            borderColor: aqi <= 50 ? '#10b981' : aqi <= 100 ? '#f59e0b' : aqi <= 150 ? '#f97316' : aqi <= 200 ? '#ef4444' : '#8b5cf6',
                            clipPath: `polygon(0 100%, 0 0, ${50 + rotation * 0.55}% 0, 50% 100%)`,
                        }}
                    />

                    {/* Центральное значение */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
                        <span className={`text-4xl font-bold ${info.color}`}>{aqi}</span>
                    </div>
                </div>
            </div>

            <p className="text-sm text-cyber-muted text-center">{info.advice}</p>

            {/* Легенда шкалы AQI */}
            <div className="mt-4 flex justify-between text-xs">
                <span className="aqi-good">0</span>
                <span className="aqi-moderate">50</span>
                <span className="aqi-usg">100</span>
                <span className="aqi-unhealthy">150</span>
                <span className="aqi-very-unhealthy">200</span>
                <span className="aqi-hazardous">300+</span>
            </div>
        </div>
    )
}

export default AQIWidget
