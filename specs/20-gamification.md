# Spec 20 — Gamification

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

User retention is the biggest risk for a civic reporting platform. The initial novelty wears off, and without feedback loops, reporters stop contributing. Gamification introduces visible rewards — points, badges, and leaderboards — that acknowledge effort and create friendly competition between contributors.

The system is designed to reward quality over quantity: approved reports earn more than submissions, resolved reports earn the most, and rejected reports carry a penalty. This aligns incentives with the platform's goal of actionable, accurate road problem data.

**Goal:** Increase 30-day retention by 25% and average reports-per-user by 40% through a points/badges/leaderboard system that rewards meaningful contributions without enabling abuse.

---

## Points System

### Point Awards

| Action | Points | Trigger | Notes |
|---|---|---|---|
| Report submitted | +10 | `report.created` event | Awarded immediately on creation |
| Report approved by moderator | +20 | `report.status → approved` | Only once per report |
| Report resolved | +50 | `report.status → resolved` | Awarded to report author |
| Confirmation given | +5 | `confirmation.created` event | User confirms someone else's report |
| Confirmation received | +2 | `confirmation.created` event | Awarded to report author, per confirmation |
| Report rejected | -5 | `report.status → rejected` | Discourage low-quality/spam submissions |

### Rules

1. **Points never go below 0.** If a user has 3 points and receives a -5 penalty, their total becomes 0, not -2.
2. **No double-counting.** Each event awards points exactly once. If a report is approved, rejected, then re-approved (edge case), the user gets +20 for the first approval and -5 for the rejection. The second approval does not re-award +20.
3. **No self-confirmation points.** Already blocked at API level (Spec 02), but the points system double-checks: `confirmation.userId !== report.userId`.
4. **Retroactive points are NOT applied.** The system starts counting from launch. Existing reports do not generate points.

### Point Transaction Audit Trail

Every point change is logged as a transaction for auditability and debugging.

```
point_transactions
├── id          UUID, PK
├── user_id     TEXT, NOT NULL, FK → users
├── amount      INT, NOT NULL (positive or negative)
├── reason      ENUM('report_submitted', 'report_approved', 'report_resolved',
│                     'confirmation_given', 'confirmation_received', 'report_rejected')
├── report_id   UUID, NULL, FK → reports
├── created_at  TIMESTAMPTZ, NOT NULL, DEFAULT now()
```

---

## Badges (Achievements)

### Badge Definitions

| Badge | Key | Criteria | Icon |
|---|---|---|---|
| First Report | `first_report` | 1 report submitted | 📍 |
| Road Inspector | `road_inspector` | 10 approved reports | 🔍 |
| Eagle Eye | `eagle_eye` | 50 approved reports | 🦅 |
| Community Voice | `community_voice` | 25 confirmations given | 🗣️ |
| Problem Solver | `problem_solver` | 10 reports authored that reached `resolved` | 🔧 |
| Speed Reporter | `speed_reporter` | 1 report submitted within 30 seconds of photo EXIF timestamp | ⚡ |
| Regional Champion | `regional_champion` | Most approved reports in any region for the calendar month | 🏆 |
| Weekly Streak | `streak_7` | Reports submitted on 7 consecutive days | 🔥 |
| Monthly Streak | `streak_30` | Reports submitted on 30 consecutive days | 💎 |

### Badge Tiers (Future)

In v1, each badge is a single achievement (you have it or you don't). In v2, badges like Road Inspector may get tiers: Bronze (10), Silver (25), Gold (50), with distinct icons.

### Badge Criteria Evaluation

Badge criteria are stored in the database (not hardcoded) to allow adding new badges without code changes.

```
badges
├── id              TEXT, PK (e.g. 'first_report')
├── name_hy         TEXT, NOT NULL
├── name_ru         TEXT, NOT NULL
├── name_en         TEXT, NOT NULL
├── description_hy  TEXT, NOT NULL
├── description_ru  TEXT, NOT NULL
├── description_en  TEXT, NOT NULL
├── icon_key        TEXT, NOT NULL (maps to icon asset)
├── criteria_type   ENUM('report_count', 'approved_count', 'resolved_count',
│                        'confirmation_count', 'speed_report', 'regional_top',
│                        'streak_days')
├── criteria_value  INT, NOT NULL (e.g. 10 for road_inspector)
├── created_at      TIMESTAMPTZ, NOT NULL
```

---

## Database Schema

### user_points

Denormalized summary table for fast reads. Updated transactionally with each point_transaction insert.

```sql
CREATE TABLE user_points (
  user_id     TEXT PRIMARY KEY REFERENCES users(clerk_id),
  total_points INT NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  level       INT NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### user_badges

```sql
CREATE TABLE user_badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL REFERENCES users(clerk_id),
  badge_id   TEXT NOT NULL REFERENCES badges(id),
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_id)
);

CREATE INDEX idx_user_badges_user ON user_badges(user_id);
```

### Prisma Models

```prisma
model UserPoints {
  userId      String   @id @map("user_id")
  totalPoints Int      @default(0) @map("total_points")
  level       Int      @default(1)
  updatedAt   DateTime @updatedAt @map("updated_at")
  user        User     @relation(fields: [userId], references: [clerkId])

  @@map("user_points")
}

model PointTransaction {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  amount    Int
  reason    PointReason
  reportId  String?  @map("report_id")
  createdAt DateTime @default(now()) @map("created_at")
  user      User     @relation(fields: [userId], references: [clerkId])

  @@index([userId, createdAt])
  @@map("point_transactions")
}

enum PointReason {
  report_submitted
  report_approved
  report_resolved
  confirmation_given
  confirmation_received
  report_rejected
}

model Badge {
  id            String   @id
  nameHy        String   @map("name_hy")
  nameRu        String   @map("name_ru")
  nameEn        String   @map("name_en")
  descriptionHy String   @map("description_hy")
  descriptionRu String   @map("description_ru")
  descriptionEn String   @map("description_en")
  iconKey       String   @map("icon_key")
  criteriaType  BadgeCriteriaType @map("criteria_type")
  criteriaValue Int      @map("criteria_value")
  createdAt     DateTime @default(now()) @map("created_at")
  userBadges    UserBadge[]

  @@map("badges")
}

model UserBadge {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  badgeId   String   @map("badge_id")
  awardedAt DateTime @default(now()) @map("awarded_at")
  user      User     @relation(fields: [userId], references: [clerkId])
  badge     Badge    @relation(fields: [badgeId], references: [id])

  @@unique([userId, badgeId])
  @@map("user_badges")
}
```

---

## Levels

Levels provide a simple progression system that maps cumulative points to a rank title.

| Level | Points Required | Title (EN) | Title (HY) | Title (RU) |
|---|---|---|---|---|
| 1 | 0 | Newcomer | Նորեկ | Новичок |
| 2 | 100 | Active Citizen | Delays Քաղաքացի | Активный гражданин |
| 3 | 500 | Road Guardian | Ճանապարdelays Պահապան | Страж дорог |
| 4 | 2,000 | Champion | Չdelays | Чемпион |
| 5 | 10,000 | Legend | Լdelays | Легенда |

Level is recalculated on every point transaction:

```typescript
function calculateLevel(totalPoints: number): number {
  if (totalPoints >= 10000) return 5;
  if (totalPoints >= 2000) return 4;
  if (totalPoints >= 500) return 3;
  if (totalPoints >= 100) return 2;
  return 1;
}
```

The `user_points.level` column is denormalized for query performance (leaderboard sorting, profile display).

---

## Leaderboard

### API Endpoint

```
GET /api/v1/public/leaderboard?period=week|month|all&region=<region_id>
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `period` | `enum` | `month` | Time window: `week` (last 7 days), `month` (last 30 days), `all` (all time) |
| `region` | `string?` | — | Filter by region ID. Omit for national leaderboard. |

**Response:**

```json
{
  "period": "month",
  "region": null,
  "entries": [
    {
      "rank": 1,
      "displayName": "Armen H.",
      "level": 4,
      "totalPoints": 2450,
      "badgeCount": 7,
      "reportCount": 48
    }
  ],
  "updatedAt": "2026-04-14T12:00:00Z"
}
```

**Rules:**
- Top 50 users maximum.
- Only users with at least 1 point in the period are shown.
- Display name is `first_name + last_initial` (e.g., "Armen H.") — never full name or email.
- For `week` and `month` periods, points are summed from `point_transactions` within the time window.
- For `all`, the denormalized `user_points.total_points` is used.
- Leaderboard is cached in Redis with a 5-minute TTL (`leaderboard:{period}:{region}`).

### Regional Leaderboard

When `region` is provided, only points from reports within that region are counted. This requires joining `point_transactions → reports → regions`.

---

## Badge Evaluation (BullMQ Job)

### Trigger

A BullMQ job `evaluate-badges` is enqueued whenever:
- A report changes status (submitted, approved, resolved, rejected)
- A confirmation is created

The job payload contains `{ userId: string }`.

### Job Logic

```typescript
async function evaluateBadges(userId: string): Promise<string[]> {
  const awarded: string[] = [];
  const existingBadges = await getExistingBadgeIds(userId);
  const allBadges = await getAllBadgeDefinitions(); // cached

  for (const badge of allBadges) {
    if (existingBadges.includes(badge.id)) continue;

    const earned = await checkCriteria(userId, badge);
    if (earned) {
      await awardBadge(userId, badge.id);
      awarded.push(badge.id);
    }
  }

  return awarded; // used by caller to trigger notifications
}
```

### Criteria Check Functions

| criteria_type | Query |
|---|---|
| `report_count` | `COUNT(*) FROM reports WHERE author_id = ? AND status != 'rejected'` |
| `approved_count` | `COUNT(*) FROM reports WHERE author_id = ? AND status IN ('approved', 'resolved')` |
| `resolved_count` | `COUNT(*) FROM reports WHERE author_id = ? AND status = 'resolved'` |
| `confirmation_count` | `COUNT(*) FROM confirmations WHERE user_id = ?` |
| `speed_report` | `COUNT(*) FROM reports WHERE author_id = ? AND (created_at - photo_taken_at) < interval '30 seconds'` |
| `regional_top` | Complex: check if user has the most approved reports in any region for the current month |
| `streak_days` | Count consecutive days with at least one report, working backwards from today |

### Regional Champion (Monthly)

The `regional_champion` badge is evaluated via a scheduled BullMQ cron job that runs on the 1st of each month at 00:05 UTC:

1. For each region, find the user with the most approved reports in the previous month.
2. Award `regional_champion` badge if not already held.
3. Regional Champion is re-awardable (the badge entry is per-month, stored with a `month` field in a separate `regional_champions` table).

---

## Frontend

### Profile Page (`/[locale]/profile`)

The profile page (Spec 08) is extended with a gamification section:

```
┌─────────────────────────────────────┐
│  Armen Hovhannisyan                 │
│  Level 3 — Road Guardian            │
│  ████████████░░░░ 500 / 2000 pts    │
│                                     │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐       │
│  │ 📍 │ │ 🔍 │ │ 🗣️ │ │ ⚡ │       │
│  │1st │ │Insp│ │Voic│ │Spd │       │
│  └────┘ └────┘ └────┘ └────┘       │
│                                     │
│  Recent Activity                    │
│  +20  Report #142 approved   2h ago │
│  +5   Confirmed report #138  5h ago │
│  +10  New report submitted   1d ago │
└─────────────────────────────────────┘
```

- **Level progress bar:** Shows current points and points needed for next level.
- **Badge showcase:** Grid of earned badges. Unearned badges shown as locked silhouettes.
- **Recent activity:** Last 10 point transactions from `point_transactions`.

### Leaderboard Page (`/[locale]/leaderboard`)

```
┌─────────────────────────────────────┐
│  Leaderboard          [Month ▾]     │
│                       [All Armenia ▾]│
│                                     │
│  🥇  Armen H.    Lv4   2,450 pts   │
│  🥈  Lilit M.    Lv3   1,820 pts   │
│  🥉  Gevorg A.   Lv3   1,540 pts   │
│  4.  Sona T.     Lv2     890 pts   │
│  5.  Davit K.    Lv2     720 pts   │
│  ...                                │
│  ── Your rank ──────────────────    │
│  23. You         Lv2     310 pts   │
└─────────────────────────────────────┘
```

- Period selector: Week / Month / All Time.
- Region selector: All Armenia / specific marz.
- Current user's rank is always shown at the bottom if they are not in the top 50.
- Clicking a user shows their public profile (display name, level, badges — no personal data).

### Badge Popup

When the `evaluate-badges` job returns newly awarded badges, the API response includes them. The frontend shows an animated popup:

```
┌─────────────────────────────┐
│    🎉 New Badge Earned!     │
│                             │
│         🔍                  │
│    Road Inspector           │
│  10 approved reports        │
│                             │
│       [ Awesome! ]          │
└─────────────────────────────┘
```

The popup is triggered by a response header `X-New-Badges: road_inspector` on any API response. The frontend middleware checks this header and queues badge popups.

### Point Animation

When an action awards points, a floating `+N` text animates upward from the action button and fades out. Implemented as a CSS animation triggered by the API response containing point data.

---

## Anti-Gaming Measures

| Threat | Mitigation |
|---|---|
| Spam reports for +10 each | Rate limit: max 10 reports/day (Spec 02). Rejected reports cost -5. |
| Self-confirmation | Blocked at API level (Spec 02). Points system double-checks user IDs. |
| Bot accounts | Clerk auth required. Phone verification can be added later. |
| Coordinated boosting (friends confirming each other) | Moderator dashboard shows confirmation patterns. Flag users with >80% confirmations from the same 3 users. |
| Report recycling (re-submitting same problem) | Duplicate detection (Spec 03 AI) + moderator review. |
| Suspicious point accumulation | Admin endpoint: `GET /api/v1/admin/users/:id/point-audit` shows full transaction history. Moderator can freeze points. |

The anti-gaming system is intentionally lightweight in v1. If abuse patterns emerge, more sophisticated measures (confirmation cooldowns, trust scores, shadow-banning) can be added without schema changes — the `point_transactions` audit trail makes retroactive corrections possible.

---

## API Endpoints (Summary)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/public/leaderboard` | None | Leaderboard with period/region filters |
| `GET` | `/api/v1/users/me/points` | Clerk JWT | Current user's points, level, recent transactions |
| `GET` | `/api/v1/users/me/badges` | Clerk JWT | Current user's earned badges |
| `GET` | `/api/v1/users/:id/public-profile` | None | Public profile: display name, level, badge count |
| `GET` | `/api/v1/admin/users/:id/point-audit` | Admin | Full point transaction history for a user |
| `POST` | `/api/v1/admin/users/:id/freeze-points` | Admin | Freeze/unfreeze point accumulation for a user |

---

## Testing

| Test | Type | Description |
|---|---|---|
| Points awarded on report creation | Integration | Create report → verify +10 in user_points and point_transactions |
| Points on approval | Integration | Approve report → verify +20 to author |
| Points on rejection | Integration | Reject report → verify -5, floor at 0 |
| No self-confirmation points | Integration | Attempt self-confirm → verify no points |
| Badge evaluation | Unit | Mock criteria data → verify badge awarded |
| Level calculation | Unit | Test all boundary values |
| Leaderboard query | Integration | Create users with points → verify correct ordering and filtering |
| Leaderboard caching | Integration | Verify Redis cache hit, TTL expiry |
| Regional champion job | Integration | Seed monthly data → run job → verify badge awarded to correct user |
| Anti-gaming: rate limit | Integration | Submit 11 reports → verify 11th blocked, only 100 points awarded |
| Point transaction audit | Integration | Perform various actions → verify full audit trail |

---

## Out of Scope (v1)

- Custom avatars or profile pictures (use Clerk profile photo)
- Teams or groups competition
- Seasonal events or limited-time badges
- Physical prizes or rewards
- Badge tiers (Bronze/Silver/Gold)
- Points decay over time
- Trading or gifting points
- Public API for third-party leaderboard widgets
