import { Stack } from 'expo-router';
import React, { Component, useEffect, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { TouchableOpacity, View, Text, ScrollView } from 'react-native';
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

console.warn('[Startup] 0. _layout.tsx module evaluating...');

// Do not hold native splash synchronously — let React draw the animated Splash directly
SplashScreen.hideAsync().catch(() => {});

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[Startup] CRITICAL RootErrorBoundary caught render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{ flex: 1, backgroundColor: '#FEF2F2', padding: 24, justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#991B1B', marginBottom: 12 }}>
            Lỗi hiển thị màn hình (Root Error)
          </Text>
          <Text style={{ fontSize: 14, color: '#B91C1C', marginBottom: 16 }}>
            {this.state.error?.message || 'Lỗi không xác định'}
          </Text>
          <ScrollView
            style={{ maxHeight: 250, backgroundColor: '#FFF', padding: 10, borderRadius: 8 }}
          >
            <Text style={{ fontSize: 11, color: '#374151', fontFamily: 'monospace' }}>
              {this.state.error?.stack}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

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

function AuthenticatedServices() {
  console.warn('[Startup] 2a. AuthenticatedServices mounting hooks...');
  useSocketConnection();
  useNotificationSocket();
  useLiveGps();
  useBackgroundGps();
  useIncomingCallListener(); // Feature 6: lắng nghe cuộc gọi thoại đến
  useCallKeep(); // VoIP/CallKeep: chỉ kích hoạt sau đăng nhập, an toàn với cold start
  useSosBackupListener(); // SOS Backup: popup quyết định cho khách + popup backup cho thợ
  usePushNotifications(); // OS push: đăng ký Expo token + chạm push → deep-link đúng màn hình
  console.warn('[Startup] 2b. AuthenticatedServices hooks mounted cleanly');
  return null;
}

function SocketManager() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  useOfflineSync(); // Vòng lặp flush hàng đợi offline an toàn khi chưa đăng nhập
  if (!isAuthenticated) return null;
  return <AuthenticatedServices />;
}

export default function RootLayout() {
  console.warn('[Startup] 1. RootLayout render start');

  useEffect(() => {
    console.warn('[Startup] 3. RootLayout useEffect mounted');
    let hidden = false;
    const hideSplash = (source: string) => {
      if (hidden) return;
      hidden = true;
      console.warn(`[Startup] Hiding SplashScreen (source: ${source})`);
      SplashScreen.hideAsync().catch(err => {
        console.warn('[Startup] SplashScreen.hideAsync warning:', err);
      });
    };

    // Hard fallback timeout: always hide splash after 3 seconds regardless of auth
    const hardTimeout = setTimeout(() => {
      hideSplash('hard-timeout-3s');
    }, 3000);

    console.warn('[Startup] 4. Triggering loadStoredAuth()...');
    useAuthStore
      .getState()
      .loadStoredAuth()
      .then(() => {
        console.warn('[Startup] 4b. loadStoredAuth() finished, state:', {
          isAuthenticated: useAuthStore.getState().isAuthenticated,
          userId: useAuthStore.getState().user?._id,
        });
      })
      .catch(err => {
        console.error('[Startup] 4b. loadStoredAuth() error:', err);
      })
      .finally(() => {
        clearTimeout(hardTimeout);
        hideSplash('auth-restored');
      });

    return () => {
      clearTimeout(hardTimeout);
    };
  }, []);

  return (
    <RootErrorBoundary>
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
            <Stack.Screen name="notification-settings" options={{ headerShown: false }} />
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
    </RootErrorBoundary>
  );
}
