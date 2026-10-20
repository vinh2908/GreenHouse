import { Tabs } from 'expo-router';
import { CustomTabBar } from '@/components/common/custom-tab-bar';

export default function CustomerLayout() {
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
      {/* Ẩn route notifications khỏi tab bar */}
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
