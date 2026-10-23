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
import { useMyProfile, useSwitchRole, useLoyaltyAccount } from '@/hooks/use-api';
import { Avatar, Card, COLORS, Separator } from '@/components/ui';
import { useTranslation } from '@/hooks/use-i18n';
import { DisplaySettingsSection } from '@/components/common/display-settings';

const MENU_SECTIONS = [
  {
    titleKey: 'profile_section_account',
    items: [
      { icon: User, labelKey: 'profile_personal_info', route: '/edit-profile' },
      { icon: MapPin, labelKey: 'profile_saved_addresses', route: '/edit-profile' },
      { icon: CreditCard, labelKey: 'profile_payment_wallet', route: '/bank-account' },
      { icon: Bell, labelKey: 'profile_notification_settings', route: '/notifications' },
      { icon: Heart, labelKey: 'profile_favorite_helpers', route: '/favorites' },
      { icon: CalendarClock, labelKey: 'profile_recurring_plans', route: '/recurring-plans' },
      { icon: CalendarClock, labelKey: 'profile_monthly_contracts', route: '/monthly-contracts' },
    ],
  },
  {
    titleKey: 'profile_section_support',
    items: [
      { icon: HelpCircle, labelKey: 'profile_support_online', route: '/support-chat' },
      { icon: HelpCircle, labelKey: 'profile_help_center', route: '/help-center' },
      { icon: Shield, labelKey: 'profile_privacy_insurance', route: '/policy-insurance' },
      { icon: Star, labelKey: 'profile_rate_app', route: '__rate_app__' },
    ],
  },
];

export default function CustomerProfileScreen() {
  const router = useRouter();
  const { t, fs } = useTranslation();
  const queryClient = useQueryClient();
  const logout = useAuthStore(s => s.logout);
  const user = useAuthStore(s => s.user);
  const { data: profile } = useMyProfile();
  const { data: loyalty, isLoading: isLoyaltyLoading } = useLoyaltyAccount();
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
                <Text style={{ fontSize: fs(12), fontWeight: '700', color: COLORS.primary }}>
                  {t('profile_edit')}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Avatar name="Khách" size={80} />
              <Text
                style={{ fontSize: fs(20), fontWeight: '800', color: COLORS.gray[900], marginTop: 12 }}
              >
                {t('profile_guest_name')}
              </Text>
              <Text
                style={{ fontSize: fs(13), color: COLORS.gray[500], marginTop: 4, fontWeight: '500' }}
              >
                {t('profile_not_logged_in')}
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
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: fs(13) }}>
                  {t('profile_login')}
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
            <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: fs(14) }}>
              {t('profile_switch_helper')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Loyalty points summary (Feature 12) ─────────────────────── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/loyalty' as never)}>
            <Card style={{ gap: 6, backgroundColor: '#FFFBEB' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Star size={20} color="#D97706" />
                <Text style={{ flex: 1, fontWeight: '800', fontSize: fs(15), color: '#92400E' }}>
                  {t('profile_loyalty_title', { tier: loyalty?.tier_label ?? 'Thường' })}
                </Text>
                <ChevronRight size={16} color="#92400E" />
              </View>
              {isLoyaltyLoading || !loyalty ? (
                <View
                  style={{
                    width: 140,
                    height: 28,
                    borderRadius: 8,
                    backgroundColor: '#FDE68A',
                    marginVertical: 4,
                  }}
                />
              ) : (
                <Text style={{ fontSize: fs(22), fontWeight: '800', color: COLORS.gray[900] }}>
                  {t('profile_loyalty_points', {
                    points: new Intl.NumberFormat('vi-VN').format(loyalty.points_balance ?? 0),
                  })}
                </Text>
              )}
              <Text style={{ fontSize: 12.5, color: COLORS.gray[600] }}>
                Đổi điểm giảm tối đa {loyalty?.redemption_cap_percent ?? 20}% giá trị đơn · Xem lịch
                sử & quyền lợi →
              </Text>
            </Card>
          </TouchableOpacity>
        </View>

        {/* ── Menu Sections ──────────────────────────────────────────── */}
        <View style={{ padding: 16, gap: 16 }}>
          {MENU_SECTIONS.map(section => (
            <View key={section.titleKey}>
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
                {t(section.titleKey)}
              </Text>
              <Card style={{ gap: 0 }}>
                {section.items.map((item, i) => (
                  <View key={item.labelKey}>
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
                        {t(item.labelKey)}
                      </Text>
                      <ChevronRight size={16} color={COLORS.gray[400]} />
                    </TouchableOpacity>
                  </View>
                ))}
              </Card>
            </View>
          ))}

          {/* ── Display settings (Feature 20) ─────────────────────────── */}
          <DisplaySettingsSection />

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
              <Text style={{ fontSize: fs(15), fontWeight: '700', color: COLORS.error }}>
                {t('profile_logout')}
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
            {t('profile_app_version_customer')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
