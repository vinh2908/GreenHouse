import { VoipPushService } from './voip-push.service';

/**
 * Spec cho VoipPushService — lớp đánh thức cuộc gọi đến (CallKeep):
 *  - Chưa cấu hình env (trạng thái deploy hiện tại) = no-op ÊM: resolve
 *    { sent: 0, skipped: true }, không chạm DB, không ném lỗi.
 *  - Có env nhưng credential hỏng = vẫn không ném lỗi ra đường gọi chính.
 *  - Token thuộc platform mà kênh của nó chưa cấu hình = bỏ qua êm.
 */

const WAKE = {
  sessionId: '665f1e2b8f0a4c2d9e000001',
  callerId: '665f1e2b8f0a4c2d9e000002',
  callerName: 'Nguyễn Văn A',
  jobId: '665f1e2b8f0a4c2d9e000003',
};

function fakeUserModel(voipTokens: { token: string; platform: string }[]) {
  return {
    findById: jest.fn(() => ({
      select: () => ({
        exec: async () => ({ voip_tokens: voipTokens }),
      }),
    })),
    findByIdAndUpdate: jest.fn(() => ({ exec: async () => null })),
  };
}

function fakeConfig(env: Record<string, string>) {
  return { get: (key: string) => env[key] };
}

function makeService(
  env: Record<string, string>,
  tokens: { token: string; platform: string }[] = [],
) {
  const userModel = fakeUserModel(tokens);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new VoipPushService(userModel as any, fakeConfig(env) as any);
  return { service, userModel };
}

describe('VoipPushService', () => {
  it('chưa cấu hình env → skipped, không chạm DB, không ném lỗi', async () => {
    const { service, userModel } = makeService({});
    expect(service.isApnsConfigured()).toBe(false);
    expect(service.isFcmConfigured()).toBe(false);

    const result = await service.notifyIncomingCall(WAKE.callerId, WAKE);

    expect(result).toEqual({ sent: 0, skipped: true });
    expect(userModel.findById).not.toHaveBeenCalled();
  });

  it('APNs env có nhưng nội dung .p8 hỏng → resolve êm, sent = 0', async () => {
    const { service } = makeService(
      {
        APNS_VOIP_KEY_ID: 'ABC123DEFG',
        APNS_VOIP_TEAM_ID: 'TEAM123456',
        APNS_VOIP_KEY_CONTENT: 'this-is-not-a-pem-key',
        APNS_VOIP_BUNDLE_ID: 'com.homemate.app',
      },
      [{ token: 'a'.repeat(64), platform: 'ios' }],
    );
    expect(service.isApnsConfigured()).toBe(true);

    const result = await service.notifyIncomingCall(WAKE.callerId, WAKE);

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(false);
  });

  it('token Android mà FCM chưa cấu hình (chỉ có APNs) → bỏ qua êm', async () => {
    const { service } = makeService(
      {
        APNS_VOIP_KEY_ID: 'ABC123DEFG',
        APNS_VOIP_TEAM_ID: 'TEAM123456',
        APNS_VOIP_KEY_CONTENT: 'this-is-not-a-pem-key',
        APNS_VOIP_BUNDLE_ID: 'com.homemate.app',
      },
      [{ token: 'fcm-token-xyz-1234567890', platform: 'android' }],
    );

    const result = await service.notifyIncomingCall(WAKE.callerId, WAKE);

    expect(result).toEqual({ sent: 0, skipped: false });
  });

  it('FIREBASE_SERVICE_ACCOUNT_JSON hỏng → FCM coi như chưa cấu hình', async () => {
    const { service } = makeService({ FIREBASE_SERVICE_ACCOUNT_JSON: '{not json' });
    expect(service.isFcmConfigured()).toBe(false);
  });
});
