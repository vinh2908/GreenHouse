import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { MatchingCacheService } from './matching-cache.service';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { HelperProfile, HelperProfileSchema } from '../helpers/schemas/helper-profile.schema';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Job.name, schema: JobSchema },
      { name: HelperProfile.name, schema: HelperProfileSchema },
    ]),
    ChatModule,
    NotificationsModule,
  ],
  controllers: [MatchingController],
  providers: [MatchingService, MatchingCacheService],
  exports: [MatchingService, MatchingCacheService],
})
export class MatchingModule {}
