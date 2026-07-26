import { Module } from '@nestjs/common';
import { UploadsModule } from '../../common/uploads/uploads.module';
import { AuthModule } from '../auth/auth.module';
import { PlantsController } from './plants.controller';
import { PlantsService } from './plants.service';
import { PlantsRepository } from './plants.repository';
import { ComparisonQueue } from './comparison.queue';

/**
 * US3 plants feature module (T-060): save/list/get plants + follow-up photo
 * history. Imports AuthModule for JwtAuthGuard/CurrentUserId (every route is
 * user-scoped) and UploadsModule for image validation + storage. NOT imported
 * by app.module here — T-077 registers it alongside the rest of the plants
 * surface (T-061 frontend, T-082 credit guard).
 */
@Module({
  imports: [AuthModule, UploadsModule],
  controllers: [PlantsController],
  providers: [PlantsService, PlantsRepository, ComparisonQueue],
  exports: [PlantsService, PlantsRepository],
})
export class PlantsModule {}
