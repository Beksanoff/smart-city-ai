import { useMemo, useState, useCallback } from 'react'
import Map, { NavigationControl } from 'react-map-gl/maplibre'
import DeckGL from '@deck.gl/react'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import { ScatterplotLayer } from '@deck.gl/layers'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { HeatmapPoint, Incident } from '../../services/api'

interface AlmatyMapProps {
    heatmapPoints: HeatmapPoint[]
    incidents?: Incident[]
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

function AlmatyMap({ heatmapPoints, incidents = [] }: AlmatyMapProps) {
    const [viewState, setViewState] = useState(INITIAL_VIEW_STATE)

    const onViewStateChange = useCallback(({ viewState: newViewState }: { viewState: typeof INITIAL_VIEW_STATE }) => {
        setViewState(newViewState)
    }, [])

    // Слой тепловой карты и инцидентов
    const layers = useMemo(() => {
        const layersList = []

        if (heatmapPoints.length > 0) {
            layersList.push(
                new HeatmapLayer({
                    id: 'traffic-heatmap',
                    data: heatmapPoints,
                    getPosition: (d: HeatmapPoint) => [d.lon, d.lat],
                    getWeight: (d: HeatmapPoint) => d.intensity,
                    radiusPixels: 50,
                    intensity: 2,
                    threshold: 0.05,
                    colorRange: [
                        [34, 197, 94, 50],     // Зеленый (Свободно)
                        [132, 204, 22, 100],   // Салатовый
                        [234, 179, 8, 150],    // Желтый (Плотно)
                        [249, 115, 22, 200],   // Оранжевый
                        [239, 68, 68, 255],    // Красный (Пробка)
                    ],
                })
            )
        }

        if (incidents && incidents.length > 0) {
            layersList.push(
                new ScatterplotLayer({
                    id: 'incidents-layer',
                    data: incidents,
                    pickable: true,
                    opacity: 0.8,
                    stroked: true,
                    filled: true,
                    radiusScale: 6,
                    radiusMinPixels: 5,
                    radiusMaxPixels: 15,
                    lineWidthMinPixels: 1,
                    getPosition: (d: Incident) => [d.lon, d.lat],
                    getRadius: 30,
                    getFillColor: (d: Incident) => {
                        switch (d.type) {
                            case 'accident': return [255, 0, 0]
                            case 'roadwork': return [255, 140, 0]
                            case 'police': return [0, 0, 255]
                            default: return [255, 255, 255]
                        }
                    },
                    getLineColor: [0, 0, 0],
                })
            )
        }

        return layersList
    }, [heatmapPoints, incidents])

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
                    <div className="w-6 h-2 rounded-full bg-green-500" title="Свободно" />
                    <div className="w-6 h-2 rounded-full bg-lime-500" title="Лёгкий" />
                    <div className="w-6 h-2 rounded-full bg-yellow-500" title="Средний" />
                    <div className="w-6 h-2 rounded-full bg-orange-500" title="Высокий" />
                    <div className="w-6 h-2 rounded-full bg-red-500" title="Критический" />
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
