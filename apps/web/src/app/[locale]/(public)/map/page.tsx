'use client'

import dynamic from 'next/dynamic'
import { MapSidebar } from '@/components/map/map-sidebar'

const MapView = dynamic(
  () => import('@/components/map/map-view').then((m) => m.MapView),
  { ssr: false },
)

export default function MapPage() {
  return (
    <div className="grid h-[calc(100vh-64px)] grid-cols-1 md:grid-cols-[380px_1fr]">
      {/* Sidebar */}
      <aside className="hidden overflow-y-auto overflow-x-hidden border-r border-border bg-background md:block">
        <MapSidebar />
      </aside>

      {/* Map */}
      <main className="relative overflow-hidden">
        <MapView />
      </main>
    </div>
  )
}
