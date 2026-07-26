import { describe, expect, it } from 'vitest';
import { OutboundServiceError } from '../http/outbound';
import { ErrorCode, classifyUpstreamError, isOutageCode } from './error-codes';

describe('classifyUpstreamError (T-161, FR-030)', () => {
  it('reads the code straight through from an OutboundServiceError (AI outage)', () => {
    const err = new OutboundServiceError(ErrorCode.AI_UNAVAILABLE, 'model unavailable');
    expect(classifyUpstreamError(err)).toBe('ai_unavailable');
  });

  it('reads the code straight through from an OutboundServiceError (upstream timeout)', () => {
    const err = new OutboundServiceError(
      ErrorCode.UPSTREAM_TIMEOUT,
      'AI provider timed out after 20000ms',
    );
    expect(classifyUpstreamError(err)).toBe('upstream_timeout');
  });

  it('maps a raw connection-refused error (e.g. Postgres/Redis down) to database_unavailable', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5433'), {
      code: 'ECONNREFUSED',
    });
    expect(classifyUpstreamError(err)).toBe('database_unavailable');
  });

  it('maps a connection-reset error to database_unavailable', () => {
    const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    expect(classifyUpstreamError(err)).toBe('database_unavailable');
  });

  it('falls back to internal_error for a plain application error', () => {
    expect(classifyUpstreamError(new Error('unexpected null'))).toBe('internal_error');
  });

  it('falls back to internal_error for a non-Error thrown value', () => {
    expect(classifyUpstreamError('boom')).toBe('internal_error');
  });

  it('ignores an untrusted/foreign `code` value that is not in the known vocabulary', () => {
    const err = Object.assign(new Error('weird'), { code: 'something_made_up' });
    expect(classifyUpstreamError(err)).toBe('internal_error');
  });

  it('isOutageCode is true for connectivity codes and false for internal_error', () => {
    expect(isOutageCode(ErrorCode.AI_UNAVAILABLE)).toBe(true);
    expect(isOutageCode(ErrorCode.UPSTREAM_TIMEOUT)).toBe(true);
    expect(isOutageCode(ErrorCode.UPSTREAM_UNAVAILABLE)).toBe(true);
    expect(isOutageCode(ErrorCode.DATABASE_UNAVAILABLE)).toBe(true);
    expect(isOutageCode(ErrorCode.INTERNAL_ERROR)).toBe(false);
    expect(isOutageCode(ErrorCode.OFFLINE)).toBe(false);
  });
});
