import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class WsSessionGuard implements CanActivate {
  constructor(@InjectModel(User.name) private readonly users: Model<UserDocument>) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const id = client.data.userId;
    const user = id
      ? await this.users.findById(id).select('roles status is_deleted token_version').lean().exec()
      : null;
    if (
      !user ||
      user.is_deleted ||
      user.status === 'suspended' ||
      (user.token_version ?? 0) !== (client.data.tokenVersion ?? 0) ||
      !client.data.expiresAt ||
      client.data.expiresAt <= Date.now()
    ) {
      client.disconnect(true);
      throw new WsException('Phiên đăng nhập đã hết hạn hoặc bị thu hồi');
    }
    client.data.roles = user.roles;
    return true;
  }
}
