import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
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
import { NotificationsService } from '../notifications/notifications.service';
import { HelperProfile, HelperProfileDocument } from '../helpers/schemas/helper-profile.schema';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(Withdrawal.name) private withdrawalModel: Model<WithdrawalDocument>,
    @InjectModel(HelperProfile.name) private helperModel: Model<HelperProfileDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── Wallet ───────────────────────────────────────────────────────────────

  async getOrCreateWallet(userId: string, session?: ClientSession): Promise<WalletDocument> {
    const wallet = await this.walletModel
      .findOneAndUpdate(
        { user_id: new Types.ObjectId(userId) },
        { $setOnInsert: { user_id: new Types.ObjectId(userId) } },
        { upsert: true, new: true, session },
      )
      .exec();
    return wallet!;
  }

  async getWallet(userId: string): Promise<WalletDocument> {
    return this.getOrCreateWallet(userId);
  }

  // ─── Mock Payment (Phase 8) ────────────────────────────────────────────────
  // Real payment gateway integration: VNPay / MoMo / ZaloPay in production

  async mockPayJob(
    customerId: string,
    jobId: string,
    amount: number,
    paymentMethod: string,
  ): Promise<{ transaction: TransactionDocument; success: boolean }> {
    if (process.env.NODE_ENV === 'production')
      throw new ForbiddenException(
        'Thanh toán thử nghiệm không khả dụng trên môi trường phát hành',
      );
    const wallet = await this.getOrCreateWallet(customerId);

    // Simulate payment — always succeeds in dev
    const transaction = await this.transactionModel.create({
      wallet_id: wallet._id,
      user_id: new Types.ObjectId(customerId),
      job_id: new Types.ObjectId(jobId),
      type: 'payment',
      status: 'success',
      amount,
      balance_before: wallet.balance,
      balance_after: wallet.balance, // Customer pays out, doesn't affect wallet balance in mock
      description: `Thanh toán cho công việc #${jobId.slice(-6)}`,
      reference: `MOCK-${Date.now()}`,
      metadata: { payment_method: paymentMethod, job_id: jobId },
    });

    return { transaction, success: true };
  }

  // ─── Credit helper wallet after job completion ─────────────────────────────

  async creditHelper(
    helperId: string,
    jobId: string,
    amount: number,
    session?: ClientSession,
  ): Promise<TransactionDocument> {
    if (!Number.isFinite(amount) || amount <= 0)
      throw new BadRequestException('Số tiền không hợp lệ');
    if (!session)
      return this.walletModel.db.transaction(s => this.creditHelper(helperId, jobId, amount, s));
    const key = {
      user_id: new Types.ObjectId(helperId),
      job_id: new Types.ObjectId(jobId),
      type: 'earning',
    };
    const previous = await this.transactionModel.findOne(key).session(session).exec();
    if (previous) return previous;
    const wallet = await this.getOrCreateWallet(helperId, session);
    const updated = await this.walletModel
      .findByIdAndUpdate(
        wallet._id,
        { $inc: { balance: amount, total_earned: amount } },
        { new: true, session },
      )
      .exec();
    return new this.transactionModel({
      ...key,
      wallet_id: wallet._id,
      status: 'success',
      amount,
      balance_before: updated!.balance - amount,
      balance_after: updated!.balance,
      description: `Thu nhập từ công việc #${jobId.slice(-6)}`,
    }).save({ session });
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
    if (!Number.isInteger(amount) || amount < 50000 || amount > 500_000_000)
      throw new BadRequestException('Số tiền rút phải là số nguyên từ 50.000 đến 500.000.000 đồng');
    return this.walletModel.db.transaction(async session => {
      const pending = await this.withdrawalModel
        .findOne({ user_id: new Types.ObjectId(helperId), status: 'pending' })
        .session(session)
        .exec();
      if (pending) throw new ConflictException('Bạn đã có yêu cầu rút tiền đang chờ xử lý');

      const resolvedBankAccount =
        bankAccount ??
        (
          await this.helperModel
            .findOne({ user_id: new Types.ObjectId(helperId) })
            .session(session)
            .exec()
        )?.bank_account;
      if (!resolvedBankAccount?.account_number) {
        throw new BadRequestException('Vui lòng cập nhật tài khoản ngân hàng trước khi rút tiền');
      }

      await this.getOrCreateWallet(helperId, session);
      // Atomic hold: the balance check and the deduction happen in one update, so
      // parallel requests cannot overdraw the wallet.
      const wallet = await this.walletModel
        .findOneAndUpdate(
          { user_id: new Types.ObjectId(helperId), balance: { $gte: amount } },
          { $inc: { balance: -amount } },
          { new: true, session },
        )
        .exec();
      if (!wallet) {
        const current = await this.getOrCreateWallet(helperId, session);
        throw new BadRequestException(
          `Số dư không đủ. Hiện có: ${current.balance.toLocaleString('vi-VN')}₫`,
        );
      }

      const withdrawal = await new this.withdrawalModel({
        user_id: new Types.ObjectId(helperId),
        amount,
        status: 'pending',
        bank_account: {
          bank_name: resolvedBankAccount.bank_name,
          account_number: resolvedBankAccount.account_number,
          account_name: resolvedBankAccount.account_name,
        },
      }).save({ session });

      await new this.transactionModel({
        wallet_id: wallet._id,
        user_id: new Types.ObjectId(helperId),
        type: 'withdrawal',
        status: 'pending',
        amount,
        balance_before: wallet.balance + amount,
        balance_after: wallet.balance,
        description: `Yêu cầu rút tiền`,
        metadata: { withdrawal_id: String(withdrawal._id) },
      }).save({ session });

      return withdrawal;
    });
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
    const saved = await this.walletModel.db.transaction(async session => {
      // Claim the pending request atomically so a double click cannot refund twice.
      const withdrawal = await this.withdrawalModel
        .findOneAndUpdate(
          { _id: new Types.ObjectId(withdrawalId), status: 'pending' },
          { status: action === 'approve' ? 'completed' : 'rejected' },
          { new: true, session },
        )
        .exec();
      if (!withdrawal) {
        const exists = await this.withdrawalModel
          .exists({ _id: new Types.ObjectId(withdrawalId) })
          .session(session);
        if (!exists) throw new NotFoundException('Yêu cầu rút tiền không tồn tại');
        throw new BadRequestException('Yêu cầu này đã được xử lý');
      }

      if (action === 'approve') {
        withdrawal.status = 'completed';
        // Update wallet total_withdrawn
        await this.walletModel
          .findOneAndUpdate(
            { user_id: withdrawal.user_id },
            { $inc: { total_withdrawn: withdrawal.amount } },
            { session },
          )
          .exec();
        // Update transaction status
        await this.transactionModel
          .findOneAndUpdate(
            { 'metadata.withdrawal_id': withdrawalId },
            { status: 'success' },
            { session },
          )
          .exec();
      } else {
        withdrawal.status = 'rejected';
        // Refund to wallet
        const wallet = await this.getOrCreateWallet(String(withdrawal.user_id), session);
        await this.walletModel
          .findByIdAndUpdate(
            wallet._id,
            {
              $inc: { balance: withdrawal.amount },
            },
            { session },
          )
          .exec();
        await new this.transactionModel({
          wallet_id: wallet._id,
          user_id: withdrawal.user_id,
          type: 'refund',
          status: 'success',
          amount: withdrawal.amount,
          balance_before: wallet.balance,
          balance_after: wallet.balance + withdrawal.amount,
          description: `Hoàn tiền rút thất bại`,
        }).save({ session });
        // Update transaction status
        await this.transactionModel
          .findOneAndUpdate(
            { 'metadata.withdrawal_id': withdrawalId },
            { status: 'failed' },
            { session },
          )
          .exec();
      }

      withdrawal.admin_note = adminNote;
      withdrawal.processed_at = new Date();
      withdrawal.processed_by = adminId;
      return withdrawal.save({ session });
    });
    const withdrawal = saved;

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
