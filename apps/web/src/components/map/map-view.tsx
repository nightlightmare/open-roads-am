'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useTranslations } from 'next-intl'
import { useMapStore } from '@/stores/map-store'
import { apiFetch } from '@/lib/api'
import { createClusterMarker, createReportMarker } from './markers'

const MAP_STYLE_LIGHT = process.env.NEXT_PUBLIC_MAP_STYLE ?? 'https://tiles.openfreemap.org/styles/liberty'
const MAP_STYLE_DARK = process.env.NEXT_PUBLIC_MAP_STYLE_DARK ?? 'https://tiles.openfreemap.org/styles/dark'

function getMapStyle() {
  if (typeof document === 'undefined') return MAP_STYLE_LIGHT
  return document.documentElement.classList.contains('dark') ? MAP_STYLE_DARK : MAP_STYLE_LIGHT
}

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
  latitude: number
  longitude: number
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
  const { zoom, center, filters, setViewport, setReports, selectReport, setFlyTo } = useMapStore()
  // Capture initial values — map is created once; subsequent changes handled separately
  const initialCenter = useRef(center)
  const initialZoom = useRef(zoom)
  // Always-current ref so the init effect closure doesn't capture a stale loadReports
  const loadReportsRef = useRef<() => Promise<void>>(async () => undefined)
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
      const includeResolved = filters.activeStatuses.includes('resolved')
      const params: Record<string, string | number | boolean | undefined> = {
        bbox: `${west},${south},${east},${north}`,
        zoom: Math.round(currentZoom),
        include_resolved: includeResolved,
      }
      if (filters.problemTypes.length > 0) {
        params.problem_type = filters.problemTypes.join(',')
      }

      const data = await apiFetch<ApiResponse>('/api/v1/public/reports', { params })
      clearMarkers()

      // Client-side status filter — API only supports include_resolved toggle,
      // but user can also toggle approved / in_progress individually
      const activeSet = new Set(filters.activeStatuses)
      const allItems = data.items
      const filteredItems = allItems.filter((item) =>
        item.type === 'cluster' || activeSet.has(item.status),
      )

      const reportItems = filteredItems.filter((item): item is ReportItem => item.type === 'report')
      setReports(reportItems, data.total_in_area)

      for (const item of filteredItems) {
        if (item.type === 'cluster') {
          const marker = createClusterMarker(item.count, () => {
            map.current?.flyTo({ center: [item.longitude, item.latitude], zoom: currentZoom + 2 })
          }).setLngLat([item.longitude, item.latitude]).addTo(map.current!)
          markersRef.current.push(marker)
        } else {
          const marker = createReportMarker(item.problem_type, () => {
              if (!map.current) return
              const point = map.current.project([item.longitude, item.latitude])
              selectReport(item, { x: point.x, y: point.y })
            })
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
  }, [filters, clearMarkers, setReports, selectReport])

  // Keep the ref current so the map init closure always calls the latest version
  useEffect(() => { loadReportsRef.current = loadReports }, [loadReports])

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: getMapStyle(),
      center: initialCenter.current,
      zoom: initialZoom.current,
    })

    // Expose flyTo to store so overlays can move the map
    setFlyTo((lng: number, lat: number, z?: number) => {
      map.current?.flyTo({ center: [lng, lat], zoom: z ?? map.current.getZoom() })
    })

    // Watch for dark mode toggle and switch map style
    const observer = new MutationObserver(() => {
      if (!map.current) return
      const nextStyle = getMapStyle()
      map.current.setStyle(nextStyle)
      // setStyle clears markers — reload once style is applied
      map.current.once('styledata', () => void loadReportsRef.current())
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

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
      observer.disconnect()
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
        <div className="absolute left-4 top-4 z-10 rounded border border-border bg-background px-3 py-1.5 font-mono text-xs text-muted-foreground shadow-sm">
          {tMap('loading')}
        </div>
      )}
    </div>
  )
}
