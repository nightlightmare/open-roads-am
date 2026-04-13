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
  const markerRef = useRef<maplibregl.Marker | null>(null)

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

    markerRef.current = new maplibregl.Marker({ draggable: true })
      .setLngLat([initialLng.current, initialLat.current])
      .addTo(mapRef.current)

    markerRef.current.on('dragend', () => {
      const lngLat = markerRef.current?.getLngLat()
      if (lngLat) {
        onChangeRef.current(lngLat.lat, lngLat.lng)
      }
    })

    mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  // Update marker position if lat/lng props change externally
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat])
    }
  }, [lat, lng])

  return <div ref={containerRef} className="h-64 w-full rounded-md overflow-hidden" />
}
