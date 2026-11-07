import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Get, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
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
  RequestEmailChangeDto,
  ConfirmEmailChangeDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Register ──────────────────────────────────────────────────────────────

  @Public()
  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Đăng ký tài khoản mới' })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công' })
  @ApiResponse({ status: 409, description: 'Số điện thoại đã tồn tại' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Đăng nhập bằng SĐT + mật khẩu' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công' })
  @ApiResponse({ status: 401, description: 'Sai thông tin đăng nhập' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // ─── Refresh Token ─────────────────────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới access token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  // ─── OTP ───────────────────────────────────────────────────────────────────

  @Public()
  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Gửi OTP xác minh — chỉ email (SMS chưa hỗ trợ, xem P0-6)' })
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Xác minh OTP' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  // ─── Forgot / Reset Password ───────────────────────────────────────────────

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Yêu cầu đặt lại mật khẩu — gửi OTP qua email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Đặt lại mật khẩu bằng OTP' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ─── Email Verification ───────────────────────────────────────────────────

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Xác minh tài khoản bằng mã OTP gửi về email' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  // ─── B95: Đổi email có xác minh mã gửi tới email mới ─────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('email/change-request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi mã xác nhận đổi email tới email mới' })
  async requestEmailChange(
    @CurrentUser() user: { sub: string },
    @Body() dto: RequestEmailChangeDto,
  ) {
    return this.authService.requestEmailChange(user.sub, dto.new_email);
  }

  @UseGuards(JwtAuthGuard)
  @Post('email/change-confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác nhận mã OTP để đổi sang email mới' })
  async confirmEmailChange(
    @CurrentUser() user: { sub: string },
    @Body() dto: ConfirmEmailChangeDto,
  ) {
    return this.authService.confirmEmailChange(user.sub, dto.new_email, dto.otp);
  }

  @Post('verify-email/resend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Gửi lại mã OTP xác minh email' })
  async resendEmailOtp(@Body() dto: ResendEmailOtpDto) {
    return this.authService.resendEmailOtp(dto);
  }

  // ─── Verify session ────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kiểm tra token hợp lệ + lấy thông tin user' })
  async me(@CurrentUser() user: unknown) {
    return user;
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────

  // ─── Delete account (B24: xác nhận bằng mật khẩu, xóa mềm) ────────────────

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa tài khoản của chính mình (xóa mềm, cần mật khẩu)' })
  async deleteMe(@CurrentUser() user: any, @Body() body: { password: string }) {
    const userId = user?.sub ?? user?.id ?? user?._id;
    return this.authService.deleteAccount(String(userId), body?.password);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất và thu hồi refresh token' })
  async logout(@CurrentUser() user: any, @Body() body: { refresh_token?: string }) {
    const userId = user?.sub ?? user?.id ?? user?._id;
    return this.authService.logout(String(userId), body?.refresh_token);
  }
}
