# Bobly Tide — backend

Pilot skeleton for the money ledger and the hourly settlement engine.
See the [build spec](../bobly-tide-build-spec.md) (§5 data model, §6 the
hourly engine, §10 money-correctness rules, §14 build steps) and the
[product spec](../bobly-tide-spec.md) for the business rules.

Stack: Node + TypeScript + PostgreSQL (ADR-4). This first cut is
framework-light on purpose — the money engine is pure, fully tested, and
carries no HTTP or database coupling. NestJS (API), the Postgres
repository, and M-Pesa come next.

## Layout

```
db/schema.sql          Postgres schema (§5) — NUMERIC(14,4) money, append-only ledger
src/domain/money.ts    exact decimal money (decimal.js), never float
src/domain/types.ts    entities, ledger entry types, PLATFORM_WALLET
src/domain/ledger.ts   balanceOf(entries) — the one definition of a balance
src/domain/engine.ts   settleHour / settleCycle — the hourly tick (§6)
src/domain/packages.ts the Daily package (24 members, KES 1/hr, 5%)
src/repo/types.ts      LedgerRepo interface + DuplicateKeyError
src/repo/memory.ts     in-memory ledger (tests + demo)
src/seed.ts            build a funded test group
src/index.ts           demo: one full cycle (npm run demo)
test/                  money + engine tests (money-correctness)
```

## Run

```bash
npm install
npm test          # money-correctness suite (13 tests)
npm run typecheck
npm run demo      # settle one full Daily cycle and print balances
```

## What the engine guarantees

- **Exact money.** All amounts are `decimal.js`; the DB stores
  `NUMERIC(14,4)`. No floats touch money.
- **Append-only ledger.** A balance is always the sum of a wallet's
  entries (`balanceOf`), never a mutable stored number.
- **Idempotent tick.** Each hour's settlement is keyed by `(group, hour)`;
  re-running it is a no-op (`already-settled`), so the scheduler can retry.
- **Conservation.** `settleHour` refuses to post unless the debits, the
  payout, and the fee net to exactly zero.
- **No overdraw.** If a member can't cover the hourly KES 1, settlement is
  refused with a `ShortfallError` rather than producing a short pot.

## Not built yet (next steps, build spec §14)

- Security-hold draw on shortfall / dropout + slot refill (product spec §8).
- Postgres `LedgerRepo` implementation (schema is in `db/schema.sql`).
- NestJS HTTP API, M-Pesa Daraja (STK push + B2C), auth/OTP.
- The hourly scheduler that calls `settleHour` once per group per hour.

> Note: `npm audit` reports advisories in the **dev** toolchain
> (vitest/esbuild/tsx). Production dependencies (`decimal.js`) report zero.
