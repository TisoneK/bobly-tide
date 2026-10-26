import { describe, expect, it } from 'vitest';
import { classifyRejection } from '../src/security/security-events';

describe('classifyRejection', () => {
  it('maps auth + authz rejections to typed events', () => {
    expect(classifyRejection(401, 'missing bearer token')).toEqual({ type: 'auth_failed', severity: 'warning' });
    expect(classifyRejection(403, 'admin access only')).toEqual({ type: 'admin_denied', severity: 'warning' });
    expect(classifyRejection(403, 'this wallet is not yours')).toEqual({ type: 'ownership_denied', severity: 'warning' });
    expect(classifyRejection(403, 'you are not a member of this group')).toEqual({
      type: 'ownership_denied',
      severity: 'warning',
    });
  });

  it('flags forged payment callbacks as critical', () => {
    expect(classifyRejection(403, 'invalid callback token')).toEqual({ type: 'callback_rejected', severity: 'critical' });
    expect(classifyRejection(403, 'source IP not allowed')).toEqual({ type: 'callback_rejected', severity: 'critical' });
  });

  it('maps OTP lockout and the join limit', () => {
    expect(classifyRejection(429, 'too many attempts')).toEqual({ type: 'otp_locked', severity: 'warning' });
    expect(classifyRejection(409, 'you can be in at most 3 active groups at a time')).toEqual({
      type: 'join_limit',
      severity: 'warning',
    });
  });

  it('ignores benign rejections', () => {
    expect(classifyRejection(403, 'verification required: id, face')).toBeNull();
    expect(classifyRejection(409, 'already a member of group x')).toBeNull();
    expect(classifyRejection(404, 'group x not found')).toBeNull();
    expect(classifyRejection(400, 'amount must be a whole number')).toBeNull();
    expect(classifyRejection(500, 'boom')).toBeNull();
  });
});
