import { useMemo, useState, useCallback } from 'react'
import Map, { NavigationControl } from 'react-map-gl/maplibre'
import DeckGL from '@deck.gl/react'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { HeatmapPoint } from '../../services/api'

interface AlmatyMapProps {
    heatmapPoints: HeatmapPoint[]
}

// Координаты центра Алматы
const ALMATY_CENTER = {
    latitude: 43.2389,
    longitude: 76.8897,
}

const INITIAL_VIEW_STATE = {
    ...ALMATY_CENTER,
    zoom: 11,
    pitch: 0,
    bearing: 0,
}

// Бесплатные тайлы карты (CARTO темная тема)
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

function AlmatyMap({ heatmapPoints }: AlmatyMapProps) {
    const [viewState, setViewState] = useState(INITIAL_VIEW_STATE)

    const onViewStateChange = useCallback(({ viewState: newViewState }: { viewState: typeof INITIAL_VIEW_STATE }) => {
        setViewState(newViewState)
    }, [])

    // Слой тепловой карты Deck.gl - синхронизирован с картой
    const layers = useMemo(() => {
        if (!heatmapPoints.length) return []

        return [
            new HeatmapLayer({
                id: 'traffic-heatmap',
                data: heatmapPoints,
                getPosition: (d: HeatmapPoint) => [d.lon, d.lat],
                getWeight: (d: HeatmapPoint) => d.intensity,
                radiusPixels: 50,
                intensity: 2,
                threshold: 0.05,
                colorRange: [
                    [0, 255, 255, 50],     // Голубой прозрачный
                    [0, 255, 255, 150],    // Голубой
                    [139, 92, 246, 180],   // Фиолетовый
                    [255, 0, 255, 220],    // Пурпурный
                    [255, 100, 100, 255],  // Красный
                ],
            }),
        ]
    }, [heatmapPoints])

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

            {/* Информация о карте */}
            <div className="absolute top-4 left-4 bg-cyber-dark/80 backdrop-blur-sm rounded-lg px-4 py-2 border border-cyber-border z-10 pointer-events-none">
                <div className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-cyber-cyan live-pulse" />
                    <span className="text-cyber-muted">Плотность трафика Алматы</span>
                </div>
            </div>

            {/* Легенда */}
            <div className="absolute bottom-4 right-4 bg-cyber-dark/80 backdrop-blur-sm rounded-lg p-3 border border-cyber-border z-10 pointer-events-none">
                <p className="text-xs text-cyber-muted mb-2">Уровень загруженности</p>
                <div className="flex gap-1">
                    <div className="w-8 h-2 rounded-full bg-cyan-400" title="Низкий" />
                    <div className="w-8 h-2 rounded-full bg-purple-500" title="Средний" />
                    <div className="w-8 h-2 rounded-full bg-pink-500" title="Высокий" />
                    <div className="w-8 h-2 rounded-full bg-red-500" title="Критический" />
                </div>
                <div className="flex justify-between text-xs text-cyber-muted mt-1">
                    <span>Низкий</span>
                    <span>Критический</span>
                </div>
            </div>

            {/* Количество точек */}
            <div className="absolute bottom-4 left-4 text-xs text-cyber-muted font-mono z-10 pointer-events-none">
                📍 {heatmapPoints.length} точек данных
            </div>
        </div>
    )
}

export default AlmatyMap
