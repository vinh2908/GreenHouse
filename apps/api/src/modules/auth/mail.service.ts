import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter() {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (!user || !pass) {
      this.logger.warn(
        'GMAIL_USER hoặc GMAIL_APP_PASSWORD chưa được cấu hình. Hệ thống sẽ mô phỏng gửi email OTP trong log dev.',
      );
      this.transporter = null;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user,
          pass,
        },
      });
      this.logger.log(`Khởi tạo Gmail SMTP transporter thành công cho tài khoản ${user}`);
    } catch (err: any) {
      this.logger.error(`Không thể khởi tạo Gmail transporter: ${err?.message ?? err}`);
      this.transporter = null;
    }
  }

  async sendOtpEmail(toEmail: string, code: string, purpose: 'verify' | 'reset'): Promise<boolean> {
    const isVerify = purpose === 'verify';
    const actionText = isVerify ? 'xác thực tài khoản' : 'đặt lại mật khẩu';

    const subject = `[GreenHouse] Mã OTP ${actionText}: ${code}`;
    const text = `Xin chào,\n\nMã OTP để ${actionText} của bạn trên hệ thống GreenHouse là: ${code}\nMã có hiệu lực trong vòng 5 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.\n\nTrân trọng,\nĐội ngũ GreenHouse`;

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #E5E7EB; border-radius: 12px; background-color: #FFFFFF;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #10B981; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">GREENHOUSE</h2>
          <p style="color: #6B7280; font-size: 13px; margin: 4px 0 0 0;">Dịch vụ gia đình & Thợ chuyên nghiệp 24/7</p>
        </div>
        <div style="border-top: 1px solid #F3F4F6; padding-top: 20px;">
          <p style="font-size: 15px; color: #1F2937; margin: 0 0 16px 0;">Xin chào,</p>
          <p style="font-size: 14px; color: #4B5563; line-height: 1.5; margin: 0 0 20px 0;">
            Bạn nhận được email này vì đã có yêu cầu <strong>${actionText}</strong> trên hệ thống GreenHouse.
          </p>
          <div style="background-color: #F0FDF4; border: 1px dashed #10B981; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
            <span style="font-size: 13px; color: #047857; font-weight: 600; display: block; margin-bottom: 6px;">MÃ XÁC THỰC OTP CỦA BẠN</span>
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #065F46; font-family: monospace;">${code}</span>
          </div>
          <p style="font-size: 13px; color: #6B7280; line-height: 1.5; margin: 0 0 12px 0;">
            ⏱ Mã OTP có hiệu lực trong <strong>5 phút</strong>. Tuyệt đối không chia sẻ mã này cho bất kỳ ai, kể cả nhân viên hỗ trợ GreenHouse.
          </p>
          <p style="font-size: 13px; color: #9CA3AF; margin: 16px 0 0 0;">
            Nếu bạn không yêu cầu hành động này, vui lòng bỏ qua email hoặc liên hệ hỗ trợ.
          </p>
        </div>
        <div style="border-top: 1px solid #F3F4F6; margin-top: 24px; padding-top: 16px; text-align: center; font-size: 12px; color: #9CA3AF;">
          &copy; ${new Date().getFullYear()} GreenHouse. Bảo mật & Chăm sóc gia đình bạn.
        </div>
      </div>
    `;

    if (!this.transporter && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      this.initTransporter();
    }

    if (!this.transporter) {
      this.logger.warn(`[GMAIL SIMULATED] To: ${toEmail} | Code: ${code} | Purpose: ${purpose}`);
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"GreenHouse" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject,
        text,
        html,
      });
      this.logger.log(`OTP email sent to ${toEmail} (messageId: ${info?.messageId})`);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to send OTP email to ${toEmail}: ${err?.message ?? err}`);
      return false;
    }
  }
}
