import Decimal from 'decimal.js';

// Money is exact decimal, never float. decimal.js carries full precision;
// we round only at the M-Pesa boundary (build spec §6, §10). Banker's
// rounding (HALF_EVEN) avoids the upward bias of HALF_UP when we do round.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

export type MoneyInput = Money | Decimal | string | number;

/** An exact KES amount. Immutable. */
export class Money {
  private constructor(private readonly value: Decimal) {}

  static of(input: MoneyInput): Money {
    if (input instanceof Money) return input;
    // Reject NaN/Infinity early — a bad amount must never enter the ledger.
    const d = input instanceof Decimal ? input : new Decimal(input);
    if (!d.isFinite()) throw new TypeError(`Money.of: non-finite amount ${String(input)}`);
    return new Money(d);
  }

  static zero(): Money {
    return new Money(new Decimal(0));
  }

  plus(o: MoneyInput): Money {
    return new Money(this.value.plus(Money.of(o).value));
  }

  minus(o: MoneyInput): Money {
    return new Money(this.value.minus(Money.of(o).value));
  }

  /** Multiply by a dimensionless factor (e.g. a fee rate or a member count). */
  times(factor: Decimal | string | number): Money {
    return new Money(this.value.times(factor));
  }

  negated(): Money {
    return new Money(this.value.negated());
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  lessThan(o: MoneyInput): boolean {
    return this.value.lessThan(Money.of(o).value);
  }

  gte(o: MoneyInput): boolean {
    return this.value.greaterThanOrEqualTo(Money.of(o).value);
  }

  equals(o: MoneyInput): boolean {
    return this.value.equals(Money.of(o).value);
  }

  /** Exact string, up to the 4 dp the ledger stores (NUMERIC(14,4)). */
  toString(): string {
    return this.value.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN).toString();
  }

  /** Human display, 2 dp with the currency prefix: "KES 22.80". */
  toDisplay(): string {
    return `KES ${this.value.toFixed(2)}`;
  }

  toJSON(): string {
    return this.toString();
  }
}
