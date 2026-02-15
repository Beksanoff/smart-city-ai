import { useMemo, useState, useCallback } from 'react'
import Map, { NavigationControl } from 'react-map-gl/maplibre'
import DeckGL from '@deck.gl/react'
import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { RoadSegment, Incident } from '../../services/api'

interface AlmatyMapProps {
    roadSegments: RoadSegment[]
    incidents?: Incident[]
}

// Координаты центра Алматы
const ALMATY_CENTER = {
    latitude: 43.2389,
    longitude: 76.8897,
}

const INITIAL_VIEW_STATE = {
    ...ALMATY_CENTER,
    zoom: 12,
    pitch: 0,
    bearing: 0,
}

// CARTO dark-matter — бесплатные тайлы
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

/** Плавная интерполяция цвета congestion: 0→зелёный, 0.5→жёлтый, 0.75→оранж, 1→красный */
function congestionToColor(c: number): [number, number, number, number] {
    const v = Math.max(0, Math.min(1, c))
    if (v < 0.35) {
        // green → yellow-green
        const t = v / 0.35
        return [Math.round(34 + t * (180 - 34)), Math.round(197 - t * (197 - 200)), Math.round(94 - t * 74), 220]
    }
    if (v < 0.55) {
        // yellow-green → yellow
        const t = (v - 0.35) / 0.2
        return [Math.round(180 + t * (234 - 180)), Math.round(200 - t * (200 - 179)), Math.round(20 - t * 12), 230]
    }
    if (v < 0.75) {
        // yellow → orange
        const t = (v - 0.55) / 0.2
        return [Math.round(234 + t * (249 - 234)), Math.round(179 - t * (179 - 115)), Math.round(8 + t * (22 - 8)), 240]
    }
    // orange → red
    const t = (v - 0.75) / 0.25
    return [Math.round(249 - t * (249 - 220)), Math.round(115 - t * (115 - 38)), Math.round(22 - t * 22), 255]
}

function incidentEmoji(type: string): string {
    switch (type) {
        case 'accident': return '🚨'
        case 'roadwork': return '🚧'
        case 'police': return '👮'
        default: return '⚠️'
    }
}

function incidentColor(type: string): [number, number, number] {
    switch (type) {
        case 'accident': return [255, 50, 50]
        case 'roadwork': return [255, 165, 0]
        case 'police': return [80, 120, 255]
        default: return [255, 255, 255]
    }
}

function incidentLabel(type: string): string {
    switch (type) {
        case 'accident': return 'ДТП'
        case 'roadwork': return 'Ремонт'
        case 'police': return 'Полиция'
        default: return 'Событие'
    }
}

interface TooltipInfo {
    x: number
    y: number
    text: string
}

function AlmatyMap({ roadSegments, incidents = [] }: AlmatyMapProps) {
    const [viewState, setViewState] = useState(INITIAL_VIEW_STATE)
    const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)

    const onViewStateChange = useCallback(({ viewState: newViewState }: { viewState: typeof INITIAL_VIEW_STATE }) => {
        setViewState(newViewState)
    }, [])

    const layers = useMemo(() => {
        const result: any[] = []

        // --- Road segments (colored lines like Google/Yandex traffic) ---
        if (roadSegments.length > 0) {
            // Background glow layer (wider, semi-transparent)
            result.push(
                new PathLayer({
                    id: 'road-glow',
                    data: roadSegments,
                    getPath: (d: RoadSegment) => d.path,
                    getColor: (d: RoadSegment) => {
                        const c = congestionToColor(d.congestion)
                        return [c[0], c[1], c[2], 60] as [number, number, number, number]
                    },
                    getWidth: 18,
                    widthUnits: 'pixels' as const,
                    widthMinPixels: 6,
                    widthMaxPixels: 24,
                    capRounded: true,
                    jointRounded: true,
                    pickable: false,
                })
            )

            // Main road layer
            result.push(
                new PathLayer({
                    id: 'road-segments',
                    data: roadSegments,
                    getPath: (d: RoadSegment) => d.path,
                    getColor: (d: RoadSegment) => congestionToColor(d.congestion),
                    getWidth: 6,
                    widthUnits: 'pixels' as const,
                    widthMinPixels: 2,
                    widthMaxPixels: 10,
                    capRounded: true,
                    jointRounded: true,
                    pickable: true,
                    autoHighlight: true,
                    highlightColor: [255, 255, 255, 80],
                    onHover: (info: { object?: RoadSegment; x?: number; y?: number }) => {
                        if (info.object && info.x != null && info.y != null) {
                            const d = info.object
                            const pct = Math.round(d.congestion * 100)
                            setTooltip({
                                x: info.x,
                                y: info.y,
                                text: `${d.name}\nЗагруженность: ${pct}%\nСкорость: ${d.speed} км/ч (${d.free_flow} км/ч свободный)`,
                            })
                        } else {
                            setTooltip(null)
                        }
                    },
                })
            )
        }

        // --- Incidents ---
        if (incidents.length > 0) {
            // Glow ring behind incident
            result.push(
                new ScatterplotLayer({
                    id: 'incident-glow',
                    data: incidents,
                    getPosition: (d: Incident) => [d.lon, d.lat],
                    getRadius: 200,
                    getFillColor: (d: Incident) => [...incidentColor(d.type), 40] as [number, number, number, number],
                    radiusMinPixels: 12,
                    radiusMaxPixels: 30,
                    pickable: false,
                })
            )

            // Solid dot
            result.push(
                new ScatterplotLayer({
                    id: 'incident-dot',
                    data: incidents,
                    getPosition: (d: Incident) => [d.lon, d.lat],
                    getRadius: 80,
                    getFillColor: (d: Incident) => [...incidentColor(d.type), 230] as [number, number, number, number],
                    getLineColor: [255, 255, 255, 180],
                    lineWidthMinPixels: 1,
                    stroked: true,
                    radiusMinPixels: 5,
                    radiusMaxPixels: 12,
                    pickable: true,
                    onHover: (info: { object?: Incident; x?: number; y?: number }) => {
                        if (info.object && info.x != null && info.y != null) {
                            const d = info.object
                            setTooltip({
                                x: info.x,
                                y: info.y,
                                text: `${incidentEmoji(d.type)} ${incidentLabel(d.type)}\n${d.description}`,
                            })
                        } else {
                            setTooltip(null)
                        }
                    },
                })
            )

            // Emoji icon above incident
            result.push(
                new TextLayer({
                    id: 'incident-emoji',
                    data: incidents,
                    getPosition: (d: Incident) => [d.lon, d.lat],
                    getText: (d: Incident) => incidentEmoji(d.type),
                    getSize: 22,
                    getPixelOffset: [0, -18],
                    pickable: false,
                })
            )
        }

        return result
    }, [roadSegments, incidents])

    return (
        <div className="relative w-full h-full rounded-lg overflow-hidden">
            <DeckGL
                viewState={viewState}
                onViewStateChange={onViewStateChange}
                controller={true}
                layers={layers}
                style={{ position: 'absolute', inset: 0 }}
            >
                <Map
                    mapStyle={MAP_STYLE}
                    attributionControl={false}
                >
                    <NavigationControl position="top-right" />
                </Map>
            </DeckGL>

            {/* Tooltip */}
            {tooltip && (
                <div
                    className="absolute z-20 bg-cyber-dark/95 backdrop-blur-md text-sm text-cyber-text rounded-lg px-3 py-2 border border-cyber-border shadow-lg pointer-events-none whitespace-pre-line max-w-[260px]"
                    style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
                >
                    {tooltip.text}
                </div>
            )}

            {/* Заголовок карты */}
            <div className="absolute top-4 left-4 bg-cyber-dark/80 backdrop-blur-sm rounded-lg px-4 py-2 border border-cyber-border z-10 pointer-events-none">
                <div className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-cyber-cyan live-pulse" />
                    <span className="text-cyber-muted">Трафик Алматы — в реальном времени</span>
                </div>
            </div>

            {/* Легенда трафика */}
            <div className="absolute bottom-4 right-4 bg-cyber-dark/80 backdrop-blur-sm rounded-lg p-3 border border-cyber-border z-10 pointer-events-none">
                <p className="text-xs text-cyber-muted mb-2 font-medium">Загруженность дорог</p>
                <div className="flex items-center gap-1">
                    <div className="w-8 h-[5px] rounded-full" style={{ background: 'rgb(34,197,94)' }} />
                    <div className="w-8 h-[5px] rounded-full" style={{ background: 'rgb(180,200,20)' }} />
                    <div className="w-8 h-[5px] rounded-full" style={{ background: 'rgb(234,179,8)' }} />
                    <div className="w-8 h-[5px] rounded-full" style={{ background: 'rgb(249,115,22)' }} />
                    <div className="w-8 h-[5px] rounded-full" style={{ background: 'rgb(220,38,0)' }} />
                </div>
                <div className="flex justify-between text-[10px] text-cyber-muted mt-1">
                    <span>Свободно</span>
                    <span>Пробка</span>
                </div>

                {incidents.length > 0 && (
                    <>
                        <div className="border-t border-cyber-border my-2" />
                        <p className="text-xs text-cyber-muted mb-1 font-medium">Инциденты</p>
                        <div className="flex flex-col gap-1 text-[11px]">
                            <span>🚨 ДТП</span>
                            <span>🚧 Ремонт дороги</span>
                            <span>👮 Полиция</span>
                        </div>
                    </>
                )}
            </div>

            {/* Счётчик дорог */}
            <div className="absolute bottom-4 left-4 text-xs text-cyber-muted font-mono z-10 pointer-events-none">
                🛣️ {roadSegments.length} дорог • {incidents.length} событий
            </div>
        </div>
    )
}

export default AlmatyMap
