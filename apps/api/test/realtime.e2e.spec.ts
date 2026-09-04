import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import { ChatModule } from '../src/modules/chat/chat.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { ChatService } from '../src/modules/chat/chat.service';
import appConfig from '../src/config/app.config';
import jwtConfig from '../src/config/jwt.config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');

describe('Realtime E2E (Phase 6)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let userAToken: string;
  let userAId: string;
  let userBToken: string;
  let userBId: string;
  let conversationId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig, jwtConfig], ignoreEnvFile: true }),
        MongooseModule.forRoot(mongod.getUri()),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
        AuthModule, UsersModule, NotificationsModule, ChatModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    // Register two users
    let res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ phone: '0933333333', full_name: 'User A', password: 'Password123!' });
    userAToken = res.body.data.access_token;
    userAId = res.body.data.user._id;

    res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ phone: '0944444444', full_name: 'User B', password: 'Password123!' });
    userBToken = res.body.data.access_token;
    userBId = res.body.data.user._id;
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  // ── Notifications ──────────────────────────────────────────────────────────

  describe('Notifications', () => {
    it('GET /notifications - should return empty initially', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('GET /notifications/unread-count - should return 0', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);
      expect(res.body.data.count).toBe(0);
    });

    it('should create notification via service and retrieve it', async () => {
      const notifService = app.get(NotificationsService);
      await notifService.create({
        userId: userAId,
        type: 'test',
        title: 'Test notification',
        body: 'This is a test',
        payload: { job_id: 'abc123' },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('Test notification');
      expect(res.body.data[0].is_read).toBe(false);

      // Unread count should be 1
      const countRes = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${userAToken}`);
      expect(countRes.body.data.count).toBe(1);
    });

    it('PATCH /notifications/:id/read - should mark as read', async () => {
      // Get notification id
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userAToken}`);
      const notifId = listRes.body.data[0]._id;

      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notifId}/read`)
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      const countRes = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${userAToken}`);
      expect(countRes.body.data.count).toBe(0);
    });

    it('PATCH /notifications/read-all - should mark all read', async () => {
      const notifService = app.get(NotificationsService);
      // Create 3 more
      await Promise.all([
        notifService.create({ userId: userAId, type: 'a', title: 'N1', body: 'B1' }),
        notifService.create({ userId: userAId, type: 'b', title: 'N2', body: 'B2' }),
        notifService.create({ userId: userAId, type: 'c', title: 'N3', body: 'B3' }),
      ]);

      await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      const countRes = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${userAToken}`);
      expect(countRes.body.data.count).toBe(0);
    });
  });

  // ── Chat ───────────────────────────────────────────────────────────────────

  describe('Chat', () => {
    const fakeJobId = '507f1f77bcf86cd799439011';

    it('GET /chat/conversations - should return empty initially', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('should create conversation via service and retrieve it', async () => {
      const chatService = app.get(ChatService);
      const conv = await chatService.getOrCreateConversation(fakeJobId, [userAId, userBId]);
      conversationId = String(conv._id);
      expect(conversationId).toBeDefined();
    });

    it('GET /chat/conversations - should return 1 conversation', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);
      expect(res.body.data.length).toBe(1);
    });

    it('POST /chat/conversations/:id/messages - User A sends message', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ content: 'Xin chào! Tôi sẽ đến lúc 8 giờ sáng.' })
        .expect(201);
      expect(res.body.data.content).toBe('Xin chào! Tôi sẽ đến lúc 8 giờ sáng.');
    });

    it('POST /chat/conversations/:id/messages - User B replies', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ content: 'Được, tôi sẽ chờ bạn.' })
        .expect(201);
    });

    it('GET /chat/conversations/:id/messages - should return 2 messages', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);
      expect(res.body.data.length).toBe(2);
      // Messages returned oldest first
      expect(res.body.data[0].content).toBe('Xin chào! Tôi sẽ đến lúc 8 giờ sáng.');
    });

    it('POST /chat/conversations/:id/read - mark read', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/chat/conversations/${conversationId}/read`)
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(200);
    });

    it('should reject non-participant from accessing conversation', async () => {
      // Register a third user
      const res3 = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ phone: '0955555555', full_name: 'User C', password: 'Password123!' });
      const userCToken = res3.body.data.access_token;

      await request(app.getHttpServer())
        .get(`/api/v1/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userCToken}`)
        .expect(403);
    });
  });
});
