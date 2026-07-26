import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../errors/error-codes';
import { CircuitBreaker, OutboundServiceError, callOutboundService } from './outbound';

describe('callOutboundService (T-161, FR-030)', () => {
  it('returns the value on first-attempt success without retrying', async () => {
    let calls = 0;
    const result = await callOutboundService(
      async () => {
        calls += 1;
        return 'ok';
      },
      {
        label: 'test-service',
        timeoutMs: 1000,
        maxAttempts: 2,
        unavailableCode: ErrorCode.AI_UNAVAILABLE,
      },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries on failure and succeeds on a later attempt', async () => {
    let calls = 0;
    const result = await callOutboundService(
      async () => {
        calls += 1;
        if (calls < 2) throw new Error('flaky');
        return 'recovered';
      },
      {
        label: 'test-service',
        timeoutMs: 1000,
        maxAttempts: 3,
        backoffBaseMs: 1,
        unavailableCode: ErrorCode.AI_UNAVAILABLE,
      },
    );
    expect(result).toBe('recovered');
    expect(calls).toBe(2);
  });

  it('throws OutboundServiceError with the caller-supplied code once attempts are exhausted', async () => {
    await expect(
      callOutboundService(
        async () => {
          throw new Error('model unavailable');
        },
        {
          label: 'ai-provider',
          timeoutMs: 1000,
          maxAttempts: 2,
          backoffBaseMs: 1,
          unavailableCode: ErrorCode.AI_UNAVAILABLE,
        },
      ),
    ).rejects.toMatchObject({
      name: 'OutboundServiceError',
      code: ErrorCode.AI_UNAVAILABLE,
      message: 'model unavailable',
    });
  });

  it('classifies an exhausted timeout as upstream_timeout, not the caller-supplied code', async () => {
    await expect(
      callOutboundService(
        () => new Promise((resolve) => setTimeout(() => resolve('too late'), 50)),
        {
          label: 'slow-service',
          timeoutMs: 5,
          maxAttempts: 1,
          unavailableCode: ErrorCode.AI_UNAVAILABLE,
        },
      ),
    ).rejects.toMatchObject({ code: ErrorCode.UPSTREAM_TIMEOUT });
  });

  it('circuit breaker: opens after the failure threshold and fails fast without invoking fn', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10_000 });
    let calls = 0;
    const attempt = () =>
      callOutboundService(
        async () => {
          calls += 1;
          throw new Error('down');
        },
        {
          label: 'ai-provider',
          timeoutMs: 1000,
          maxAttempts: 1,
          unavailableCode: ErrorCode.AI_UNAVAILABLE,
          breaker,
        },
      );

    await expect(attempt()).rejects.toBeInstanceOf(OutboundServiceError); // failure 1
    await expect(attempt()).rejects.toBeInstanceOf(OutboundServiceError); // failure 2 → opens
    expect(calls).toBe(2);

    await expect(attempt()).rejects.toMatchObject({ code: ErrorCode.AI_UNAVAILABLE }); // fails fast
    expect(calls).toBe(2); // fn was NOT invoked a third time
  });

  it('circuit breaker: a success resets the failure count', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10_000 });
    const call = (shouldFail: boolean) =>
      callOutboundService(
        async () => {
          if (shouldFail) throw new Error('down');
          return 'ok';
        },
        {
          label: 'ai-provider',
          timeoutMs: 1000,
          maxAttempts: 1,
          unavailableCode: ErrorCode.AI_UNAVAILABLE,
          breaker,
        },
      );

    await expect(call(true)).rejects.toBeInstanceOf(OutboundServiceError);
    await expect(call(false)).resolves.toBe('ok');
    // Failure count reset by the success — one more failure should NOT open the circuit yet.
    await expect(call(true)).rejects.toMatchObject({ code: ErrorCode.AI_UNAVAILABLE });
    expect(breaker.isOpen).toBe(false);
  });
});
