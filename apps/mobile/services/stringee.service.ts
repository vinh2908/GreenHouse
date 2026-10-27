// services/stringee.service.ts
// Singleton adapter for the Stringee React Native SDK (voice calls, Phase 1 F6).
//
// REWRITTEN against the REAL `stringee-react-native@1.5.8` API — verified from
// the published package sources (see types/stringee-react-native.d.ts):
//   - StringeeClient / StringeeCall are React COMPONENTS (named exports), not
//     imperative classes: `new StringeeClient()` throws because its
//     constructor reads this.props. The components are rendered exactly once
//     by components/common/stringee-host.tsx and driven through refs that the
//     host registers with this service (_registerClient / _registerCall).
//   - Events arrive through the components' `eventHandlers` props as single
//     data objects. There are NO setListener/setCallListener methods.
//   - Calls are identified by a callId string. Every operation on the
//     StringeeCall ref takes that callId: makeCall(jsonString, cb),
//     initAnswer(callId, cb) then answer(callId, cb), reject/hangup(callId),
//     mute(callId, ...) — the SDK method is `mute`, not `setMute`.
//
// Chicken-and-egg: the call screen can call ensureConnected() before the host
// has mounted/registered the client ref, and connect() itself is async (the
// native client only becomes usable on the onConnect event). Both the connect
// request and an outgoing call are therefore BUFFERED here and flushed when
// the refs register / onConnect fires.
//
// The public API of this service is unchanged from the previous adapter, so
// app/call/[jobId].tsx keeps working as-is.
//
// The SDK is a native module: it does NOT run on web or in Expo Go. Every
// method is a safe no-op (returns false) when the SDK is unavailable, so the
// app behaves exactly as before in those environments — the call screen
// falls back to session-only UI.
//
// Tokens come ONLY from the GreenHouse API (/calls/token, /calls/sessions/:id/join-token).
// Never hardcode Stringee credentials here.
import { NativeModules, Platform } from 'react-native';
import type {
  StringeeErrorEventData,
  StringeeIncomingCallEventData,
  StringeeMediaStateEventData,
  StringeeSignalingStateEventData,
} from 'stringee-react-native';

export interface StringeeCallEvents {
  onConnected?: () => void;
  onEnded?: () => void;
  onError?: (message: string) => void;
  onBusyOrRejected?: (reason?: string) => void;
}

export interface IncomingCallInfo {
  callId: string;
  from: string;
}

interface IncomingSubscriber {
  onIncomingCall?: (info: IncomingCallInfo) => void;
}

interface OutgoingRequest {
  myUserId: string;
  partnerId: string;
  events: StringeeCallEvents;
}

type SdkModule = typeof import('stringee-react-native');
type StringeeClientInstance = InstanceType<SdkModule['StringeeClient']>;
type StringeeCallInstance = InstanceType<SdkModule['StringeeCall']>;

const noopCallback = () => undefined;

class StringeeService {
  private sdk: SdkModule | null | undefined = undefined; // undefined = not tried yet
  // Refs owned by <StringeeHost/> (components/common/stringee-host.tsx).
  private clientRef: StringeeClientInstance | null = null;
  private callRef: StringeeCallInstance | null = null;
  /** True once the native client fires onConnect; makeCall requires it natively. */
  private clientReady = false;
  private connectedUserId: string | null = null;
  private pendingToken: string | null = null;
  /** ensureConnected() request waiting for the host to register the client ref. */
  private bufferedConnect: { token: string; userId: string } | null = null;
  /** Outgoing call waiting for the call ref + client onConnect. */
  private pendingOutgoing: OutgoingRequest | null = null;
  /** Answer request waiting for callRef, client onConnect, or SDK incomingCall. */
  private pendingAnswer: { events: StringeeCallEvents } | null = null;
  /** Optional callback to refresh Stringee token when SDK requests it. */
  private tokenRefresher: (() => Promise<string | null>) | null = null;
  /** Event handlers of the single active call (outgoing or answered). */
  private activeEvents: StringeeCallEvents | null = null;
  /**
   * callId of the active call, learned from: the makeCall callback (outgoing),
   * the incoming-call event (incoming), or the first signaling/media event.
   * Until it is known, mute/speaker/hangup are safe no-ops — the SDK exposes
   * no handle to an outgoing call before it starts signaling.
   */
  private activeCallId: string | null = null;
  private pendingIncoming: IncomingCallInfo | null = null;
  private subscriber: IncomingSubscriber = {};
  private errorHandler: ((message: string) => void) | null = null;

  /**
   * Lazy-load the SDK. Returns null on web / Expo Go / not installed.
   * Result is cached. The package's JS wrapper loads fine even in Expo Go,
   * so availability ALSO requires the native modules to be linked.
   */
  loadSdk(): SdkModule | null {
    if (this.sdk !== undefined) return this.sdk;
    if (Platform.OS === 'web') {
      this.sdk = null;
      return null;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('stringee-react-native') as SdkModule;
      if (
        !mod?.StringeeClient ||
        !mod?.StringeeCall ||
        !NativeModules.RNStringeeClient ||
        !NativeModules.RNStringeeCall
      ) {
        this.sdk = null;
      } else {
        this.sdk = mod;
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
    return this.pendingIncoming !== null;
  }

  getPendingIncomingInfo(): IncomingCallInfo | null {
    return this.pendingIncoming;
  }

  isClientReady(): boolean {
    return this.clientReady;
  }

  getConnectedUserId(): string | null {
    return this.connectedUserId;
  }

  getActiveCallId(): string | null {
    return this.activeCallId;
  }

  setTokenRefresher(refresher: (() => Promise<string | null>) | null): void {
    this.tokenRefresher = refresher;
  }

  getDiagnostics() {
    return {
      clientReady: this.clientReady,
      connectedUserId: this.connectedUserId,
      hasClientRef: !!this.clientRef,
      hasCallRef: !!this.callRef,
      pendingIncoming: this.pendingIncoming?.callId || null,
      pendingAnswer: !!this.pendingAnswer,
      activeCallId: this.activeCallId,
    };
  }

  /**
   * Ask the StringeeClient (rendered by <StringeeHost/>) to connect with
   * `accessToken` for `myUserId`. If the host has not registered the client
   * ref yet, the request is buffered and flushed on registration.
   * Returns false only when the SDK is unavailable or args are invalid.
   */
  ensureConnected(accessToken: string, myUserId: string): boolean {
    if (!this.loadSdk() || !accessToken || !myUserId) return false;

    // Reconnect when the connected identity changes.
    if (this.connectedUserId && this.connectedUserId !== myUserId) {
      try {
        this.clientRef?.disconnect();
      } catch {
        // ignore
      }
      this.clientReady = false;
      this.resetCallState();
    }

    // Already connected as this user with this exact token: nothing to do.
    if (
      this.clientReady &&
      this.connectedUserId === myUserId &&
      this.pendingToken === accessToken
    ) {
      return true;
    }

    this.connectedUserId = myUserId;
    this.pendingToken = accessToken;
    this.bufferedConnect = { token: accessToken, userId: myUserId };
    return this.flushConnect();
  }

  /** Issue the buffered connect() once the client ref exists. */
  private flushConnect(): boolean {
    const pending = this.bufferedConnect;
    if (!pending) return true;
    if (!this.clientRef) return true; // buffered — host flushes on registration
    this.bufferedConnect = null;
    try {
      this.clientRef.connect(pending.token);
    } catch (e) {
      this.errorHandler?.(e instanceof Error ? e.message : 'Không kết nối được Stringee');
      return false;
    }
    return true;
  }

  /**
   * Start an outgoing voice call. Executes immediately when the client is
   * connected; otherwise it is buffered and flushed on onConnect (the screen
   * always calls ensureConnected() first).
   */
  makeOutgoingCall(params: OutgoingRequest): boolean {
    if (!this.loadSdk()) return false;
    if (!params.myUserId || !params.partnerId) return false;
    console.log(
      `[Stringee] makeOutgoingCall: myUserId=${params.myUserId}, partnerId=${params.partnerId}, clientReady=${this.clientReady}, hasCallRef=${!!this.callRef}`,
    );
    this.activeEvents = params.events;
    this.pendingOutgoing = params;
    this.flushOutgoing();
    if (!this.pendingOutgoing) return true; // executed immediately
    // Buffered: meaningful only while a connect for this user is in flight.
    return this.connectedUserId === params.myUserId;
  }

  private flushOutgoing(): void {
    const pending = this.pendingOutgoing;
    if (!pending || !this.callRef || !this.clientReady) {
      console.log(
        `[Stringee] flushOutgoing waiting: pending=${!!pending}, callRef=${!!this.callRef}, clientReady=${this.clientReady}`,
      );
      return;
    }
    if (this.connectedUserId !== pending.myUserId) {
      console.warn(
        `[Stringee] flushOutgoing userId mismatch: connectedUserId=${this.connectedUserId}, pending.myUserId=${pending.myUserId}`,
      );
      return;
    }
    this.pendingOutgoing = null;
    // SDK contract: parameters is a JSON STRING { from, to, isVideoCall }.
    const parameters = JSON.stringify({
      from: pending.myUserId,
      to: pending.partnerId,
      isVideoCall: false,
    });
    console.log(`[Stringee] makeCall calling native SDK with: ${parameters}`);
    try {
      this.callRef.makeCall(parameters, (status, code, message, callId) => {
        console.log(
          `[Stringee] makeCall kết quả: status=${status}, code=${code}, message=${message}, callId=${callId}`,
        );
        if (status) {
          // Outgoing callId arrives here (Android: when signaling reaches
          // CALLING; iOS: in the makeCall completion handler).
          if (callId) this.activeCallId = callId;
        } else {
          const detail = `Không tạo được cuộc gọi (makeCall mã ${code}: ${message || 'Lỗi không xác định'})`;
          console.warn('[Stringee]', detail);
          pending.events.onError?.(detail);
          if (this.activeEvents === pending.events) this.activeEvents = null;
        }
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Không tạo được cuộc gọi';
      console.warn('[Stringee] makeCall exception:', errMsg);
      pending.events.onError?.(`Không tạo được cuộc gọi: ${errMsg}`);
    }
  }

  /**
   * Trả lời cuộc gọi đến. Hỗ trợ đệm tự động (buffer):
   * - Nếu client chưa connect xong: đệm chờ onConnect.
   * - Nếu SDK chưa giao sự kiện incomingCall: đệm chờ onIncomingCall.
   * - Nếu component StringeeCall chưa sẵn sàng: đệm chờ callRef.
   * - CHỈ xóa pendingIncoming sau khi initAnswer báo thành công.
   */
  answerPending(events: StringeeCallEvents): boolean {
    console.log(
      `[Stringee] answerPending called. clientReady=${this.clientReady}, hasCallRef=${!!this.callRef}, pendingIncoming=${this.pendingIncoming?.callId || 'null'}, connectedUserId=${this.connectedUserId}`,
    );
    this.activeEvents = events;
    this.pendingAnswer = { events };

    // Thử thực thi nếu đã đủ điều kiện
    return this.flushAnswer();
  }

  private flushAnswer(): boolean {
    const pendingAns = this.pendingAnswer;
    if (!pendingAns) return false;
    const events = pendingAns.events;

    // 1. Kiểm tra CallRef (component StringeeCall đã mount chưa)
    if (!this.callRef) {
      console.log('[Stringee] flushAnswer: chờ component StringeeCall ref...');
      return true;
    }

    // 2. Kiểm tra ClientReady (StringeeClient đã kết nối thành công chưa)
    if (!this.clientReady) {
      console.log('[Stringee] flushAnswer: chờ client onConnect...');
      // Nếu có pendingToken mà client chưa connect, kích hoạt connect lại
      if (this.pendingToken && this.clientRef && !this.bufferedConnect) {
        console.log('[Stringee] flushAnswer: chủ động gọi connect lại client...');
        try {
          this.clientRef.connect(this.pendingToken);
        } catch (e) {
          console.warn('[Stringee] flushAnswer client.connect error:', e);
        }
      }
      return true;
    }

    // 3. Kiểm tra PendingIncoming (SDK đã nhận sự kiện incoming call chưa)
    const incoming = this.pendingIncoming;
    if (!incoming || !incoming.callId) {
      console.log('[Stringee] flushAnswer: chờ sự kiện incomingCall từ native SDK...');
      return true;
    }

    // ĐÃ ĐỦ ĐIỀU KIỆN: Bắt đầu initAnswer
    const callId = incoming.callId;
    console.log(`[Stringee] Đủ điều kiện, bắt đầu initAnswer cho callId=${callId}`);

    try {
      this.callRef.initAnswer(callId, (status, code, message) => {
        console.log(
          `[Stringee] initAnswer callback: status=${status}, code=${code}, message=${message}`,
        );

        if (!status) {
          // GIỮ NGUYÊN pendingIncoming để không mất trạng thái, cho phép thử lại
          const detail = `Không khởi tạo được trả lời cuộc gọi (initAnswer mã ${code}: ${message || 'Lỗi không xác định'})`;
          console.warn('[Stringee]', detail);
          events.onError?.(detail);
          return;
        }

        // initAnswer THÀNH CÔNG: Lúc này mới giải phóng pending
        this.activeCallId = callId;
        this.pendingIncoming = null;
        this.pendingAnswer = null;

        try {
          this.callRef?.answer(callId, (s2, c2, m2) => {
            console.log(`[Stringee] answer callback: status=${s2}, code=${c2}, message=${m2}`);
            if (!s2) {
              const detail = `Không bắt máy được (answer mã ${c2}: ${m2 || 'Lỗi trả lời'})`;
              console.warn('[Stringee]', detail);
              events.onError?.(detail);
            }
          });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : 'Lỗi khi gọi answer()';
          console.warn('[Stringee] answer exception:', errMsg);
          events.onError?.(`Lỗi khi bắt máy: ${errMsg}`);
        }
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Lỗi khi gọi initAnswer()';
      console.warn('[Stringee] initAnswer exception:', errMsg);
      events.onError?.(`Lỗi khởi tạo trả lời cuộc gọi: ${errMsg}`);
      return false;
    }

    return true;
  }

  rejectPending(): boolean {
    const pending = this.pendingIncoming;
    if (!pending) return false;
    this.pendingIncoming = null;
    if (!this.callRef) return false;
    try {
      this.callRef.reject(pending.callId, noopCallback);
      return true;
    } catch {
      return false;
    }
  }

  hangupCurrent(): boolean {
    let acted = false;
    // Cancel an outgoing call that is still buffered behind connect().
    if (this.pendingOutgoing) {
      this.pendingOutgoing = null;
      acted = true;
    }
    const callId = this.activeCallId;
    this.activeCallId = null;
    this.activeEvents = null;
    if (callId && this.callRef) {
      try {
        this.callRef.hangup(callId, noopCallback);
        acted = true;
      } catch {
        // ignore
      }
    }
    return acted;
  }

  setMute(muted: boolean): void {
    // SDK method is mute(callId, muted, cb). Safe no-op until the active
    // callId is known (see activeCallId note above).
    if (!this.activeCallId || !this.callRef) return;
    try {
      this.callRef.mute(this.activeCallId, muted, noopCallback);
    } catch {
      // no-op safe
    }
  }

  setSpeakerphoneOn(on: boolean): void {
    if (!this.activeCallId || !this.callRef) return;
    try {
      this.callRef.setSpeakerphoneOn(this.activeCallId, on, noopCallback);
    } catch {
      // no-op safe
    }
  }

  disconnect(): void {
    try {
      this.clientRef?.disconnect();
    } catch {
      // ignore
    }
    // The refs belong to <StringeeHost/> and stay registered; only the
    // connection + call session state is reset here.
    this.clientReady = false;
    this.connectedUserId = null;
    this.pendingToken = null;
    this.bufferedConnect = null;
    this.resetCallState();
  }

  private resetCallState(): void {
    this.pendingOutgoing = null;
    this.pendingAnswer = null;
    this.activeEvents = null;
    this.activeCallId = null;
    this.pendingIncoming = null;
  }

  // ─── Host wiring (internal — called only by <StringeeHost/>) ──────────────

  /** INTERNAL: the host registers the rendered <StringeeClient> ref here. */
  _registerClient(ref: StringeeClientInstance | null): void {
    this.clientRef = ref;
    if (!ref) {
      this.clientReady = false;
      return;
    }
    if (this.bufferedConnect) this.flushConnect();
  }

  /** INTERNAL: the host registers the rendered <StringeeCall> ref here. */
  _registerCall(ref: StringeeCallInstance | null): void {
    this.callRef = ref;
    if (ref) {
      this.flushOutgoing();
      this.flushAnswer();
    }
  }

  /** INTERNAL: client eventHandlers.onConnect. */
  _handleClientConnect(): void {
    console.log(`[Stringee] Client connected! userId: ${this.connectedUserId}`);
    this.clientReady = true;
    this.flushOutgoing();
    this.flushAnswer();
  }

  /** INTERNAL: client eventHandlers.onDisConnect. */
  _handleClientDisconnect(): void {
    console.log('[Stringee] Client disconnected');
    // Keep connectedUserId so a later ensureConnected can reconnect if needed.
    this.clientReady = false;
  }

  /** INTERNAL: client eventHandlers.onFailWithError — data is { code, message }. */
  _handleClientError(data: StringeeErrorEventData | undefined): void {
    const message =
      data?.message ||
      (data?.code != null ? `Stringee error ${data.code}` : 'Lỗi kết nối Stringee');
    console.warn('[Stringee] _handleClientError:', message, data);
    this.errorHandler?.(message);
    // If a call setup was waiting on this connection, surface it there too.
    const waiting = this.pendingOutgoing?.events ?? this.activeEvents;
    if (waiting) waiting.onError?.(message);
    this.pendingOutgoing = null;
  }

  /** INTERNAL: client eventHandlers.onRequestAccessToken. */
  async _handleTokenRequest(): Promise<void> {
    console.log('[Stringee] onRequestAccessToken event triggered from native SDK');
    if (this.tokenRefresher) {
      try {
        const newToken = await this.tokenRefresher();
        if (newToken && this.clientRef) {
          console.log('[Stringee] Refreshed token successfully, reconnecting client...');
          this.pendingToken = newToken;
          this.clientRef.connect(newToken);
          return;
        }
      } catch (err) {
        console.warn('[Stringee] Token refresher failed:', err);
      }
    }
    // Fallback: nếu có pendingToken hiện tại, thử connect lại
    if (this.pendingToken && this.clientRef) {
      try {
        console.log('[Stringee] Reconnecting with current pending token...');
        this.clientRef.connect(this.pendingToken);
      } catch (e) {
        console.warn('[Stringee] Reconnect with pending token failed:', e);
      }
    }
  }

  /** INTERNAL: client eventHandlers.onIncomingCall — data carries callId + from. */
  _handleIncomingCall(data: StringeeIncomingCallEventData | undefined): void {
    console.log('[Stringee] onIncomingCall received:', JSON.stringify(data));
    if (!data?.callId) return;
    this.pendingIncoming = { callId: data.callId, from: data.from ?? '' };
    this.subscriber.onIncomingCall?.(this.pendingIncoming);
    this.flushAnswer();
  }

  /** INTERNAL: call eventHandlers.onChangeSignalingState. */
  _handleSignalingState(data: StringeeSignalingStateEventData | undefined): void {
    if (!data || !this.trackCallId(data.callId)) return;
    // SignalingState codes (Stringee native SDK): 0 Calling, 1 Ringing,
    // 2 Answered, 3 Busy, 4 Ended.
    if (data.code === 2) {
      // Defensive: media Connected (below) is the primary onConnected signal;
      // Answered covers builds where media events arrive late.
      this.activeEvents?.onConnected?.();
    } else if (data.code === 3) {
      // Bên kia từ chối hoặc bận (Busy / Rejected by remote)
      console.log('[Stringee] SignalingState 3: Người kia đã từ chối hoặc đang bận');
      const events = this.activeEvents;
      this.activeCallId = null;
      this.activeEvents = null;
      this.pendingOutgoing = null;
      events?.onBusyOrRejected?.('Người kia đã từ chối cuộc gọi');
      events?.onEnded?.();
    } else if (data.code === 4) {
      // Ended
      console.log('[Stringee] SignalingState 4: Cuộc gọi đã kết thúc');
      this.finishActiveCall();
    }
  }

  /** INTERNAL: call eventHandlers.onChangeMediaState. */
  _handleMediaState(data: StringeeMediaStateEventData | undefined): void {
    if (!data || !this.trackCallId(data.callId)) return;
    // Media codes are mapped explicitly by both native modules:
    // 0 = Connected, 1 = Disconnected.
    if (data.code === 0) {
      this.activeEvents?.onConnected?.();
    } else if (data.code === 1) {
      this.finishActiveCall();
    }
  }

  /**
   * Route events only to the active call. The outgoing callId is unknown
   * until the makeCall callback / first event, so the first event's callId
   * is adopted; later events with a different callId are ignored.
   */
  private trackCallId(callId: string | undefined): boolean {
    if (!callId) return false;
    if (!this.activeCallId) {
      this.activeCallId = callId;
      return true;
    }
    return this.activeCallId === callId;
  }

  private finishActiveCall(): void {
    const events = this.activeEvents;
    this.activeCallId = null;
    this.activeEvents = null;
    this.pendingOutgoing = null;
    events?.onEnded?.();
  }
}

export const stringeeService = new StringeeService();
