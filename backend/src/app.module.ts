import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppConfigModule } from './common/config/app-config.module';
import { ProblemDetailsFilter } from './common/filters/problem.filter';
import { HealthModule } from './modules/health/health.module';
import { CreditsModule } from './credits/credits.module';
import { AiGatewayModule } from './ai-gateway/ai-gateway.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [AppConfigModule, HealthModule, CreditsModule, AiGatewayModule, JobsModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ProblemDetailsFilter,
    },
  ],
})
export class AppModule {}
