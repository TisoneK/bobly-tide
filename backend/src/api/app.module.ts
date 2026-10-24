import { Module, type DynamicModule } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Package } from '../domain/types';
import { PgLedgerRepo } from '../repo/pg';
import { GroupStore } from './group.store';
import { GroupsController } from './groups.controller';
import { SchedulerService } from './scheduler.service';
import { GROUP_STORE, LEDGER_REPO, PACKAGE, POOL, SCHEDULER_CONFIG, type SchedulerConfig } from './tokens';
import { WalletsController } from './wallets.controller';

export interface AppModuleOptions {
  pool: Pool;
  pkg: Package;
  scheduler: SchedulerConfig;
}

@Module({})
export class AppModule {
  static forRoot(opts: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [GroupsController, WalletsController],
      providers: [
        { provide: POOL, useValue: opts.pool },
        { provide: PACKAGE, useValue: opts.pkg },
        { provide: SCHEDULER_CONFIG, useValue: opts.scheduler },
        { provide: LEDGER_REPO, useFactory: (p: Pool) => new PgLedgerRepo(p), inject: [POOL] },
        { provide: GROUP_STORE, useFactory: (p: Pool) => new GroupStore(p), inject: [POOL] },
        SchedulerService,
      ],
    };
  }
}
