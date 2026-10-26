-- 0006_security_event — audit trail of security-relevant events (ADR-24):
-- failed auth, denied authorization, rejected payment callbacks, OTP
-- lockouts, join-limit hits, KYC rejections, and anomaly escalations. Not
-- FK'd to app_user — an event may come from an unauthenticated or unknown
-- actor (IP only). Admin-only reading; never stores tokens or secrets.

CREATE TABLE security_event (
  id         UUID PRIMARY KEY,
  type       TEXT NOT NULL,                 -- auth_failed | admin_denied | ownership_denied | callback_rejected | otp_locked | join_limit | kyc_rejected | anomaly_threshold
  severity   TEXT NOT NULL,                 -- info | warning | critical
  user_id    UUID,                          -- actor, when known (no FK)
  phone      TEXT,                          -- actor phone, when known
  ip         TEXT,                          -- source IP, when known
  detail     TEXT,                          -- human-readable context (no secrets)
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX security_event_created_idx ON security_event (created_at);
CREATE INDEX security_event_type_idx ON security_event (type);
