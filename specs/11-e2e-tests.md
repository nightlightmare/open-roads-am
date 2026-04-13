# Spec 11 — E2E Tests (Playwright)

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

Playwright E2E test suite covering all user-facing flows of the web frontend. Tests run against a real Next.js dev server connected to the staging API. Clerk authentication is handled via `@clerk/testing` package which provides `setupClerkTestingToken()` — this bypasses the Clerk UI and injects a signed test session token directly, allowing tests to act as any pre-seeded test user.

---

## Tech Stack

| Layer | Solution |
|---|---|
| Runner | Playwright |
| Auth bypass | `@clerk/testing/playwright` |
| Base URL | `http://localhost:3000` (dev server) or `PLAYWRIGHT_BASE_URL` env |
| API | Staging backend (`NEXT_PUBLIC_API_BASE_URL`) |
| Test users | Pre-seeded in Clerk test environment (see below) |

---

## Infrastructure

### Environment Variables

```bash
# .env.test (not committed)
PLAYWRIGHT_BASE_URL=http://localhost:3000
NEXT_PUBLIC_API_BASE_URL=https://staging.open-roads-am.api
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Clerk test user credentials
E2E_USER_EMAIL=e2e-user@test.open-roads.am
E2E_USER_PASSWORD=...
E2E_MODERATOR_EMAIL=e2e-moderator@test.open-roads.am
E2E_MODERATOR_PASSWORD=...
E2E_ADMIN_EMAIL=e2e-admin@test.open-roads.am
E2E_ADMIN_PASSWORD=...
```

### Test Users (pre-seeded in Clerk)

| User | Role | Purpose |
|---|---|---|
| `e2e-user` | `user` | Submit reports, profile, confirmations |
| `e2e-moderator` | `moderator` | Moderation queue + review |
| `e2e-admin` | `admin` | Admin panel |

### Playwright Config

```ts
// playwright.config.ts
{
  testDir: './e2e',
  fullyParallel: false,       // auth state must be stable
  retries: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
}
```

### Auth Helpers

```ts
// e2e/helpers/auth.ts
import { clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright'

export async function signInAs(page: Page, role: 'user' | 'moderator' | 'admin') {
  await setupClerkTestingToken({ page })
  // navigate to trigger session hydration
  await page.goto('/')
}
```

---

## File Structure

```
apps/web/e2e/
├── helpers/
│   ├── auth.ts          ← signInAs() helper
│   └── fixtures.ts      ← shared test data
├── public/
│   ├── map.spec.ts      ← public map, markers, side panel
│   └── report-detail.spec.ts
├── auth/
│   └── sign-in.spec.ts
├── submit/
│   └── submit.spec.ts   ← two-step report submission
├── profile/
│   ├── profile.spec.ts
│   ├── reports.spec.ts
│   └── confirmations.spec.ts
├── moderation/
│   ├── queue.spec.ts
│   └── review.spec.ts
└── admin/
    └── admin.spec.ts
```

---

## Test Suites

---

### 1. Public Map (`e2e/public/map.spec.ts`)

**User:** unauthenticated

#### map-01 — Page loads with map visible
- Navigate to `/hy`
- Assert `<div>` with MapLibre canvas is rendered (`.maplibregl-canvas`)
- Assert no error state visible

#### map-02 — Language redirect from root
- Navigate to `/`
- Assert redirected to `/(hy|ru|en)` based on Accept-Language

#### map-03 — Report markers appear on map
- Navigate to `/hy`
- Wait for markers to render (`.maplibregl-marker`)
- Assert at least one marker is present

#### map-04 — Cluster marker zooms in on click
- Navigate to `/hy`
- Find a cluster marker (rounded badge with a number)
- Click it
- Assert map zoom increased (marker count increases or cluster disappears)

#### map-05 — Report marker opens side panel
- Navigate to `/hy`
- Click a report marker (pin-shaped)
- Assert side panel appears with report status badge and address
- Assert "View Details" button is visible

#### map-06 — Side panel closes on X button
- Follow map-05 setup
- Click the X close button
- Assert side panel is no longer visible

#### map-07 — Side panel "View Details" navigates to report page
- Follow map-05 setup
- Click "View Details"
- Assert URL matches `/hy/reports/<uuid>`

#### map-08 — Problem type filter hides/shows markers
- Navigate to `/hy`
- Note initial marker count
- Apply a specific problem type filter
- Assert marker count changes

#### map-09 — "Include resolved" toggle works
- Navigate to `/hy`
- Toggle "Include resolved"
- Assert map reloads (loading indicator briefly appears)

---

### 2. Public Report Detail (`e2e/public/report-detail.spec.ts`)

**User:** unauthenticated (and authenticated)

#### report-01 — Report detail page renders
- Navigate to `/hy/reports/<known-approved-report-id>`
- Assert photo is visible (if present)
- Assert status badge is present
- Assert problem type badge is present
- Assert address is visible

#### report-02 — Status history timeline renders
- Navigate to a report with multiple status transitions
- Assert timeline section is visible with at least one entry

#### report-03 — Confirm button hidden for unauthenticated user
- Navigate as unauthenticated
- Assert confirm button is not shown OR clicking it redirects to `/sign-in`

#### report-04 — Confirm button visible for authenticated user
- Sign in as `e2e-user`
- Navigate to an approved report that the user did not create
- Assert confirm button is visible with current confirmation count

#### report-05 — Confirm toggles count
- Sign in as `e2e-user`
- Navigate to confirmable report
- Note confirmation count
- Click confirm
- Assert count incremented by 1
- Click again (unconfirm)
- Assert count decremented by 1

#### report-06 — Gov agency note renders when present
- Navigate to a report with a gov agency note in status history
- Assert the blue note box is visible with note content

---

### 3. Authentication (`e2e/auth/sign-in.spec.ts`)

#### auth-01 — Unauthenticated access to /submit redirects to sign-in
- Navigate to `/hy/submit` without auth
- Assert redirected to `/sign-in` or Clerk sign-in page

#### auth-02 — Unauthenticated access to /profile redirects to sign-in
- Navigate to `/hy/profile` without auth
- Assert redirected to sign-in

#### auth-03 — Unauthenticated access to /moderation redirects
- Navigate to `/hy/moderation` without auth
- Assert redirected (not 200)

#### auth-04 — User role cannot access /moderation
- Sign in as `e2e-user`
- Navigate to `/hy/moderation`
- Assert redirected to `/hy` (not the moderation queue)

#### auth-05 — User role cannot access /admin
- Sign in as `e2e-user`
- Navigate to `/hy/admin`
- Assert redirected to `/hy`

---

### 4. Report Submission (`e2e/submit/submit.spec.ts`)

**User:** `e2e-user`

#### submit-01 — Submit page renders step 1
- Sign in as `e2e-user`
- Navigate to `/hy/submit`
- Assert "Upload photo" dropzone is visible
- Assert "Next" button is disabled

#### submit-02 — Photo upload triggers AI classification
- Upload a test JPEG via file input
- Assert uploading spinner appears
- Assert "Analyzing image…" text appears after upload
- Assert category grid appears after polling completes (wait up to 60s)
- Assert AI-suggested category is pre-selected (highlighted)

#### submit-03 — User can change category selection
- After AI result appears
- Click a different category button
- Assert it becomes selected (primary colour)
- Assert previous selection is deselected

#### submit-04 — Next button enabled after category selected
- After category selected
- Assert "Next" button is enabled
- Click "Next"
- Assert step 2 is visible with map and description textarea

#### submit-05 — Step 2 shows location map
- After advancing to step 2
- Assert LocationPicker map is rendered (`.maplibregl-canvas`)
- Assert draggable marker is present

#### submit-06 — Description character counter
- In step 2
- Type 100 characters into description textarea
- Assert character counter shows `100 / 1000`

#### submit-07 — Back button returns to step 1
- In step 2
- Click "Back"
- Assert step 1 is visible with previously uploaded photo still shown

#### submit-08 — Full submit flow creates report
- Complete step 1 (upload photo, select category)
- Complete step 2 (location auto-filled, add description)
- Click "Submit"
- Assert redirect to `/profile/reports/<new-report-id>`
- Assert report status is `pending_review`

#### submit-09 — Cannot submit without photo
- Navigate to `/hy/submit`
- Assert "Next" button stays disabled without photo

---

### 5. User Profile (`e2e/profile/profile.spec.ts`)

**User:** `e2e-user`

#### profile-01 — Profile page renders stats
- Sign in as `e2e-user`
- Navigate to `/hy/profile`
- Assert display name is shown
- Assert stat cards for reports submitted, approved, resolved, confirmations given are visible

#### profile-02 — Profile page has navigation tabs
- Assert links to `/profile/reports` and `/profile/confirmations` are visible

---

### 6. Profile Reports (`e2e/profile/reports.spec.ts`)

**User:** `e2e-user`

#### reports-01 — Reports list renders
- Navigate to `/hy/profile/reports`
- Assert list of reports is visible (or empty state)

#### reports-02 — Status filter tabs work
- Click "approved" tab
- Assert URL contains `status=approved` or list updates
- Click "all" tab
- Assert full list returns

#### reports-03 — Load more pagination
- If more than one page of reports exists
- Scroll to bottom
- Assert "Load more" button or infinite scroll loads more items

#### reports-04 — Report card navigates to detail
- Click a report in the list
- Assert URL changes to `/profile/reports/<id>`

#### reports-05 — Profile report detail shows AI and user classification
- Navigate to `/profile/reports/<id>`
- Assert both user-selected type and AI-suggested type are shown
- Assert AI confidence percentage is visible

#### reports-06 — Profile report detail shows status history
- Assert status history timeline is visible

---

### 7. Confirmations (`e2e/profile/confirmations.spec.ts`)

**User:** `e2e-user`

#### confirmations-01 — Confirmations list renders
- Navigate to `/hy/profile/confirmations`
- Assert list renders (or empty state message)

#### confirmations-02 — Confirmation item links to report
- Click a confirmation item
- Assert navigated to `/hy/reports/<id>`

---

### 8. Moderation Queue (`e2e/moderation/queue.spec.ts`)

**User:** `e2e-moderator`

#### mod-queue-01 — Queue page renders pending reports
- Sign in as `e2e-moderator`
- Navigate to `/hy/moderation`
- Assert "Pending" tab is active
- Assert pending count badge is shown
- Assert at least one report card is visible (or empty state)

#### mod-queue-02 — Switch to "Under Review" tab
- Click "Under Review" tab
- Assert tab becomes active
- Assert list updates (may be empty)

#### mod-queue-03 — Report card shows type and address
- Assert each visible report card shows problem type and address (or "—")

#### mod-queue-04 — Report card shows AI badge when AI classified
- For a card with AI classification
- Assert AI prefix badge is visible with confidence percentage

#### mod-queue-05 — Clicking report card navigates to review page
- Click a report card
- Assert URL is `/hy/moderation/reports/<id>`

---

### 9. Moderation Review (`e2e/moderation/review.spec.ts`)

**User:** `e2e-moderator`

#### mod-review-01 — Review page renders report details
- Navigate to `/hy/moderation/reports/<id>`
- Assert photo is shown (if present)
- Assert status badge and type badges are visible
- Assert approve section and reject section are both present

#### mod-review-02 — Locked report shows warning
- Navigate to a report locked by another moderator (seeded fixture)
- Assert yellow warning banner with locker's display name is shown
- Assert "Back to queue" button is visible

#### mod-review-03 — Approve without override submits
- Navigate to a `pending_review` report
- Click "Approve" without changing the override type
- Assert redirect back to `/hy/moderation`

#### mod-review-04 — Approve with type override submits
- Navigate to a `pending_review` report
- Select a different problem type from the override dropdown
- Click "Approve"
- Assert redirect back to `/hy/moderation`

#### mod-review-05 — Reject requires reason
- Navigate to a `pending_review` report
- Assert "Reject" button is disabled when reason field is empty
- Type a reason
- Assert "Reject" button becomes enabled
- Click "Reject"
- Assert redirect back to `/hy/moderation`

#### mod-review-06 — Back to queue navigates correctly
- Click "Back to queue"
- Assert URL is `/hy/moderation`

---

### 10. Admin Panel (`e2e/admin/admin.spec.ts`)

**User:** `e2e-admin`

#### admin-01 — Admin page renders both sections
- Sign in as `e2e-admin`
- Navigate to `/hy/admin`
- Assert "Change User Role" form is visible
- Assert "Create API Key" form is visible

#### admin-02 — Change role form requires Clerk ID
- Assert "Save" button is disabled when Clerk ID field is empty
- Type a Clerk ID
- Assert "Save" button becomes enabled

#### admin-03 — Create API key requires description
- Assert "Create" button is disabled when description field is empty
- Type a description
- Assert "Create" button becomes enabled

#### admin-04 — Successful API key creation shows key
- Enter a description and click "Create"
- Assert a success message or the generated key string is shown

---

## Test Data Strategy

### Seeded Fixtures (staging DB)

The staging backend must have the following pre-seeded data for tests to be deterministic:

| Fixture | Details |
|---|---|
| `approved-report-with-photo` | `status: approved`, has photo, has confirmation_count > 0 |
| `approved-report-with-gov-note` | Has a gov agency note in status history |
| `pending-report-for-moderation` | `status: pending_review`, owned by seed user (not e2e-user) |
| `locked-report` | `status: under_review`, lock held by a different moderator user |
| `e2e-user-report` | A report owned by `e2e-user` for profile tests |
| `e2e-user-confirmation` | `e2e-user` has confirmed a report |

A seed script at `apps/api/scripts/seed-e2e.ts` populates these via direct DB + Redis writes before the test run.

---

## CI Integration

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on:
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: pnpm --filter @open-road/web exec playwright install chromium
      - run: pnpm --filter @open-road/api tsx scripts/seed-e2e.ts
        env:
          DATABASE_URL: ${{ secrets.E2E_DATABASE_URL }}
          REDIS_URL: ${{ secrets.E2E_REDIS_URL }}
      - run: pnpm --filter @open-road/web test:e2e
        env:
          PLAYWRIGHT_BASE_URL: http://localhost:3000
          NEXT_PUBLIC_API_BASE_URL: ${{ secrets.E2E_API_URL }}
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.E2E_CLERK_PUBLISHABLE_KEY }}
          CLERK_SECRET_KEY: ${{ secrets.E2E_CLERK_SECRET_KEY }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: apps/web/playwright-report/
```

---

## Out of Scope

- Mobile app (separate spec when React Native E2E is added)
- Visual regression testing
- Performance / load testing
- MCP server flows
