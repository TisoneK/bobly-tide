import { ForbiddenException } from '@nestjs/common';
import type { SessionClaims } from '../auth/auth.service';
import type { GroupStore } from './group.store';

/** Guard that the authenticated user owns the wallet they are acting on.
 *  A 403 (not a 404) is returned whether the wallet is someone else's or
 *  absent, so the endpoint does not leak which wallet ids exist. */
export async function requireWalletOwner(
  store: GroupStore,
  walletId: string,
  user: SessionClaims,
): Promise<void> {
  const owner = await store.walletOwner(walletId);
  if (owner == null || owner !== user.sub) {
    throw new ForbiddenException('this wallet is not yours');
  }
}
