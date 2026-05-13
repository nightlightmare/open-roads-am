import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1),
  REDIS_URL: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  WEB_URL: z.string().min(1),
  MOBILE_SCHEME: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_ENDPOINT: z.string().url(),
  CLAUDE_API_KEY: z.string().min(1),
  CF_IMAGES_BASE_URL: z.string().url(),
  CF_ACCOUNT_ID: z.string().min(1),
  CF_IMAGES_API_TOKEN: z.string().min(1),
  // Spec 12 — Notifications (optional in v1: missing token disables sending,
  // queue and dispatcher still run so the rest of the system stays exercised).
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().default('OpenRoadAmBot'),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
})

export type Env = z.infer<typeof EnvSchema>

export function validateEnv(): Env {
  const result = EnvSchema.safeParse(process.env)
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors)
    process.exit(1)
  }
  return result.data
}
