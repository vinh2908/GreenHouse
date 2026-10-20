import { getModelToken } from '@nestjs/mongoose';
import { createQaApp } from './qa-app';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { JobsService } from '../src/modules/jobs/jobs.service';
import { AppGateway } from '../src/modules/chat/app.gateway';
import { OtpService } from '../src/modules/auth/otp.service';
import { Types } from 'mongoose';
const request = require('supertest');

describe('QA regression — customer, helper, admin', () => {
  let qa: Awaited<ReturnType<typeof createQaApp>>;
  const api = () => request(qa.app.getHttpServer());
  const auth = (role: string) => `Bearer ${qa.accounts[role].token}`;
  beforeAll(async () => {
    qa = await createQaApp();
  }, 120000);
  afterAll(async () => {
    await qa?.close();
  });
  it.each(['123456', '888888'])('rejects universal OTP %s without an issued code', async code => {
    expect(await qa.app.get(OtpService).verifyOtp(qa.accounts.customer.phone, code, 'reset')).toBe(
      false,
    );
  });
  it('consumes a real OTP only once even for simultaneous requests', async () => {
    const service = qa.app.get(OtpService);
    const code = await service.sendOtp(qa.accounts.customer.phone, 'reset');
    const results = await Promise.all(
      [1, 2].map(() => service.verifyOtp(qa.accounts.customer.phone, code, 'reset')),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  async function booking() {
    const job = await api()
      .post('/api/v1/jobs')
      .set('Authorization', auth('customer'))
      .send({
        service_id: qa.serviceId,
        title: 'QA test job',
        description: 'QA regression test only',
        address: {
          full_address: 'QA address',
          district: 'Quan 7',
          city: 'TP HCM',
          location: { type: 'Point', coordinates: [106.701, 10.731] },
        },
      })
      .expect(201);
    const jobId = job.body.data._id;
    const quote = await api()
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', auth('helper'))
      .send({ labor_cost: 200000, estimated_duration: 60 })
      .expect(201);
    return {
      jobId,
      quoteId: quote.body.data._id,
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    };
  }
  it('rejects expired quotes', async () => {
    const b = await booking();
    await qa.app
      .get(getModelToken('Quote'))
      .updateOne({ _id: b.quoteId }, { expires_at: new Date(0) });
    await api()
      .post(`/api/v1/jobs/${b.jobId}/select-quote`)
      .set('Authorization', auth('customer'))
      .send({ quote_id: b.quoteId, scheduled_at: b.scheduled_at })
      .expect(400);
  });
  it('does not reopen a job when quote submission races with cancellation', async () => {
    const created = await api()
      .post('/api/v1/jobs')
      .set('Authorization', auth('customer'))
      .send({
        service_id: qa.serviceId,
        title: 'QA concurrent cancellation',
        description: 'QA regression only',
        address: {
          full_address: 'QA address',
          district: 'Quan 7',
          city: 'TP HCM',
          location: { type: 'Point', coordinates: [106.701, 10.731] },
        },
      })
      .expect(201);
    const id = created.body.data._id;
    const responses = await Promise.all([
      api()
        .post(`/api/v1/jobs/${id}/quotes`)
        .set('Authorization', auth('helper'))
        .send({ labor_cost: 200000, estimated_duration: 60 }),
      api()
        .patch(`/api/v1/jobs/${id}/cancel`)
        .set('Authorization', auth('customer'))
        .send({ reason: 'QA race' }),
    ]);
    expect(responses[1].status).toBe(200);
    expect([201, 400]).toContain(responses[0].status);
    expect((await qa.app.get(getModelToken('Job')).findById(id)).status).toBe('cancelled');
    expect(
      await qa.app
        .get(getModelToken('Quote'))
        .countDocuments({ job_id: new Types.ObjectId(id), status: 'pending' }),
    ).toBe(0);
  });
  it('rejects quotes on expired jobs', async () => {
    const b = await booking();
    await qa.app.get(getModelToken('Job')).updateOne({ _id: b.jobId }, { expires_at: new Date(0) });
    await api()
      .post(`/api/v1/jobs/${b.jobId}/select-quote`)
      .set('Authorization', auth('customer'))
      .send({ quote_id: b.quoteId, scheduled_at: b.scheduled_at })
      .expect(400);
  });
  it('cancelling a confirmed job also cancels its contract', async () => {
    const b = await booking();
    await api()
      .post(`/api/v1/jobs/${b.jobId}/select-quote`)
      .set('Authorization', auth('customer'))
      .send({ quote_id: b.quoteId, scheduled_at: b.scheduled_at })
      .expect(200);
    await api()
      .patch(`/api/v1/jobs/${b.jobId}/cancel`)
      .set('Authorization', auth('customer'))
      .send({ reason: 'QA cancellation' })
      .expect(200);
    const contract = await qa.app
      .get(getModelToken('Contract'))
      .findOne({ job_id: new Types.ObjectId(b.jobId) });
    expect(contract.status).toBe('cancelled');
  });
  it('rolls back the job and quote when contract creation fails', async () => {
    const b = await booking();
    const contractModel = qa.app.get(getModelToken('Contract'));
    const spy = jest
      .spyOn(contractModel.prototype, 'save')
      .mockRejectedValueOnce(new Error('QA injected storage failure'));
    await expect(
      qa.app.get(JobsService).selectQuote(qa.accounts.customer.id, b.jobId, {
        quote_id: b.quoteId,
        scheduled_at: b.scheduled_at,
      }),
    ).rejects.toThrow();
    spy.mockRestore();
    const job = await qa.app.get(getModelToken('Job')).findById(b.jobId);
    expect(job.helper_id).toBeFalsy();
    expect(job.status).toBe('receiving_quotes');
    expect((await qa.app.get(getModelToken('Quote')).findById(b.quoteId)).status).toBe('pending');
  });
  it('concurrent selection creates only one contract', async () => {
    const b = await booking();
    const responses = await Promise.all(
      [1, 2].map(() =>
        api()
          .post(`/api/v1/jobs/${b.jobId}/select-quote`)
          .set('Authorization', auth('customer'))
          .send({ quote_id: b.quoteId, scheduled_at: b.scheduled_at }),
      ),
    );
    expect(responses.filter(r => r.status === 200)).toHaveLength(1);
    expect(
      await qa.app
        .get(getModelToken('Contract'))
        .countDocuments({ job_id: new Types.ObjectId(b.jobId) }),
    ).toBe(1);
  });
  it('crediting the same job twice does not double the balance', async () => {
    const b = await booking();
    const service = qa.app.get(PaymentsService);
    const before = (await service.getWallet(qa.accounts.helper.id)).balance;
    await service.creditHelper(qa.accounts.helper.id, b.jobId, 100000);
    await service.creditHelper(qa.accounts.helper.id, b.jobId, 100000);
    expect((await service.getWallet(qa.accounts.helper.id)).balance).toBe(before + 100000);
  });
  it('blocks production mock payment', async () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      await api()
        .post('/api/v1/payments/pay')
        .set('Authorization', auth('customer'))
        .send({ job_id: '507f1f77bcf86cd799439011', payment_method: 'mock_card' })
        .expect(403);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
  it('rejects a suspended user from the websocket handshake', async () => {
    const model = qa.app.get(getModelToken('User'));
    await model.updateOne({ _id: qa.accounts.outsider.id }, { status: 'suspended' });
    const client: any = {
      id: 'qa-suspended',
      handshake: { auth: { token: qa.accounts.outsider.token } },
      data: {},
      join: jest.fn(),
      disconnect: jest.fn(),
    };
    await qa.app.get(AppGateway).handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
    await model.updateOne({ _id: qa.accounts.outsider.id }, { status: 'active' });
  });
  it.each([
    '/admin/dashboard',
    '/admin/users',
    '/admin/helpers',
    '/admin/helpers/kyc/pending',
    '/admin/jobs',
    '/reviews/admin/all',
    '/payments/admin/transactions',
    '/feedback/admin',
  ])('denies customers access to %s', async route => {
    await api()
      .get('/api/v1' + route)
      .set('Authorization', auth('customer'))
      .expect(403);
    await api()
      .get('/api/v1' + route)
      .set('Authorization', auth('admin'))
      .expect(200);
  });
  it('does not permit switching into admin role', async () => {
    await api()
      .patch('/api/v1/users/me/role')
      .set('Authorization', auth('customer'))
      .send({ active_role: 'admin' })
      .expect(400);
  });
  it('password reset revokes previous access and refresh tokens', async () => {
    const phone = '0907000008';
    const registered = await api()
      .post('/api/v1/auth/register')
      .send({ phone, full_name: 'QA Reset', email: 'qa.reset@example.com', password: 'QaOnly123!' })
      .expect(201);
    const tokens = registered.body.data;
    const otp = await qa.app.get(OtpService).sendOtp(phone, 'reset');
    await api()
      .post('/api/v1/auth/reset-password')
      .send({ phone, otp, new_password: 'QaChanged123!' })
      .expect(200);
    await api()
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${tokens.access_token}`)
      .expect(401);
    await api()
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: tokens.refresh_token })
      .expect(401);
    await api().post('/api/v1/auth/login').send({ phone, password: 'QaChanged123!' }).expect(200);
  });
  it('feedback is saved, private to its author and manageable by admin', async () => {
    await api()
      .post('/api/v1/feedback')
      .set('Authorization', auth('customer'))
      .send({ message: '            ' })
      .expect(400);
    const res = await api()
      .post('/api/v1/feedback')
      .set('Authorization', auth('customer'))
      .send({ message: 'QA feedback about an unusable button' })
      .expect(201);
    const id = res.body.data._id;
    expect(
      (
        await api().get('/api/v1/feedback/my').set('Authorization', auth('customer'))
      ).body.data.some((f: any) => f._id === id),
    ).toBe(true);
    expect(
      (await api().get('/api/v1/feedback/my').set('Authorization', auth('helper'))).body.data,
    ).toEqual([]);
    await api()
      .patch(`/api/v1/feedback/${id}/status`)
      .set('Authorization', auth('customer'))
      .send({ status: 'resolved' })
      .expect(403);
    await api()
      .patch(`/api/v1/feedback/${id}/status`)
      .set('Authorization', auth('admin'))
      .send({ status: 'resolved' })
      .expect(200);
  });
});
