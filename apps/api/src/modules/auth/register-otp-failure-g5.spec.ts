import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Spec G5 (F16, API): register() phải trả lỗi rõ khi gửi mail OTP thất bại
 * (prod: OtpService ném 502), không được tạo user rồi trả "Đăng ký thành công!".
 * Đường đăng ký khi mail gửi được — và đăng ký không email — giữ nguyên.
 */
describe('AuthService.register - G5 OTP mail failure', () => {
  function makeService(otpBehaviour: 'ok' | 'fail') {
    const usersService: any = {
      findByPhone: jest.fn(async () => null),
      findByEmail: jest.fn(async () => null),
      create: jest.fn(async (data: any) => ({
        id: 'user-1',
        phone: data.phone,
        full_name: data.full_name,
        email: data.email,
        roles: ['customer'],
        active_role: 'customer',
        token_version: 0,
      })),
      addRefreshToken: jest.fn(async () => undefined),
    };
    const jwtService: any = {
      signAsync: jest.fn(async () => 'mock-token'),
    };
    const configService: any = {
      get: jest.fn((key: string) => {
        if (key === 'jwt.accessSecret' || key === 'jwt.refreshSecret') return 'test-secret';
        if (key === 'jwt.accessExpiresIn') return '15m';
        if (key === 'jwt.refreshExpiresIn') return '7d';
        return undefined;
      }),
    };
    const otpService: any = {
      sendOtp:
        otpBehaviour === 'fail'
          ? jest.fn(async () => {
              throw new HttpException(
                'Gửi mã OTP thất bại. Vui lòng thử lại sau.',
                HttpStatus.BAD_GATEWAY,
              );
            })
          : jest.fn(async () => undefined),
    };
    const service = new AuthService(usersService, jwtService, configService, otpService);
    return { service, usersService, otpService };
  }

  const dto: any = {
    phone: '0901234567',
    full_name: 'Nguyen Van A',
    password: 'Secret123!',
    email: 'user@example.com',
  };

  it('gửi mail OTP lỗi → register ném lỗi, KHÔNG tạo user, không trả thành công', async () => {
    const { service, usersService, otpService } = makeService('fail');

    await expect(service.register(dto)).rejects.toMatchObject({ status: 502 });
    expect(otpService.sendOtp).toHaveBeenCalledWith('user@example.com', 'verify');
    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('gửi mail OTP được → đăng ký thành công như cũ', async () => {
    const { service, usersService, otpService } = makeService('ok');

    const result = await service.register(dto);

    expect(otpService.sendOtp).toHaveBeenCalledWith('user@example.com', 'verify');
    expect(usersService.create).toHaveBeenCalledTimes(1);
    expect(result.message).toBe('Đăng ký thành công!');
    expect(result.access_token).toBe('mock-token');
  });

  it('đăng ký không email → không gửi OTP, đăng ký thành công như cũ', async () => {
    const { service, usersService, otpService } = makeService('fail');

    const result = await service.register({ ...dto, email: undefined } as never);

    expect(otpService.sendOtp).not.toHaveBeenCalled();
    expect(usersService.create).toHaveBeenCalledTimes(1);
    expect(result.message).toBe('Đăng ký thành công!');
  });
});
