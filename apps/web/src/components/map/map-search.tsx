'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
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
      <div className="flex gap-2">
        <label className="flex flex-1 items-center gap-2 rounded border border-border bg-background px-2.5 py-2 shadow-sm transition-colors focus-within:border-foreground">
          <svg className="h-4 w-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
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
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </label>

        {/* Geolocate button */}
        <button
          type="button"
          onClick={handleGeolocate}
          aria-label={t('myLocation')}
          className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-foreground hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
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
              <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="line-clamp-2">{r.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export { type NominatimResult }
