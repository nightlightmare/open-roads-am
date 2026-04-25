'use client'

import dynamic from 'next/dynamic'
import { MapSidebar } from '@/components/map/map-sidebar'
import { MapOverlays } from '@/components/map/map-overlays'
import { useMapStore } from '@/stores/map-store'

const MapView = dynamic(
  () => import('@/components/map/map-view').then((m) => m.MapView),
  { ssr: false },
)

export default function MapPage() {
  const { reports, totalInArea } = useMapStore()

  return (
    <div className="grid h-[calc(100vh-64px)] grid-cols-1 md:grid-cols-[380px_1fr]">
      {/* Sidebar */}
      <aside className="hidden overflow-y-auto overflow-x-hidden border-r border-border bg-background md:block">
        <MapSidebar reports={reports} totalInArea={totalInArea} />
      </aside>

      {/* Map */}
      <main className="relative overflow-hidden">
        <MapView />
        <MapOverlays />
      </main>
    </div>
  )
}
