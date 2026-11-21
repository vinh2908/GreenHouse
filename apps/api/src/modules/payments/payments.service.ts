import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection, ClientSession } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import {
  Wallet,
  WalletDocument,
  Transaction,
  TransactionDocument,
  Withdrawal,
  WithdrawalDocument,
} from './schemas/payment.schema';
import { BankAccountInfoDto } from './dto/payment.dto';
import { NOTIFICATION_TYPES } from '@homemate/constants';
import { PaymentStatus, JobStatus } from '@homemate/types';
import { NotificationsService } from '../notifications/notifications.service';
import { HelperProfile, HelperProfileDocument } from '../helpers/schemas/helper-profile.schema';
import { Job, JobDocument, Contract, ContractDocument } from '../jobs/schemas/job.schema';
import { VouchersService } from '../vouchers/vouchers.service';
import { LoyaltyService } from '../loyalty/loyalty.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(Withdrawal.name) private withdrawalModel: Model<WithdrawalDocument>,
    @InjectModel(HelperProfile.name) private helperModel: Model<HelperProfileDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly vouchersService: VouchersService,
    private readonly loyaltyService: LoyaltyService,
    @Optional() @InjectModel(Job.name) private jobModel?: Model<JobDocument>,
    @Optional() @InjectModel(Contract.name) private contractModel?: Model<ContractDocument>,
    @Optional() @InjectConnection() private connection?: Connection,
  ) {}

  /**
   * F19 (R5): Tự động gỡ các thanh toán bị kẹt trạng thái 'processing' quá 15 phút về 'unpaid'
   */
  @Cron('*/5 * * * *')
  async clearStuckProcessingPayments(): Promise<number> {
    if (!this.jobModel) return 0;
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const result = await this.jobModel
      .updateMany(
        {
          payment_status: PaymentStatus.PROCESSING,
          $or: [
            { updatedAt: { $lt: fifteenMinutesAgo } },
            { updated_at: { $lt: fifteenMinutesAgo } },
          ],
        },
        { $set: { payment_status: PaymentStatus.UNPAID } },
      )
      .exec();
    if (result.modifiedCount > 0) {
      this.logger.warn(
        `Đã tự động gỡ ${result.modifiedCount} đơn kẹt processing quá 15 phút về UNPAID`,
      );
    }
    return result.modifiedCount;
  }

  // ─── Wallet ───────────────────────────────────────────────────────────────

  async getOrCreateWallet(userId: string, session?: ClientSession | null): Promise<WalletDocument> {
    const wallet = await this.walletModel
      .findOneAndUpdate(
        { user_id: new Types.ObjectId(userId) },
        { $setOnInsert: { user_id: new Types.ObjectId(userId) } },
        { upsert: true, new: true, session: session ?? undefined },
      )
      .exec();
    return wallet!;
  }

  async getWallet(userId: string): Promise<WalletDocument> {
    return this.getOrCreateWallet(userId);
  }

  /** B96: thông báo xác nhận tiền đã vào/ra — chỉ gửi khi giao dịch THÀNH CÔNG, 1 lần. */
  private async notifyTopupSuccess(
    userId: string,
    amount: number,
    balanceAfter: number,
    simulatedAfter = 0,
  ) {
    await this.notificationsService
      .create({
        userId,
        type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
        title: 'Đã ghi nhận nạp tiền mô phỏng (Demo)',
        body: `Đã ghi nhận nạp thử ${amount.toLocaleString('vi-VN')}₫ (mô phỏng — chưa có thanh toán thật, số dư rút được không đổi: ${balanceAfter.toLocaleString('vi-VN')}₫; số dư mô phỏng: ${simulatedAfter.toLocaleString('vi-VN')}₫)`,
        payload: {
          amount,
          balance: balanceAfter,
          simulated_balance: simulatedAfter,
          screen: 'wallet',
        },
      })
      .catch(() => undefined);
  }

  private async notifyPaymentSuccess(
    userId: string,
    amount: number,
    balanceAfter: number,
    jobId?: string,
    paymentMethod?: string,
  ) {
    const cashNote =
      paymentMethod === 'cash'
        ? ' (tiền mặt trực tiếp — thợ nhận tiền mặt, ví không thay đổi)'
        : '';
    await this.notificationsService
      .create({
        userId,
        type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
        title: 'Thanh toán thành công',
        body: `Đã thanh toán ${amount.toLocaleString('vi-VN')}₫${jobId ? ` cho đơn #${jobId.slice(-6)}` : ''}${cashNote}. Số dư ví: ${balanceAfter.toLocaleString('vi-VN')}₫`,
        payload: { amount, balance: balanceAfter, ...(jobId ? { job_id: jobId } : {}) },
      })
      .catch(() => undefined);
  }

  /**
   * P0-2: has a job actually been paid with REAL money from the customer
   * wallet? Only a successful 'payment' transaction whose metadata says
   * payment_method 'wallet' counts — wallet payments atomically debit the
   * wallet in mockPayJob. Cash is handled separately (helper got cash in
   * hand, no wallet credit). Simulated online payments (vietqr/momo/zalopay)
   * are tracked separately by hasSimulatedOnlinePayment below — they never
   * count as verified, so they can never release a REAL helper payout.
   */
  async hasVerifiedWalletPayment(jobId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(jobId)) return false;
    const tx = await this.transactionModel
      .findOne({
        job_id: new Types.ObjectId(jobId),
        type: 'payment',
        status: 'success',
        'metadata.payment_method': 'wallet',
      })
      .select('_id')
      .lean()
      .exec();
    return Boolean(tx);
  }

  /**
   * Owner decision 2026-11-07 ("giữ mô phỏng thanh toán đi"): was this job
   * paid by a SIMULATED VietQR/MoMo/ZaloPay payment? Such a payment never
   * collected real money, so approval / dispute resolution may only release
   * the helper payout into `simulated_balance` (creditHelperSimulated) —
   * never into the withdrawable balance.
   */
  async hasSimulatedOnlinePayment(jobId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(jobId)) return false;
    try {
      const tx = await this.transactionModel
        .findOne({
          job_id: new Types.ObjectId(jobId),
          type: 'payment',
          status: 'success',
          'metadata.simulated': true,
          'metadata.payment_method': { $in: PaymentsService.SIMULATED_ONLINE_METHODS },
        })
        .select('_id')
        .lean()
        .exec();
      return Boolean(tx);
    } catch {
      return false;
    }
  }

  /**
   * P0-2: atomically debit the customer wallet for a wallet job payment.
   * Guard $gte rejects when the balance is short — never let the wallet go
   * negative or pay with money that isn't there. balance_before is derived
   * from the $inc result (balance_after + amount), never from a pre-read.
   */
  private async debitWalletForPayment(
    userId: string,
    amount: number,
    session?: ClientSession | null,
  ): Promise<{ walletId: Types.ObjectId; balanceBefore: number; balanceAfter: number }> {
    // B5e (R5): the upsert MUST run in the same session as the $inc below.
    // getOrCreateWallet bumps the wallet's updated_at (timestamps), so
    // running it outside the transaction and then debiting the same wallet
    // document inside it is a WriteConflict -> withTransaction retries the
    // whole flow forever (see mockPayJob).
    const wallet = await this.getOrCreateWallet(userId, session);
    const updated = await this.walletModel
      .findOneAndUpdate(
        { _id: wallet._id, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: true, session: session ?? undefined },
      )
      .exec();
    if (!updated) {
      throw new BadRequestException(
        `Số dư ví không đủ để thanh toán ${amount.toLocaleString('vi-VN')}₫. Hiện có: ${wallet.balance.toLocaleString('vi-VN')}₫. Vui lòng thanh toán bằng tiền mặt.`,
      );
    }
    return {
      walletId: wallet._id,
      balanceBefore: updated.balance + amount,
      balanceAfter: updated.balance,
    };
  }

  /**
   * B91: chạy 1 thao tác tiền trong MongoDB transaction khi DB hỗ trợ
   * (replica set); standalone Mongo không hỗ trợ transaction thì chạy thẳng
   * như cũ và ghi log cảnh báo. Lỗi giữa chừng -> rollback toàn bộ.
   */
  private async runInTransaction<T>(fn: (session?: any) => Promise<T>): Promise<T> {
    const conn: any = this.connection ?? (this.walletModel as any)?.db;
    let session: any = null;
    if (conn && typeof conn.startSession === 'function') {
      try {
        session = await conn.startSession();
      } catch (sErr) {
        this.logger.warn(`B91: Could not start mongoose session: ${sErr}`);
      }
    }
    if (!session) {
      this.logger.warn('B91: running money operation without transaction (no session available)');
      return fn(undefined);
    }
    try {
      let result: T | undefined;
      await session.withTransaction(
        async () => {
          result = await fn(session);
        },
        { timeoutMS: 20000, maxCommitTimeMS: 10000 },
      );
      return result as T;
    } catch (txErr: any) {
      if (
        txErr?.message?.includes('replica set member') ||
        txErr?.message?.includes('Transaction numbers')
      ) {
        this.logger.warn(
          'B91: transactions unsupported on this Mongo deployment, running without transaction',
        );
        return fn(undefined);
      }
      throw txErr;
    } finally {
      try {
        await session.endSession();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * G2: wrapper công khai cho runInTransaction để JobsService.creditJobPayout
   * (và các luồng trả tiền thợ khác) bọc nhiều lần cộng ví trong 1 transaction.
   * Khi DB không hỗ trợ transaction thì chạy thẳng như runInTransaction và
   * ghi log warn ở đó — các lần cộng ví riêng lẻ vẫn nguyên tử (xem creditHelper).
   */
  async runMoneyTransaction<T>(fn: (session?: ClientSession | null) => Promise<T>): Promise<T> {
    return this.runInTransaction(fn);
  }

  /**
   * P0-1 (honest simulation): there is NO real payment gateway connected yet
   * (owner decision 2026-11-07: keep honestly labelled simulation). So a
   * "top-up" CANNOT create withdrawable money: it credits ONLY
   * `simulated_balance` (display-only demo credit, never withdrawable, never
   * spendable) and the transaction records the withdrawable balance as
   * UNCHANGED. Anyone topping up 100M₫ can no longer withdraw it.
   * S17: withdrawable balance_before/after come from the untouched balance,
   * not a stale pre-read; the simulated balance_after comes from the $inc
   * result (new: true).
   */
  async topupWallet(
    userId: string,
    amount: number,
    paymentMethod = 'vietqr',
  ): Promise<{ wallet: WalletDocument; transaction: TransactionDocument }> {
    if (!amount || amount < 50000) {
      throw new BadRequestException('Số tiền nạp tối thiểu là 50,000₫');
    }
    if (!Number.isInteger(amount)) {
      throw new BadRequestException('Số tiền nạp phải là số nguyên (không có phần thập phân)');
    }
    // B91 & API-m2: ghi giao dịch nạp thử + cộng số dư MÔ PHỎNG trong 1 transaction (upsert ví với session)
    const result = await this.runInTransaction(async session => {
      const walletBefore = await this.getOrCreateWallet(userId, session);
      const updatedWallet = await this.walletModel
        .findByIdAndUpdate(
          walletBefore._id,
          { $inc: { simulated_balance: amount } },
          { new: true, session },
        )
        .exec();

      const simulatedAfter =
        updatedWallet?.simulated_balance ?? (walletBefore.simulated_balance ?? 0) + amount;

      const [transaction] = await this.transactionModel.create(
        [
          {
            wallet_id: walletBefore._id,
            user_id: new Types.ObjectId(userId),
            type: 'topup',
            status: 'success',
            amount,
            // Withdrawable balance is untouched by a simulated top-up.
            balance_before: walletBefore.balance,
            balance_after: walletBefore.balance,
            description: `Nạp tiền MÔ PHỎNG (demo — chưa có thanh toán thật) qua ${paymentMethod.toUpperCase()}; số dư rút được không thay đổi`,
            reference: `SIM-TOPUP-${Date.now()}`,
            metadata: {
              payment_method: paymentMethod,
              simulated: true,
              simulated_balance_after: simulatedAfter,
            },
          },
        ],
        { session },
      );

      return { wallet: updatedWallet ?? walletBefore, transaction };
    });
    // B96: chỉ gửi khi ghi nhận thành công
    await this.notifyTopupSuccess(
      userId,
      amount,
      result.wallet.balance,
      result.wallet.simulated_balance ?? 0,
    );
    return result;
  }

  // ─── Escrow / Job Payment ──────────────────────────────────────────────────

  // B41: Chỉ chấp nhận phương thức thanh toán hợp lệ. 'vietqr' là phương
  // thức mặc định đang dùng toàn hệ thống (xem MockPayJobDto + approveCompletion)
  // nên bắt buộc phải có trong danh sách — không chặn phương thức đang dùng.
  static readonly ALLOWED_PAYMENT_METHODS = ['wallet', 'cash', 'momo', 'zalopay', 'vietqr'];

  // Owner decision 2026-11-07 ("giữ mô phỏng thanh toán đi"): VietQR/MoMo/
  // ZaloPay keep working as honestly labelled SIMULATION — no real gateway,
  // no real money collected. A simulated payment marks the job PAID (demo)
  // and releases helper payout ONLY into `simulated_balance` (never
  // withdrawable, never spendable). Real wallet payments stay the only path
  // to a real, withdrawable payout.
  static readonly SIMULATED_ONLINE_METHODS = ['vietqr', 'momo', 'zalopay'];

  static isSimulatedOnlineMethod(method?: string | null): boolean {
    return !!method && PaymentsService.SIMULATED_ONLINE_METHODS.includes(method);
  }

  async mockPayJob(
    customerId: string,
    jobId: string,
    amount: number,
    paymentMethod: string,
  ): Promise<{
    transaction: TransactionDocument;
    success: boolean;
    discount_amount: number;
    voucher_code?: string;
    loyalty_points_redeemed: number;
    loyalty_discount_amount: number;
  }> {
    if (!paymentMethod || !PaymentsService.ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
      throw new BadRequestException(
        `Phương thức thanh toán không hợp lệ: "${paymentMethod}". Chỉ chấp nhận: ${PaymentsService.ALLOWED_PAYMENT_METHODS.join(', ')}`,
      );
    }
    // Owner decision 2026-11-07 ("giữ mô phỏng thanh toán đi"): VietQR/MoMo/
    // ZaloPay are SIMULATED online payments — no real gateway, no real money
    // collected, no wallet debit. They mark the job PAID (demo) with
    // metadata.simulated=true; approval releases the helper payout ONLY into
    // simulated_balance (see creditHelperSimulated + hasSimulatedOnlinePayment),
    // so a demo payment can never mint withdrawable money. Only 'wallet'
    // (real balance debited atomically below) moves real money.
    const isSimulatedOnline = PaymentsService.isSimulatedOnlineMethod(paymentMethod);
    if (!Types.ObjectId.isValid(jobId)) {
      throw new BadRequestException('Mã công việc (job_id) không hợp lệ');
    }

    let resolvedAmount = amount;
    let discountAmount = 0;
    let appliedVoucherCode: string | undefined;
    let loyaltyPointsRedeemed = 0;
    let loyaltyDiscountAmount = 0;
    let transaction: TransactionDocument | undefined;

    if (this.jobModel) {
      const job = await this.jobModel.findById(jobId).exec();
      if (!job) {
        throw new NotFoundException('Không tìm thấy đơn hàng cần thanh toán');
      }
      if (job.customer_id.toString() !== customerId) {
        throw new ForbiddenException('Bạn không có quyền thanh toán đơn hàng của người khác');
      }
      if (job.payment_status === PaymentStatus.PAID) {
        throw new ConflictException('Đơn hàng này đã được thanh toán trước đó');
      }

      // A2 & F4 & API-M3: Chặn thanh toán cho đơn hàng không ở trạng thái hợp lệ
      const payableStatuses: string[] = [
        JobStatus.QUOTE_SELECTED,
        JobStatus.CONFIRMED,
        JobStatus.HELPER_ON_THE_WAY,
        JobStatus.HELPER_ARRIVED,
        JobStatus.IN_PROGRESS,
        JobStatus.PENDING_REVIEW,
      ];
      if (!payableStatuses.includes(job.status)) {
        throw new BadRequestException(
          `Đơn hàng ở trạng thái "${job.status}" không thể thực hiện thanh toán`,
        );
      }

      // A33 + R5 + API-M3: Khóa nguyên tử đơn hàng chống thanh toán trùng, kèm điều kiện trạng thái hợp lệ
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      const claimedJob = await this.jobModel
        .findOneAndUpdate(
          {
            _id: job._id,
            status: { $in: payableStatuses },
            $or: [
              { payment_status: { $nin: [PaymentStatus.PAID, PaymentStatus.PROCESSING] } },
              {
                payment_status: PaymentStatus.PROCESSING,
                $or: [
                  { updatedAt: { $lt: fifteenMinutesAgo } },
                  { updated_at: { $lt: fifteenMinutesAgo } },
                ],
              },
            ],
          },
          {
            $set: { payment_status: PaymentStatus.PROCESSING },
          },
          { new: true },
        )
        .exec();

      if (!claimedJob) {
        throw new ConflictException(
          'Đơn hàng này đã được thanh toán hoặc đang được xử lý thanh toán, hoặc trạng thái không hợp lệ',
        );
      }

      const conn = this.connection ?? this.walletModel?.db ?? this.jobModel?.db;
      let session: any = null;
      if (conn && typeof conn.startSession === 'function') {
        try {
          session = await conn.startSession();
        } catch (sErr) {
          this.logger.warn(`Could not start mongoose session: ${sErr}`);
        }
      }

      const executePaymentFlow = async (sess?: any) => {
        // API-M3: Đọc lại job từ DB bằng session để không dùng snapshot cũ
        const jobQ = this.jobModel!.findById(jobId);
        if (sess && typeof (jobQ as any)?.session === 'function') {
          (jobQ as any).session(sess);
        }
        const freshJob =
          typeof (jobQ as any)?.exec === 'function' ? await (jobQ as any).exec() : await jobQ;
        if (!freshJob) {
          throw new NotFoundException('Không tìm thấy đơn hàng cần thanh toán');
        }
        if (!payableStatuses.includes(freshJob.status)) {
          throw new BadRequestException(
            `Đơn hàng ở trạng thái "${freshJob.status}" không thể thực hiện thanh toán`,
          );
        }
        if (freshJob.payment_status === PaymentStatus.PAID) {
          throw new ConflictException('Đơn hàng này đã được thanh toán trước đó');
        }

        // A2: Kiểm tra hợp đồng và chặn giao dịch 0₫ không hợp lệ
        let contract: any = null;
        if (this.contractModel) {
          const contractQ = this.contractModel.findOne({ job_id: new Types.ObjectId(jobId) });
          if (sess && typeof (contractQ as any)?.session === 'function') {
            (contractQ as any).session(sess);
          }
          contract =
            typeof (contractQ as any)?.exec === 'function'
              ? await (contractQ as any).exec()
              : await contractQ;
        }
        if (!contract && !freshJob.is_warranty) {
          throw new BadRequestException('Đơn hàng chưa có hợp đồng để thanh toán');
        }

        // P0-3: Kiểm tra các đợt thanh toán trước đó (hỗ trợ thanh toán bổ sung khi có phụ lục tăng giá)
        // B5e (R5): pass the transaction session — getTotalPaidForJob syncs
        // paid_amount onto the same job document this flow later writes
        // inside the transaction; an out-of-session sync write is a
        // WriteConflict that makes withTransaction retry in a loop.
        const paidSoFar = await this.getTotalPaidForJob(jobId, sess);
        const isSupplemental = paidSoFar > 0;
        const expectedRemaining =
          isSupplemental && contract?.total_price && contract.total_price > paidSoFar
            ? contract.total_price - paidSoFar
            : (contract?.total_price ?? 0);

        // P3-1: Validate amount nếu client gửi lên
        if (amount > 0 && expectedRemaining > 0 && amount !== expectedRemaining) {
          throw new BadRequestException(
            `Số tiền thanh toán (${amount.toLocaleString('vi-VN')}₫) không khớp với số tiền cần thanh toán (${expectedRemaining.toLocaleString('vi-VN')}₫)`,
          );
        }

        if (contract?.total_price) {
          if (isSupplemental && contract.total_price > paidSoFar) {
            resolvedAmount = expectedRemaining;
          } else if (resolvedAmount <= 0) {
            resolvedAmount = contract.total_price;
          }
        }

        if (!freshJob.is_warranty && resolvedAmount <= 0) {
          throw new BadRequestException('Số tiền thanh toán phải lớn hơn 0₫');
        }

        // Voucher: ghi nhận lượt dùng + tính giảm trên giá chốt của đơn
        // G2: truyền session để lần trừ voucher chạy trong cùng transaction
        // với thanh toán (trước đây chạy ngoài transaction).
        if (freshJob.voucher_code && resolvedAmount > 0 && (freshJob.discount_amount ?? 0) <= 0) {
          const redeemed = await this.vouchersService.redeemForJob(
            customerId,
            jobId,
            freshJob.voucher_code,
            resolvedAmount,
            sess,
          );
          discountAmount = redeemed.discount_amount;
          appliedVoucherCode = redeemed.voucher.code;
          resolvedAmount = Math.max(0, resolvedAmount - discountAmount);
        }

        // Loyalty: trừ điểm thật tại thời điểm thanh toán
        // G2: truyền session để lần trừ điểm chạy trong cùng transaction.
        if ((freshJob.loyalty_points_requested ?? 0) > 0 && resolvedAmount > 0) {
          const loyaltyRedeemed = await this.loyaltyService.redeemAtPayment(
            customerId,
            jobId,
            sess,
          );
          if (loyaltyRedeemed) {
            loyaltyPointsRedeemed = loyaltyRedeemed.points_redeemed;
            loyaltyDiscountAmount = loyaltyRedeemed.discount_amount;
            resolvedAmount = Math.max(0, resolvedAmount - loyaltyDiscountAmount);
          }
        }

        // P0-2: 'wallet' must REALLY debit the customer wallet, BEFORE the
        // job is marked PAID (atomic $inc with $gte guard — insufficient
        // balance throws and the catch below rolls voucher/loyalty back +
        // resets the job to UNPAID). 'cash' debits nothing: the helper
        // receives cash in hand, no wallet money moves, and approval only
        // deducts the platform fee (never credits the helper).
        let walletDebit: {
          walletId: Types.ObjectId;
          balanceBefore: number;
          balanceAfter: number;
        } | null = null;
        // B5e (R5): same session as the in-transaction writes below — the
        // upsert bumps the wallet's updated_at, so an out-of-session call
        // here + the in-transaction debit is a WriteConflict retry loop.
        let wallet = await this.getOrCreateWallet(customerId, sess);
        if (paymentMethod === 'wallet' && resolvedAmount > 0) {
          walletDebit = await this.debitWalletForPayment(customerId, resolvedAmount, sess);
        }

        // API-M3 & API-m3: Tính nextStatus và cập nhật nguyên tử kèm guard status
        const nextStatus =
          freshJob.status === JobStatus.QUOTE_SELECTED ? JobStatus.CONFIRMED : freshJob.status;
        const updatedJob = await this.jobModel!.findOneAndUpdate(
          {
            _id: job._id,
            status: { $in: payableStatuses },
            payment_status: PaymentStatus.PROCESSING,
          },
          {
            $set: {
              payment_status: PaymentStatus.PAID,
              payment_method: paymentMethod,
              paid_amount: (freshJob.paid_amount || paidSoFar) + resolvedAmount,
              status: nextStatus,
              ...(discountAmount > 0 ? { discount_amount: discountAmount } : {}),
            },
          },
          { session: sess ?? undefined, new: true },
        ).exec();

        if (!updatedJob) {
          throw new ConflictException('Trạng thái đơn hàng đã thay đổi trong quá trình thanh toán');
        }

        const [createdTx] = await this.transactionModel.create(
          [
            {
              wallet_id: walletDebit?.walletId ?? wallet._id,
              user_id: new Types.ObjectId(customerId),
              job_id: new Types.ObjectId(jobId),
              type: 'payment',
              status: 'success',
              amount: resolvedAmount,
              balance_before: walletDebit?.balanceBefore ?? wallet.balance,
              balance_after: walletDebit?.balanceAfter ?? wallet.balance,
              description:
                (isSupplemental
                  ? `Thanh toán bổ sung phụ lục cho công việc #${jobId.slice(-6)} (${paymentMethod.toUpperCase()})`
                  : `Thanh toán cho công việc #${jobId.slice(-6)} (${paymentMethod.toUpperCase()})`) +
                (paymentMethod === 'cash'
                  ? ' — tiền mặt trực tiếp, thợ nhận tiền mặt (không qua ví)'
                  : '') +
                (isSimulatedOnline
                  ? ' — MÔ PHỎNG (demo, chưa có cổng thanh toán thật: không thu tiền thật, không trừ ví)'
                  : '') +
                (discountAmount > 0
                  ? ` — đã áp mã ${appliedVoucherCode} giảm ${discountAmount.toLocaleString('vi-VN')}₫`
                  : '') +
                (loyaltyDiscountAmount > 0
                  ? ` — đổi ${loyaltyPointsRedeemed} điểm giảm ${loyaltyDiscountAmount.toLocaleString('vi-VN')}₫`
                  : ''),
              reference: `PAY-${Date.now()}`,
              metadata: {
                payment_method: paymentMethod,
                job_id: jobId,
                ...(isSupplemental ? { supplemental: true, paid_so_far: paidSoFar } : {}),
                ...(isSimulatedOnline ? { simulated: true } : {}),
                ...(paymentMethod === 'cash' ? { cash_paid_in_hand: true } : {}),
                ...(discountAmount > 0
                  ? { voucher_code: appliedVoucherCode, discount_amount: discountAmount }
                  : {}),
                ...(loyaltyDiscountAmount > 0
                  ? {
                      loyalty_points_redeemed: loyaltyPointsRedeemed,
                      loyalty_discount_amount: loyaltyDiscountAmount,
                    }
                  : {}),
              },
            },
          ],
          { session: sess ?? undefined },
        );
        transaction = createdTx;
      };

      try {
        if (session) {
          try {
            // B5e (R5): FAIL FAST. The driver retries TransientTransactionError
            // (e.g. WriteConflict) for up to its 120s MAX_TIMEOUT by default
            // — far past the client's ~35s axios timeout, so a retry loop
            // looks like a hang and the PROCESSING reset never runs in time.
            // 20s bounds the whole transaction (retries + commit) and still
            // leaves room for the rollback + reset + a clear error response.
            await session.withTransaction(
              async () => {
                await executePaymentFlow(session);
              },
              { timeoutMS: 20000 },
            );
          } catch (txErr: any) {
            if (
              txErr?.message?.includes('replica set member') ||
              txErr?.message?.includes('Transaction numbers')
            ) {
              // G2 (F5/B91): fallback chạy KHÔNG transaction — log rõ để vận
              // hành biết voucher/điểm lúc này chỉ được hoàn tác thủ công ở
              // catch bên dưới, không còn rollback nguyên tử. Không im lặng.
              this.logger.error(
                `G2/B91: mockPayJob job ${jobId} — MongoDB transactions unsupported on this deployment, running payment WITHOUT transaction (voucher/loyalty redemptions will NOT roll back atomically; manual rollback on failure only)`,
              );
              await executePaymentFlow();
            } else {
              throw txErr;
            }
          }
        } else {
          // G2 (F5/B91): không mở được session — chạy không transaction, log rõ.
          this.logger.error(
            `G2/B91: mockPayJob job ${jobId} — running payment WITHOUT transaction (no session available; voucher/loyalty redemptions will NOT roll back atomically; manual rollback on failure only)`,
          );
          await executePaymentFlow();
        }
      } catch (err) {
        // F5: Rollback hoàn tác voucher và điểm loyalty khi có lỗi giữa chừng
        try {
          await this.vouchersService.restoreForJob(customerId, jobId);
        } catch (voucherErr) {
          this.logger.error(`Failed to rollback voucher for job ${jobId}: ${voucherErr}`);
        }
        try {
          await this.loyaltyService.reverseRedeemForJob(customerId, jobId);
        } catch (loyaltyErr) {
          this.logger.error(`Failed to rollback loyalty for job ${jobId}: ${loyaltyErr}`);
        }
        // B5e (R5): robust reset — retries once, logs loudly if it fails.
        await this.resetPaymentClaim(jobId, (err as any)?.message ?? String(err));
        throw err;
      } finally {
        if (session) {
          await session.endSession().catch(() => undefined);
        }
      }
    } else {
      // No job model (unit-test fallback path): same money rules as above —
      // wallet really debits, cash moves no wallet money, simulated online
      // methods record a simulated payment (metadata.simulated=true) and
      // debit nothing.
      const wallet = await this.getOrCreateWallet(customerId);
      let walletDebit: { balanceBefore: number; balanceAfter: number } | null = null;
      if (paymentMethod === 'wallet' && resolvedAmount > 0) {
        walletDebit = await this.debitWalletForPayment(customerId, resolvedAmount);
      }
      transaction = await this.transactionModel.create({
        wallet_id: wallet._id,
        user_id: new Types.ObjectId(customerId),
        job_id: new Types.ObjectId(jobId),
        type: 'payment',
        status: 'success',
        amount: resolvedAmount,
        balance_before: walletDebit?.balanceBefore ?? wallet.balance,
        balance_after: walletDebit?.balanceAfter ?? wallet.balance,
        description:
          `Thanh toán cho công việc #${jobId.slice(-6)} (${paymentMethod.toUpperCase()})` +
          (paymentMethod === 'cash'
            ? ' — tiền mặt trực tiếp, thợ nhận tiền mặt (không qua ví)'
            : '') +
          (isSimulatedOnline
            ? ' — MÔ PHỎNG (demo, chưa có cổng thanh toán thật: không thu tiền thật, không trừ ví)'
            : ''),
        reference: `PAY-${Date.now()}`,
        metadata: {
          payment_method: paymentMethod,
          job_id: jobId,
          ...(isSimulatedOnline ? { simulated: true } : {}),
          ...(paymentMethod === 'cash' ? { cash_paid_in_hand: true } : {}),
        },
      });
    }

    // B96: thanh toán thành công → thông báo xác nhận 1 lần (lỗi thì không gửi)
    await this.notifyPaymentSuccess(
      customerId,
      resolvedAmount,
      transaction!.balance_after ?? 0,
      jobId,
      paymentMethod,
    );
    return {
      transaction: transaction!,
      success: true,
      discount_amount: discountAmount,
      voucher_code: appliedVoucherCode,
      loyalty_points_redeemed: loyaltyPointsRedeemed,
      loyalty_discount_amount: loyaltyDiscountAmount,
    };
  }

  // ─── Credit helper wallet after online-paid job completion ─────────────────

  async creditHelper(
    helperId: string,
    jobId: string,
    amount: number,
    session?: ClientSession | null,
  ): Promise<TransactionDocument> {
    // B42: Chỉ cộng tiền dương — số âm/0 sẽ làm sai lệch ví thợ
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Số tiền cộng cho thợ phải lớn hơn 0₫');
    }
    // R3: Idempotency check — chống giải ngân trùng 2 lần cho cùng một job
    if (
      this.transactionModel &&
      typeof this.transactionModel.findOne === 'function' &&
      Types.ObjectId.isValid(jobId)
    ) {
      const existingTx = await this.transactionModel
        .findOne({
          job_id: new Types.ObjectId(jobId),
          user_id: new Types.ObjectId(helperId),
          type: 'earning',
          status: 'success',
          'metadata.simulated': { $ne: true },
        })
        .session(session ?? null)
        .exec();
      if (existingTx) {
        return existingTx;
      }
    }
    const wallet = await this.getOrCreateWallet(helperId, session);

    // R13-N1: thu hồi phí sàn tiền mặt còn nợ (Wallet.commission_debt) từ
    // thu nhập thật — trong CÙNG $inc nguyên tử với lần cộng tiền, có guard
    // commission_debt >= repaid để 2 lần cộng song song không trừ nợ trùng
    // (thử lại tối đa 5 lần với số nợ vừa đọc). total_earned vẫn cộng GỘP
    // (giữ ngữ nghĩa cũ); số thực cộng vào balance là amount − repaid.
    // Tiền mô phỏng không qua đây nên không bao giờ trả nợ này.
    let repaid = 0;
    let debtRemaining = 0;
    let updatedWallet: WalletDocument | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const fresh = attempt === 0 ? wallet : await this.getOrCreateWallet(helperId, session);
      const debt = Math.max(0, (fresh as any).commission_debt ?? 0);
      repaid = Math.min(amount, debt);
      updatedWallet = await this.walletModel
        .findOneAndUpdate(
          // R13-N1b (review 2): CHỈ kèm guard commission_debt khi repaid > 0.
          // Mongo $gte KHÔNG khớp document thiếu field — ví tạo trước R13
          // không có commission_debt nên guard $gte: 0 vẫn trượt, mọi lần
          // cộng tiền đều ConflictException. Khi không có nợ thì không cần
          // guard (không có gì để bảo vệ khỏi trừ trùng).
          {
            _id: fresh._id,
            ...(repaid > 0 ? { commission_debt: { $gte: repaid } } : {}),
          },
          {
            $inc: {
              balance: amount - repaid,
              ...(repaid > 0 ? { commission_debt: -repaid } : {}),
              total_earned: amount,
            },
          },
          { new: true, session: session ?? undefined },
        )
        .exec();
      if (updatedWallet) {
        debtRemaining = Math.max(0, (updatedWallet as any).commission_debt ?? 0);
        break;
      }
      // Nợ đổi giữa chừng do 1 lần cộng khác chen ngang — đọc lại, thử lại.
    }
    if (!updatedWallet) {
      throw new ConflictException('Không thể cộng tiền do xung đột song song, vui lòng thử lại');
    }
    const balanceAfter = updatedWallet.balance;
    const balanceBefore = balanceAfter - (amount - repaid);

    const [tx] = await this.transactionModel.create(
      [
        {
          wallet_id: wallet._id,
          user_id: new Types.ObjectId(helperId),
          job_id: new Types.ObjectId(jobId),
          type: 'earning',
          status: 'success',
          amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          description:
            `Thu nhập từ công việc #${jobId.slice(-6)}` +
            (repaid > 0
              ? ` — đã trừ ${repaid.toLocaleString('vi-VN')}₫ phí sàn tiền mặt còn nợ (còn nợ ${debtRemaining.toLocaleString('vi-VN')}₫)`
              : ''),
          metadata: repaid > 0 ? { debt_repaid: repaid, debt_remaining: debtRemaining } : undefined,
        },
      ],
      { session: session ?? undefined },
    );
    return tx;
  }

  /**
   * Owner decision 2026-11-07 (keep simulation): helper payout for a job
   * paid by SIMULATED VietQR/MoMo/ZaloPay credits ONLY `simulated_balance`
   * (demo credit, never withdrawable, never spendable — same treatment as a
   * simulated top-up). Real `balance` and `total_earned` are untouched, so a
   * demo payment can never mint withdrawable money.
   */
  async creditHelperSimulated(
    helperId: string,
    jobId: string,
    amount: number,
    session?: ClientSession | null,
  ): Promise<TransactionDocument> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Số tiền cộng cho thợ phải lớn hơn 0₫');
    }
    // R3: Idempotency check — chống giải ngân mô phỏng trùng 2 lần cho cùng một job
    if (
      this.transactionModel &&
      typeof this.transactionModel.findOne === 'function' &&
      Types.ObjectId.isValid(jobId)
    ) {
      const existingTx = await this.transactionModel
        .findOne({
          job_id: new Types.ObjectId(jobId),
          user_id: new Types.ObjectId(helperId),
          type: 'earning',
          status: 'success',
          'metadata.simulated': true,
        })
        .session(session ?? null)
        .exec();
      if (existingTx) {
        return existingTx;
      }
    }
    const wallet = await this.getOrCreateWallet(helperId, session);
    const updatedWallet = await this.walletModel
      .findByIdAndUpdate(
        wallet._id,
        { $inc: { simulated_balance: amount } },
        { new: true, session: session ?? undefined },
      )
      .exec();
    if (!updatedWallet) {
      throw new BadRequestException('Không tìm thấy ví thợ để cộng tiền');
    }
    const simulatedAfter =
      updatedWallet.simulated_balance ?? (wallet.simulated_balance ?? 0) + amount;
    const [tx] = await this.transactionModel.create(
      [
        {
          wallet_id: wallet._id,
          user_id: new Types.ObjectId(helperId),
          job_id: new Types.ObjectId(jobId),
          type: 'earning',
          status: 'success',
          amount,
          balance_before: wallet.balance,
          balance_after: wallet.balance,
          description: `Thu nhập MÔ PHỎNG từ công việc #${jobId.slice(-6)} (demo — chưa có cổng thanh toán thật, không rút được)`,
          reference: `SIM-PAYOUT-${Date.now()}`,
          metadata: { simulated: true, simulated_balance_after: simulatedAfter },
        },
      ],
      { session: session ?? undefined },
    );
    return tx;
  }

  // ─── Credit ví dùng chung (không gắn với 1 Job cụ thể) ─────────────────────
  // Dùng cho các luồng ngoài Job như chốt lương hợp đồng theo tháng
  // (Feature 08): Transaction.job_id là optional trong schema nên có thể bỏ
  // trống; định danh nguồn tiền nằm ở `reference` + `metadata` để đối soát.

  async creditWallet(
    userId: string,
    amount: number,
    opts: {
      description: string;
      reference: string;
      type?: string;
      // R13-N1: true = hoàn tác/khôi phục (vd rollback phí sàn sau lỗi
      // nghiệm thu) — trả nguyên vẹn cho thợ, KHÔNG dùng để trừ nợ.
      skipDebtRepayment?: boolean;
    },
    session?: ClientSession | null,
  ): Promise<TransactionDocument> {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Số tiền cộng ví phải lớn hơn 0');
    }
    const wallet = await this.getOrCreateWallet(userId, session);

    // R13-N1: như creditHelper — thu hồi phí sàn còn nợ từ thu nhập thật
    // trong cùng $inc nguyên tử (guard commission_debt >= repaid, thử lại
    // tối đa 5 lần). Trừ khi skipDebtRepayment (hoàn tác).
    let repaid = 0;
    let debtRemaining = 0;
    let updatedWallet: WalletDocument | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const fresh = attempt === 0 ? wallet : await this.getOrCreateWallet(userId, session);
      const debt = opts.skipDebtRepayment ? 0 : Math.max(0, (fresh as any).commission_debt ?? 0);
      repaid = Math.min(amount, debt);
      updatedWallet = await this.walletModel
        .findOneAndUpdate(
          // R13-N1b (review 2): như creditHelper — chỉ kèm guard khi repaid > 0,
          // ví trước R13 thiếu field commission_debt sẽ trượt guard $gte: 0.
          {
            _id: fresh._id,
            ...(repaid > 0 ? { commission_debt: { $gte: repaid } } : {}),
          },
          {
            $inc: {
              balance: amount - repaid,
              ...(repaid > 0 ? { commission_debt: -repaid } : {}),
              total_earned: amount,
            },
          },
          { new: true, session: session ?? undefined },
        )
        .exec();
      if (updatedWallet) {
        debtRemaining = Math.max(0, (updatedWallet as any).commission_debt ?? 0);
        break;
      }
    }
    if (!updatedWallet) {
      throw new ConflictException('Không thể cộng tiền do xung đột song song, vui lòng thử lại');
    }
    const balanceAfter = updatedWallet.balance;
    const balanceBefore = balanceAfter - (amount - repaid);

    const [tx] = await this.transactionModel.create(
      [
        {
          wallet_id: wallet._id,
          user_id: new Types.ObjectId(userId),
          // Không truyền job_id: giao dịch không thuộc về 1 Job nào (schema cho phép)
          type: opts.type ?? 'earning',
          status: 'success',
          amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          description:
            opts.description +
            (repaid > 0
              ? ` — đã trừ ${repaid.toLocaleString('vi-VN')}₫ phí sàn tiền mặt còn nợ (còn nợ ${debtRemaining.toLocaleString('vi-VN')}₫)`
              : ''),
          reference: opts.reference,
          metadata:
            repaid > 0
              ? { reference: opts.reference, debt_repaid: repaid, debt_remaining: debtRemaining }
              : { reference: opts.reference },
        },
      ],
      { session: session ?? undefined },
    );
    return tx;
  }

  /** Trừ tiền ví dùng chung (dùng cho hoàn tác hoặc điều chỉnh) */
  async deductWallet(
    userId: string,
    amount: number,
    reason: string,
    session?: ClientSession | null,
  ): Promise<TransactionDocument> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Số tiền trừ ví phải lớn hơn 0');
    }
    const wallet = await this.getOrCreateWallet(userId, session);

    // G2: guard nguyên tử $gte — chỉ trừ khi số dư đủ; trước đây $inc trừ
    // thẳng rồi kẹp balance_after về 0 bằng Math.max, ví có thể âm thầm âm
    // trong khi giao dịch ghi balance_after = 0. balance_after lấy từ kết
    // quả $inc (new: true).
    const updatedWallet = await this.walletModel
      .findOneAndUpdate(
        { _id: wallet._id, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: true, session: session ?? undefined },
      )
      .exec();
    if (!updatedWallet) {
      throw new BadRequestException(
        `Số dư không đủ để trừ ${amount.toLocaleString('vi-VN')}₫. Hiện có: ${wallet.balance.toLocaleString('vi-VN')}₫`,
      );
    }
    const balanceAfter = updatedWallet.balance;
    const balanceBefore = balanceAfter + amount;

    const [tx] = await this.transactionModel.create(
      [
        {
          wallet_id: wallet._id,
          user_id: new Types.ObjectId(userId),
          type: 'adjustment',
          status: 'success',
          amount: -amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          description: reason,
          reference: `ADJ-${Date.now()}`,
        },
      ],
      { session: session ?? undefined },
    );
    return tx;
  }

  /** P0-5: Trừ số dư mô phỏng (dùng cho hoàn tác giải ngân mô phỏng khi nghiệm thu thất bại) */
  async deductWalletSimulated(
    userId: string,
    amount: number,
    reason: string,
    session?: ClientSession | null,
  ): Promise<TransactionDocument> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Số tiền trừ ví mô phỏng phải lớn hơn 0');
    }
    const wallet = await this.getOrCreateWallet(userId, session);

    const updatedWallet = await this.walletModel
      .findOneAndUpdate(
        { _id: wallet._id, simulated_balance: { $gte: amount } },
        { $inc: { simulated_balance: -amount } },
        { new: true, session: session ?? undefined },
      )
      .exec();
    if (!updatedWallet) {
      throw new BadRequestException(
        `Số dư mô phỏng không đủ để trừ ${amount.toLocaleString('vi-VN')}₫. Hiện có: ${(wallet.simulated_balance ?? 0).toLocaleString('vi-VN')}₫`,
      );
    }
    const simulatedAfter = updatedWallet.simulated_balance;

    const [tx] = await this.transactionModel.create(
      [
        {
          wallet_id: wallet._id,
          user_id: new Types.ObjectId(userId),
          type: 'adjustment',
          status: 'success',
          amount: -amount,
          balance_before: wallet.balance,
          balance_after: wallet.balance,
          description: reason,
          reference: `SIM-ADJ-${Date.now()}`,
          metadata: { simulated: true, simulated_balance_after: simulatedAfter },
        },
      ],
      { session: session ?? undefined },
    );
    return tx;
  }

  // ─── Deduct platform commission for Cash jobs (Helper collected 100% cash) ──

  async deductCommissionForCashJob(
    helperId: string,
    jobId: string,
    platformFee: number,
    helperNetEarned = 0,
    session?: ClientSession | null,
  ): Promise<TransactionDocument> {
    // P0-5, R3, F5: Idempotency check & atomic claim — chống trừ phí hoa hồng tiền mặt trùng 2 lần
    if (
      this.transactionModel &&
      typeof this.transactionModel.findOne === 'function' &&
      Types.ObjectId.isValid(jobId)
    ) {
      const existingTx = await this.transactionModel
        .findOne({
          job_id: new Types.ObjectId(jobId),
          user_id: new Types.ObjectId(helperId),
          type: 'commission',
          status: 'success',
        })
        .session(session ?? null)
        .exec();
      if (existingTx) {
        return existingTx;
      }
    }

    // F5: Atomic claim trên Job nếu có jobModel để chống race condition song song
    let didClaimJob = false;
    if (
      this.jobModel &&
      typeof this.jobModel.findOneAndUpdate === 'function' &&
      Types.ObjectId.isValid(jobId)
    ) {
      const claimed = await this.jobModel
        .findOneAndUpdate(
          {
            _id: new Types.ObjectId(jobId),
            cash_commission_deducted: { $ne: true },
          },
          {
            $set: { cash_commission_deducted: true },
          },
          { session: session ?? undefined },
        )
        .exec();

      if (!claimed) {
        // Đã bị claim bởi 1 thao tác khác chạy song song! Chờ và trả về transaction đã trừ
        if (this.transactionModel && typeof this.transactionModel.findOne === 'function') {
          for (let wait = 0; wait < 10; wait++) {
            const tx = await this.transactionModel
              .findOne({
                job_id: new Types.ObjectId(jobId),
                user_id: new Types.ObjectId(helperId),
                type: 'commission',
                status: 'success',
              })
              .session(session ?? null)
              .exec();
            if (tx) return tx;
            await new Promise(r => setTimeout(r, 50));
          }
        }
        // I2: Sau 500ms vẫn chưa thấy giao dịch từ lần trừ đầu -> ném ConflictException để chặn trừ trùng
        throw new ConflictException(
          'Giao dịch trừ phí hoa hồng cho đơn hàng đang được xử lý bởi thao tác khác. Vui lòng thử lại sau.',
        );
      } else {
        didClaimJob = true;
      }
    }

    // I2: Nối didClaimJob vào luồng để guard cứng thực sự chặn trừ trùng
    if (
      this.jobModel &&
      typeof this.jobModel.findOneAndUpdate === 'function' &&
      Types.ObjectId.isValid(jobId) &&
      !didClaimJob
    ) {
      throw new ConflictException(
        'Không thể claim trừ phí hoa hồng cho đơn hàng (đang được xử lý bởi thao tác khác).',
      );
    }
    // H5 (G2): mẫu nguyên tử như deductWallet — $inc có guard $gte trên số
    // tiền trừ THỰC TẾ, balance_after lấy TỪ KẾT QUẢ $inc (new: true).
    // Khác deductWallet ở chỗ: ví không đủ phí thì KHÔNG ném lỗi mà chỉ trừ
    // tối đa số dư còn lại, phần thiếu ghi unpaid_fee (giữ logic cũ, xem
    // B43) — nên guard là $gte: deducted chứ không phải $gte: platformFee.
    // deducted tính từ số dư vừa đọc nên có thể lỗi thời nếu 1 lần trừ khác
    // chen ngang: khi đó $inc trả null, đọc lại số dư và thử lại (tối đa 5
    // lần). Mỗi lần thử đều nguyên tử nên 2 lần trừ song song không bao giờ
    // làm ví âm và tổng số trừ không vượt số dư ban đầu.
    // R13-N1: phần thiếu (fee − deducted) GHI NỢ vào commission_debt trong
    // CÙNG $inc — cờ cash_commission_deducted đã set thì lần trừ này không
    // bao giờ chạy lại được, nên đây là nơi duy nhất để ghi nợ. Nợ được
    // trừ dần từ thu nhập thật sau này (xem creditHelper/creditWallet) và
    // khi rút tiền (xem requestWithdrawal).
    // API-M6: bọc toàn bộ khối trừ ví trong try/catch để giải phóng cờ cash_commission_deducted nếu lỗi
    try {
      const fee = Math.max(0, platformFee);
      let wallet: WalletDocument | null = null;
      let deducted = 0;
      let balanceAfter: number | undefined;
      let debtAfter = 0;
      for (let attempt = 0; attempt < 5; attempt++) {
        wallet = await this.getOrCreateWallet(helperId, session);
        deducted = Math.min(Math.max(0, wallet.balance), fee);
        const shortfall = fee - deducted;
        const updatedWallet = await this.walletModel
          .findOneAndUpdate(
            { _id: wallet._id, balance: { $gte: deducted } },
            {
              $inc: {
                balance: -deducted,
                ...(shortfall > 0 ? { commission_debt: shortfall } : {}),
                total_earned: helperNetEarned,
              },
            },
            { new: true, session: session ?? undefined },
          )
          .exec();
        if (updatedWallet) {
          balanceAfter = updatedWallet.balance;
          debtAfter = Math.max(0, (updatedWallet as any).commission_debt ?? 0);
          break;
        }
        // Số dư đổi giữa chừng do 1 lần trừ khác chen ngang — đọc lại, thử lại.
      }
      if (balanceAfter === undefined || !wallet) {
        throw new ConflictException(
          'Không thể trừ phí sàn do xung đột song song, vui lòng thử lại',
        );
      }
      const balanceBefore = balanceAfter + deducted;

      const feePercent =
        platformFee + helperNetEarned > 0
          ? Math.round((platformFee / (platformFee + helperNetEarned)) * 100)
          : 15;

      const [tx] = await this.transactionModel.create(
        [
          {
            wallet_id: wallet._id,
            user_id: new Types.ObjectId(helperId),
            job_id: new Types.ObjectId(jobId),
            type: 'commission',
            status: 'success',
            // P2-14: record what was ACTUALLY deducted, not the full fee —
            // the UI renders -tx.amount, so the full fee overstated the
            // deduction whenever the wallet was short. Full fee + shortfall
            // stay in metadata for reconciliation.
            amount: deducted,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            description: `Khấu trừ phí sàn (${feePercent}%) đơn Tiền mặt #${jobId.slice(-6)}`,
            metadata: {
              payment_method: 'cash',
              job_id: jobId,
              platform_fee: platformFee,
              platform_fee_percent: feePercent,
              total_price: platformFee + helperNetEarned,
              unpaid_fee: platformFee - deducted,
              // R13-N1: tổng nợ phí sàn sau lần trừ này (để đối chiếu; xem
              // Wallet.commission_debt — nguồn thật của số nợ).
              commission_debt_after: debtAfter,
              helper_net_earned:
                helperNetEarned ||
                (feePercent > 0 && feePercent < 100
                  ? Math.round((platformFee * (100 - feePercent)) / feePercent)
                  : Math.round((platformFee * 85) / 15)),
            },
          },
        ],
        { session: session ?? undefined },
      );
      return tx;
    } catch (err) {
      if (didClaimJob && this.jobModel && Types.ObjectId.isValid(jobId)) {
        try {
          await this.jobModel
            .updateOne(
              { _id: new Types.ObjectId(jobId) },
              { $unset: { cash_commission_deducted: 1 } },
              { session: session ?? undefined },
            )
            .exec();
        } catch (unsetErr) {
          this.logger.error(
            `Failed to rollback cash_commission_deducted flag for job ${jobId}: ${unsetErr}`,
          );
        }
      }
      throw err;
    }
  }

  /** Rollback debt increase when cash commission deduction needs rollback on approval failure */
  async reverseCommissionDebt(helperId: string, amount: number): Promise<void> {
    if (!amount || amount <= 0 || !this.walletModel) return;
    await this.walletModel
      .updateOne({ user_id: new Types.ObjectId(helperId) }, { $inc: { commission_debt: -amount } })
      .exec()
      .catch(err => {
        this.logger.error(`Failed to reverse commission debt for user ${helperId}: ${err}`);
      });
  }

  // ─── Refund customer wallet on Dispute Resolution ──────────────────────────

  async refundCustomer(
    customerId: string,
    jobId: string,
    refundAmount: number,
    reason: string,
  ): Promise<TransactionDocument> {
    // B42: Chỉ hoàn tiền dương — số âm/0 sẽ làm sai lệch ví khách
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      throw new BadRequestException('Số tiền hoàn cho khách phải lớn hơn 0₫');
    }
    // Owner decision 2026-11-07 (keep simulation): a refund follows the
    // nature of the payment it reverses. A job paid by simulated
    // VietQR/MoMo/ZaloPay never collected real money, so its refund credits
    // ONLY simulated_balance — never the withdrawable balance. Real payments
    // keep the existing real refund. Lookup failures fail closed toward the
    // existing real refund (hasSimulatedOnlinePayment returns false then).
    const simulatedRefund = await this.hasSimulatedOnlinePayment(jobId);
    // B91 + API-m2: cộng ví + ghi giao dịch hoàn tiền trong 1 transaction
    return this.runInTransaction(async session => {
      // API-M1: Kiểm tra idempotency — không hoàn 2 lần cùng 1 job/dispute
      if (this.transactionModel && typeof this.transactionModel.findOne === 'function') {
        const txQ = this.transactionModel.findOne({
          job_id: new Types.ObjectId(jobId),
          type: 'refund',
          status: 'success',
        });
        if (session && typeof (txQ as any)?.session === 'function') {
          (txQ as any).session(session);
        }
        const existingTx =
          typeof (txQ as any)?.exec === 'function' ? await (txQ as any).exec() : await txQ;
        if (existingTx && (existingTx.type === 'refund' || existingTx.status === 'success')) {
          this.logger.warn(
            `refundCustomer: Job ${jobId} already has a successful refund transaction ${existingTx._id}, returning existing`,
          );
          return existingTx;
        }
      }

      const wallet = await this.getOrCreateWallet(customerId, session);
      const balanceBefore = wallet.balance;
      const balanceAfter = simulatedRefund ? balanceBefore : balanceBefore + refundAmount;

      // API-m1: findByIdAndUpdate thêm { new: true } để simulatedAfter đúng số sau hoàn
      const updatedWallet = await this.walletModel
        .findByIdAndUpdate(
          wallet._id,
          simulatedRefund
            ? { $inc: { simulated_balance: refundAmount } }
            : { $inc: { balance: refundAmount } },
          { session, new: true },
        )
        .exec();
      const simulatedAfter = simulatedRefund
        ? (updatedWallet?.simulated_balance ?? (wallet.simulated_balance ?? 0) + refundAmount)
        : undefined;

      const [tx] = await this.transactionModel.create(
        [
          {
            wallet_id: wallet._id,
            user_id: new Types.ObjectId(customerId),
            job_id: new Types.ObjectId(jobId),
            type: 'refund',
            status: 'success',
            amount: refundAmount,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            description:
              `Hoàn tiền khiếu nại công việc #${jobId.slice(-6)}: ${reason}` +
              (simulatedRefund
                ? ' (MÔ PHỎNG — hoàn vào số dư mô phỏng, không phải tiền thật)'
                : ''),
            ...(simulatedRefund
              ? { metadata: { simulated: true, simulated_balance_after: simulatedAfter } }
              : {}),
          },
        ],
        { session },
      );
      return tx;
    });
  }

  /**
   * G1 (H8): Đã có giao dịch hoàn tiền THÀNH CÔNG cho đơn này chưa — guard
   * idempotency cho đường retry hoàn tiền (sweepPendingRefundRetries).
   * refundCustomer luôn ghi 1 Transaction { job_id, type: 'refund',
   * status: 'success' } cùng transaction với cộng ví, nên có bản ghi này
   * nghĩa là tiền đã vào ví khách rồi — lần quét sau chỉ đồng bộ lại trạng
   * thái đơn, không hoàn lần nữa. Chỉ đọc, không đổi luồng hoàn tiền lần đầu.
   */
  async hasSuccessfulRefund(jobId: string): Promise<boolean> {
    if (!this.transactionModel || typeof this.transactionModel.findOne !== 'function') return false;
    const tx = await this.transactionModel
      .findOne({ job_id: new Types.ObjectId(jobId), type: 'refund', status: 'success' })
      .select('_id')
      .lean()
      .exec();
    return Boolean(tx);
  }

  /** N4: Tính tổng số tiền đã hoàn thành công cho đơn hàng này */
  async getTotalRefundedForJob(jobId: string): Promise<number> {
    if (!this.transactionModel || typeof this.transactionModel.find !== 'function') return 0;
    const txs = await this.transactionModel
      .find({
        job_id: new Types.ObjectId(jobId),
        type: 'refund',
        status: 'success',
      })
      .select('amount')
      .lean()
      .exec();
    return txs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  }

  /** P0-3 & F6: Tính tổng số tiền net khách đã thanh toán thành công cho đơn hàng (tổng thanh toán trừ đi tổng đã hoàn tiền) */
  async getTotalPaidForJob(jobId: string, session?: ClientSession | null): Promise<number> {
    if (!this.transactionModel || typeof this.transactionModel.find !== 'function') return 0;
    // B5e (R5): attach the session only when one is passed AND the query
    // object supports .session() — a real Mongoose query always does; a
    // unit-test double of the model may not, and skipping it then is
    // correct (no transaction in play). Calling .session() unconditionally
    // broke the mocked F6 test (p0-fixes.spec.ts).
    const paidQuery = (type: string) => {
      const q: any = this.transactionModel
        .find({
          job_id: new Types.ObjectId(jobId),
          type,
          status: 'success',
        })
        .select('amount');
      if (session && typeof q.session === 'function') q.session(session);
      return q.lean().exec();
    };
    const [payments, refunds] = await Promise.all([paidQuery('payment'), paidQuery('refund')]);
    const totalPaid = (payments || []).reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const totalRefunded = (refunds || []).reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const netPaid = Math.max(0, totalPaid - totalRefunded);

    // F6: Cập nhật paid_amount trên Job cho khớp với tổng thực tế đã trả (nếu có jobModel)
    // B5e (R5): when called from inside a transaction (mockPayJob), this
    // sync write MUST run in the same session. It bumps the job's
    // updated_at (timestamps), so running it outside the transaction and
    // then writing the same job document inside it is a WriteConflict ->
    // withTransaction retries the whole flow in a loop for up to the
    // driver's 120s MAX_TIMEOUT and the request never answers. Callers
    // outside any transaction pass no session and behave exactly as before.
    if (
      this.jobModel &&
      typeof this.jobModel.updateOne === 'function' &&
      Types.ObjectId.isValid(jobId)
    ) {
      // B5e (R5): pass the session through ONLY when one is in play — the
      // no-session call keeps its exact 2-argument shape (the F6 spec
      // asserts it), and the in-transaction call runs in the session.
      await this.jobModel
        .updateOne(
          { _id: new Types.ObjectId(jobId) },
          { $set: { paid_amount: netPaid, refunded_amount: totalRefunded } },
          ...(session ? [{ session }] : []),
        )
        .exec()
        .catch(() => undefined);
    }

    return netPaid;
  }

  /**
   * B5e (R5): reset a stuck PROCESSING claim back to UNPAID. The reset does
   * NOT use the (possibly failed) payment session — it is a plain write.
   * A failed pay must never leave a stuck claim: retry once after a short
   * delay, and LOG LOUDLY (job id + reason) if the reset itself fails, so
   * the only remaining backstop is the 15-min `clearStuckProcessingPayments`
   * cron — never silence.
   */
  private async resetPaymentClaim(jobId: string, reason: string): Promise<void> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.jobModel!.updateOne(
          { _id: new Types.ObjectId(jobId), payment_status: PaymentStatus.PROCESSING },
          { $set: { payment_status: PaymentStatus.UNPAID } },
        ).exec();
        return;
      } catch (resetErr: any) {
        if (attempt === 1) {
          this.logger.warn(
            `B5e: reset job ${jobId} payment_status to UNPAID failed (attempt 1/2, reason: ${reason}), retrying: ${resetErr?.message ?? resetErr}`,
          );
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        // F20: lỗi reset trạng thái phải được log rõ, không nuốt im lặng.
        this.logger.error(
          `B5e: FAILED to reset job ${jobId} payment_status to UNPAID after payment error (reason: ${reason}) — claim may stay PROCESSING until the 15-min stuck-payment cron clears it: ${resetErr?.message ?? resetErr}`,
        );
      }
    }
  }

  // ─── Báo cáo thu nhập nâng cao (Feature 14) ────────────────────────────────
  //
  // Định nghĩa thống nhất: mọi tổng trong báo cáo đều là NET =
  //   sum(type='earning') − sum(type='commission')
  // tính trên Transaction status='success' của chính thợ. (Phí sàn đơn tiền
  // mặt được ghi là 1 transaction 'commission' riêng nên trừ ở đây là đúng;
  // đơn online đã giải ngân số NET vào 'earning' và không có transaction
  // commission đi kèm nên không bị trừ 2 lần.)
  // Volume giao dịch của 1 thợ nhỏ → cộng dồn in-memory trên ~2 tháng gần nhất
  // là đủ và đơn giản hơn aggregation pipeline.

  async getEarningsReport(userId: string) {
    // T3: Chuẩn hóa theo múi giờ Việt Nam Asia/Ho_Chi_Minh (UTC+7)
    const toVn = (d: Date) => new Date(d.getTime() + 7 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateKey = (d: Date) => {
      const vn = toVn(d);
      return `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}-${pad(vn.getUTCDate())}`;
    };
    const startOfDayVn = (d: Date) => {
      const key = dateKey(d);
      return new Date(`${key}T00:00:00+07:00`);
    };
    const addDaysVn = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

    const now = new Date();
    const today = startOfDayVn(now);
    const vnNow = toVn(now);
    // Tuần hiện tại: Thứ 2 – Chủ nhật
    const vnDayOfWeek = (vnNow.getUTCDay() + 6) % 7;
    const monday = addDaysVn(today, -vnDayOfWeek);
    const prevWeekStart = addDaysVn(monday, -7);
    const nextMonday = addDaysVn(monday, 7);

    const vnYear = vnNow.getUTCFullYear();
    const vnMonth = vnNow.getUTCMonth();
    const monthStart = new Date(Date.UTC(vnYear, vnMonth, 1) - 7 * 60 * 60 * 1000);
    const prevMonthStart = new Date(Date.UTC(vnYear, vnMonth - 1, 1) - 7 * 60 * 60 * 1000);
    const nextMonthStart = new Date(Date.UTC(vnYear, vnMonth + 1, 1) - 7 * 60 * 60 * 1000);
    const fetchSince = prevWeekStart < prevMonthStart ? prevWeekStart : prevMonthStart;

    const buildEmptyReport = (monthlyGoal = 0) => {
      const weekDays = Array.from({ length: 7 }, (_, i) => {
        const day = addDaysVn(monday, i);
        return { date: dateKey(day), amount: 0 };
      });
      return {
        week: {
          days: weekDays,
          total: 0,
          prev_week_total: 0,
          change_percent: null,
        },
        month: {
          total: 0,
          jobs_earning_count: 0,
          prev_month_total: 0,
          change_percent: null,
          by_week: [1, 2, 3, 4, 5].map(week => ({ week, amount: 0 })),
        },
        goal: {
          monthly_goal: monthlyGoal,
          earned_this_month: 0,
          progress_percent: 0,
        },
      };
    };

    if (!userId || !Types.ObjectId.isValid(userId)) {
      return buildEmptyReport();
    }

    try {
      const txs = await this.transactionModel
        .find({
          user_id: new Types.ObjectId(userId),
          status: 'success',
          type: { $in: ['earning', 'commission'] },
          created_at: {
            $gte: fetchSince,
            $lt: nextMonthStart > nextMonday ? nextMonthStart : nextMonday,
          },
        })
        .maxTimeMS(5000)
        .sort({ created_at: 1 })
        .lean()
        .exec();

      const signed = (tx: (typeof txs)[number]) => {
        if (tx.type === 'earning') return tx.amount;
        if (tx.type === 'commission') {
          const meta = tx.metadata as any;
          if (typeof meta?.helper_net_earned === 'number' && meta.helper_net_earned > 0) {
            return meta.helper_net_earned;
          }
          // FEE-15: fallback theo tỉ lệ phí thật của đơn thay vì hardcode 85/15
          const feePercent =
            typeof meta?.platform_fee_percent === 'number'
              ? meta.platform_fee_percent
              : typeof meta?.platform_fee === 'number' &&
                  typeof meta?.total_price === 'number' &&
                  meta.total_price > 0
                ? Math.round((meta.platform_fee / meta.total_price) * 100)
                : 15;
          const helperRate = (100 - feePercent) / (feePercent || 15);
          return Math.round(tx.amount * helperRate);
        }
        return 0;
      };
      const sumIn = (from: Date, to: Date) =>
        txs
          .filter(tx => {
            const d = new Date(tx.created_at);
            return d >= from && d < to;
          })
          .reduce((sum, tx) => sum + signed(tx), 0);
      const changePercent = (current: number, previous: number): number | null => {
        if (previous === 0) return null;
        return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
      };

      // Tuần hiện tại theo từng ngày
      const weekDays = Array.from({ length: 7 }, (_, i) => {
        const day = addDaysVn(monday, i);
        return { date: dateKey(day), amount: sumIn(day, addDaysVn(day, 1)) };
      });
      const weekTotal = weekDays.reduce((sum, d) => sum + d.amount, 0);
      const prevWeekTotal = sumIn(prevWeekStart, monday);

      // Tháng hiện tại + theo tuần trong tháng (tuần 1 = ngày 1–7, …)
      const monthTxs = txs.filter(tx => {
        const d = new Date(tx.created_at);
        return d >= monthStart && d < nextMonthStart;
      });
      const monthTotal = monthTxs.reduce((sum, tx) => sum + signed(tx), 0);
      const prevMonthTotal = sumIn(prevMonthStart, monthStart);
      const byWeekMap = new Map<number, number>();
      for (const tx of monthTxs) {
        const vnD = toVn(new Date(tx.created_at));
        const weekOfMonth = Math.floor((vnD.getUTCDate() - 1) / 7) + 1;
        byWeekMap.set(weekOfMonth, (byWeekMap.get(weekOfMonth) ?? 0) + signed(tx));
      }
      const byWeek = [1, 2, 3, 4, 5].map(week => ({
        week,
        amount: byWeekMap.get(week) ?? 0,
      }));

      const profile = await this.helperModel
        .findOne({ user_id: new Types.ObjectId(userId) })
        .maxTimeMS(5000)
        .select('income_goal_monthly')
        .lean()
        .exec();
      const monthlyGoal = profile?.income_goal_monthly ?? 0;

      return {
        week: {
          days: weekDays,
          total: weekTotal,
          prev_week_total: prevWeekTotal,
          change_percent: changePercent(weekTotal, prevWeekTotal),
        },
        month: {
          total: monthTotal,
          jobs_earning_count: monthTxs.filter(
            tx => tx.type === 'earning' || tx.type === 'commission',
          ).length,
          prev_month_total: prevMonthTotal,
          change_percent: changePercent(monthTotal, prevMonthTotal),
          by_week: byWeek,
        },
        goal: {
          monthly_goal: monthlyGoal,
          earned_this_month: monthTotal,
          progress_percent:
            monthlyGoal > 0
              ? Math.round(Math.max(0, Math.min(100, (monthTotal / monthlyGoal) * 100)) * 10) / 10
              : 0,
        },
      };
    } catch {
      return buildEmptyReport();
    }
  }

  // ─── Transactions ─────────────────────────────────────────────────────────

  async getTransactions(userId: string, page = 1, limit = 20) {
    // P3-3: Chặn limit tối đa 50
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;
    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find({ user_id: new Types.ObjectId(userId) })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(safeLimit)
        .exec(),
      this.transactionModel.countDocuments({ user_id: new Types.ObjectId(userId) }).exec(),
    ]);
    return {
      transactions,
      total,
      page: safePage,
      limit: safeLimit,
      total_pages: Math.ceil(total / safeLimit),
    };
  }

  // ─── Withdrawal ───────────────────────────────────────────────────────────

  async requestWithdrawal(
    helperId: string,
    amount: number,
    bankAccount?: BankAccountInfoDto,
  ): Promise<WithdrawalDocument> {
    if (!amount || amount <= 0 || isNaN(amount)) {
      throw new BadRequestException('Số tiền rút phải lớn hơn 0₫');
    }
    // B44: Số tiền rút phải là số nguyên (VNĐ không có đơn vị nhỏ hơn đồng)
    if (!Number.isInteger(amount)) {
      throw new BadRequestException('Số tiền rút phải là số nguyên (không có phần thập phân)');
    }

    // API-m8: Chặn rút trùng bằng claim nguyên tử ở DB, không dùng Set trong bộ nhớ
    await this.getOrCreateWallet(helperId);
    if (this.walletModel && typeof this.walletModel.findOneAndUpdate === 'function') {
      const claimed = await this.walletModel
        .findOneAndUpdate(
          {
            user_id: new Types.ObjectId(helperId),
            withdrawal_in_progress: { $ne: true },
          },
          {
            $set: { withdrawal_in_progress: true },
          },
          { new: true },
        )
        .exec();
      if (!claimed) {
        throw new ConflictException('Bạn đã có yêu cầu rút tiền đang chờ xử lý');
      }
    }

    let wallet: any = null;
    let withdrawal: any = null;
    try {
      const pending = await this.withdrawalModel
        .findOne({ user_id: new Types.ObjectId(helperId), status: 'pending' })
        .exec();
      if (pending) throw new ConflictException('Bạn đã có yêu cầu rút tiền đang chờ xử lý');
      const resolvedBankAccount =
        bankAccount ??
        (await this.helperModel.findOne({ user_id: new Types.ObjectId(helperId) }).exec())
          ?.bank_account;
      if (!resolvedBankAccount?.account_number) {
        throw new BadRequestException('Vui lòng cập nhật tài khoản ngân hàng trước khi rút tiền');
      }

      // R13-N1: rút tiền thì quyết toán nợ phí sàn TRƯỚC — nợ trừ thẳng từ
      // số dư trong cùng $inc nguyên tử, rồi mới trả phần còn lại cho thợ.
      // Thợ chỉ rút được tối đa balance − debt; nếu phần còn lại nhỏ hơn số
      // tiền yêu cầu thì từ chối với lý do rõ ràng kèm số nợ.
      const current = await this.getOrCreateWallet(helperId);
      const debt = Math.max(0, (current as any).commission_debt ?? 0);
      const debtToSettle = Math.min(debt, current.balance);
      const maxPayout = current.balance - debtToSettle;
      if (amount > maxPayout) {
        throw new BadRequestException(
          debtToSettle > 0
            ? `Số tiền rút tối đa là ${maxPayout.toLocaleString('vi-VN')}₫ vì bạn còn nợ ${debt.toLocaleString('vi-VN')}₫ phí sàn tiền mặt — phí nợ sẽ được trừ trước khi rút.`
            : `Số dư không đủ. Hiện có: ${current.balance.toLocaleString('vi-VN')}₫`,
        );
      }
      wallet = await this.walletModel
        .findOneAndUpdate(
          {
            user_id: new Types.ObjectId(helperId),
            balance: { $gte: amount + debtToSettle },
            // R13-N1b (review 2): chỉ kèm guard khi debtToSettle > 0 — ví
            // trước R13 thiếu field commission_debt sẽ trượt guard $gte: 0
            // và thợ nhận nhầm lỗi "Số dư không đủ" dù đủ tiền.
            ...(debtToSettle > 0 ? { commission_debt: { $gte: debtToSettle } } : {}),
          },
          {
            $inc: {
              balance: -(amount + debtToSettle),
              ...(debtToSettle > 0 ? { commission_debt: -debtToSettle } : {}),
            },
          },
          { new: true },
        )
        .exec();
      if (!wallet) {
        const reread = await this.getOrCreateWallet(helperId);
        throw new BadRequestException(
          `Số dư không đủ. Hiện có: ${reread.balance.toLocaleString('vi-VN')}₫`,
        );
      }

      try {
        withdrawal = await this.withdrawalModel.create({
          user_id: new Types.ObjectId(helperId),
          amount,
          status: 'pending',
          bank_account: {
            bank_name: resolvedBankAccount.bank_name,
            account_number: resolvedBankAccount.account_number,
            account_name: resolvedBankAccount.account_name,
          },
        });

        await this.transactionModel.create({
          wallet_id: wallet._id,
          user_id: new Types.ObjectId(helperId),
          type: 'withdrawal',
          status: 'pending',
          amount,
          balance_before: wallet.balance + amount + debtToSettle,
          balance_after: wallet.balance,
          description:
            `Yêu cầu rút tiền` +
            (debtToSettle > 0
              ? ` (đã trừ ${debtToSettle.toLocaleString('vi-VN')}₫ phí sàn tiền mặt còn nợ)`
              : ''),
          metadata: { withdrawal_id: String(withdrawal._id), debt_settled: debtToSettle },
        });

        return withdrawal;
      } catch (err) {
        if (withdrawal?._id) {
          await this.withdrawalModel
            .deleteOne({ _id: withdrawal._id })
            .exec()
            .catch(() => null);
        }
        await this.walletModel
          // R13-N1: hoàn lại CẢ phần nợ đã quyết toán cùng lần rút này,
          // nếu không thợ mất tiền nợ trong khi yêu cầu rút đã thất bại.
          .updateOne(
            { _id: wallet._id },
            {
              $inc: {
                balance: amount + debtToSettle,
                ...(debtToSettle > 0 ? { commission_debt: debtToSettle } : {}),
              },
            },
          )
          .exec()
          .catch(refundErr => {
            // F20: hoàn tiền vào ví lỗi thì phải log rõ (tiền rút đã trừ nhưng chưa hoàn lại).
            this.logger.error(
              `Failed to refund ${amount} to wallet ${String(wallet._id)} after withdrawal failure: ${refundErr}`,
            );
          });
        throw err;
      }
    } finally {
      if (this.walletModel && typeof this.walletModel.updateOne === 'function') {
        await this.walletModel
          .updateOne(
            { user_id: new Types.ObjectId(helperId) },
            { $unset: { withdrawal_in_progress: 1 } },
          )
          .exec()
          .catch(() => null);
      }
    }
  }

  async getWithdrawals(userId: string) {
    return this.withdrawalModel
      .find({ user_id: new Types.ObjectId(userId) })
      .sort({ created_at: -1 })
      .exec();
  }

  // ─── Admin: List all withdrawals ──────────────────────────────────────────

  async getAllWithdrawals(status?: string, page = 1, limit = 20) {
    const query: Record<string, unknown> = {};
    if (status) query['status'] = status;
    const skip = (page - 1) * limit;
    const [withdrawals, total] = await Promise.all([
      this.withdrawalModel
        .find(query)
        .populate('user_id', 'full_name phone')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.withdrawalModel.countDocuments(query).exec(),
    ]);
    return { withdrawals, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  // ─── Admin: Process withdrawal ────────────────────────────────────────────

  async processWithdrawal(
    withdrawalId: string,
    action: 'approve' | 'reject',
    adminNote?: string,
    adminId?: string,
  ): Promise<WithdrawalDocument> {
    const withdrawal = await this.withdrawalModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(withdrawalId), status: 'pending' },
        { status: action === 'approve' ? 'completed' : 'rejected' },
        { new: true },
      )
      .exec();
    if (!withdrawal) {
      const exists = await this.withdrawalModel.exists({ _id: new Types.ObjectId(withdrawalId) });
      if (!exists) throw new NotFoundException('Yêu cầu rút tiền không tồn tại');
      throw new BadRequestException('Yêu cầu này đã được xử lý');
    }

    // B91: các ghi ví/giao dịch khi xử lý rút tiền chạy trong 1 transaction
    let refunded = false;
    let refundWalletId: any = null;
    try {
      await this.runInTransaction(async session => {
        if (action === 'approve') {
          await this.walletModel
            .findOneAndUpdate(
              { user_id: withdrawal.user_id },
              { $inc: { total_withdrawn: withdrawal.amount } },
              { session },
            )
            .exec();
          await this.transactionModel
            .findOneAndUpdate(
              { 'metadata.withdrawal_id': withdrawalId },
              { status: 'success' },
              { session },
            )
            .exec();
        } else {
          const wallet = await this.getOrCreateWallet(String(withdrawal.user_id));
          refundWalletId = wallet._id;
          await this.walletModel
            .findByIdAndUpdate(wallet._id, { $inc: { balance: withdrawal.amount } }, { session })
            .exec();
          refunded = true;
          await this.transactionModel.create(
            [
              {
                wallet_id: wallet._id,
                user_id: withdrawal.user_id,
                type: 'refund',
                status: 'success',
                amount: withdrawal.amount,
                balance_before: wallet.balance,
                balance_after: wallet.balance + withdrawal.amount,
                description: `Hoàn tiền rút thất bại`,
              },
            ],
            { session },
          );
          await this.transactionModel
            .findOneAndUpdate(
              { 'metadata.withdrawal_id': withdrawalId },
              { status: 'failed' },
              { session },
            )
            .exec();
        }
      });
    } catch (txErr) {
      await this.withdrawalModel
        .updateOne({ _id: new Types.ObjectId(withdrawalId) }, { $set: { status: 'pending' } })
        .exec()
        .catch(() => undefined);
      if (refunded && refundWalletId) {
        await this.walletModel
          .findByIdAndUpdate(refundWalletId, { $inc: { balance: -withdrawal.amount } })
          .exec()
          .catch(() => undefined);
      }
      throw txErr;
    }
    withdrawal.status = action === 'approve' ? 'completed' : 'rejected';

    withdrawal.admin_note = adminNote;
    withdrawal.processed_at = new Date();
    withdrawal.processed_by = adminId;
    const saved = await withdrawal.save();

    const amount = withdrawal.amount.toLocaleString('vi-VN');
    await this.notificationsService
      .create({
        userId: String(withdrawal.user_id),
        type: NOTIFICATION_TYPES.WITHDRAWAL_PROCESSED,
        title: action === 'approve' ? 'Rút tiền thành công' : 'Yêu cầu rút tiền bị từ chối',
        body:
          action === 'approve'
            ? `${amount}₫ đã được chuyển về tài khoản ngân hàng của bạn.`
            : `${amount}₫ đã được hoàn lại vào ví.${adminNote ? ' Lý do: ' + adminNote : ''}`,
        payload: { withdrawal_id: String(withdrawal._id) },
      })
      .catch(notifyErr => {
        // F20: lỗi gửi thông báo rút tiền phải được log rõ, không nuốt im lặng.
        this.logger.warn(
          `Failed to send withdrawal notification for ${String(withdrawal._id)}: ${(notifyErr as Error)?.message ?? notifyErr}`,
        );
      });
    return saved;
  }

  // ─── Admin: Get all transactions ──────────────────────────────────────────

  async getAllTransactions(type?: string, page = 1, limit = 20) {
    const query: Record<string, unknown> = {};
    if (type) query['type'] = type;
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .populate('user_id', 'full_name phone email')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.transactionModel.countDocuments(query).exec(),
    ]);
    return { transactions, total, page, limit, total_pages: Math.ceil(total / limit) };
  }
}
