import { Module, forwardRef } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AppGateway } from './app.gateway';
import { Conversation, ConversationSchema } from './schemas/chat.schema';
import { Message, MessageSchema } from './schemas/chat.schema';
import { Job, JobSchema } from '../jobs/schemas/job.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Job.name, schema: JobSchema },
    ]),
    JwtModule.register({}),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [ChatController],
  providers: [ChatService, AppGateway],
  exports: [ChatService, AppGateway],
})
export class ChatModule {}
