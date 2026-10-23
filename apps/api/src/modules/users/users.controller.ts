import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto, UpdateRoleDto } from './dto/update-user.dto';
import { PushTokenDto } from './dto/push-token.dto';
import { VoipTokenDto, RemoveVoipTokenDto } from './dto/voip-token.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '@homemate/types';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Lấy thông tin bản thân' })
  async getMe(@CurrentUser() user: { sub: string }) {
    return this.usersService.findById(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Cập nhật thông tin bản thân' })
  async updateMe(@CurrentUser() user: { sub: string }, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.sub, dto);
  }

  @Patch('me/role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Chuyển đổi role (customer ↔ helper)' })
  async switchRole(@CurrentUser() user: { sub: string }, @Body() dto: UpdateRoleDto) {
    return this.usersService.switchRole(user.sub, dto.active_role as UserRole);
  }

  @Patch('me/push-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lưu Expo push token của thiết bị hiện tại' })
  async savePushToken(@CurrentUser() user: { sub: string }, @Body() dto: PushTokenDto) {
    await this.usersService.addPushToken(user.sub, dto.token);
    return { success: true };
  }

  @Delete('me/push-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gỡ Expo push token của thiết bị (khi đăng xuất)' })
  async removePushToken(@CurrentUser() user: { sub: string }, @Body() dto: PushTokenDto) {
    await this.usersService.removePushToken(user.sub, dto.token);
    return { success: true };
  }

  @Patch('me/voip-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lưu VoIP token của thiết bị (đánh thức cuộc gọi đến khi app nền/đóng hẳn)',
  })
  async saveVoipToken(@CurrentUser() user: { sub: string }, @Body() dto: VoipTokenDto) {
    await this.usersService.addVoipToken(user.sub, dto.token, dto.platform);
    return { success: true };
  }

  @Delete('me/voip-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gỡ VoIP token của thiết bị (khi đăng xuất)' })
  async removeVoipToken(@CurrentUser() user: { sub: string }, @Body() dto: RemoveVoipTokenDto) {
    await this.usersService.removeVoipToken(user.sub, dto.token);
    return { success: true };
  }
}
