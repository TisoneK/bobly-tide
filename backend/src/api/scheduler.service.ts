import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Package } from '../domain/types';
import type { PgLedgerRepo } from '../repo/pg';
import { dissolveGroup, settleDueHours } from '../scheduler';
import { GROUP_STORE, LEDGER_REPO, PACKAGE, SCHEDULER_CONFIG, type SchedulerConfig } from './tokens';
import type { GroupStore } from './group.store';

/**
 * Drives the hourly settlement: on an interval, finds active groups and
 * settles whatever hours have come due (build spec §6). Settlement is
 * idempotent, so a missed or overlapping run never double-charges.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SchedulerService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    @Inject(LEDGER_REPO) private readonly repo: PgLedgerRepo,
    @Inject(GROUP_STORE) private readonly store: GroupStore,
    @Inject(PACKAGE) private readonly pkg: Package,
    @Inject(SCHEDULER_CONFIG) private readonly config: SchedulerConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) return;
    this.timer = setInterval(() => {
      void this.runDueTicks(new Date());
    }, this.config.tickMs);
    // Don't keep the event loop alive just for the scheduler.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Settle due hours for every active group. Guarded so runs never overlap. */
  async runDueTicks(now: Date): Promise<{ settled: number; completed: number; dissolved: number }> {
    if (this.running) return { settled: 0, completed: 0, dissolved: 0 };
    this.running = true;
    try {
      const groups = await this.store.listActive();
      let settled = 0;
      let completed = 0;
      for (const loaded of groups) {
        try {
          const res = await settleDueHours(this.repo, this.store, loaded, this.pkg, now, this.config.hourMs);
          settled += res.settled;
          if (res.completed) completed++;
        } catch (err) {
          this.log.error(`group ${loaded.group.id} settlement failed: ${(err as Error).message}`);
        }
      }

      // Dissolve filling groups that stalled (never fully secured).
      let dissolved = 0;
      const stalled = await this.store.listStalledFilling(this.config.fillTimeoutMs, now);
      for (const loaded of stalled) {
        try {
          await dissolveGroup(this.repo, this.store, loaded);
          dissolved++;
        } catch (err) {
          this.log.error(`group ${loaded.group.id} dissolve failed: ${(err as Error).message}`);
        }
      }

      return { settled, completed, dissolved };
    } finally {
      this.running = false;
    }
  }
}
