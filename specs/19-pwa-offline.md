# Spec 19 — PWA & Offline Support

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

Armenia has spotty mobile internet coverage in rural and mountain areas — exactly where road infrastructure tends to be worst. Users who encounter a dangerous pothole or crumbling bridge on the Meghri–Kapan highway may not have signal for another 30 minutes. Today, that means they either forget to report it or have to remember later.

PWA (Progressive Web App) support turns open-road.am into an installable, offline-capable application. Users can photograph a road problem, pick a category, and save a draft report while fully offline. When connectivity returns, the app automatically submits the queued reports without user intervention.

This spec covers: service worker setup, offline report queue with IndexedDB, web app manifest for installability, map tile caching, background sync, and offline UI indicators.

**Goal:** Enable users to capture and queue road problem reports with zero connectivity, with automatic submission when the device regains internet access. Achieve a Lighthouse PWA score of 100.

---

## Service Worker

### Setup

The service worker is registered via `next.config.ts` using either `next-pwa` (Serwist fork for Next.js 16+) or a custom service worker if the library introduces unacceptable constraints. The SW file lives at `/public/sw.js` and is generated at build time.

```
next.config.ts
├── withPWA({
│     dest: 'public',
│     register: true,
│     skipWaiting: true,
│     disable: process.env.NODE_ENV === 'development'
│   })
```

### Cache Strategies

| Resource Type | Strategy | Max Age | Max Entries |
|---|---|---|---|
| App shell (HTML, JS, CSS) | Cache-first, revalidate in background | 24 hours | — |
| Static assets (`/images/`, `/icons/`) | Cache-first | 30 days | 200 |
| API: `/api/v1/public/reports` | Network-first, fall back to cache | 5 minutes | 50 |
| API: `/api/v1/public/problem-types` | Cache-first, revalidate | 7 days | 1 |
| API: `/api/v1/public/leaderboard` | Network-only | — | — |
| Map tiles (raster/vector) | Cache-first, revalidate | 7 days | 2000 |
| Fonts | Cache-first | 90 days | 10 |
| Photo uploads (outgoing) | Background sync queue | — | — |

### Cache Size Budgets

| Cache | Max Size | Eviction |
|---|---|---|
| Map tiles | 50 MB | LRU (least recently used) |
| App shell + static | 10 MB | Version-based (old version purged on SW update) |
| API responses | 5 MB | LRU |
| **Total** | **65 MB** | — |

The SW monitors `navigator.storage.estimate()` on activation and logs a warning if available quota is below 100 MB. On low-storage devices, tile caching is reduced to 20 MB.

---

## Map Tile Caching

### Precaching Strategy

When the user opens the map view, the SW caches all tiles in the current viewport at zoom levels 10–15. This gives roughly 6 zoom levels of coverage for the area the user is currently browsing.

**Tile count estimation:**

| Zoom Level | Tiles per ~20km viewport | Cumulative |
|---|---|---|
| 10 | ~4 | 4 |
| 11 | ~9 | 13 |
| 12 | ~25 | 38 |
| 13 | ~64 | 102 |
| 14 | ~169 | 271 |
| 15 | ~400 | 671 |

At ~25 KB per vector tile, caching one viewport across 6 zoom levels costs approximately 16 MB — well within the 50 MB budget.

### Cache Trigger

Tiles are cached opportunistically as the user pans and zooms. No explicit "download area" button in v1. The SW intercepts all tile fetch requests and stores responses in a dedicated `map-tiles` cache.

### Offline Map Behavior

When offline, the map renders from cached tiles. Areas the user has not previously viewed show a gray placeholder with a "No cached tiles" label. The user's GPS location (blue dot) still works — GPS does not require internet.

Cached report markers are rendered from the last successful `/api/v1/public/reports` response stored in the API cache.

---

## Offline Report Queue

### Storage: IndexedDB

Draft reports are stored in an IndexedDB database (`openroad-drafts`) with a single object store (`reports`).

**Schema per draft report:**

```typescript
interface DraftReport {
  id: string;               // crypto.randomUUID()
  status: 'draft' | 'queued' | 'syncing' | 'failed';
  createdAt: string;        // ISO 8601
  updatedAt: string;        // ISO 8601
  latitude: number;
  longitude: number;
  problemTypeId: string | null;   // null if classification pending
  description: string;
  photoBlob: Blob;                // original photo, max 10 MB
  photoThumbnail: Blob;           // 200x200 thumbnail for list display
  syncAttempts: number;
  lastError: string | null;
}
```

**Storage library:** `idb` (lightweight IndexedDB wrapper, ~1.2 KB gzipped).

### Offline Flow

```
User takes photo → GPS coordinates captured → Category selected → Description entered
    │
    ├── Online: POST /api/v1/reports (normal flow, Spec 02)
    │
    └── Offline:
          │
          ├── Save DraftReport to IndexedDB (status: 'queued')
          ├── Show toast: "Report saved! Will submit when you're back online"
          ├── Show draft in "My Reports" with 🕐 queued indicator
          └── Register for Background Sync (tag: 'sync-reports')
```

### Sync Flow (Online Restored)

```
Connectivity restored (navigator.onLine + fetch test to /api/v1/health)
    │
    ├── Background Sync fires (or fallback: visibilitychange/focus event)
    │
    ├── For each queued draft (oldest first):
    │     ├── Set status → 'syncing'
    │     ├── Upload photo to presigned URL (Spec 02)
    │     ├── POST /api/v1/reports with photo key + metadata
    │     ├── On success:
    │     │     ├── Delete draft from IndexedDB
    │     │     ├── Show toast: "Report #X submitted successfully"
    │     │     └── Update "My Reports" UI
    │     └── On failure:
    │           ├── Increment syncAttempts
    │           ├── Set lastError
    │           ├── If syncAttempts < 5: set status → 'queued' (retry later)
    │           └── If syncAttempts >= 5: set status → 'failed', notify user
    │
    └── If AI classification fails (Spec 03):
          ├── Save server-created report with status 'pending_classification'
          └── User can manually select category from report detail page
```

### Draft Management

Users can view, edit, and delete drafts from a "Drafts" section in "My Reports" (accessible offline). Drafts show a thumbnail, location on mini-map (if cached), and queued/failed status.

---

## Web App Manifest

File: `/public/manifest.json`

```json
{
  "name": "OpenRoad.am — Road Problem Reporter",
  "short_name": "OpenRoad",
  "description": "Report road problems in Armenia",
  "start_url": "/hy",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#16a34a",
  "background_color": "#ffffff",
  "lang": "hy",
  "dir": "ltr",
  "categories": ["government", "utilities"],
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-192-maskable.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/map-view.png",
      "sizes": "1080x1920",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Map view with road problem reports"
    },
    {
      "src": "/screenshots/report-form.png",
      "sizes": "1080x1920",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Report a road problem"
    }
  ]
}
```

The `<head>` of `app/layout.tsx` includes:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#16a34a" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

---

## Install Prompt

### Custom Banner

A `<InstallBanner />` component displays at the bottom of the screen on the first visit if the browser supports `beforeinstallprompt`.

**Behavior:**

1. Listen for `beforeinstallprompt` event, store the event reference.
2. Check localStorage for `install-banner-dismissed` timestamp.
3. If no dismissal or last dismissal was >30 days ago, show the banner.
4. Banner content: "Install OpenRoad for offline reporting" + Install button + Dismiss (X).
5. On "Install" click: call `event.prompt()`, track outcome in analytics.
6. On dismiss: set `install-banner-dismissed = Date.now()` in localStorage.

**iOS fallback:** On Safari iOS (no `beforeinstallprompt`), show a static banner with instructions: "Tap Share → Add to Home Screen".

### Standalone Detection

When the app runs in standalone mode (`window.matchMedia('(display-mode: standalone)').matches`), the install banner is never shown.

---

## Background Sync

### Primary: Background Sync API

```typescript
// In the main thread, after saving draft:
const registration = await navigator.serviceWorker.ready;
await registration.sync.register('sync-reports');

// In the service worker:
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-reports') {
    event.waitUntil(syncQueuedReports());
  }
});
```

The `syncQueuedReports()` function reads all drafts with status `queued` from IndexedDB and submits them sequentially. If any submission fails, the sync event is re-registered for retry (the browser handles backoff).

### Fallback: Visibility/Focus Check

For browsers that do not support Background Sync (Safari as of 2026):

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && navigator.onLine) {
    syncQueuedReports();
  }
});

window.addEventListener('online', () => {
  syncQueuedReports();
});
```

The fallback is always registered. It checks a `lastSyncAttempt` timestamp and skips if sync was attempted within the last 30 seconds (debounce).

### Connectivity Check

`navigator.onLine` is unreliable (it can report `true` when behind a captive portal). Before syncing, the app sends a lightweight `HEAD` request to `/api/v1/health`. If this fails, sync is deferred.

---

## Offline Indicators

### Status Bar

A `<OfflineBar />` component renders a fixed yellow bar at the top of the screen when the app detects offline state.

```
┌──────────────────────────────────────┐
│ ⚠ You are offline. Reports are saved │
│   locally and will sync later.       │
└──────────────────────────────────────┘
```

**Detection:** Combination of `navigator.onLine` and a periodic fetch to `/api/v1/health` every 30 seconds (only when `navigator.onLine` is `true`, to detect captive portals).

The bar disappears with a slide-up animation when connectivity is restored, replaced briefly by a green "Back online" bar for 3 seconds.

### Disabled Actions

When offline, the following actions are visually disabled (grayed out with a tooltip "Requires internet"):

| Action | Reason |
|---|---|
| Sign In / Sign Up | Clerk auth requires network |
| Confirm Report | Requires authenticated API call |
| View Full Report Detail | May need fresh data |
| Change Account Settings | Requires Clerk API |
| Leaderboard | Always network-only |

Actions that remain functional offline:

| Action | How |
|---|---|
| Browse cached map | Cached tiles + markers |
| Create new report | Saved to IndexedDB |
| View own drafts | From IndexedDB |
| View cached reports list | From API cache |
| Take photo | Device camera, no network needed |
| GPS location | Hardware GPS, no network needed |

---

## Testing

### Development

- Use Chrome DevTools Application tab → Service Workers → "Offline" checkbox
- Workbox dev tools for cache inspection
- IndexedDB viewer for draft inspection
- Throttle network to simulate slow/intermittent connectivity

### Automated

| Test | Tool | Target |
|---|---|---|
| Lighthouse PWA audit | `lighthouse` CLI in CI | Score = 100 |
| SW registration | Playwright | Verify SW is active after page load |
| Offline report save | Playwright + network interception | Create report while offline, verify IndexedDB entry |
| Online sync | Playwright | Go offline → create report → go online → verify POST fires |
| Install banner | Playwright | Mock `beforeinstallprompt`, verify banner appears |
| Cache size limits | Unit test | Verify eviction when cache exceeds budget |
| Manifest validation | `web-app-manifest-validator` | No errors |

### Manual QA

- Test on actual Android device (Chrome) in airplane mode
- Test on iOS Safari (Add to Home Screen flow)
- Test in areas with intermittent connectivity (toggle airplane mode repeatedly)
- Verify that 5+ queued reports sync correctly in order

---

## Implementation Plan

| Phase | Tasks | Depends On |
|---|---|---|
| 1. Manifest + SW shell | Manifest, SW registration, app shell cache, Lighthouse 100 | Spec 10 (frontend) |
| 2. Offline report queue | IndexedDB storage, draft UI, sync on reconnect | Spec 02 (report submission) |
| 3. Map tile caching | Tile cache strategy, offline map rendering, stale markers | Spec 04 (public map API) |
| 4. Install prompt | Custom banner, iOS fallback, analytics | Phase 1 |
| 5. Background sync | Background Sync API, fallback, connectivity check | Phase 2 |
| 6. Polish | Offline indicators, disabled actions, error handling | All above |

---

## Out of Scope (v1)

- Push notifications via service worker (covered by Spec 12)
- Full offline moderation (moderators need network for API calls)
- Explicit "download area for offline" button (may add in v2)
- Offline search/filtering of reports
- Service worker update prompt ("New version available, refresh?") — planned for v2
- Periodic background sync (experimental API, low browser support)
