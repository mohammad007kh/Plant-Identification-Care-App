import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AdminMisidentificationReport } from 'shared';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { listAdminReportsQuerySchema } from './dto/list-admin-reports-query.dto';
import { ReportsAdminService, type CursorPage } from './reports-admin.service';

/**
 * `GET /v1/admin/misidentification-reports` (US9, FR-025). Admin-only:
 * `JwtAuthGuard` authenticates, `AdminGuard` enforces `role=admin` (any other
 * authenticated user gets 403). Read-only — not registered in `app.module`
 * here — T-147 wires route registration.
 */
@Controller('admin/misidentification-reports')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ReportsAdminController {
  constructor(private readonly reportsAdmin: ReportsAdminService) {}

  @Get()
  list(@Query() query: unknown): Promise<CursorPage<AdminMisidentificationReport>> {
    const parsed = listAdminReportsQuerySchema.safeParse(query);
    if (!parsed.success) throw this.badRequest(parsed.error.issues);
    return this.reportsAdmin.list(parsed.data.cursor ?? null, parsed.data.limit);
  }

  private badRequest(issues: { message: string }[]): BadRequestException {
    return new BadRequestException({
      code: 'validation_error',
      message: issues.map((i) => i.message).join('; '),
    });
  }
}
