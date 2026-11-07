import { Types } from 'mongoose';
import { AdminService } from './admin.service';
import { HelperStatus, VerificationStatus } from '@homemate/types';

/**
 * Spec G4 (F8) — H9: approveKyc/rejectKyc của AdminService (route admin duyệt
 * e-KYC, route live) phải che số tài khoản (****7890) như HelpersService đã
 * làm cho setStatus/submitKyc. Trước đây cả hai trả profile.save() thô, gồm
 * bank_account đầy đủ.
 */
describe('AdminService - G4 mask bank account on approveKyc/rejectKyc', () => {
  const FULL_ACCOUNT = '1234567890';

  function makeProfile(overrides: Record<string, unknown> = {}) {
    const data: Record<string, any> = {
      _id: new Types.ObjectId(),
      user_id: new Types.ObjectId(),
      status: HelperStatus.OFFLINE,
      verification_status: VerificationStatus.PENDING,
      bank_account: {
        bank_name: 'Vietcombank',
        account_number: FULL_ACCOUNT,
        account_name: 'NGUYEN VAN A',
      },
      ...overrides,
    };
    const profile: any = {
      ...data,
      // toObject() phải phản ánh trạng thái hiện tại của doc (như Mongoose
      // thật), không phải snapshot lúc tạo.
      toObject: function (this: any) {
        const rest = { ...this };
        delete rest.toObject;
        delete rest.save;
        return rest;
      },
      save: jest.fn(async function (this: any) {
        return this;
      }),
    };
    return profile;
  }

  function makeService(profile: any) {
    const helperModel: any = {
      findOne: jest.fn(() => ({ exec: async () => profile })),
    };
    const notificationsService: any = { create: jest.fn(async () => ({})) };
    // AdminService có 14 tham số constructor; chỉ helperModel +
    // notificationsService được approveKyc/rejectKyc dùng tới.
    const service = new AdminService(
      {} as never,
      helperModel,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      notificationsService,
      {} as never,
    );
    return { service, helperModel, notificationsService };
  }

  it('approveKyc → số TK hiện ****7890, không còn số đầy đủ', async () => {
    const profile = makeProfile({
      verification_status: VerificationStatus.PENDING,
      id_card_front: 'https://x/front.jpg',
      id_card_back: 'https://x/back.jpg',
      selfie_photo: 'https://x/selfie.jpg',
    });
    const { service, notificationsService } = makeService(profile);

    const result = await service.approveKyc(String(profile.user_id));

    expect(result.bank_account.account_number).toBe('****7890');
    expect(JSON.stringify(result)).not.toContain(FULL_ACCOUNT);
    expect(result.verification_status).toBe(VerificationStatus.APPROVED);
    expect(result.verified_at).toBeDefined();
    expect(notificationsService.create).toHaveBeenCalled();
  });

  it('rejectKyc → số TK hiện ****7890, không còn số đầy đủ', async () => {
    const profile = makeProfile({ verification_status: VerificationStatus.PENDING });
    const { service, notificationsService } = makeService(profile);

    const result = await service.rejectKyc(String(profile.user_id), 'Ảnh CCCD bị mờ');

    expect(result.bank_account.account_number).toBe('****7890');
    expect(JSON.stringify(result)).not.toContain(FULL_ACCOUNT);
    expect(result.verification_status).toBe(VerificationStatus.REJECTED);
    expect(result.rejection_reason).toBe('Ảnh CCCD bị mờ');
    expect(notificationsService.create).toHaveBeenCalled();
  });
});
