# Spec 03 — AI Classification

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

After a report is submitted, a BullMQ worker sends the photo to the Claude API for classification. The worker determines the `problem_type` and a confidence score, then updates the report. This process is fully asynchronous and never blocks report creation.

---

## BullMQ Job

**Queue name:** `report-photo-processing`
**Job name:** `classify-report-photo`

### Job payload

```typescript
{
  reportId: string        // UUID
  photoR2Key: string      // R2 object key of the original photo
  userId: string          // Clerk user ID — for audit only, not sent to Claude
}
```

### Job options

```typescript
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 60_000   // 1min → 5min → 15min
  },
  removeOnComplete: { age: 86400 },   // keep completed jobs 24h for debugging
  removeOnFail: { age: 604800 }       // keep failed jobs 7 days
}
```

---

## Worker Logic

```
1. Fetch signed R2 URL for the photo (TTL: 5 minutes — enough for Claude API call)
2. Build Claude API request (see Prompt Design below)
3. Call Claude API
4. Parse and validate response (see Response Parsing below)
5. UPDATE report SET
     problem_type = <parsed type>,
     problem_type_source = 'ai',
     ai_confidence = <parsed confidence>,
     ai_raw_response = <full Claude response as jsonb>
   WHERE id = reportId
6. If confidence < 0.6 → do NOT set problem_type, leave null
   (moderator will classify manually)
```

---

## Claude API Request

**Model:** `claude-sonnet-4-5`
**Method:** Messages API with vision (base64 image)

### Image preparation

- Fetch photo bytes from R2 using signed URL
- If file > 5 MB: resize to max 1600px on longest side before sending (Cloudflare Images or sharp)
- Send as `image/jpeg` or `image/png` base64 in the `image` content block

### Prompt

**System prompt:**

```
You are a road infrastructure analysis assistant. Your only task is to classify road problems from photos submitted by citizens in Armenia.

You must respond with valid JSON only. No explanation, no markdown, no extra text.
```

**User message:**

```
Analyze this photo and classify the road problem shown.

Respond with this exact JSON structure:
{
  "problem_type": "<type>",
  "confidence": <float 0.0-1.0>,
  "reasoning": "<one sentence in English>"
}

Valid values for problem_type:
- "pothole" — damaged or broken road surface, potholes
- "missing_marking" — faded, missing or damaged road markings
- "damaged_sign" — broken, missing, obscured or vandalized road signs
- "hazard" — dangerous road condition (cliff edge, flooding, landslide, road collapse)
- "broken_light" — non-functioning traffic light
- "other" — road-related problem that doesn't fit above categories
- "not_a_road_problem" — photo does not show a road problem (use if photo is irrelevant, blurry beyond recognition, or clearly not road infrastructure)

Rules:
- If the photo is too blurry or dark to classify reliably, set confidence below 0.5
- If multiple problems are visible, classify the most severe one
- confidence must reflect how certain you are, not how severe the problem is
- reasoning must be one sentence maximum
```

### API call parameters

```typescript
{
  model: 'claude-sonnet-4-5',
  max_tokens: 256,
  temperature: 0,       // deterministic output for classification tasks
  messages: [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type, data } },
        { type: 'text', text: <user prompt above> }
      ]
    }
  ]
}
```

---

## Response Parsing

1. Extract `content[0].text` from Claude response
2. Parse as JSON (wrap in try/catch)
3. Validate with Zod schema:

```typescript
const ClassificationSchema = z.object({
  problem_type: z.enum([
    'pothole', 'missing_marking', 'damaged_sign',
    'hazard', 'broken_light', 'other', 'not_a_road_problem'
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(500)
})
```

4. If JSON parse fails or Zod validation fails → treat as classification failure (see Failure Handling)

### Confidence threshold logic

| Confidence | Action |
|---|---|
| ≥ 0.6 | Set `problem_type` on report, `problem_type_source = 'ai'` |
| < 0.6 | Leave `problem_type = null`, moderator classifies manually |
| `not_a_road_problem` at any confidence | Flag report for moderator review — do not auto-reject |

**Why not auto-reject `not_a_road_problem`?** The AI can be wrong, and auto-rejection without human review would erode user trust. The moderator makes the final call.

---

## Failure Handling

### Transient failures (retried)
- Claude API timeout (> 30s)
- Claude API 5xx errors
- R2 fetch failure
- Network errors

### Permanent failures (not retried after 3 attempts)
- Claude API 4xx (bad request, invalid image format)
- JSON parse failure after 3 attempts
- Zod validation failure after 3 attempts

### After 3 failed attempts
1. Mark BullMQ job as `failed`
2. Leave `problem_type = null`, `ai_job_id` remains set (for debugging)
3. Send internal alert (log to stderr + Redis pub/sub event on `internal:alerts` channel)
4. Report stays in `pending_review` — moderator classifies manually
5. **Do not expose failure to the user** — from their perspective the report was accepted

---

## Security

- The signed R2 URL passed to the worker has a 5-minute TTL — it is never stored or logged
- `ai_raw_response` (full Claude response) is stored in DB for audit but **never returned via any API endpoint**
- `reasoning` from AI is stored in `ai_raw_response` but not shown to users or moderators in v1
- No user data (name, clerk_id, IP) is sent to Claude API — only the photo
- Claude API key stored in environment variable `CLAUDE_API_KEY` only — never logged

---

## Observability

Log the following on each job (structured JSON logs, no PII):

```
{ jobId, reportId, status: 'started' | 'completed' | 'failed', durationMs, problemType, confidence, attempt, errorCode? }
```

Track in Redis counters (reset daily):
- `metrics:ai:total` — total jobs processed
- `metrics:ai:failed` — failed jobs
- `metrics:ai:low_confidence` — jobs where confidence < 0.6

---

## Out of Scope (v1)

- AI-assisted moderation (auto-approve high-confidence results) — planned for v2
- Multi-photo reports with aggregated classification
- Re-classification when a moderator overrides the AI result
- Cost tracking per classification call
