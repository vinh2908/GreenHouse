import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
import { PaymentStatus } from '@homemate/types';
import { NotificationsService } from '../notifications/notifications.service';
import { HelperProfile, HelperProfileDocument } from '../helpers/schemas/helper-profile.schema';
import { Job, JobDocument, Contract, ContractDocument } from '../jobs/schemas/job.schema';
import { VouchersService } from '../vouchers/vouchers.service';
import { LoyaltyService } from '../loyalty/loyalty.service';

@Injectable()
export class PaymentsService {
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
  ) {}

  // ─── Wallet ───────────────────────────────────────────────────────────────

  async getOrCreateWallet(userId: string): Promise<WalletDocument> {
    const wallet = await this.walletModel
      .findOneAndUpdate(
        { user_id: new Types.ObjectId(userId) },
        { $setOnInsert: { user_id: new Types.ObjectId(userId) } },
        { upsert: true, new: true },
      )
      .exec();
    return wallet!;
  }

  async getWallet(userId: string): Promise<WalletDocument> {
    return this.getOrCreateWallet(userId);
  }

  async topupWallet(
    userId: string,
    amount: number,
    paymentMethod = 'vietqr',
  ): Promise<{ wallet: WalletDocument; transaction: TransactionDocument }> {
    if (!amount || amount < 50000) {
      throw new BadRequestException('Số tiền nạp tối thiểu là 50,000₫');
    }
    const walletBefore = await this.getOrCreateWallet(userId);
    const updatedWallet = await this.walletModel
      .findByIdAndUpdate(walletBefore._id, { $inc: { balance: amount } }, { new: true })
      .exec();

    const transaction = await this.transactionModel.create({
      wallet_id: walletBefore._id,
      user_id: new Types.ObjectId(userId),
      type: 'topup',
      status: 'success',
      amount,
      balance_before: walletBefore.balance,
      balance_after: updatedWallet?.balance ?? walletBefore.balance + amount,
      description: `Nạp tiền ví ký quỹ qua ${paymentMethod.toUpperCase()}`,
      reference: `TOPUP-${Date.now()}`,
      metadata: { payment_method: paymentMethod },
    });

    return { wallet: updatedWallet ?? walletBefore, transaction };
  }

  // ─── Escrow / Job Payment ──────────────────────────────────────────────────

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
    if (!Types.ObjectId.isValid(jobId)) {
      throw new BadRequestException('Mã công việc (job_id) không hợp lệ');
    }

    let resolvedAmount = amount;
    let discountAmount = 0;
    let appliedVoucherCode: string | undefined;
    let loyaltyPointsRedeemed = 0;
    let loyaltyDiscountAmount = 0;

    if (this.jobModel) {
      const job = await this.jobModel.findById(jobId).exec();
      if (job) {
        if (job.customer_id.toString() !== customerId) {
          throw new ForbiddenException('Bạn không có quyền thanh toán đơn hàng của người khác');
        }
        if (job.payment_status === PaymentStatus.PAID) {
          throw new ConflictException('Đơn hàng này đã được thanh toán trước đó');
        }

        if (resolvedAmount <= 0 && this.contractModel) {
          const contract = await this.contractModel
            .findOne({ job_id: new Types.ObjectId(jobId) })
            .exec();
          if (contract?.total_price) {
            resolvedAmount = contract.total_price;
          }
        }

        // ── Voucher: ghi nhận lượt dùng + tính giảm trên giá chốt của đơn ──
        // Nền tảng chịu phần giảm (thợ vẫn nhận đủ theo hợp đồng). Nếu mã đã
        // hết hạn/hết lượt ở thời điểm thanh toán → ném lỗi rõ ràng để khách
        // gỡ mã rồi thanh toán lại, tránh trừ tiền sai.
        if (job.voucher_code && resolvedAmount > 0 && (job.discount_amount ?? 0) <= 0) {
          const redeemed = await this.vouchersService.redeemForJob(
            customerId,
            jobId,
            job.voucher_code,
            resolvedAmount,
          );
          discountAmount = redeemed.discount_amount;
          appliedVoucherCode = redeemed.voucher.code;
          resolvedAmount = Math.max(0, resolvedAmount - discountAmount);
        }

        // ── Loyalty (Feature 12): trừ điểm thật tại thời điểm thanh toán ──
        // Mirror voucher: nếu số dư điểm lúc này không còn đủ → redeemAtPayment
        // ném BadRequest rõ ràng, thanh toán bị chặn để khách gỡ điểm rồi
        // thanh toán lại. Phần giảm do điểm cũng do sàn chịu (thợ nhận đủ
        // theo hợp đồng như voucher).
        if ((job.loyalty_points_requested ?? 0) > 0 && resolvedAmount > 0) {
          const loyaltyRedeemed = await this.loyaltyService.redeemAtPayment(customerId, jobId);
          if (loyaltyRedeemed) {
            loyaltyPointsRedeemed = loyaltyRedeemed.points_redeemed;
            loyaltyDiscountAmount = loyaltyRedeemed.discount_amount;
            resolvedAmount = Math.max(0, resolvedAmount - loyaltyDiscountAmount);
          }
        }

        await this.jobModel
          .findByIdAndUpdate(job._id, {
            $set: {
              payment_status: PaymentStatus.PAID,
              payment_method: paymentMethod,
              ...(discountAmount > 0 ? { discount_amount: discountAmount } : {}),
            },
          })
          .exec();
      }
    }

    const wallet = await this.getOrCreateWallet(customerId);

    const transaction = await this.transactionModel.create({
      wallet_id: wallet._id,
      user_id: new Types.ObjectId(customerId),
      job_id: new Types.ObjectId(jobId),
      type: 'payment',
      status: 'success',
      amount: resolvedAmount,
      balance_before: wallet.balance,
      balance_after: wallet.balance, // Customer pays via external method/cash, wallet balance unchanged
      description:
        `Thanh toán cho công việc #${jobId.slice(-6)} (${paymentMethod.toUpperCase()})` +
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
    });

    return {
      transaction,
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
  ): Promise<TransactionDocument> {
    const wallet = await this.getOrCreateWallet(helperId);
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + amount;

    // Atomic update
    await this.walletModel
      .findByIdAndUpdate(wallet._id, {
        $inc: { balance: amount, total_earned: amount },
      })
      .exec();

    return this.transactionModel.create({
      wallet_id: wallet._id,
      user_id: new Types.ObjectId(helperId),
      job_id: new Types.ObjectId(jobId),
      type: 'earning',
      status: 'success',
      amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: `Thu nhập từ công việc #${jobId.slice(-6)}`,
    });
  }

  // ─── Credit ví dùng chung (không gắn với 1 Job cụ thể) ─────────────────────
  // Dùng cho các luồng ngoài Job như chốt lương hợp đồng theo tháng
  // (Feature 08): Transaction.job_id là optional trong schema nên có thể bỏ
  // trống; định danh nguồn tiền nằm ở `reference` + `metadata` để đối soát.

  async creditWallet(
    userId: string,
    amount: number,
    opts: { description: string; reference: string; type?: string },
  ): Promise<TransactionDocument> {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Số tiền cộng ví phải lớn hơn 0');
    }
    const wallet = await this.getOrCreateWallet(userId);
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + amount;

    await this.walletModel
      .findByIdAndUpdate(wallet._id, {
        $inc: { balance: amount, total_earned: amount },
      })
      .exec();

    return this.transactionModel.create({
      wallet_id: wallet._id,
      user_id: new Types.ObjectId(userId),
      // Không truyền job_id: giao dịch không thuộc về 1 Job nào (schema cho phép)
      type: opts.type ?? 'earning',
      status: 'success',
      amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: opts.description,
      reference: opts.reference,
      metadata: { reference: opts.reference },
    });
  }

  // ─── Deduct platform commission for Cash jobs (Helper collected 100% cash) ──

  async deductCommissionForCashJob(
    helperId: string,
    jobId: string,
    platformFee: number,
    helperNetEarned = 0,
  ): Promise<TransactionDocument> {
    const wallet = await this.getOrCreateWallet(helperId);
    const balanceBefore = wallet.balance;
    const deducted = Math.min(balanceBefore, Math.max(0, platformFee));
    const balanceAfter = Math.max(0, balanceBefore - deducted);

    await this.walletModel
      .findByIdAndUpdate(wallet._id, {
        $set: { balance: balanceAfter },
        $inc: { total_earned: helperNetEarned },
      })
      .exec();

    return this.transactionModel.create({
      wallet_id: wallet._id,
      user_id: new Types.ObjectId(helperId),
      job_id: new Types.ObjectId(jobId),
      type: 'commission',
      status: 'success',
      amount: platformFee,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: `Khấu trừ phí sàn (15%) đơn Tiền mặt #${jobId.slice(-6)}`,
      metadata: { payment_method: 'cash', job_id: jobId, unpaid_fee: platformFee - deducted },
    });
  }

  // ─── Refund customer wallet on Dispute Resolution ──────────────────────────

  async refundCustomer(
    customerId: string,
    jobId: string,
    refundAmount: number,
    reason: string,
  ): Promise<TransactionDocument> {
    const wallet = await this.getOrCreateWallet(customerId);
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + refundAmount;

    await this.walletModel
      .findByIdAndUpdate(wallet._id, { $inc: { balance: refundAmount } })
      .exec();

    return this.transactionModel.create({
      wallet_id: wallet._id,
      user_id: new Types.ObjectId(customerId),
      job_id: new Types.ObjectId(jobId),
      type: 'refund',
      status: 'success',
      amount: refundAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: `Hoàn tiền khiếu nại công việc #${jobId.slice(-6)}: ${reason}`,
    });
  }

  // ─── Transactions ─────────────────────────────────────────────────────────

  async getTransactions(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find({ user_id: new Types.ObjectId(userId) })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.transactionModel.countDocuments({ user_id: new Types.ObjectId(userId) }).exec(),
    ]);
    return { transactions, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  // ─── Withdrawal ───────────────────────────────────────────────────────────

  async requestWithdrawal(
    helperId: string,
    amount: number,
    bankAccount?: BankAccountInfoDto,
  ): Promise<WithdrawalDocument> {
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

    await this.getOrCreateWallet(helperId);
    const wallet = await this.walletModel
      .findOneAndUpdate(
        { user_id: new Types.ObjectId(helperId), balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: true },
      )
      .exec();
    if (!wallet) {
      const current = await this.getOrCreateWallet(helperId);
      throw new BadRequestException(
        `Số dư không đủ. Hiện có: ${current.balance.toLocaleString('vi-VN')}₫`,
      );
    }

    const withdrawal = await this.withdrawalModel.create({
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
      balance_before: wallet.balance + amount,
      balance_after: wallet.balance,
      description: `Yêu cầu rút tiền`,
      metadata: { withdrawal_id: String(withdrawal._id) },
    });

    return withdrawal;
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

    if (action === 'approve') {
      withdrawal.status = 'completed';
      await this.walletModel
        .findOneAndUpdate(
          { user_id: withdrawal.user_id },
          { $inc: { total_withdrawn: withdrawal.amount } },
        )
        .exec();
      await this.transactionModel
        .findOneAndUpdate({ 'metadata.withdrawal_id': withdrawalId }, { status: 'success' })
        .exec();
    } else {
      withdrawal.status = 'rejected';
      const wallet = await this.getOrCreateWallet(String(withdrawal.user_id));
      await this.walletModel
        .findByIdAndUpdate(wallet._id, {
          $inc: { balance: withdrawal.amount },
        })
        .exec();
      await this.transactionModel.create({
        wallet_id: wallet._id,
        user_id: withdrawal.user_id,
        type: 'refund',
        status: 'success',
        amount: withdrawal.amount,
        balance_before: wallet.balance,
        balance_after: wallet.balance + withdrawal.amount,
        description: `Hoàn tiền rút thất bại`,
      });
      await this.transactionModel
        .findOneAndUpdate({ 'metadata.withdrawal_id': withdrawalId }, { status: 'failed' })
        .exec();
    }

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
      .catch(() => undefined);
    return saved;
  }

  // ─── Admin: Get all transactions ──────────────────────────────────────────

  async getAllTransactions(type?: string, page = 1, limit = 20) {
    const query: Record<string, unknown> = {};
    if (type) query['type'] = type;
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      this.transactionModel.find(query).sort({ created_at: -1 }).skip(skip).limit(limit).exec(),
      this.transactionModel.countDocuments(query).exec(),
    ]);
    return { transactions, total, page, limit, total_pages: Math.ceil(total / limit) };
  }
}
