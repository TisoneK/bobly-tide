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
src/domain/holds.ts    security-hold sizing, funding, draw, release (§8.1)
src/domain/defaults.ts default handling + slot refill (§8.2-8.3)
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

- Postgres `LedgerRepo` implementation (schema is in `db/schema.sql`).
- NestJS HTTP API, M-Pesa Daraja (STK push + B2C), auth/OTP.
- The hourly scheduler that calls `settleHour` once per group per hour.

> Note: `npm audit` reports advisories in the **dev** toolchain
> (vitest/esbuild/tsx). Production dependencies (`decimal.js`) report zero.
