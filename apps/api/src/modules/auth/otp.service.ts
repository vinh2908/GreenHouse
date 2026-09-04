import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { OTP_EXPIRY_SECONDS, OTP_LENGTH, OTP_MAX_ATTEMPTS } from '@homemate/constants';
import { generateOTP } from '@homemate/utils';

// ─── OTP Schema ───────────────────────────────────────────────────────────────

export type OtpDocument = Otp & Document;

@Schema({ collection: 'otps', timestamps: { createdAt: 'created_at' } })
export class Otp {
  @Prop({ required: true, index: true })
  phone: string;

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
OtpSchema.index({ phone: 1, purpose: 1 });

// ─── OTP Service ──────────────────────────────────────────────────────────────

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectModel(Otp.name) private otpModel: Model<OtpDocument>,
    private readonly configService: ConfigService,
  ) {}

  async sendOtp(phone: string, purpose: 'verify' | 'reset'): Promise<string> {
    // Invalidate old OTPs for this phone+purpose
    await this.otpModel.deleteMany({ phone, purpose });

    const code = generateOTP(OTP_LENGTH);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

    await this.otpModel.create({
      phone,
      code,
      purpose,
      is_used: false,
      attempts: 0,
      expires_at: expiresAt,
    });

    const isDev = this.configService.get<string>('app.env') !== 'production';

    if (isDev) {
      // In dev: log OTP to console (NO real SMS)
      this.logger.warn(`[DEV OTP] Phone: ${phone} | Code: ${code} | Purpose: ${purpose}`);
    } else {
      // TODO Phase 7+: integrate real SMS provider (ESMS, Twilio, etc.)
      // await this.smsService.send(phone, `Mã OTP HomeMate: ${code}. Hiệu lực 5 phút.`);
      this.logger.log(`OTP sent to ${phone} for ${purpose}`);
    }

    return code; // Return in dev for testing
  }

  async verifyOtp(phone: string, code: string, purpose: 'verify' | 'reset'): Promise<boolean> {
    const otp = await this.otpModel
      .findOne({
        phone,
        purpose,
        is_used: false,
        expires_at: { $gt: new Date() },
      })
      .sort({ created_at: -1 })
      .exec();

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
