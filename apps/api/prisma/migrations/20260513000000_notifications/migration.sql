-- Spec 12: Notifications (Telegram + infra)
-- v1 covers only Telegram channel; email and web_push channels are reserved in
-- the `channel` column so additional senders can be added without schema change.

-- 1. notification_preferences ------------------------------------------------
CREATE TABLE notification_preferences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, channel, event_type)
);

CREATE INDEX idx_notification_preferences_user ON notification_preferences(user_id);

-- 2. telegram_links ---------------------------------------------------------
CREATE TABLE telegram_links (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  chat_id   BIGINT NOT NULL UNIQUE,
  username  TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. notification_log --------------------------------------------------------
CREATE TABLE notification_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  status      TEXT NOT NULL,
  error       TEXT,
  report_id   UUID REFERENCES reports(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_log_user
  ON notification_log(user_id, created_at DESC);

-- Partial index — failed deliveries are the only ones we actively query.
CREATE INDEX idx_notification_log_failed
  ON notification_log(status) WHERE status = 'failed';
