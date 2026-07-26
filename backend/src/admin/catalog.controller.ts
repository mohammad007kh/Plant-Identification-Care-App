import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { createSpeciesRequestSchema, updateSpeciesRequestSchema, type AdminSpecies } from 'shared';
import { CurrentUserId } from '../modules/auth/current-user.decorator';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { CatalogService } from './catalog.service';

/**
 * `GET/POST/PATCH /v1/admin/species` (US9, FR-024 — catalog + care-guide
 * CRUD). Admin-only: `JwtAuthGuard` authenticates, `AdminGuard` enforces
 * `role=admin` (any other authenticated user gets 403). Not registered in
 * `app.module` here — T-147 wires route registration.
 */
@Controller('admin/species')
@UseGuards(JwtAuthGuard, AdminGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(): Promise<AdminSpecies[]> {
    return this.catalog.list();
  }

  @Post()
  create(@CurrentUserId() adminUserId: string, @Body() body: unknown): Promise<AdminSpecies> {
    const parsed = createSpeciesRequestSchema.safeParse(body);
    if (!parsed.success) throw this.badRequest(parsed.error.issues);
    return this.catalog.create(adminUserId, parsed.data);
  }

  @Patch(':publicId')
  update(@Param('publicId') publicId: string, @Body() body: unknown): Promise<AdminSpecies> {
    const parsed = updateSpeciesRequestSchema.safeParse(body);
    if (!parsed.success) throw this.badRequest(parsed.error.issues);
    return this.catalog.update(publicId, parsed.data);
  }

  private badRequest(issues: { message: string }[]): BadRequestException {
    return new BadRequestException({
      code: 'validation_error',
      message: issues.map((i) => i.message).join('; '),
    });
  }
}
