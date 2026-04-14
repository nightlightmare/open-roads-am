/**
 * Seed script for E2E tests.
 *
 * Creates test users in the DB (looked up from Clerk by email)
 * and inserts fixture reports for Playwright tests.
 *
 * Usage:
 *   cd apps/api && pnpm tsx scripts/seed-e2e.ts
 *
 * Requires: DATABASE_URL, CLERK_SECRET_KEY in .env
 */

import { config } from 'dotenv'
import { resolve } from 'node:path'
import pg from 'pg'

// Load web .env (has valid Clerk key + DATABASE_URL), then API .env as fallback
config({ path: resolve(import.meta.dirname, '../../web/.env') })
config({ path: resolve(import.meta.dirname, '../.env') })

const CLERK_SECRET_KEY = process.env['CLERK_SECRET_KEY']
if (!CLERK_SECRET_KEY) throw new Error('CLERK_SECRET_KEY is required')

const DATABASE_URL = process.env['DATABASE_URL']
if (!DATABASE_URL) throw new Error('DATABASE_URL is required')

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })

// ─── Clerk helpers ──────────────────────────────────────────────────────────

async function clerkFetch<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Clerk API ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

interface ClerkUser {
  id: string
  email_addresses: Array<{ email_address: string }>
  first_name: string | null
  last_name: string | null
}

async function findClerkUserByEmail(email: string): Promise<ClerkUser | null> {
  const data = await clerkFetch<ClerkUser[]>(
    `/users?email_address=${encodeURIComponent(email)}&limit=1`,
  )
  return data[0] ?? null
}

// ─── DB helpers ─────────────────────────────────────────────────────────────

async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(sql, params)
  return res.rows as T[]
}

// ─── Test user emails ───────────────────────────────────────────────────────

const TEST_USERS = {
  user: {
    email: process.env['E2E_USER_EMAIL'] ?? 'e2e-user@test.open-roads.am',
    role: 'user',
  },
  moderator: {
    email: process.env['E2E_MODERATOR_EMAIL'] ?? 'e2e-moderator@test.open-roads.am',
    role: 'moderator',
  },
  admin: {
    email: process.env['E2E_ADMIN_EMAIL'] ?? 'e2e-admin@test.open-roads.am',
    role: 'admin',
  },
}

const LOCATIONS = {
  center: { lat: 40.1872, lng: 44.5152 },
  north: { lat: 40.2050, lng: 44.5200 },
  south: { lat: 40.1700, lng: 44.5100 },
  east: { lat: 40.1900, lng: 44.5400 },
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding E2E test data...\n')

  // Test DB connection
  await query('SELECT 1')
  console.log('✅ Database connected\n')

  // 1. Upsert test users
  const userIds: Record<string, string> = {}

  for (const [key, { email, role }] of Object.entries(TEST_USERS)) {
    const clerkUser = await findClerkUserByEmail(email)
    if (!clerkUser) {
      console.log(`⚠️  Clerk user not found for ${email} — skipping`)
      continue
    }

    const displayName = [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(' ') || key

    const rows = await query<{ id: string }>(
      `INSERT INTO users (clerk_id, role, display_name, is_banned, created_at, updated_at)
       VALUES ($1, $2::user_role, $3, false, NOW(), NOW())
       ON CONFLICT (clerk_id) DO UPDATE SET role = $2::user_role, display_name = $3, is_banned = false
       RETURNING id::text`,
      [clerkUser.id, role, displayName],
    )

    userIds[key] = rows[0]!.id
    console.log(`✅ User "${key}" → ${rows[0]!.id} (clerk: ${clerkUser.id}, role: ${role})`)
  }

  if (!userIds['user']) {
    console.log('\n❌ Cannot seed reports without a "user" account. Exiting.')
    return
  }

  // 2. Seed fixture reports
  const fixtures: Record<string, string> = {}

  async function seedReport(opts: {
    name: string
    userId: string
    status: string
    problemType: string
    location: { lat: number; lng: number }
    description?: string
    confirmationCount?: number
    moderatedBy?: string | null
  }): Promise<string> {
    const marker = `[e2e-seed:${opts.name}]`

    // Check existing
    const existing = await query<{ id: string }>(
      `SELECT id::text FROM reports WHERE description LIKE $1 LIMIT 1`,
      [`%${marker}%`],
    )
    if (existing.length > 0) {
      console.log(`  ♻️  ${opts.name} → ${existing[0]!.id} (exists)`)
      fixtures[opts.name] = existing[0]!.id
      return existing[0]!.id
    }

    const description = `${opts.description ?? 'E2E test report'} ${marker}`
    const rows = await query<{ id: string }>(
      `INSERT INTO reports (
        user_id, status, problem_type_user, problem_type_ai, ai_confidence,
        description, location, address_raw, photo_original_key,
        confirmation_count, moderated_by, created_at, updated_at
      ) VALUES (
        $1::uuid, $2::report_status, $3::problem_type, $3::problem_type, 0.85,
        $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), 'Yerevan, Armenia',
        $7, $8, $9::uuid, NOW(), NOW()
      ) RETURNING id::text`,
      [
        opts.userId,
        opts.status,
        opts.problemType,
        description,
        opts.location.lng,
        opts.location.lat,
        `e2e-seed/${opts.name}.jpg`,
        opts.confirmationCount ?? 0,
        opts.moderatedBy ?? null,
      ],
    )

    const id = rows[0]!.id
    fixtures[opts.name] = id
    console.log(`  ✅ ${opts.name} → ${id}`)
    return id
  }

  console.log('\n📝 Seeding reports...')

  // approved-report-with-photo
  const approvedId = await seedReport({
    name: 'approved-report-with-photo',
    userId: userIds['user']!,
    status: 'approved',
    problemType: 'pothole',
    location: LOCATIONS.center,
    description: 'Large pothole on Abovyan street',
    confirmationCount: 3,
    moderatedBy: userIds['moderator'] ?? null,
  })

  // Status history for approved report
  const histExists = await query(
    `SELECT 1 FROM report_status_history WHERE report_id = $1::uuid LIMIT 1`,
    [approvedId],
  )
  if (histExists.length === 0) {
    await query(
      `INSERT INTO report_status_history (report_id, from_status, to_status, changed_by_role, created_at)
       VALUES ($1::uuid, NULL, 'pending_review'::report_status, 'user'::user_role, NOW() - interval '2 days')`,
      [approvedId],
    )
    await query(
      `INSERT INTO report_status_history (report_id, from_status, to_status, changed_by, changed_by_role, created_at)
       VALUES ($1::uuid, 'pending_review'::report_status, 'approved'::report_status, $2::uuid, 'moderator'::user_role, NOW() - interval '1 day')`,
      [approvedId, userIds['moderator'] ?? null],
    )
    console.log(`  ✅ Status history for approved report`)
  }

  // approved-report-with-gov-note
  const govNoteId = await seedReport({
    name: 'approved-report-with-gov-note',
    userId: userIds['user']!,
    status: 'in_progress',
    problemType: 'damaged_sign',
    location: LOCATIONS.north,
    description: 'Damaged road sign near intersection',
  })

  const govNoteExists = await query(
    `SELECT 1 FROM report_status_history WHERE report_id = $1::uuid AND note IS NOT NULL LIMIT 1`,
    [govNoteId],
  )
  if (govNoteExists.length === 0) {
    await query(
      `INSERT INTO report_status_history (report_id, from_status, to_status, changed_by_role, note, created_at)
       VALUES ($1::uuid, 'approved'::report_status, 'in_progress'::report_status, 'gov_agency'::user_role, 'Scheduled for repair next week', NOW())`,
      [govNoteId],
    )
    console.log(`  ✅ Gov agency note for report`)
  }

  // pending-report-for-moderation
  await seedReport({
    name: 'pending-report-for-moderation',
    userId: userIds['user']!,
    status: 'pending_review',
    problemType: 'hazard',
    location: LOCATIONS.south,
    description: 'Debris on the road',
  })

  // locked-report
  await seedReport({
    name: 'locked-report',
    userId: userIds['user']!,
    status: 'under_review',
    problemType: 'broken_light',
    location: LOCATIONS.east,
    description: 'Broken traffic light',
    moderatedBy: userIds['moderator'] ?? null,
  })

  // e2e-user-report
  await seedReport({
    name: 'e2e-user-report',
    userId: userIds['user']!,
    status: 'approved',
    problemType: 'missing_marking',
    location: LOCATIONS.center,
    description: 'Missing road marking near crosswalk',
    confirmationCount: 1,
  })

  // 3. Print fixture IDs
  console.log('\n📋 Add these to apps/web/.env.test:\n')
  console.log(`E2E_APPROVED_REPORT_ID=${fixtures['approved-report-with-photo'] ?? ''}`)
  console.log(`E2E_GOV_NOTE_REPORT_ID=${fixtures['approved-report-with-gov-note'] ?? ''}`)
  console.log(`E2E_PENDING_REPORT_ID=${fixtures['pending-report-for-moderation'] ?? ''}`)
  console.log(`E2E_LOCKED_REPORT_ID=${fixtures['locked-report'] ?? ''}`)
  console.log(`E2E_USER_REPORT_ID=${fixtures['e2e-user-report'] ?? ''}`)
  console.log('\n✅ Seed complete!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => pool.end())
