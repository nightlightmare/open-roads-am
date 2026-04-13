# Spec 10 — Web Frontend

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

Next.js 16 App Router web application. Покрывает публичную карту, авторизацию, профиль пользователя, создание репортов, панель модерации и административные функции. Всё в одном приложении через route groups с разграничением по ролям.

---

## Tech Stack

| Слой | Решение |
|---|---|
| Framework | Next.js 16, App Router |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Auth | `@clerk/nextjs` |
| Map | MapLibre GL JS |
| Map tiles | OpenFreeMap (`https://tiles.openfreemap.org`) |
| State | Zustand (map state, filters) |
| Data fetching | Native `fetch` + SWR для client-side polling |
| Forms | `react-hook-form` + Zod |
| i18n | `next-intl` (hy / ru / en) |
| Tests | Vitest + React Testing Library |

---

## Route Structure

```
app/
├── layout.tsx                          ← root layout (ClerkProvider, i18n)
├── (public)/
│   ├── page.tsx                        ← / (карта)
│   └── reports/[id]/page.tsx           ← /reports/:id (публичный детейл)
├── (auth)/
│   ├── sign-in/[[...sign-in]]/page.tsx ← /sign-in
│   └── sign-up/[[...sign-up]]/page.tsx ← /sign-up
├── (user)/
│   └── profile/
│       ├── page.tsx                    ← /profile
│       ├── reports/
│       │   ├── page.tsx                ← /profile/reports
│       │   └── [id]/page.tsx           ← /profile/reports/:id
│       └── confirmations/page.tsx      ← /profile/confirmations
├── (submit)/
│   └── submit/page.tsx                 ← /submit (создание репорта)
├── (moderator)/
│   └── moderation/
│       ├── page.tsx                    ← /moderation (очередь)
│       └── reports/[id]/page.tsx       ← /moderation/reports/:id (ревью)
└── (admin)/
    └── admin/
        ├── page.tsx                    ← /admin (список пользователей)
        └── users/[clerkId]/page.tsx    ← /admin/users/:clerkId (смена роли)
```

---

## Middleware

`middleware.ts` на основе `clerkMiddleware`:

- `/profile/*`, `/submit` → требуют аутентификацию → редирект на `/sign-in`
- `/moderation/*` → требуют роль `moderator` или `admin` → редирект на `/`
- `/admin/*` → требуют роль `admin` → редирект на `/`
- Роль берётся из `sessionClaims.publicMetadata.role`

---

## Environment Variables

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_API_BASE_URL=https://open-roads-am.onrender.com
NEXT_PUBLIC_MAP_STYLE=https://tiles.openfreemap.org/styles/liberty
```

---

## Экраны

---

### 1. Карта `/`

**Тип:** Client Component (MapLibre требует браузер)

**Функционал:**
- MapLibre GL карта, центрирована на Ереване (40.1872, 44.5152), начальный zoom 12
- При старте — запрос геолокации пользователя; если разрешено — центрировать на нём
- На каждый `moveend`/`zoomend` — запрос `GET /api/v1/public/reports?bbox=...&zoom=...`
- Кластеры (zoom < 15): круглые маркеры с числом, при клике — zoom in на кластер
- Отдельные репорты (zoom ≥ 15): цветные pin-маркеры по типу проблемы; клик → side panel с кратким превью
- Side panel репорта: фото, тип, адрес, статус, кол-во подтверждений, кнопка «Подробнее» (→ `/reports/:id`)
- Кнопка «Сообщить о проблеме» (FAB) — только авторизованным; неавторизованным → тултип «Войдите чтобы сообщить»
- Фильтры: тип проблемы (multiselect), включить решённые (toggle)
- Фильтры хранятся в Zustand + URL search params (шаринг ссылок)

**API:** `GET /api/v1/public/reports`

---

### 2. Публичный детейл `/reports/:id`

**Тип:** Server Component + client интерактивность

**Функционал:**
- Полная карточка репорта: фото, тип, статус, адрес, описание, кол-во подтверждений, история статусов
- Мини-карта с pin (MapLibre, non-interactive)
- Кнопка «Подтвердить» — только авторизованным, не своим репортам, только для `approved`/`in_progress`
  - После подтверждения: счётчик обновляется оптимистично, кнопка меняется на «Убрать подтверждение»
- Кнопка «← Назад к карте» — возврат на `/` с сохранением позиции карты (через URL params)
- OG-теги для шаринга: `og:title`, `og:description`, `og:image` (фото репорта)

**API:**
- `GET /api/v1/public/reports/:id`
- `POST /api/v1/reports/:id/confirm`
- `DELETE /api/v1/reports/:id/confirm`

---

### 3. Авторизация `/sign-in`, `/sign-up`

**Тип:** Clerk hosted components (`<SignIn />`, `<SignUp />`)

- `afterSignInUrl="/"`, `afterSignUpUrl="/"`
- Кастомный layout с логотипом и языковым переключателем

---

### 4. Профиль `/profile`

**Тип:** Server Component (данные из API с Clerk JWT)

**Функционал:**
- Имя пользователя, роль, дата регистрации
- Статы: отправлено репортов / одобрено / решено / подтверждений
- Навигация по секциям: «Мои репорты» / «Мои подтверждения»
- Кнопка выхода

**API:** `GET /api/v1/me`

---

### 5. Мои репорты `/profile/reports`

**Тип:** Client Component (пагинация, фильтр по статусу)

**Функционал:**
- Список карточек: превью фото, тип, адрес, статус (цветной badge), дата
- Фильтр по статусу через табы
- Cursor-based пагинация («Загрузить ещё»)
- Клик → `/profile/reports/:id`

**API:** `GET /api/v1/me/reports`

---

### 6. Детейл своего репорта `/profile/reports/:id`

**Тип:** Client Component

**Функционал:**
- Всё что на публичном детейле + поля только для владельца:
  - Выбранный пользователем тип и тип от AI с confidence (если есть)
  - Для rejected-статуса — Badge «Отклонено» (без причины)
- История статусов со всеми публичными переходами и нотами от гос. органов

**API:** `GET /api/v1/me/reports/:id`

---

### 7. Мои подтверждения `/profile/confirmations`

**Тип:** Client Component

**Функционал:**
- Список репортов, которые пользователь подтвердил: тип, адрес, текущий статус репорта, дата подтверждения
- Cursor-based пагинация
- Клик → `/reports/:id` (публичный)

**API:** `GET /api/v1/me/confirmations`

---

### 8. Создание репорта `/submit`

**Тип:** Client Component (два шага)

#### Шаг 1 — Фото и классификация

- Dropzone или кнопка камеры (на мобильных браузерах `accept="image/*" capture`)
- Превью выбранной фотографии
- `POST /api/v1/classify` → получаем `job_token`
- Spinner «Анализируем фото...»
- Polling `GET /api/v1/classify/:job_token` каждые 2 секунды, таймаут 60 секунд
- По результату: сетка категорий (иконка + название), AI-рекомендованная подсвечена
- При `failed` или таймауте: показать сетку без выбранной, текст «Не удалось определить автоматически — выберите вручную»
- Нельзя перейти к шагу 2 без выбранной категории

#### Шаг 2 — Локация и описание

- MapLibre карта (полноэкранная или встроенная)
- Draggable pin — начальная позиция: геолокация пользователя или Ереван
- Textarea для описания (необязательно, max 1000 символов, счётчик)
- Кнопка «Отправить» → `POST /api/v1/reports`
- Состояния: loading → success (с redirect на `/profile/reports/:id`) / error
- Кнопка «← Назад» возвращает на шаг 1 с сохранённым фото и категорией

**API:**
- `POST /api/v1/classify`
- `GET /api/v1/classify/:job_token` (polling via SWR)
- `POST /api/v1/reports`

**Состояние формы** хранится в Zustand (чтобы не потерять при переходе назад):
- `photoFile`, `jobToken`, `selectedType`, `lat`, `lng`, `description`

---

### 9. Очередь модерации `/moderation`

**Тип:** Client Component (SSE)

**Доступ:** `moderator`, `admin`

**Функционал:**
- Две колонки (или табы): «Ожидают» (`pending_review`) / «На рассмотрении» (`under_review`)
- Карточки репортов: фото-thumbnail, тип пользователя, тип AI + confidence badge, адрес, дата
- Фильтр по типу проблемы
- Real-time обновление через SSE (`GET /api/v1/moderation/feed`):
  - `new_report` event → добавить карточку в «Ожидают» с анимацией
  - `queue_count` event → обновить счётчики в заголовке
- Клик на карточку → `/moderation/reports/:id`

**API:**
- `GET /api/v1/moderation/queue`
- `GET /api/v1/moderation/feed` (SSE)

---

### 10. Ревью репорта `/moderation/reports/:id`

**Тип:** Client Component

**Доступ:** `moderator`, `admin`

**Функционал:**
- При открытии: `POST /api/v1/moderation/reports/:id/open`
  - Если `409` (занят другим модератором): Banner «Сейчас рассматривает {name}, заблокировано до {time}» + кнопка «← Назад»
- Полная карточка: фото (кликабельное, открывается в лайтбоксе), тип пользователя, тип AI с confidence, описание, мини-карта с pin, дата
- Действия (справа):
  - **Approve** — опциональный override типа (select из всех типов), кнопка «Одобрить»
  - **Reject** — textarea для причины (обязательно), кнопка «Отклонить»
  - Только для `admin`: кнопка «Переоткрыть» на `rejected`-репортах
- Lease heartbeat: каждые 5 минут переоткрывать (чтобы не истёк TTL 15 мин)
  - При потере фокуса вкладки — pause heartbeat
  - При возврате — немедленный refresh
- После approve/reject → redirect на `/moderation`
- При покидании страницы (unload) — `DELETE /api/v1/moderation/reports/:id/lock`

**API:**
- `POST /api/v1/moderation/reports/:id/open`
- `POST /api/v1/moderation/reports/:id/approve`
- `POST /api/v1/moderation/reports/:id/reject`
- `POST /api/v1/moderation/reports/:id/reopen` (admin)
- `DELETE /api/v1/moderation/reports/:id/lock`

---

### 11. Смена статуса (gov agency) `/reports/:id` (inline)

**Доступ:** `gov_agency`, `admin`

На публичной странице `/reports/:id` для пользователей с ролью `gov_agency` или `admin` — дополнительный блок «Обновить статус»:
- Select: `in_progress` / `resolved` (только допустимые переходы)
- Textarea для заметки (публичная, отображается в истории статусов)
- Кнопка «Обновить»

**API:** `POST /api/v1/reports/:id/status`

---

### 12. Админ-панель `/admin`

**Доступ:** только `admin`

**Функционал:**
- Список пользователей (поиск по имени/clerk_id)
- Карточка пользователя: имя, текущая роль, дата регистрации
- Смена роли: Select (`user` / `moderator` / `gov_agency` / `admin`) + кнопка «Применить»
- Список API-ключей: prefix, scopes, дата создания
- Создание нового API-ключа: select scopes → показать ключ один раз в modal с кнопкой «Скопировать»

**API:**
- `POST /api/v1/admin/users/:clerk_id/role`
- `POST /api/v1/admin/api-keys`

---

## Навигация

Верхняя панель (sticky header):

| Состояние | Слева | Справа |
|---|---|---|
| Не авторизован | Логотип | «Войти» |
| Авторизован (user) | Логотип | Аватар → меню (профиль, выйти) |
| moderator/admin | Логотип + «Модерация» | Аватар → меню |
| admin | Логотип + «Модерация» + «Админ» | Аватар → меню |

Кнопка «Сообщить о проблеме» — FAB на карте, не в хедере.

---

## i18n

`next-intl` с тремя локалями: `hy` (армянский, дефолт), `ru`, `en`.

- URL-префикс: `/hy/...`, `/ru/...`, `/en/...`
- Файлы переводов: `messages/hy.json`, `messages/ru.json`, `messages/en.json`
- Переключатель локали в хедере и на auth-страницах
- Числа, даты — через `Intl.DateTimeFormat` с учётом локали

---

## Обработка ошибок

- `401` → redirect на `/sign-in`
- `403` → Toast «Недостаточно прав» + redirect на `/`
- `429` → Toast «Слишком много запросов, попробуйте через {Retry-After} сек»
- `5xx` → Toast «Что-то пошло не так» (без деталей)
- Ошибки формы (Zod) → inline под полем
- Сетевые ошибки → Toast с кнопкой «Повторить»

---

## Состояние (Zustand stores)

**`mapStore`**
```typescript
{
  zoom: number
  center: [lng, lat]
  bbox: [west, south, east, north] | null
  filters: { problemTypes: string[], includeResolved: boolean }
  setFilters: (f) => void
  setViewport: (zoom, center, bbox) => void
}
```

**`submitStore`**
```typescript
{
  photoFile: File | null
  jobToken: string | null
  selectedType: string | null
  lat: number | null
  lng: number | null
  description: string
  reset: () => void
}
```

---

## Тесты

- Unit-тесты для утилит (форматирование, валидация)
- Component-тесты (RTL) для критичных компонентов:
  - SubmitForm (шаг 1 и шаг 2)
  - ModerationCard
  - ConfirmButton
- Моки API через `msw` (Mock Service Worker)

---

## Порядок реализации

1. **Setup** — Tailwind, shadcn, Clerk, next-intl, env vars, layout, header
2. **Auth** — sign-in/sign-up страницы, middleware
3. **Профиль** — `/profile`, `/profile/reports`, `/profile/reports/:id`, `/profile/confirmations`
4. **Карта** — MapLibre, маркеры, кластеры, side panel, фильтры
5. **Публичный детейл** — `/reports/:id`, кнопка подтверждения
6. **Создание репорта** — `/submit`, two-step flow
7. **Модерация** — `/moderation`, `/moderation/reports/:id`, SSE
8. **Админ** — `/admin`, смена ролей, API ключи

---

## Out of Scope (v1)

- PWA / Service Worker
- Offline режим
- Push-уведомления
- Dark mode
- Экспорт данных
- Карта для модераторов с отображением всех статусов (в т.ч. pending)
