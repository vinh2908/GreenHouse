import * as bcrypt from 'bcryptjs';
import { plainToInstance } from 'class-transformer';
import { AuthService } from './auth.service';
import { RegisterDto, ResetPasswordDto } from './dto/auth.dto';

/**
 * R13-I3 — Password trim parity (live risk found 2026-11-18).
 *
 * R12 item 5 made the mobile client trim the password before sending, but
 * the server hashed/compared the raw password in register/login/reset/
 * delete. An account created pre-R12 with a leading/trailing space
 * (hash of " pass123 ") can no longer log in from the trimmed client:
 * bcrypt.compare("pass123", hash(" pass123 ")) is false.
 *
 * Fix: server trims on write (DTO @Transform + defensive trim in the
 * service) and login/delete try the trimmed form first, then fall back to
 * the raw form — so old APKs/admin (raw) and new mobile (trimmed) both
 * work against old and new hashes. Accounts whose hash is spaced can only
 * be rescued by a password reset (the server can never see the original
 * spaced input again) — that is documented by the failing-login test below.
 *
 * FAILS on base d06aa9c: register stores the spaced hash; login with the
 * raw spaced input against a legacy spaced hash fails (no fallback).
 */
describe('AuthService — R13-I3 password trim parity', () => {
  const PHONE = '0365290805';

  function makeService() {
    const usersService: any = {
      findByPhone: jest.fn(async () => null),
      findByEmail: jest.fn(async () => null),
      create: jest.fn(async (input: any) => ({
        id: 'user1',
        _id: 'user1',
        ...input,
        roles: ['customer'],
        active_role: 'customer',
        token_version: 0,
      })),
      findByPhoneWithPassword: jest.fn(async () => null),
      findByEmailWithPassword: jest.fn(async () => null),
      findByIdWithPassword: jest.fn(async () => null),
      updatePassword: jest.fn(async () => true),
      addRefreshToken: jest.fn(async () => true),
      revokeAllRefreshTokens: jest.fn(async () => true),
      incrementTokenVersion: jest.fn(async () => true),
    };
    const jwtService: any = { signAsync: jest.fn(async () => 'tok') };
    const configService: any = { get: jest.fn(() => 'secret') };
    const otpService: any = {
      sendOtp: jest.fn(async () => ({})),
      verifyOtp: jest.fn(async () => true),
    };
    const dummy = {} as never;
    const helperModel: any = {
      updateOne: jest.fn(() => ({ exec: jest.fn(async () => ({})) })),
    };
    const service = new AuthService(
      usersService,
      jwtService,
      configService,
      otpService,
      helperModel,
    );
    return { service, usersService, otpService };
  }

  function makeUserWithHash(passwordHash: string): any {
    return {
      id: 'user1',
      _id: 'user1',
      phone: PHONE,
      password_hash: passwordHash,
      roles: ['customer'],
      active_role: 'customer',
      status: 'active',
      is_deleted: false,
      token_version: 0,
      save: jest.fn(async () => true),
    };
  }

  it('register stores the hash of the TRIMMED password', async () => {
    const { service, usersService } = makeService();
    await service.register({
      phone: PHONE,
      full_name: 'Test User',
      password: '  Password123!  ',
    } as any);
    const created = (usersService.create as jest.Mock).mock.calls[0][0];
    expect(await bcrypt.compare('Password123!', created.password_hash)).toBe(true);
    expect(await bcrypt.compare('  Password123!  ', created.password_hash)).toBe(false);
  });

  it('DTO @Transform trims the password before validation', () => {
    const reg = plainToInstance(RegisterDto, {
      phone: PHONE,
      full_name: 'Test',
      password: '  Password123!  ',
      email: 'a@b.co',
    });
    expect(reg.password).toBe('Password123!');
    const reset = plainToInstance(ResetPasswordDto, {
      phone: PHONE,
      otp: '123456',
      new_password: '  NewPass123!  ',
    });
    expect(reset.new_password).toBe('NewPass123!');
  });

  it('login with trimmed input succeeds against a trimmed hash', async () => {
    const { service, usersService } = makeService();
    const hash = await bcrypt.hash('Password123!', 12);
    (usersService.findByPhoneWithPassword as jest.Mock).mockResolvedValue(makeUserWithHash(hash));
    const res = await service.login({ phone: PHONE, password: 'Password123!' } as any);
    expect(res.user.phone).toBe(PHONE);
  });

  it('login with RAW spaced input succeeds against a legacy spaced hash (fallback)', async () => {
    const { service, usersService } = makeService();
    const legacyHash = await bcrypt.hash('  Password123!  ', 12);
    (usersService.findByPhoneWithPassword as jest.Mock).mockResolvedValue(
      makeUserWithHash(legacyHash),
    );
    const res = await service.login({ phone: PHONE, password: '  Password123!  ' } as any);
    expect(res.user.phone).toBe(PHONE);
  });

  it('login with TRIMMED input against a legacy spaced hash FAILS (reset-only rescue)', async () => {
    const { service, usersService } = makeService();
    const legacyHash = await bcrypt.hash('  Password123!  ', 12);
    (usersService.findByPhoneWithPassword as jest.Mock).mockResolvedValue(
      makeUserWithHash(legacyHash),
    );
    await expect(service.login({ phone: PHONE, password: 'Password123!' } as any)).rejects.toThrow(
      'Số điện thoại, email hoặc mật khẩu không đúng',
    );
  });

  it('resetPassword stores the hash of the TRIMMED new password', async () => {
    const { service, usersService } = makeService();
    const user = makeUserWithHash(await bcrypt.hash('OldPass123!', 12));
    (usersService.findByPhone as jest.Mock).mockResolvedValue(user);
    await service.resetPassword({
      phone: PHONE,
      otp: '123456',
      new_password: '  NewPass123!  ',
    } as any);
    const hash = (usersService.updatePassword as jest.Mock).mock.calls[0][1];
    expect(await bcrypt.compare('NewPass123!', hash)).toBe(true);
    expect(await bcrypt.compare('  NewPass123!  ', hash)).toBe(false);
  });

  it('deleteAccount with RAW spaced input succeeds against a legacy spaced hash (fallback)', async () => {
    const { service, usersService } = makeService();
    const legacyHash = await bcrypt.hash('  Password123!  ', 12);
    (usersService.findByIdWithPassword as jest.Mock).mockResolvedValue(
      makeUserWithHash(legacyHash),
    );
    const res = await service.deleteAccount('user1', '  Password123!  ');
    expect(res.success).toBe(true);
  });
});
