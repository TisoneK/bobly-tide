import {
  BadRequestException,
  ConflictException,
  type HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ShortfallError } from '../domain/engine';
import { InsufficientFundsForHoldError } from '../domain/holds';
import { GroupNotFoundError, GroupNotJoinableError } from './group.store';

/** Map a domain error to the right HTTP status. */
export function toHttp(e: unknown): HttpException {
  if (e instanceof GroupNotFoundError) return new NotFoundException(e.message);
  if (e instanceof GroupNotJoinableError) return new ConflictException(e.message);
  if (e instanceof InsufficientFundsForHoldError) return new BadRequestException(e.message);
  if (e instanceof ShortfallError) return new BadRequestException(e.message);
  return new InternalServerErrorException((e as Error).message);
}
