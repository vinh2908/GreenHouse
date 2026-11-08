import { OtpService } from './otp.service';

describe('H17: OtpService bypass only with explicit OTP_BYPASS', () => {
  const originalEnv = process.env;
  let otpModel: any;
  let mailService: any;
  let configService: any;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    delete process.env.OTP_BYPASS;
    otpModel = {
      countDocuments: jest.fn(() => ({ exec: async () => 0 })),
      deleteMany: jest.fn(() => ({ exec: async () => ({}) })),
      create: jest.fn(async (doc: any) => doc),
      findOne: jest.fn(() => ({
        sort: () => ({
          exec: async () => ({
            code: '654321',
            is_used: false,
            expires_at: new Date(Date.now() + 60000),
          }),
        }),
      })),
      updateMany: jest.fn(() => ({ exec: async () => ({}) })),
    };
    mailService = {
      sendOtpEmail: jest.fn(async () => true),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'app.env') return 'test';
        if (key === 'auth.otpBypass') return undefined;
        return undefined;
      }),
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('without OTP_BYPASS: returns undefined even when NODE_ENV=test', async () => {
    const service = new OtpService(otpModel, configService, mailService);
    const code = await service.sendOtp('test@example.com', 'verify');
    expect(code).toBeUndefined();
  });

  it('with OTP_BYPASS=true: returns OTP code', async () => {
    process.env.OTP_BYPASS = 'true';
    const service = new OtpService(otpModel, configService, mailService);
    const code = await service.sendOtp('test@example.com', 'verify');
    expect(code).toBeDefined();
    expect(typeof code).toBe('string');
  });
});
