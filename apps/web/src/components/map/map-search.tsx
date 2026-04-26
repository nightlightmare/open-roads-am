'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Search, X, Crosshair, MapPin } from 'lucide-react'
import { useMapStore } from '@/stores/map-store'

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

export function MapSearch() {
  const t = useTranslations('map')
  const { flyTo, setUserLocation } = useMapStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const search = useCallback(async (q: string) => {
    if (q.length < 3) {
      setResults([])
      return
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=am&limit=5&accept-language=ru`,
      )
      const data: NominatimResult[] = await res.json()
      setResults(data)
      setOpen(data.length > 0)
    } catch {
      setResults([])
    }
  }, [])

  const handleInput = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 400)
  }

  const selectResult = (result: NominatimResult) => {
    setQuery(result.display_name.split(',')[0] ?? result.display_name)
    setResults([])
    setOpen(false)
    flyTo?.(parseFloat(result.lon), parseFloat(result.lat), 16)
  }

  const handleGeolocate = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords
        setQuery(t('myLocation'))
        setResults([])
        setOpen(false)
        setUserLocation([longitude, latitude])
        flyTo?.(longitude, latitude, 15)
      },
      () => {},
    )
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="absolute left-4 right-[60px] top-4 z-10">
      {/* Search row: input + geolocate button */}
      <div className="flex overflow-hidden rounded border border-border bg-background shadow-sm">
        <label className="flex flex-1 items-center gap-2 px-2.5 py-2 transition-colors focus-within:border-foreground">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={t('search')}
            className="flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]); setOpen(false) }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>

        {/* Geolocate button — attached to search */}
        <button
          type="button"
          onClick={handleGeolocate}
          aria-label={t('myLocation')}
          className="grid w-[38px] shrink-0 place-items-center border-l border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <Crosshair className="h-4 w-4" />
        </button>
      </div>

      {/* Dropdown results */}
      {open && results.length > 0 && (
        <div className="mt-1 overflow-hidden rounded border border-border bg-background shadow-md">
          {results.map((r) => (
            <button
              key={r.place_id}
              type="button"
              onClick={() => selectResult(r)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/50"
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="line-clamp-2">{r.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export { type NominatimResult }
