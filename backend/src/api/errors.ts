import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InvalidOtpError, OtpLockedError } from '../auth/auth.service';
import { ShortfallError } from '../domain/engine';
import { InsufficientFundsForHoldError } from '../domain/holds';
import { BelowMinimumError, InsufficientBalanceError } from '../mpesa/mpesa.service';
import { AlreadyJoinedError, GroupNotFoundError, GroupNotJoinableError } from './group.store';

/** Map a domain error to the right HTTP status. */
export function toHttp(e: unknown): HttpException {
  if (e instanceof HttpException) return e; // already an HTTP error (e.g. Forbidden)
  if (e instanceof GroupNotFoundError) return new NotFoundException(e.message);
  if (e instanceof GroupNotJoinableError) return new ConflictException(e.message);
  if (e instanceof AlreadyJoinedError) return new ConflictException(e.message);
  if (e instanceof InsufficientFundsForHoldError) return new BadRequestException(e.message);
  if (e instanceof ShortfallError) return new BadRequestException(e.message);
  if (e instanceof InsufficientBalanceError) return new BadRequestException(e.message);
  if (e instanceof BelowMinimumError) return new BadRequestException(e.message);
  if (e instanceof InvalidOtpError) return new UnauthorizedException(e.message);
  if (e instanceof OtpLockedError) return new HttpException(e.message, HttpStatus.TOO_MANY_REQUESTS);
  return new InternalServerErrorException((e as Error).message);
}
