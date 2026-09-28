import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { HelperProfile, HelperProfileSchema } from '../helpers/schemas/helper-profile.schema';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { Notification, NotificationSchema } from '../notifications/schemas/notification.schema';
import {
  Wallet,
  WalletSchema,
  Transaction,
  TransactionSchema,
  Withdrawal,
  WithdrawalSchema,
} from '../payments/schemas/payment.schema';
import { Review, ReviewSchema } from '../reviews/schemas/review.schema';
import {
  CustomerProfile,
  CustomerProfileSchema,
} from '../customers/schemas/customer-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: HelperProfile.name, schema: HelperProfileSchema },
      { name: Job.name, schema: JobSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: Wallet.name, schema: WalletSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Withdrawal.name, schema: WithdrawalSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: CustomerProfile.name, schema: CustomerProfileSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
