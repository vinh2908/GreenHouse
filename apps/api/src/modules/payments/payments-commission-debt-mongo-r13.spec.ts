import { startStandaloneMongo, stopStandaloneMongo, StandaloneMongoTestInstance } from '../../../test/standalone-mongo-helper';
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
import { HelperProfile, HelperProfileSchema } from '../helpers/schemas/helper-profile.schema';

/**
 * R13-N1b — field-less (pre-R13) wallet must still pay out (real mongod).
 *
 * Second review found the blocker: Mongo `$gte` never matches a document
 * where the field is ABSENT. `commission_debt` is new in R13, so every
 * wallet created before R13 stores no such field — and the original N1
 * guards `{ commission_debt: { $gte: repaid } }` (even with repaid = 0)
 * matched NOTHING: creditHelper threw ConflictException after 5 retries
 * and requestWithdrawal reported a misleading "insufficient balance".
 * The mocked specs could not catch this — every mock initialised the
 * debt to 0, i.e. assumed the field always exists.
 *
 * The fix (N1b) omits the guard when the amount is zero. This spec proves
 * it against a REAL mongod with a wallet inserted RAW (bypassing Mongoose
 * defaults, so the doc genuinely has no `commission_debt` key).
 *
 * FAILS on the pre-N1b code: creditHelper throws ConflictException,
 * requestWithdrawal throws "Số dư không đủ".
 *
 * HARNESS: real mongod, standalone, started directly from the cached binary
 * — same pattern as jobs-job-gone-r8b.spec.ts. Port 27127 / dbpath
 * /tmp/mongo-n1b so it does not clash with the R6/R7/R8 suites.
 */
jest.setTimeout(90000);

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

let mongoInstance: StandaloneMongoTestInstance;

describe('R13-N1b (field-less pre-R13 wallet still pays out — real mongod)', () => {
  let conn: mongoose.Connection;
  let WalletModel: any;
  let TransactionModel: any;
  let WithdrawalModel: any;
  let HelperModel: any;
  let service: PaymentsService;

  /** Raw insert bypassing Mongoose defaults — a real pre-R13 doc has NO commission_debt key. */
  async function seedFieldlessWallet(userId: Types.ObjectId, balance: number) {
    await conn.collection('wallets').insertOne({
      user_id: userId,
      balance,
      simulated_balance: 0,
      total_earned: 0,
      total_withdrawn: 0,
    });
  }

  beforeAll(async () => {
    mongoInstance = await startStandaloneMongo();
    conn = mongoInstance.conn;

    WalletModel = conn.model(Wallet.name, WalletSchema);
    TransactionModel = conn.model(Transaction.name, TransactionSchema);
    WithdrawalModel = conn.model(Withdrawal.name, WithdrawalSchema);
    HelperModel = conn.model(HelperProfile.name, HelperProfileSchema);

    const dummy = {} as never;
    service = new PaymentsService(
      WalletModel,
      TransactionModel,
      WithdrawalModel,
      HelperModel,
      { create: jest.fn(async () => ({})) } as never,
      dummy,
      dummy,
      dummy,
      dummy,
      undefined,
    );
  });

  afterAll(async () => {
    await stopStandaloneMongo(mongoInstance);
  });

  beforeEach(async () => {
    await WalletModel.deleteMany({});
    await TransactionModel.deleteMany({});
    await WithdrawalModel.deleteMany({});
    await HelperModel.deleteMany({});
    jest.clearAllMocks();
  });

  it('creditHelper on a field-less wallet succeeds (no ConflictException)', async () => {
    const helperId = new Types.ObjectId();
    const jobId = new Types.ObjectId();
    await seedFieldlessWallet(helperId, 100000);

    const tx = await service.creditHelper(String(helperId), String(jobId), 50000);

    expect(tx.balance_before).toBe(100000);
    expect(tx.balance_after).toBe(150000);
    const wallet = await WalletModel.findOne({ user_id: helperId }).lean().exec();
    expect(wallet.balance).toBe(150000);
    // The field is still absent (no debt was created) — only the guard changed.
    expect(wallet.commission_debt).toBeUndefined();
  });

  it('requestWithdrawal on a field-less wallet succeeds (no false "insufficient balance")', async () => {
    const helperId = new Types.ObjectId();
    await seedFieldlessWallet(helperId, 100000);
    await HelperModel.create({
      user_id: helperId,
      bank_account: { bank_name: 'VCB', account_number: '123456', account_name: 'Test' },
    });

    const withdrawal = await service.requestWithdrawal(String(helperId), 50000);

    expect((withdrawal as any).status).toBe('pending');
    expect((withdrawal as any).amount).toBe(50000);
    const wallet = await WalletModel.findOne({ user_id: helperId }).lean().exec();
    expect(wallet.balance).toBe(50000);
  });

  it('creditWallet on a field-less wallet succeeds (settle / rollback path)', async () => {
    const helperId = new Types.ObjectId();
    await seedFieldlessWallet(helperId, 100000);

    const tx = await service.creditWallet(String(helperId), 42500, {
      type: 'earning',
      description: 'Monthly settle test',
      reference: 'MONTHLY-TEST',
    });

    expect(tx.balance_after).toBe(142500);
    const wallet = await WalletModel.findOne({ user_id: helperId }).lean().exec();
    expect(wallet.balance).toBe(142500);
  });
});
