import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AppGateway } from './app.gateway';
import { Conversation, ConversationSchema } from './schemas/chat.schema';
import { Message, MessageSchema } from './schemas/chat.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    JwtModule.register({}),
  ],
  controllers: [ChatController],
  providers: [ChatService, AppGateway],
  exports: [ChatService, AppGateway],
})
export class ChatModule {}
