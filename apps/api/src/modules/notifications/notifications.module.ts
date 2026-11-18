import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ZaloNotificationService } from './zalo.service';
import { ZaloTokenService } from './zalo-token.service';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { ZaloTokenState, ZaloTokenStateSchema } from './schemas/zalo-token-state.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema },
      { name: ZaloTokenState.name, schema: ZaloTokenStateSchema },
    ]),
    forwardRef(() => ChatModule),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, ZaloNotificationService, ZaloTokenService],
  exports: [NotificationsService, ZaloTokenService],
})
export class NotificationsModule {}
