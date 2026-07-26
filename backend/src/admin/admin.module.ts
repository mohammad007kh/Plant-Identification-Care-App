import { Module } from '@nestjs/common';
import { AppConfigModule } from '../common/config/app-config.module';
import { UploadsModule } from '../common/uploads/uploads.module';
import { AuthModule } from '../modules/auth/auth.module';
import { AdminConfigRepository } from './admin-config.repository';
import { AdminGuard } from './admin.guard';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';
import { ReportsAdminController } from './reports-admin.controller';
import { ReportsAdminRepository } from './reports-admin.repository';
import { ReportsAdminService } from './reports-admin.service';
import { SpeciesRepository } from './species.repository';
import { TierRepository } from './tier.repository';
import { UsersAdminController } from './users-admin.controller';
import { UsersAdminRepository } from './users-admin.repository';
import { UsersAdminService } from './users-admin.service';

/**
 * Admin catalog + operational-config + user-management + report-triage
 * module (US9, T-140/T-141). Imports `AuthModule` for `JwtAuthGuard` (+ the
 * `TokenService`/`UsersRepository` it depends on), `AppConfigModule` for
 * `AppConfigService` — the SAME read path the rest of the app uses for
 * `allowed_photo_file_types`/`credit_costs`, so admin and consumer never see
 * divergent parsing — and `UploadsModule` for `StorageService` (signed photo
 * URLs on the misidentification-report list, T-141/FR-025).
 *
 * NOT imported by `app.module` here — route registration is deferred to
 * T-147, per this task's scope.
 */
@Module({
  imports: [AuthModule, AppConfigModule, UploadsModule],
  controllers: [CatalogController, ConfigController, UsersAdminController, ReportsAdminController],
  providers: [
    AdminGuard,
    SpeciesRepository,
    CatalogService,
    AdminConfigRepository,
    TierRepository,
    ConfigService,
    UsersAdminRepository,
    UsersAdminService,
    ReportsAdminRepository,
    ReportsAdminService,
  ],
})
export class AdminModule {}
