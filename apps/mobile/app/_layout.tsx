import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { TouchableOpacity, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { create } from 'zustand';
import * as SplashScreen from 'expo-splash-screen';
import '../global.css';
import { useSocketConnection, useNotificationSocket } from '@/hooks/use-socket';
import { AppAlertHost } from '@/components/common/app-alert';
import { useLiveGps } from '@/hooks/use-live-gps';
import { useOfflineSync } from '@/hooks/use-offline';
import { useIncomingCallListener } from '@/hooks/use-incoming-call';
import { useCallKeep } from '@/hooks/use-callkeep';
import { IncomingCallModal } from '@/components/common/incoming-call-modal';
import { StringeeHost } from '@/components/common/stringee-host';
import { useSosBackupListener } from '@/hooks/use-sos-backup';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { SosBackupPopup } from '@/components/common/sos-backup-popup';
import { SosCustomerDecisionPopup } from '@/components/common/sos-customer-decision-popup';
import { useBackgroundGps } from '@/hooks/use-background-gps';
import { useAuthStore } from '@/stores/auth.store';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60 * 1000,
    },
  },
});

// react-native-toast-message keeps the toast state, but its slide animation is not drawn on
// Android here: the card stays invisible while shown and frozen on screen (untouchable) once
// hidden. So the config only mirrors the state, and ToastCard renders it outside the library.
type ToastState = {
  isVisible: boolean;
  type: string;
  text1?: string;
  text2?: string;
  hide: () => void;
};

const useToastStore = create<{ toast: ToastState | null }>(() => ({ toast: null }));

const ToastBridge = ({ isVisible, type, text1, text2, hide }: ToastState) => {
  useEffect(() => {
    useToastStore.setState({ toast: { isVisible, type, text1, text2, hide } });
  }, [isVisible, type, text1, text2, hide]);
  return null;
};

const toastConfig = {
  success: (props: any) => <ToastBridge {...props} type="success" />,
  error: (props: any) => <ToastBridge {...props} type="error" />,
  info: (props: any) => <ToastBridge {...props} type="info" />,
};

function ToastCard() {
  const toast = useToastStore(s => s.toast);
  const insets = useSafeAreaInsets();
  if (!toast?.isVisible) return null;

  const { type, text1, text2, hide } = toast;
  const borderColor = type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#87CEFA';
  const icon = type === 'success' ? '🎉' : type === 'error' ? '⚠️' : '🔔';
  const iconBackground = type === 'success' ? '#DCFCE7' : type === 'error' ? '#FEF2F2' : '#EFF6FF';
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + 10,
        left: 0,
        right: 0,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: '90%',
          backgroundColor: '#fff',
          borderRadius: 18,
          paddingVertical: 14,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 5,
          elevation: 4,
          borderWidth: 1,
          borderColor: type === 'info' ? '#DBEAFE' : type === 'error' ? '#FECACA' : '#BBF7D0',
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 14,
            backgroundColor: iconBackground,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 11,
          }}
        >
          <Text style={{ fontSize: 20 }}>{icon}</Text>
        </View>
        <View style={{ flex: 1, paddingRight: 8 }}>
          {text1 ? (
            <Text style={{ fontWeight: '800', fontSize: 14.5, color: '#1f2937' }}>{text1}</Text>
          ) : null}
          {text2 ? (
            <Text
              style={{ fontSize: 12.5, color: '#4b5563', marginTop: 4, lineHeight: 18 }}
              numberOfLines={3}
            >
              {text2}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={hide}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          style={{ padding: 4 }}
        >
          <X size={20} color="#9ca3af" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SocketManager() {
  useSocketConnection();
  useNotificationSocket();
  useLiveGps();
  useBackgroundGps();
  useOfflineSync(); // Feature 16: vòng lặp flush hàng đợi offline
  useIncomingCallListener(); // Feature 6: lắng nghe cuộc gọi thoại đến
  useCallKeep(); // VoIP/CallKeep: cuộc gọi đến khi app chạy nền / bị đóng hẳn + đăng ký VoIP token
  useSosBackupListener(); // SOS Backup: popup quyết định cho khách + popup backup cho thợ
  usePushNotifications(); // OS push: đăng ký Expo token + chạm push → deep-link đúng màn hình
  return null;
}

export default function RootLayout() {
  useEffect(() => {
    // Deep links/reloads can skip app/index.tsx. Restore auth here so job tracking
    // reconnects to Socket.IO even when opened directly from a notification.
    void useAuthStore
      .getState()
      .loadStoredAuth()
      .finally(() => SplashScreen.hideAsync());
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SocketManager />
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(customer)" options={{ headerShown: false }} />
          <Stack.Screen name="(helper)" options={{ headerShown: false }} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
          <Stack.Screen name="job-detail/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="helper-job-detail/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="helper-profile/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="kyc" options={{ headerShown: false }} />
          <Stack.Screen name="bank-account" options={{ headerShown: false }} />
          <Stack.Screen name="help-center" options={{ headerShown: false }} />
          <Stack.Screen name="support-chat" options={{ headerShown: false }} />
          <Stack.Screen name="policy-insurance" options={{ headerShown: false }} />
          <Stack.Screen name="sos" options={{ headerShown: false }} />
          <Stack.Screen name="sos-tracking/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[jobId]" options={{ headerShown: false }} />
        </Stack>
        <Toast config={toastConfig} swipeable={false} />
        <ToastCard />
        <AppAlertHost />
        <IncomingCallModal />
        <StringeeHost />
        <SosBackupPopup />
        <SosCustomerDecisionPopup />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
