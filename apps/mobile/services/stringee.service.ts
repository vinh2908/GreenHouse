// services/stringee.service.ts
// Singleton adapter for Stringee React Native SDK (voice calls, Phase 1 F6).
//
// This is the ONLY file that imports/requires `stringee-react-native`.
// The SDK is a native module: it does NOT run on web or in Expo Go.
// All methods are safe no-ops (return false) when the SDK is unavailable,
// so the app behaves exactly as before in those environments — the call
// screen falls back to session-only UI.
//
// Tokens come ONLY from the GreenHouse API (/calls/token, /calls/sessions/:id/join-token).
// Never hardcode Stringee credentials here.
import { Platform } from 'react-native';

export interface StringeeCallEvents {
  onConnected?: () => void;
  onEnded?: () => void;
  onError?: (message: string) => void;
}

export interface IncomingCallInfo {
  callId: string;
  from: string;
}

interface IncomingSubscriber {
  onIncomingCall?: (info: IncomingCallInfo) => void;
}

type SdkModule = typeof import('stringee-react-native');
type StringeeClientInstance = InstanceType<SdkModule['StringeeClient']>;
type StringeeCallInstance = InstanceType<SdkModule['StringeeCall']>;

class StringeeService {
  private sdk: SdkModule | null | undefined = undefined; // undefined = not tried yet
  private client: StringeeClientInstance | null = null;
  private connectedUserId: string | null = null;
  private pendingToken: string | null = null;
  private currentCall: StringeeCallInstance | null = null;
  private pendingIncomingCall: StringeeCallInstance | null = null;
  private subscriber: IncomingSubscriber = {};
  private errorHandler: ((message: string) => void) | null = null;

  /**
   * Lazy-load the native SDK. Returns null on web / Expo Go / not installed.
   * Result is cached.
   */
  loadSdk(): SdkModule | null {
    if (this.sdk !== undefined) return this.sdk;
    if (Platform.OS === 'web') {
      this.sdk = null;
      return null;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.sdk = require('stringee-react-native') as SdkModule;
      if (!this.sdk?.StringeeClient || !this.sdk?.StringeeCall) {
        this.sdk = null;
      }
    } catch {
      this.sdk = null;
    }
    return this.sdk;
  }

  get isAvailable(): boolean {
    return this.loadSdk() !== null;
  }

  setIncomingListener(cb: IncomingSubscriber['onIncomingCall']): () => void {
    this.subscriber = { onIncomingCall: cb };
    return () => {
      if (this.subscriber.onIncomingCall === cb) this.subscriber = {};
    };
  }

  /** Back-compat alias matching the subscriber shape described in the design. */
  setSubscriber(sub: IncomingSubscriber): void {
    this.subscriber = sub;
  }

  setErrorHandler(handler: ((message: string) => void) | null): void {
    this.errorHandler = handler;
  }

  hasPendingIncoming(): boolean {
    return this.pendingIncomingCall !== null;
  }

  getPendingIncomingInfo(): IncomingCallInfo | null {
    if (!this.pendingIncomingCall) return null;
    return {
      callId: (this.pendingIncomingCall as unknown as { callId: string }).callId ?? '',
      from: (this.pendingIncomingCall as unknown as { from: string }).from ?? '',
    };
  }

  /**
   * Ensure a StringeeClient exists and is connected with `accessToken`
   * for `myUserId`. Returns false when the SDK is unavailable.
   */
  ensureConnected(accessToken: string, myUserId: string): boolean {
    const sdk = this.loadSdk();
    if (!sdk || !accessToken || !myUserId) return false;

    // Reconnect when the connected identity changes.
    if (this.client && this.connectedUserId && this.connectedUserId !== myUserId) {
      try {
        this.client.disconnect();
      } catch {
        // ignore
      }
      this.client = null;
      this.connectedUserId = null;
      this.currentCall = null;
      this.pendingIncomingCall = null;
    }

    if (!this.client) {
      this.client = new sdk.StringeeClient();
      this.client.setListener({
        onIncomingCall: (_client: unknown, call: StringeeCallInstance) => {
          this.pendingIncomingCall = call;
          const info: IncomingCallInfo = {
            callId: (call as unknown as { callId: string }).callId ?? '',
            from: (call as unknown as { from: string }).from ?? '',
          };
          this.subscriber.onIncomingCall?.(info);
        },
        onRequestAccessToken: () => {
          // TODO(token-refresh): fetch a fresh token via POST /calls/token or
          // /calls/sessions/:sessionId/join-token and call client.connect(newToken).
          // Left as a disconnect-safe no-op: the current token lasts 1h, which
          // covers a single call session; do NOT disconnect here.
        },
        onFailWithError: (_client: unknown, code: number, message: string) => {
          this.errorHandler?.(message || `Stringee error ${code}`);
        },
        onDisconnect: () => {
          // Keep connectedUserId so a later ensureConnected can reconnect if needed.
        },
        onConnect: () => {
          // no-op
        },
      });
    }

    this.pendingToken = accessToken;
    this.connectedUserId = myUserId;
    try {
      this.client.connect(accessToken);
    } catch (e) {
      this.errorHandler?.(e instanceof Error ? e.message : 'Không kết nối được Stringee');
      return false;
    }
    return true;
  }

  private wireCallListeners(call: StringeeCallInstance, events: StringeeCallEvents): void {
    // Signaling / media code tables: verify against SDK docs at integration time.
    // Mapping kept in ONE place:
    //  - Media state code 0 = connected  -> onConnected
    //  - Media state code 1 = disconnected -> onEnded
    //  - Signaling state codes: 2 = answered, 5 = ended/bye, 6 = busy (verify) ->
    //    5/6 treated as ended. Other signaling codes are informational.
    call.setCallListener({
      onChangeMediaState: (_c: unknown, code: number, description: string) => {
        if (code === 0) {
          events.onConnected?.();
        } else if (code === 1) {
          events.onEnded?.();
        } else if (description) {
          // Unknown media codes are not fatal by themselves.
        }
      },
      onChangeSignalingState: (
        _c: unknown,
        code: number,
        reason: string,
        _sipCode: number,
        _sipReason: string,
      ) => {
        // Verify code table against SDK docs: ended/bye is the terminal state.
        if (code === 5 || code === 6) {
          events.onEnded?.();
        } else if (code === 4) {
          // Commonly 'ended' in some SDK tables as well — treat reason check defensively.
          if (/end|bye|hangup/i.test(reason || '')) events.onEnded?.();
        }
      },
      onReceiveLocalStream: () => undefined,
      onReceiveRemoteStream: () => undefined,
    });
  }

  makeOutgoingCall(params: {
    myUserId: string;
    partnerId: string;
    events: StringeeCallEvents;
  }): boolean {
    const sdk = this.loadSdk();
    if (!sdk || !this.client) return false;
    if (!params.myUserId || !params.partnerId) return false;
    try {
      const call = new sdk.StringeeCall(
        this.client,
        params.myUserId,
        params.partnerId,
        false,
      );
      this.wireCallListeners(call, params.events);
      this.currentCall = call;
      call.makeCall();
      return true;
    } catch (e) {
      params.events.onError?.(e instanceof Error ? e.message : 'Không tạo được cuộc gọi');
      return false;
    }
  }

  answerPending(events: StringeeCallEvents): boolean {
    if (!this.pendingIncomingCall) return false;
    const call = this.pendingIncomingCall;
    this.pendingIncomingCall = null;
    try {
      this.wireCallListeners(call, events);
      this.currentCall = call;
      call.answer();
      return true;
    } catch (e) {
      events.onError?.(e instanceof Error ? e.message : 'Không trả lời được cuộc gọi');
      return false;
    }
  }

  rejectPending(): boolean {
    if (!this.pendingIncomingCall) return false;
    const call = this.pendingIncomingCall;
    this.pendingIncomingCall = null;
    try {
      call.reject();
      return true;
    } catch {
      return false;
    }
  }

  hangupCurrent(): boolean {
    if (!this.currentCall) return false;
    const call = this.currentCall;
    this.currentCall = null;
    try {
      call.hangup();
      return true;
    } catch {
      return false;
    }
  }

  setMute(muted: boolean): void {
    try {
      this.currentCall?.setMute(muted);
    } catch {
      // no-op safe
    }
  }

  setSpeakerphoneOn(on: boolean): void {
    try {
      this.currentCall?.setSpeakerphoneOn(on);
    } catch {
      // no-op safe
    }
  }

  disconnect(): void {
    try {
      this.client?.disconnect();
    } catch {
      // ignore
    }
    this.client = null;
    this.connectedUserId = null;
    this.pendingToken = null;
    this.currentCall = null;
    this.pendingIncomingCall = null;
  }
}

export const stringeeService = new StringeeService();
