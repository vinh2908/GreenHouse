import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { CustomersModule } from '../src/modules/customers/customers.module';
import { HelpersModule } from '../src/modules/helpers/helpers.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import appConfig from '../src/config/app.config';
import jwtConfig from '../src/config/jwt.config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');

describe('Profiles E2E (Phase 3)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let customerToken: string;
  let helperToken: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig, jwtConfig], ignoreEnvFile: true }),
        MongooseModule.forRoot(mongod.getUri()),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
        AuthModule,
        UsersModule,
        CustomersModule,
        HelpersModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    // Register + login customer
    let res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ phone: '0901111111', full_name: 'Customer Test', password: 'Password123!' });
    customerToken = res.body.data.access_token;

    // Register + login helper
    res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ phone: '0902222222', full_name: 'Helper Test', password: 'Password123!' });
    helperToken = res.body.data.access_token;
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  // ── Customer profile ──────────────────────────────────────────────────────

  describe('Customer Profile', () => {
    it('GET /customers/me/profile - should return profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers/me/profile')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(res.body.data.addresses).toEqual([]);
    });

    it('POST /customers/me/addresses - should add address', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/customers/me/addresses')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          label: 'Nhà',
          full_address: '123 Nguyễn Văn Linh, Quận 7, TP.HCM',
          district: 'Quận 7',
          city: 'TP. Hồ Chí Minh',
          location: { type: 'Point', coordinates: [106.6297, 10.7342] },
        })
        .expect(201);
      expect(res.body.data.addresses).toHaveLength(1);
      expect(res.body.data.addresses[0].is_default).toBe(true);
    });

    it('GET /customers/me/addresses - should return 1 address', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers/me/addresses')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('DELETE /customers/me/addresses/0 - should delete address', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/customers/me/addresses/0')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/api/v1/customers/me/addresses')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.body.data).toHaveLength(0);
    });
  });

  // ── Helper profile ────────────────────────────────────────────────────────

  describe('Helper Profile', () => {
    it('GET /helpers/me/profile - should return empty profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/helpers/me/profile')
        .set('Authorization', `Bearer ${helperToken}`)
        .expect(200);
      expect(res.body.data.verification_status).toBe('unsubmitted');
      expect(res.body.data.status).toBe('offline');
    });

    it('PATCH /helpers/me/profile - should update profile', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/helpers/me/profile')
        .set('Authorization', `Bearer ${helperToken}`)
        .send({ bio: 'Tôi có 3 năm kinh nghiệm', years_experience: 3, skills: ['don-dep'] })
        .expect(200);
      expect(res.body.data.bio).toBe('Tôi có 3 năm kinh nghiệm');
      expect(res.body.data.years_experience).toBe(3);
    });

    it('PATCH /helpers/me/status ONLINE - should fail if not verified', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/helpers/me/status')
        .set('Authorization', `Bearer ${helperToken}`)
        .send({ status: 'online' })
        .expect(400);
    });

    it('POST /helpers/me/kyc - should submit KYC', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/helpers/me/kyc')
        .set('Authorization', `Bearer ${helperToken}`)
        .send({
          id_card_number: '0123456789',
          id_card_front: 'http://minio/id-cards/front.jpg',
          id_card_back: 'http://minio/id-cards/back.jpg',
          selfie_photo: 'http://minio/id-cards/selfie.jpg',
        })
        .expect(201);
      expect(res.body.data.verification_status).toBe('pending');
      expect(res.body.data.id_card_number).toBe('0123456789');
    });

    it('PATCH /helpers/me/status ONLINE - should still fail (pending, not approved)', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/helpers/me/status')
        .set('Authorization', `Bearer ${helperToken}`)
        .send({ status: 'online' })
        .expect(400);
    });

    it('PATCH /helpers/me/location - should update location', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/helpers/me/location')
        .set('Authorization', `Bearer ${helperToken}`)
        .send({ coordinates: [106.6297, 10.7342] })
        .expect(204);
    });

    it('PUT /helpers/me/bank-account - should set bank account', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/helpers/me/bank-account')
        .set('Authorization', `Bearer ${helperToken}`)
        .send({
          bank_name: 'Vietcombank',
          account_number: '0123456789',
          account_name: 'HELPER TEST',
        })
        .expect(200);
      expect(res.body.data.bank_account.bank_name).toBe('Vietcombank');
    });
  });
});
