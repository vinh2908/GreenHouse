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
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 10, left: 0, right: 0, alignItems: 'center' }}
    >
      <View
        style={{
          width: '90%',
          backgroundColor: '#fff',
          borderRadius: 8,
          paddingVertical: 12,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 5,
          elevation: 4,
          borderLeftWidth: 5,
          borderLeftColor: borderColor,
        }}
      >
        <View style={{ flex: 1, paddingRight: 10 }}>
          {text1 ? <Text style={{ fontWeight: '600', fontSize: 15, color: '#1f2937' }}>{text1}</Text> : null}
          {text2 ? <Text style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }} numberOfLines={2}>{text2}</Text> : null}
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
  return null;
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
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
          <Stack.Screen name="policy-insurance" options={{ headerShown: false }} />
          <Stack.Screen name="sos" options={{ headerShown: false }} />
          <Stack.Screen name="sos-tracking/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[jobId]" options={{ headerShown: false }} />
        </Stack>
        <Toast config={toastConfig} swipeable={false} />
        <ToastCard />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
