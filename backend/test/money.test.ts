import { describe, expect, it } from 'vitest';
import { Money } from '../src/domain/money';

describe('Money', () => {
  it('adds exactly, with no float drift', () => {
    // The classic 0.1 + 0.2 !== 0.3 float trap must not exist here.
    expect(Money.of('0.1').plus('0.2').equals('0.3')).toBe(true);
  });

  it('computes the 5% fee on a 24-member pot exactly', () => {
    const pot = Money.of('24');
    expect(pot.times(0.05).equals('1.2')).toBe(true);
    expect(pot.minus(pot.times(0.05)).equals('22.8')).toBe(true);
  });

  it('negates and subtracts', () => {
    expect(Money.of('1').negated().equals('-1')).toBe(true);
    expect(Money.of('24').minus('1').equals('23')).toBe(true);
  });

  it('compares', () => {
    expect(Money.of('0').lessThan('1')).toBe(true);
    expect(Money.of('1').gte('1')).toBe(true);
    expect(Money.zero().isZero()).toBe(true);
    expect(Money.of('-0.5').isNegative()).toBe(true);
    expect(Money.zero().isNegative()).toBe(false);
  });

  it('formats for storage (4 dp) and display (2 dp + currency)', () => {
    expect(Money.of('22.8').toString()).toBe('22.8');
    expect(Money.of('22.8').toDisplay()).toBe('KES 22.80');
  });

  it('rejects non-finite amounts', () => {
    expect(() => Money.of(Number.NaN)).toThrow(TypeError);
    expect(() => Money.of(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});
