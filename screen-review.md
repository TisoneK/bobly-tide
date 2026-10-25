# Screen review — pilot readiness (2026-10-25)

Tracks the member-app review against the spec. The app lives in
[`app/`](app/); decisions are recorded in
`.context_ledger/memory/office/plans/decisions.md` (ADR-14).

## Fixed

- [x] **Hidden hold on Join.** Join card now shows the upfront breakdown:
  "Top up today KES 24 (locked for the day, used KES 1 an hour)" and "You
  receive KES 22.80 at your turn (your own money back, minus the 5% fee)".
- [x] **Hold shown like a spend.** Wallet now splits **Available** vs
  **Held** ("Held … — returned as your cycle runs"); hold ledger lines are
  neutral, relabelled "Security held / released".
- [x] **Fee on the receipt.** Payout entries read "Pot KES 24.00 · fee
  KES 1.20 (5%) · you received KES 22.80".
- [x] **"Not an investment" line** on the Join card.
- [x] **Turn-order names.** Members shown as first name (optional) over a
  masked phone (2547••••678); never the full number.
- [x] **Withdraw minimum.** Button disabled below the KES 50 minimum
  ("Min KES 50"); the server enforces it too.
- [x] **Sign-in formats.** Accepts 07…, 01…, 7…, +254…, 254…; normalised to
  canonical. Consent line added.
- [x] **Copy.** "Your group starts once it's full; your turn comes at your
  position" (no more "your turn comes once it is full").
- [x] **Fee placement** (see matrix below) — Join discloses, receipt shows,
  withdraw does not repeat it.

## Decisions (ADR-14)

| Decision | Chosen for pilot |
|---|---|
| Security amount | **Lock the full KES 24** (whole day's contributions), flat for everyone — one number, drawn KES 1/hour. |
| Hold release | Gradual (drawn hourly) + any remainder returned at cycle end. |
| Turn-order display | First name (optional) + masked phone, stacked. |
| Position assignment | Security-posting order (FCFS), strict. |
| Join fee | **None in v1.** Listed as a later option (KES 1–5, once per account) in spec §5.3. |
| Registration fee | None for the pilot. |

## Fee placement

| Screen | Shows |
|---|---|
| Join | "5% fee on each payout" (disclosure, before any money moves) |
| Payout receipt | Pot 24.00, fee 1.20 (5%), you received 22.80 |
| Withdraw | Only M-Pesa network charges — never the 5% |
| Home / wallet | Nothing (kept clean) |

## Still missing for the pilot (todo)

- [ ] Top-up M-Pesa prompt + confirmation screen
- [ ] Withdraw flow + confirmation
- [ ] Transaction detail / full receipt screen
- [ ] Low-balance & empty-wallet warning, with the 6-hour grace period
- [ ] "How it works" page (fee + early-turn rule in plain words)
- [ ] Cycle-end screen: renew / switch package / leave
- [ ] Help & dispute entry point
- [ ] Estimated start time on the queue (needs fill-rate data)
- [ ] ID-document capture/upload (currently a reference string stand-in)

## Smaller gaps

- [x] Slots-remaining shown on the group/queue screen; [ ] estimated start
  still needs fill-rate data.
- [ ] Group-stall handling if a joined member never secures (backend
  follow-up, no auto-timeout yet).
