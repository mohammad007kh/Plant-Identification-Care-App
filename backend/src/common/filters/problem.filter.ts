import { randomUUID } from 'node:crypto';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { classifyUpstreamError, isOutageCode } from '../errors/error-codes';

/**
 * RFC 7807 "Problem Details for HTTP APIs" response body.
 * @see https://www.rfc-editor.org/rfc/rfc7807
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  requestId: string;
  /**
   * Stable machine-readable error code (registry `Problem.code`, T-161/FR-030).
   * Present when the thrown exception carried its own `code` (e.g.
   * `InsufficientCreditException`'s `insufficient_credit`) OR when the
   * exception is an unhandled connectivity/timeout failure — in that second
   * case this filter classifies it itself (see `classifyUpstreamError`) so a
   * raw AI/DB/network outage never reaches the client as a bare, uncoded 500.
   */
  code?: string;
  /** RFC7807 extension member: present only on 402 insufficient-credit responses (T-082). */
  plans?: unknown;
}

interface ExceptionInfo {
  status: number;
  title: string;
  detail: string;
  extensions: Record<string, unknown>;
}

/**
 * Global exception filter that converts every thrown exception (Nest
 * `HttpException`s and unhandled errors alike) into an RFC 7807
 * `application/problem+json` response, per registry `code_patterns.error_handling`.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = this.resolveRequestId(request);
    const { status, title, detail, extensions } = this.resolveExceptionInfo(exception);

    const problem: ProblemDetails = {
      type: 'about:blank',
      title,
      status,
      detail,
      requestId,
      ...extensions,
    };

    response.status(status).setHeader('Content-Type', 'application/problem+json').json(problem);
  }

  private resolveRequestId(request: Request): string {
    const headerValue = request.headers['x-request-id'];

    if (typeof headerValue === 'string' && headerValue.length > 0) {
      return headerValue;
    }

    if (Array.isArray(headerValue) && headerValue.length > 0) {
      return headerValue[0];
    }

    return randomUUID();
  }

  private resolveExceptionInfo(exception: unknown): ExceptionInfo {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const detail = this.extractDetail(body) ?? exception.message;
      const extensions = this.extractExtensions(body);

      return { status, title: exception.name, detail, extensions };
    }

    // Not a Nest HttpException: either a genuinely unexpected bug, or an
    // unwrapped connectivity/timeout failure (AI provider, DB, network) that
    // never got the chance to become a typed exception. Classify it so the
    // client at least gets a stable `code` + a 503 instead of a bare 500
    // (T-161/FR-030 — graceful degradation, never a cryptic stack trace).
    const code = classifyUpstreamError(exception);
    const detail = exception instanceof Error ? exception.message : 'Internal server error';

    if (isOutageCode(code)) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        title: 'Service Unavailable',
        detail,
        extensions: { code },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: 'Internal Server Error',
      detail,
      extensions: { code },
    };
  }

  /**
   * RFC7807 extension members: known non-standard keys a custom exception body
   * may carry — `plans` (T-082's 402 upgrade-modal payload) and `code` (a
   * typed error code the throwing site already knows, e.g.
   * `InsufficientCreditException`'s `insufficient_credit`) — are passed
   * through into the response. Everything else on the body is ignored, so
   * this never changes the shape of any pre-existing exception response that
   * didn't already set one of these.
   */
  private extractExtensions(body: string | object): Record<string, unknown> {
    if (typeof body !== 'object' || body === null) return {};
    const extensions: Record<string, unknown> = {};
    if ('plans' in body) {
      extensions.plans = (body as { plans: unknown }).plans;
    }
    if ('code' in body && typeof (body as { code: unknown }).code === 'string') {
      extensions.code = (body as { code: string }).code;
    }
    return extensions;
  }

  private extractDetail(body: string | object): string | undefined {
    if (typeof body === 'string') {
      return body;
    }

    if ('message' in body) {
      const message = (body as { message: unknown }).message;

      if (typeof message === 'string') {
        return message;
      }

      if (Array.isArray(message)) {
        return message.map(String).join(', ');
      }
    }

    return undefined;
  }
}
