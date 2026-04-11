# Spec 06 — Auth & Roles

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

**Development priority: HIGH — implement before any protected endpoint.**

---

## Overview

Authentication is handled by **Clerk**. The backend never manages passwords or sessions — it trusts Clerk-issued JWTs and verifies them on every request. User records in the local DB are synced from Clerk via webhooks.

---

## Implementation Order

This spec must be fully implemented before work begins on:
- Report submission (Spec 02)
- Moderation flow (Spec 05)
- Any endpoint under `/api/v1/` (non-public)

The public map API (Spec 04, `/api/v1/public/`) does not require auth but shares the same Fastify server — rate limiting middleware must still be in place.

---

## Clerk Setup

### Required Clerk configuration

- **Allowed OAuth providers:** Google, Apple
- **JWT template:** create a custom template that includes `role` in the JWT claims (synced from Clerk's `publicMetadata`)
- **Webhook endpoint:** `POST /api/v1/internal/clerk-webhook` — receives `user.created`, `user.updated`, `user.deleted` events
- **Session token expiry:** 1 hour (Clerk default — do not extend)

### JWT structure

Clerk issues a signed JWT. Custom claims added via JWT template:

```json
{
  "sub": "user_xxxxxxxxxxxxxxxx",   // Clerk user ID
  "role": "user",                   // from publicMetadata.role
  "iat": 1744358400,
  "exp": 1744362000
}
```

The `role` field is set in Clerk's `publicMetadata` — only the backend (via Clerk Admin API) can write to `publicMetadata`. Users cannot self-elevate their role.

---

## JWT Verification (Fastify)

All protected routes go through a `verifyAuth` Fastify preHandler hook.

### Hook logic

```typescript
async function verifyAuth(request, reply) {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ code: 'UNAUTHORIZED' })
  }

  const token = header.slice(7)

  // Verify with Clerk SDK — checks signature, expiry, issuer
  const payload = await clerkClient.verifyToken(token)
  // Never manually decode JWT — always use Clerk SDK verification

  request.auth = {
    clerkId: payload.sub,
    role: payload.role ?? 'user'
  }
}
```

**Critical rules:**
- Never manually `jwt.decode()` without verification — always use `clerkClient.verifyToken()`
- Never trust `role` from the request body — always read from verified JWT payload
- Never cache verified tokens server-side — Clerk handles token validity; revoked tokens must fail immediately

### Route registration pattern

```typescript
// Public — no auth
fastify.get('/api/v1/public/reports', publicReportsHandler)

// Authenticated — any role
fastify.post('/api/v1/reports', { preHandler: verifyAuth }, createReportHandler)

// Role-gated
fastify.post('/api/v1/moderation/reports/:id/approve', {
  preHandler: [verifyAuth, requireRole('moderator', 'admin')]
}, approveReportHandler)
```

### `requireRole` helper

```typescript
function requireRole(...roles: Role[]) {
  return async (request, reply) => {
    if (!roles.includes(request.auth.role)) {
      return reply.code(403).send({ code: 'FORBIDDEN' })
    }
  }
}
```

---

## Roles

| Role | Assigned by | Can do |
|---|---|---|
| `user` | Default on registration | Submit reports, confirm reports, view own history |
| `moderator` | Admin via Clerk dashboard | All `user` actions + moderation queue |
| `gov_agency` | Admin via Clerk dashboard | View verified reports + update status to `in_progress` / `resolved` |
| `admin` | Manually in Clerk | All actions including re-open rejected, assign roles, revoke API keys |

### Role assignment

Roles are set in Clerk `publicMetadata`:

```typescript
await clerkClient.users.updateUser(clerkId, {
  publicMetadata: { role: 'moderator' }
})
```

Only `admin` role users can call the role assignment endpoint. Role changes propagate on next JWT refresh (up to 1 hour delay — acceptable).

### Role escalation endpoint

`POST /api/v1/admin/users/:clerk_id/role`

**Auth:** `admin` only

```typescript
{ role: 'user' | 'moderator' | 'gov_agency' | 'admin' }
```

Calls Clerk Admin API to update `publicMetadata`. Also updates the local `users.role` column for analytics/queries.

---

## Clerk Webhook

### `POST /api/v1/internal/clerk-webhook`

**Auth:** Webhook signature verification (Svix) — NOT a JWT endpoint.

Verifies the `svix-id`, `svix-timestamp`, `svix-signature` headers against the webhook secret before processing. Reject all requests that fail signature verification with `400`.

Replay attack protection: reject events with `svix-timestamp` older than 5 minutes.

#### `user.created`

```typescript
INSERT INTO users (clerk_id, role, display_name, created_at)
VALUES ($clerk_id, 'user', $display_name, now())
ON CONFLICT (clerk_id) DO NOTHING
```

`role` defaults to `user` — regardless of what Clerk sends. Role elevation only via the admin endpoint above.

#### `user.updated`

```typescript
UPDATE users
SET display_name = $display_name,
    role = $role,         // synced from publicMetadata
    updated_at = now()
WHERE clerk_id = $clerk_id
```

#### `user.deleted`

```typescript
UPDATE users
SET is_banned = true,     // soft delete — preserve report history
    updated_at = now()
WHERE clerk_id = $clerk_id
```

Hard delete is not performed. Reports authored by deleted users remain on the map (attribution removed — `user_id` still set in DB but never exposed publicly).

---

## Rate Limiting

Rate limiting is enforced via Redis at the Fastify middleware level, before route handlers.

### Limits per endpoint group

| Endpoint group | Limit | Window | Key |
|---|---|---|---|
| `POST /api/v1/classify` (photo upload) | 20 req | 1 hour | `rate:classify:user:<clerk_id>` |
| `POST /api/v1/reports` (report creation) | 10 req | 24 hours rolling | `rate:report:user:<clerk_id>` |
| `POST /api/v1/moderation/*` | 200 req | 1 minute | `rate:moderation:user:<clerk_id>` |
| `POST /api/v1/reports/:id/confirm` | 50 req | 1 hour | `rate:confirm:user:<clerk_id>` |
| All `/api/v1/public/*` | 60 req | 1 minute | `rate:public:ip:<ip>` |

### Redis implementation

```typescript
async function rateLimit(key: string, limit: number, windowSecs: number) {
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, windowSecs)
  if (count > limit) throw new RateLimitError()
}
```

On `429`: include `Retry-After` header (seconds until window resets).

### Banned users

Check `users.is_banned` after JWT verification on all write endpoints. Banned users receive `403 USER_BANNED`. This check hits the DB — cache the result in Redis for 5 minutes:

```
cache:user:banned:<clerk_id>  →  '0' | '1'  TTL 5min
```

---

## API Keys (Gov Agency / MCP)

For `gov_agency` and external MCP integrations that need programmatic access without OAuth.

### Key format

```
oak_live_<32 random bytes base58>
```

Prefix `oak_` = OpenRoad API Key. `live_` = production (vs `test_` for staging).

### Key verification (Fastify preHandler)

```typescript
async function verifyApiKey(request, reply) {
  const key = request.headers['x-api-key']
  if (!key) return reply.code(401).send({ code: 'UNAUTHORIZED' })

  const prefix = key.slice(0, 12)  // "oak_live_XXXX"
  const record = await db.apiKeys.findFirst({
    where: {
      key_prefix: prefix,
      revoked_at: null,
      OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }]
    }
  })

  if (!record) return reply.code(401).send({ code: 'INVALID_API_KEY' })

  const valid = await bcrypt.compare(key, record.key_hash)
  if (!valid) return reply.code(401).send({ code: 'INVALID_API_KEY' })

  // Update last_used_at async — don't block the request
  db.apiKeys.update({ where: { id: record.id }, data: { last_used_at: new Date() } })
    .catch(noop)

  request.auth = { clerkId: record.user_id, role: 'gov_agency', scopes: record.scopes }
}
```

**Important:** bcrypt compare is the bottleneck. Cache successful key lookups in Redis:
```
cache:apikey:<prefix>  →  { userId, role, scopes, keyHash }  TTL 5min
```

Only cache after bcrypt verification succeeds. Invalidate on key revocation.

### Key creation

`POST /api/v1/admin/api-keys` — `admin` only.

1. Generate key: `oak_live_` + 32 bytes from `crypto.randomBytes(32).toString('base58')`
2. Store `bcrypt.hash(key, 12)` in DB — never store plaintext
3. Store first 12 chars as `key_prefix`
4. Return plaintext key **once** in the response — never retrievable again

---

## Security Checklist

- [ ] JWT verified via Clerk SDK on every protected request — no manual decode
- [ ] `role` read from verified JWT payload only — never from request body
- [ ] Webhook signature verified via Svix before processing
- [ ] Webhook replay protection: reject events older than 5 minutes
- [ ] `user.created` webhook: role always defaults to `user` regardless of payload
- [ ] API key stored as bcrypt hash — plaintext shown once on creation only
- [ ] API key lookup cached in Redis after successful bcrypt verify
- [ ] Banned user check cached in Redis (5 min TTL)
- [ ] Rate limits enforced before route handlers, not inside them
- [ ] No auth errors reveal whether a user/key exists — always return generic `UNAUTHORIZED`
- [ ] Role escalation only via admin endpoint calling Clerk Admin API — users cannot self-elevate

---

## Out of Scope (v1)

- Multi-factor authentication
- Session invalidation on role change (takes effect on next JWT refresh, up to 1h)
- Per-endpoint scopes for JWT users (scopes are API-key only)
- OAuth for gov agencies (they use API keys)
