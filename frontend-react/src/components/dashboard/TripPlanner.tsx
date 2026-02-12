import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Brain, Send, Loader2, Calendar, Thermometer, MessageSquare } from 'lucide-react'
import { api, type PredictionResponse, type PredictionRequest } from '../../services/api'
import PredictionChart from './PredictionChart'

function TripPlanner() {
    const [query, setQuery] = useState('')
    const [date, setDate] = useState('')
    const [temperature, setTemperature] = useState<string>('')
    const [result, setResult] = useState<PredictionResponse | null>(null)

    // Получаем текущие данные для сравнения
    const { data: currentData } = useQuery({
        queryKey: ['dashboard'],
        queryFn: api.getDashboard,
        staleTime: 60000 // Используем кэшированные данные данные 1 минуту
    })

    const mutation = useMutation({
        mutationFn: (request: PredictionRequest) => api.predict(request),
        onSuccess: (data) => setResult(data),
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        const request: PredictionRequest = {}
        if (date) request.date = date
        if (temperature) request.temperature = parseFloat(temperature)
        if (query) request.query = query

        mutation.mutate(request)
    }

    const quickQueries = [
        "Когда лучше всего ехать завтра?",
        "Нужна ли мне маска сегодня?",
        "Подходит ли погода для прогулки?",
        "Прогноз пробок на вечер пятницы",
    ]

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Секция ввода */}
            <div className="cyber-card">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyber-purple to-cyber-pink flex items-center justify-center">
                        <Brain className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">AI Планировщик поездок</h2>
                        <p className="text-sm text-cyber-muted">Прогнозы для условий Алматы</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Ввод даты */}
                    <div>
                        <label className="flex items-center gap-2 text-sm text-cyber-muted mb-2">
                            <Calendar className="w-4 h-4" />
                            Дата поездки (необязательно)
                        </label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full bg-cyber-dark border border-cyber-border rounded-lg px-4 py-3 text-cyber-text focus:border-cyber-purple focus:outline-none transition-colors"
                        />
                    </div>

                    {/* Ввод температуры */}
                    <div>
                        <label className="flex items-center gap-2 text-sm text-cyber-muted mb-2">
                            <Thermometer className="w-4 h-4" />
                            Ожидаемая температура °C (необязательно)
                        </label>
                        <input
                            type="number"
                            value={temperature}
                            onChange={(e) => setTemperature(e.target.value)}
                            placeholder="-10"
                            className="w-full bg-cyber-dark border border-cyber-border rounded-lg px-4 py-3 text-cyber-text focus:border-cyber-purple focus:outline-none transition-colors"
                        />
                    </div>

                    {/* Ввод вопроса */}
                    <div>
                        <label className="flex items-center gap-2 text-sm text-cyber-muted mb-2">
                            <MessageSquare className="w-4 h-4" />
                            Ваш вопрос
                        </label>
                        <textarea
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Спросите о трафике, качестве воздуха или лучшем времени для поездки..."
                            rows={3}
                            className="w-full bg-cyber-dark border border-cyber-border rounded-lg px-4 py-3 text-cyber-text focus:border-cyber-purple focus:outline-none transition-colors resize-none"
                        />
                    </div>

                    {/* Быстрые вопросы */}
                    <div>
                        <p className="text-xs text-cyber-muted mb-2">Быстрые вопросы:</p>
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

                    {/* Отправить */}
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
                        Получить прогноз
                    </button>
                </form>
            </div>

            {/* Секция результата */}
            <div className="cyber-card">
                <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <span className="text-cyber-purple">AI</span> Результат прогноза
                </h3>

                {result ? (
                    <div className="space-y-6">
                        {/* Основной прогноз */}
                        <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border">
                            <p className="text-cyber-text leading-relaxed">{result.prediction}</p>
                        </div>

                        {/* Метрики */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-lg bg-cyber-dark/50 border border-cyber-border">
                                <p className="text-sm text-cyber-muted mb-1">Прогноз AQI</p>
                                <p className={`text-2xl font-bold ${result.aqi_prediction > 150 ? 'text-red-500' : result.aqi_prediction > 100 ? 'text-orange-500' : 'text-green-500'}`}>
                                    {result.aqi_prediction}
                                </p>
                            </div>
                            <div className="p-4 rounded-lg bg-cyber-dark/50 border border-cyber-border">
                                <p className="text-sm text-cyber-muted mb-1">Индекс пробок</p>
                                <p className={`text-2xl font-bold ${result.traffic_index_prediction > 70 ? 'text-red-500' : result.traffic_index_prediction > 50 ? 'text-orange-500' : 'text-green-500'}`}>
                                    {result.traffic_index_prediction}%
                                </p>
                            </div>
                        </div>

                        {/* Уверенность и обоснование */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-cyber-muted">Уверенность прогноза</span>
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

                        <div className="p-4 rounded-lg bg-cyber-dark/30 border border-cyber-border">
                            <p className="text-xs text-cyber-muted mb-2">Обоснование</p>
                            <p className="text-sm text-cyber-text">{result.reasoning}</p>
                        </div>

                        {result.is_mock && (
                            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
                                <p className="text-xs text-yellow-500">
                                    Демо режим — прогноз на основе исторических данных
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-cyber-muted">
                        <Brain className="w-16 h-16 mb-4 opacity-30" />
                        <p>Введите вопрос для получения AI-прогноза</p>
                        <p className="text-sm mt-2">На основе исторических данных Алматы</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default TripPlanner
