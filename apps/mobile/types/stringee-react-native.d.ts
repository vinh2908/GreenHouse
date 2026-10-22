/**
 * Type surface for `stringee-react-native` @ 1.5.8 — VERIFIED against the
 * published package sources (src/StringeeClient.js, src/StringeeCall.js,
 * src/helpers/StringeeHelper.js, android RNStringeeClientModule.java /
 * RNStringeeCallModule.java, ios RNClientWrapper.m / RNStringeeCall.m).
 *
 * The 1.5.8 SDK is COMPONENT-based: `StringeeClient` and `StringeeCall` are
 * React components (named exports re-exporting default-exported classes).
 * They are rendered with an `eventHandlers` prop and driven imperatively
 * through refs. There are NO setListener/setCallListener methods anywhere,
 * and there is no per-call object to construct — every call operation takes
 * a `callId` string.
 *
 * Event handlers receive ONE data object argument: the SDK's JS wrapper
 * unwraps the native `{ uuid, data }` envelope (after checking the uuid
 * matches the component instance) and passes the inner `data` object.
 * Call events are NOT wrapped: handlers receive the event body directly.
 *
 * Only `services/stringee.service.ts` requires the package and
 * `components/common/stringee-host.tsx` renders these components.
 *
 * This file lives under apps/mobile/types/ so it is inside the tsconfig
 * `include: ["**\/*.ts", "**\/*.tsx", ...]` compilation.
 */
declare module 'stringee-react-native' {
  import { Component } from 'react';

  /** Native bridge callback shape: (status, code, message). */
  export type StringeeSdkCallback = (status: boolean, code: number, message: string) => void;

  /**
   * makeCall callback: on success the native modules append the new callId
   * (Android: invoked when signaling reaches CALLING; iOS: from the makeCall
   * completion handler). Signature: (status, code, message, callId, customData).
   */
  export type StringeeMakeCallCallback = (
    status: boolean,
    code: number,
    message: string,
    callId?: string,
    customDataFromYourServer?: string,
  ) => void;

  // ─── Client event payloads (inner `data` of the native envelope) ──────────

  /** onConnect / onDisConnect data (android + ios verified). */
  export interface StringeeConnectEventData {
    userId?: string;
    projectId?: number;
    isReconnecting?: boolean;
  }

  /** onFailWithError data: { userId, code, message } (ios) / { code, message } (android). */
  export interface StringeeErrorEventData {
    userId?: string;
    code?: number;
    message?: string;
  }

  /** onIncomingCall data (android + ios verified, same keys). */
  export interface StringeeIncomingCallEventData {
    userId?: string;
    callId: string;
    from: string;
    to: string;
    fromAlias?: string;
    toAlias?: string;
    callType?: number;
    isVideoCall?: boolean;
    customDataFromYourServer?: string;
    /** iOS only. */
    serial?: number;
  }

  export interface StringeeCustomMessageEventData {
    from?: string;
    data?: string;
  }

  /**
   * Client event handler keys — exact names from src/helpers/StringeeHelper.js
   * (note `onDisConnect` with a capital C; `onDisconnect` does NOT exist).
   */
  export interface StringeeClientEventHandlers {
    onConnect?: (data: StringeeConnectEventData) => void;
    onDisConnect?: (data: StringeeConnectEventData) => void;
    onFailWithError?: (data: StringeeErrorEventData) => void;
    onRequestAccessToken?: (data: unknown) => void;
    onIncomingCall?: (data: StringeeIncomingCallEventData) => void;
    onIncomingCall2?: (data: StringeeIncomingCallEventData) => void;
    onCustomMessage?: (data: StringeeCustomMessageEventData) => void;
  }

  // ─── Call event payloads (event body, no envelope) ────────────────────────

  /**
   * onChangeSignalingState data: { callId, code, reason, sipCode, sipReason }
   * (iOS adds `serial`). `code` is the Stringee SignalingState value:
   * 0 = Calling, 1 = Ringing, 2 = Answered, 3 = Busy, 4 = Ended.
   */
  export interface StringeeSignalingStateEventData {
    callId: string;
    code: number;
    reason?: string;
    sipCode?: number;
    sipReason?: string;
    serial?: number;
  }

  /**
   * onChangeMediaState data: { callId, code, description } (Android adds
   * `eventType: "StringeeCall"`). The native modules map MediaState
   * explicitly: 0 = Connected ("Connected"), 1 = Disconnected ("Disconnected").
   */
  export interface StringeeMediaStateEventData {
    callId: string;
    code: number;
    description?: string;
    eventType?: string;
  }

  /** onReceiveLocalStream / onReceiveRemoteStream data: { callId }. */
  export interface StringeeStreamEventData {
    callId: string;
  }

  /** onReceiveCallInfo data: { callId, data }. */
  export interface StringeeCallInfoEventData {
    callId: string;
    data?: string;
  }

  /** onHandleOnAnotherDevice data: { callId, code, description }. */
  export interface StringeeHandledOnAnotherDeviceEventData {
    callId: string;
    code: number;
    description?: string;
  }

  /** Call event handler keys — exact names from src/helpers/StringeeHelper.js. */
  export interface StringeeCallEventHandlers {
    onChangeSignalingState?: (data: StringeeSignalingStateEventData) => void;
    onChangeMediaState?: (data: StringeeMediaStateEventData) => void;
    onReceiveLocalStream?: (data: StringeeStreamEventData) => void;
    onReceiveRemoteStream?: (data: StringeeStreamEventData) => void;
    onReceiveCallInfo?: (data: StringeeCallInfoEventData) => void;
    onHandleOnAnotherDevice?: (data: StringeeHandledOnAnotherDeviceEventData) => void;
  }

  // ─── Components ───────────────────────────────────────────────────────────

  export interface StringeeClientProps {
    eventHandlers?: StringeeClientEventHandlers;
    baseUrl?: string;
    serverAddresses?: string[];
    stringeeXBaseUrl?: string;
  }

  export interface StringeeCallProps {
    eventHandlers?: StringeeCallEventHandlers;
    /** Must be the StringeeClient instance's getId() (its uuid). */
    clientId?: string;
  }

  export class StringeeClient extends Component<StringeeClientProps> {
    /** Client uuid generated in the component constructor; used as StringeeCall's clientId. */
    getId(): string;
    connect(token: string): void;
    disconnect(): void;
  }

  export class StringeeCall extends Component<StringeeCallProps> {
    /**
     * Start an outgoing call. `parameters` is a JSON STRING:
     * {"from":"<userId>","to":"<userId>","isVideoCall":false}.
     */
    makeCall(parameters: string, callback: StringeeMakeCallCallback): void;
    /** Attach the call listener + start ringing for an incoming callId; call before answer(). */
    initAnswer(callId: string, callback: StringeeSdkCallback): void;
    answer(callId: string, callback: StringeeSdkCallback): void;
    reject(callId: string, callback: StringeeSdkCallback): void;
    hangup(callId: string, callback: StringeeSdkCallback): void;
    /** NOTE: the method is `mute`, there is no `setMute` in this SDK. */
    mute(callId: string, muted: boolean, callback: StringeeSdkCallback): void;
    setSpeakerphoneOn(callId: string, on: boolean, callback: StringeeSdkCallback): void;
  }
}
