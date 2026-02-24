import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Incident } from '../../services/api'

/** Yandex traffic score payload sent via onTrafficScore callback */
export interface YandexTrafficScore {
    /** Yandex 0-10 score (0 = no data, 1-10 = congestion) */
    level: number
    /** Estimated congestion index 0-100 derived from Yandex score */
    congestionIndex: number
    /** Human-readable congestion level */
    congestionLevel: string
    /** Estimated average speed km/h */
    averageSpeed: number
    /** Free-flow baseline speed km/h */
    freeFlowSpeed: number
}

interface AlmatyMapProps {
    roadSegments: unknown[] // kept for interface compat, Yandex shows its own traffic
    incidents?: Incident[]
    /** Called when Yandex traffic score changes (real-time, every ~60s) */
    onTrafficScore?: (score: YandexTrafficScore) => void
}

// Координаты центра Алматы
const ALMATY_CENTER: [number, number] = [43.2389, 76.8897] // [lat, lon] for Yandex

// Yandex Maps API key (получить на developer.tech.yandex.ru)
const YANDEX_API_KEY = import.meta.env.VITE_YANDEX_MAPS_API_KEY || ''

// Global state: prevent multiple script loads
let ymapsPromise: Promise<void> | null = null

/**
 * Load Yandex Maps JS API v2.1 once, return a Promise that resolves when ymaps.ready() fires.
 */
function loadYandexMaps(lang: string = 'ru'): Promise<void> {
    // Map i18n codes to Yandex lang codes
    const langMap: Record<string, string> = { ru: 'ru_RU', en: 'en_US', kk: 'ru_RU' }
    const ymLang = langMap[lang] || 'ru_RU'

    if (ymapsPromise) return ymapsPromise

    ymapsPromise = new Promise((resolve, reject) => {
        // Already loaded (e.g. via index.html)
        if (window.ymaps) {
            window.ymaps.ready(resolve)
            return
        }

        const script = document.createElement('script')
        const keyPart = YANDEX_API_KEY ? `apikey=${YANDEX_API_KEY}&` : ''
        script.src = `https://api-maps.yandex.ru/2.1/?${keyPart}lang=${ymLang}`
        script.async = true
        script.onload = () => {
            window.ymaps.ready(resolve)
        }
        script.onerror = () => {
            ymapsPromise = null
            reject(new Error('Failed to load Yandex Maps API'))
        }
        document.head.appendChild(script)
    })

    return ymapsPromise
}

function incidentEmoji(type: string): string {
    switch (type) {
        case 'accident': return '🚨'
        case 'roadwork': return '🚧'
        case 'police': return '👮'
        default: return '⚠️'
    }
}

function getIncidentLabelKey(type: string): 'map.accident' | 'map.roadwork' | 'map.police' | 'map.event' {
    switch (type) {
        case 'accident': return 'map.accident'
        case 'roadwork': return 'map.roadwork'
        case 'police': return 'map.police'
        default: return 'map.event'
    }
}

/**
 * Convert Yandex 1-10 score to our traffic metrics.
 * Mapping:
 *   1-2  → Free Flow  (0-20%)
 *   3-4  → Light      (20-40%)
 *   5-6  → Moderate   (40-60%)
 *   7-8  → Heavy      (60-80%)
 *   9-10 → Severe     (80-100%)
 */
function yandexScoreToMetrics(level: number): YandexTrafficScore {
    const ALMATY_FREE_FLOW = 55 // km/h baseline
    const clamped = Math.max(0, Math.min(10, level))
    const congestionIndex = clamped * 10 // 1→10%, 5→50%, 10→100%
    const averageSpeed = Math.round(ALMATY_FREE_FLOW * (1 - congestionIndex / 100) * 10) / 10

    let congestionLevel: string
    if (congestionIndex >= 80) congestionLevel = 'Severe'
    else if (congestionIndex >= 60) congestionLevel = 'Heavy'
    else if (congestionIndex >= 40) congestionLevel = 'Moderate'
    else if (congestionIndex >= 15) congestionLevel = 'Light'
    else congestionLevel = 'Free Flow'

    return {
        level: clamped,
        congestionIndex,
        congestionLevel,
        averageSpeed,
        freeFlowSpeed: ALMATY_FREE_FLOW,
    }
}

function AlmatyMap({ roadSegments: _roadSegments, incidents = [], onTrafficScore }: AlmatyMapProps) {
    const { t, i18n } = useTranslation()
    const containerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<any>(null)
    const incidentsCollectionRef = useRef<any>(null)
    const [mapReady, setMapReady] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const onTrafficScoreRef = useRef(onTrafficScore)
    onTrafficScoreRef.current = onTrafficScore

    // Initialize Yandex Map
    useEffect(() => {
        let destroyed = false

        loadYandexMaps(i18n.language)
            .then(() => {
                if (destroyed || !containerRef.current) return
                if (mapRef.current) return // already created

                const ymaps = window.ymaps

                const map = new ymaps.Map(containerRef.current, {
                    center: ALMATY_CENTER,
                    zoom: 12,
                    controls: ['zoomControl', 'geolocationControl'],
                    type: 'yandex#map',
                }, {
                    suppressMapOpenBlock: true, // hide "Open in Yandex Maps" popup
                })

                // --- Traffic layer (colored roads + incidents from Yandex) ---
                const trafficControl = new ymaps.control.TrafficControl({
                    state: { providerKey: 'traffic#actual', trafficShown: true },
                })
                map.controls.add(trafficControl)
                // Auto-show traffic
                const provider = trafficControl.getProvider('traffic#actual')
                provider.state.set('infoLayerShown', true)

                // --- Extract real Yandex traffic score (1-10) ---
                const emitScore = () => {
                    const level = provider.state.get('level')
                    if (level != null && typeof level === 'number' && level > 0) {
                        const metrics = yandexScoreToMetrics(level)
                        onTrafficScoreRef.current?.(metrics)
                    }
                }
                // Listen for score changes (updates ~every 60s)
                provider.state.events.add('change', emitScore)
                // Also try to read initial value after a short delay
                setTimeout(emitScore, 3000)

                // Create a GeoObjectCollection for TomTom incidents overlay
                const incidentsCollection = new ymaps.GeoObjectCollection()
                map.geoObjects.add(incidentsCollection)
                incidentsCollectionRef.current = incidentsCollection

                mapRef.current = map
                setMapReady(true)
            })
            .catch((err) => {
                if (!destroyed) {
                    setLoadError(err?.message || t('map.loadError'))
                }
            })

        return () => {
            destroyed = true
            if (mapRef.current) {
                mapRef.current.destroy()
                mapRef.current = null
            }
        }
    }, [])

    // Update TomTom incident markers on the Yandex map
    const updateIncidents = useCallback(() => {
        if (!mapReady || !incidentsCollectionRef.current || !window.ymaps) return

        const collection = incidentsCollectionRef.current
        collection.removeAll()

        incidents.forEach((inc) => {
            const label = t(getIncidentLabelKey(inc.type))
            const placemark = new window.ymaps.Placemark(
                [inc.lat, inc.lon],
                {
                    iconCaption: label,
                    balloonContentHeader: `${incidentEmoji(inc.type)} ${label}`,
                    balloonContentBody: inc.description,
                },
                {
                    preset: inc.type === 'accident'
                        ? 'islands#redDotIcon'
                        : inc.type === 'roadwork'
                            ? 'islands#orangeDotIcon'
                            : 'islands#blueDotIcon',
                }
            )
            collection.add(placemark)
        })
    }, [incidents, mapReady, t])

    useEffect(() => {
        updateIncidents()
    }, [updateIncidents])

    // Error state
    if (loadError) {
        return (
            <div className="relative w-full h-full rounded-lg overflow-hidden flex items-center justify-center bg-cyber-dark">
                <div className="text-center px-4">
                    <p className="text-red-400 text-sm mb-2 break-words">⚠️ {loadError}</p>
                    <p className="text-cyber-muted text-xs break-words">
                        {t('map.checkApiKey')}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="relative w-full h-full rounded-lg overflow-hidden">
            {/* Yandex Map container */}
            <div ref={containerRef} className="w-full h-full" />

            {/* Заголовок карты */}
            <div className="absolute top-4 left-4 bg-cyber-dark/80 backdrop-blur-sm rounded-lg px-4 py-2 border border-cyber-border z-10 pointer-events-none">
                <div className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-cyber-cyan live-pulse shrink-0" />
                    <span className="text-cyber-muted truncate">{t('map.yandexLive')}</span>
                </div>
            </div>

            <div className="absolute bottom-4 right-4 bg-cyber-dark/80 backdrop-blur-sm rounded-lg p-3 border border-cyber-border z-10 pointer-events-none max-w-[220px]">
                <p className="text-xs text-cyber-muted mb-2 font-medium truncate">{t('map.congestionLegend')}</p>
                <div className="flex items-center gap-1">
                    <div className="w-8 h-[5px] rounded-full shrink-0" style={{ background: '#20b020' }} />
                    <div className="w-8 h-[5px] rounded-full shrink-0" style={{ background: '#ffd500' }} />
                    <div className="w-8 h-[5px] rounded-full shrink-0" style={{ background: '#ff5500' }} />
                    <div className="w-8 h-[5px] rounded-full shrink-0" style={{ background: '#b00000' }} />
                </div>
                <div className="flex justify-between text-[10px] text-cyber-muted mt-1">
                    <span>{t('map.freeFlow')}</span>
                    <span>{t('map.jam')}</span>
                </div>

                {incidents.length > 0 && (
                    <>
                        <div className="border-t border-cyber-border my-2" />
                        <p className="text-xs text-cyber-muted mb-1 font-medium truncate">{t('map.incidentsTomTom')}</p>
                        <div className="flex flex-col gap-1 text-[11px]">
                            <span>🚨 {t('map.accident')}</span>
                            <span>🚧 {t('map.roadwork')}</span>
                            <span>👮 {t('map.police')}</span>
                        </div>
                    </>
                )}
            </div>

            <div className="absolute bottom-4 left-4 text-xs text-cyber-muted font-mono z-10 pointer-events-none truncate max-w-full">
                🚦 {t('map.trafficYandexIncidents', { count: incidents.length })}
            </div>
        </div>
    )
}

export default AlmatyMap

// Declare ymaps on window for TypeScript
declare global {
    interface Window {
        ymaps: any
    }
}
