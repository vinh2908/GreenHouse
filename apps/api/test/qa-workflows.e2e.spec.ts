import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { createQaApp } from './qa-app';
import { JobsService } from '../src/modules/jobs/jobs.service';
import { ChatService } from '../src/modules/chat/chat.service';
import { AppGateway } from '../src/modules/chat/app.gateway';
import { PaymentsService } from '../src/modules/payments/payments.service';
const request = require('supertest');
const { io } = require('socket.io-client');

describe('QA extended workflows: SOS, admin actions, live sockets', () => {
  let qa: Awaited<ReturnType<typeof createQaApp>>;
  let baseUrl: string;
  let emergencyId: string;
  const sockets: any[] = [];
  const api = () => request(qa.app.getHttpServer());
  const auth = (role: string) => `Bearer ${qa.accounts[role].token}`;
  const address = {
    full_address: 'QA isolated address',
    district: 'Quan 7',
    city: 'TP HCM',
    location: { type: 'Point', coordinates: [106.701, 10.731] },
  };
  beforeAll(async () => {
    qa = await createQaApp();
    await qa.app.listen(0, '127.0.0.1');
    baseUrl = await qa.app.getUrl();
    const service = await qa.app.get(getModelToken('Service')).findById(qa.serviceId).lean();
    delete service._id;
    emergencyId = String(
      (
        await qa.app
          .get(getModelToken('Service'))
          .create({ ...service, slug: 'electrician', name: 'QA emergency electrical service' })
      )._id,
    );
    await qa.app
      .get(getModelToken('HelperProfile'))
      .updateOne(
        { user_id: new Types.ObjectId(qa.accounts.helper.id) },
        { $addToSet: { service_ids: new Types.ObjectId(emergencyId) } },
      );
  }, 120000);
  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });
  afterAll(async () => {
    await qa?.close();
  });
  async function sos() {
    const result = await api()
      .post('/api/v1/jobs/sos')
      .set('Authorization', auth('customer'))
      .send({
        category: 'electrician',
        title: 'QA SOS',
        description: 'Isolated emergency workflow',
        address,
        surcharge: 0,
      })
      .expect(201);
    return result.body.data._id as string;
  }
  async function online() {
    await qa.app
      .get(getModelToken('HelperProfile'))
      .updateOne(
        { user_id: new Types.ObjectId(qa.accounts.helper.id) },
        { status: 'online', verification_status: 'approved' },
      );
  }
  async function connect(role: string) {
    const socket = io(baseUrl, {
      transports: ['websocket'],
      auth: { token: qa.accounts[role].token },
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    return socket;
  }
  it('rejects unsupported and unconfigured SOS services', async () => {
    await api()
      .post('/api/v1/jobs/sos')
      .set('Authorization', auth('customer'))
      .send({ category: 'unknown', title: 'QA', description: 'QA', address })
      .expect(400);
    await api()
      .post('/api/v1/jobs/sos')
      .set('Authorization', auth('customer'))
      .send({ category: 'locksmith', title: 'QA', description: 'QA', address })
      .expect(400);
  });
  it('SOS acceptance preserves zero surcharge, creates one contract, and marks helper busy', async () => {
    await online();
    const id = await sos();
    const result = await api()
      .post(`/api/v1/jobs/${id}/sos-accept`)
      .set('Authorization', auth('helper'))
      .expect(200);
    expect(result.body.data.job.status).toBe('confirmed');
    expect(result.body.data.contract.materials_cost).toBe(0);
    expect(
      (
        await qa.app
          .get(getModelToken('HelperProfile'))
          .findOne({ user_id: new Types.ObjectId(qa.accounts.helper.id) })
      ).status,
    ).toBe('busy');
    await api()
      .patch(`/api/v1/jobs/${id}/cancel`)
      .set('Authorization', auth('customer'))
      .send({ reason: 'QA cleanup' })
      .expect(200);
  });
  it('one helper cannot accept two SOS jobs concurrently', async () => {
    await online();
    const ids = await Promise.all([sos(), sos()]);
    const results = await Promise.all(
      ids.map(id =>
        api().post(`/api/v1/jobs/${id}/sos-accept`).set('Authorization', auth('helper')),
      ),
    );
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
  });
  it('SOS contract failure rolls back job claim, quote, and helper status', async () => {
    await online();
    const id = await sos();
    const model = qa.app.get(getModelToken('Contract'));
    const spy = jest.spyOn(model.prototype, 'save').mockRejectedValueOnce(new Error('QA failure'));
    try {
      await expect(qa.app.get(JobsService).acceptSosJob(qa.accounts.helper.id, id)).rejects.toThrow(
        'QA failure',
      );
    } finally {
      spy.mockRestore();
    }
    expect((await qa.app.get(getModelToken('Job')).findById(id)).helper_id).toBeFalsy();
    expect(
      await qa.app.get(getModelToken('Quote')).countDocuments({ job_id: new Types.ObjectId(id) }),
    ).toBe(0);
    expect(
      (
        await qa.app
          .get(getModelToken('HelperProfile'))
          .findOne({ user_id: new Types.ObjectId(qa.accounts.helper.id) })
      ).status,
    ).toBe('online');
  });
  it('admin suspension removes access; activation restores login; admin cannot be suspended', async () => {
    const id = qa.accounts.outsider.id;
    await api()
      .patch(`/api/v1/admin/users/${id}/suspend`)
      .set('Authorization', auth('customer'))
      .send({ reason: 'QA' })
      .expect(403);
    await api()
      .patch(`/api/v1/admin/users/${id}/suspend`)
      .set('Authorization', auth('admin'))
      .send({ reason: 'QA' })
      .expect(200);
    await api().get('/api/v1/users/me').set('Authorization', auth('outsider')).expect(401);
    await api()
      .patch(`/api/v1/admin/users/${id}/activate`)
      .set('Authorization', auth('admin'))
      .expect(200);
    await api()
      .post('/api/v1/auth/login')
      .send({ phone: qa.accounts.outsider.phone, password: 'QaOnly123!' })
      .expect(200);
    await api()
      .patch(`/api/v1/admin/users/${qa.accounts.admin.id}/suspend`)
      .set('Authorization', auth('admin'))
      .send({ reason: 'QA' })
      .expect(400);
  });
  it('admin KYC rejection prevents quotes until approved', async () => {
    await api()
      .patch(`/api/v1/admin/helpers/${qa.accounts.helper.id}/kyc/reject`)
      .set('Authorization', auth('admin'))
      .send({ reason: 'QA rejected' })
      .expect(200);
    await api().get('/api/v1/jobs/available').set('Authorization', auth('helper')).expect(403);
    await api()
      .patch(`/api/v1/admin/helpers/${qa.accounts.helper.id}/kyc/approve`)
      .set('Authorization', auth('admin'))
      .expect(200);
    await api().get('/api/v1/jobs/available').set('Authorization', auth('helper')).expect(200);
  });
  it.each(['users', 'helpers', 'jobs'])(
    'admin %s search treats special characters as text and validates pagination',
    async resource => {
      await api()
        .get(`/api/v1/admin/${resource}`)
        .query({ search: '[' })
        .set('Authorization', auth('admin'))
        .expect(200);
      await api()
        .get(`/api/v1/admin/${resource}`)
        .query({ page: -1 })
        .set('Authorization', auth('admin'))
        .expect(400);
      await api()
        .get(`/api/v1/admin/${resource}`)
        .query({ limit: 100000 })
        .set('Authorization', auth('admin'))
        .expect(400);
    },
  );
  it('helper search total reflects filtered results', async () => {
    const result = await api()
      .get('/api/v1/admin/helpers')
      .query({ search: 'no-such-helper' })
      .set('Authorization', auth('admin'))
      .expect(200);
    expect(result.body.data.helpers).toEqual([]);
    expect(result.body.data.total).toBe(0);
  });
  it('withdrawal ledger failure rolls back both the hold and withdrawal record', async () => {
    const payments = qa.app.get(PaymentsService);
    await payments.creditHelper(qa.accounts.helper.id, new Types.ObjectId().toHexString(), 400000);
    const before = (await payments.getWallet(qa.accounts.helper.id)).balance;
    const ledger = qa.app.get(getModelToken('Transaction'));
    const spy = jest
      .spyOn(ledger.prototype, 'save')
      .mockRejectedValueOnce(new Error('QA ledger failure'));
    try {
      await expect(payments.requestWithdrawal(qa.accounts.helper.id, 100000)).rejects.toThrow(
        'QA ledger failure',
      );
    } finally {
      spy.mockRestore();
    }
    expect((await payments.getWallet(qa.accounts.helper.id)).balance).toBe(before);
    expect(await payments.getWithdrawals(qa.accounts.helper.id)).toHaveLength(0);
  });
  it('parallel withdrawal requests reserve money only once and reject refunds only once', async () => {
    const payments = qa.app.get(PaymentsService);
    const before = (await payments.getWallet(qa.accounts.helper.id)).balance;
    const responses = await Promise.all(
      [1, 2].map(() =>
        api()
          .post('/api/v1/payments/withdraw')
          .set('Authorization', auth('helper'))
          .send({ amount: 100000 }),
      ),
    );
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect((await payments.getWallet(qa.accounts.helper.id)).balance).toBe(before - 100000);
    const id = responses.find(r => r.status === 201)!.body.data._id;
    const ledger = qa.app.get(getModelToken('Transaction'));
    const spy = jest
      .spyOn(ledger.prototype, 'save')
      .mockRejectedValueOnce(new Error('QA refund failure'));
    try {
      await expect(
        payments.processWithdrawal(id, 'reject', 'QA', qa.accounts.admin.id),
      ).rejects.toThrow('QA refund failure');
    } finally {
      spy.mockRestore();
    }
    expect((await payments.getWallet(qa.accounts.helper.id)).balance).toBe(before - 100000);
    expect((await qa.app.get(getModelToken('Withdrawal')).findById(id)).status).toBe('pending');
    const processed = await Promise.all(
      [1, 2].map(() =>
        api()
          .patch(`/api/v1/payments/admin/withdrawals/${id}`)
          .set('Authorization', auth('admin'))
          .send({ action: 'reject', admin_note: 'QA' }),
      ),
    );
    expect(processed.map(r => r.status).sort()).toEqual([200, 400]);
    expect((await payments.getWallet(qa.accounts.helper.id)).balance).toBe(before);
  });
  it('chat rejects blank content and forged system messages', async () => {
    const conv = await qa.app
      .get(ChatService)
      .getOrCreateConversation(new Types.ObjectId().toHexString(), [
        qa.accounts.customer.id,
        qa.accounts.helper.id,
      ]);
    for (const body of [{ content: '   ' }, { content: 'forged', type: 'system' }]) {
      await api()
        .post(`/api/v1/chat/conversations/${conv._id}/messages`)
        .set('Authorization', auth('customer'))
        .send(body)
        .expect(400);
    }
  });
  it('a live socket receives a chat message once even when in chat and personal rooms', async () => {
    const conv = await qa.app
      .get(ChatService)
      .getOrCreateConversation(new Types.ObjectId().toHexString(), [
        qa.accounts.customer.id,
        qa.accounts.helper.id,
      ]);
    const socket = await connect('helper');
    await new Promise(resolve => {
      socket.once('joined', resolve);
      socket.emit('join:conversation', { conversation_id: String(conv._id) });
    });
    const received: any[] = [];
    socket.on('chat:new_message', (value: any) => received.push(value));
    await api()
      .post(`/api/v1/chat/conversations/${conv._id}/messages`)
      .set('Authorization', auth('customer'))
      .send({ content: 'QA single event' })
      .expect(201);
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(received).toHaveLength(1);
  });
  it('suspended users cannot send over an already connected socket', async () => {
    const conv = await qa.app
      .get(ChatService)
      .getOrCreateConversation(new Types.ObjectId().toHexString(), [
        qa.accounts.customer.id,
        qa.accounts.outsider.id,
      ]);
    const socket = await connect('outsider');
    await api()
      .patch(`/api/v1/admin/users/${qa.accounts.outsider.id}/suspend`)
      .set('Authorization', auth('admin'))
      .send({ reason: 'QA socket revocation' })
      .expect(200);
    socket.emit('chat:send', { conversation_id: String(conv._id), content: 'Must not be saved' });
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(
      await qa.app.get(getModelToken('Message')).countDocuments({ conversation_id: conv._id }),
    ).toBe(0);
    await api()
      .patch(`/api/v1/admin/users/${qa.accounts.outsider.id}/activate`)
      .set('Authorization', auth('admin'))
      .expect(200);
  });
});
