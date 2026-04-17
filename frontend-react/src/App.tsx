import { useState, useCallback, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { useTranslation } from 'react-i18next'
import {
    Activity,
    CloudSun,
    Download,
    Droplets,
    Gauge,
    Globe,
    LayoutGrid,
    Leaf,
    LineChart,
    CalendarRange,
    Recycle,
    Search,
    Settings,
    UserCircle2,
    Volume2,
    Wind,
    Zap,
    X,
    User,
    Lock
} from 'lucide-react'
import { api } from './services/api'
import type { YandexTrafficScore } from './components/map/AlmatyMap'
import AlmatyMap from './components/map/AlmatyMap'
import TripPlanner from './components/dashboard/TripPlanner'
import AnalyticsDashboard from './components/analytics/AnalyticsDashboard'
import ErrorBoundary from './components/ErrorBoundary'

const LANG_OPTIONS = [
    { code: 'ru', label: 'RU' },
    { code: 'en', label: 'EN' },
    { code: 'kk', label: 'KK' },
] as const

type TabType = 'monitor' | 'planner' | 'analytics'
type MapMode = 'arteries' | 'noise'
type LocaleKey = 'ru' | 'en' | 'kk'

type LocaleCopy = {
    searchPlaceholder: string
    report: string
    aiControl: string
    home: string
    sensors: string
    traffic: string
    security: string
    panelTitle: string
    cityLine: string
    updatedPrefix: string
    justNow: string
    minutesAgo: string
    hoursAgo: string
    onlineTitle: string
    onlineSubtitle: string
    roadsTab: string
    noiseTab: string
    liveLabel: string
    unknown: string
    trendDown: string
    trendGrowing: string
    optimal: string
    normal: string
    transportLoad: string
    waste: string
    energy: string
    cityNoise: string
    connectedTo: string
}

const MONITOR_COPY: Record<LocaleKey, LocaleCopy> = {
    ru: {
        searchPlaceholder: 'Поиск по городу...',
        report: 'Отчет',
        aiControl: 'AI контроль',
        home: 'Главная',
        sensors: 'Сенсоры',
        traffic: 'Трафик',
        security: 'Безопасность',
        panelTitle: 'Панель Мониторинга',
        cityLine: 'Алматы, Казахстан',
        updatedPrefix: 'Обновлено',
        justNow: 'только что',
        minutesAgo: 'мин назад',
        hoursAgo: 'ч назад',
        onlineTitle: 'СИСТЕМА ONLINE',
        onlineSubtitle: 'Стабильное подключение',
        roadsTab: 'Основные артерии',
        noiseTab: 'Датчики шума',
        liveLabel: 'LIVE ПОТОК: АБАЯ',
        unknown: 'Нет данных',
        trendDown: '-12%',
        trendGrowing: 'Растет',
        optimal: 'Оптимально',
        normal: 'Норма',
        transportLoad: 'Загрузка ОТ',
        waste: 'Утилизация ТБО',
        energy: 'Расход энергии',
        cityNoise: 'Городской шум',
        connectedTo: 'узлам',
    },
    en: {
        searchPlaceholder: 'Search city...',
        report: 'Report',
        aiControl: 'AI control',
        home: 'Home',
        sensors: 'Sensors',
        traffic: 'Traffic',
        security: 'Safety',
        panelTitle: 'Monitoring Dashboard',
        cityLine: 'Almaty, Kazakhstan',
        updatedPrefix: 'Updated',
        justNow: 'just now',
        minutesAgo: 'min ago',
        hoursAgo: 'h ago',
        onlineTitle: 'SYSTEM ONLINE',
        onlineSubtitle: 'Stable connection',
        roadsTab: 'Main arteries',
        noiseTab: 'Noise sensors',
        liveLabel: 'LIVE FEED: ABAY',
        unknown: 'No data',
        trendDown: '-12%',
        trendGrowing: 'Rising',
        optimal: 'Optimal',
        normal: 'Normal',
        transportLoad: 'Public Transit Load',
        waste: 'Waste Processing',
        energy: 'Energy Usage',
        cityNoise: 'City Noise',
        connectedTo: 'nodes',
    },
    kk: {
        searchPlaceholder: 'Қаланы іздеу...',
        report: 'Есеп',
        aiControl: 'AI бақылау',
        home: 'Басты бет',
        sensors: 'Сенсорлар',
        traffic: 'Трафик',
        security: 'Қауіпсіздік',
        panelTitle: 'Мониторинг панелі',
        cityLine: 'Алматы, Қазақстан',
        updatedPrefix: 'Жаңартылды',
        justNow: 'дәл қазір',
        minutesAgo: 'мин бұрын',
        hoursAgo: 'сағ бұрын',
        onlineTitle: 'ЖҮЙЕ ONLINE',
        onlineSubtitle: 'Тұрақты байланыс',
        roadsTab: 'Негізгі артериялар',
        noiseTab: 'Шу датчиктері',
        liveLabel: 'LIVE АҒЫН: АБАЙ',
        unknown: 'Дерек жоқ',
        trendDown: '-12%',
        trendGrowing: 'Өсуде',
        optimal: 'Оңтайлы',
        normal: 'Норма',
        transportLoad: 'Қоғамдық көлік жүктемесі',
        waste: 'Қалдықтарды өңдеу',
        energy: 'Энергия шығыны',
        cityNoise: 'Қала шуы',
        connectedTo: 'торапқа',
    },
}

function normalizeLocale(language: string): LocaleKey {
    if (language.startsWith('en')) return 'en'
    if (language.startsWith('kk')) return 'kk'
    return 'ru'
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function App() {
    const { t, i18n } = useTranslation()
    const [activeTab, setActiveTab] = useState<TabType>('monitor')
    const [mapMode, setMapMode] = useState<MapMode>('arteries')
    const [yandexScore, setYandexScore] = useState<YandexTrafficScore | null>(null)
    const [searchValue, setSearchValue] = useState('')

    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

    const localeCode = normalizeLocale(i18n.language)
    const copy = MONITOR_COPY[localeCode]

    useEffect(() => {
        document.documentElement.lang = i18n.language
    }, [i18n.language])

    const setLang = (code: string) => {
        if (code === 'ru' || code === 'en' || code === 'kk') {
            i18n.changeLanguage(code)
            try {
                localStorage.setItem('smartcity_lang', code)
            } catch { /* private mode */ }
        }
    }

    const { data: dashboardData, isLoading } = useQuery({
        queryKey: ['dashboard'],
        queryFn: api.getDashboard,
        refetchInterval: 30000,
    })

    const handleTrafficScore = useCallback((score: YandexTrafficScore) => {
        setYandexScore(score)
    }, [])

    const trafficData = useMemo(() => {
        if (!dashboardData?.traffic) return undefined
        if (!yandexScore) return dashboardData.traffic

        return {
            ...dashboardData.traffic,
            congestion_index: yandexScore.congestionIndex,
            congestion_level: yandexScore.congestionLevel,
            average_speed_kmh: yandexScore.averageSpeed,
            free_flow_speed_kmh: yandexScore.freeFlowSpeed,
            yandex_score: yandexScore.level,
        }
    }, [dashboardData?.traffic, yandexScore])

    const roadsCount = trafficData?.road_segments?.length ?? 0
    const incidents = trafficData?.incidents ?? []
    const isUsingMockApi = Boolean(dashboardData?.weather?.is_mock || trafficData?.is_mock)
    const weatherData = dashboardData?.weather

    const weatherTemp = weatherData ? Math.round(weatherData.temperature) : null
    const humidity = weatherData?.humidity ?? 0
    const windKmh = weatherData ? Math.round(weatherData.wind_speed * 3.6) : 0

    const congestionIndex = clamp(Math.round(trafficData?.congestion_index ?? 0), 0, 100)
    const trafficScore = clamp(Math.round(congestionIndex / 10), 1, 10)
    const avgSpeed = Math.round(trafficData?.average_speed_kmh ?? 0)
    const incidentsCount = trafficData?.incident_count ?? 0

    const translatedTrafficLevel = useMemo(() => {
        if (!trafficData?.congestion_level) return copy.unknown
        const key = `trafficLevel.${trafficData.congestion_level.toLowerCase()}`
        const translated = t(key)
        return translated !== key ? translated : trafficData.congestion_level
    }, [copy.unknown, t, trafficData?.congestion_level])

    const safeAqi = Number.isFinite(weatherData?.aqi)
        ? clamp(Math.round(weatherData?.aqi ?? 0), 0, 500)
        : 0

    const aqiStatus = useMemo(() => {
        if (safeAqi <= 50) {
            return { label: t('aqi.good'), tone: 'monitor-good', track: 25 }
        }
        if (safeAqi <= 100) {
            return { label: t('aqi.moderate'), tone: 'monitor-mid', track: 50 }
        }
        if (safeAqi <= 150) {
            return { label: t('aqi.unhealthySensitive'), tone: 'monitor-alert', track: 75 }
        }
        if (safeAqi <= 200) {
            return { label: t('aqi.unhealthy'), tone: 'monitor-danger', track: 86 }
        }
        return { label: t('aqi.veryUnhealthy'), tone: 'monitor-danger', track: 100 }
    }, [safeAqi, t])

    const updatedLabel = useMemo(() => {
        if (!dashboardData?.timestamp) {
            return `${copy.updatedPrefix} ${copy.justNow}`
        }

        const parsed = new Date(dashboardData.timestamp)
        if (Number.isNaN(parsed.getTime())) {
            return `${copy.updatedPrefix} ${copy.justNow}`
        }

        const diffMinutes = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000))
        if (diffMinutes < 1) {
            return `${copy.updatedPrefix} ${copy.justNow}`
        }
        if (diffMinutes < 60) {
            return `${copy.updatedPrefix} ${diffMinutes} ${copy.minutesAgo}`
        }

        const diffHours = Math.round(diffMinutes / 60)
        return `${copy.updatedPrefix} ${diffHours} ${copy.hoursAgo}`
    }, [copy.hoursAgo, copy.justNow, copy.minutesAgo, copy.updatedPrefix, dashboardData?.timestamp])

    const bottomMetrics = useMemo(() => {
        const congestionFactor = (trafficData?.congestion_index ?? 45) / 100
        const tempFactor = weatherData?.temperature ?? 18
        const energyMw = clamp(3.4 + congestionFactor * 1.5 + Math.max(0, tempFactor - 18) * 0.04, 3.2, 6.8)
        const cityNoiseDb = clamp(Math.round(50 + congestionFactor * 22), 45, 78)
        const transitLoad = clamp(Math.round(46 + congestionFactor * 45), 35, 95)
        const wasteRate = clamp(Math.round(91 - safeAqi * 0.05), 55, 95)

        return [
            {
                title: copy.energy,
                value: `${energyMw.toFixed(1)} MW`,
                note: copy.trendDown,
                icon: Zap,
                tone: 'monitor-good',
            },
            {
                title: copy.cityNoise,
                value: `${cityNoiseDb} dB`,
                note: copy.normal,
                icon: Volume2,
                tone: 'monitor-mid',
            },
            {
                title: copy.transportLoad,
                value: `${transitLoad}%`,
                note: copy.trendGrowing,
                icon: Gauge,
                tone: 'monitor-alert',
            },
            {
                title: copy.waste,
                value: `${wasteRate}%`,
                note: copy.optimal,
                icon: Recycle,
                tone: 'monitor-good',
            },
        ]
    }, [
        copy.cityNoise,
        copy.energy,
        copy.normal,
        copy.optimal,
        copy.transportLoad,
        copy.trendDown,
        copy.trendGrowing,
        copy.waste,
        safeAqi,
        trafficData?.congestion_index,
        weatherData?.temperature,
    ])

    const handleDownloadReport = useCallback(async () => {
        const reportElement = document.getElementById('pdf-report-template');
        if (!reportElement) return;

        setIsGeneratingPdf(true);
        await new Promise(resolve => setTimeout(resolve, 300));
        
        try {
            const canvas = await html2canvas(reportElement, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#020617', // slate-950
            });
            const imgData = canvas.toDataURL('image/jpeg', 1.0);

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`SmartCity_Report_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error('Failed to generate PDF:', error);
        } finally {
            setIsGeneratingPdf(false);
        }
    }, []);

    return (
        <div className="h-screen bg-slate-950 text-slate-200 font-sans selection:bg-cyan-500/30 flex overflow-hidden">

            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-900/20 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-900/20 blur-[120px]" />
            </div>


            <aside className="w-[320px] flex-shrink-0 flex flex-col border-r border-white/5 bg-slate-900/40 backdrop-blur-xl p-6 overflow-y-auto relative z-40">
                <div className="flex items-center gap-4 mb-10">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-blue-600/20 to-cyan-400/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                        <Activity className="w-7 h-7 text-cyan-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-400 tracking-tight leading-tight">{t('header.title')}</h2>
                        <p className="text-xs text-cyan-500/80 uppercase tracking-widest font-semibold mt-1">{copy.aiControl}</p>
                    </div>
                </div>

                <nav className="flex flex-col gap-2">
                    {[
                        { id: 'monitor', icon: LayoutGrid, label: t('nav.monitor') },
                        { id: 'analytics', icon: LineChart, label: t('nav.analytics') },
                        { id: 'planner', icon: CalendarRange, label: t('nav.planner') },
                    ].map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setActiveTab(item.id as TabType)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-[15px] transition-all cursor-pointer ${
                                activeTab === item.id 
                                ? 'bg-gradient-to-r from-cyan-500/10 to-transparent border border-cyan-500/20 text-cyan-300' 
                                : 'text-slate-400 border border-transparent hover:bg-slate-800/50 hover:text-slate-200'
                            }`}
                        >
                            <item.icon className="w-5 h-5" />
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="mt-auto p-5 rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/5 relative overflow-hidden group hover:border-cyan-500/30 transition-all">
                    <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 text-sm font-semibold text-cyan-400 tracking-wider mb-2">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse" />
                            {copy.onlineTitle}
                        </div>
                        <p className="text-slate-300 font-medium mb-1">{copy.onlineSubtitle}</p>
                        <p className="text-slate-500 text-sm">{roadsCount.toLocaleString()} {copy.connectedTo}</p>
                        {isUsingMockApi && (
                            <div className="mt-3 inline-flex px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-lg font-medium">
                                {t('common.demoMode')}
                            </div>
                        )}
                    </div>
                </div>
            </aside>


            <div className="flex-1 flex flex-col min-w-0 relative z-10">

                <header className="sticky top-0 flex items-center justify-end gap-6 px-6 py-4 bg-slate-900/80 backdrop-blur-xl border-b border-white/5 z-40">
                    <div className="flex items-center gap-3">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                            <input
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                                placeholder={copy.searchPlaceholder}
                                className="w-64 bg-slate-900/50 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                            />
                        </div>
                        
                        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/50 border border-white/10">
                            <Globe className="w-4 h-4 text-slate-500 mx-1" />
                            {LANG_OPTIONS.map(({ code, label }) => (
                                <button
                                    key={code}
                                    type="button"
                                    onClick={() => setLang(code)}
                                    className={`px-2 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                        i18n.language.startsWith(code)
                                        ? 'bg-cyan-500/20 text-cyan-300'
                                        : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        <button onClick={() => setIsSettingsOpen(true)} type="button" className="p-2 rounded-xl border border-white/10 bg-slate-900/50 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all cursor-pointer">
                            <Settings className="w-5 h-5" />
                        </button>
                        <button onClick={() => setIsProfileOpen(true)} type="button" className="p-2 rounded-xl border border-white/10 bg-slate-900/50 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all cursor-pointer">
                            <UserCircle2 className="w-5 h-5" />
                        </button>
                    </div>
                </header>


                {activeTab === 'monitor' && (
                    <main className="flex-1 overflow-y-auto flex flex-col scroll-smooth">
                        <div className="p-6 lg:p-8 pb-0 flex flex-col gap-6">

                            <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                            <div>
                                <h1 className="text-3xl lg:text-4xl font-bold text-white tracking-tight mb-2">{copy.panelTitle}</h1>
                                <p className="text-slate-400 text-sm font-medium flex items-center gap-2">
                                    <span className="text-slate-300">{copy.cityLine}</span>
                                    <span className="w-1 h-1 rounded-full bg-slate-600" />
                                    {updatedLabel}
                                </p>
                            </div>
                            <button disabled={isGeneratingPdf} onClick={handleDownloadReport} type="button" className={`inline-flex items-center gap-2 px-5 py-2.5 ${isGeneratingPdf ? 'bg-cyan-900/50 cursor-wait' : 'bg-slate-800 hover:bg-slate-700'} text-white rounded-xl font-medium border border-white/10 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5`}>
                                <Download className={`w-4 h-4 text-cyan-400 ${isGeneratingPdf ? 'animate-bounce' : ''}`} />
                                {isGeneratingPdf ? 'Generating...' : copy.report}
                            </button>
                        </section>


                        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                            <article className="p-6 rounded-3xl bg-slate-900/60 backdrop-blur-md border border-white/5 hover:border-cyan-500/30 transition-colors duration-300 group cursor-pointer">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{t('weather.title')}</p>
                                        <h3 className="text-xl font-bold text-white">{weatherData?.city ?? 'Almaty'}</h3>
                                    </div>
                                    <div className="w-10 h-10 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform">
                                        <CloudSun className="w-5 h-5" />
                                    </div>
                                </div>
                                <div className="flex items-end justify-between">
                                    <div className="flex items-start">
                                        <span className="text-5xl font-bold text-white tracking-tighter leading-none">{isLoading ? '--' : weatherTemp ?? '--'}</span>
                                        <span className="text-xl font-semibold text-slate-400 mt-1 ml-1">°C</span>
                                    </div>
                                    <div className="flex flex-col gap-1 text-sm font-medium text-slate-400">
                                        <div className="flex items-center gap-2 justify-end">
                                            <Droplets className="w-4 h-4 text-sky-400" />
                                            {humidity}%
                                        </div>
                                        <div className="flex items-center gap-2 justify-end">
                                            <Wind className="w-4 h-4 text-sky-400" />
                                            {windKmh} {t('traffic.kmh')}
                                        </div>
                                    </div>
                                </div>
                            </article>


                            <article className="p-6 rounded-3xl bg-slate-900/60 backdrop-blur-md border border-white/5 hover:border-emerald-500/30 transition-colors duration-300 group cursor-pointer">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{t('traffic.title')}</p>
                                        <h3 className="text-xl font-bold text-white">{translatedTrafficLevel}</h3>
                                    </div>
                                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400 font-bold text-lg">
                                        {trafficScore}
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center text-sm mb-2">
                                        <span className="text-slate-400">{t('traffic.avgSpeed')}</span>
                                        <strong className="text-white bg-slate-800 px-2 py-1 rounded-md">{avgSpeed} {t('traffic.kmh')}</strong>
                                    </div>
                                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-3">
                                        <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-300 rounded-full transition-all duration-1000" style={{ width: `${congestionIndex}%` }} />
                                    </div>
                                    <div className="flex justify-between items-center text-sm font-medium">
                                        <span className="text-slate-500">{t('traffic.incidents')}</span>
                                        <span className="text-slate-300">{incidentsCount}</span>
                                    </div>
                                </div>
                            </article>


                            <article className="p-6 rounded-3xl bg-slate-900/60 backdrop-blur-md border border-white/5 hover:border-amber-500/30 transition-colors duration-300 group cursor-pointer">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{t('aqi.title')}</p>
                                        <h3 className="text-xl font-bold text-white">{safeAqi > 0 ? `AQI ${safeAqi}` : copy.unknown}</h3>
                                    </div>
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-amber-400 bg-amber-500/10 group-hover:scale-110 transition-transform`}>
                                        <Leaf className="w-5 h-5" />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="font-semibold text-amber-400">{aqiStatus.label}</span>
                                        <strong className="text-sm text-slate-400 bg-slate-800 px-2 py-1 rounded-md">PM2.5</strong>
                                    </div>
                                    <div className="flex items-center gap-1 relative h-2">
                                        <div className="flex-1 h-full bg-emerald-400 rounded-l-full"></div>
                                        <div className="flex-1 h-full bg-amber-400"></div>
                                        <div className="flex-1 h-full bg-orange-500 rounded-r-full"></div>
                                        <div className="absolute top-1/2 -ml-1.5 w-3 h-3 rounded-full bg-white border-2 border-slate-900 transform -translate-y-1/2 shadow-sm transition-all duration-1000" style={{ left: `${aqiStatus.track}%` }} />
                                    </div>
                                </div>
                            </article>
                        </section>
                        </div>


                        <section className="relative w-full flex-1 min-h-[55vh] 2xl:min-h-[60vh] border-y border-white/10 bg-slate-950 mt-6 overflow-hidden shadow-2xl">
                            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between gap-4 p-4 lg:px-8 bg-gradient-to-b from-slate-950/80 to-transparent pointer-events-none">
                                <h2 className="text-2xl font-bold text-white tracking-tight pointer-events-auto drop-shadow-md">{t('map.title')}</h2>
                                <div className="flex p-1 bg-slate-900/80 backdrop-blur-md rounded-xl border border-white/10 pointer-events-auto shadow-lg">
                                    <button
                                        type="button"
                                        className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer ${
                                            mapMode === 'arteries' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
                                        }`}
                                        onClick={() => setMapMode('arteries')}
                                    >
                                        {copy.roadsTab}
                                    </button>
                                    <button
                                        type="button"
                                        className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer ${
                                            mapMode === 'noise' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
                                        }`}
                                        onClick={() => setMapMode('noise')}
                                    >
                                        {copy.noiseTab}
                                    </button>
                                </div>
                            </div>

                            <div className="absolute inset-0 z-10">
                                <div className="w-full h-full">
                                    <ErrorBoundary>
                                        <AlmatyMap
                                            roadSegments={trafficData?.road_segments || []}
                                            incidents={incidents}
                                            onTrafficScore={handleTrafficScore}
                                        />
                                    </ErrorBoundary>
                                </div>


                                <div className="absolute inset-x-0 bottom-0 pointer-events-none p-4 pb-6 lg:px-8 flex justify-between items-end z-20 bg-gradient-to-t from-slate-950/80 to-transparent">
                                    <div className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-900/80 backdrop-blur border border-white/10 shadow-lg">
                                        <span className="flex items-center gap-2 text-xs font-medium text-slate-300"><span className="w-3 h-1 rounded-full bg-emerald-400"></span>{t('map.freeFlow')}</span>
                                        <span className="flex items-center gap-2 text-xs font-medium text-slate-300"><span className="w-3 h-1 rounded-full bg-amber-400"></span>{t('trafficLevel.light')}</span>
                                        <span className="flex items-center gap-2 text-xs font-medium text-slate-300"><span className="w-3 h-1 rounded-full bg-orange-500"></span>{t('map.jam')}</span>
                                    </div>
                                    
                                    <div className="pointer-events-auto w-[280px] rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur p-3 shadow-xl transform hover:-translate-y-1 transition-transform duration-300 cursor-pointer">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-cyan-400 tracking-wider hover:text-cyan-300">{copy.liveLabel}</span>
                                            <span className="text-[10px] uppercase font-bold text-rose-200 bg-rose-500/80 px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-[0_0_10px_rgba(244,63,94,0.4)]">
                                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                                                REC
                                            </span>
                                        </div>
                                        <div className="aspect-video rounded-xl bg-slate-950 relative overflow-hidden flex items-center justify-center border border-white/5">
                                            <video 
                                                src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" 
                                                autoPlay loop muted playsInline 
                                                className="absolute inset-0 w-full h-full object-cover" 
                                            />

                                            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/10 to-transparent w-full h-[10px] monitor-scanline opacity-50" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>


                        <div className="p-6 lg:p-8 pt-6">
                            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 pb-6">
                                {bottomMetrics.map((metric) => {
                                const MetricIcon = metric.icon;
                                const tones: Record<string, string> = {
                                    'monitor-good': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                                    'monitor-mid': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                                    'monitor-alert': 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                                };
                                const textTones: Record<string, string> = {
                                    'monitor-good': 'text-emerald-400',
                                    'monitor-mid': 'text-amber-400',
                                    'monitor-alert': 'text-orange-400'
                                };
                                return (
                                    <article key={metric.title} className="p-4 flex flex-col justify-between rounded-3xl bg-slate-900/60 backdrop-blur-md border border-white/5 hover:border-white/20 transition-all cursor-pointer group hover:-translate-y-1">
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">{metric.title}</p>
                                        <div className="flex items-end justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-xl border ${tones[metric.tone]} group-hover:scale-110 transition-transform`}>
                                                    <MetricIcon className="w-4 h-4" />
                                                </div>
                                                <strong className="text-xl font-bold text-white tracking-tight">{metric.value}</strong>
                                            </div>
                                            <span className={`text-xs font-semibold ${textTones[metric.tone]} bg-slate-800/80 px-2 py-1 rounded border border-white/5`}>{metric.note}</span>
                                        </div>
                                    </article>
                                );
                            })}
                            </section>
                        </div>
                    </main>
                )}

                {activeTab === 'analytics' && (
                    <main className="flex-1 overflow-y-auto p-6 lg:p-10 scroll-smooth">
                        <ErrorBoundary>
                            <AnalyticsDashboard />
                        </ErrorBoundary>
                    </main>
                )}
                
                {activeTab === 'planner' && (
                    <main className="flex-1 overflow-y-auto p-6 lg:p-10 scroll-smooth">
                        <ErrorBoundary>
                            <TripPlanner />
                        </ErrorBoundary>
                    </main>
                )}
            </div>
            

            {isSettingsOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-slate-800/50">
                            <div className="flex items-center gap-3 text-cyan-400">
                                <Settings className="w-5 h-5" />
                                <h3 className="font-bold tracking-wide">Settings Dashboard</h3>
                            </div>
                            <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 flex flex-col gap-5">
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-slate-300">Theme Preference</label>
                                <div className="flex gap-2">
                                    <button className="flex-1 py-2 rounded-xl bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 font-medium text-sm">Dark Neon</button>
                                    <button className="flex-1 py-2 rounded-xl bg-slate-800 border border-white/5 text-slate-400 hover:text-white font-medium text-sm">Classic Light</button>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-slate-300">Data Auto-Refresh Interval</label>
                                <select className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2 text-slate-200 outline-none focus:border-cyan-500/50">
                                    <option>Real-time (Live)</option>
                                    <option>Every 30 seconds</option>
                                    <option>Every 5 minutes</option>
                                </select>
                            </div>
                            <button onClick={() => setIsSettingsOpen(false)} className="mt-2 w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all active:scale-95">
                                Save Settings
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {isProfileOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
                    <div className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        <div className="flex justify-end p-4">
                            <button onClick={() => setIsProfileOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-6 pb-6 flex flex-col items-center">
                            <div className="w-24 h-24 rounded-full border-4 border-cyan-500/30 bg-slate-800 flex items-center justify-center shadow-xl shadow-cyan-500/10 mb-4">
                                <User className="w-12 h-12 text-cyan-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-1">City Admin</h3>
                            <p className="text-sm text-cyan-500/80 uppercase tracking-widest font-semibold mb-6">System Operator</p>
                            
                            <div className="w-full space-y-2">
                                <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800 transition-colors text-slate-300 hover:text-white border border-transparent hover:border-white/5 cursor-pointer">
                                    <User className="w-4 h-4 text-slate-400" /> Edit Profile
                                </button>
                                <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800 transition-colors text-slate-300 hover:text-white border border-transparent hover:border-white/5 cursor-pointer">
                                    <Lock className="w-4 h-4 text-slate-400" /> Privacy & Security
                                </button>
                            </div>
                            <hr className="w-full border-white/5 my-4" />
                            <button onClick={() => setIsProfileOpen(false)} className="w-full py-2 text-rose-400 hover:text-rose-300 font-semibold text-sm cursor-pointer">
                                System Logout
                            </button>
                        </div>
                    </div>
                </div>
            )}


            <div className="fixed -left-[9999px]">
                <div id="pdf-report-template" className="w-[800px] min-h-[1131px] bg-slate-950 p-12 flex flex-col font-sans text-slate-200">
                    <div className="flex items-center gap-4 mb-8 pb-8 border-b border-white/10">
                        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-cyan-500/30 flex items-center justify-center">
                            <Activity className="w-8 h-8 text-cyan-400" />
                        </div>
                        <div className="flex-1">
                            <h1 className="text-4xl font-bold text-white tracking-tight">AI Smart City Report</h1>
                            <p className="text-cyan-400 font-semibold tracking-widest mt-1">OFFICIAL SYSTEM LOG</p>
                        </div>
                        <div className="text-right">
                            <p className="text-slate-400 font-medium tracking-wide">Date: {new Date().toLocaleDateString()}</p>
                            <p className="text-slate-500 text-sm tracking-widest mt-1">Almaty, KZ</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-8">
                        <div className="bg-slate-900 border border-white/10 p-6 rounded-3xl">
                            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Overall Traffic Score</h2>
                            <p className="text-5xl font-bold text-emerald-400">{trafficScore}/10</p>
                            <p className="text-slate-400 mt-2 font-medium">{translatedTrafficLevel}</p>
                        </div>
                        <div className="bg-slate-900 border border-white/10 p-6 rounded-3xl">
                            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Average Moving Speed</h2>
                            <p className="text-5xl font-bold text-white">{avgSpeed} <span className="text-2xl text-slate-500 font-normal">km/h</span></p>
                            <p className="text-slate-400 mt-2 font-medium">Active Incidents: <span className="text-rose-400">{incidentsCount}</span></p>
                        </div>
                    </div>

                    <h2 className="text-xl font-bold text-white mb-4 border-l-4 border-cyan-500 pl-4">Environmental KPIs</h2>
                    <div className="grid grid-cols-3 gap-4 mb-8">
                        <div className="bg-slate-900 border border-white/5 p-5 rounded-2xl flex flex-col items-center justify-center text-center">
                            <Wind className="w-8 h-8 text-sky-400 mb-2" />
                            <p className="text-3xl font-bold text-white">{safeAqi}</p>
                            <p className="text-xs text-slate-500 uppercase mt-1 tracking-wider">Air Quality Idx</p>
                        </div>
                        <div className="bg-slate-900 border border-white/5 p-5 rounded-2xl flex flex-col items-center justify-center text-center">
                            <CloudSun className="w-8 h-8 text-amber-400 mb-2" />
                            <p className="text-3xl font-bold text-white">{weatherTemp}°C</p>
                            <p className="text-xs text-slate-500 uppercase mt-1 tracking-wider">Temperature</p>
                        </div>
                        <div className="bg-slate-900 border border-white/5 p-5 rounded-2xl flex flex-col items-center justify-center text-center">
                            <Droplets className="w-8 h-8 text-blue-400 mb-2" />
                            <p className="text-3xl font-bold text-white">{humidity}%</p>
                            <p className="text-xs text-slate-500 uppercase mt-1 tracking-wider">Humidity</p>
                        </div>
                    </div>

                    <h2 className="text-xl font-bold text-white mb-4 border-l-4 border-emerald-500 pl-4">City Infrastructure</h2>
                    <div className="bg-slate-900 border border-white/10 p-6 rounded-3xl mb-auto">
                        <table className="w-full text-left text-sm">
                            <tbody>
                                <tr className="border-b border-white/5">
                                    <td className="py-4 text-slate-400 font-medium text-base">Total Active Sensors (Roads)</td>
                                    <td className="py-4 font-bold text-right text-white text-lg">{roadsCount.toLocaleString()}</td>
                                </tr>
                                <tr className="border-b border-white/5">
                                    <td className="py-4 text-slate-400 font-medium text-base">Data Synchronization</td>
                                    <td className="py-4 font-bold text-right text-emerald-400 text-lg">ONLINE (Stable)</td>
                                </tr>
                                <tr>
                                    <td className="py-4 text-slate-400 font-medium text-base">API Mode</td>
                                    <td className="py-4 font-bold text-right text-amber-400 text-lg">{isUsingMockApi ? 'Demo / Simulation' : 'Live Gateway'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-8 pt-8 border-t border-white/10 text-center flex flex-col items-center">
                        <div className="flex gap-2 justify-center italic text-slate-600 font-serif mb-2 text-lg">
                            <span>CONFIDENTIAL</span> • <span>FOR INTERNAL USE ONLY</span>
                        </div>
                        <p className="text-sm text-slate-700">Generated automatically by AI Smart City Monitoring Platform.</p>
                    </div>
                </div>
            </div>

        </div>
    )
}

export default App

