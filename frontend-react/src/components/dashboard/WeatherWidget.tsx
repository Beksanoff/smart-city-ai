import { Thermometer, Droplets, Wind, Eye } from 'lucide-react'
import type { Weather } from '../../services/api'

interface WeatherWidgetProps {
    data?: Weather
    isLoading?: boolean
}

function WeatherWidget({ data, isLoading }: WeatherWidgetProps) {
    if (isLoading || !data) {
        return (
            <div className="cyber-card animate-pulse">
                <div className="h-32 bg-cyber-border rounded-lg" />
            </div>
        )
    }

    const getWeatherIcon = (description: string) => {
        const desc = description.toLowerCase()
        if (desc.includes('snow')) return '❄️'
        if (desc.includes('rain')) return '🌧️'
        if (desc.includes('cloud')) return '☁️'
        if (desc.includes('clear')) return '☀️'
        if (desc.includes('fog')) return '🌫️'
        return '🌤️'
    }

    const translateDescription = (desc: string) => {
        const translations: Record<string, string> = {
            'clear sky': 'Ясно',
            'few clouds': 'Малооблачно',
            'scattered clouds': 'Переменная облачность',
            'broken clouds': 'Облачно',
            'overcast clouds': 'Пасмурно',
            'light rain': 'Небольшой дождь',
            'moderate rain': 'Умеренный дождь',
            'heavy rain': 'Сильный дождь',
            'light snow': 'Небольшой снег',
            'snow': 'Снег',
            'fog': 'Туман',
            'mist': 'Дымка',
        }
        return translations[desc.toLowerCase()] || desc
    }

    return (
        <div className="cyber-card">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h3 className="text-sm text-cyber-muted mb-1">Погода</h3>
                    <p className="text-sm text-cyber-muted">{data.city}, Казахстан</p>
                </div>
                <span className="text-4xl">{getWeatherIcon(data.description)}</span>
            </div>

            <div className="flex items-end gap-2 mb-4">
                <span className="text-5xl font-bold neon-text">
                    {Math.round(data.temperature)}°
                </span>
                <span className="text-lg text-cyber-muted mb-2">C</span>
            </div>

            <p className="text-cyber-text capitalize mb-6">{translateDescription(data.description)}</p>

            <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-cyber-cyan" />
                    <span className="text-cyber-muted">Ощущается</span>
                    <span className="ml-auto">{Math.round(data.feels_like)}°C</span>
                </div>
                <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-cyber-purple" />
                    <span className="text-cyber-muted">Влажность</span>
                    <span className="ml-auto">{data.humidity}%</span>
                </div>
                <div className="flex items-center gap-2">
                    <Wind className="w-4 h-4 text-cyber-cyan" />
                    <span className="text-cyber-muted">Ветер</span>
                    <span className="ml-auto">{data.wind_speed} м/с</span>
                </div>
                <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-cyber-purple" />
                    <span className="text-cyber-muted">Видимость</span>
                    <span className="ml-auto">{(data.visibility / 1000).toFixed(1)} км</span>
                </div>
            </div>
        </div>
    )
}

export default WeatherWidget
