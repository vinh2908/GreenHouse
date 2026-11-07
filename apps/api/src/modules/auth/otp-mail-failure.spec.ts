import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { OtpService, Otp } from './otp.service';
import { MailService } from './mail.service';

describe('OtpService - F16 mail failure', () => {
  const OLD_NODE_ENV = process.env.NODE_ENV;
  let service: OtpService;
  let otpModel: any;
  let mailService: any;
  let configService: any;

  async function build(appEnv: string | undefined, mailResult: boolean) {
    otpModel = {
      countDocuments: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      deleteOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    mailService = { sendOtpEmail: jest.fn().mockResolvedValue(mailResult) };
    configService = { get: jest.fn((key: string) => (key === 'app.env' ? appEnv : undefined)) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: getModelToken(Otp.name), useValue: otpModel },
        { provide: ConfigService, useValue: configService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();
    service = module.get<OtpService>(OtpService);
  }

  afterEach(() => {
    process.env.NODE_ENV = OLD_NODE_ENV;
  });

  it('F16: production + gửi mail lỗi -> ném 502, OTP vừa tạo bị xóa, không báo gửi giả', async () => {
    process.env.NODE_ENV = 'production';
    await build('production', false);
    await expect(service.sendOtp('user@example.com', 'reset')).rejects.toMatchObject({
      status: 502,
    });
    expect(otpModel.deleteOne).toHaveBeenCalled();
    expect(mailService.sendOtpEmail).toHaveBeenCalledTimes(1);
  });

  it('F16: production + gửi mail thành công -> không lỗi', async () => {
    process.env.NODE_ENV = 'production';
    await build('production', true);
    await expect(service.sendOtp('user@example.com', 'reset')).resolves.toBeUndefined();
    expect(otpModel.deleteOne).not.toHaveBeenCalled();
  });

  it('F16: dev (chưa cấu hình Gmail) vẫn mô phỏng qua log + trả mã để test', async () => {
    process.env.NODE_ENV = 'development';
    await build(undefined, false);
    const code = await service.sendOtp('user@example.com', 'reset');
    expect(typeof code).toBe('string');
    expect(code).toHaveLength(6);
    expect(otpModel.deleteOne).not.toHaveBeenCalled();
  });

  it('P0-6: target SĐT -> ném 400 rõ ràng (SMS OTP chưa hỗ trợ), không tạo mã, không gửi mail', async () => {
    process.env.NODE_ENV = 'production';
    await build('production', true);
    await expect(service.sendOtp('0901234567', 'verify')).rejects.toMatchObject({
      status: 400,
    });
    expect(otpModel.create).not.toHaveBeenCalled();
    expect(mailService.sendOtpEmail).not.toHaveBeenCalled();
  });
});
