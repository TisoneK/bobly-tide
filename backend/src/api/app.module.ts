import { Module, type DynamicModule } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Package } from '../domain/types';
import type { DarajaClient } from '../mpesa/daraja';
import { MpesaService, type MpesaConfig } from '../mpesa/mpesa.service';
import { MpesaStore } from '../mpesa/mpesa.store';
import { PgLedgerRepo } from '../repo/pg';
import { GroupStore } from './group.store';
import { GroupsController } from './groups.controller';
import { MpesaController } from './mpesa.controller';
import { SchedulerService } from './scheduler.service';
import {
  DARAJA_CLIENT,
  GROUP_STORE,
  LEDGER_REPO,
  MPESA_CONFIG,
  MPESA_SERVICE,
  MPESA_STORE,
  PACKAGE,
  POOL,
  SCHEDULER_CONFIG,
  type SchedulerConfig,
} from './tokens';
import { WalletsController } from './wallets.controller';

export interface AppModuleOptions {
  pool: Pool;
  pkg: Package;
  scheduler: SchedulerConfig;
  daraja: DarajaClient;
  mpesa: MpesaConfig;
}

@Module({})
export class AppModule {
  static forRoot(opts: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [GroupsController, WalletsController, MpesaController],
      providers: [
        { provide: POOL, useValue: opts.pool },
        { provide: PACKAGE, useValue: opts.pkg },
        { provide: SCHEDULER_CONFIG, useValue: opts.scheduler },
        { provide: DARAJA_CLIENT, useValue: opts.daraja },
        { provide: MPESA_CONFIG, useValue: opts.mpesa },
        { provide: LEDGER_REPO, useFactory: (p: Pool) => new PgLedgerRepo(p), inject: [POOL] },
        { provide: GROUP_STORE, useFactory: (p: Pool) => new GroupStore(p), inject: [POOL] },
        { provide: MPESA_STORE, useFactory: (p: Pool) => new MpesaStore(p), inject: [POOL] },
        {
          provide: MPESA_SERVICE,
          useFactory: (ledger: PgLedgerRepo, store: MpesaStore, daraja: DarajaClient, cfg: MpesaConfig) =>
            new MpesaService(ledger, store, daraja, cfg),
          inject: [LEDGER_REPO, MPESA_STORE, DARAJA_CLIENT, MPESA_CONFIG],
        },
        SchedulerService,
      ],
    };
  }
}
