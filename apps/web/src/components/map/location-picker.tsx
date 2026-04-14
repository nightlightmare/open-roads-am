'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE ?? 'https://tiles.openfreemap.org/styles/liberty'

export function LocationPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number
  lng: number
  onChange: (lat: number, lng: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  // Stable refs — init effect closes over them so it has no deps other than itself
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  const initialLat = useRef(lat)
  const initialLng = useRef(lng)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [initialLng.current, initialLat.current],
      zoom: 14,
    })

    mapRef.current.on('moveend', () => {
      const center = mapRef.current?.getCenter()
      if (center) {
        onChangeRef.current(center.lat, center.lng)
      }
    })

    mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Pan map if lat/lng props change externally
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setCenter([lng, lat])
    }
  }, [lat, lng])

  return (
    <div className="relative h-64 w-full rounded-md overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full">
        <svg width="28" height="36" viewBox="0 0 28 36" fill="none">
          <path d="M14 0C6.268 0 0 6.268 0 14c0 9.334 14 22 14 22S28 23.334 28 14C28 6.268 21.732 0 14 0z" fill="#16a34a"/>
          <circle cx="14" cy="14" r="6" fill="white"/>
        </svg>
      </div>
    </div>
  )
}
