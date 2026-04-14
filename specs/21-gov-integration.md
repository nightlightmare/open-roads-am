# Spec 21 — Government System Integration

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

Collecting citizen reports about road problems is only half the mission. The other half is making sure the right government body actually sees and acts on them. Today, a report approved on open-road.am sits in the platform's database — useful for public visibility, but not directly actionable by the municipality responsible for fixing the road.

This spec introduces automatic forwarding of approved reports to the relevant municipal authority. In v1, forwarding is email-based: a structured, official-format email with report details, photo, and map link is sent to the designated contact at the responsible agency. In future versions, webhook and direct API integrations (including the planned ЕРПА unified government system) are supported.

**Goal:** Ensure that every approved report is delivered to the government agency responsible for the road segment within 5 minutes of approval, with tracking of delivery status and agency response rates.

---

## Integration Methods

### Phase 1: Email Forwarding (v1)

The primary integration method. A formatted email is sent to the municipal contact email on report approval. This requires no technical integration on the government side — every municipality has email.

### Phase 2: Webhook (v2)

For municipalities that build or adopt a digital intake system, open-road.am can POST structured JSON to a webhook URL. The payload matches the public API report schema with additional forwarding metadata.

### Phase 3: ЕРПА API (v3)

The Armenian government has discussed a unified request processing system (ЕРПА — Единая Регистрация Публичных Обращений). If/when an API becomes available, direct integration will replace email forwarding for participating agencies.

All three methods coexist — each agency is configured with its preferred method, and the system falls back to email if a webhook or API call fails.

---

## Database Schema

### gov_agencies

```sql
CREATE TABLE gov_agencies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_hy         TEXT NOT NULL,
  name_ru         TEXT,
  name_en         TEXT,
  agency_type     TEXT NOT NULL CHECK (agency_type IN (
                    'municipality', 'road_department', 'regional_admin', 'national'
                  )),
  contact_person  TEXT,
  email           TEXT,
  phone           TEXT,
  webhook_url     TEXT,
  webhook_secret  TEXT,                -- HMAC secret for webhook signature
  preferred_lang  TEXT NOT NULL DEFAULT 'hy' CHECK (preferred_lang IN ('hy', 'ru', 'en')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### gov_agency_regions

Many-to-many mapping between agencies and regions (an agency may cover multiple regions, and a region may have multiple responsible agencies).

```sql
CREATE TABLE gov_agency_regions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID NOT NULL REFERENCES gov_agencies(id) ON DELETE CASCADE,
  region_id   UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT false,  -- primary agency for this region
  UNIQUE (agency_id, region_id)
);

CREATE INDEX idx_gov_agency_regions_region ON gov_agency_regions(region_id);
```

### gov_forwards

Tracks every forwarding attempt and its outcome.

```sql
CREATE TABLE gov_forwards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID NOT NULL REFERENCES reports(id),
  agency_id       UUID NOT NULL REFERENCES gov_agencies(id),
  method          TEXT NOT NULL CHECK (method IN ('email', 'webhook', 'api')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending', 'sent', 'delivered', 'read', 'responded', 'failed'
                  )),
  email_message_id TEXT,              -- for email tracking
  webhook_response_code INT,          -- HTTP status from webhook
  error_message   TEXT,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  responded_at    TIMESTAMPTZ,
  response_text   TEXT,               -- agency's response (if any)
  forwarded_by    TEXT,               -- clerk_id of moderator (null for auto-forward)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gov_forwards_report ON gov_forwards(report_id);
CREATE INDEX idx_gov_forwards_agency ON gov_forwards(agency_id);
CREATE INDEX idx_gov_forwards_status ON gov_forwards(status);
```

### Prisma Models

```prisma
model GovAgency {
  id             String   @id @default(uuid())
  nameHy         String   @map("name_hy")
  nameRu         String?  @map("name_ru")
  nameEn         String?  @map("name_en")
  agencyType     String   @map("agency_type")
  contactPerson  String?  @map("contact_person")
  email          String?
  phone          String?
  webhookUrl     String?  @map("webhook_url")
  webhookSecret  String?  @map("webhook_secret")
  preferredLang  String   @default("hy") @map("preferred_lang")
  isActive       Boolean  @default(true) @map("is_active")
  notes          String?
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  regions        GovAgencyRegion[]
  forwards       GovForward[]

  @@map("gov_agencies")
}

model GovAgencyRegion {
  id        String   @id @default(uuid())
  agencyId  String   @map("agency_id")
  regionId  String   @map("region_id")
  isPrimary Boolean  @default(false) @map("is_primary")

  agency    GovAgency @relation(fields: [agencyId], references: [id], onDelete: Cascade)
  region    Region    @relation(fields: [regionId], references: [id], onDelete: Cascade)

  @@unique([agencyId, regionId])
  @@index([regionId])
  @@map("gov_agency_regions")
}

model GovForward {
  id                  String    @id @default(uuid())
  reportId            String    @map("report_id")
  agencyId            String    @map("agency_id")
  method              String
  status              String    @default("pending")
  emailMessageId      String?   @map("email_message_id")
  webhookResponseCode Int?      @map("webhook_response_code")
  errorMessage        String?   @map("error_message")
  sentAt              DateTime? @map("sent_at")
  deliveredAt         DateTime? @map("delivered_at")
  readAt              DateTime? @map("read_at")
  respondedAt         DateTime? @map("responded_at")
  responseText        String?   @map("response_text")
  forwardedBy         String?   @map("forwarded_by")
  createdAt           DateTime  @default(now()) @map("created_at")

  report              Report    @relation(fields: [reportId], references: [id])
  agency              GovAgency @relation(fields: [agencyId], references: [id])

  @@index([reportId])
  @@index([agencyId])
  @@index([status])
  @@map("gov_forwards")
}
```

---

## Email Forwarding (v1 Detail)

### Email Format

Emails are sent via a transactional email service (Resend, already used for Clerk email templates). The email is formatted as a semi-official letter.

**Subject line:**

```
[OpenRoad.am] Ճանdelays #{{report_id}} — {{problem_type_name_hy}}
```

**Email body (Armenian template):**

```
Հdelays,

{{agency_contact_person}} – {{agency_name_hy}}

OpenRoad.am platforms delays delays delays delays:

Delays delays: #{{report_id}}
Delays: {{problem_type_name_hy}}
Delays: {{address_text}}
Delays: {{latitude}}, {{longitude}}
Delays: {{created_at | format_date_hy}}
Delays: {{confirmation_count}}
Delays: {{description}}

Delays delays delays delays:
{{photo_url}}

Delays delays delays delays:
{{map_deep_link}}

Delays delays delays delays delays delays delays delays.

Delays,
OpenRoad.am delays
```

**The email includes:**

| Element | Source | Notes |
|---|---|---|
| Report ID | `reports.id` | Serves as reference number |
| Problem type | Localized name from `problem_types` | In agency's preferred language |
| Address | Reverse-geocoded address or coordinates | Human-readable when available |
| Coordinates | `reports.latitude`, `reports.longitude` | Always included for precision |
| Date reported | `reports.created_at` | Formatted per locale |
| Confirmation count | Aggregated from confirmations | Shows community validation |
| Description | `reports.description` | User-provided text |
| Photo | Attached from R2 (resized to 1200px max) | Also inline in HTML email |
| Map link | `https://open-road.am/hy/reports/{{id}}` | Deep link to report on platform |
| Reply-to | `support@open-road.am` | Platform support email |

### Email Sending (BullMQ)

Email sending is handled by a BullMQ job `forward-to-agency` to avoid blocking the moderation flow.

```typescript
// Job payload
interface ForwardToAgencyJob {
  reportId: string;
  agencyId: string;
  method: 'email' | 'webhook';
  forwardedBy: string | null; // null for auto-forward
}
```

**Job processing:**

1. Load report with relations (problem type, confirmations, region).
2. Load agency with preferred language.
3. Render email template in agency's language.
4. Download photo from R2, resize to 1200px max width.
5. Send email via Resend API.
6. Store `email_message_id` from Resend response.
7. Update `gov_forwards.status → 'sent'`, set `sent_at`.
8. On failure: update `status → 'failed'`, store `error_message`, retry up to 3 times with exponential backoff.

### Email Tracking

Resend provides webhook events for email delivery status:

| Resend Event | Maps to `gov_forwards.status` |
|---|---|
| `email.delivered` | `delivered` |
| `email.opened` | `read` |
| `email.bounced` | `failed` |
| `email.complained` | `failed` (+ deactivate agency email) |

A webhook endpoint `POST /api/v1/webhooks/resend` processes these events and updates `gov_forwards` accordingly. The endpoint validates the Resend webhook signature.

---

## Forwarding Triggers

### Automatic Forwarding (on approval)

When a report's status changes to `approved`:

1. Look up the report's region (from report coordinates via PostGIS spatial query against `regions` geometry).
2. Find all active agencies mapped to that region via `gov_agency_regions`.
3. For each agency with `is_primary = true`, enqueue a `forward-to-agency` job.
4. Create a `gov_forwards` record with `status = 'pending'`.

If no agency is configured for the region, log a warning and skip. The moderation dashboard shows "No agency configured" for reports in unmapped regions.

### Manual Forwarding (moderator action)

Moderators can forward a report to any active agency, regardless of region mapping. This handles:

- Reports in regions with no configured agency (moderator picks the correct one).
- Reports that need to go to a non-primary agency (e.g., national road department for highways).
- Re-forwarding after a failed delivery.

Endpoint: `POST /api/v1/moderation/reports/:id/forward`

```json
{
  "agencyId": "uuid",
  "note": "Optional note to include in email"
}
```

### Status Change Re-forward

When a report moves to `in_progress` status (meaning the agency acknowledged it), a follow-up email is sent as a reminder/confirmation. This is optional and configured per agency (`send_status_updates: boolean` field).

---

## Webhook Integration (v2)

### Webhook Payload

```json
{
  "event": "report.forwarded",
  "timestamp": "2026-04-14T12:00:00Z",
  "report": {
    "id": "uuid",
    "referenceNumber": "OR-2026-00142",
    "problemType": {
      "id": "pothole",
      "name": "Փodelays"
    },
    "location": {
      "latitude": 40.1234,
      "longitude": 44.5678,
      "address": "Mashtots Ave, Yerevan"
    },
    "description": "Deep pothole near the intersection",
    "photoUrl": "https://...",
    "reportedAt": "2026-04-13T08:30:00Z",
    "confirmationCount": 7,
    "mapUrl": "https://open-road.am/hy/reports/uuid"
  },
  "signature": "hmac-sha256-hex"
}
```

### Webhook Security

- HMAC-SHA256 signature in `X-OpenRoad-Signature` header.
- Secret stored in `gov_agencies.webhook_secret`.
- Agencies verify signature before processing.
- Webhook URL must be HTTPS.

### Webhook Response Handling

| HTTP Status | Action |
|---|---|
| 200-299 | `status → 'delivered'` |
| 400-499 | `status → 'failed'`, no retry (client error) |
| 500-599 | Retry up to 3 times with exponential backoff |
| Timeout (10s) | Retry up to 3 times |

---

## API Endpoints

### Admin Endpoints (role: admin)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/admin/gov-agencies` | List all agencies with region mappings |
| `GET` | `/api/v1/admin/gov-agencies/:id` | Agency detail with forwarding stats |
| `POST` | `/api/v1/admin/gov-agencies` | Create new agency |
| `PUT` | `/api/v1/admin/gov-agencies/:id` | Update agency details |
| `DELETE` | `/api/v1/admin/gov-agencies/:id` | Soft-delete (set `is_active = false`) |
| `GET` | `/api/v1/admin/gov-forwards` | List all forwards with filters |
| `GET` | `/api/v1/admin/gov-forwards/stats` | Aggregated response metrics |

### Moderation Endpoints (role: moderator, admin)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/moderation/reports/:id/forward` | Manually forward report to agency |
| `GET` | `/api/v1/moderation/reports/:id/forwards` | List all forwards for a report |

### Webhook Receiver

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/webhooks/resend` | Resend signature | Email delivery status updates |

### Zod Validation

```typescript
const createAgencySchema = z.object({
  nameHy: z.string().min(2).max(200),
  nameRu: z.string().max(200).optional(),
  nameEn: z.string().max(200).optional(),
  agencyType: z.enum(['municipality', 'road_department', 'regional_admin', 'national']),
  contactPerson: z.string().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  webhookUrl: z.string().url().startsWith('https://').optional(),
  preferredLang: z.enum(['hy', 'ru', 'en']).default('hy'),
  regionIds: z.array(z.string().uuid()).min(1, 'At least one region required'),
  primaryRegionId: z.string().uuid().optional(),
});

const manualForwardSchema = z.object({
  agencyId: z.string().uuid(),
  note: z.string().max(500).optional(),
});

const forwardFiltersSchema = z.object({
  agencyId: z.string().uuid().optional(),
  status: z.enum(['pending', 'sent', 'delivered', 'read', 'responded', 'failed']).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

---

## Agency Response Metrics Dashboard

### Stats Endpoint Response

```
GET /api/v1/admin/gov-forwards/stats?period=month
```

```json
{
  "period": "month",
  "overall": {
    "totalForwarded": 142,
    "delivered": 130,
    "read": 87,
    "responded": 34,
    "failed": 12,
    "avgResponseDays": 4.2,
    "responseRate": 0.24
  },
  "byAgency": [
    {
      "agencyId": "uuid",
      "agencyName": "Yerevan Municipality",
      "forwarded": 68,
      "delivered": 65,
      "read": 52,
      "responded": 21,
      "responseRate": 0.31,
      "avgResponseDays": 3.1
    }
  ]
}
```

### Dashboard UI (`/[locale]/admin/gov-agencies`)

```
┌─────────────────────────────────────────────────────┐
│  Government Agencies              [+ Add Agency]     │
│                                                      │
│  Agency Response Rates (Last 30 Days)                │
│  ┌─────────────────────────────────────────────┐     │
│  │ Yerevan Municipality    ████████░░  31%     │     │
│  │ Gyumri Municipality     ██████░░░░  22%     │     │
│  │ Road Dept (National)    ████░░░░░░  15%     │     │
│  │ Vanadzor Municipality   ███░░░░░░░  12%     │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  Recent Forwards                                     │
│  Report #142  →  Yerevan Muni   ✅ Delivered  2h ago │
│  Report #141  →  Road Dept      📧 Sent       3h ago │
│  Report #139  →  Gyumri Muni    ❌ Failed     5h ago │
│  Report #138  →  Yerevan Muni   👁 Read       1d ago │
└─────────────────────────────────────────────────────┘
```

### Report Detail (Moderation View)

The moderation report detail page (Spec 05) is extended with a forwarding section:

```
┌──────────────────────────────────────┐
│  Government Forwarding               │
│                                      │
│  Auto-forwarded to:                  │
│  ✅ Yerevan Municipality (delivered) │
│     Sent: Apr 13, 2026 14:30        │
│     Delivered: Apr 13, 2026 14:31   │
│                                      │
│  [Forward to another agency ▾]       │
└──────────────────────────────────────┘
```

### Public Report Detail

For public visitors, the report detail page shows a simple badge:

```
📤 Forwarded to Yerevan Municipality
```

No forwarding details, status, or contact information is shown publicly. This creates transparency — citizens see that the platform is taking action — without exposing government contacts or internal processes.

---

## Legal and Privacy Considerations

### Data Shared with Government

| Data | Shared | Reason |
|---|---|---|
| Report ID | Yes | Reference number |
| Problem type | Yes | Classification of the issue |
| Location (coords + address) | Yes | Required for action |
| Description | Yes | User-provided context |
| Photo | Yes | Visual evidence |
| Confirmation count | Yes | Community validation signal |
| Report creation date | Yes | Timeline |
| Reporter name/email | **No** | Privacy protection |
| Reporter phone | **No** | Privacy protection |
| Reporter Clerk ID | **No** | Privacy protection |
| Other reports by same user | **No** | Privacy protection |
| Platform internal notes | **No** | Internal only |

### Privacy Guarantees

1. **No user identity is ever shared with government agencies.** The forwarded report contains only the report data itself — coordinates, description, photo, and problem type.
2. **Photo EXIF data is stripped** before forwarding (already stripped on upload per Spec 02, but double-checked before email attachment).
3. **The reply-to email is the platform's support address**, not the reporter's email. If a government agency wants to communicate about a report, they reply to the platform, and the moderation team can relay relevant updates.
4. **Email tracking (open/delivery) does not track individual government employees** — it tracks whether the agency email system accepted and displayed the message.

### Data Sharing Agreement

A template data sharing agreement (in Armenian) should be prepared by legal counsel and signed by each participating agency before activation. The agreement covers:

- What data is shared (as above).
- How long the agency may retain forwarded data.
- That data may not be used to identify or contact reporters.
- That the platform may publish aggregate response statistics (e.g., "Yerevan Municipality responded to 31% of forwarded reports").

The agreement template is out of scope for engineering but is a prerequisite for activating forwarding to any agency.

---

## Configuration: Initial Agency Setup

Seed data for known agencies (to be populated by admin on launch):

| Agency | Type | Regions | Email |
|---|---|---|---|
| Yerevan Municipality | municipality | Yerevan districts | TBD |
| Gyumri Municipality | municipality | Gyumri | TBD |
| Vanadzor Municipality | municipality | Vanadzor | TBD |
| RA Ministry of Territorial Administration and Infrastructure | national | All | TBD |
| Armenian Road Directorate | road_department | National roads | TBD |

Contact emails are collected during partnership outreach and entered by the admin via the agency management UI.

---

## Testing

| Test | Type | Description |
|---|---|---|
| Auto-forward on approval | Integration | Approve report in mapped region → verify `gov_forwards` created and BullMQ job enqueued |
| No forward for unmapped region | Integration | Approve report in region with no agency → verify no forward, warning logged |
| Manual forward | Integration | POST to forward endpoint → verify `gov_forwards` created |
| Email rendering | Unit | Render template with mock data → verify all fields populated, no missing placeholders |
| Email sending | Integration | Mock Resend API → verify correct payload, attachment, headers |
| Resend webhook processing | Integration | POST delivery/open/bounce events → verify `gov_forwards` status updated |
| Webhook forwarding (v2) | Integration | Mock webhook endpoint → verify payload, HMAC signature |
| Agency CRUD | Integration | Create, update, soft-delete agencies → verify DB state |
| Stats aggregation | Integration | Seed forwards with various statuses → verify stats calculation |
| Duplicate forward prevention | Integration | Approve same report twice → verify only one forward per agency |
| Privacy: no user data in email | Unit | Render email → assert no user ID, email, or name in output |
| Zod validation | Unit | Invalid inputs → verify rejection with correct error messages |

---

## Implementation Plan

| Phase | Tasks | Depends On |
|---|---|---|
| 1. Schema + models | Prisma schema, migrations, seed data | Spec 01 (regions) |
| 2. Agency management | Admin CRUD endpoints + UI | Spec 06 (auth/roles) |
| 3. Email forwarding | Template, BullMQ job, Resend integration | Spec 05 (moderation), Resend account |
| 4. Auto-forward trigger | Hook into report approval flow | Phase 3 |
| 5. Tracking | Resend webhook, status updates, dashboard | Phase 3 |
| 6. Moderation UI | Forward button, status display on report detail | Phase 3, Spec 05 |
| 7. Public badge | "Forwarded to X" on public report page | Phase 4 |
| 8. Webhook (v2) | Webhook sending, HMAC, retry logic | Phase 3 |

---

## Out of Scope (v1)

- ЕРПА direct API integration (no public API available yet)
- Automated escalation (e.g., auto-re-forward if no response in 7 days)
- SLA enforcement or public shaming of non-responsive agencies
- Agency login to the platform (agencies interact only via email/webhook)
- Two-way communication thread between platform and agency
- Automated response parsing (e.g., extracting "will fix by date" from email replies)
- Integration with Armenian e-government portal (e-gov.am)
- Multi-agency workflow (e.g., agency A forwards to agency B)
