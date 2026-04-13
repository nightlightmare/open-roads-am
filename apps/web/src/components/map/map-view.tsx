'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useTranslations } from 'next-intl'
import { useMapStore } from '@/stores/map-store'
import { apiFetch } from '@/lib/api'
import { ReportSidePanel } from './report-side-panel'
import { createClusterMarker, createReportMarker } from './markers'

const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE ?? 'https://tiles.openfreemap.org/styles/liberty'

interface ReportItem {
  type: 'report'
  id: string
  status: string
  problem_type: string | null
  address_raw: string | null
  confirmation_count: number
  photo_url: string | null
  created_at: string
  latitude: number
  longitude: number
}

interface ClusterItem {
  type: 'cluster'
  lat: number
  lng: number
  count: number
}

interface ApiResponse {
  items: Array<ReportItem | ClusterItem>
  total_in_area: number
}

export function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const { zoom, center, filters, setViewport } = useMapStore()
  // Capture initial values — map is created once; subsequent changes handled separately
  const initialCenter = useRef(center)
  const initialZoom = useRef(zoom)
  // Always-current ref so the init effect closure doesn't capture a stale loadReports
  const loadReportsRef = useRef<() => Promise<void>>(async () => undefined)
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null)
  const [loading, setLoading] = useState(false)
  const tMap = useTranslations('map')

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
  }, [])

  const loadReports = useCallback(async () => {
    if (!map.current) return
    const bounds = map.current.getBounds()
    const currentZoom = map.current.getZoom()

    const west = bounds.getWest()
    const south = bounds.getSouth()
    const east = bounds.getEast()
    const north = bounds.getNorth()

    if (east - west > 2 || north - south > 2) return

    setLoading(true)
    try {
      const params: Record<string, string | number | boolean | undefined> = {
        bbox: `${west},${south},${east},${north}`,
        zoom: Math.round(currentZoom),
        include_resolved: filters.includeResolved,
      }
      if (filters.problemTypes.length > 0) {
        params.problem_type = filters.problemTypes.join(',')
      }

      const data = await apiFetch<ApiResponse>('/api/v1/public/reports', { params })
      clearMarkers()

      for (const item of data.items) {
        if (item.type === 'cluster') {
          const marker = createClusterMarker(item.count, () => {
            map.current?.flyTo({ center: [item.lng, item.lat], zoom: currentZoom + 2 })
          }).setLngLat([item.lng, item.lat]).addTo(map.current!)
          markersRef.current.push(marker)
        } else {
          const marker = createReportMarker(item.problem_type, () => setSelectedReport(item))
            .setLngLat([item.longitude, item.latitude])
            .addTo(map.current!)
          markersRef.current.push(marker)
        }
      }
    } catch {
      // silently fail — map stays as is
    } finally {
      setLoading(false)
    }
  }, [filters, clearMarkers])

  // Keep the ref current so the map init closure always calls the latest version
  useEffect(() => { loadReportsRef.current = loadReports }, [loadReports])

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: initialCenter.current,
      zoom: initialZoom.current,
    })

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.current.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      'top-right',
    )

    const onMoveEnd = () => {
      if (!map.current) return
      const c = map.current.getCenter()
      const z = map.current.getZoom()
      const b = map.current.getBounds()
      setViewport(z, [c.lng, c.lat], [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
      void loadReportsRef.current()
    }

    map.current.on('moveend', onMoveEnd)
    map.current.on('load', () => void loadReportsRef.current())

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [setViewport])

  // Reload when filters change
  useEffect(() => {
    if (map.current?.loaded()) {
      void loadReports()
    }
  }, [filters, loadReports])

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="h-full w-full" />
      {loading && (
        <div className="absolute left-4 top-4 rounded-md bg-white px-3 py-1.5 text-sm shadow">
          {tMap('loading')}
        </div>
      )}
      {selectedReport && (
        <ReportSidePanel
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </div>
  )
}
