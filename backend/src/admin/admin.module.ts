import { Module } from '@nestjs/common';
import { AppConfigModule } from '../common/config/app-config.module';
import { AuthModule } from '../modules/auth/auth.module';
import { AdminConfigRepository } from './admin-config.repository';
import { AdminGuard } from './admin.guard';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';
import { SpeciesRepository } from './species.repository';
import { TierRepository } from './tier.repository';

/**
 * Admin catalog + operational-config module (US9, T-140). Imports
 * `AuthModule` for `JwtAuthGuard` (+ the `TokenService`/`UsersRepository` it
 * depends on) and `AppConfigModule` for `AppConfigService` — the SAME read
 * path the rest of the app uses for `allowed_photo_file_types`/`credit_costs`,
 * so admin and consumer never see divergent parsing.
 *
 * NOT imported by `app.module` here — route registration is deferred to
 * T-147, per this task's scope.
 */
@Module({
  imports: [AuthModule, AppConfigModule],
  controllers: [CatalogController, ConfigController],
  providers: [
    AdminGuard,
    SpeciesRepository,
    CatalogService,
    AdminConfigRepository,
    TierRepository,
    ConfigService,
  ],
})
export class AdminModule {}
