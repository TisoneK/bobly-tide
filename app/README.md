# Bobly Tide — mobile client (Flutter)

Pilot member app (build spec §14 step 4): sign-up/OTP, the Daily package,
join + queue, group/turn view, and wallet + receipts — against the
[`backend/`](../backend) API. Flutter + Riverpod, deep-sea-blue theme
(build spec §9, ADR-3).

> **Compiled and tested on Windows** (2026-10-26, Flutter 3.47.8 / Dart 3.13.7):
> `flutter analyze` reports 0 errors (13 info-level lints), `flutter test` passes
> 8/8, and `android/` + `ios/` platform folders are generated. Still unverified:
> running on a device/emulator (no Android SDK here) and the Smile ID KYC flow
> (see "Known gaps" below).
>
> Prerequisites: Flutter >= 3.22 (`flutter --version`), then `flutter pub get`.

## Run

```bash
cd app
flutter pub get
flutter test                # unit tests (models, formatting)
flutter analyze             # 0 errors expected; 13 info-level lints remain
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000   # Android emulator → host
```

Point `API_BASE_URL` at the backend. An Android emulator reaches the host
machine at `10.0.2.2`; an iOS simulator at `localhost`.

### KYC capture — Smile ID SDK (ADR-19)

The ID/face steps run on-device through the **Smile ID Flutter SDK**
(`smile_id`): it captures the selfie/document, runs liveness, and uploads
straight to the vendor using a signed job from `POST /verification/kyc/authorize`
— images never pass through our server, and never come from the gallery. The
SDK is initialized once in `main.dart` (`SmileID.initialize(useSandbox: …)`,
`--dart-define=SMILE_SANDBOX=false` for production).

Because the SDK embeds its own camera preview, both platforms need the camera
permission after `flutter create .` regenerates the platform folders:

- **iOS** — in `ios/Runner/Info.plist`:
  ```xml
  <key>NSCameraUsageDescription</key>
  <string>Bobly Tide uses the camera to verify your ID and face.</string>
  ```
- **Android** — in `android/app/src/main/AndroidManifest.xml`:
  ```xml
  <uses-permission android:name="android.permission.CAMERA"/>
  ```

> The `smile_id` version in `pubspec.yaml` is a placeholder — confirm the exact
> published version with `flutter pub add smile_id`, and verify the SDK call
> site in `lib/kyc/smile_kyc.dart` against it (that file is the only place the
> vendor SDK is used). The backend must have `SMILE_PARTNER_ID` + `SMILE_API_KEY`
> set for `/verification/kyc/authorize` to issue live jobs.

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
3. **Verify** — before joining or moving money, confirm email (a code), run the
   **Smile ID** on-device ID + selfie/liveness checks (see the KYC capture note
   above), and submit proof of address. Smile ID resolves the ID/face items via
   the backend callback; ops review covers exceptions. Home shows a "Verify to
   join" card until all items pass.
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
- **KYC job ownership is unresolved.** The pinned `smile_id` 10.4.3 widget API
  takes `userId`/`jobId` but cannot consume the server-signed job authorization
  our backend issues (partnerId/timestamp/signature/product, ADR-19), so the
  SDK creates its own job and the vendor callback's `job_id` will not match the
  `kyc_job` row. Options: `extraPartnerParams` + `skipApiSubmission`, or move job
  ownership to the SDK and map its returned jobId. Needs a device + sandbox
  credentials; see `lib/kyc/smile_kyc.dart`.
- KYC ID/face capture runs through the **Smile ID SDK** (`lib/kyc/smile_kyc.dart`),
  but the `smile_id` call sites are compile-verified only (not run on a device).
  Proof-of-address is still a plain reference submit (not a Smile product).
- No push/SMS notifications, no switch-package UI, no offline cache — out of
  scope for the pilot slice (build spec §2.2). (Renew/leave are wired.)
