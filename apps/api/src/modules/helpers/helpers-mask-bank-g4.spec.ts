import { Types } from 'mongoose';
import { HelpersService } from './helpers.service';
import { HelperStatus, VerificationStatus } from '@homemate/types';

/**
 * Spec G4 (F8): PATCH /helpers/me/status và POST /helpers/me/kyc phải che
 * số tài khoản (****1234) như GET/PATCH me/profile đã làm.
 * H9: approveKyc/rejectKyc (HelpersService) cũng phải che — trước đây trả
 * profile.save() thô, gồm bank_account đầy đủ.
 */
describe('HelpersService - G4 mask bank account on setStatus/submitKyc', () => {
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
      // thật), không phải snapshot lúc tạo — submitKyc gán
      // verification_status sau khi tạo profile.
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
      findOneAndUpdate: jest.fn(() => ({ exec: async () => profile })),
      // approveKyc/rejectKyc dùng findOne(...).exec()
      findOne: jest.fn(() => ({ exec: async () => profile })),
    };
    const gateway: any = { broadcastHelperStatus: jest.fn() };
    const matchingService: any = { notifyNewSuitableHelper: jest.fn() };
    const service = new HelpersService(helperModel, gateway, matchingService);
    return { service, helperModel, gateway };
  }

  it('setStatus → số TK hiện ****7890, không còn số đầy đủ', async () => {
    const profile = makeProfile();
    const { service } = makeService(profile);

    const result = await service.setStatus(String(profile.user_id), {
      status: HelperStatus.OFFLINE,
    } as never);

    expect(result.bank_account.account_number).toBe('****7890');
    expect(JSON.stringify(result)).not.toContain(FULL_ACCOUNT);
    expect(result.status).toBe(HelperStatus.OFFLINE);
  });

  it('submitKyc → số TK hiện ****7890, không còn số đầy đủ', async () => {
    const profile = makeProfile({ verification_status: VerificationStatus.UNSUBMITTED });
    const { service } = makeService(profile);

    const result = await service.submitKyc(String(profile.user_id), {
      id_card_number: '001999888777',
      id_card_front: 'https://x/front.jpg',
      id_card_back: 'https://x/back.jpg',
      selfie_photo: 'https://x/selfie.jpg',
    } as never);

    expect(result.bank_account.account_number).toBe('****7890');
    expect(JSON.stringify(result)).not.toContain(FULL_ACCOUNT);
    expect(result.verification_status).toBe(VerificationStatus.PENDING);
  });

  it('approveKyc → số TK hiện ****7890, không còn số đầy đủ', async () => {
    const profile = makeProfile({
      verification_status: VerificationStatus.PENDING,
      id_card_front: 'https://x/front.jpg',
      id_card_back: 'https://x/back.jpg',
      selfie_photo: 'https://x/selfie.jpg',
    });
    const { service } = makeService(profile);

    const result = await service.approveKyc(String(profile.user_id));

    expect(result.bank_account.account_number).toBe('****7890');
    expect(JSON.stringify(result)).not.toContain(FULL_ACCOUNT);
    expect(result.verification_status).toBe(VerificationStatus.APPROVED);
    expect(result.verified_at).toBeDefined();
  });

  it('rejectKyc → số TK hiện ****7890, không còn số đầy đủ', async () => {
    const profile = makeProfile({ verification_status: VerificationStatus.PENDING });
    const { service } = makeService(profile);

    const result = await service.rejectKyc(String(profile.user_id), 'Ảnh CCCD bị mờ');

    expect(result.bank_account.account_number).toBe('****7890');
    expect(JSON.stringify(result)).not.toContain(FULL_ACCOUNT);
    expect(result.verification_status).toBe(VerificationStatus.REJECTED);
    expect(result.rejection_reason).toBe('Ảnh CCCD bị mờ');
  });
});
