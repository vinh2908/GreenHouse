// components/common/stringee-host.tsx
// Mounts the Stringee SDK components exactly once (in app/_layout.tsx).
//
// In stringee-react-native@1.5.8, StringeeClient and StringeeCall are React
// COMPONENTS — they cannot be instantiated imperatively. This host renders:
//   1. <StringeeClient> (always, once the SDK is available) and registers its
//      ref with stringeeService so the service can call connect()/disconnect().
//   2. <StringeeCall> as soon as the client ref exists and its getId() (the
//      client uuid from the component constructor) is known — the call
//      component needs it as its `clientId` prop.
//
// Both components receive STABLE eventHandlers objects (module constants):
// the SDK registers props.eventHandlers once in componentDidMount, so the
// handlers must never change identity. They only dispatch into the
// stringeeService singleton (internal _handle* / _register* methods).
//
// When the SDK is unavailable (web / Expo Go / native module not linked) the
// host renders null and the app behaves exactly as before.
import { useCallback, useState } from 'react';
import type { StringeeCallEventHandlers, StringeeClientEventHandlers } from 'stringee-react-native';
import { stringeeService } from '@/services/stringee.service';
import { useAuthStore } from '@/stores/auth.store';

type SdkModule = typeof import('stringee-react-native');
type StringeeClientInstance = InstanceType<SdkModule['StringeeClient']>;
type StringeeCallInstance = InstanceType<SdkModule['StringeeCall']>;

const clientEventHandlers: StringeeClientEventHandlers = {
  onConnect: () => stringeeService._handleClientConnect(),
  onDisConnect: () => stringeeService._handleClientDisconnect(),
  onFailWithError: data => stringeeService._handleClientError(data),
  onRequestAccessToken: () => stringeeService._handleTokenRequest(),
  onIncomingCall: data => stringeeService._handleIncomingCall(data),
  onIncomingCall2: data => stringeeService._handleIncomingCall(data),
};

const callEventHandlers: StringeeCallEventHandlers = {
  onChangeSignalingState: data => stringeeService._handleSignalingState(data),
  onChangeMediaState: data => stringeeService._handleMediaState(data),
  onReceiveLocalStream: () => undefined,
  onReceiveRemoteStream: () => undefined,
};

export function StringeeHost() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  // clientId = StringeeClient.getId(); known synchronously once the client
  // component instance exists (its constructor generates the uuid).
  const [clientId, setClientId] = useState<string | null>(null);

  const handleClientRef = useCallback((instance: StringeeClientInstance | null) => {
    stringeeService._registerClient(instance);
    const id = instance?.getId() ?? null;
    setClientId(prev => (prev === id ? prev : id));
  }, []);

  const handleCallRef = useCallback((instance: StringeeCallInstance | null) => {
    stringeeService._registerCall(instance);
  }, []);

  if (!isAuthenticated) return null;

  const sdk = stringeeService.loadSdk();
  if (!sdk) return null;

  const { StringeeClient, StringeeCall } = sdk;
  return (
    <>
      <StringeeClient ref={handleClientRef} eventHandlers={clientEventHandlers} />
      {clientId ? (
        <StringeeCall ref={handleCallRef} clientId={clientId} eventHandlers={callEventHandlers} />
      ) : null}
    </>
  );
}
