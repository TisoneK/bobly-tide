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

- [x] Top-up M-Pesa prompt + confirmation screen (`topup_screen.dart`)
- [x] Withdraw flow + confirmation (`withdraw_screen.dart`)
- [x] Transaction detail / full receipt screen (`transaction_detail_screen.dart`)
- [x] Low-balance & empty-wallet warning, with the 6-hour grace period
  (banner on the wallet screen)
- [x] "How it works" page (`how_it_works_screen.dart`)
- [x] Cycle-end: renew / switch package / leave (on the group screen) —
  renew + leave are now live backend calls (`POST /groups/:id/renew|leave`)
- [x] Help & dispute entry point (`help_screen.dart`)
- [x] Ops KYC-review screen (`admin_kyc_screen.dart`) — lists
  `GET /admin/verifications`, approve/reject via the review endpoint; reached
  from the home menu, shows an "ops only" state for non-admins (403)
- [ ] Estimated start time on the queue (needs fill-rate data)
- [x] ID-document & face capture (`kyc_capture_screen.dart`) — live camera
  only (`ImageSource.camera`, never `.gallery`; ADR-16): ID = rear-camera
  document photo, face = front-camera selfie with a liveness prompt, then a
  preview → retake / submit. Reached from the Verify screen. Still a
  reference stand-in to `/verification/submit` — **no asset-upload pipeline
  or liveness vendor yet** (follow-up); email/address stay typed.

> Built but, like the rest of the app, not compiled here (no Flutter SDK).
> Switch-package is a placeholder (Daily is the only pilot package); renew
> and leave are live backend calls. The low-balance threshold is heuristic
> (Held > 0 and Available < 1) until the backend exposes grace state.

## Smaller gaps

- [x] Slots-remaining shown on the group/queue screen; [ ] estimated start
  still needs fill-rate data.
- [x] Group-stall handling if a joined member never secures — backend
  scheduler dissolves + refunds filling groups past `FILL_TIMEOUT_MS`
  (ADR-15).
