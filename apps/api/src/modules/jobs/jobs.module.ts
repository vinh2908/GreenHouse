import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { Job, JobSchema, Quote, QuoteSchema, Contract, ContractSchema } from './schemas/job.schema';
import { Service, ServiceSchema } from '../services/schemas/service.schema';
import { HelperProfile, HelperProfileSchema } from '../helpers/schemas/helper-profile.schema';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Job.name, schema: JobSchema },
      { name: Quote.name, schema: QuoteSchema },
      { name: Contract.name, schema: ContractSchema },
      { name: Service.name, schema: ServiceSchema },
      { name: HelperProfile.name, schema: HelperProfileSchema },
    ]),
    ChatModule,
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
