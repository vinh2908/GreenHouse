import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { OTP_EXPIRY_SECONDS, OTP_LENGTH, OTP_MAX_ATTEMPTS } from '@homemate/constants';
import { generateOTP } from '@homemate/utils';
import { MailService } from './mail.service';

// ─── OTP Schema ───────────────────────────────────────────────────────────────

export type OtpDocument = Otp & Document;

@Schema({ collection: 'otps', timestamps: { createdAt: 'created_at' } })
export class Otp {
  @Prop({ index: true })
  phone?: string;

  @Prop({ index: true })
  email?: string;

  @Prop({ required: true, index: true })
  target: string; // phone or lowercase email

  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  purpose: string; // 'verify' | 'reset'

  @Prop({ default: false })
  is_used: boolean;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ required: true, expires: OTP_EXPIRY_SECONDS })
  expires_at: Date;

  created_at: Date;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);
OtpSchema.index({ target: 1, purpose: 1 });
OtpSchema.index({ target: 1, created_at: -1 });

// ─── OTP Service ──────────────────────────────────────────────────────────────

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectModel(Otp.name) private otpModel: Model<OtpDocument>,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async sendOtp(targetInput: string, purpose: 'verify' | 'reset'): Promise<string | undefined> {
    const target = targetInput.trim().toLowerCase();
    const isEmail = target.includes('@');

    // A103 Rate limit: tối đa 5 lần gửi trong 1 giờ. Lần thứ 6 ném 429 Too Many Requests
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const countLastHour = await this.otpModel.countDocuments({
      $or: [{ target }, { phone: target }, { email: target }],
      created_at: { $gte: oneHourAgo },
    });

    if (countLastHour >= 5) {
      throw new HttpException(
        'Bạn đã yêu cầu gửi mã OTP quá 5 lần trong 1 giờ. Vui lòng thử lại sau.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Invalidate old OTPs for this target + purpose (mã mới lập tức huỷ mã cũ)
    await this.otpModel.deleteMany({
      $or: [{ target }, { phone: target }, { email: target }],
      purpose,
    });

    const code = generateOTP(OTP_LENGTH);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

    await this.otpModel.create({
      target,
      phone: isEmail ? undefined : target,
      email: isEmail ? target : undefined,
      code,
      purpose,
      is_used: false,
      attempts: 0,
      expires_at: expiresAt,
      created_at: new Date(),
    });

    if (isEmail) {
      // Gửi qua Gmail SMTP nếu có tài khoản, hoặc fallback log mô phỏng
      await this.mailService.sendOtpEmail(target, code, purpose);
    }

    const isProd =
      this.configService.get<string>('app.env') === 'production' ||
      process.env['NODE_ENV'] === 'production';
    const isDev = !isProd && this.configService.get<string>('app.env') !== 'production';

    if (isDev) {
      // In dev: log OTP to console
      this.logger.warn(`[DEV OTP] Target: ${target} | Code: ${code} | Purpose: ${purpose}`);
      return code;
    } else {
      this.logger.log(`OTP sent to ${target} for ${purpose}`);
      return undefined;
    }
  }

  async verifyOtp(targetInput: string, code: string, purpose: 'verify' | 'reset'): Promise<boolean> {
    const target = targetInput.trim().toLowerCase();
    const isProd =
      this.configService.get<string>('app.env') === 'production' ||
      process.env['NODE_ENV'] === 'production';
    // A71: Nhánh bypass tắt mặc định; chỉ bật khi ở dev và có biến môi trường OTP_BYPASS=true rõ ràng
    const allowBypass =
      !isProd &&
      (process.env['OTP_BYPASS'] === 'true' ||
        this.configService.get<string>('auth.otpBypass') === 'true');

    const otp = await this.otpModel
      .findOne({
        $or: [{ target }, { phone: target }, { email: target }],
        purpose,
        is_used: false,
        expires_at: { $gt: new Date() },
      })
      .sort({ created_at: -1 })
      .exec();

    // Chỉ chấp nhận mã OTP thử nghiệm khi dev bật cờ OTP_BYPASS tường minh
    if (allowBypass && (code === '123456' || code === '888888')) {
      if (purpose === 'reset' && !otp) {
        return false;
      }
      this.logger.warn(`[OTP BYPASS] Accepted demo OTP ${code} for ${target} (${purpose})`);
      await this.otpModel.updateMany(
        { $or: [{ target }, { phone: target }, { email: target }], purpose },
        { is_used: true },
      );
      return true;
    }

    if (!otp) return false;

    // Increment attempts
    otp.attempts += 1;

    if (otp.attempts > OTP_MAX_ATTEMPTS) {
      await otp.deleteOne();
      return false;
    }

    if (otp.code !== code) {
      await otp.save();
      return false;
    }

    // Mark as used
    otp.is_used = true;
    await otp.save();
    return true;
  }
}
