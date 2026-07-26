import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { adminUserActionRequestSchema, type AdminUserSummary } from 'shared';
import { CurrentUserId } from '../modules/auth/current-user.decorator';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { listAdminUsersQuerySchema } from './dto/list-admin-users-query.dto';
import { UsersAdminService, type CursorPage } from './users-admin.service';

/**
 * `GET /v1/admin/users`, `GET /v1/admin/users/:publicId`,
 * `PATCH /v1/admin/users/:publicId` (US9, FR-026). Admin-only:
 * `JwtAuthGuard` authenticates, `AdminGuard` enforces `role=admin` (any other
 * authenticated user gets 403). Not registered in `app.module` here — T-147
 * wires route registration.
 */
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UsersAdminController {
  constructor(private readonly usersAdmin: UsersAdminService) {}

  @Get()
  list(@Query() query: unknown): Promise<CursorPage<AdminUserSummary>> {
    const parsed = listAdminUsersQuerySchema.safeParse(query);
    if (!parsed.success) throw this.badRequest(parsed.error.issues);
    return this.usersAdmin.search(
      parsed.data.q ?? null,
      parsed.data.cursor ?? null,
      parsed.data.limit,
    );
  }

  @Get(':publicId')
  get(@Param('publicId') publicId: string): Promise<AdminUserSummary> {
    return this.usersAdmin.getOne(publicId);
  }

  @Patch(':publicId')
  act(
    @CurrentUserId() adminUserId: string,
    @Param('publicId') publicId: string,
    @Body() body: unknown,
  ): Promise<AdminUserSummary> {
    const parsed = adminUserActionRequestSchema.safeParse(body);
    if (!parsed.success) throw this.badRequest(parsed.error.issues);
    return this.usersAdmin.act(adminUserId, publicId, parsed.data);
  }

  private badRequest(issues: { message: string }[]): BadRequestException {
    return new BadRequestException({
      code: 'validation_error',
      message: issues.map((i) => i.message).join('; '),
    });
  }
}
