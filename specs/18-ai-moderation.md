# Spec 18 — AI-Assisted Moderation

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

Manual moderation (Spec 05) is the current bottleneck in the report lifecycle. Every report sits in the moderation queue until a human moderator opens it, reviews the photo/description, and clicks approve or reject. As report volume grows, this does not scale — moderators burn out, queue latency increases, and reporters lose faith that anyone is listening.

AI-assisted moderation introduces automatic approve/reject decisions for reports where the AI classification (Spec 03) is highly confident and the user has a track record of quality submissions. The moderator remains in the loop for ambiguous cases, and all auto-decisions can be overridden.

This is referenced in Spec 05's "Out of Scope (v1)" section as "AI-assisted auto-approval." This spec promotes it to a concrete feature with a phased rollout plan.

**Goal:** Reduce moderator workload by 40-60% by automatically approving high-confidence reports from trusted users and automatically rejecting obvious non-road-problem submissions, while maintaining <1% false positive rate on auto-approvals.

---

## Decision Framework

Every report that completes AI classification (Spec 03) is evaluated against three possible outcomes:

```
┌─────────────────────┐
│   Report classified  │
│   (Spec 03 complete) │
└──────────┬──────────┘
           │
     ┌─────▼──────┐
     │  Evaluate   │
     │  rules      │
     └─────┬──────┘
           │
     ┌─────┼──────────────┐
     │     │              │
     ▼     ▼              ▼
  auto   manual       auto
 approve  review     reject
     │     │              │
     ▼     ▼              ▼
 approved  pending    rejected
 (visible  _review   (with auto
  on map)  (queue)    reason)
```

The default outcome is **manual_review** — a report only gets auto-approved or auto-rejected if it passes ALL conditions for that path. Any ambiguity sends it to the human queue.

---

## Auto-Approve Rules

ALL of the following must be true for a report to be auto-approved:

### Rule 1: High AI Confidence

```
ai_confidence >= 0.85
```

The AI must be at least 85% confident in its classification. This threshold is configurable via Redis (see Configuration section).

### Rule 2: Valid Problem Type

```
problem_type_ai NOT IN ('not_a_road_problem', null)
```

The AI must have identified a specific road problem category. If the AI says "not a road problem" or failed to classify, auto-approval is not possible.

### Rule 3: User and AI Agreement

```
problem_type_user == problem_type_ai
OR problem_type_user IS NULL (user accepted AI suggestion)
```

The user's selected category must match the AI's suggestion. If the user overrode the AI to pick a different category, the disagreement signals uncertainty — send to manual review.

### Rule 4: Photo Quality Check

```
photo passes basic quality validation:
  - Width >= 640px AND Height >= 480px (minimum resolution)
  - File size >= 50KB (not a blank/corrupt image)
  - File size <= 15MB (within upload limits)
```

These checks are performed during upload (Spec 02) and stored in photo metadata. The auto-moderate job reads this metadata rather than re-analyzing the image.

**v2 enhancement:** ML-based blur detection (e.g., Laplacian variance). Not in v1 — the basic resolution/size check catches the most obvious garbage.

### Rule 5: Trusted User

```
User has >= 3 previously approved reports
AND user's rejection rate on last 10 reports < 30%
```

A "trusted user" is someone with a track record. First-time reporters always go through manual review, no matter how confident the AI is. This protects against new-account spam.

**Implementation:**

```typescript
async function isUserTrusted(userId: string): Promise<boolean> {
  const stats = await prisma.$queryRaw<[{ approved: number; rejected: number; total: number }]>`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('approved', 'in_progress', 'resolved', 'archived')) AS approved,
      COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
      COUNT(*) AS total
    FROM reports
    WHERE user_id = ${userId}::uuid
      AND deleted_at IS NULL
      AND created_at > now() - INTERVAL '365 days'
  `

  const { approved, rejected, total } = stats[0]
  if (approved < 3) return false

  // Check last 10 reports for rejection rate
  const recent = await prisma.$queryRaw<[{ rejected_count: number }]>`
    SELECT COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count
    FROM (
      SELECT status FROM reports
      WHERE user_id = ${userId}::uuid AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 10
    ) recent
  `

  return recent[0].rejected_count / Math.min(total, 10) < 0.3
}
```

### Rule 6: No Profanity in Description

```
description does not match profanity regex patterns (if description is provided)
```

A basic regex check against a list of profane words in Armenian, Russian, and English. The word list is stored in Redis (`moderation:profanity_patterns`) and can be updated without deploy.

**Implementation:** Simple word boundary regex matching, not ML-based sentiment analysis. False positives (the regex matches a benign word) cause the report to go to manual review, not rejection — so the cost of false positives is low.

```typescript
async function containsProfanity(redis: Redis, text: string | null): Promise<boolean> {
  if (!text) return false
  const patterns = await redis.smembers('moderation:profanity_patterns')
  const combined = new RegExp(`\\b(${patterns.join('|')})\\b`, 'iu')
  return combined.test(text)
}
```

### Rule 7: Coordinates on Road Network (v2)

```
ST_Intersects(report.location, road_network.geometry) = true
```

Checks if the report's coordinates fall on or near a known road segment. Requires road network geometry data (OpenStreetMap import) which is not available in v1. **Deferred to v2.**

---

## Auto-Reject Rules

ANY of the following triggers auto-rejection:

### Rule A: Definitively Not a Road Problem

```
problem_type_ai == 'not_a_road_problem'
AND ai_confidence >= 0.90
```

The AI is very confident this is not a road problem. The threshold is higher than for auto-approve (0.90 vs 0.85) because rejection is a more consequential action — a false rejection means a legitimate report is discarded.

### Rule B: Extremely Low Road Category Confidence

```
ai_confidence < 0.3 for ALL road problem categories
```

The AI cannot find any road problem in the photo with even moderate confidence. This catches photos of food, selfies, blank walls, etc.

### Rule C: Flagged User

```
User has >= 5 total reports
AND rejection rate on last 10 reports > 50%
```

A user whose reports are mostly rejected is likely a spammer or troll. Their new reports are auto-rejected as a spam prevention measure.

**Important:** This does not ban the user — they can still submit reports, and the auto-rejection can be overridden by a moderator. It just deprioritizes their submissions.

**Notification:** Auto-rejected reports still trigger the `report.rejected` notification to the author (Spec 12) with the generic rejection category, same as manual rejections.

---

## Implementation

### BullMQ Job: `auto-moderate`

A new job in the existing `report-photo-processing` queue (Spec 03). Runs after the `classify-report-photo` job completes.

**Queue name:** `report-photo-processing`
**Job name:** `auto-moderate-report`

#### Job Payload

```typescript
interface AutoModerateJobData {
  reportId: string
  classificationId: string
}
```

#### Job Flow

```
classify-report-photo job completes
  ↓
Report is created (POST /api/v1/reports, Spec 02)
  ↓
Report status: pending_review
  ↓
After report INSERT, enqueue auto-moderate job:
  queue.add('auto-moderate-report', { reportId, classificationId })
  ↓
auto-moderate worker picks up job
  ↓
Worker reads:
  1. Report data (status, description, photo metadata)
  2. Classification result (problem_type_ai, ai_confidence)
  3. User history (approved count, rejection rate)
  4. Feature flag: AI_MODERATION_ENABLED
  5. Rule thresholds from Redis
  ↓
If feature flag is off OR report status != pending_review:
  → skip (report was already acted on or feature is disabled)
  ↓
Evaluate auto-approve rules (all must pass)
  → YES: auto-approve
  ↓
Evaluate auto-reject rules (any can trigger)
  → YES: auto-reject
  ↓
Default: manual_review (no action, report stays in queue)
```

#### Worker Implementation

```typescript
// apps/api/src/workers/auto-moderate.ts

import { Job } from 'bullmq'

interface AutoModerateResult {
  decision: 'auto_approve' | 'auto_reject' | 'manual_review'
  rulesMatched: string[]
  reason?: string
}

export async function processAutoModerate(
  job: Job<AutoModerateJobData>,
): Promise<AutoModerateResult> {
  const { reportId } = job.data

  // 1. Check feature flag
  const enabled = await redis.get('config:ai_moderation_enabled')
  if (enabled !== 'true') {
    return { decision: 'manual_review', rulesMatched: ['feature_disabled'] }
  }

  // 2. Load report + classification + user history
  const report = await loadReport(reportId)
  if (!report || report.status !== 'pending_review') {
    return { decision: 'manual_review', rulesMatched: ['invalid_state'] }
  }

  const thresholds = await loadThresholds(redis)
  const rulesMatched: string[] = []

  // 3. Check auto-reject rules first (higher priority)
  if (report.problemTypeAi === 'not_a_road_problem' && report.aiConfidence >= thresholds.rejectConfidence) {
    rulesMatched.push('not_road_problem_high_confidence')
  }
  if (report.aiConfidence !== null && report.aiConfidence < thresholds.minCategoryConfidence) {
    rulesMatched.push('extremely_low_confidence')
  }
  const userFlagged = await isUserFlagged(report.userId)
  if (userFlagged) {
    rulesMatched.push('flagged_user')
  }

  if (rulesMatched.length > 0) {
    await autoReject(reportId, rulesMatched)
    return { decision: 'auto_reject', rulesMatched }
  }

  // 4. Check auto-approve rules (all must pass)
  const approveChecks = await evaluateApproveRules(report, thresholds)
  if (approveChecks.allPassed) {
    await autoApprove(reportId, approveChecks.rulesMatched)
    return { decision: 'auto_approve', rulesMatched: approveChecks.rulesMatched }
  }

  // 5. Default: manual review
  return {
    decision: 'manual_review',
    rulesMatched: approveChecks.failedRules,
  }
}
```

#### Auto-Approve Action

```typescript
async function autoApprove(reportId: string, rulesMatched: string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Update report
    await tx.report.update({
      where: { id: reportId },
      data: {
        status: 'approved',
        moderationType: 'auto',
        moderationRulesMatched: rulesMatched,
        moderatedAt: new Date(),
        // moderated_by remains null — no human moderator
      },
    })

    // Insert status history
    await tx.reportStatusHistory.create({
      data: {
        reportId,
        fromStatus: 'pending_review',
        toStatus: 'approved',
        changedByRole: null, // system
        note: `Auto-approved: ${rulesMatched.join(', ')}`,
      },
    })
  })

  // Publish event — triggers map cache invalidation + author notification + area subscriptions
  await redis.publish('events:report-approved', JSON.stringify({
    reportId,
    type: 'auto_approved',
  }))
}
```

#### Auto-Reject Action

```typescript
async function autoReject(reportId: string, rulesMatched: string[]): Promise<void> {
  const reasonMap: Record<string, string> = {
    'not_road_problem_high_confidence': 'Not a road problem',
    'extremely_low_confidence': 'Photo does not appear to show a road problem',
    'flagged_user': 'Submission flagged for review',
  }

  const rejectionReason = `[Auto] ${rulesMatched.map(r => reasonMap[r] || r).join('; ')}`

  await prisma.$transaction(async (tx) => {
    await tx.report.update({
      where: { id: reportId },
      data: {
        status: 'rejected',
        moderationType: 'auto',
        moderationRulesMatched: rulesMatched,
        rejectionReason,
        moderatedAt: new Date(),
      },
    })

    await tx.reportStatusHistory.create({
      data: {
        reportId,
        fromStatus: 'pending_review',
        toStatus: 'rejected',
        changedByRole: null,
        note: rejectionReason,
      },
    })
  })

  // Publish event — triggers author notification
  await redis.publish('events:report-status-changed', JSON.stringify({
    reportId,
    fromStatus: 'pending_review',
    toStatus: 'rejected',
    type: 'auto_rejected',
  }))
}
```

### Job Options

```typescript
{
  attempts: 1,          // no retries — if auto-moderate fails, report stays in manual queue
  removeOnComplete: { age: 7 * 24 * 3600 },
  removeOnFail: { age: 30 * 24 * 3600 },
}
```

**Why no retries?** If the auto-moderate job fails (DB error, Redis down), the report stays as `pending_review` in the manual moderation queue. A moderator will handle it. Retrying could cause a delayed auto-decision on a report that a moderator has already opened.

---

## Database Changes

### New Columns on `reports`

```sql
ALTER TABLE reports
  ADD COLUMN moderation_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN moderation_rules_matched TEXT[];

-- Constraint
ALTER TABLE reports
  ADD CONSTRAINT valid_moderation_type CHECK (moderation_type IN ('auto', 'manual'));
```

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `moderation_type` | `text` | NOT NULL, default `'manual'` | `'auto'` or `'manual'` — how this report was moderated |
| `moderation_rules_matched` | `text[]` | nullable | Array of rule IDs that matched. Audit trail. |

### Prisma Schema Changes

```prisma
// Add to existing Report model:
model Report {
  // ... existing fields ...
  moderationType       String   @default("manual") @map("moderation_type")
  moderationRulesMatched String[] @map("moderation_rules_matched")
  // ... existing relations ...
}
```

### Index

```sql
-- Filter reports by moderation type (for dashboard)
CREATE INDEX idx_reports_moderation_type ON reports(moderation_type)
  WHERE deleted_at IS NULL;
```

---

## Configuration

### Redis Hash: `config:auto_moderation`

All rule thresholds are stored in a Redis hash so they can be tuned without deploying:

```
HSET config:auto_moderation
  approve_confidence_threshold  "0.85"
  reject_confidence_threshold   "0.90"
  min_category_confidence       "0.3"
  trusted_user_min_approved     "3"
  trusted_user_max_reject_rate  "0.3"
  flagged_user_min_reports      "5"
  flagged_user_reject_rate      "0.5"
```

**Loading thresholds:**

```typescript
interface ModerationThresholds {
  approveConfidence: number
  rejectConfidence: number
  minCategoryConfidence: number
  trustedUserMinApproved: number
  trustedUserMaxRejectRate: number
  flaggedUserMinReports: number
  flaggedUserRejectRate: number
}

async function loadThresholds(redis: Redis): Promise<ModerationThresholds> {
  const raw = await redis.hgetall('config:auto_moderation')

  return {
    approveConfidence: parseFloat(raw.approve_confidence_threshold || '0.85'),
    rejectConfidence: parseFloat(raw.reject_confidence_threshold || '0.90'),
    minCategoryConfidence: parseFloat(raw.min_category_confidence || '0.3'),
    trustedUserMinApproved: parseInt(raw.trusted_user_min_approved || '3'),
    trustedUserMaxRejectRate: parseFloat(raw.trusted_user_max_reject_rate || '0.3'),
    flaggedUserMinReports: parseInt(raw.flagged_user_min_reports || '5'),
    flaggedUserRejectRate: parseFloat(raw.flagged_user_reject_rate || '0.5'),
  }
}
```

Defaults are hardcoded as fallbacks in case the Redis hash doesn't exist (first deploy, Redis flush, etc.).

### Feature Flag

```
Environment variable: AI_MODERATION_ENABLED=false (default)
```

When `false`, the auto-moderate job is still enqueued and runs, but always returns `manual_review`. This allows monitoring the would-be decisions in logs (shadow mode) without affecting production behavior.

The feature flag is also mirrored to Redis (`config:ai_moderation_enabled`) so it can be toggled without restart during the phased rollout.

---

## Monitoring

### Daily Metrics

Tracked via the `reports` table and `report_status_history`:

| Metric | Query |
|---|---|
| Auto-approved today | `SELECT COUNT(*) FROM reports WHERE moderation_type = 'auto' AND status = 'approved' AND moderated_at >= today` |
| Auto-rejected today | `SELECT COUNT(*) FROM reports WHERE moderation_type = 'auto' AND status = 'rejected' AND moderated_at >= today` |
| Manual review today | `SELECT COUNT(*) FROM reports WHERE moderation_type = 'manual' AND moderated_at >= today` |
| Auto-approve rate | `auto_approved / (auto_approved + auto_rejected + manual)` |
| Override rate | Reports where `moderation_type = 'auto'` AND a manual status change happened afterward |

### False Positive / Negative Tracking

A "false positive" is an auto-approved report that a moderator later rejects (or hides after user complaints). A "false negative" is an auto-rejected report that a moderator later re-opens and approves.

**Detection:**

```sql
-- False positives: auto-approved, then manually rejected or hidden
SELECT r.id, r.moderated_at AS auto_decision_at, h.created_at AS override_at
FROM reports r
JOIN report_status_history h ON r.id = h.report_id
WHERE r.moderation_type = 'auto'
  AND h.from_status = 'approved'
  AND h.to_status = 'rejected'
  AND h.changed_by IS NOT NULL  -- human action

-- False negatives: auto-rejected, then manually re-opened and approved
SELECT r.id
FROM reports r
JOIN report_status_history h1 ON r.id = h1.report_id AND h1.note LIKE '[Auto]%' AND h1.to_status = 'rejected'
JOIN report_status_history h2 ON r.id = h2.report_id AND h2.to_status = 'approved' AND h2.changed_by IS NOT NULL
WHERE r.moderation_type = 'auto'
```

### Alerts

| Condition | Alert | Channel |
|---|---|---|
| Auto-reject rate > 30% (rolling 24h) | "Auto-reject rate unusually high — possible model drift" | Telegram (admin channel) |
| False positive rate > 1% (rolling 7 days) | "Auto-approve accuracy degraded" | Telegram (admin channel) |
| Auto-moderate job failure rate > 5% | "Auto-moderation jobs failing" | Telegram (admin channel) |

Alert checks run as a daily cron job at 09:00 AM Yerevan time. Alerts are sent to the admin Telegram channel (not individual users) via the notification queue (Spec 12).

---

## Frontend Changes

### Report Detail Page

Add a badge indicating how the report was moderated:

```
┌─────────────────────────────────────────┐
│  Status: Approved  •  Auto-approved ✓   │
│                                         │
│  Matched rules: high_confidence,        │
│  trusted_user, user_ai_agreement        │
└─────────────────────────────────────────┘
```

- **"Auto-approved"** badge: green, shown next to the status for reports where `moderation_type = 'auto'` and `status = 'approved'`
- **"Auto-rejected"** badge: red, shown for `moderation_type = 'auto'` and `status = 'rejected'`
- **Rules matched:** shown only to moderators/admins in the report detail view (not public)

### Moderation Dashboard

Add a tab/filter for auto-moderated reports:

```
Tabs:  [Queue (12)]  [Auto-moderated (47)]  [All reviewed]
```

**Auto-moderated tab** shows:
- Reports with `moderation_type = 'auto'`, sorted by `moderated_at DESC`
- Filter by decision: auto-approved, auto-rejected
- Each row shows: report ID, problem type, AI confidence, decision, rules matched, time
- **Override button:** "Review" — opens the report detail page where the moderator can reverse the auto-decision

### Override Flow

When a moderator overrides an auto-decision:

1. **Auto-approved → Reject:** Moderator clicks "Reject" on an auto-approved report. Same flow as Spec 05 rejection. The report's `moderation_type` stays `'auto'` (for audit), but a new `report_status_history` entry records the manual override.

2. **Auto-rejected → Approve:** Moderator clicks "Re-open" (admin only, per Spec 05), then approves through the normal moderation flow.

3. All overrides are tracked as false positives/negatives in the monitoring system.

### Dashboard Stats Widget

A small stats card on the moderation dashboard home:

```
┌──────────────────────────────────┐
│  AI Moderation (last 7 days)     │
│                                  │
│  Auto-approved:  142  (58%)      │
│  Auto-rejected:   23  ( 9%)     │
│  Manual review:   81  (33%)      │
│                                  │
│  Override rate:   1.2%           │
│  False positive:  0.7%           │
└──────────────────────────────────┘
```

---

## Rollout Plan

### Phase 1: Shadow Mode

**Duration:** 2 weeks minimum
**Feature flag:** `AI_MODERATION_ENABLED=false`

- The auto-moderate job runs on every new report
- It evaluates all rules and logs the decision it would have made
- No reports are actually auto-approved or auto-rejected
- All reports go through normal manual moderation
- **Goal:** Collect data on what the AI moderation would decide. Compare with actual moderator decisions to measure accuracy.

**Success criteria to move to Phase 2:**
- Shadow auto-approve accuracy > 99% (compare with moderator decisions)
- Shadow auto-reject accuracy > 95%
- No unexpected edge cases discovered

### Phase 2: Auto-Approve Only

**Duration:** 2-4 weeks
**Feature flag:** `AI_MODERATION_ENABLED=true`
**Redis override:** `config:auto_moderation:mode = approve_only`

- Reports meeting ALL auto-approve rules are automatically approved
- No auto-rejections — all reject candidates go to manual queue
- Moderators monitor the auto-approved tab daily for false positives
- Override rate is tracked and reported

**Success criteria to move to Phase 3:**
- False positive rate < 1% over 2 weeks
- No user complaints about incorrectly approved reports
- Moderator workload reduced by 30%+

### Phase 3: Auto-Approve + Auto-Reject

**Feature flag:** `AI_MODERATION_ENABLED=true`
**Redis override:** `config:auto_moderation:mode = full`

- Both auto-approve and auto-reject are active
- Auto-rejected users receive the standard rejection notification
- Moderators review auto-rejections weekly for false negatives
- Alert system active for anomalous rejection rates

**Success criteria (ongoing):**
- Combined false positive + false negative rate < 2%
- Moderator workload reduced by 50%+
- No increase in user churn correlated with auto-rejections

---

## Security

- Auto-moderation decisions are logged with full audit trail (`moderation_type`, `moderation_rules_matched`, `report_status_history`)
- AI confidence scores and rule evaluations are never exposed via the public API
- The profanity word list is stored in Redis, not hardcoded, to allow updates without code deployment and to keep it out of the source code
- Feature flag prevents auto-moderation from running in production until explicitly enabled
- All rule thresholds have hardcoded floor values (e.g., `approve_confidence` cannot be set below `0.70`) to prevent accidental misconfiguration
- Auto-rejected reports can always be re-opened by an admin — the system never permanently locks out legitimate reports
- The `flagged_user` rule does not ban users or restrict their ability to submit — it only affects the moderation path

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AI_MODERATION_ENABLED` | No | `false` | Master feature flag for AI moderation |

All other configuration is via Redis hash `config:auto_moderation` — no additional env vars needed.

---

## Testing

### Unit Tests

- Rule evaluation: each rule tested individually with boundary values
  - `ai_confidence = 0.85` → passes, `0.84` → fails
  - `problem_type_ai = 'not_a_road_problem'` → fails approve, triggers reject check
  - Trusted user with 3 approved → passes, 2 approved → fails
  - Flagged user with 60% rejection → triggers auto-reject
- Threshold loading: verify Redis hash values override defaults, verify floor values
- Profanity check: match known patterns, no false positive on clean text
- Decision precedence: reject rules checked before approve rules

### Integration Tests

- Full auto-approve flow: create report with high-confidence classification + trusted user → verify report status changes to `approved` without moderator action
- Full auto-reject flow: create report with `not_a_road_problem` classification + high confidence → verify status changes to `rejected`
- Manual review fallback: create report that fails one approve rule → verify status stays `pending_review`
- Feature flag off: create high-confidence report → verify status stays `pending_review`
- Override flow: auto-approve → moderator reject → verify status history shows both entries
- Shadow mode: verify job runs, logs decision, but does not change report status

### E2E Tests

- Moderation dashboard: auto-moderated tab shows correct reports
- Override button: moderator can reject an auto-approved report
- Stats widget: displays correct counts
- Feature flag toggle: admin can enable/disable via settings (if admin UI exists)

---

## Out of Scope for v1

- **Road network intersection check** — verifying that report coordinates fall on a known road. Requires OpenStreetMap road geometry import and regular updates. Significant infrastructure investment. Deferred to v2.
- **Image quality ML model** — blur detection, lighting analysis, object recognition beyond the existing Claude classification. Would require training a custom model or integrating an additional CV service. Deferred to v2.
- **Community flagging** — allowing users to flag auto-approved reports they believe are incorrect. Would feed back into the false positive tracking. Deferred to v2.
- **Adaptive thresholds** — automatically adjusting confidence thresholds based on false positive/negative rates. Requires sufficient data volume (1000+ auto-moderated reports). Deferred to v2.
- **Per-category thresholds** — different confidence requirements for different problem types (e.g., potholes are easier to classify than "hazard"). Deferred to v2 after analyzing per-category accuracy data.
- **Moderator ML training feedback** — using moderator approve/reject decisions to fine-tune the AI classification model. Requires an MLOps pipeline. Far future.
- **Multi-photo analysis** — analyzing multiple photos per report for higher confidence. Currently reports have one photo (Spec 02). Deferred to when multi-photo support is added.
