import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { ServicesModule } from '../src/modules/services/services.module';
import { ServicesService } from '../src/modules/services/services.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import appConfig from '../src/config/app.config';
import jwtConfig from '../src/config/jwt.config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');

describe('Services E2E (Phase 4)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let adminToken: string;
  let categoryId: string;
  let serviceId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig, jwtConfig], ignoreEnvFile: true }),
        MongooseModule.forRoot(mongod.getUri()),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
        AuthModule,
        UsersModule,
        ServicesModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    // Register admin user (simulate by registering + manually setting role in DB)
    // For simplicity in tests: register a user, use admin endpoints after manually granting
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ phone: '0900000001', full_name: 'Admin Test', password: 'Password123!' });
    adminToken = res.body.data.access_token;
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  describe('GET /services/categories (public)', () => {
    it('should return empty array initially', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/services/categories').expect(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /services (public)', () => {
    it('should return empty array initially', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/services').expect(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('POST /services/categories [Admin role required]', () => {
    it('should reject without token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/services/categories')
        .send({ name: 'Test', slug: 'test' })
        .expect(401);
    });

    it('should reject non-admin user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/services/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test', slug: 'test' })
        .expect(403);
    });
  });

  describe('Service CRUD via service model directly', () => {
    it('should create services via service (simulating admin seed)', async () => {
      // Access the service directly via testing module to bypass RBAC for this test
      const servicesService = app.get(ServicesService);
      await servicesService.seedDefaultServices();

      const res = await request(app.getHttpServer()).get('/api/v1/services/categories').expect(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(5);
      categoryId = res.body.data[0]._id;
    });

    it('should return services for a category', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/services?category_id=${categoryId}`)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      serviceId = res.body.data[0]._id;
    });

    it('should get service by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/services/${serviceId}`)
        .expect(200);
      expect(res.body.data._id).toBe(serviceId);
      expect(res.body.data.price_range_min).toBeGreaterThan(0);
    });

    it('should return 404 for invalid service ID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/services/000000000000000000000000')
        .expect(404);
    });

    it('should reject duplicate slug on create', async () => {
      const servicesService = app.get(ServicesService);
      await expect(
        servicesService.createCategory({ name: 'Dup', slug: 'giup-viec-theo-gio' }),
      ).rejects.toThrow();
    });
  });
});
