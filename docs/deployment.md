# Deployment Guide

## Stack

| Сервис | Назначение | Тариф |
|--------|-----------|-------|
| [Clerk](https://clerk.com) | Аутентификация (Google/Apple OAuth, JWT, webhooks) | Free |
| [Supabase](https://supabase.com) | PostgreSQL + PostGIS | Free (500MB) |
| [Upstash](https://upstash.com) | Redis (rate limiting, cache, queues) | Free (10K req/day) |
| [Cloudflare R2](https://cloudflare.com) | Хранилище фото (private bucket) | Free (10GB) |
| [Cloudflare Images](https://cloudflare.com) | CDN для публичных фото | ~$5/мес |
| [Render](https://render.com) | Fastify API | Free (засыпает) / $7/мес |
| [Vercel](https://vercel.com) | Next.js web | Free |
| [EAS](https://expo.dev) | Сборка мобильного приложения | Free |

---

## Что делать сейчас vs позже

| Шаг | Когда |
|-----|-------|
| Clerk — создать приложение + JWT template | ✅ сейчас |
| Supabase — создать проект + включить PostGIS | ✅ сейчас |
| Upstash — создать Redis | ✅ сейчас |
| Cloudflare R2 — создать bucket | ✅ сейчас |
| Render — задеплоить API | после Spec 01 (нужна БД) |
| Vercel — задеплоить web | после web frontend |
| EAS — собрать мобилу | после mobile frontend |

---

## 1. Clerk (сейчас)

1. Зайди на [clerk.com](https://clerk.com), создай аккаунт
2. Создай новое приложение, выбери **Google + Apple** OAuth
3. Dashboard → **JWT Templates** → создай шаблон с кастомным клеймом:
   ```json
   { "role": "{{user.public_metadata.role}}" }
   ```
4. Dashboard → **API Keys** → скопируй:
   - `CLERK_SECRET_KEY`
   - `CLERK_PUBLISHABLE_KEY`
5. Webhook добавишь позже — когда задеплоишь API (шаг 5.4)

---

## 2. Supabase — PostgreSQL + PostGIS (сейчас)

1. Зайди на [supabase.com](https://supabase.com), создай проект
2. **SQL Editor** → выполни:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
3. **Settings → Database → Connection string** (режим `Transaction`) → скопируй `DATABASE_URL`

---

## 3. Upstash — Redis (сейчас)

1. Зайди на [upstash.com](https://upstash.com), создай Redis базу
2. Регион: выбери ближайший к Render (EU West или аналогичный)
3. Скопируй `REDIS_URL` (формат `rediss://...`)

---

## 4. Cloudflare R2 + Images (сейчас)

1. Dashboard → **R2** → создай bucket `open-road-photos` (доступ: **private**)
2. **R2 → Manage API Tokens** → создай токен с правами `Object Read & Write` на этот bucket
3. Скопируй:
   - `R2_BUCKET=open-road-photos`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_ENDPOINT` (формат `https://<account_id>.r2.cloudflarestorage.com`)
4. Dashboard → **Images** → включи сервис, скопируй:
   - `CF_ACCOUNT_ID`
   - `CF_IMAGES_TOKEN`

---

## 5. Render — API (после Spec 01)

1. Зайди на [render.com](https://render.com), подключи GitHub репо
2. Создай **Web Service**:
   - **Root Directory:** `apps/api`
   - **Build Command:** `cd ../.. && pnpm install && pnpm --filter @open-road/api build`
   - **Start Command:** `node dist/index.js`
   - **Node version:** 22
3. В **Environment Variables** добавь всё из `apps/api/.env.example`:
   ```
   CLERK_SECRET_KEY
   CLERK_PUBLISHABLE_KEY
   CLERK_WEBHOOK_SIGNING_SECRET
   DATABASE_URL
   REDIS_URL
   WEB_URL
   MOBILE_SCHEME
   NODE_ENV=production
   PORT=3001
   R2_BUCKET
   R2_ACCESS_KEY_ID
   R2_SECRET_ACCESS_KEY
   R2_ENDPOINT
   CF_ACCOUNT_ID
   CF_IMAGES_TOKEN
   CLAUDE_API_KEY
   ```
4. После первого деплоя: вернись в **Clerk → Webhooks** → добавь endpoint:
   ```
   https://<твой-сервис>.onrender.com/api/v1/internal/clerk-webhook
   ```
   Выбери события: `user.created`, `user.updated`, `user.deleted`
5. Скопируй `CLERK_WEBHOOK_SIGNING_SECRET` из Clerk → добавь в env vars на Render
6. Передеплой сервис

---

## 6. Vercel — Web (после web frontend)

1. Зайди на [vercel.com](https://vercel.com), подключи GitHub репо
2. **Root Directory:** `apps/web`
3. **Build Command:** оставь по умолчанию (`next build`)
4. **Environment Variables:**
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
   CLERK_SECRET_KEY
   NEXT_PUBLIC_API_URL=https://<твой-api>.onrender.com
   ```
5. Vercel деплоит автоматически при каждом мерже в `main`

---

## 7. EAS — Mobile (после mobile frontend)

```bash
npm install -g eas-cli
eas login
eas build:configure   # создаёт eas.json
eas build --platform ios      # сборка iOS
eas build --platform android  # сборка Android
eas submit                    # отправка в App Store / Google Play
```

В `apps/mobile/app.config.ts` добавь:
```typescript
extra: {
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
}
```

---

## Локальная разработка

Скопируй `apps/api/.env.example` в `apps/api/.env` и заполни значениями из шагов 1–4.

```bash
cp apps/api/.env.example apps/api/.env
# заполни значения
pnpm dev
```
