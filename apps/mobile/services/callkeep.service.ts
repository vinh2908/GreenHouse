// services/callkeep.service.ts
// Đánh thức cuộc gọi đến khi app chạy nền / bị đóng hẳn (VoIP push + CallKeep).
//
// Luồng hiện tại (socket CALL_INCOMING → IncomingCallModal) chỉ hoạt động khi
// app còn sống. Lớp này bổ sung kênh native:
//   iOS    — PushKit (react-native-voip-push-notification) nhận VoIP push từ
//            API (APNs) → báo cho CallKit (react-native-callkeep) hiển thị
//            giao diện cuộc gọi hệ thống → user trả lời → điều hướng vào
//            ĐÚNG luồng trả lời hiện có (/call/[jobId]?mode=answer →
//            join-token → stringeeService.answerPending qua StringeeHost).
//   Android — CallKeep setup + đăng ký phone account (ConnectionService).
//            Đánh thức khi app ĐÃ CHẾT cần FCM: app chưa cài Firebase nên
//            hiện tại chỉ thử lấy FCM token nếu module Firebase tình cờ có
//            mặt (optional require) — không có thì bỏ qua êm. Khi app còn
//            sống, socket vẫn là kênh báo cuộc gọi như cũ.
//
// Mọi entry point đều no-op an toàn khi native module không có mặt
// (web / Expo Go / bản build chưa link thư viện) — cùng pattern phòng thủ
// với stringee.service.ts (require lười + kiểm tra NativeModules).
import { NativeModules, Platform } from 'react-native';
import { router } from 'expo-router';
import apiClient from '@/services/api-client';
import { useCallStore } from '@/stores/call.store';
import { stringeeService } from '@/services/stringee.service';

export interface VoipCallInfo {
  sessionId: string;
  jobId: string;
  callerId: string;
  callerName: string;
}

type CallKeepApi = typeof import('react-native-callkeep').default;
type VoipPushApi = typeof import('react-native-voip-push-notification').default;
type TokenUploader = (voipToken: string, platform: 'ios' | 'android') => void;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** UUID v4 đơn giản cho CallKit (chỉ là handle hiển thị, không cần crypto). */
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class CallKeepService {
  private callkeep: CallKeepApi | null | undefined = undefined; // undefined = chưa thử
  private voip: VoipPushApi | null | undefined = undefined;
  private initialized = false;
  /** callUUID (CallKit) → thông tin phiên gọi đang chờ/đang diễn ra qua VoIP */
  private readonly pending = new Map<string, VoipCallInfo>();
  private readonly answered = new Set<string>();
  private cachedVoipToken: string | null = null;
  private tokenUploader: TokenUploader | null = null;
  private firebaseTokenTried = false;

  // ─── Nạp thư viện (phòng thủ, cùng pattern stringee.service) ─────────────

  loadCallKeep(): CallKeepApi | null {
    if (this.callkeep !== undefined) return this.callkeep;
    if (Platform.OS === 'web') {
      this.callkeep = null;
      return null;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('react-native-callkeep') as { default?: unknown };
      const api = (mod?.default ?? mod) as CallKeepApi | null;
      this.callkeep =
        api && typeof api.setup === 'function' && NativeModules.RNCallKeep ? api : null;
    } catch {
      this.callkeep = null;
    }
    return this.callkeep;
  }

  loadVoipPush(): VoipPushApi | null {
    if (this.voip !== undefined) return this.voip;
    if (Platform.OS !== 'ios') {
      this.voip = null;
      return null;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('react-native-voip-push-notification') as { default?: unknown };
      const api = (mod?.default ?? mod) as VoipPushApi | null;
      this.voip =
        api &&
        typeof api.registerVoipToken === 'function' &&
        NativeModules.RNVoipPushNotificationManager
          ? api
          : null;
    } catch {
      this.voip = null;
    }
    return this.voip;
  }

  get isAvailable(): boolean {
    return this.loadCallKeep() !== null;
  }

  // ─── Khởi tạo (idempotent — gọi 1 lần ở root app) ─────────────────────────

  init(): void {
    if (this.initialized) return;
    const RNCallKeep = this.loadCallKeep();
    if (!RNCallKeep) return;
    this.initialized = true;

    const options = {
      ios: {
        appName: 'Green House',
        supportsVideo: false,
        maximumCallGroups: '1',
        maximumCallsPerCallGroup: '1',
        includesCallsInRecents: false,
      },
      android: {
        alertTitle: '',
        alertDescription: '',
        cancelButton: 'Đóng',
        okButton: 'Đồng ý',
        additionalPermissions: [],
        selfManaged: true,
      },
    };
    try {
      RNCallKeep.setup(options).catch(() => undefined);
    } catch {
      // Bỏ qua nếu setup thất bại
    }
    if (Platform.OS === 'android') {
      // Đăng ký phone account với Telecom framework (user có thể phải bật
      // trong Cài đặt cuộc gọi của máy — hasPhoneAccount() kiểm tra được).
      try {
        RNCallKeep.registerPhoneAccount(options);
      } catch {
        // Không có ConnectionService (máy cũ/thiếu quyền) → bỏ qua êm.
      }
    }

    RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
      if (callUUID) this.handleAnswer(callUUID);
    });
    RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
      if (callUUID) this.handleEnd(callUUID);
    });
    // Sự kiện xảy ra lúc app bị đóng hẳn (user bấm Trả lời/Từ chối trên
    // CallKit trước khi JS kịp chạy) được iOS phát lại qua kênh này.
    RNCallKeep.addEventListener('didLoadWithEvents', events => {
      for (const e of events ?? []) {
        const data = (e?.data ?? {}) as { callUUID?: string };
        if (!data.callUUID) continue;
        if (e.name.includes('AnswerCall')) this.handleAnswer(data.callUUID);
        else if (e.name.includes('EndCall')) this.handleEnd(data.callUUID);
      }
    });

    // iOS: PushKit — token + payload cuộc gọi đến.
    const Voip = this.loadVoipPush();
    if (Voip) {
      Voip.addEventListener('register', token => {
        if (typeof token === 'string' && token) {
          this.cachedVoipToken = token;
          this.tokenUploader?.(token, 'ios');
        }
      });
      Voip.addEventListener('notification', payload => {
        this.handleVoipPayload(payload);
      });
      Voip.addEventListener('didLoadWithEvents', events => {
        for (const e of events ?? []) {
          if (e?.name === Voip.RNVoipPushRemoteNotificationReceivedEvent && e.data) {
            this.handleVoipPayload(e.data);
          }
        }
      });
      try {
        Voip.registerVoipToken();
      } catch {
        // PushKit chưa sẵn sàng (thiếu entitlement ở bản build) → bỏ qua êm.
      }
    }
  }

  // ─── VoIP token (hook đăng nhập quản lý vòng đời) ─────────────────────────

  /** Gắn callback upload token; token đã có sẵn (đăng ký trước khi login xong) được phát lại ngay. */
  setTokenUploader(uploader: TokenUploader | null): void {
    this.tokenUploader = uploader;
    if (uploader && this.cachedVoipToken) {
      uploader(this.cachedVoipToken, 'ios');
    }
  }

  /** Xin lại token sau khi đăng nhập (PushKit trả sự kiện register; Android thử FCM nếu có Firebase). */
  requestToken(): void {
    const Voip = this.loadVoipPush();
    if (Voip) {
      try {
        Voip.registerVoipToken();
      } catch {
        // no-op
      }
    }
    this.tryFirebaseToken();
  }

  /**
   * Android: FCM token chỉ lấy được khi app đã tích hợp Firebase
   * (@react-native-firebase/messaging). Hiện CHƯA cài (cần google-services.json
   * của chủ dự án) → optional require thất bại êm, không upload gì cả.
   */
  private tryFirebaseToken(): void {
    if (Platform.OS !== 'android' || this.firebaseTokenTried) return;
    this.firebaseTokenTried = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@react-native-firebase/messaging') as {
        default?: () => { getToken: () => Promise<string> };
      };
      const messaging = mod?.default;
      if (typeof messaging !== 'function') return;
      messaging()
        .getToken()
        .then(token => {
          if (token) this.tokenUploader?.(token, 'android');
        })
        .catch(() => undefined);
    } catch {
      // Chưa cài Firebase — đúng kỳ vọng ở giai đoạn này.
    }
  }

  // ─── Xử lý VoIP push (iOS) ────────────────────────────────────────────────

  private handleVoipPayload(raw: unknown): void {
    const data = (raw ?? {}) as Record<string, unknown>;
    const sessionId = str(data.session_id) || str(data.call_id);
    const jobId = str(data.job_id);
    if (sessionId && jobId) {
      this.displayIncoming({
        sessionId,
        jobId,
        callerId: str(data.caller_id),
        callerName: str(data.caller_name) || 'Đối tác GreenHouse',
      });
    }
    // iOS bắt buộc: phải báo cuộc gọi cho CallKit TRƯỚC khi báo PushKit là
    // đã xử lý xong (displayIncomingCall ở trên là lời gọi native đồng bộ),
    // nếu không hệ điều hành sẽ cắt quyền VoIP push của app.
    const Voip = this.loadVoipPush();
    const pushUuid = str(data.uuid);
    if (Voip && pushUuid) {
      try {
        Voip.onVoipNotificationCompleted(pushUuid);
      } catch {
        // no-op
      }
    }
  }

  /** Dựng giao diện cuộc gọi hệ thống cho 1 phiên gọi đến. Trả về callUUID. */
  displayIncoming(info: VoipCallInfo): string | null {
    const RNCallKeep = this.loadCallKeep();
    if (!RNCallKeep) return null;
    const uuid = uuidv4();
    this.pending.set(uuid, info);
    try {
      RNCallKeep.displayIncomingCall(uuid, info.callerName, info.callerName, 'generic', false);
    } catch {
      this.pending.delete(uuid);
      return null;
    }
    return uuid;
  }

  // ─── Sự kiện từ CallKit ────────────────────────────────────────────────────

  private handleAnswer(callUUID: string): void {
    const info = this.pending.get(callUUID);
    if (!info) return;
    this.answered.add(callUUID);
    // Nạp cùng state mà đường socket nạp, rồi vào ĐÚNG màn trả lời hiện có:
    // join-token → ensureConnected → chờ SDK báo incoming → answerPending().
    useCallStore.getState().setIncoming({
      session_id: info.sessionId,
      job_id: info.jobId,
      caller_id: info.callerId,
      provider: 'stringee',
    });
    router.push({
      pathname: '/call/[jobId]',
      params: {
        jobId: info.jobId,
        sessionId: info.sessionId,
        mode: 'answer',
        partnerName: info.callerName,
      },
    });
  }

  private handleEnd(callUUID: string): void {
    const info = this.pending.get(callUUID);
    this.pending.delete(callUUID);
    const wasAnswered = this.answered.delete(callUUID);
    if (!info) return;
    if (useCallStore.getState().incoming?.session_id === info.sessionId) {
      useCallStore.getState().clearIncoming();
    }
    if (wasAnswered) {
      // Đang trong cuộc gọi mà user cúp từ giao diện hệ thống → cúp cả 2 phía.
      stringeeService.hangupCurrent();
      void apiClient
        .post(`/calls/sessions/${info.sessionId}/end`, { reason: 'ended' })
        .catch(() => undefined);
    } else {
      // Chưa trả lời mà user từ chối trên CallKit = từ chối cuộc gọi.
      void apiClient
        .post(`/calls/sessions/${info.sessionId}/end`, { reason: 'declined' })
        .catch(() => undefined);
    }
  }

  /**
   * Đồng bộ NGƯỢC: cuộc gọi kết thúc từ trong app (màn hình cuộc gọi báo
   * onEnded / đối tác cúp trước) → báo cho CallKit dọn giao diện hệ thống.
   * No-op khi phiên đó không đi qua CallKit.
   */
  reportSessionEnded(sessionId: string): void {
    const RNCallKeep = this.loadCallKeep();
    if (!RNCallKeep) return;
    for (const [uuid, info] of [...this.pending]) {
      if (info.sessionId !== sessionId) continue;
      this.pending.delete(uuid);
      this.answered.delete(uuid);
      try {
        RNCallKeep.endCall(uuid);
      } catch {
        // no-op
      }
    }
  }
}

export const callkeepService = new CallKeepService();
