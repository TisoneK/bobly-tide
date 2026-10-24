// DI tokens. We inject by explicit token (never by constructor type
// reflection), because this toolchain does not emit decorator metadata.
export const POOL = Symbol('POOL');
export const LEDGER_REPO = Symbol('LEDGER_REPO');
export const GROUP_STORE = Symbol('GROUP_STORE');
export const PACKAGE = Symbol('PACKAGE');
export const SCHEDULER_CONFIG = Symbol('SCHEDULER_CONFIG');

export interface SchedulerConfig {
  /** Start the background interval. Off in tests (they drive ticks directly). */
  enabled: boolean;
  /** How often the background loop checks for due hours. */
  tickMs: number;
  /** Wall-clock duration of one Bobly "hour" — 1h in prod, shrinkable in tests. */
  hourMs: number;
}
