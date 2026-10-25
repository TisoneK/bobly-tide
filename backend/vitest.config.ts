import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // The pg-mem integration suites (full cycles, scheduler) run many
    // unit-of-work round trips and are legitimately slow; keep headroom.
    testTimeout: 30_000,
  },
});
