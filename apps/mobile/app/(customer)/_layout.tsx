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
