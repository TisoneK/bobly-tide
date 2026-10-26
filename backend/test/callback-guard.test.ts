import { describe, expect, it } from 'vitest';
import {
  type CallbackSourceConfig,
  ipMatches,
  normalizeIp,
  verifyCallbackSource,
} from '../src/mpesa/callback-guard';

const off: CallbackSourceConfig = { secret: '', allowedIps: [] };

describe('verifyCallbackSource — token', () => {
  const cfg: CallbackSourceConfig = { secret: 's3cr3t', allowedIps: [] };

  it('accepts the matching token', () => {
    expect(verifyCallbackSource(cfg, { token: 's3cr3t', ip: '1.2.3.4' })).toEqual({ ok: true });
  });

  it('rejects a wrong or missing token', () => {
    expect(verifyCallbackSource(cfg, { token: 'nope' }).ok).toBe(false);
    expect(verifyCallbackSource(cfg, {}).ok).toBe(false);
  });

  it('is disabled when no secret is configured', () => {
    expect(verifyCallbackSource(off, {}).ok).toBe(true);
  });
});

describe('verifyCallbackSource — IP allowlist', () => {
  const cfg: CallbackSourceConfig = { secret: '', allowedIps: ['196.201.214.0/24', '10.0.0.5'] };

  it('accepts an IP inside an allowed CIDR', () => {
    expect(verifyCallbackSource(cfg, { ip: '196.201.214.200' }).ok).toBe(true);
  });

  it('accepts an exact allowed IP, including IPv4-mapped IPv6', () => {
    expect(verifyCallbackSource(cfg, { ip: '10.0.0.5' }).ok).toBe(true);
    expect(verifyCallbackSource(cfg, { ip: '::ffff:10.0.0.5' }).ok).toBe(true);
  });

  it('rejects an IP outside every range', () => {
    expect(verifyCallbackSource(cfg, { ip: '196.201.215.1' }).ok).toBe(false);
    expect(verifyCallbackSource(cfg, { ip: undefined }).ok).toBe(false);
  });

  it('is disabled when the allowlist is empty', () => {
    expect(verifyCallbackSource(off, { ip: '8.8.8.8' }).ok).toBe(true);
  });
});

describe('verifyCallbackSource — both checks', () => {
  const cfg: CallbackSourceConfig = { secret: 'tok', allowedIps: ['196.201.214.0/24'] };

  it('requires both the token and an allowed IP', () => {
    expect(verifyCallbackSource(cfg, { token: 'tok', ip: '196.201.214.5' }).ok).toBe(true);
    expect(verifyCallbackSource(cfg, { token: 'tok', ip: '8.8.8.8' }).ok).toBe(false);
    expect(verifyCallbackSource(cfg, { token: 'bad', ip: '196.201.214.5' }).ok).toBe(false);
  });
});

describe('ipMatches / normalizeIp', () => {
  it('matches exact and CIDR, rejects malformed', () => {
    expect(ipMatches('1.2.3.4', '1.2.3.4')).toBe(true);
    expect(ipMatches('1.2.3.4', '1.2.3.0/24')).toBe(true);
    expect(ipMatches('1.2.4.4', '1.2.3.0/24')).toBe(false);
    expect(ipMatches('1.2.3.4', '0.0.0.0/0')).toBe(true);
    expect(ipMatches('1.2.3.999', '1.2.3.0/24')).toBe(false);
  });

  it('strips the IPv4-mapped IPv6 prefix', () => {
    expect(normalizeIp('::ffff:196.201.214.9')).toBe('196.201.214.9');
    expect(normalizeIp('196.201.214.9')).toBe('196.201.214.9');
  });
});
