import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

// Gửi mail OTP qua SendGrid Web API v3 (HTTPS) thay vì Gmail SMTP.
// Lý do đổi (2026-11-07): Gmail SMTP không kết nối được từ Render free tier
// (kết nối treo tới hết timeout) nên đăng ký + quên mật khẩu không bao giờ
// gửi được mail. SendGrid dùng cổng 443 nên không bị chặn.
// Cần biến môi trường: SENDGRID_API_KEY (key có quyền Mail Send) và
// SENDGRID_FROM (email người gửi đã xác minh Single Sender trên SendGrid).
// Gói miễn phí: 100 mail/ngày.
const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send';
const SEND_TIMEOUT_MS = 15_000;

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  onModuleInit() {
    // H16: Lỗi ngay khi khởi động nếu thiếu SENDGRID_FROM
    if (process.env.NODE_ENV !== 'test' || process.env.FORCE_MAIL_CHECK === 'true') {
      if (!process.env.SENDGRID_FROM) {
        throw new Error(
          'Cấu hình SENDGRID_FROM bị thiếu. Bắt buộc phải cấu hình email người gửi Single Sender trên SendGrid.',
        );
      }
    }
  }

  private get apiKey(): string | undefined {
    return process.env.SENDGRID_API_KEY;
  }

  private get fromEmail(): string | undefined {
    return process.env.SENDGRID_FROM;
  }

  /**
   * R7 item 1 / auto-cancel: gửi mail sự kiện đơn hàng (không phải OTP) qua
   * cùng SendGrid Web API v3. Best-effort — trả false khi chưa cấu hình /
   * SendGrid lỗi, không ném lỗi (caller sweep không được sập vì mail).
   * Body đã song ngữ (VI chính + EN) ở caller.
   */
  async sendJobEmail(
    toEmail: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<boolean> {
    return this.send(toEmail, subject, text, html, 'Job email');
  }

  /** Bước gửi chung: kiểm tra cấu hình + POST SendGrid + log. */
  private async send(
    toEmail: string,
    subject: string,
    text: string,
    html: string,
    kind: string,
  ): Promise<boolean> {
    if (!this.apiKey || !this.fromEmail) {
      this.logger.warn(
        `[SENDGRID SIMULATED] To: ${toEmail} | Subject: ${subject} (${kind}, SENDGRID_API_KEY hoặc SENDGRID_FROM chưa được cấu hình)`,
      );
      return false;
    }

    try {
      const res = await fetch(SENDGRID_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: toEmail }] }],
          from: { email: this.fromEmail, name: 'GreenHouse' },
          subject,
          content: [
            { type: 'text/plain', value: text },
            { type: 'text/html', value: html },
          ],
        }),
        // Hạn mức cứng 15s: SendGrid không trả lời thì fail nhanh để API trả
        // lỗi rõ (502) thay vì app xoay vòng đến hết timeout 35s.
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (res.status === 202) {
        this.logger.log(`${kind} sent to ${toEmail} via SendGrid`);
        return true;
      }
      const errBody = await res.text().catch(() => '');
      this.logger.error(`SendGrid send failed to ${toEmail}: HTTP ${res.status} ${errBody}`);
      return false;
    } catch (err: any) {
      this.logger.error(`Failed to send ${kind} to ${toEmail}: ${err?.message ?? err}`);
      return false;
    }
  }

  async sendOtpEmail(toEmail: string, code: string, purpose: 'verify' | 'reset'): Promise<boolean> {
    const isVerify = purpose === 'verify';
    const actionText = isVerify ? 'xác thực tài khoản' : 'đặt lại mật khẩu';

    // P3-2: Bỏ mã OTP khỏi tiêu đề email
    const subject = `[GreenHouse] Mã OTP ${actionText}`;
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

    return this.send(toEmail, subject, text, html, 'OTP email');
  }
}
