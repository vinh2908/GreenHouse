import { Tabs, useRouter, usePathname } from 'expo-router';
import { CustomTabBar } from '@/components/common/custom-tab-bar';
import { useAuthStore } from '@/stores/auth.store';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { COLORS } from '@/components/ui';

export default function CustomerLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore(s => s.user);
  const isAuthLoading = useAuthStore(s => s.isLoading);
  const isSwitchingRole = useAuthStore(s => s.isSwitchingRole);

  const isHelper = user?.active_role === 'helper';

  useEffect(() => {
    if (!isAuthLoading && !isSwitchingRole && isHelper) {
      if (pathname.includes('profile')) {
        router.replace('/(helper)/profile');
      } else if (pathname.includes('jobs')) {
        router.replace('/(helper)/jobs');
      } else if (pathname.includes('messages')) {
        router.replace('/(helper)/messages');
      } else {
        router.replace('/(helper)/dashboard');
      }
    }
  }, [isAuthLoading, isSwitchingRole, isHelper, pathname, router]);

  if (isAuthLoading || (!isSwitchingRole && isHelper)) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.gray[50],
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color="#16A34A" />
      </View>
    );
  }

  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} mode="customer" />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Trang chủ',
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Hoạt động',
        }}
      />
      <Tabs.Screen
        name="booking"
        options={{
          title: 'Đăng việc',
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Tin nhắn',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Tài khoản',
        }}
      />
      {/* Ẩn route favorites khỏi tab bar — Thợ yêu thích mở từ màn Tài khoản */}
      <Tabs.Screen
        name="favorites"
        options={{
          href: null,
        }}
      />
      {/* Ẩn route vouchers khỏi tab bar — Ưu đãi mở từ màn Tài khoản */}
      <Tabs.Screen
        name="vouchers"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
