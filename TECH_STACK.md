# OpenRoad.am — Tech Stack

## Монорепозиторий

**Turborepo** — единый репозиторий для всех пакетов:

```
apps/
  web/          # Next.js 16 — веб-платформа
  mobile/       # React Native + Expo — мобильное приложение
  api/          # Fastify — основной бэкенд
  mcp-server/   # MCP-сервер для внешних AI-интеграций
packages/
  ui/           # Shared компоненты (web + mobile)
  types/        # Общие TypeScript типы
  config/       # Shared конфиги (eslint, tsconfig)
```

---

## Frontend — Web

| Технология | Версия | Назначение |
|---|---|---|
| Next.js | 16.x | App Router, SSR, API Routes |
| React | 19.x | UI |
| Turbopack | stable | Бандлер (встроен в Next.js 16) |
| MapLibre GL | latest | Интерактивная карта (open source) |
| Tailwind CSS | 4.x | Стили |
| Zustand | latest | Стейт-менеджмент |

**Особенности Next.js 16:**
- `proxy.ts` вместо `middleware.ts` — явная граница сети
- Cache Components с `use cache` директивой
- DevTools MCP — AI-assisted отладка в процессе разработки

---

## Mobile

| Технология | Назначение |
|---|---|
| React Native | Кроссплатформенное мобильное приложение |
| Expo | Сборка, OTA-обновления, нативные модули |
| Expo Camera | Съёмка и загрузка фото |
| Expo Location | Геолокация для репортов |
| React Native Maps | Карта на мобиле |

---

## Backend

| Технология | Назначение |
|---|---|
| Node.js + Fastify | Основной API — быстрее Express, нативный TypeScript |
| PostgreSQL + PostGIS | База данных с поддержкой геозапросов |
| Prisma | ORM + миграции |
| Redis | Кэш, rate limiting, очереди |
| BullMQ | Очередь задач (AI-обработка фото асинхронно) |

**Ключевые PostGIS-запросы:**
- Все репорты в радиусе N км от точки
- Кластеризация точек для карты
- Тепловая карта по плотности репортов

---

## AI / Распознавание

| Технология | Назначение |
|---|---|
| Claude API (Anthropic) | Классификация типа проблемы по фото |
| claude-sonnet-4-5 | Модель для анализа изображений |

**Типы проблем для классификации:**
- Выбоина / повреждение покрытия
- Отсутствие / повреждение разметки
- Сломанный / отсутствующий знак
- Опасный участок (обрыв, подтопление)
- Неработающий светофор
- Другое

Обработка фото — асинхронно через BullMQ, чтобы не блокировать создание репорта.

---

## MCP-сервер

Протокол внешних интеграций. Любой AI-агент (Claude, GPT, Cursor и др.) подключается и работает с данными OpenRoad.am через стандартный MCP-протокол.

**Публичные инструменты (без ключа):**
```
get_reports     — список репортов с фильтрами (город, тип, статус, радиус, дата)
get_report      — детали конкретного репорта
get_stats       — статистика по региону / городу
get_heatmap     — данные тепловой карты
```

**Инструменты с API-ключом:**
```
create_report   — создать репорт
update_status   — обновить статус репорта (для госорганов)
```

---

## Хранилище

| Сервис | Назначение |
|---|---|
| Cloudflare R2 | Фотографии репортов (нет платы за исходящий трафик) |
| Cloudflare Images | Ресайз и оптимизация изображений |

---

## Аутентификация

**Clerk** — готовое решение:
- Google / Apple OAuth (важно для мобилы)
- JWT токены
- Webhook'и для синхронизации пользователей с БД
- Встроенный rate limiting по пользователю

---

## Инфраструктура

| Сервис | Назначение |
|---|---|
| Vercel | Хостинг Next.js (автодеплой, Edge Network) |
| Railway | Fastify API + PostgreSQL + Redis |
| Cloudflare | DNS, DDoS защита, WAF, rate limiting |

**Архитектурная схема:**
```
[Cloudflare — WAF / DDoS / Rate Limit]
         ↓
[Vercel — Next.js 16]    [Expo — Mobile App]
         ↓                        ↓
    [Fastify API + PostGIS]
         ↓              ↓
[PostgreSQL]         [Redis]
[PostGIS]            [BullMQ]
         ↓              ↓
    [Claude API]   [Cloudflare R2]
         ↓
[Публичный REST API]
         ↓
[MCP Server] ← внешние AI-агенты
```

---

## Безопасность

- **Cloudflare WAF** — фильтрация вредоносных запросов на уровне сети
- **Rate limiting** — Redis-based, на всех публичных эндпоинтах
- **API-ключи** — для доступа к write-операциям через MCP и REST
- **Helmet.js** — security headers на Fastify
- **Zod** — валидация всех входящих данных
- **Environment variables** — все секреты через env, никаких ключей в коде
- **HTTPS everywhere** — принудительный редирект
- **CSP headers** — Content Security Policy на фронте
- **Верификация репортов** — лимит репортов на аккаунт в сутки, капча для анонимных

---

## API архитектура

Два отдельных API:

**Публичный API** (`/api/v1/public/`)
- Открытый, без авторизации
- Только чтение
- Rate limited по IP

**Внутренний API** (`/api/v1/`)
- Требует JWT (Clerk)
- Чтение + запись
- Роли: `user`, `moderator`, `gov_agency`, `admin`

**Госорганы** получают отдельный API-ключ с ролью `gov_agency` — доступ к верифицированным данным и статусам.

---

## Языки интерфейса

- Армянский (основной)
- Русский
- Английский

i18n через `next-intl`.

---

*Версия 1.0 — апрель 2026*
