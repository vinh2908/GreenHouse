import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import appConfig from '../src/config/app.config';
import jwtConfig from '../src/config/jwt.config';

describe('Auth E2E', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let accessToken: string;
  let refreshToken: string;
  let capturedOtp: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [appConfig, jwtConfig],
          ignoreEnvFile: true,
        }),
        MongooseModule.forRoot(mongoUri),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
        PassportModule,
        JwtModule.register({}),
        AuthModule,
        UsersModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  // ── Register ──────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('should register successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ phone: '0901234567', full_name: 'Test User', password: 'Password123!' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.phone).toBe('0901234567');
      expect(res.body.data.access_token).toBeDefined();
      expect(res.body.data.refresh_token).toBeDefined();
      expect(res.body.data.user.password_hash).toBeUndefined();

      accessToken = res.body.data.access_token;
      refreshToken = res.body.data.refresh_token;
    });

    it('should reject duplicate phone', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ phone: '0901234567', full_name: 'Another User', password: 'Password123!' })
        .expect(409);
    });

    it('should reject invalid phone', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ phone: '12345', full_name: 'Test', password: 'Password123!' })
        .expect(400);
    });

    it('should reject short password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ phone: '0901234568', full_name: 'Test', password: 'short' })
        .expect(400);
    });
  });

  // ── Login ─────────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('should login successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ phone: '0901234567', password: 'Password123!' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.access_token).toBeDefined();
      expect(res.body.data.user.password_hash).toBeUndefined();
      accessToken = res.body.data.access_token;
      refreshToken = res.body.data.refresh_token;
    });

    it('should reject wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ phone: '0901234567', password: 'WrongPassword!' })
        .expect(401);
    });

    it('should reject non-existent phone', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ phone: '0909999999', password: 'Password123!' })
        .expect(401);
    });
  });

  // ── Auth Me ───────────────────────────────────────────────────────────────

  describe('GET /api/v1/auth/me', () => {
    it('should return user info with valid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.phone).toBe('0901234567');
    });

    it('should reject without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('should reject with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);
    });
  });

  // ── Refresh Token ─────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('should issue new tokens with valid refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(200);

      expect(res.body.data.access_token).toBeDefined();
      expect(res.body.data.refresh_token).toBeDefined();
    });

    it('should reject invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: 'bad_token' })
        .expect(401);
    });
  });

  // ── OTP ───────────────────────────────────────────────────────────────────

  describe('OTP flow', () => {
    it('should send OTP for existing user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/send')
        .send({ phone: '0901234567' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should reject OTP send for non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/send')
        .send({ phone: '0909999999' })
        .expect(400);
    });

    it('should reject wrong OTP', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '0901234567', otp: '000000' })
        .expect(400);
    });
  });

  // ── Users/Me ──────────────────────────────────────────────────────────────

  describe('GET /api/v1/users/me', () => {
    it('should return full user profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.phone).toBe('0901234567');
      expect(res.body.data.roles).toContain('customer');
      expect(res.body.data.active_role).toBe('customer');
    });
  });

  describe('PATCH /api/v1/users/me', () => {
    it('should update full_name', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ full_name: 'Updated Name' })
        .expect(200);

      expect(res.body.data.full_name).toBe('Updated Name');
    });
  });

  // ── Forgot / Reset Password ───────────────────────────────────────────────

  describe('Password reset flow', () => {
    it('forgot-password should not reveal if phone exists', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ phone: '0901234567' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('reset-password should fail with wrong OTP', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ phone: '0901234567', otp: '999999', new_password: 'NewPass123!' })
        .expect(400);
    });
  });
});
