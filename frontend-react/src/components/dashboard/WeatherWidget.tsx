import { Thermometer, Droplets, Wind, Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Weather } from '../../services/api'

interface WeatherWidgetProps {
    data?: Weather
    isLoading?: boolean
}

function WeatherWidget({ data, isLoading }: WeatherWidgetProps) {
    const { t } = useTranslation()

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
        const key = `weatherDesc.${desc.toLowerCase()}`
        const translated = t(key)
        return translated !== key ? translated : desc
    }

    return (
        <div className="cyber-card">
            <div className="flex items-start justify-between mb-4">
                <div className="min-w-0">
                    <h3 className="text-sm text-cyber-muted mb-1">{t('weather.title')}</h3>
                    <p className="text-sm text-cyber-muted truncate">{t('weather.cityCountry', { city: data.city })}</p>
                </div>
                <span className="text-4xl shrink-0">{getWeatherIcon(data.description)}</span>
            </div>

            <div className="flex items-end gap-2 mb-4">
                <span className="text-5xl font-bold neon-text">
                    {Math.round(data.temperature)}°
                </span>
                <span className="text-lg text-cyber-muted mb-2">C</span>
            </div>

            <p className="text-cyber-text capitalize mb-6 break-words">{translateDescription(data.description)}</p>

            <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                    <Thermometer className="w-4 h-4 text-cyber-cyan shrink-0" />
                    <span className="text-cyber-muted truncate">{t('weather.feelsLike')}</span>
                    <span className="ml-auto shrink-0">{Math.round(data.feels_like)}°C</span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                    <Droplets className="w-4 h-4 text-cyber-purple shrink-0" />
                    <span className="text-cyber-muted truncate">{t('weather.humidity')}</span>
                    <span className="ml-auto shrink-0">{data.humidity}%</span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                    <Wind className="w-4 h-4 text-cyber-cyan shrink-0" />
                    <span className="text-cyber-muted truncate">{t('weather.wind')}</span>
                    <span className="ml-auto shrink-0">{data.wind_speed} {t('weather.ms')}</span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                    <Eye className="w-4 h-4 text-cyber-purple shrink-0" />
                    <span className="text-cyber-muted truncate">{t('weather.visibility')}</span>
                    <span className="ml-auto shrink-0">{(data.visibility / 1000).toFixed(1)} {t('weather.km')}</span>
                </div>
            </div>
        </div>
    )
}

export default WeatherWidget
