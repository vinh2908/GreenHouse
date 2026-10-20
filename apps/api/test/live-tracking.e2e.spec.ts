import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { AppGateway } from '../src/modules/chat/app.gateway';
import { ChatService } from '../src/modules/chat/chat.service';
import { Job, JobSchema } from '../src/modules/jobs/schemas/job.schema';
import { SOCKET_EVENTS } from '@homemate/constants';
import { JobsService } from '../src/modules/jobs/jobs.service';
// Use the application's Socket.IO client, avoiding a second dependency/version.
const { io } = require('../../mobile/node_modules/socket.io-client');

describe('Live GPS through real Socket.IO and isolated MongoDB', () => {
  let mongo: MongoMemoryServer;
  let app: any, jobs: any, jwt: JwtService, url: string, jobId: string;
  const customer = new Types.ObjectId(),
    helper = new Types.ObjectId(),
    outsider = new Types.ObjectId();
  const sockets: any[] = [];
  const next = (socket: any, event: string) =>
    new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, listener);
        reject(Error(`Timeout: ${event}`));
      }, 5000);
      const listener = (value: any) => {
        clearTimeout(timer);
        resolve(value);
      };
      socket.once(event, listener);
    });
  const connect = async (user: Types.ObjectId) => {
    const socket = io(url, {
      transports: ['websocket'],
      auth: {
        token: jwt.sign({
          sub: String(user),
          roles: [user.equals(customer) ? 'customer' : 'helper'],
        }),
      },
    });
    sockets.push(socket);
    await next(socket, 'connect');
    return socket;
  };
  const join = async (socket: any) => {
    const joined = next(socket, 'joined');
    socket.emit('join:job', { job_id: jobId });
    await joined;
  };
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({
      instance: { args: ['--wiredTigerCacheSizeGB', '0.25'] },
    });
    const module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.getUri()),
        MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }]),
        JwtModule.register({ secret: 'isolated-map-test-only' }),
      ],
      providers: [
        AppGateway,
        { provide: ChatService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => 'isolated-map-test-only' } },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
    jwt = app.get(JwtService);
    jobs = app.get(getModelToken(Job.name));
  }, 120000);
  beforeEach(async () => {
    const job = await jobs.create({
      customer_id: customer,
      helper_id: helper,
      service_id: new Types.ObjectId(),
      title: 'Isolated GPS test',
      description: 'No production data',
      status: 'helper_on_the_way',
      address: {
        full_address: 'Test',
        district: 'Test',
        city: 'Test',
        location: { type: 'Point', coordinates: [108.15, 16.07] },
      },
    });
    jobId = String(job._id);
  });
  afterEach(() => {
    sockets.splice(0).forEach(socket => socket.disconnect());
  });
  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });
  const point = () => ({
    job_id: jobId,
    lat: 16.06,
    lng: 108.14,
    accuracy: 8,
    recorded_at: Date.now(),
  });

  it('delivers the helper GPS with correct job, helper, coordinates and captured time', async () => {
    const c = await connect(customer),
      h = await connect(helper);
    await join(c);
    const received = next(c, SOCKET_EVENTS.HELPER_LOCATION_UPDATE),
      fix = point();
    h.emit('helper:location', fix);
    const event = await received;
    expect(event).toMatchObject({
      job_id: jobId,
      helper_id: String(helper),
      location: {
        lat: fix.lat,
        lng: fix.lng,
        recorded_at: fix.recorded_at,
      },
    });
    expect((await jobs.findById(jobId)).live_helper_location.lat).toBe(fix.lat);
  });
  it('replays the last GPS on late join and reconnect', async () => {
    const h = await connect(helper),
      c = await connect(customer);
    await join(c);
    const delivered = next(c, SOCKET_EVENTS.HELPER_LOCATION_UPDATE);
    h.emit('helper:location', point());
    const first = await delivered;
    c.disconnect();
    const late = await connect(customer),
      replay = next(late, SOCKET_EVENTS.HELPER_LOCATION_UPDATE);
    await join(late);
    expect((await replay).location.recorded_at).toBe(first.location.recorded_at);
  });
  it.each([
    ['invalid latitude', { lat: 91 }],
    ['invalid longitude', { lng: 181 }],
    ['string latitude', { lat: '16' }],
    ['stale GPS', { recorded_at: Date.now() - 60_000 }],
    ['future GPS', { recorded_at: Date.now() + 3600_000 }],
    ['inaccurate GPS', { accuracy: 400 }],
    ['missing capture time', { recorded_at: undefined }],
  ])('rejects %s without storing it', async (_, override) => {
    const h = await connect(helper),
      rejected = next(h, 'exception');
    h.emit('helper:location', { ...point(), ...override });
    await rejected;
    expect((await jobs.findById(jobId)).live_helper_location).toBeUndefined();
  });
  it('accepts coordinate zero (no truthiness fallback)', async () => {
    const c = await connect(customer),
      h = await connect(helper);
    await join(c);
    const received = next(c, SOCKET_EVENTS.HELPER_LOCATION_UPDATE);
    h.emit('helper:location', { ...point(), lat: 0, lng: 0 });
    expect((await received).location).toMatchObject({ lat: 0, lng: 0 });
  });
  it('rejects outsiders joining or publishing another job GPS', async () => {
    const attacker = await connect(outsider);
    let rejected = next(attacker, 'exception');
    attacker.emit('join:job', { job_id: jobId });
    await rejected;
    rejected = next(attacker, 'exception');
    attacker.emit('helper:location', point());
    await rejected;
    expect((await jobs.findById(jobId)).live_helper_location).toBeUndefined();
  });
  it('rejects customer impersonating the helper', async () => {
    const c = await connect(customer),
      rejected = next(c, 'exception');
    c.emit('helper:location', point());
    await rejected;
    expect((await jobs.findById(jobId)).live_helper_location).toBeUndefined();
  });
  it('does not overwrite a newer GPS fix with an older packet', async () => {
    const c = await connect(customer),
      h = await connect(helper);
    await join(c);
    const received = next(c, SOCKET_EVENTS.HELPER_LOCATION_UPDATE),
      fix = point();
    h.emit('helper:location', fix);
    await received;
    const rejected = next(h, 'exception');
    h.emit('helper:location', { ...fix, lat: 15, recorded_at: fix.recorded_at - 1 });
    await rejected;
    expect((await jobs.findById(jobId)).live_helper_location.lat).toBe(fix.lat);
  });
  it('does not replay expired GPS or accept GPS after arrival', async () => {
    await jobs.updateOne(
      { _id: jobId },
      {
        $set: {
          live_helper_location: {
            lat: 16,
            lng: 108,
            helper_id: String(helper),
            recorded_at: Date.now() - 180_000,
          },
        },
      },
    );
    const c = await connect(customer);
    const events: any[] = [];
    c.on(SOCKET_EVENTS.HELPER_LOCATION_UPDATE, (event: any) => events.push(event));
    await join(c);
    await jobs.updateOne({ _id: jobId }, { $set: { status: 'helper_arrived' } });
    const h = await connect(helper),
      rejected = next(h, 'exception');
    h.emit('helper:location', point());
    await rejected;
    expect(events).toHaveLength(0);
  });
});

describe('Edited meeting location never falls back to synthetic coordinates', () => {
  const owner = new Types.ObjectId();
  function fixture(coordinates?: number[]) {
    const job: any = {
      customer_id: owner,
      status: 'confirmed',
      address: {
        full_address: 'Test',
        district: 'Test',
        city: 'Test',
        location: coordinates ? { type: 'Point', coordinates } : undefined,
      },
      save: jest.fn().mockResolvedValue(undefined),
    };
    const service: any = Object.create(JobsService.prototype);
    service.jobModel = { findById: () => ({ exec: async () => job }) };
    service.addEvent = jest.fn();
    service.emitJobStatusChange = jest.fn();
    return { service, job };
  }
  it('rejects missing coordinates instead of placing the job in Ho Chi Minh City', async () => {
    const { service, job } = fixture();
    await expect(
      service.updateJob(String(owner), 'test', { address: { notes: 'edited' } }),
    ).rejects.toThrow('tọa độ');
    expect(job.save).not.toHaveBeenCalled();
  });
  it('rejects invalid coordinates', async () => {
    const { service, job } = fixture([108, 16]);
    await expect(
      service.updateJob(String(owner), 'test', {
        address: { location: { coordinates: [999, 16] } },
      }),
    ).rejects.toThrow('tọa độ');
    expect(job.save).not.toHaveBeenCalled();
  });
  it('preserves a valid pin on note edits and broadcasts a newly confirmed pin', async () => {
    const { service, job } = fixture([108, 16]);
    await service.updateJob(String(owner), 'test', { address: { notes: 'entrance' } });
    expect(job.address.location.coordinates).toEqual([108, 16]);
    await service.updateJob(String(owner), 'test', {
      address: { location: { coordinates: [108.14, 16.06] } },
    });
    expect(job.address.location.coordinates).toEqual([108.14, 16.06]);
    expect(service.emitJobStatusChange).toHaveBeenCalledTimes(2);
  });
});
