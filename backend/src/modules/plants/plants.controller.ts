import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ScanJob } from 'shared';
import { savePlantRequestSchema } from 'shared';
import { UploadValidationPipe } from '../../common/uploads/upload.pipe';
import type { NormalizedImage } from '../../common/uploads/upload-validation.service';
import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { listPlantsQuerySchema } from './dto/list-plants-query.dto';
import { PlantsService, type CursorPage, type PlantDto } from './plants.service';

/**
 * `GET /v1/plants`, `GET /v1/plants/:id`, `POST /v1/plants`,
 * `POST /v1/plants/:id/photos` (US3, FR-009/FR-010). Every route is guarded by
 * JwtAuthGuard; `userId` always comes from the verified JWT principal
 * (`@CurrentUserId()`), never from the request body/query (Station 07 tenancy
 * rule). Not registered in app.module here — T-077 wires this module.
 */
@Controller('plants')
@UseGuards(JwtAuthGuard)
export class PlantsController {
  constructor(private readonly plants: PlantsService) {}

  @Get()
  list(@CurrentUserId() userId: string, @Query() query: unknown): Promise<CursorPage<PlantDto>> {
    const parsed = listPlantsQuerySchema.safeParse(query);
    if (!parsed.success) throw this.badRequest(parsed.error.issues);
    return this.plants.list(userId, parsed.data.cursor ?? null, parsed.data.limit);
  }

  @Get(':id')
  get(@CurrentUserId() userId: string, @Param('id') id: string): Promise<PlantDto> {
    return this.plants.getOne(userId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUserId() userId: string, @Body() body: unknown): Promise<PlantDto> {
    const parsed = savePlantRequestSchema.safeParse(body);
    if (!parsed.success) throw this.badRequest(parsed.error.issues);
    return this.plants.saveFromScan(userId, parsed.data);
  }

  @Post(':id/photos')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('photo'))
  addPhoto(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @UploadedFile(UploadValidationPipe) image: NormalizedImage,
  ): Promise<ScanJob> {
    return this.plants.addFollowUpPhoto(userId, id, image);
  }

  private badRequest(issues: { message: string }[]): BadRequestException {
    return new BadRequestException({
      code: 'validation_error',
      message: issues.map((i) => i.message).join('; '),
    });
  }
}
