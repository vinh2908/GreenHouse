import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { HelperProfile, HelperProfileSchema } from '../helpers/schemas/helper-profile.schema';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { Notification, NotificationSchema } from '../notifications/schemas/notification.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: HelperProfile.name, schema: HelperProfileSchema },
      { name: Job.name, schema: JobSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
