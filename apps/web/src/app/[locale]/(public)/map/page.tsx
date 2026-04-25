'use client'

import dynamic from 'next/dynamic'

const MapView = dynamic(
  () => import('@/components/map/map-view').then((m) => m.MapView),
  { ssr: false },
)

export default function MapPage() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <MapView />
    </div>
  )
}
