import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { Pool } from 'pg';
import { AuthService, type AuthConfig } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';
import type { SmsSender } from '../auth/sms';
import type { Package } from '../domain/types';
import type { CallbackSourceConfig } from '../mpesa/callback-guard';
import type { DarajaClient } from '../mpesa/daraja';
import { MpesaService, type MpesaConfig } from '../mpesa/mpesa.service';
import { MpesaStore } from '../mpesa/mpesa.store';
import { PgLedgerRepo } from '../repo/pg';
import type { AlertSink } from '../security/alert';
import { SecurityService, type SecurityConfig } from '../security/security.service';
import { SecurityStore } from '../security/security.store';
import type { EmailSender, KycProvider } from '../verification/providers';
import { VerificationService, type VerificationConfig } from '../verification/verification.service';
import { VerificationStore } from '../verification/verification.store';
import { AdminController } from './admin.controller';
import { AdminGuard, type AdminConfig } from './admin.guard';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { GroupStore } from './group.store';
import { GroupsController } from './groups.controller';
import { KycCallbackController } from './kyc-callback.controller';
import { MpesaController } from './mpesa.controller';
import { PackagesController } from './packages.controller';
import { SchedulerService } from './scheduler.service';
import { SecurityEventFilter } from './security.filter';
import {
  ADMIN_CONFIG,
  ALERT_SINK,
  AUTH_CONFIG,
  AUTH_SERVICE,
  AUTH_STORE,
  DARAJA_CLIENT,
  EMAIL_SENDER,
  GROUP_STORE,
  KYC_PROVIDER,
  LEDGER_REPO,
  MPESA_CALLBACK_CONFIG,
  MPESA_CONFIG,
  MPESA_SERVICE,
  MPESA_STORE,
  PACKAGE,
  POOL,
  SCHEDULER_CONFIG,
  SECURITY_CONFIG,
  SECURITY_SERVICE,
  SECURITY_STORE,
  SMS_SENDER,
  VERIFICATION_CONFIG,
  VERIFICATION_SERVICE,
  VERIFICATION_STORE,
  type SchedulerConfig,
} from './tokens';
import { VerificationController } from './verification.controller';
import { WalletsController } from './wallets.controller';

export interface AppModuleOptions {
  pool: Pool;
  pkg: Package;
  scheduler: SchedulerConfig;
  daraja: DarajaClient;
  mpesa: MpesaConfig;
  /** Source validation for Daraja callbacks (ADR-22). */
  mpesaCallback: CallbackSourceConfig;
  auth: AuthConfig;
  sms: SmsSender;
  email: EmailSender;
  kyc: KycProvider;
  verification: VerificationConfig;
  admin: AdminConfig;
  /** Max filling/active groups one user may be in at once (product spec §8.5). */
  groupJoinLimit: number;
  /** Security audit + alerting (ADR-24). */
  alert: AlertSink;
  security: SecurityConfig;
}

@Module({})
export class AppModule {
  static forRoot(opts: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        AuthController,
        VerificationController,
        KycCallbackController,
        AdminController,
        GroupsController,
        PackagesController,
        WalletsController,
        MpesaController,
      ],
      providers: [
        { provide: POOL, useValue: opts.pool },
        { provide: PACKAGE, useValue: opts.pkg },
        { provide: SCHEDULER_CONFIG, useValue: opts.scheduler },
        { provide: DARAJA_CLIENT, useValue: opts.daraja },
        { provide: MPESA_CONFIG, useValue: opts.mpesa },
        { provide: MPESA_CALLBACK_CONFIG, useValue: opts.mpesaCallback },
        { provide: AUTH_CONFIG, useValue: opts.auth },
        { provide: SMS_SENDER, useValue: opts.sms },
        { provide: EMAIL_SENDER, useValue: opts.email },
        { provide: KYC_PROVIDER, useValue: opts.kyc },
        { provide: VERIFICATION_CONFIG, useValue: opts.verification },
        { provide: ADMIN_CONFIG, useValue: opts.admin },
        { provide: ALERT_SINK, useValue: opts.alert },
        { provide: SECURITY_CONFIG, useValue: opts.security },
        { provide: SECURITY_STORE, useFactory: (p: Pool) => new SecurityStore(p), inject: [POOL] },
        {
          provide: SECURITY_SERVICE,
          useFactory: (store: SecurityStore, alert: AlertSink, cfg: SecurityConfig) =>
            new SecurityService(store, alert, cfg),
          inject: [SECURITY_STORE, ALERT_SINK, SECURITY_CONFIG],
        },
        { provide: APP_FILTER, useClass: SecurityEventFilter },
        { provide: LEDGER_REPO, useFactory: (p: Pool) => new PgLedgerRepo(p), inject: [POOL] },
        { provide: GROUP_STORE, useFactory: (p: Pool) => new GroupStore(p, opts.groupJoinLimit), inject: [POOL] },
        { provide: MPESA_STORE, useFactory: (p: Pool) => new MpesaStore(p), inject: [POOL] },
        { provide: AUTH_STORE, useFactory: (p: Pool) => new AuthStore(p), inject: [POOL] },
        { provide: VERIFICATION_STORE, useFactory: (p: Pool) => new VerificationStore(p), inject: [POOL] },
        {
          provide: MPESA_SERVICE,
          useFactory: (ledger: PgLedgerRepo, store: MpesaStore, daraja: DarajaClient, cfg: MpesaConfig) =>
            new MpesaService(ledger, store, daraja, cfg),
          inject: [LEDGER_REPO, MPESA_STORE, DARAJA_CLIENT, MPESA_CONFIG],
        },
        {
          provide: AUTH_SERVICE,
          useFactory: (store: AuthStore, sms: SmsSender, cfg: AuthConfig) => new AuthService(store, sms, cfg),
          inject: [AUTH_STORE, SMS_SENDER, AUTH_CONFIG],
        },
        {
          provide: VERIFICATION_SERVICE,
          useFactory: (store: VerificationStore, email: EmailSender, kyc: KycProvider, cfg: VerificationConfig) =>
            new VerificationService(store, email, kyc, cfg),
          inject: [VERIFICATION_STORE, EMAIL_SENDER, KYC_PROVIDER, VERIFICATION_CONFIG],
        },
        AuthGuard,
        AdminGuard,
        SchedulerService,
      ],
    };
  }
}
