import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SosBackupController } from './sos-backup.controller';
import { SosBackupService } from './sos-backup.service';
import { SosBackupRequest, SosBackupRequestSchema } from './schemas/sos-backup.schema';
import { Job, JobSchema, Contract, ContractSchema } from '../jobs/schemas/job.schema';
import { HelperProfile, HelperProfileSchema } from '../helpers/schemas/helper-profile.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  HelperPenaltyEvent,
  HelperPenaltyEventSchema,
} from '../helpers/schemas/helper-penalty-event.schema';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SosBackupRequest.name, schema: SosBackupRequestSchema },
      { name: Job.name, schema: JobSchema },
      { name: Contract.name, schema: ContractSchema },
      { name: HelperProfile.name, schema: HelperProfileSchema },
      { name: HelperPenaltyEvent.name, schema: HelperPenaltyEventSchema },
      { name: User.name, schema: UserSchema },
    ]),
    ChatModule,
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [SosBackupController],
  providers: [SosBackupService],
  exports: [SosBackupService],
})
export class SosBackupModule {}
