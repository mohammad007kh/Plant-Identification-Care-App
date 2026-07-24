import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppConfigModule } from './common/config/app-config.module';
import { ProblemDetailsFilter } from './common/filters/problem.filter';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [AppConfigModule, HealthModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ProblemDetailsFilter,
    },
  ],
})
export class AppModule {}
