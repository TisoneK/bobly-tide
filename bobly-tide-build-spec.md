# Bobly Tide: Build Spec (v1)

Companion to [`bobly-tide-spec.md`](bobly-tide-spec.md). The product spec
covers **WHAT** Bobly Tide is and how the business runs. This spec covers
**HOW** the first version gets built: platform, MVP cut, architecture,
data model, the hourly engine, money rails, visual identity, and testing.

Where this spec defaults a decision the product spec left open, it is
marked and collected in [§13 Open build decisions](#13-open-build-decisions).
Business rules (fees, packages, holds, legal) are **not** restated here —
they live in the product spec and this spec points at them.

> **Status:** in build. Foundational decisions locked (§1) and the §13
> build decisions locked 2026-10-24. Live in [`backend/`](backend/): the
> hourly engine (§6), the security-hold mechanism (§8, ADR-5), and
> PostgreSQL persistence with migrations (ADR-6) — §14 steps 1–2 plus the
> database, all covered by an integration suite.

---

## 1. Locked decisions

| Decision | Value | Source |
|---|---|---|
| **Client platform** | Flutter (Dart) — one codebase, Android + iOS | confirmed 2026-10-24 |
| **MVP scope** | Closed pilot slice — Daily (24-member) package only | confirmed 2026-10-24 |
| **Brand primary color** | Deep sea blue | confirmed 2026-10-24 |

Everything below builds on these three.

---

## 2. MVP definition — the closed pilot slice

The MVP is **Launch Phase 1** from the product spec (§13): the Daily,
24-member package, run with 3–5 groups of invited people, to prove the
hourly rhythm and test defaults and withdrawals. Nothing more ships until
the pilot proves the mechanic.

### 2.1 In scope (v1)

| Area | What ships |
|---|---|
| Sign-up | Phone number + one-time code (OTP). No full ID verification yet (see §9). |
| Package | **Daily only** — 24 members, KES 1/hour, 24-hour cycle. One package type, many parallel groups. |
| Wallet | Per-member balance held in Bobly Tide. Whole-shilling top-ups, hourly KES 1 debit, payouts credited. |
| Top-up | M-Pesa STK push (Daraja) into the wallet. |
| Withdraw | M-Pesa B2C to the member's own number, above the withdrawal minimum. |
| Queue + group start | "Slots remaining" count; a group starts only when full (24/24). |
| Turn order | Fixed by join order, visible from group start. No random draw. |
| Hourly engine | Server-side tick: debit all active members, credit the turn-holder, take the fee. |
| Security hold | Covers contributions a member still owes; released as the cycle runs. |
| Default handling | Grace period → hold covers missing hours → member removed from next cycle. |
| Receipts / history | Every debit, payout, and fee visible to the member. |
| Notifications | Low-wallet warning, turn-arrived, payout landed (push + SMS for money events). |

### 2.2 Out of scope (deferred past the pilot)

- 3-Day, Weekly, Fortnight, Monthly packages, and higher-contribution tiers.
- Referrals, agents, public ledger page, in-app marketing surfaces.
- Full ID/KYC capture, AML transaction monitoring (beyond basic logging).
- Auto-merge of partial groups, switch-package-while-waiting.
- Group renewal automation (pilot groups are manually renewed or dissolved).
- Web/admin portal beyond the minimum internal ops console (§2.3).

### 2.3 Internal ops console (minimum)

Not member-facing. A thin internal tool (web) to: create pilot groups,
watch fills, see group/turn state, inspect wallets and holds, trigger
manual withdrawal review, and read the fee-settlement log. Can start as a
read-mostly dashboard; write actions added only as the pilot needs them.

---

## 3. Platform and tech stack

| Layer | Choice | Notes |
|---|---|---|
| **Mobile client** | Flutter (Dart), Android + iOS | Locked. Android is the pilot priority (Kenya). |
| State management | Riverpod (proposed) | Testable, compile-safe; swap only with reason. |
| **Backend** | Server + relational DB (proposed) | A money ledger and scheduled hourly settlement need transactional integrity and exact arithmetic — see §13-D1. |
| Database | PostgreSQL (proposed) | ACID, `NUMERIC` for exact money, row locks for the tick. |
| Hourly scheduler | Server-side cron/worker (proposed) | One authoritative tick per group per hour. Never client-driven. |
| **Money rail** | M-Pesa Daraja API | STK push (C2B) for top-up, B2C for withdrawal. |
| Auth | Phone + OTP (SMS) | Session tokens; see §8. |
| Notifications | FCM push + SMS provider | SMS for all money events; push for the rest. |
| Hosting | TBD (proposed: a KE/EU region VPS or managed container) | See §12. |

The backend language is **not yet locked** (§13-D1). The constraints it
must meet: exact decimal money math, serialisable transactions, a reliable
scheduled job runner, and a Daraja client. Dart (shared language), Node/
NestJS, and Python/FastAPI all qualify.

---

## 4. Architecture overview

```
 Flutter app ──HTTPS/JSON──► Backend API ──► PostgreSQL (wallets, ledger, groups)
     │                            │
     │                            ├─► Hourly tick worker (one run per group per hour)
     │                            ├─► M-Pesa Daraja (STK push in, B2C out) ◄── callbacks
     │                            └─► SMS + FCM (notifications)
 Internal ops console (web) ──────┘
```

Principles:

- **The server is the single source of truth for money.** The client
  never computes a balance it can act on; it displays what the server says.
- **The ledger is append-only.** Balances are derived from immutable
  entries, never edited in place. A debit, a payout, and a fee are three
  entries, each referencing the hour and group that produced them.
- **The tick is authoritative and idempotent.** Exactly one settlement
  per `(group, hour)`. A re-run must be a no-op, not a double charge.

---

## 5. Data model (core entities)

Sketch, not final DDL. Money columns are `NUMERIC(14,4)` — fractions of a
shilling are tracked exactly (product spec §7) and only rounded at the
M-Pesa boundary.

| Entity | Key fields |
|---|---|
| **User** | id, phone (unique), display name, status, created_at |
| **Wallet** | id, user_id, balance (derived/cached), currency=KES |
| **Package** | id, name (Daily), size N (24), hourly_contribution (1), fee_pct (0.05) |
| **Group** | id, package_id, state (`filling`/`active`/`completed`/`dissolved`), start_at, member_count |
| **Membership** | id, group_id, user_id, join_order (1..N → turn position), state (`active`/`defaulted`/`left`) |
| **Turn** | id, group_id, hour_index (0..N-1), membership_id (who collects), state |
| **LedgerEntry** | id, wallet_id, type (`topup`/`hourly_debit`/`payout`/`fee`/`withdrawal`/`hold`/`hold_release`/`refund`), amount, sign, group_id?, hour_index?, created_at, idempotency_key |
| **SecurityHold** | id, membership_id, amount_held, release_schedule |
| **MpesaTxn** | id, wallet_id, direction (`in`/`out`), msisdn, amount, daraja_ref, status, raw_callback |

Invariant to test continuously: for every wallet,
`balance == Σ(signed ledger entries)`.

---

## 6. The hourly engine

The heart of the product. For an active group of N members, once per hour:

1. **Lock** the group row (serialise against a concurrent tick).
2. **Idempotency check:** if a settlement for `(group, hour_index)`
   already exists, stop — the tick already ran.
3. **Debit:** post a `hourly_debit` of KES 1 to each active member's wallet.
4. **Fee:** compute `fee = N × fee_pct` (KES 1.20 at N=24, 5%); post a
   `fee` entry to the platform account.
5. **Payout:** post a `payout` of `N × (1 − fee_pct)` (KES 22.80) to the
   turn-holder for this `hour_index`.
6. **Advance:** mark the turn done; the next hour belongs to the next
   member in join order. After hour N-1 the cycle completes.
7. **Shortfall path:** if a member's wallet can't cover the KES 1 debit,
   draw the gap from their security hold (product spec §8.1); only when
   wallet and hold together fall short is it a true shortfall. Hold sizing,
   funding, draw, release, default and slot-refill are implemented in
   `backend/src/domain/holds.ts` and `defaults.ts` (grace-period timing and
   SMS warnings from §8.2 arrive with the scheduler/notifications later).

Fee rounding: the platform earns exactly KES 0.05 per member per hour.
Fractions accumulate in `NUMERIC` and settle to the organisation daily
(product spec §7) — never silently dropped.

Timekeeping: the product's clock is **EAT (UTC+3)**. The tick runs on UTC
internally; "hour" boundaries and member-facing times render in EAT.

---

## 7. M-Pesa integration (Daraja)

| Flow | API | Notes |
|---|---|---|
| Top-up | STK push (Lipa na M-Pesa Online) | Member initiates; confirm on the async callback, not the sync response. |
| Withdraw | B2C Payment Request | To the member's own registered MSISDN only (product spec §7). |
| Reconciliation | C2B validation/confirmation + daily statement match | Every MpesaTxn reconciled against Daraja; mismatches flagged to ops. |

Rules:

- Build and test against the **Daraja sandbox** first; sandbox shortcodes
  and test MSISDNs only. No production shortcode until the legal/partner
  clearance in the product spec §10 is in place.
- Credentials (consumer key/secret, passkey, shortcode) are secrets —
  `.context_ledger/memory/secrets/`, never in tracked code or this file.
- Treat the callback as the source of truth; the wallet is credited/debited
  only when Daraja confirms, with an idempotency key on the Daraja ref.
- Show network charges to the member (product spec §7); the withdrawal
  minimum (placeholder KES 50) guards against charges swallowing payouts.

---

## 8. Auth and identity

- **v1:** phone number + one-time SMS code. One account per phone number.
- Short-lived access token + refresh token; device binding for the money
  account.
- **ID verification** is staged to where the law requires it (product spec
  §6, §10). The data model reserves a KYC level per user; the pilot runs at
  "phone-verified" and the ID-capture flow is built but gated off until the
  legal opinion sets the trigger.
- One-account-per-phone-and-ID and join-count limits (product spec §8.5)
  are enforced server-side.

---

## 9. Visual identity

Extends the Brand section of the product spec (§11), which defined name,
idea, voice, and languages but no visual system.

### 9.1 Color tokens

Primary is **deep sea blue** (locked). Proposed companions — a brighter
tide accent that nods to the "small drops become a tide" idea, and a warm
accent reserved for the emotional high points (your turn, payout landed).

| Token | Hex | Use |
|---|---|---|
| `primary` | `#0B3D62` | Deep sea blue — brand, primary actions, headers |
| `primary-dark` | `#072A45` | Pressed states, dark surfaces |
| `primary-light` | `#1B5E8C` | Hover, secondary fills, info |
| `tide` (secondary) | `#19B5C9` | Accent, progress/fill, the "tide" motif |
| `payout` (warm accent) | `#F5A623` | Your-turn and payout moments only — used sparingly |
| `ink` | `#0F1724` | Primary text |
| `slate` | `#475569` | Secondary text |
| `mist` | `#E2E8F0` | Borders, dividers |
| `paper` | `#F8FAFC` | App background |
| `surface` | `#FFFFFF` | Cards |
| `success` | `#2E9E5B` | Credit, payout success |
| `warning` | `#E08700` | Low-wallet, grace period |
| `danger` | `#D64545` | Default, failed payment |

Dark mode derives from the same tokens (surfaces → deep blues, text →
near-white). All text/background pairs must meet WCAG AA (4.5:1 body,
3:1 large) — the warm `payout` accent is for fills and highlights, not
body text on light backgrounds.

### 9.2 Typography

- **Display/headings:** Plus Jakarta Sans (proposed) — friendly, modern.
- **Body/UI:** Inter (proposed) — highly legible at small sizes.
- **Money figures:** tabular/lining numerals, always with the `KES`
  prefix and two decimals where fractions matter.
- Must render Swahili and English cleanly (Latin script, no extra ranges).

### 9.3 Tone in UI (from product spec §11)

Say "your turn", "your group", "one bob an hour". Never "returns",
"profit", "invest", "earn", "interest", "bank". Every fee and charge is
shown before the member commits and on every receipt.

---

## 10. Money correctness and safety (build-side)

These are the non-negotiables the pilot must get right — a money bug here
is worse than a missing feature.

- Exact decimal arithmetic end to end (`NUMERIC`, no floats for money).
- Append-only ledger; balance is always `Σ(entries)`, reconciled on read.
- Idempotent tick and idempotent M-Pesa callbacks (keyed on Daraja ref).
- Serialised settlement per group (row lock / serializable txn).
- Security hold always covers outstanding contributions (product spec §8.1).
- Every state change leaves an audit entry; nothing about money is silent.

---

## 11. Testing strategy

| Level | Covers |
|---|---|
| Unit | Engine math — debit/fee/payout for N=24 at 5%; fraction accumulation; hold release schedule. |
| Property/invariant | `balance == Σ(entries)` holds after any sequence of operations; tick is idempotent. |
| Integration | Daraja **sandbox** top-up and B2C withdrawal, including delayed/duplicate callbacks. |
| Scenario | Full 24-hour cycle; early-turn-then-default; empty-wallet grace → default; dropout + slot refill. |
| Client | Flutter widget tests for the money screens; golden tests for receipts. |

The money-correctness tests gate every commit that touches the engine,
wallet, or ledger (wire them into `.context_ledger/memory/workflows/gates.conf`
once the project toolchain exists).

---

## 12. Environments and configuration

- **dev** (local), **staging** (Daraja sandbox, test data), **prod**
  (gated behind the legal/partner clearance in product spec §10).
- Secrets (Daraja keys, SMS provider, DB creds, signing keys) live only in
  `.context_ledger/memory/secrets/` and the deploy platform's secret store
   — never in tracked code or docs.
- Config per environment (shortcodes, callback URLs, fee %, minimums) is
  externalised, not hard-coded, so the 5% fee / KES 50 min / 6-hour grace
  placeholders can change without a code change.
- Hosting region and provider: TBD (§13-D2); prefer a region with low
  latency to Safaricom's Daraja endpoints and compatible with KE data rules.

---

## 13. Build decisions (locked 2026-10-24)

Locked by the user on 2026-10-24 ("lock the proposed defaults"). Each can
still be revisited with a superseding ADR, but the build proceeds on these.

| ID | Decision | Locked value |
|---|---|---|
| **D1** | Backend language/framework | **Node + TypeScript + PostgreSQL** (ADR-4). Pilot skeleton is framework-light (pure domain engine + tests, `decimal.js` for money); NestJS added at the HTTP/API step. |
| **D2** | Hosting provider + region | Managed container/VPS in a region near Daraja; specific provider still TBD at deploy time. |
| **D3** | State management (Flutter) | Riverpod. |
| **D4** | Typography | Plus Jakarta Sans (display) + Inter (body). |
| **D5** | Accent colors beyond primary | `tide #19B5C9` secondary + `payout #F5A623` warm accent. |
| **D6** | SMS provider | A KE-reachable provider (e.g. Africa's Talking) — final pick at integration. |
| **D7** | Ops console scope for pilot | Read-mostly dashboard first; write actions as needed. |
| **D8** | Push minimum (business, from product spec §16) | 5% fee, KES 50 withdrawal min, 6-hour grace — externalised as config; business confirmation still owned by product spec §16. |

Business-level decisions (fee %, packages, turn-position rules, money
holder, renewal, ID level) remain owned by the product spec §16 — this
spec consumes them as config, it does not decide them.

---

## 14. First build steps (once D1–D2 are set)

1. ✅ Backend skeleton + Postgres schema/migrations (§5) with the ledger
   and the invariant tests (§10, §11) — `backend/`.
2. ✅ Hourly engine (§6) + security holds (§8) against a seeded group, with
   PostgreSQL persistence (unit of work, ADR-6) and an integration suite.
3. Daraja sandbox top-up + B2C (§7) behind the wallet, and the NestJS API.
4. Flutter app: sign-up/OTP, package screen, queue, group/turn view,
   wallet + receipts, notifications.
5. Wire gates (`gates.conf`), run a full-cycle scenario test, then the
   invited closed pilot.
