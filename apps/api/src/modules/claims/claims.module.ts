import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClaimsController, AdminClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';
import { InsuranceClaim, InsuranceClaimSchema } from './schemas/insurance-claim.schema';
import { Job, JobSchema, Contract, ContractSchema } from '../jobs/schemas/job.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InsuranceClaim.name, schema: InsuranceClaimSchema },
      { name: Job.name, schema: JobSchema },
      { name: Contract.name, schema: ContractSchema },
    ]),
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [ClaimsController, AdminClaimsController],
  providers: [ClaimsService],
  exports: [ClaimsService],
})
export class ClaimsModule {}
