import { Tabs, useRouter, usePathname } from 'expo-router';
import { CustomTabBar } from '@/components/common/custom-tab-bar';
import { useAuthStore } from '@/stores/auth.store';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useTranslation } from '@/hooks/use-i18n';
import { COLORS, Skeleton } from '@/components/ui';

export default function CustomerLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
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
    // B28: skeleton giữ khung (header + tab + nội dung) thay spinner trắng
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.gray[50] }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, backgroundColor: '#fff' }}>
          <Skeleton width={140} height={24} />
          <Skeleton width={200} height={14} style={{ marginTop: 6 }} />
        </View>
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 10, backgroundColor: '#fff' }}>
          {[80, 100, 90, 80].map((w, i) => (
            <Skeleton key={i} width={w} height={32} radius={14} />
          ))}
        </View>
        <View style={{ padding: 16, gap: 12 }}>
          {[1, 2, 3].map(i => (
            <Skeleton key={i} width="100%" height={110} radius={14} />
          ))}
        </View>
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
          title: t('tab_home'),
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: t('tab_activity'),
        }}
      />
      <Tabs.Screen
        name="booking"
        options={{
          title: t('tab_booking'),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tab_messages'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tab_account'),
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
