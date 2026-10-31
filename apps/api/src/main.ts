import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { UPLOAD_ROOT } from './modules/uploads/uploads.controller';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { getConnectionToken } from '@nestjs/mongoose';
import { mongo } from 'mongoose';
import { extname } from 'node:path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Trust reverse proxy (Render / Cloudflare / Nginx) so req.protocol is correctly 'https'
  app.set('trust proxy', 1);

  // Uploaded files (KYC, job photos, completion evidence)
  app.useStaticAssets(UPLOAD_ROOT, { prefix: '/uploads/' });
  // Phục vụ fallback từ MongoDB GridFS nếu Render xoá ổ tạm
  app.use('/uploads', async (req: any, res: any, next: any) => {
    try {
      const relPath = req.path.replace(/^\/+/, '');
      if (!relPath) return next();
      const connection = app.get(getConnectionToken());
      if (connection?.db) {
        const bucket = new mongo.GridFSBucket(connection.db, { bucketName: 'uploads' });
        const files = await bucket.find({ filename: relPath }).limit(1).toArray();
        if (files && files.length > 0) {
          const fileMeta = files[0];
          const ext = extname(relPath).toLowerCase();
          const contentType =
            (fileMeta.metadata as any)?.mimetype ||
            (ext === '.jpg' || ext === '.jpeg'
              ? 'image/jpeg'
              : ext === '.png'
                ? 'image/png'
                : 'application/octet-stream');
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          return bucket.openDownloadStreamByName(relPath).pipe(res);
        }
      }
    } catch {}
    next();
  });

  // JSON body limit nâng lên 10mb: POST /ai/analyze-photo gửi ảnh base64
  // (DTO chặn ở 8.000.000 ký tự) — mặc định Express chỉ cho 100kb.
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // CORS
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    // Bypass-Tunnel-Reminder is sent by the mobile client; browsers need it allowed (web build).
    allowedHeaders: 'Content-Type,Accept,Authorization,X-Requested-With,Bypass-Tunnel-Reminder',
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger (dev only)
  if (nodeEnv === 'development') {
    const config = new DocumentBuilder()
      .setTitle('HomeMate API')
      .setDescription('HomeMate Home Service Marketplace API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 HomeMate API running on: http://0.0.0.0:${port}/api/v1`);
  if (nodeEnv === 'development') {
    console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
