import { Tabs, Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { LoadingSpinner } from '@/components/ui';
import { CustomTabBar } from '@/components/common/custom-tab-bar';
import { useHelperLocationSync } from '@/hooks/use-helper-location-sync';

export default function HelperLayout() {
  useHelperLocationSync();
  const authenticated = useAuthStore(s => s.isAuthenticated);
  const loading = useAuthStore(s => s.isLoading);
  if (loading) return <LoadingSpinner />;
  if (!authenticated) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} mode="helper" />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Tổng quan',
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Nhận việc',
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Thu nhập',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Tài khoản',
        }}
      />
    </Tabs>
  );
}
