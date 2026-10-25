import { Module, type DynamicModule } from '@nestjs/common';
import type { Pool } from 'pg';
import { AuthService, type AuthConfig } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';
import type { SmsSender } from '../auth/sms';
import type { Package } from '../domain/types';
import type { DarajaClient } from '../mpesa/daraja';
import { MpesaService, type MpesaConfig } from '../mpesa/mpesa.service';
import { MpesaStore } from '../mpesa/mpesa.store';
import { PgLedgerRepo } from '../repo/pg';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { GroupStore } from './group.store';
import { GroupsController } from './groups.controller';
import { MpesaController } from './mpesa.controller';
import { SchedulerService } from './scheduler.service';
import {
  AUTH_CONFIG,
  AUTH_SERVICE,
  AUTH_STORE,
  DARAJA_CLIENT,
  GROUP_STORE,
  LEDGER_REPO,
  MPESA_CONFIG,
  MPESA_SERVICE,
  MPESA_STORE,
  PACKAGE,
  POOL,
  SCHEDULER_CONFIG,
  SMS_SENDER,
  type SchedulerConfig,
} from './tokens';
import { WalletsController } from './wallets.controller';

export interface AppModuleOptions {
  pool: Pool;
  pkg: Package;
  scheduler: SchedulerConfig;
  daraja: DarajaClient;
  mpesa: MpesaConfig;
  auth: AuthConfig;
  sms: SmsSender;
}

@Module({})
export class AppModule {
  static forRoot(opts: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [AuthController, GroupsController, WalletsController, MpesaController],
      providers: [
        { provide: POOL, useValue: opts.pool },
        { provide: PACKAGE, useValue: opts.pkg },
        { provide: SCHEDULER_CONFIG, useValue: opts.scheduler },
        { provide: DARAJA_CLIENT, useValue: opts.daraja },
        { provide: MPESA_CONFIG, useValue: opts.mpesa },
        { provide: AUTH_CONFIG, useValue: opts.auth },
        { provide: SMS_SENDER, useValue: opts.sms },
        { provide: LEDGER_REPO, useFactory: (p: Pool) => new PgLedgerRepo(p), inject: [POOL] },
        { provide: GROUP_STORE, useFactory: (p: Pool) => new GroupStore(p), inject: [POOL] },
        { provide: MPESA_STORE, useFactory: (p: Pool) => new MpesaStore(p), inject: [POOL] },
        { provide: AUTH_STORE, useFactory: (p: Pool) => new AuthStore(p), inject: [POOL] },
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
        AuthGuard,
        SchedulerService,
      ],
    };
  }
}
