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

/**
 * LoyaltyModule KHÔNG import JobsModule/PaymentsModule (tránh circular):
 * Job/Contract schema được đăng ký trực tiếp qua MongooseModule.forFeature
 * (giống cách VouchersModule đăng ký Job). JobsModule và PaymentsModule
 * import module này để gọi awardForJob / redeemAtPayment.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LoyaltyAccount.name, schema: LoyaltyAccountSchema },
      { name: LoyaltyTransaction.name, schema: LoyaltyTransactionSchema },
      { name: Job.name, schema: JobSchema },
      { name: Contract.name, schema: ContractSchema },
    ]),
  ],
  controllers: [LoyaltyController, AdminLoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
