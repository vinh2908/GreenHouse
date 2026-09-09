import { View, Text, ScrollView, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  User,
  MapPin,
  Settings,
  LogOut,
  ChevronRight,
  Star,
  Shield,
  HelpCircle,
  Bell,
  Wrench,
  CreditCard,
} from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { useMyProfile, useSwitchRole } from '@/hooks/use-api';
import { Avatar, Card, COLORS, Separator } from '@/components/ui';

const MENU_SECTIONS = [
  {
    title: 'Tài khoản & Cá nhân',
    items: [
      { icon: User, label: 'Thông tin cá nhân', route: null },
      { icon: MapPin, label: 'Địa chỉ đã lưu', route: null },
      { icon: CreditCard, label: 'Phương thức thanh toán', route: null },
      { icon: Bell, label: 'Cài đặt thông báo', route: '/(customer)/notifications' },
    ],
  },
  {
    title: 'Hỗ trợ & Pháp lý',
    items: [
      { icon: HelpCircle, label: 'Trung tâm trợ giúp Vua Thợ', route: null },
      { icon: Shield, label: 'Chính sách bảo mật & Bảo hiểm', route: null },
      { icon: Star, label: 'Đánh giá ứng dụng', route: null },
    ],
  },
];

export default function CustomerProfileScreen() {
  const router = useRouter();
  const logout = useAuthStore(s => s.logout);
  const user = useAuthStore(s => s.user);
  const { data: profile } = useMyProfile();
  const switchRole = useSwitchRole();

  const handleLogout = () => {
    Alert.alert('Đăng xuất?', 'Bạn có chắc muốn đăng xuất không?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const displayUser = profile ?? user;

  const handleSwitchToHelper = async () => {
    try {
      await switchRole.mutateAsync('helper');
      useAuthStore.getState().switchRole('helper');
      router.replace('/(helper)/dashboard');
    } catch {
      useAuthStore.getState().switchRole('helper');
      router.replace('/(helper)/dashboard');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.gray[50] }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {/* ── Profile header ─────────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: '#fff',
            padding: 24,
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: COLORS.gray[100],
          }}
        >
          <Avatar name={displayUser?.full_name} uri={displayUser?.avatar} size={80} />
          <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.gray[900], marginTop: 12 }}>
            {displayUser?.full_name}
          </Text>
          <Text style={{ fontSize: 14, color: COLORS.gray[500], marginTop: 4, fontWeight: '600' }}>
            {displayUser?.phone}
          </Text>

          {/* Switch to helper role button */}
          <TouchableOpacity
            onPress={handleSwitchToHelper}
            activeOpacity={0.85}
            style={{
              marginTop: 16,
              backgroundColor: COLORS.primaryLight,
              borderRadius: 20,
              paddingHorizontal: 20,
              paddingVertical: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderWidth: 1.5,
              borderColor: '#FFD9C5',
            }}
          >
            <Wrench size={18} color={COLORS.primary} />
            <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: 14 }}>
              Chuyển sang chế độ Nhận việc / Thợ →
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Menu Sections ──────────────────────────────────────────── */}
        <View style={{ padding: 16, gap: 16 }}>
          {MENU_SECTIONS.map(section => (
            <View key={section.title}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: COLORS.gray[400],
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {section.title}
              </Text>
              <Card style={{ gap: 0 }}>
                {section.items.map((item, i) => (
                  <View key={item.label}>
                    {i > 0 && <Separator my={0} />}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => (item.route ? router.push(item.route as never) : null)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 14,
                        paddingVertical: 14,
                      }}
                    >
                      <item.icon size={20} color={COLORS.gray[600]} />
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 15,
                          color: COLORS.gray[900],
                          fontWeight: '600',
                        }}
                      >
                        {item.label}
                      </Text>
                      <ChevronRight size={16} color={COLORS.gray[400]} />
                    </TouchableOpacity>
                  </View>
                ))}
              </Card>
            </View>
          ))}

          {/* Logout */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleLogout}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 14,
              borderWidth: 1.5,
              borderColor: '#FFE4E1',
              borderRadius: 14,
              backgroundColor: '#FFF5F5',
            }}
          >
            <LogOut size={18} color={COLORS.error} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.error }}>Đăng xuất</Text>
          </TouchableOpacity>

          <Text
            style={{
              textAlign: 'center',
              fontSize: 12,
              color: COLORS.gray[400],
              fontWeight: '500',
            }}
          >
            HomeMate v1.0.0 • Chuẩn giao diện Vua Thợ
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
