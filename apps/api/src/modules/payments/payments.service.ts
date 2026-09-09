import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
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

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(Withdrawal.name) private withdrawalModel: Model<WithdrawalDocument>,
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

  // ─── Mock Payment (Phase 8) ────────────────────────────────────────────────
  // Real payment gateway integration: VNPay / MoMo / ZaloPay in production

  async mockPayJob(
    customerId: string,
    jobId: string,
    amount: number,
    paymentMethod: string,
  ): Promise<{ transaction: TransactionDocument; success: boolean }> {
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
    const wallet = await this.getOrCreateWallet(helperId);

    if (wallet.balance < amount) {
      throw new BadRequestException(
        `Số dư không đủ. Hiện có: ${wallet.balance.toLocaleString('vi-VN')}₫`,
      );
    }

    // Check no pending withdrawal
    const pending = await this.withdrawalModel
      .findOne({
        user_id: new Types.ObjectId(helperId),
        status: 'pending',
      })
      .exec();
    if (pending) throw new ConflictException('Bạn đã có yêu cầu rút tiền đang chờ xử lý');

    // Use provided bank_account or fallback placeholder
    const resolvedBankAccount = bankAccount ?? {
      bank_name: 'Chưa cập nhật',
      account_number: '000000000',
      account_name: 'HELPER',
    };

    const withdrawal = await this.withdrawalModel.create({
      user_id: new Types.ObjectId(helperId),
      amount,
      status: 'pending',
      bank_account: resolvedBankAccount,
    });

    // Deduct from wallet (hold)
    await this.walletModel
      .findByIdAndUpdate(wallet._id, {
        $inc: { balance: -amount },
      })
      .exec();

    // Record transaction
    await this.transactionModel.create({
      wallet_id: wallet._id,
      user_id: new Types.ObjectId(helperId),
      type: 'withdrawal',
      status: 'pending',
      amount,
      balance_before: wallet.balance,
      balance_after: wallet.balance - amount,
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
      this.withdrawalModel.find(query).sort({ created_at: -1 }).skip(skip).limit(limit).exec(),
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
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Yêu cầu rút tiền không tồn tại');
    if (withdrawal.status !== 'pending') {
      throw new BadRequestException('Yêu cầu này đã được xử lý');
    }

    if (action === 'approve') {
      withdrawal.status = 'completed';
      // Update wallet total_withdrawn
      await this.walletModel
        .findOneAndUpdate(
          { user_id: withdrawal.user_id },
          { $inc: { total_withdrawn: withdrawal.amount } },
        )
        .exec();
      // Update transaction status
      await this.transactionModel
        .findOneAndUpdate({ 'metadata.withdrawal_id': withdrawalId }, { status: 'success' })
        .exec();
    } else {
      withdrawal.status = 'rejected';
      // Refund to wallet
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
      // Update transaction status
      await this.transactionModel
        .findOneAndUpdate({ 'metadata.withdrawal_id': withdrawalId }, { status: 'failed' })
        .exec();
    }

    withdrawal.admin_note = adminNote;
    withdrawal.processed_at = new Date();
    withdrawal.processed_by = adminId;
    return withdrawal.save();
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
