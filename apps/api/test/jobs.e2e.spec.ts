import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { ServicesModule } from '../src/modules/services/services.module';
import { JobsModule } from '../src/modules/jobs/jobs.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { ServicesService } from '../src/modules/services/services.service';
import appConfig from '../src/config/app.config';
import jwtConfig from '../src/config/jwt.config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');

describe('Jobs E2E (Phase 5)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let customerToken: string;
  let helperToken: string;
  let serviceId: string;
  let jobId: string;
  let quoteId: string;

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
        JobsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    // Seed services
    await app.get(ServicesService).seedDefaultServices();
    const svcRes = await request(app.getHttpServer()).get('/api/v1/services');
    serviceId = svcRes.body.data[0]._id;

    // Register customer
    let res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ phone: '0911111111', full_name: 'Customer A', password: 'Password123!' });
    customerToken = res.body.data.access_token;

    // Register helper
    res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ phone: '0922222222', full_name: 'Helper A', password: 'Password123!' });
    helperToken = res.body.data.access_token;
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  // ── 1. Create Job ──────────────────────────────────────────────────────────

  describe('POST /jobs', () => {
    it('should create job and set status to OPEN', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          service_id: serviceId,
          title: 'Cần người dọn căn hộ 2PN',
          description: 'Dọn sạch toàn bộ căn hộ 2 phòng ngủ, bao gồm cả bếp và phòng tắm.',
          address: {
            full_address: '123 Nguyễn Văn Linh, Quận 7, TP.HCM',
            district: 'Quận 7',
            city: 'TP. Hồ Chí Minh',
            location: { type: 'Point', coordinates: [106.7, 10.73] },
          },
          preferred_date: new Date(Date.now() + 86400000).toISOString(),
          is_flexible_time: true,
        })
        .expect(201);

      expect(res.body.data.status).toBe('open');
      expect(res.body.data.title).toBe('Cần người dọn căn hộ 2PN');
      expect(res.body.data.expires_at).toBeDefined();
      jobId = res.body.data._id;
    });

    it('should reject without token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({ service_id: serviceId, title: 'Test', description: 'Test' })
        .expect(401);
    });

    it('should reject missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ service_id: serviceId })
        .expect(400);
    });
  });

  // ── 2. Get available jobs (helper feed) ────────────────────────────────────

  describe('GET /jobs/available', () => {
    it('should return the created job', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs/available')
        .set('Authorization', `Bearer ${helperToken}`)
        .expect(200);
      expect(res.body.data.jobs.length).toBeGreaterThan(0);
      expect(res.body.data.jobs[0]._id).toBe(jobId);
    });
  });

  // ── 3. Get job detail ──────────────────────────────────────────────────────

  describe('GET /jobs/:jobId', () => {
    it('should return job detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(res.body.data._id).toBe(jobId);
      expect(res.body.data.status).toBe('open');
    });
  });

  // ── 4. Helper submits quote ────────────────────────────────────────────────

  describe('POST /jobs/:jobId/quotes', () => {
    it('should submit quote and update job status to receiving_quotes', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/quotes`)
        .set('Authorization', `Bearer ${helperToken}`)
        .send({
          labor_cost: 250000,
          materials_cost: 50000,
          estimated_duration: 4,
          warranty_days: 0,
          notes: 'Tôi có đầy đủ dụng cụ vệ sinh chuyên nghiệp.',
        })
        .expect(201);

      expect(res.body.data.total_price).toBe(300000);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.helper_receives).toBeGreaterThan(0);
      quoteId = res.body.data._id;

      // Check job status updated
      const jobRes = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(jobRes.body.data.status).toBe('receiving_quotes');
      expect(jobRes.body.data.total_quotes_count).toBe(1);
    });

    it('should reject duplicate quote from same helper', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/quotes`)
        .set('Authorization', `Bearer ${helperToken}`)
        .send({ labor_cost: 200000, estimated_duration: 3 })
        .expect(409);
    });
  });

  // ── 5. Customer views quotes ───────────────────────────────────────────────

  describe('GET /jobs/:jobId/quotes', () => {
    it('customer should see all pending quotes', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/quotes`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0]._id).toBe(quoteId);
    });
  });

  // ── 6. Customer selects quote → Contract created ───────────────────────────

  describe('POST /jobs/:jobId/select-quote', () => {
    it('should select quote and create contract', async () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/select-quote`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ quote_id: quoteId, scheduled_at: tomorrow })
        .expect(200);

      expect(res.body.data.job.status).toBe('confirmed');
      expect(res.body.data.contract.total_price).toBe(300000);
      expect(res.body.data.contract.signed_by_customer_at).toBeDefined();
    });

    it('should reject selecting again (job no longer receiving quotes)', async () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/select-quote`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ quote_id: quoteId, scheduled_at: tomorrow })
        .expect(400);
    });
  });

  // ── 7. Get contract ────────────────────────────────────────────────────────

  describe('GET /jobs/:jobId/contract', () => {
    it('customer can view contract', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/contract`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(res.body.data.total_price).toBe(300000);
    });
  });

  // ── 8. Full execution flow ─────────────────────────────────────────────────

  describe('Job execution lifecycle', () => {
    it('helper: on the way', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}/on-the-way`)
        .set('Authorization', `Bearer ${helperToken}`)
        .expect(200);
      expect(res.body.data.status).toBe('helper_on_the_way');
    });

    it('helper: arrived', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}/arrived`)
        .set('Authorization', `Bearer ${helperToken}`)
        .expect(200);
      expect(res.body.data.status).toBe('helper_arrived');
    });

    it('helper: start job', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}/start`)
        .set('Authorization', `Bearer ${helperToken}`)
        .expect(200);
      expect(res.body.data.status).toBe('in_progress');
    });

    it('helper: complete job with photos', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}/complete`)
        .set('Authorization', `Bearer ${helperToken}`)
        .send({
          completion_photos: [
            'http://minio/completion/before.jpg',
            'http://minio/completion/after.jpg',
          ],
        })
        .expect(200);
      expect(res.body.data.status).toBe('pending_review');
      expect(res.body.data.completion_photos).toHaveLength(2);
    });

    it('customer: approve completion + review', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}/approve`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5, review: 'Làm việc rất sạch sẽ, đúng giờ!' })
        .expect(200);
      expect(res.body.data.status).toBe('completed');
      expect(res.body.data.customer_rating).toBe(5);
    });

    it('should reject invalid transition (completed → in_progress)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}/start`)
        .set('Authorization', `Bearer ${helperToken}`)
        .expect(400);
    });
  });

  // ── 9. Cancel job test ─────────────────────────────────────────────────────

  describe('PATCH /jobs/:jobId/cancel', () => {
    let cancelJobId: string;

    it('should cancel a job in OPEN status', async () => {
      // Create a new job to cancel
      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          service_id: serviceId,
          title: 'Job để hủy',
          description: 'Test cancel',
          address: {
            full_address: '456 Test, Q1, HCM',
            district: 'Quận 1',
            city: 'TP. Hồ Chí Minh',
            location: { type: 'Point', coordinates: [106.7, 10.77] },
          },
        })
        .expect(201);
      cancelJobId = res.body.data._id;

      const cancelRes = await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${cancelJobId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reason: 'Không cần nữa' })
        .expect(200);
      expect(cancelRes.body.data.status).toBe('cancelled');
    });
  });

  // ── 10. Get my jobs (customer) ─────────────────────────────────────────────

  describe('GET /jobs/my', () => {
    it('should return all customer jobs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs/my')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });
});
