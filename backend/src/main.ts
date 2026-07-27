import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('v1');

  // Frontend (Next.js) is a separate origin in dev; allow it with credentials so
  // the httpOnly refresh cookie round-trips. Origin is env-configurable for prod.
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  // No global ValidationPipe: request bodies are validated with Zod (safeParse)
  // in the controllers, so class-validator/-transformer are not dependencies.

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to bootstrap application', error);
  process.exitCode = 1;
});
