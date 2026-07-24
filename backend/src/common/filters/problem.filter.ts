import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

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
}

interface ExceptionInfo {
  status: number;
  title: string;
  detail: string;
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
    const { status, title, detail } = this.resolveExceptionInfo(exception);

    const problem: ProblemDetails = {
      type: 'about:blank',
      title,
      status,
      detail,
      requestId,
    };

    response
      .status(status)
      .setHeader('Content-Type', 'application/problem+json')
      .json(problem);
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

      return { status, title: exception.name, detail };
    }

    const detail =
      exception instanceof Error ? exception.message : 'Internal server error';

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: 'Internal Server Error',
      detail,
    };
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
