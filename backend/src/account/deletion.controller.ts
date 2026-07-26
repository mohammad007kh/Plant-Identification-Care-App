import { Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import type { DeletionStatusResponse } from 'shared';
import { CurrentUserId } from '../modules/auth/current-user.decorator';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { DeletionService } from './deletion.service';

/**
 * `POST/DELETE/GET /v1/account/deletion` (US8, FR-023). Every route is guarded
 * by JwtAuthGuard; `userId` always comes from the verified JWT principal
 * (`@CurrentUserId()`), never a path/body param. Not registered in app.module
 * here — T-137 wires this module.
 */
@Controller('account/deletion')
@UseGuards(JwtAuthGuard)
export class DeletionController {
  constructor(private readonly deletion: DeletionService) {}

  /** Requests deletion: starts the 7-day cancellable grace window. */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  request(@CurrentUserId() userId: string): Promise<DeletionStatusResponse> {
    return this.deletion.requestDeletion(userId);
  }

  /** Cancels a pending deletion request; a no-op error if none is pending. */
  @Delete()
  cancel(@CurrentUserId() userId: string): Promise<DeletionStatusResponse> {
    return this.deletion.cancelDeletion(userId);
  }

  /** Current deletion state (surfaced by the account UI, T-131). */
  @Get()
  status(@CurrentUserId() userId: string): Promise<DeletionStatusResponse> {
    return this.deletion.getStatus(userId);
  }
}
