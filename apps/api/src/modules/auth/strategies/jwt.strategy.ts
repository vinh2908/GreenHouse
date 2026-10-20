import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload, UserStatus } from '@homemate/types';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret') as string,
    });
  }

  // Roles and status are read from the DB rather than the token, so a role switch
  // takes effect immediately and a suspended account loses access without waiting
  // for its access token to expire.
  async validate(payload: JwtPayload) {
    if (!payload.sub) throw new UnauthorizedException();
    const user = await this.usersService.findById(payload.sub).catch(() => null);
    if (!user) throw new UnauthorizedException();
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Tài khoản đã bị khóa. Liên hệ hỗ trợ.');
    }
    return {
      sub: payload.sub,
      phone: user.phone,
      roles: user.roles,
      active_role: user.active_role,
    };
  }
}
