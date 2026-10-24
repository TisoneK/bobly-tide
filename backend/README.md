# Bobly Tide — backend

Pilot skeleton for the money ledger and the hourly settlement engine.
See the [build spec](../bobly-tide-build-spec.md) (§5 data model, §6 the
hourly engine, §10 money-correctness rules, §14 build steps) and the
[product spec](../bobly-tide-spec.md) for the business rules.

Stack: Node + TypeScript + PostgreSQL (ADR-4). The money engine is pure
and framework-light; Postgres persistence is wired via a load-run-persist
unit of work (ADR-6) so the engine stays synchronous and testable. NestJS
(API) and M-Pesa come next.

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
src/seed.ts            build a funded test group
src/index.ts           demo: one full cycle (npm run demo)
test/                  money / engine / holds / defaults / pg integration
```

## Run

```bash
npm install
npm test          # full suite (28 tests, incl. Postgres via in-process pg-mem)
npm run typecheck
npm run demo      # settle one full Daily cycle and print balances
```

Against a real database:

```bash
DATABASE_URL=postgres://user:pass@host:5432/bobly npm run migrate
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

## Not built yet (next steps, build spec §14)

- NestJS HTTP API, M-Pesa Daraja (STK push + B2C), auth/OTP.
- The hourly scheduler that calls `settleHourOnPg` once per group per hour.
- Incremental hold release (see the note above); a materialised wallet
  balance if the ledger grows large.

> Note: `npm audit` reports advisories in the **dev** toolchain
> (vitest/esbuild/tsx/pg-mem). Production dependencies (`decimal.js`, `pg`)
> report zero.
