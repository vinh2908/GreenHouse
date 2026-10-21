import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SupportController, AdminSupportController } from './support.controller';
import { SupportService } from './support.service';
import {
  SupportConversation,
  SupportConversationSchema,
  SupportMessage,
  SupportMessageSchema,
} from './schemas/support.schema';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupportConversation.name, schema: SupportConversationSchema },
      { name: SupportMessage.name, schema: SupportMessageSchema },
    ]),
    forwardRef(() => ChatModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
