import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
}

/**
 * Unauthenticated health check, resolved as `GET /v1/health` given the
 * global `v1` prefix set in main.ts. Marked `@Public()` so the global
 * JwtAuthGuard (T-057) lets it through without a token — used by Docker
 * Compose healthchecks and smoke tests.
 */
@Public()
@Controller('health')
export class HealthController {
  @Get()
  @HttpCode(HttpStatus.OK)
  getHealth(): HealthStatus {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
