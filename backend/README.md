# Bobly Tide — backend

Pilot skeleton for the money ledger and the hourly settlement engine.
See the [build spec](../bobly-tide-build-spec.md) (§5 data model, §6 the
hourly engine, §10 money-correctness rules, §14 build steps) and the
[product spec](../bobly-tide-spec.md) for the business rules.

Stack: Node + TypeScript + PostgreSQL + NestJS (ADR-4). The money engine is
pure; Postgres persistence is a load-run-persist unit of work (ADR-6) so the
engine stays synchronous and testable; the HTTP API and hourly scheduler sit
on top (ADR-7). M-Pesa Daraja comes next.

## Layout

```
db/migrations/         versioned SQL migrations (0001_init = schema §5)
src/db/migrate.ts      migration runner; migrate-cli.ts applies $DATABASE_URL
src/domain/money.ts    exact decimal money (decimal.js), never float
src/domain/types.ts    entities, ledger entry types, PLATFORM_WALLET
src/domain/ledger.ts   balanceOf(entries) — the one definition of a balance
src/domain/engine.ts   settleHour / settleCycle — the hourly tick (§6)
src/domain/holds.ts    security-hold sizing, funding, draw, release (§8.1)
src/domain/defaults.ts default handling + slot refill (§8.2-8.3)
src/domain/packages.ts the Daily package (24 members, KES 1/hr, 5%)
src/repo/types.ts      LedgerRepo interface + DuplicateKeyError
src/repo/memory.ts     in-memory ledger (pure engine, tests, snapshots)
src/repo/pg.ts         PgLedgerRepo — durable Postgres ledger store
src/pg-settlement.ts   unit of work: run the pure engine on a PG snapshot
src/scheduler.ts       settleDueHours — which hours are due for a group
src/api/               NestJS app: controllers, GroupStore, scheduler service
src/main.ts            bootstrap (migrate, ensure package, listen)
src/seed.ts            build a funded test group
src/index.ts           demo: one full cycle (npm run demo)
test/                  money / engine / holds / defaults / pg / api / scheduler
```

## Run

```bash
npm install
npm test          # full suite (37 tests, incl. Postgres via in-process pg-mem)
npm run typecheck
npm run demo      # settle one full Daily cycle and print balances
```

Against a real database:

```bash
DATABASE_URL=postgres://user:pass@host:5432/bobly npm run migrate
DATABASE_URL=postgres://user:pass@host:5432/bobly npm start   # API on :3000
```

## Database

- **Migrations.** `db/migrations/*.sql`, applied in filename order, each in
  its own transaction, tracked in `schema_migrations`. `runMigrations(pool)`
  is idempotent; `npm run migrate` applies them to `$DATABASE_URL`.
- **PgLedgerRepo** (`src/repo/pg.ts`) is the durable append-only ledger:
  `appendEntries` (one transaction, rejects duplicate idempotency keys),
  `balanceOf` (summed exactly with decimal.js), `entriesForAccount`, and
  `loadSnapshot` for the unit of work.
- **Unit of work** (`src/pg-settlement.ts`): `settleHourOnPg` loads the
  group's accounts into an in-memory snapshot, runs the pure `settleHour`,
  and writes the new entries back in one transaction — idempotent, with the
  ledger's `UNIQUE(idempotency_key)` as the concurrency backstop.
- **Tests** run against **pg-mem** (in-process Postgres — no Docker or
  server) and the same code runs on real Postgres.

## What the engine guarantees

- **Exact money.** All amounts are `decimal.js`; the DB stores
  `NUMERIC(14,4)`. No floats touch money.
- **Append-only ledger.** A balance is always the sum of a wallet's
  entries (`balanceOf`), never a mutable stored number.
- **Idempotent tick.** Each hour's settlement is keyed by `(group, hour)`;
  re-running it is a no-op (`already-settled`), so the scheduler can retry.
- **Conservation.** `settleHour` refuses to post unless the debits, the
  payout, and the fee net to exactly zero.
- **No overdraw.** A member's hourly KES 1 is taken from their wallet, and
  if that is short, drawn from their security hold; only when wallet AND
  hold together cannot cover it is settlement refused (`ShortfallError`),
  never a short pot.

## Security holds (product spec §8)

- **Sizing.** A member at turn position `p` holds `(N − p) × contribution`
  — the contributions they would still owe after collecting their payout.
  Earliest turn holds the most; the last turn holds nothing.
- **Funding.** Locked out of the wallet into a per-member hold account when
  the group starts (`fundHold` / `fundGroupHolds`).
- **Draw.** The engine draws from the hold to cover a short wallet, keeping
  the pot whole.
- **Release.** Collateral is returned to the wallet at cycle end
  (`releaseRemainingHold`); `processDefault` returns the hold and refunds
  the remaining balance (minus what's owed), and `assignReplacement` refills
  the vacated slot so the cycle continues.

> Refinement left for later: incremental per-hour release of collateral as
> post-turn obligations are met. Final balances are already correct without
> it (the draw path covers any wallet gap and the end-of-cycle release
> returns the rest); incremental release would just keep more money in the
> spendable wallet mid-cycle.

## HTTP API + scheduler (NestJS)

Token-based DI only (this toolchain emits no decorator metadata). Endpoints:

| Method + path | Does |
|---|---|
| `POST /groups` | Create a Daily group (`filling`) |
| `POST /groups/:id/join` | Add a member (creates user + wallet); returns `walletId` |
| `POST /wallets/:id/topup` | Internal/dev credit (stands in for M-Pesa until §7) |
| `POST /groups/:id/start` | Fund every member's hold, activate, stamp `start_at` |
| `POST /groups/:id/settle-due` | Settle any hours due now (same path the scheduler uses) |
| `GET /groups/:id` | State, start time, members + balances, platform fee total |
| `GET /wallets/:id` | Balance + entry history |

The **scheduler** (`src/api/scheduler.service.ts` + `src/scheduler.ts`) runs
on an interval: for each active group it settles every hour that has come
due (`dueMaxHour` from `start_at`), idempotently, and on the final hour
releases holds and marks the group completed. The "hour" duration is
configurable (`HOUR_MS`) so a pilot or a test can run accelerated time.

## Not built yet (next steps, build spec §14)

- M-Pesa Daraja (STK push top-up + B2C withdrawal), auth/OTP — the top-up
  endpoint is an internal placeholder until then.
- Incremental hold release (see the note above); a materialised wallet
  balance if the ledger grows large.

> Note: `npm audit` reports advisories in the **dev** toolchain
> (vitest/esbuild/tsx/pg-mem). Production dependencies report zero (multer,
> pulled in transitively by NestJS, is pinned to a patched 2.5.0 via an
> `overrides` entry; the API has no file uploads).
