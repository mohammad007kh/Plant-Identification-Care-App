import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
}

/**
 * Unauthenticated health check, resolved as `GET /v1/health` given the
 * global `v1` prefix set in main.ts. No guard is applied, so no auth
 * token is required — used by Docker Compose healthchecks and smoke tests.
 */
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
