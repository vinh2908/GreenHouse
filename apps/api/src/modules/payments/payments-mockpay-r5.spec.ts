/**
 * R5-B5e: mockPayJob hangs on production (no server response within the
 * ~35s client timeout) for a PENDING_REVIEW job with a contract.
 *
 * ROOT CAUSE — VERIFIED EMPIRICALLY (driver-level probe, real mongod 8.2.6
 * single-node replica set): `executePaymentFlow` runs inside
 * `session.withTransaction`. Inside it, `getTotalPaidForJob(jobId)` is
 * called WITHOUT the session, and that method does
 * `jobModel.updateOne({_id}, {$set: {paid_amount, refunded_amount}})` —
 * also WITHOUT the session — writing the SAME job document the flow later
 * writes INSIDE the transaction. The outside write bumps `updated_at`
 * (Job schema has timestamps), so the in-transaction write hits a MongoDB
 * WriteConflict (TransientTransactionError) and `withTransaction` RETRIES
 * the whole callback — and every retry repeats the same conflicting outside
 * write. Probe result: 4,844 retries in 30s, document still UNPAID, never
 * completes. The mongodb driver retries TransientTransactionError for up to
 * 120s (MAX_TIMEOUT in mongodb@6.20.0 sessions.js), far past the client's
 * ~35s timeout, so the request never answers and the PROCESSING→UNPAID
 * reset never runs in time. The same pattern exists for 'wallet' payments
 * via `getOrCreateWallet` (no session) followed by the in-transaction
 * wallet debit on the same wallet document.
 *
 * FIX: thread the session through every read/write inside the flow
 * (getTotalPaidForJob + its sync write, getOrCreateWallet, debitWallet),
 * bound `withTransaction` with an explicit timeoutMS so any future
 * transient retry loop fails fast with a clear error, and make the
 * PROCESSING→UNPAID reset retry once + log loudly.
 *
 * HARNESS NOTE: mongodb-memory-server's MongoMemoryReplSet cannot be used
 * here — its bundled mongodb@7.6.0 driver fails the handshake against the
 * cached mongod 8.2.6 ("Missing required sub-document 'driver' in the
 * client metadata document") while starting the replica set. This spec
 * therefore starts the same cached mongod binary directly as a single-node
 * replica set and drives it with the app's own mongoose (driver 6.20),
 * which handshakes fine.
 *
 * B5e-1 FAILS on old code (mockPayJob still running after 20s, sync
 * updateOne called thousands of times) and PASSES after the fix (resolves
 * in well under a second, job PAID, sync write runs at most once,
 * in-session). B5e-2 is the same proof for a real 'wallet' payment
 * (wallet actually debited). B5e-3 guards the reset: a fast failure
 * leaves the job UNPAID.
 */
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import mongoose, { Types } from 'mongoose';
import { PaymentsService } from './payments.service';
import {
  Wallet,
  WalletSchema,
  Transaction,
  TransactionSchema,
  Withdrawal,
  WithdrawalSchema,
} from './schemas/payment.schema';
import { Job, JobSchema, Contract, ContractSchema } from '../jobs/schemas/job.schema';
import { PaymentStatus, JobStatus } from '@homemate/types';

jest.setTimeout(90000);

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Cached mongod binary (same one mongodb-memory-server uses).
const MONGOD = `${process.env.HOME}/.cache/mongodb-binaries/mongod-x64-ubuntu-8.2.6`;
const DBPATH = '/tmp/gh-r5-b5e-mongo';
const PORT = 27118;

async function waitForPrimary(conn: mongoose.Connection): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const hello: any = await conn.db!.admin().command({ hello: 1 });
      if (hello.isWritablePrimary) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error('replica set never became primary');
}

describe('PaymentsService mockPayJob B5e (real replica set)', () => {
  let conn: mongoose.Connection;
  let WalletModel: any;
  let TransactionModel: any;
  let JobModel: any;
  let ContractModel: any;
  let service: PaymentsService;
  let syncUpdateOneCalls = 0;

  async function seedJob(opts: { customerId: Types.ObjectId; helperId: Types.ObjectId }) {
    const job = await JobModel.create({
      customer_id: opts.customerId,
      helper_id: opts.helperId,
      title: 'Dọn nhà',
      description: 'Dọn nhà 2 phòng',
      address: {
        full_address: '123 Lê Lợi, Đà Nẵng',
        district: 'Hải Châu',
        city: 'Đà Nẵng',
        location: { type: 'Point', coordinates: [108.2, 16.05] },
      },
      status: JobStatus.PENDING_REVIEW,
      payment_status: PaymentStatus.UNPAID,
      completion_photos: ['https://example.com/evidence.jpg'],
    });
    await ContractModel.create({
      job_id: job._id,
      customer_id: opts.customerId,
      helper_id: opts.helperId,
      labor_cost: 70000,
      materials_cost: 0,
      total_price: 70000,
      platform_fee: 10500,
      helper_receives: 59500,
      scheduled_at: new Date(),
    });
    return job;
  }

  beforeAll(async () => {
    // Start a single-node replica set from the cached mongod binary.
    spawnSync(MONGOD, ['--dbpath', DBPATH, '--shutdown'], { stdio: 'ignore' });
    fs.rmSync(DBPATH, { recursive: true, force: true });
    fs.mkdirSync(DBPATH, { recursive: true });
    const child = spawn(
      MONGOD,
      [
        '--replSet',
        'rs0',
        '--dbpath',
        DBPATH,
        '--port',
        String(PORT),
        '--bind_ip',
        '127.0.0.1',
        '--logpath',
        '/tmp/gh-r5-b5e-mongod.log',
        '--fork',
      ],
      { stdio: 'ignore' },
    );
    await new Promise<void>((resolve, reject) => {
      child.on('exit', c => (c === 0 ? resolve() : reject(new Error(`mongod fork exit ${c}`))));
    });
    const direct = mongoose.createConnection(
      `mongodb://127.0.0.1:${PORT}/b5e?directConnection=true`,
    );
    await new Promise<void>((resolve, reject) => {
      direct.once('connected', () => resolve());
      direct.once('error', reject);
    });
    try {
      await direct.db!.admin().command({
        replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: `127.0.0.1:${PORT}` }] },
      });
    } catch (e: any) {
      if (!/already initiated/i.test(e?.message ?? '')) throw e;
    }
    await waitForPrimary(direct);
    await direct.close();

    conn = mongoose.createConnection(`mongodb://127.0.0.1:${PORT}/b5e?replicaSet=rs0`);
    await new Promise<void>((resolve, reject) => {
      conn.once('connected', () => resolve());
      conn.once('error', reject);
    });
    WalletModel = conn.model(Wallet.name, WalletSchema);
    TransactionModel = conn.model(Transaction.name, TransactionSchema);
    conn.model(Withdrawal.name, WithdrawalSchema);
    JobModel = conn.model(Job.name, JobSchema);
    ContractModel = conn.model(Contract.name, ContractSchema);

    // Count every jobModel.updateOne — on old code the sync write inside
    // getTotalPaidForJob fires once PER withTransaction retry (thousands);
    // after the fix it fires at most once, inside the session.
    const origUpdateOne = JobModel.updateOne.bind(JobModel);
    JobModel.updateOne = (...args: any[]) => {
      syncUpdateOneCalls++;
      return (origUpdateOne as any)(...args);
    };

    service = new PaymentsService(
      WalletModel,
      TransactionModel,
      conn.model(Withdrawal.name) as never,
      {} as never,
      { create: jest.fn().mockResolvedValue({}) } as never,
      {
        redeemForJob: jest.fn().mockResolvedValue({ discount_amount: 0, voucher: { code: 'X' } }),
        restoreForJob: jest.fn().mockResolvedValue({}),
      } as never,
      {
        redeemAtPayment: jest.fn().mockResolvedValue(null),
        reverseRedeemForJob: jest.fn().mockResolvedValue({}),
      } as never,
      JobModel,
      ContractModel,
      conn as never,
    );
  });

  afterAll(async () => {
    try {
      await Promise.race([conn.close(), sleep(5000)]);
    } catch {
      /* ignore — old-code in-flight retry loop may hold the connection */
    }
    spawnSync(MONGOD, ['--dbpath', DBPATH, '--shutdown'], { stdio: 'ignore' });
    fs.rmSync(DBPATH, { recursive: true, force: true });
  });

  beforeEach(async () => {
    syncUpdateOneCalls = 0;
    await WalletModel.deleteMany({});
    await TransactionModel.deleteMany({});
    await JobModel.deleteMany({});
    await ContractModel.deleteMany({});
  });

  it('B5e-1: vietqr payment on a PENDING_REVIEW job completes fast and marks the job PAID', async () => {
    const customerId = new Types.ObjectId();
    const helperId = new Types.ObjectId();
    const job = await seedJob({ customerId, helperId });

    const outcome = await Promise.race([
      service
        .mockPayJob(customerId.toString(), job._id.toString(), 0, 'vietqr')
        .then(r => ({ done: true as const, result: r }))
        .catch(e => ({ done: true as const, error: e as Error })),
      sleep(20000).then(() => ({ done: false as const, updateOneCalls: syncUpdateOneCalls })),
    ]);

    // On old code this is { done: false } — the WriteConflict retry loop
    // is still spinning at 20s (driver retries up to 120s).
    expect(outcome.done).toBe(true);
    if (!outcome.done) {
      throw new Error(
        `B5e: mockPayJob did NOT complete within 20s (WriteConflict retry loop); ` +
          `jobModel.updateOne fired ${outcome.updateOneCalls} times while waiting`,
      );
    }
    if ('error' in outcome) throw outcome.error;
    expect(outcome.result.success).toBe(true);
    expect((outcome.result.transaction as any).metadata.simulated).toBe(true);

    const after = await JobModel.findById(job._id).lean();
    expect(after.payment_status).toBe(PaymentStatus.PAID);
    expect(after.paid_amount).toBe(70000);
    // The in-flow paid_amount sync write must run at most once (in-session
    // after the fix); on old code it fires once per retry — thousands of times.
    expect(syncUpdateOneCalls).toBeLessThanOrEqual(1);
  });

  it('B5e-2: wallet payment completes fast and really debits the wallet', async () => {
    const customerId = new Types.ObjectId();
    const helperId = new Types.ObjectId();
    const job = await seedJob({ customerId, helperId });
    await WalletModel.create({ user_id: customerId, balance: 100000, simulated_balance: 0 });

    const outcome = await Promise.race([
      service
        .mockPayJob(customerId.toString(), job._id.toString(), 0, 'wallet')
        .then(r => ({ done: true as const, result: r }))
        .catch(e => ({ done: true as const, error: e as Error })),
      sleep(20000).then(() => ({ done: false as const, updateOneCalls: syncUpdateOneCalls })),
    ]);

    expect(outcome.done).toBe(true);
    if (!outcome.done) {
      throw new Error(
        `B5e: wallet mockPayJob did NOT complete within 20s (WriteConflict retry loop); ` +
          `jobModel.updateOne fired ${outcome.updateOneCalls} times while waiting`,
      );
    }
    if ('error' in outcome) throw outcome.error;
    expect(outcome.result.success).toBe(true);

    const after = await JobModel.findById(job._id).lean();
    expect(after.payment_status).toBe(PaymentStatus.PAID);
    const wallet = await WalletModel.findOne({ user_id: customerId }).lean();
    expect(wallet.balance).toBe(30000);
    expect(syncUpdateOneCalls).toBeLessThanOrEqual(1);
  });

  it('B5e-3: a failing flow (no contract) rejects fast and resets PROCESSING to UNPAID', async () => {
    const customerId = new Types.ObjectId();
    const helperId = new Types.ObjectId();
    const job = await JobModel.create({
      customer_id: customerId,
      helper_id: helperId,
      title: 'Dọn nhà',
      description: 'Dọn nhà 2 phòng',
      address: {
        full_address: '123 Lê Lợi, Đà Nẵng',
        district: 'Hải Châu',
        city: 'Đà Nẵng',
        location: { type: 'Point', coordinates: [108.2, 16.05] },
      },
      status: JobStatus.PENDING_REVIEW,
      payment_status: PaymentStatus.UNPAID,
      completion_photos: ['https://example.com/evidence.jpg'],
    });

    await expect(
      service.mockPayJob(customerId.toString(), job._id.toString(), 0, 'vietqr'),
    ).rejects.toThrow('chưa có hợp đồng');

    const after = await JobModel.findById(job._id).lean();
    expect(after.payment_status).toBe(PaymentStatus.UNPAID);
  });
});
