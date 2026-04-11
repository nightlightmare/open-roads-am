# CLAUDE.md — OpenRoad.am Development Guidelines

## Git Workflow

- **Every feature must be developed in a separate branch** from `main`
- Branch naming: `feature/<feature-name>`, `fix/<bug-name>`, `chore/<task-name>`
- After completing a feature — open a **Pull Request into `main`**
- PRs require: description of changes, link to relevant spec, test results

## Testing Requirements

- **All code must be tested before committing**
- Unit tests for business logic (services, utils, validators)
- Integration tests for API endpoints
- Run the full test suite before every commit — do not commit if tests fail
- No committing with `--no-verify`

## Code Quality

- All inputs validated with **Zod** — no exceptions
- No secrets or API keys in code — environment variables only
- TypeScript strict mode — no `any` unless absolutely unavoidable
- Every PR must pass linting (`oxlint`) and type checking (`tsc --noEmit`)

## Security Principles (non-negotiable)

- Validate and sanitize all user input at API boundary
- Rate limiting on every public endpoint
- Never expose internal error details to clients — log server-side only
- Photo uploads: validate file type by magic bytes, not extension
- Geolocation data from users must be validated for plausible coordinates (Armenia bounding box + reasonable buffer)
- API keys and JWT tokens must never be logged

## Architecture Constraints

- Public API (`/api/v1/public/`) — read-only, rate limited by IP, no auth required
- Internal API (`/api/v1/`) — requires Clerk JWT, role-based access
- AI photo processing is always async via BullMQ — never block the report creation flow
- PostGIS queries must use spatial indexes — never do full table scans for geo queries

## Product Decisions (locked)

- **No anonymous reports** — only authenticated users (Clerk) can submit reports
- **Real-time** = push notifications to moderators when a new report arrives, not live map updates
- **Moderation** = manual review by default; AI-assisted moderation may be added later as an enhancement
- **Map updates** = polling or on-demand refresh, not WebSocket

## Spec-Driven Development

- Every feature starts with a spec file in `/specs/<feature-name>.md`
- Spec must be reviewed and approved before implementation begins
- Implementation must match the spec — deviations require spec update first

## Progress Tracking

- **Update `progress.md` on every commit** — mark completed items with ✅
- Progress must reflect the actual state of the code, not plans
- When a spec section is fully done, mark the spec header as ✅
