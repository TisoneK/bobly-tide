import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { AppModule } from './api/app.module';
import { GroupStore } from './api/group.store';
import { LogSmsSender } from './auth/sms';
import { runMigrations } from './db/migrate';
import { Money } from './domain/money';
import { DAILY_PACKAGE } from './domain/packages';
import { type DarajaClient, FakeDarajaClient, HttpDarajaClient } from './mpesa/daraja';
import { ONE_HOUR_MS } from './scheduler';
import { type AlertSink, LogAlertSink, WebhookAlertSink } from './security/alert';
import { FakeKycProvider, type KycProvider, LogEmailSender } from './verification/providers';
import { SmileIdKycProvider } from './verification/smile';
import type { VerificationKind } from './verification/verification.store';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const env = process.env;

/** Use the real Daraja client when credentials are configured; otherwise
 *  fall back to the fake so the service still runs locally (no live M-Pesa). */
function buildDaraja(): DarajaClient {
  if (!env['DARAJA_CONSUMER_KEY']) {
    console.warn('DARAJA_CONSUMER_KEY not set — using FakeDarajaClient (no real M-Pesa calls)');
    return new FakeDarajaClient();
  }
  return new HttpDarajaClient({
    baseUrl: env['DARAJA_BASE_URL'] ?? 'https://sandbox.safaricom.co.ke',
    consumerKey: env['DARAJA_CONSUMER_KEY'] ?? '',
    consumerSecret: env['DARAJA_CONSUMER_SECRET'] ?? '',
    shortcode: env['DARAJA_SHORTCODE'] ?? '',
    passkey: env['DARAJA_PASSKEY'] ?? '',
    stkCallbackUrl: env['DARAJA_STK_CALLBACK_URL'] ?? '',
    b2cShortcode: env['DARAJA_B2C_SHORTCODE'] ?? '',
    initiatorName: env['DARAJA_INITIATOR_NAME'] ?? '',
    securityCredential: env['DARAJA_SECURITY_CREDENTIAL'] ?? '',
    b2cResultUrl: env['DARAJA_B2C_RESULT_URL'] ?? '',
    b2cTimeoutUrl: env['DARAJA_B2C_TIMEOUT_URL'] ?? '',
  });
}

function jwtSecret(): string {
  const s = env['AUTH_JWT_SECRET'];
  if (s) return s;
  console.warn('AUTH_JWT_SECRET not set — generating an ephemeral secret (tokens reset on restart)');
  return randomBytes(32).toString('hex');
}

/** Use Smile ID when credentials are configured; otherwise the fake (local
 *  dev / tests), which stays pending unless KYC_AUTO_APPROVE is on. */
function buildKyc(): KycProvider {
  if (env['SMILE_PARTNER_ID'] && env['SMILE_API_KEY']) {
    const approved = (env['SMILE_APPROVED_CODES'] ?? '0810,0812,0820,1012,1020')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    console.warn('Smile ID KYC provider wired — submissions resolve via the vendor result callback');
    return new SmileIdKycProvider({
      partnerId: env['SMILE_PARTNER_ID'],
      apiKey: env['SMILE_API_KEY'],
      baseUrl: env['SMILE_BASE_URL'] ?? 'https://testapi.smileidentity.com/v1',
      callbackUrl: env['SMILE_CALLBACK_URL'] ?? '',
      approvedCodes: new Set(approved),
    });
  }
  const auto = env['KYC_AUTO_APPROVE'] === 'true';
  if (auto) {
    console.warn('KYC_AUTO_APPROVE=true — document/face/address submissions auto-verify (demo only)');
  } else {
    console.warn('No real KYC provider wired — id/face/address submissions stay pending until reviewed');
  }
  return new FakeKycProvider(auto);
}

/** Post security alerts to a webhook when configured, else log them. */
function buildAlertSink(): AlertSink {
  const url = env['ALERT_WEBHOOK_URL'];
  if (url) return new WebhookAlertSink(url);
  console.warn('ALERT_WEBHOOK_URL not set — security alerts are logged to stderr only');
  return new LogAlertSink();
}

const jwt = jwtSecret();
const requiredKinds = (env['VERIFICATION_REQUIRED'] ?? 'email,id,face,address')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean) as VerificationKind[];

const pool = new Pool({ connectionString: url });
await runMigrations(pool);
await new GroupStore(pool).ensureDailyPackage(DAILY_PACKAGE);

const app = await NestFactory.create(
  AppModule.forRoot({
    pool,
    pkg: DAILY_PACKAGE,
    scheduler: {
      enabled: true,
      tickMs: Number(env['TICK_MS'] ?? 60_000),
      hourMs: Number(env['HOUR_MS'] ?? ONE_HOUR_MS),
      fillTimeoutMs: Number(env['FILL_TIMEOUT_MS'] ?? 48 * ONE_HOUR_MS),
    },
    daraja: buildDaraja(),
    mpesa: { withdrawalMin: Money.of(env['MPESA_WITHDRAWAL_MIN'] ?? '50') },
    mpesaCallback: {
      secret: env['MPESA_CALLBACK_SECRET'] ?? '',
      allowedIps: (env['MPESA_CALLBACK_IPS'] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    },
    auth: {
      jwtSecret: jwt,
      otpTtlSec: Number(env['AUTH_OTP_TTL_SEC'] ?? 300),
      tokenTtlSec: Number(env['AUTH_TOKEN_TTL_SEC'] ?? 86_400),
      maxAttempts: Number(env['AUTH_OTP_MAX_ATTEMPTS'] ?? 5),
    },
    sms: new LogSmsSender(),
    email: new LogEmailSender(),
    kyc: buildKyc(),
    verification: {
      secret: jwt,
      requiredKinds,
      emailCodeTtlSec: Number(env['VERIFICATION_EMAIL_TTL_SEC'] ?? 600),
      maxAttempts: Number(env['VERIFICATION_MAX_ATTEMPTS'] ?? 5),
    },
    admin: {
      phones: new Set(
        (env['ADMIN_PHONES'] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      ),
    },
    groupJoinLimit: Number(env['GROUP_JOIN_LIMIT'] ?? 3),
    alert: buildAlertSink(),
    security: {
      alertWindowMs: Number(env['SECURITY_ALERT_WINDOW_MS'] ?? 10 * 60_000),
      alertThreshold: Number(env['SECURITY_ALERT_THRESHOLD'] ?? 5),
    },
  }),
);

// Behind a reverse proxy, trust it so `req.ip` reflects the real client
// (X-Forwarded-For) — required for the Daraja callback IP allowlist to work.
if (env['TRUST_PROXY'] === 'true') {
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', true);
}

const port = Number(env['PORT'] ?? 3000);
await app.listen(port);
console.log(`Bobly Tide API listening on :${port}`);
