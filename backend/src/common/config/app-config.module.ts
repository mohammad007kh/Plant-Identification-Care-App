import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';

/** Keys that every environment (dev/CI/prod) must provide — fail fast if absent. */
const REQUIRED_ENV_KEYS = ['DATABASE_URL', 'REDIS_URL', 'NODE_ENV'] as const;

/**
 * Validates that all required environment variables are present at startup.
 * Throws (crashing the process before it can serve traffic) if any are missing,
 * per the project's "fail fast" error-handling standard.
 */
function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missingKeys = REQUIRED_ENV_KEYS.filter((key) => {
    const value = config[key];
    return value === undefined || value === null || value === '';
  });

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missingKeys.join(', ')}. ` +
        'Copy .env.example to .env at the repo root and fill in real values.',
    );
  }

  return config;
}

/**
 * Global application configuration module. Wraps NestJS's `ConfigModule`
 * so every feature module can inject `ConfigService` without re-importing
 * config wiring (registry: `infrastructure.secrets: env-files`).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
