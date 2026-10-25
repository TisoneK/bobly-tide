import { BadRequestException } from '@nestjs/common';
import { Money } from '../domain/money';

/** Whole-shilling amount, as M-Pesa requires (product spec §7). */
export function wholeAmount(raw: unknown): Money {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadRequestException('amount must be a positive whole number of shillings');
  }
  return Money.of(String(n));
}

/** A Kenyan M-Pesa MSISDN, e.g. 2547XXXXXXXX. */
export function requirePhone(raw: unknown): string {
  if (typeof raw !== 'string' || !/^2547\d{8}$/.test(raw)) {
    throw new BadRequestException('phone must be an M-Pesa MSISDN like 2547XXXXXXXX');
  }
  return raw;
}
