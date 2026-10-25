# Bobly Tide — mobile client (Flutter)

Pilot member app (build spec §14 step 4): sign-up/OTP, the Daily package,
join + queue, group/turn view, and wallet + receipts — against the
[`backend/`](../backend) API. Flutter + Riverpod, deep-sea-blue theme
(build spec §9, ADR-3).

> **Not built/compiled in this environment** — no Flutter SDK was available,
> so this is authored source, not a verified build. Generate the platform
> folders and run it on a machine with Flutter (see below).

## Run

```bash
cd app
flutter create .            # generate android/ ios/ platform folders (first time)
flutter pub get
flutter test                # unit tests (models, formatting)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000   # Android emulator → host
```

Point `API_BASE_URL` at the backend. An Android emulator reaches the host
machine at `10.0.2.2`; an iOS simulator at `localhost`.

## Layout

```
lib/config.dart          API base URL (--dart-define)
lib/theme.dart           deep-sea-blue palette + Material 3 theme
lib/models.dart          JSON models mirroring the backend
lib/api/api_client.dart  typed HTTP client (Bearer token)
lib/state/providers.dart Riverpod: session, api client, local membership
lib/app.dart             MaterialApp + AuthGate (sign-in vs home)
lib/screens/             sign_in, otp, home (package + join), group, wallet
lib/widgets/             formatting + shared UI helpers
```

## Flow

1. **Sign in** — enter M-Pesa number → `POST /auth/otp/request`.
2. **OTP** — enter the 6-digit code → `POST /auth/otp/verify` → session token
   (held in memory for the pilot).
3. **Verify** — before joining or moving money, confirm email (a code),
   plus ID, face and proof of address (reviewed by a KYC provider). Home
   shows a "Verify to join" card until all items pass.
4. **Home** — the Daily package, and a one-tap **Join** (`POST
   /packages/daily/join`, verified members only); the server puts you in the
   next forming group and ties the membership to your account.
5. **Group** — a queue while filling; **post your security** to claim a turn
   (position is first-come-first-served). Once everyone has secured, the
   group goes live and the screen shows a **live countdown** to your turn.
   Your own position and balance show; other members' balances do not.
6. **Wallet** — balance + receipts, with **Top up** (M-Pesa STK push) and
   **Withdraw** (M-Pesa B2C); both complete once M-Pesa confirms.

## Known gaps (follow-ups)

- The session token is kept in memory only — add secure storage so it
  survives app restarts.
- No push/SMS notifications, no renewal/switch-package UI, no offline cache
  — out of scope for the pilot slice (build spec §2.2).
