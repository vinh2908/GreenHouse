import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Wallet, WalletSchema } from './schemas/payment.schema';
import { Transaction, TransactionSchema } from './schemas/payment.schema';
import { Withdrawal, WithdrawalSchema } from './schemas/payment.schema';
import { HelperProfile, HelperProfileSchema } from '../helpers/schemas/helper-profile.schema';
import { Job, JobSchema, Contract, ContractSchema } from '../jobs/schemas/job.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Wallet.name, schema: WalletSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Withdrawal.name, schema: WithdrawalSchema },
      { name: HelperProfile.name, schema: HelperProfileSchema },
      { name: Job.name, schema: JobSchema },
      { name: Contract.name, schema: ContractSchema },
    ]),
    NotificationsModule,
    VouchersModule,
    LoyaltyModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
