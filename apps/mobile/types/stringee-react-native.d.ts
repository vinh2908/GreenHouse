/**
 * Minimal type surface for `stringee-react-native` @ 1.5.8.
 *
 * Surface modeled on stringee-react-native@1.5.8 docs — MUST be re-verified
 * against the installed SDK's README at integration time. The legacy 1.5.x
 * SDK line may use slightly different method/listener names on native side;
 * only `services/stringee.service.ts` imports the package, so verification
 * fixes are contained to that adapter + this declaration file.
 *
 * This file lives under apps/mobile/types/ so it is inside the tsconfig
 * `include: ["**\/*.ts", "**\/*.tsx", ...]` compilation.
 */
declare module 'stringee-react-native' {
  export interface StringeeClientListener {
    onConnect?: (client: StringeeClient) => void;
    onDisconnect?: (client: StringeeClient) => void;
    onFailWithError?: (client: StringeeClient, code: number, message: string) => void;
    onRequestAccessToken?: (client: StringeeClient) => void;
    onIncomingCall?: (client: StringeeClient, call: StringeeCall) => void;
  }

  export interface StringeeCallListener {
    onChangeSignalingState?: (
      call: StringeeCall,
      code: number,
      reason: string,
      sipCode: number,
      sipReason: string,
    ) => void;
    onChangeMediaState?: (call: StringeeCall, code: number, description: string) => void;
    onReceiveLocalStream?: (call: StringeeCall) => void;
    onReceiveRemoteStream?: (call: StringeeCall) => void;
  }

  export class StringeeClient {
    constructor();
    connect(token: string): void;
    disconnect(): void;
    setListener(listener: StringeeClientListener): void;
  }

  export class StringeeCall {
    constructor(client: StringeeClient, from: string, to: string, isVideoCall: boolean);
    callId: string;
    from: string;
    to: string;
    setCallListener(listener: StringeeCallListener): void;
    makeCall(callback?: (status: boolean, code: number, message: string) => void): void;
    answer(callback?: (status: boolean, code: number, message: string) => void): void;
    reject(callback?: (status: boolean, code: number, message: string) => void): void;
    hangup(callback?: (status: boolean, code: number, message: string) => void): void;
    setMute(muted: boolean): void;
    setSpeakerphoneOn(on: boolean): void;
  }
}
