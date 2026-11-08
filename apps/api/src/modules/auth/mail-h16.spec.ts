import { MailService } from './mail.service';

describe('H16: MailService startup SENDGRID_FROM validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws on onModuleInit if SENDGRID_FROM is missing and check forced', () => {
    delete process.env.SENDGRID_FROM;
    process.env.FORCE_MAIL_CHECK = 'true';
    const mailService = new MailService();
    expect(() => mailService.onModuleInit()).toThrow(/SENDGRID_FROM bị thiếu/);
  });

  it('succeeds on onModuleInit when SENDGRID_FROM is present', () => {
    process.env.SENDGRID_FROM = 'noreply@greenhouse.vn';
    process.env.FORCE_MAIL_CHECK = 'true';
    const mailService = new MailService();
    expect(() => mailService.onModuleInit()).not.toThrow();
  });

  it('fromEmail does not fallback to GMAIL_USER', () => {
    delete process.env.SENDGRID_FROM;
    process.env.GMAIL_USER = 'fallback@gmail.com';
    const mailService = new MailService();
    expect((mailService as any).fromEmail).toBeUndefined();
  });
});
