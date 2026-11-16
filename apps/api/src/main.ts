import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  // rawBody：LINE webhook 驗簽需要原始 request body（req.rawBody）
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.setGlobalPrefix('api/v2');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors();
  app.useStaticAssets(join(process.cwd(), 'storage', 'uploads'), { prefix: '/api/v2/uploads' });
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
