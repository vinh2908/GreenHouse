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
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  ResendEmailOtpDto,
} from './dto/auth.dto';
import { OtpService } from './otp.service';
import { JwtPayload, UserRole, UserStatus } from '@homemate/types';

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
    const existingPhone = await this.usersService.findByPhone(dto.phone);
    if (existingPhone) throw new ConflictException('Số điện thoại đã được đăng ký');

    if (dto.email) {
      const existingEmail = await this.usersService.findByEmail(dto.email);
      if (existingEmail) throw new ConflictException('Email đã được đăng ký');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.usersService.create({
      phone: dto.phone,
      full_name: dto.full_name,
      password_hash: passwordHash,
      email: dto.email,
    });

    if (dto.email) {
      try {
        await this.otpService.sendOtp(dto.email, 'verify');
      } catch (err: any) {
        this.logger.warn(`Failed to send verification OTP on register: ${err?.message ?? err}`);
      }
    }

    const tokens = await this.generateTokens(user);

    this.logger.log(`New user registered: ${dto.phone} / ${dto.email ?? ''}`);

    return {
      user,
      ...tokens,
      message: 'Đăng ký thành công!',
    };
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const identifier = dto.phone.trim();
    // Cho phép đăng nhập bằng cả Số điện thoại hoặc Email!
    const user = identifier.includes('@')
      ? await this.usersService.findByEmailWithPassword(identifier)
      : await this.usersService.findByPhoneWithPassword(identifier);

    if (!user) throw new UnauthorizedException('Số điện thoại, email hoặc mật khẩu không đúng');

    const isPasswordValid = await bcrypt.compare(dto.password, user.password_hash);
    if (!isPasswordValid)
      throw new UnauthorizedException('Số điện thoại, email hoặc mật khẩu không đúng');

    if (user.status === 'suspended')
      throw new UnauthorizedException('Tài khoản đã bị khóa. Liên hệ hỗ trợ.');

    if ((user as any).is_deleted)
      throw new UnauthorizedException('Tài khoản đã bị xóa.');

    const tokens = await this.generateTokens(user);

    this.logger.log(`User logged in: ${user.phone}`);

    return { user, ...tokens };
  }

  // ─── Refresh Token ─────────────────────────────────────────────────────────

  async refreshToken(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(dto.refresh_token, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user || user.status === 'suspended' || (user as any).is_deleted)
        throw new UnauthorizedException();

      // Check if token was revoked
      if (user.invalid_tokens && user.invalid_tokens.includes(dto.refresh_token)) {
        throw new UnauthorizedException('Refresh token đã bị thu hồi hoặc đã sử dụng');
      }

      // Check if token exists in active tokens (if tokens array is tracked)
      if (user.tokens && user.tokens.length > 0 && !user.tokens.includes(dto.refresh_token)) {
        throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã bị thay thế');
      }

      // Invalidate old token (rotate)
      await this.usersService.revokeRefreshToken(user.id as string, dto.refresh_token);

      // Issue new tokens (rotate refresh token)
      const tokens = await this.generateTokens(user);
      return tokens;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.usersService.revokeRefreshToken(userId, refreshToken);
    } else {
      await this.usersService.revokeAllRefreshTokens(userId);
    }
    await this.usersService.incrementTokenVersion(userId);
    return { success: true, message: 'Đăng xuất thành công' };
  }

  // ─── Delete account (B24: xóa mềm, yêu cầu mật khẩu) ──────────────────────

  async deleteAccount(userId: string, password: string) {
    if (!password) throw new BadRequestException('Vui lòng nhập mật khẩu để xác nhận');
    const user = await this.usersService.findByIdWithPassword(userId);
    if (!user || (user as any).is_deleted)
      throw new UnauthorizedException('Tài khoản không tồn tại');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new UnauthorizedException('Mật khẩu không đúng');
    // Xóa mềm: giữ lại toàn bộ dữ liệu đơn cũ cho admin tra cứu, chỉ khóa
    // đăng nhập (is_deleted + vô hiệu mọi token đang có).
    user.is_deleted = true;
    user.status = UserStatus.INACTIVE;
    user.tokens = [];
    user.invalid_tokens = [];
    await user.save();
    await this.usersService.incrementTokenVersion(userId);
    this.logger.log(`User soft-deleted account: ${user.phone}`);
    return { success: true, message: 'Tài khoản đã được xóa' };
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

  async forgotPassword(input: ForgotPasswordDto | string) {
    let email: string | undefined;
    let phone: string | undefined;

    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed.includes('@')) {
        email = trimmed.toLowerCase();
      } else {
        phone = trimmed;
      }
    } else if (input) {
      email = input.email?.trim()?.toLowerCase();
      phone = input.phone?.trim();
    }

    if (!email && !phone) {
      throw new BadRequestException('Vui lòng cung cấp email hoặc số điện thoại đã đăng ký');
    }

    if (email) {
      const user = await this.usersService.findByEmail(email);
      if (user) {
        await this.otpService.sendOtp(email, 'reset');
      }
      return { message: 'Nếu email tồn tại trong hệ thống, mã OTP đã được gửi đến email của bạn.' };
    }

    if (phone) {
      const user = await this.usersService.findByPhone(phone);
      if (user) {
        // F16: tài khoản chỉ có SĐT (không có email) thì không có kênh nào
        // gửi được mã OTP (không gửi SMS) — báo lỗi rõ thay vì báo "đã gửi" giả.
        if (!user.email) {
          throw new BadRequestException(
            'Tài khoản chưa đăng ký email nên không thể gửi mã OTP qua email. Vui lòng liên hệ hỗ trợ để cập nhật email.',
          );
        }
        const target = user.email;
        await this.otpService.sendOtp(target, 'reset');
      }
      return { message: 'Nếu số điện thoại tồn tại, mã OTP đã được gửi.' };
    }
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email?.trim()?.toLowerCase();
    const phone = dto.phone?.trim();

    if (!email && !phone) {
      throw new BadRequestException('Vui lòng cung cấp email hoặc số điện thoại đã nhận mã OTP');
    }

    let user = email ? await this.usersService.findByEmail(email) : null;
    if (!user && phone) {
      user = await this.usersService.findByPhone(phone);
    }
    if (!user) throw new BadRequestException('Tài khoản không tồn tại trong hệ thống');

    const targetsToTry = [email, phone, user.email, user.phone].filter(Boolean) as string[];

    let isValid = false;
    for (const target of targetsToTry) {
      if (await this.otpService.verifyOtp(target, dto.otp, 'reset')) {
        isValid = true;
        break;
      }
    }

    if (!isValid) throw new BadRequestException('Mã OTP không đúng hoặc đã hết hạn');

    const passwordHash = await bcrypt.hash(dto.new_password, 12);
    await this.usersService.updatePassword(user.id as string, passwordHash);

    return { message: 'Đặt lại mật khẩu thành công' };
  }

  // ─── Email Verification ───────────────────────────────────────────────────

  async verifyEmail(dto: VerifyEmailDto) {
    const email = dto.email.trim().toLowerCase();
    const isValid = await this.otpService.verifyOtp(email, dto.otp, 'verify');
    if (!isValid) throw new BadRequestException('Mã OTP không đúng hoặc đã hết hạn');

    const user = await this.usersService.findByEmail(email);
    if (!user) throw new BadRequestException('Email chưa được đăng ký trong hệ thống');

    await this.usersService.markVerified(user.id as string);

    return {
      message: 'Xác minh email thành công',
      is_verified: true,
    };
  }

  // ─── B95: Đổi email có xác minh ────────────────────────────────────────────
  // Bước 1: gửi mã xác nhận tới EMAIL MỚI (không đổi gì cho tới khi nhập đúng mã)
  async requestEmailChange(userId: string, newEmail: string) {
    const email = newEmail.trim().toLowerCase();
    const taken = await this.usersService.findByEmail(email);
    if (taken && String(taken._id) !== String(userId)) {
      throw new BadRequestException('Email này đã được đăng ký');
    }
    const me = await this.usersService.findById(userId);
    if ((me.email ?? '').toLowerCase() === email) {
      throw new BadRequestException('Email mới trùng với email hiện tại');
    }
    await this.otpService.sendOtp(email, 'verify');
    return { message: 'Mã xác nhận đã được gửi tới email mới của bạn.' };
  }

  // Bước 2: nhập đúng mã gửi tới email mới thì mới đổi email
  async confirmEmailChange(userId: string, newEmail: string, otp: string) {
    const email = newEmail.trim().toLowerCase();
    const isValid = await this.otpService.verifyOtp(email, otp, 'verify');
    if (!isValid) throw new BadRequestException('Mã xác nhận không đúng hoặc đã hết hạn');
    const user = await this.usersService.changeEmail(userId, email);
    return { message: 'Đổi email thành công', email: user.email };
  }

  async resendEmailOtp(dto: ResendEmailOtpDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new BadRequestException('Email chưa được đăng ký trong hệ thống');

    await this.otpService.sendOtp(email, 'verify');
    return { message: 'Mã xác minh OTP đã được gửi đến email của bạn.' };
  }

  // ─── Token Generation ──────────────────────────────────────────────────────

  private async generateTokens(user: {
    id?: string;
    _id?: unknown;
    phone: string;
    roles: UserRole[];
    active_role: UserRole;
    token_version?: number;
  }) {
    const userId = (user.id ?? String(user._id)) as string;
    const payload: JwtPayload = {
      sub: userId,
      phone: user.phone,
      roles: user.roles,
      active_role: user.active_role,
      token_version: user.token_version ?? 0,
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

    await this.usersService.addRefreshToken(userId, refreshToken).catch(err => {
      this.logger.warn(
        `Failed to store refresh token for user ${userId}: ${(err as Error).message}`,
      );
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 15 * 60,
    };
  }
}
