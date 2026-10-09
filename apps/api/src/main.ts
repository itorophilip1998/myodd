import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const origin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  app.enableCors({ origin, credentials: true });
  app.useGlobalFilters(new AppExceptionFilter());
  app.setGlobalPrefix('api');
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`myOdd API listening on http://localhost:${port}`);
}

bootstrap();
