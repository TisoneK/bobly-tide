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

/** A Kenyan M-Pesa MSISDN in canonical form, e.g. 2547XXXXXXXX or
 *  2541XXXXXXXX (Safaricom 07… and 01… ranges). Clients normalise local
 *  formats (07.., 01.., +254..) to this before sending. */
export function requirePhone(raw: unknown): string {
  if (typeof raw !== 'string' || !/^254(7|1)\d{8}$/.test(raw)) {
    throw new BadRequestException('phone must be an M-Pesa number like 2547XXXXXXXX');
  }
  return raw;
}
