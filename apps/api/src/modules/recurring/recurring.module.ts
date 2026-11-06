import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecurringController } from './recurring.controller';
import { RecurringService } from './recurring.service';
import { RecurringPlan, RecurringPlanSchema } from './schemas/recurring-plan.schema';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { HelperProfile, HelperProfileSchema } from '../helpers/schemas/helper-profile.schema';
import { JobsModule } from '../jobs/jobs.module';
import { FavoritesModule } from '../favorites/favorites.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RecurringPlan.name, schema: RecurringPlanSchema },
      { name: Job.name, schema: JobSchema },
      { name: HelperProfile.name, schema: HelperProfileSchema },
    ]),
    JobsModule,
    FavoritesModule,
    NotificationsModule,
  ],
  controllers: [RecurringController],
  providers: [RecurringService],
  exports: [RecurringService],
})
export class RecurringModule {}
