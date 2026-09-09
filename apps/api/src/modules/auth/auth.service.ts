import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  SendOtpDto,
  VerifyOtpDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { OtpService } from './otp.service';
import { JwtPayload, UserRole } from '@homemate/types';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
  ) {}

  // ─── Register ──────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByPhone(dto.phone);
    if (existing) throw new ConflictException('Số điện thoại đã được đăng ký');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.usersService.create({
      phone: dto.phone,
      full_name: dto.full_name,
      password_hash: passwordHash,
      email: dto.email,
    });

    // Tự động gửi OTP xác minh sau khi đăng ký
    await this.otpService.sendOtp(dto.phone, 'verify');

    const tokens = await this.generateTokens(user);

    this.logger.log(`New user registered: ${dto.phone}`);

    return {
      user,
      ...tokens,
      message: 'Đăng ký thành công. Vui lòng xác minh số điện thoại.',
    };
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.usersService.findByPhoneWithPassword(dto.phone);
    if (!user) throw new UnauthorizedException('Số điện thoại hoặc mật khẩu không đúng');

    const isPasswordValid = await bcrypt.compare(dto.password, user.password_hash);
    if (!isPasswordValid) throw new UnauthorizedException('Số điện thoại hoặc mật khẩu không đúng');

    if (user.status === 'suspended')
      throw new UnauthorizedException('Tài khoản đã bị khóa. Liên hệ hỗ trợ.');

    const tokens = await this.generateTokens(user);

    this.logger.log(`User logged in: ${dto.phone}`);

    return { user, ...tokens };
  }

  // ─── Refresh Token ─────────────────────────────────────────────────────────

  async refreshToken(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(dto.refresh_token, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user) throw new UnauthorizedException();

      // Issue new tokens (rotate refresh token)
      const tokens = await this.generateTokens(user);
      return tokens;
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }
  }

  // ─── OTP ───────────────────────────────────────────────────────────────────

  async sendOtp(dto: SendOtpDto) {
    const user = await this.usersService.findByPhone(dto.phone);
    if (!user) throw new BadRequestException('Số điện thoại chưa được đăng ký');

    await this.otpService.sendOtp(dto.phone, 'verify');
    return { message: 'OTP đã được gửi. Có hiệu lực trong 5 phút.' };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const isValid = await this.otpService.verifyOtp(dto.phone, dto.otp, 'verify');
    if (!isValid) throw new BadRequestException('OTP không đúng hoặc đã hết hạn');

    const user = await this.usersService.findByPhone(dto.phone);
    if (!user) throw new BadRequestException('Số điện thoại không tồn tại');

    await this.usersService.markVerified(user.id as string);

    // Generate tokens so user is immediately logged in after OTP verification
    const tokens = await this.generateTokens(user);

    return {
      message: 'Xác minh số điện thoại thành công',
      ...tokens,
      user: {
        id: user.id,
        phone: user.phone,
        full_name: user.full_name,
        roles: user.roles,
        active_role: user.active_role,
        is_phone_verified: true,
      },
    };
  }

  // ─── Forgot / Reset Password ───────────────────────────────────────────────

  async forgotPassword(phone: string) {
    const user = await this.usersService.findByPhone(phone);
    if (!user) {
      // Don't reveal if phone exists
      return { message: 'Nếu số điện thoại tồn tại, OTP đã được gửi.' };
    }
    await this.otpService.sendOtp(phone, 'reset');
    return { message: 'OTP đặt lại mật khẩu đã được gửi.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const isValid = await this.otpService.verifyOtp(dto.phone, dto.otp, 'reset');
    if (!isValid) throw new BadRequestException('OTP không đúng hoặc đã hết hạn');

    const user = await this.usersService.findByPhone(dto.phone);
    if (!user) throw new BadRequestException('Số điện thoại không tồn tại');

    const passwordHash = await bcrypt.hash(dto.new_password, 12);
    await this.usersService.updatePassword(user.id as string, passwordHash);

    return { message: 'Đặt lại mật khẩu thành công' };
  }

  // ─── Token Generation ──────────────────────────────────────────────────────

  private async generateTokens(user: {
    id?: string;
    _id?: unknown;
    phone: string;
    roles: UserRole[];
    active_role: UserRole;
  }) {
    const userId = (user.id ?? String(user._id)) as string;
    const payload: JwtPayload = {
      sub: userId,
      phone: user.phone,
      roles: user.roles,
      active_role: user.active_role,
    };

    const accessSecret = this.configService.get<string>('jwt.accessSecret') as string;
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret') as string;
    const accessExpiresIn = this.configService.get<string>('jwt.accessExpiresIn') ?? '15m';
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn') ?? '7d';

    const [accessToken, refreshToken] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.jwtService.signAsync(payload as any, {
        secret: accessSecret,
        expiresIn: accessExpiresIn as any,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.jwtService.signAsync(payload as any, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn as any,
      }),
    ]);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 15 * 60,
    };
  }
}
