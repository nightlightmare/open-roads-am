import { clerk } from '@clerk/testing/playwright'
import type { Page } from '@playwright/test'

const credentials = {
  user: {
    email: process.env.E2E_USER_EMAIL ?? 'e2e-user@test.open-roads.am',
    password: process.env.E2E_USER_PASSWORD ?? '',
  },
  moderator: {
    email: process.env.E2E_MODERATOR_EMAIL ?? 'e2e-moderator@test.open-roads.am',
    password: process.env.E2E_MODERATOR_PASSWORD ?? '',
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@test.open-roads.am',
    password: process.env.E2E_ADMIN_PASSWORD ?? '',
  },
} as const

export async function signInAs(page: Page, role: 'user' | 'moderator' | 'admin') {
  const { email, password } = credentials[role]

  await page.goto('/')

  if (password) {
    await clerk.signIn({
      page,
      signInParams: {
        strategy: 'password',
        identifier: email,
        password,
      },
    })
  } else {
    // Fallback: sign in by email (requires CLERK_SECRET_KEY)
    await clerk.signIn({
      page,
      emailAddress: email,
    })
  }
}
