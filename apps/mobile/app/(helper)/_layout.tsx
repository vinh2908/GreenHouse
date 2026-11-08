import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { CustomTabBar } from '@/components/common/custom-tab-bar';
import { useHelperLocationSync } from '@/hooks/use-helper-location-sync';
import { useTranslation } from '@/hooks/use-i18n';
import { useAuthStore } from '@/stores/auth.store';

export default function HelperLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuthStore();
  useHelperLocationSync();

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const hasHelperRole = Array.isArray(user.roles) && (user.roles as any[]).includes('helper');
      if (!hasHelperRole) {
        router.replace('/(customer)/home');
      }
    }
  }, [isLoading, isAuthenticated, user, router]);

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
          title: t('tab_overview'),
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: t('tab_helper_jobs'),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tab_messages'),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: t('tab_earnings'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tab_account'),
        }}
      />
    </Tabs>
  );
}
