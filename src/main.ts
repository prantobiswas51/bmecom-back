import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { renameLegacyOrderStatuses } from './orders/rename-legacy-statuses.js';
import { UPLOAD_DIR } from './products/uploads.controller.js';

async function bootstrap() {
  // ConfigModule loads .env later, so make sure the database settings are in place for this early step.
  try {
    process.loadEnvFile('.env'); // does not override variables that are already set
  } catch {
    // no .env file: the settings come from the environment
  }
  await renameLegacyOrderStatuses();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // nginx runs on the same machine: believe its X-Forwarded-For so req.ip is the real visitor.
  app.set('trust proxy', 'loopback');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Passenger keeps the sub-URI in the path, so on cPanel set API_PREFIX=ecom-back.
  if (process.env.API_PREFIX) app.setGlobalPrefix(process.env.API_PREFIX);
  // Same-origin in production; CORS is only needed for local dev (front on :3000).
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });
  // Product photos uploaded from the admin panel.
  app.useStaticAssets(UPLOAD_DIR, { prefix: '/uploads/' });
  // On cPanel (Passenger) PORT is injected and may be a socket path.
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
