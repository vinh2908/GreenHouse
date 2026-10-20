import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { ThrottlerModule } from '@nestjs/throttler';
import { Types } from 'mongoose';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { CustomersModule } from '../src/modules/customers/customers.module';
import { HelpersModule } from '../src/modules/helpers/helpers.module';
import { ServicesModule } from '../src/modules/services/services.module';
import { ServicesService } from '../src/modules/services/services.service';
import { JobsModule } from '../src/modules/jobs/jobs.module';
import { RoutingService } from '../src/modules/jobs/routing.service';
import { ReviewsModule } from '../src/modules/reviews/reviews.module';
import { AdminModule } from '../src/modules/admin/admin.module';
import { AnalyticsModule } from '../src/modules/analytics/analytics.module';
import { FeedbackModule } from '../src/modules/feedback/feedback.module';
import { AiModule } from '../src/modules/ai/ai.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import appConfig from '../src/config/app.config';
import jwtConfig from '../src/config/jwt.config';
const request = require('supertest');

// Never imports AppModule or .env: all data lives in this disposable replica set.
export async function createQaApp() {
  const mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ args: ['--wiredTigerCacheSizeGB', '0.25'] }],
  });
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [appConfig, jwtConfig, () => ({ ai: { provider: 'mock' } })],
      }),
      MongooseModule.forRoot(mongo.getUri()),
      ThrottlerModule.forRoot([{ ttl: 60000, limit: 5000 }]),
      AuthModule,
      UsersModule,
      CustomersModule,
      HelpersModule,
      ServicesModule,
      JobsModule,
      ReviewsModule,
      AdminModule,
      AnalyticsModule,
      FeedbackModule,
      AiModule,
    ],
  })
    .overrideProvider(RoutingService)
    .useValue({
      getRoutesBatch: async () => new Map(),
      getRoute: async () => ({ distance_km: 0, estimated_minutes: 0 }),
    })
    .compile();
  const app = module.createNestApplication({ logger: ['error', 'warn'] });
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: [
      'http://localhost:8085',
      'http://127.0.0.1:8085',
      'http://localhost:3101',
      'http://127.0.0.1:3101',
    ],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.init();
  await app.get(ServicesService).seedDefaultServices();
  const services = (await request(app.getHttpServer()).get('/api/v1/services')).body.data;
  const accounts: Record<string, any> = {};
  for (const [i, role] of ['customer', 'helper', 'admin', 'outsider'].entries()) {
    const phone = `090700000${i}`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        phone,
        email: `qa.${role}@example.com`,
        full_name: `QA ${role}`,
        password: 'QaOnly123!',
      })
      .expect(201);
    const id = res.body.data.user._id;
    await app
      .get(getModelToken('User'))
      .updateOne(
        { _id: id },
        {
          roles:
            role === 'helper'
              ? ['customer', 'helper']
              : role === 'admin'
                ? ['admin']
                : ['customer'],
          active_role: role === 'outsider' ? 'customer' : role,
        },
      );
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone, password: 'QaOnly123!' })
      .expect(200);
    accounts[role] = {
      id,
      phone,
      token: login.body.data.access_token,
      refresh: login.body.data.refresh_token,
    };
  }
  await app
    .get(getModelToken('HelperProfile'))
    .create({
      user_id: new Types.ObjectId(accounts.helper.id),
      service_ids: services.map((s: any) => new Types.ObjectId(s._id)),
      verification_status: 'approved',
      status: 'online',
      location: { type: 'Point', coordinates: [106.701, 10.731] },
      bank_account: {
        bank_name: 'QA Bank',
        account_name: 'QA HELPER',
        account_number: '1234567890',
      },
    });
  return {
    app,
    mongo,
    accounts,
    serviceId: services[0]._id as string,
    close: async () => {
      await app.close();
      await mongo.stop();
    },
  };
}
