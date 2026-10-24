-- Bobly Tide — Postgres schema (pilot slice)
-- Mirrors build spec §5. Money is NUMERIC(14,4): fractions of a shilling
-- are tracked exactly and only rounded at the M-Pesa boundary. Never float.
--
-- The ledger is append-only (build spec §10): balances are derived from
-- immutable entries, never edited in place. The unique idempotency_key is
-- what makes the hourly tick and M-Pesa callbacks safe to retry.

BEGIN;

CREATE TABLE app_user (
  id          UUID PRIMARY KEY,
  phone       TEXT NOT NULL UNIQUE,              -- one account per phone (spec §8.5)
  display_name TEXT,
  kyc_level   TEXT NOT NULL DEFAULT 'phone',     -- 'phone' | 'id' (gated, spec §8)
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet (
  id        UUID PRIMARY KEY,
  user_id   UUID REFERENCES app_user(id),        -- NULL for the platform fee account
  kind      TEXT NOT NULL DEFAULT 'member',      -- 'member' | 'platform'
  currency  TEXT NOT NULL DEFAULT 'KES',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE package (
  id                   UUID PRIMARY KEY,
  name                 TEXT NOT NULL,             -- 'Daily'
  size                 INTEGER NOT NULL,          -- N (24)
  hourly_contribution  NUMERIC(14,4) NOT NULL,    -- 1.0000
  fee_pct              NUMERIC(6,5) NOT NULL       -- 0.05000
);

CREATE TABLE "group" (
  id          UUID PRIMARY KEY,
  package_id  UUID NOT NULL REFERENCES package(id),
  state       TEXT NOT NULL DEFAULT 'filling',    -- filling|active|completed|dissolved
  start_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE membership (
  id          UUID PRIMARY KEY,
  group_id    UUID NOT NULL REFERENCES "group"(id),
  user_id     UUID NOT NULL REFERENCES app_user(id),
  wallet_id   UUID NOT NULL REFERENCES wallet(id),
  join_order  INTEGER NOT NULL,                   -- 1..N, = turn position
  state       TEXT NOT NULL DEFAULT 'active',     -- active|defaulted|left
  UNIQUE (group_id, join_order),
  UNIQUE (group_id, user_id)
);

-- One row per hour of a cycle: who collects the payout at that hour.
CREATE TABLE turn (
  id            UUID PRIMARY KEY,
  group_id      UUID NOT NULL REFERENCES "group"(id),
  hour_index    INTEGER NOT NULL,                 -- 0..N-1
  membership_id UUID NOT NULL REFERENCES membership(id),
  state         TEXT NOT NULL DEFAULT 'pending',  -- pending|paid
  UNIQUE (group_id, hour_index)
);

-- Append-only money ledger. Signed amount: negative reduces the wallet.
CREATE TABLE ledger_entry (
  id              UUID PRIMARY KEY,
  wallet_id       UUID NOT NULL REFERENCES wallet(id),
  type            TEXT NOT NULL,                  -- topup|hourly_debit|payout|fee|withdrawal|hold|hold_release|refund
  amount          NUMERIC(14,4) NOT NULL,
  group_id        UUID REFERENCES "group"(id),
  hour_index      INTEGER,
  idempotency_key TEXT NOT NULL UNIQUE,           -- makes the tick / callbacks retry-safe
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entry_wallet_idx ON ledger_entry (wallet_id);

CREATE TABLE security_hold (
  id            UUID PRIMARY KEY,
  membership_id UUID NOT NULL REFERENCES membership(id),
  amount_held   NUMERIC(14,4) NOT NULL,
  released      NUMERIC(14,4) NOT NULL DEFAULT 0
);

-- M-Pesa (Daraja) transactions; wallet moves only when the callback confirms.
CREATE TABLE mpesa_txn (
  id            UUID PRIMARY KEY,
  wallet_id     UUID NOT NULL REFERENCES wallet(id),
  direction     TEXT NOT NULL,                    -- 'in' (topup) | 'out' (withdrawal)
  msisdn        TEXT NOT NULL,
  amount        NUMERIC(14,2) NOT NULL,           -- M-Pesa settles in whole/2dp shillings
  daraja_ref    TEXT UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending|success|failed
  raw_callback  JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
