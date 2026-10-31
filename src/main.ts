import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Passenger keeps the sub-URI in the path, so on cPanel set API_PREFIX=ecom-back.
  if (process.env.API_PREFIX) app.setGlobalPrefix(process.env.API_PREFIX);
  // Same-origin in production; CORS is only needed for local dev (front on :3000).
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });
  // On cPanel (Passenger) PORT is injected and may be a socket path.
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
