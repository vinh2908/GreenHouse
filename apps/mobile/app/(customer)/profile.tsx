import { View, Text, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  User,
  MapPin,
  LogOut,
  ChevronRight,
  Star,
  Shield,
  HelpCircle,
  Bell,
  Wrench,
  CreditCard,
  Heart,
  CalendarClock,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { Alert } from '@/components/common/app-alert';
import { useAuthStore } from '@/stores/auth.store';
import { useMyProfile, useSwitchRole } from '@/hooks/use-api';
import { Avatar, Card, COLORS, Separator } from '@/components/ui';

const MENU_SECTIONS = [
  {
    title: 'Tài khoản & Cá nhân',
    items: [
      { icon: User, label: 'Thông tin cá nhân', route: '/edit-profile' },
      { icon: MapPin, label: 'Địa chỉ đã lưu', route: '/edit-profile' },
      { icon: CreditCard, label: 'Phương thức thanh toán & Ví', route: '/bank-account' },
      { icon: Bell, label: 'Cài đặt thông báo', route: '/notifications' },
      { icon: Heart, label: 'Thợ yêu thích', route: '/favorites' },
      { icon: CalendarClock, label: 'Gói định kỳ của tôi', route: '/recurring-plans' },
      { icon: CalendarClock, label: 'Hợp đồng theo tháng', route: '/monthly-contracts' },
    ],
  },
  {
    title: 'Hỗ trợ & Pháp lý',
    items: [
      { icon: HelpCircle, label: 'Trung tâm trợ giúp Vua Thợ (24/7)', route: '/help-center' },
      { icon: Shield, label: 'Chính sách bảo mật & Bảo hiểm 30 ngày', route: '/policy-insurance' },
      { icon: Star, label: 'Đánh giá ứng dụng Green House', route: '__rate_app__' },
    ],
  },
];

export default function CustomerProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useAuthStore(s => s.logout);
  const user = useAuthStore(s => s.user);
  const { data: profile } = useMyProfile();
  const switchRole = useSwitchRole();

  const handleLogout = () => {
    const doLogout = async () => {
      try {
        await logout();
        queryClient.clear();
        router.replace('/(auth)/login');
      } catch {
        router.replace('/(auth)/login');
      }
    };

    Alert.alert(
      'Đăng xuất khỏi Green House?',
      'Bạn có chắc chắn muốn đăng xuất tài khoản? Lịch sử đặt việc và thông tin thanh toán của bạn luôn được bảo lưu an toàn.',
      [
        { text: 'Ở lại', style: 'cancel' },
        {
          text: 'Đăng xuất ngay',
          style: 'destructive',
          onPress: doLogout,
        },
      ],
    );
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

  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.gray[50] }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {/* ── Profile header (Safe Insets) ────────────────────────────── */}
        <View
          style={{
            backgroundColor: '#fff',
            paddingHorizontal: 24,
            paddingTop: Math.max(insets.top + 8, 20),
            paddingBottom: 24,
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: COLORS.gray[100],
          }}
        >
          {displayUser ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/edit-profile')}
              style={{ alignItems: 'center' }}
            >
              <Avatar name={displayUser?.full_name} uri={displayUser?.avatar} size={80} />
              <Text
                style={{ fontSize: 20, fontWeight: '800', color: COLORS.gray[900], marginTop: 12 }}
              >
                {displayUser?.full_name}
              </Text>
              <Text
                style={{ fontSize: 14, color: COLORS.gray[500], marginTop: 4, fontWeight: '600' }}
              >
                {displayUser?.phone}
              </Text>
              <View
                style={{
                  backgroundColor: COLORS.gray[100],
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 10,
                  marginTop: 6,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>
                  Chỉnh sửa hồ sơ ✏️
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Avatar name="Khách" size={80} />
              <Text
                style={{ fontSize: 20, fontWeight: '800', color: COLORS.gray[900], marginTop: 12 }}
              >
                Khách trải nghiệm
              </Text>
              <Text
                style={{ fontSize: 13, color: COLORS.gray[500], marginTop: 4, fontWeight: '500' }}
              >
                Chưa đăng nhập tài khoản
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/(auth)/login')}
                style={{
                  backgroundColor: COLORS.primary,
                  paddingHorizontal: 20,
                  paddingVertical: 8,
                  borderRadius: 20,
                  marginTop: 10,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                  Đăng nhập / Tạo tài khoản
                </Text>
              </TouchableOpacity>
            </View>
          )}

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
                      onPress={() => {
                        if (item.route === '__rate_app__') {
                          Toast.show({
                            type: 'success',
                            text1: 'Cảm ơn bạn đã ủng hộ Green House! ⭐',
                            text2:
                              'Đánh giá 5 sao của bạn giúp đội ngũ phát triển tốt hơn mỗi ngày.',
                          });
                        } else if (item.route) {
                          router.push(item.route as never);
                        }
                      }}
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

          {displayUser && (
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
              <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.error }}>
                Đăng xuất
              </Text>
            </TouchableOpacity>
          )}

          <Text
            style={{
              textAlign: 'center',
              fontSize: 12,
              color: COLORS.gray[400],
              fontWeight: '500',
            }}
          >
            Green House v1.0.0 • Dịch vụ gia đình chuyên nghiệp
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
