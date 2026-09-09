import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { PaymentsModule } from '../src/modules/payments/payments.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PaymentsService } from '../src/modules/payments/payments.service';
import appConfig from '../src/config/app.config';
import jwtConfig from '../src/config/jwt.config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');

describe('Payments E2E (Phase 7)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let helperToken: string;
  let helperId: string;
  let customerToken: string;
  let customerId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig, jwtConfig], ignoreEnvFile: true }),
        MongooseModule.forRoot(mongod.getUri()),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
        AuthModule, UsersModule, PaymentsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    // Register helper
    let res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ phone: '0966666666', full_name: 'Helper Pay', password: 'Password123!' });
    helperToken = res.body.data.access_token;
    helperId = res.body.data.user._id;

    // Register customer
    res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ phone: '0977777777', full_name: 'Customer Pay', password: 'Password123!' });
    customerToken = res.body.data.access_token;
    customerId = res.body.data.user._id;
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  describe('Wallet', () => {
    it('GET /payments/wallet - should return wallet with 0 balance', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payments/wallet')
        .set('Authorization', `Bearer ${helperToken}`)
        .expect(200);
      expect(res.body.data.balance).toBe(0);
      expect(res.body.data.total_earned).toBe(0);
    });

    it('GET /payments/transactions - should return empty', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payments/transactions')
        .set('Authorization', `Bearer ${helperToken}`)
        .expect(200);
      expect(res.body.data.transactions).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });
  });

  describe('Mock payment', () => {
    it('POST /payments/pay - mock payment should succeed', async () => {
      const fakeJobId = '507f1f77bcf86cd799439011';
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/pay')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ job_id: fakeJobId, payment_method: 'mock_card' })
        .expect(200);
      // Service returns {transaction, success} with 'success' key
      // TransformInterceptor passes through unchanged when it sees 'success'
      expect(res.body.success).toBe(true);
      expect(res.body.transaction.type).toBe('payment');
      expect(res.body.transaction.status).toBe('success');
    });

    it('should record transaction in history', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payments/transactions')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.transactions[0].type).toBe('payment');
    });
  });

  describe('Helper earnings via service', () => {
    it('should credit helper wallet after job completion', async () => {
      const paymentsService = app.get(PaymentsService);
      const fakeJobId = '507f1f77bcf86cd799439011';
      await paymentsService.creditHelper(helperId, fakeJobId, 255000); // 300k - 15% fee

      const res = await request(app.getHttpServer())
        .get('/api/v1/payments/wallet')
        .set('Authorization', `Bearer ${helperToken}`)
        .expect(200);
      expect(res.body.data.balance).toBe(255000);
      expect(res.body.data.total_earned).toBe(255000);
    });

    it('helper transaction history should show earning', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payments/transactions')
        .set('Authorization', `Bearer ${helperToken}`)
        .expect(200);
      expect(res.body.data.transactions[0].type).toBe('earning');
      expect(res.body.data.transactions[0].amount).toBe(255000);
    });
  });

  describe('Withdrawal', () => {
    it('POST /payments/withdraw - should request withdrawal', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/withdraw')
        .set('Authorization', `Bearer ${helperToken}`)
        .send({ amount: 100000 })
        .expect(201);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.amount).toBe(100000);
    });

    it('wallet balance should be reduced after withdrawal request', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payments/wallet')
        .set('Authorization', `Bearer ${helperToken}`)
        .expect(200);
      expect(res.body.data.balance).toBe(155000); // 255000 - 100000
    });

    it('should reject second withdrawal when pending exists', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/payments/withdraw')
        .set('Authorization', `Bearer ${helperToken}`)
        .send({ amount: 50000 })
        .expect(409);
    });

    it('should reject withdrawal exceeding balance', async () => {
      // Register new helper with 0 balance
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ phone: '0988888888', full_name: 'Broke Helper', password: 'Password123!' });
      const brokeToken = res.body.data.access_token;

      await request(app.getHttpServer())
        .post('/api/v1/payments/withdraw')
        .set('Authorization', `Bearer ${brokeToken}`)
        .send({ amount: 100000 })
        .expect(400);
    });

    it('GET /payments/withdrawals - should list withdrawals', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payments/withdrawals')
        .set('Authorization', `Bearer ${helperToken}`)
        .expect(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].status).toBe('pending');
    });

    it('admin: approve withdrawal via service', async () => {
      const paymentsService = app.get(PaymentsService);
      const withdrawals = await paymentsService.getWithdrawals(helperId);
      const wId = String(withdrawals[0]._id);

      const result = await paymentsService.processWithdrawal(wId, 'approve', 'Duyệt', 'admin-1');
      expect(result.status).toBe('completed');

      // Check total_withdrawn updated
      const wallet = await paymentsService.getWallet(helperId);
      expect(wallet.total_withdrawn).toBe(100000);
    });
  });
});
