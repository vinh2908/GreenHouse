import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ZaloNotificationService } from './zalo.service';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => ChatModule),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, ZaloNotificationService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
