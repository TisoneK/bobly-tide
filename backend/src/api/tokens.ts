// DI tokens. We inject by explicit token (never by constructor type
// reflection), because this toolchain does not emit decorator metadata.
export const POOL = Symbol('POOL');
export const LEDGER_REPO = Symbol('LEDGER_REPO');
export const GROUP_STORE = Symbol('GROUP_STORE');
export const PACKAGE = Symbol('PACKAGE');
export const SCHEDULER_CONFIG = Symbol('SCHEDULER_CONFIG');
export const DARAJA_CLIENT = Symbol('DARAJA_CLIENT');
export const MPESA_STORE = Symbol('MPESA_STORE');
export const MPESA_CONFIG = Symbol('MPESA_CONFIG');
export const MPESA_CALLBACK_CONFIG = Symbol('MPESA_CALLBACK_CONFIG');
export const MPESA_SERVICE = Symbol('MPESA_SERVICE');
export const AUTH_STORE = Symbol('AUTH_STORE');
export const AUTH_SERVICE = Symbol('AUTH_SERVICE');
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');
export const SMS_SENDER = Symbol('SMS_SENDER');
export const VERIFICATION_STORE = Symbol('VERIFICATION_STORE');
export const VERIFICATION_SERVICE = Symbol('VERIFICATION_SERVICE');
export const VERIFICATION_CONFIG = Symbol('VERIFICATION_CONFIG');
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
export const KYC_PROVIDER = Symbol('KYC_PROVIDER');
export const ADMIN_CONFIG = Symbol('ADMIN_CONFIG');
export const SECURITY_STORE = Symbol('SECURITY_STORE');
export const SECURITY_SERVICE = Symbol('SECURITY_SERVICE');
export const SECURITY_CONFIG = Symbol('SECURITY_CONFIG');
export const ALERT_SINK = Symbol('ALERT_SINK');
export const RATE_LIMITER = Symbol('RATE_LIMITER');
export const RATE_LIMIT_CONFIG = Symbol('RATE_LIMIT_CONFIG');

export interface SchedulerConfig {
  /** Start the background interval. Off in tests (they drive ticks directly). */
  enabled: boolean;
  /** How often the background loop checks for due hours. */
  tickMs: number;
  /** Wall-clock duration of one Bobly "hour" — 1h in prod, shrinkable in tests. */
  hourMs: number;
  /** A filling group older than this with members who never secured is
   *  dissolved (holds released, balances refunded). */
  fillTimeoutMs: number;
}
