import maplibregl from 'maplibre-gl'

export const PROBLEM_TYPE_COLORS: Record<string, string> = {
  pothole: '#ef4444',
  damaged_barrier: '#f97316',
  missing_marking: '#eab308',
  damaged_sign: '#8b5cf6',
  hazard: '#ec4899',
  broken_light: '#06b6d4',
  missing_ramp: '#84cc16',
  other: '#6b7280',
}

export function createClusterMarker(
  count: number,
  onClick: () => void,
): maplibregl.Marker {
  const el = document.createElement('div')
  el.className =
    'flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-primary text-white text-sm font-bold shadow-lg'
  el.textContent = String(count)
  el.addEventListener('click', onClick)
  return new maplibregl.Marker({ element: el })
}

export function createReportMarker(
  problemType: string | null,
  onClick: () => void,
): maplibregl.Marker {
  const color = PROBLEM_TYPE_COLORS[problemType ?? 'other'] ?? '#6b7280'
  const el = document.createElement('div')
  el.className = 'cursor-pointer'
  el.innerHTML = `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.268 0 0 6.268 0 14c0 9.334 14 22 14 22S28 23.334 28 14C28 6.268 21.732 0 14 0z" fill="${color}"/>
    <circle cx="14" cy="14" r="6" fill="white"/>
  </svg>`
  el.addEventListener('click', onClick)
  return new maplibregl.Marker({ element: el })
}
