import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class SendMessageDto {
  @ApiProperty() @IsString() @IsNotEmpty() content: string;
  @ApiProperty({ default: 'text' }) @IsOptional() @IsString() type?: string;
}

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Lấy danh sách cuộc trò chuyện của tôi' })
  async getMyConversations(@CurrentUser() user: { sub: string }) {
    return this.chatService.getUserConversations(user.sub);
  }

  @Get('jobs/:jobId/conversation')
  @ApiOperation({ summary: 'Lấy conversation theo job' })
  async getByJob(@CurrentUser() user: { sub: string }, @Param('jobId') jobId: string) {
    return this.chatService.getConversationByJob(jobId, user.sub);
  }

  @Get('conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Lấy tin nhắn của conversation' })
  async getMessages(
    @CurrentUser() user: { sub: string },
    @Param('conversationId') conversationId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.chatService.getMessages(
      conversationId,
      user.sub,
      Number(page) || 1,
      Number(limit) || 30,
    );
  }

  @Post('conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Gửi tin nhắn (REST fallback)' })
  async sendMessage(
    @CurrentUser() user: { sub: string },
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(conversationId, user.sub, dto.content, dto.type);
  }

  @Post('conversations/:conversationId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đánh dấu đã đọc tất cả tin nhắn' })
  async markRead(
    @CurrentUser() user: { sub: string },
    @Param('conversationId') conversationId: string,
  ) {
    await this.chatService.markRead(conversationId, user.sub);
    return { message: 'Đã đọc' };
  }
}
