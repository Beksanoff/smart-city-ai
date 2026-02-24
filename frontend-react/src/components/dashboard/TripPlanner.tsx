import { useState, useMemo, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Brain, Send, Loader2, Calendar, Thermometer, MessageSquare, CalendarDays, Info } from 'lucide-react'
import { api, type PredictionResponse, type PredictionRequest } from '../../services/api'
import PredictionChart from './PredictionChart'

/** Format YYYY-MM-DD from a Date object */
function fmtDate(d: Date): string {
    return d.toISOString().slice(0, 10)
}

function TripPlanner() {
    const { t, i18n } = useTranslation()
    const [query, setQuery] = useState('')
    const [date, setDate] = useState(fmtDate(new Date()))
    const [datePreset, setDatePreset] = useState<'today' | 'tomorrow' | 'after' | 'custom'>('today')
    const [result, setResult] = useState<PredictionResponse | null>(null)
    const dateInputRef = useRef<HTMLInputElement>(null)

    // Получаем текущие данные для сравнения + авто-температурa
    const { data: currentData } = useQuery({
        queryKey: ['dashboard'],
        queryFn: api.getDashboard,
        staleTime: 60000
    })

    // Текущая температура из реальных данных (Open-Meteo)
    const autoTemperature = currentData?.weather.temperature ?? null

    const mutation = useMutation({
        mutationFn: (request: PredictionRequest) => api.predict(request),
        onSuccess: (data) => setResult(data),
    })

    // Quick date helpers
    const presetDates = useMemo(() => {
        const today = new Date()
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
        const afterTomorrow = new Date(today); afterTomorrow.setDate(today.getDate() + 2)
        return { today: fmtDate(today), tomorrow: fmtDate(tomorrow), after: fmtDate(afterTomorrow) }
    }, [])

    const selectPreset = (preset: 'today' | 'tomorrow' | 'after') => {
        setDatePreset(preset)
        setDate(presetDates[preset])
    }

    const handleCustomDate = (value: string) => {
        setDate(value)
        setDatePreset('custom')
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        const request: PredictionRequest = {}
        if (date) request.date = date
        // Температура подставляется автоматически из Open-Meteo
        if (autoTemperature !== null) request.temperature = autoTemperature
        if (query) request.query = query
        // Pass current UI language so the AI responds in the same language
        request.language = i18n.language

        mutation.mutate(request)
    }

    // Красивое отображение выбранной даты
    const displayDate = useMemo(() => {
        if (!date) return ''
        const d = new Date(date + 'T12:00:00')
        return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' })
    }, [date])

    const quickQueries = [t('quickQueries.q1'), t('quickQueries.q2'), t('quickQueries.q3'), t('quickQueries.q4')]

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Секция ввода */}
            <div className="cyber-card">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyber-purple to-cyber-pink flex items-center justify-center">
                        <Brain className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-lg font-semibold truncate">{t('planner.title')}</h2>
                        <p className="text-sm text-cyber-muted truncate">{t('planner.subtitle')}</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* 1. Быстрый выбор даты */}
                    <div>
                        <label className="flex items-center gap-2 text-sm text-cyber-muted mb-2">
                            <Calendar className="w-4 h-4 shrink-0" />
                            {t('planner.dateLabel')}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => selectPreset('today')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${datePreset === 'today' ? 'bg-cyber-purple text-white shadow-lg shadow-cyber-purple/25' : 'bg-cyber-dark border border-cyber-border hover:border-cyber-purple'}`}>
                                {t('planner.dateToday')}
                            </button>
                            <button type="button" onClick={() => selectPreset('tomorrow')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${datePreset === 'tomorrow' ? 'bg-cyber-purple text-white shadow-lg shadow-cyber-purple/25' : 'bg-cyber-dark border border-cyber-border hover:border-cyber-purple'}`}>
                                {t('planner.dateTomorrow')}
                            </button>
                            <button type="button" onClick={() => selectPreset('after')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${datePreset === 'after' ? 'bg-cyber-purple text-white shadow-lg shadow-cyber-purple/25' : 'bg-cyber-dark border border-cyber-border hover:border-cyber-purple'}`}>
                                {t('planner.dateAfterTomorrow')}
                            </button>
                            {/* Кнопка для открытия нативного календаря */}
                            <button type="button"
                                onClick={() => dateInputRef.current?.showPicker?.()}
                                className={`px-3 py-2 rounded-lg text-sm transition-all ${datePreset === 'custom' ? 'bg-cyber-purple text-white shadow-lg shadow-cyber-purple/25' : 'bg-cyber-dark border border-cyber-border hover:border-cyber-purple'}`}
                                title={t('planner.dateCustom')}>
                                <CalendarDays className="w-4 h-4" />
                            </button>
                        </div>
                        {/* Скрытый нативный date input для custom даты */}
                        <input ref={dateInputRef} type="date" value={date}
                            onChange={(e) => handleCustomDate(e.target.value)}
                            className="sr-only" tabIndex={-1} />
                        {/* Выбранная дата */}
                        {date && (
                            <p className="mt-2 text-xs text-cyber-cyan font-medium">{displayDate}</p>
                        )}
                    </div>

                    {/* 2. Температура — автоматическая из Open-Meteo */}
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-cyber-dark/50 border border-cyber-border">
                        <Thermometer className="w-4 h-4 text-cyber-cyan shrink-0" />
                        {autoTemperature !== null ? (
                            <span className="text-sm text-cyber-text">
                                {t('planner.autoTemp')}: <span className="font-mono font-semibold text-cyber-cyan">{autoTemperature.toFixed(1)}°C</span>
                            </span>
                        ) : (
                            <span className="text-sm text-cyber-muted">{t('planner.autoTempLoading')}</span>
                        )}
                        <div className="ml-auto group relative">
                            <Info className="w-3.5 h-3.5 text-cyber-muted cursor-help" />
                            <div className="absolute bottom-full right-0 mb-2 w-56 p-2 rounded-lg bg-cyber-dark border border-cyber-border text-xs text-cyber-muted opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                                {t('planner.autoTempHint')}
                            </div>
                        </div>
                    </div>

                    {/* 3. Ввод вопроса */}
                    <div>
                        <label className="flex items-center gap-2 text-sm text-cyber-muted mb-2">
                            <MessageSquare className="w-4 h-4 shrink-0" />
                            {t('planner.queryLabel')}
                        </label>
                        <textarea
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t('planner.queryPlaceholder')}
                            rows={3}
                            className="w-full bg-cyber-dark border border-cyber-border rounded-lg px-4 py-3 text-cyber-text focus:border-cyber-purple focus:outline-none transition-colors resize-none"
                        />
                    </div>

                    {/* 4. Быстрые вопросы */}
                    <div>
                        <p className="text-xs text-cyber-muted mb-2">{t('planner.quickQueries')}</p>
                        <div className="flex flex-wrap gap-2">
                            {quickQueries.map((q, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => setQuery(q)}
                                    className="text-xs px-3 py-1.5 rounded-full border border-cyber-border hover:border-cyber-purple hover:text-cyber-purple transition-colors"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 5. Отправить */}
                    <button
                        type="submit"
                        disabled={mutation.isPending}
                        className="w-full cyber-button flex items-center justify-center gap-2"
                    >
                        {mutation.isPending ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                        {t('planner.getForecast')}
                    </button>
                </form>
            </div>

            {/* Секция результата */}
            <div className="cyber-card">
                <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 min-w-0">
                    <span className="text-cyber-purple shrink-0">AI</span>
                    <span className="truncate">{t('planner.resultTitle')}</span>
                </h3>

                {result ? (
                    <div className="space-y-6">
                        {/* Основной прогноз */}
                        <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border">
                            <p className="text-cyber-text leading-relaxed">{result.prediction}</p>
                        </div>

                        {/* Метрики */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-lg bg-cyber-dark/50 border border-cyber-border min-w-0">
                                <p className="text-sm text-cyber-muted mb-1 truncate">{t('planner.forecastAQI')}</p>
                                <p className={`text-2xl font-bold ${result.aqi_prediction > 150 ? 'text-red-500' : result.aqi_prediction > 100 ? 'text-orange-500' : 'text-green-500'}`}>
                                    {result.aqi_prediction}
                                </p>
                            </div>
                            <div className="p-4 rounded-lg bg-cyber-dark/50 border border-cyber-border min-w-0">
                                <p className="text-sm text-cyber-muted mb-1 truncate">{t('planner.trafficIndex')}</p>
                                <p className={`text-2xl font-bold ${result.traffic_index_prediction > 70 ? 'text-red-500' : result.traffic_index_prediction > 50 ? 'text-orange-500' : 'text-green-500'}`}>
                                    {result.traffic_index_prediction}%
                                </p>
                            </div>
                        </div>

                        {/* Уверенность и обоснование */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm gap-2 min-w-0">
                                <span className="text-cyber-muted truncate">{t('planner.confidence')}</span>
                                <span className="text-cyber-cyan font-mono">
                                    {(result.confidence_score * 100).toFixed(0)}%
                                </span>
                            </div>
                            <div className="h-2 bg-cyber-border rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-cyber-cyan to-cyber-purple rounded-full"
                                    style={{ width: `${result.confidence_score * 100}%` }}
                                />
                            </div>
                        </div>

                        {/* График сравнения */}
                        <PredictionChart
                            currentAQI={currentData?.weather.aqi || 0}
                            predictedAQI={result.aqi_prediction}
                            currentTraffic={currentData?.traffic.congestion_index || 0}
                            predictedTraffic={result.traffic_index_prediction}
                        />

                        <div className="p-4 rounded-lg bg-cyber-dark/30 border border-cyber-border min-w-0">
                            <p className="text-xs text-cyber-muted mb-2">{t('planner.reasoning')}</p>
                            <p className="text-sm text-cyber-text break-words">{result.reasoning}</p>
                        </div>

                        {result.is_mock && (
                            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
                                <p className="text-xs text-yellow-500 break-words">{t('planner.demoNote')}</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-cyber-muted text-center px-4">
                        <Brain className="w-16 h-16 mb-4 opacity-30 shrink-0" />
                        <p className="break-words">{t('planner.emptyPrompt')}</p>
                        <p className="text-sm mt-2 break-words">{t('planner.emptySub')}</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default TripPlanner
