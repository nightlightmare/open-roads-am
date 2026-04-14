import { clerkSetup } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'
import pg from 'pg'

setup('configure Clerk for testing', async () => {
  await clerkSetup()
})

setup('reset test data', async () => {
  const dbUrl = process.env['DATABASE_URL']
  if (!dbUrl) {
    console.log('DATABASE_URL not set — skipping test data reset')
    return
  }

  const pendingId = process.env['E2E_PENDING_REPORT_ID']
  const lockedId = process.env['E2E_LOCKED_REPORT_ID']
  if (!pendingId && !lockedId) return

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  try {
    const ids = [pendingId, lockedId].filter(Boolean)
    await pool.query(
      `UPDATE reports SET status = 'pending_review'::report_status, moderated_by = NULL, updated_at = NOW()
       WHERE id = ANY($1::uuid[]) AND status != 'pending_review'::report_status`,
      [ids],
    )
    console.log(`Reset ${ids.length} reports to pending_review`)
  } finally {
    await pool.end()
  }
})
