import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  updateAdminConfigRequestSchema,
  updateTierRequestSchema,
  type AdminConfig,
  type AdminTier,
} from 'shared';
import { CurrentUserId } from '../modules/auth/current-user.decorator';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { ConfigService } from './config.service';

/**
 * `GET/PATCH /v1/admin/config` + `GET/PATCH /v1/admin/tiers` (US9, FR-005 /
 * FR-014 / FR-021 / FR-027). Admin-only: `JwtAuthGuard` authenticates,
 * `AdminGuard` enforces `role=admin`. Writes persist into `app_config` /
 * `subscription_tier` and are read live by the rest of the app — no deploy.
 * Not registered in `app.module` here — T-147 wires route registration.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ConfigController {
  constructor(private readonly config: ConfigService) {}

  @Get('config')
  getConfig(): Promise<AdminConfig> {
    return this.config.getConfig();
  }

  @Patch('config')
  updateConfig(@CurrentUserId() adminUserId: string, @Body() body: unknown): Promise<AdminConfig> {
    const parsed = updateAdminConfigRequestSchema.safeParse(body);
    if (!parsed.success) throw this.badRequest(parsed.error.issues);
    return this.config.updateConfig(adminUserId, parsed.data);
  }

  @Get('tiers')
  listTiers(): Promise<AdminTier[]> {
    return this.config.listTiers();
  }

  @Patch('tiers')
  updateTier(@Body() body: unknown): Promise<AdminTier> {
    const parsed = updateTierRequestSchema.safeParse(body);
    if (!parsed.success) throw this.badRequest(parsed.error.issues);
    return this.config.updateTier(parsed.data);
  }

  private badRequest(issues: { message: string }[]): BadRequestException {
    return new BadRequestException({
      code: 'validation_error',
      message: issues.map((i) => i.message).join('; '),
    });
  }
}
