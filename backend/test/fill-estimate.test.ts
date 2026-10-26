import { describe, expect, it } from 'vitest';
import { estimateStartAt } from '../src/domain/fill-estimate';

const T0 = new Date('2026-01-01T00:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000;

describe('estimateStartAt', () => {
  it('projects from the securing rate once ≥2 have secured', () => {
    // 2 secured 1 min apart → 1 secure/min; 2 of 4 remain → +2 min from now.
    const eta = estimateStartAt({
      size: 4,
      securedAt: [T0, at(MIN)],
      joined: 2,
      groupCreatedAt: T0,
      now: at(MIN),
    });
    expect(eta?.toISOString()).toBe(at(3 * MIN).toISOString());
  });

  it('falls back to the join pace early (fewer than 2 secures)', () => {
    // 2 joined over 1 min → 2/min; 4 still to secure → +2 min from now.
    const eta = estimateStartAt({
      size: 4,
      securedAt: [],
      joined: 2,
      groupCreatedAt: T0,
      now: at(MIN),
    });
    expect(eta?.toISOString()).toBe(at(3 * MIN).toISOString());
  });

  it('returns null when there is no basis yet (nobody joined)', () => {
    expect(estimateStartAt({ size: 4, securedAt: [], joined: 0, groupCreatedAt: T0, now: at(MIN) })).toBeNull();
  });

  it('returns null when no time has elapsed and nothing secured', () => {
    expect(estimateStartAt({ size: 4, securedAt: [], joined: 2, groupCreatedAt: T0, now: T0 })).toBeNull();
  });

  it('returns null once everyone has secured', () => {
    expect(estimateStartAt({ size: 2, securedAt: [T0, at(1)], joined: 2, groupCreatedAt: T0, now: at(1) })).toBeNull();
  });

  it('never estimates a start in the past', () => {
    const now = at(10 * MIN);
    const eta = estimateStartAt({ size: 4, securedAt: [T0, at(MIN)], joined: 2, groupCreatedAt: T0, now });
    expect(eta!.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });
});
