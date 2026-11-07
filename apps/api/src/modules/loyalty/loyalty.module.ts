import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoyaltyController, AdminLoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import {
  LoyaltyAccount,
  LoyaltyAccountSchema,
  LoyaltyTransaction,
  LoyaltyTransactionSchema,
} from './schemas/loyalty.schema';
import { Job, JobSchema, Contract, ContractSchema } from '../jobs/schemas/job.schema';
import { Voucher, VoucherSchema } from '../vouchers/schemas/voucher.schema';
import { forwardRef } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * LoyaltyModule KHÔNG import JobsModule/PaymentsModule (tránh circular):
 * Job/Contract schema được đăng ký trực tiếp qua MongooseModule.forFeature
 * (giống cách VouchersModule đăng ký Job). JobsModule và PaymentsModule
 * import module này để gọi awardForJob / redeemAtPayment.
 */
@Module({
  imports: [
    forwardRef(() => NotificationsModule),
    MongooseModule.forFeature([
      { name: LoyaltyAccount.name, schema: LoyaltyAccountSchema },
      { name: LoyaltyTransaction.name, schema: LoyaltyTransactionSchema },
      { name: Job.name, schema: JobSchema },
      { name: Contract.name, schema: ContractSchema },
      // P1-24: đọc voucher gắn trên job để tính cap sau voucher (chỉ schema,
      // không import VouchersModule — tránh circular, xem LoyaltyService).
      { name: Voucher.name, schema: VoucherSchema },
    ]),
  ],
  controllers: [LoyaltyController, AdminLoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
