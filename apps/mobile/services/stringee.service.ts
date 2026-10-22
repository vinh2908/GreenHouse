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
    this.activeEvents = params.events;
    this.pendingOutgoing = params;
    this.flushOutgoing();
    if (!this.pendingOutgoing) return true; // executed immediately
    // Buffered: meaningful only while a connect for this user is in flight.
    return this.connectedUserId === params.myUserId;
  }

  private flushOutgoing(): void {
    const pending = this.pendingOutgoing;
    if (!pending || !this.callRef || !this.clientReady) return;
    if (this.connectedUserId !== pending.myUserId) return;
    this.pendingOutgoing = null;
    // SDK contract: parameters is a JSON STRING { from, to, isVideoCall }.
    const parameters = JSON.stringify({
      from: pending.myUserId,
      to: pending.partnerId,
      isVideoCall: false,
    });
    try {
      this.callRef.makeCall(parameters, (status, code, message, callId) => {
        if (status) {
          // Outgoing callId arrives here (Android: when signaling reaches
          // CALLING; iOS: in the makeCall completion handler).
          if (callId) this.activeCallId = callId;
        } else {
          pending.events.onError?.(message || `Không tạo được cuộc gọi (mã ${code})`);
          if (this.activeEvents === pending.events) this.activeEvents = null;
        }
      });
    } catch (e) {
      pending.events.onError?.(e instanceof Error ? e.message : 'Không tạo được cuộc gọi');
    }
  }

  /**
   * Answer the pending incoming call: initAnswer(callId) first (verified in
   * both native modules: it attaches the call listener and starts ringing),
   * then answer(callId) once initAnswer reports success.
   */
  answerPending(events: StringeeCallEvents): boolean {
    const pending = this.pendingIncoming;
    if (!pending || !this.callRef) return false;
    this.pendingIncoming = null;
    this.activeEvents = events;
    this.activeCallId = pending.callId;
    const callId = pending.callId;
    try {
      this.callRef.initAnswer(callId, (status, code, message) => {
        if (!status) {
          events.onError?.(message || `Không trả lời được cuộc gọi (mã ${code})`);
          return;
        }
        try {
          this.callRef?.answer(callId, (s2, c2, m2) => {
            if (!s2) events.onError?.(m2 || `Không trả lời được cuộc gọi (mã ${c2})`);
          });
        } catch (e) {
          events.onError?.(e instanceof Error ? e.message : 'Không trả lời được cuộc gọi');
        }
      });
    } catch (e) {
      events.onError?.(e instanceof Error ? e.message : 'Không trả lời được cuộc gọi');
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
    if (ref) this.flushOutgoing();
  }

  /** INTERNAL: client eventHandlers.onConnect. */
  _handleClientConnect(): void {
    this.clientReady = true;
    this.flushOutgoing();
  }

  /** INTERNAL: client eventHandlers.onDisConnect. */
  _handleClientDisconnect(): void {
    // Keep connectedUserId so a later ensureConnected can reconnect if needed.
    this.clientReady = false;
  }

  /** INTERNAL: client eventHandlers.onFailWithError — data is { code, message }. */
  _handleClientError(data: StringeeErrorEventData | undefined): void {
    const message =
      data?.message ||
      (data?.code != null ? `Stringee error ${data.code}` : 'Lỗi kết nối Stringee');
    this.errorHandler?.(message);
    // If a call setup was waiting on this connection, surface it there too.
    const waiting = this.pendingOutgoing?.events ?? this.activeEvents;
    if (waiting) waiting.onError?.(message);
    this.pendingOutgoing = null;
  }

  /** INTERNAL: client eventHandlers.onRequestAccessToken. */
  _handleTokenRequest(): void {
    // TODO(token-refresh): fetch a fresh token via POST /calls/token or
    // /calls/sessions/:sessionId/join-token and call client.connect(newToken).
    // Left as a disconnect-safe no-op: the current token lasts 1h, which
    // covers a single call session; do NOT disconnect here.
  }

  /** INTERNAL: client eventHandlers.onIncomingCall — data carries callId + from. */
  _handleIncomingCall(data: StringeeIncomingCallEventData | undefined): void {
    if (!data?.callId) return;
    this.pendingIncoming = { callId: data.callId, from: data.from ?? '' };
    this.subscriber.onIncomingCall?.(this.pendingIncoming);
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
    } else if (data.code === 3 || data.code === 4) {
      // Busy / Ended are both terminal for this single-call UI.
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
