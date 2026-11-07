import { useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
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
  FileSignature,
  Ticket,
  Wallet as WalletIcon,
  PlusCircle,
} from 'lucide-react-native';
import { Alert } from '@/components/common/app-alert';
import { useAuthStore } from '@/stores/auth.store';
import { useMyProfile, useSwitchRole, useLoyaltyAccount, useWallet } from '@/hooks/use-api';
import { Avatar, Card, COLORS, Separator, LoadingSpinner, useThemeColors } from '@/components/ui';
import { useTranslation } from '@/hooks/use-i18n';
import { DisplaySettingsSection } from '@/components/common/display-settings';
import { AppPermissionsSection } from '@/components/common/initial-permissions-modal';
import { VerificationBanner } from '@/components/common/verification-banner';

const MENU_SECTIONS = [
  {
    titleKey: 'profile_section_account',
    items: [
      { icon: User, labelKey: 'profile_personal_info', route: '/edit-profile' },
      { icon: MapPin, labelKey: 'profile_saved_addresses', route: '/edit-profile' },
      { icon: CreditCard, labelKey: 'profile_payment_wallet', route: '/bank-account' },
      { icon: Bell, labelKey: 'profile_notification_settings', route: '/notification-settings' },
      { icon: Heart, labelKey: 'profile_favorite_helpers', route: '/favorites' },
      { icon: Ticket, labelKey: 'profile_my_vouchers', route: '/vouchers' },
      { icon: CalendarClock, labelKey: 'profile_recurring_plans', route: '/recurring-plans' },
      { icon: FileSignature, labelKey: 'profile_monthly_contracts', route: '/monthly-contracts' },
    ],
  },
  {
    titleKey: 'profile_section_support',
    items: [
      { icon: HelpCircle, labelKey: 'profile_support_online', route: '/support-chat' },
      { icon: HelpCircle, labelKey: 'profile_help_center', route: '/help-center' },
      { icon: Shield, labelKey: 'profile_privacy_insurance', route: '/policy-insurance' },
    ],
  },
];

export default function CustomerProfileScreen() {
  const router = useRouter();
  const { t, fs, lang, tLoyaltyTier } = useTranslation();
  const tc = useThemeColors();
  const queryClient = useQueryClient();
  const logout = useAuthStore(s => s.logout);
  const user = useAuthStore(s => s.user);
  const isAuthLoading = useAuthStore(s => s.isLoading);
  const isSwitchingRole = useAuthStore(s => s.isSwitchingRole);

  const { data: profile, isLoading: isProfileLoading, refetch: refetchProfile } = useMyProfile();
  const { data: wallet, isLoading: isWalletLoading, isError: isWalletError } = useWallet();
  const {
    data: loyalty,
    isLoading: isLoyaltyLoading,
    refetch: refetchLoyalty,
  } = useLoyaltyAccount();
  const switchRole = useSwitchRole();

  const displayUser = profile ?? user;
  const effectiveRole = user?.active_role ?? displayUser?.active_role;

  useEffect(() => {
    if (useAuthStore.getState().isAuthenticated) {
      refetchLoyalty();
    }
  }, [refetchLoyalty]);

  // Khi đang ở chế độ thợ và không trong quá trình đổi vai trò, chuyển ngay sang dashboard thợ
  useEffect(() => {
    if (!isAuthLoading && !isSwitchingRole && effectiveRole === 'helper') {
      router.replace('/(helper)/dashboard');
    }
  }, [isAuthLoading, isSwitchingRole, effectiveRole]);

  // B24 lớp 1: xác nhận xoá tài khoản → màn nhập mật khẩu (lớp 2)
  const handleDeleteAccount = () => {
    Alert.alert(t('delete_account_confirm_title'), t('delete_account_confirm_desc'), [
      { text: t('profile_logout_stay'), style: 'cancel' },
      {
        text: t('delete_account'),
        style: 'destructive',
        onPress: () => router.push('/delete-account' as never),
      },
    ]);
  };

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

    Alert.alert(t('profile_logout_confirm_title'), t('profile_logout_confirm_desc'), [
      { text: t('profile_logout_stay'), style: 'cancel' },
      {
        text: t('profile_logout_now'),
        style: 'destructive',
        onPress: doLogout,
      },
    ]);
  };

  const handleSwitchToHelper = async () => {
    if (useAuthStore.getState().isSwitchingRole) return;
    useAuthStore.getState().setSwitchingRole(true);

    // 1. Cập nhật ngay auth store và local storage
    useAuthStore.getState().switchRole('helper');

    // 2. Cập nhật lạc quan cache ['profile', 'me'] để tránh trả về active_role khách cũ
    queryClient.setQueryData(['profile', 'me'], (old: any) =>
      old ? { ...old, active_role: 'helper' } : old,
    );

    // 3. Chuyển hướng dứt khoát sang dashboard thợ
    router.replace('/(helper)/dashboard');

    // 4. Đồng bộ lên backend API
    try {
      await switchRole.mutateAsync('helper');
    } catch {
      /* fallback sang auth store */
    }
  };

  const insets = useSafeAreaInsets();

  if (isAuthLoading || (!isSwitchingRole && effectiveRole === 'helper')) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: tc.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <LoadingSpinner />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {/* P0-7: banner xác minh email khi tài khoản chưa xác minh */}
        <VerificationBanner />

        {/* ── Profile header (Safe Insets) ────────────────────────────── */}
        <View
          style={{
            backgroundColor: tc.surface,
            paddingHorizontal: 24,
            paddingTop: Math.max(insets.top + 8, 20),
            paddingBottom: 24,
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: tc.border,
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
                style={{
                  fontSize: fs(20),
                  fontWeight: '800',
                  color: tc.text,
                  marginTop: 12,
                }}
              >
                {displayUser?.full_name}
              </Text>
              <Text
                style={{
                  fontSize: fs(14),
                  color: tc.textMuted,
                  marginTop: 4,
                  fontWeight: '600',
                }}
              >
                {displayUser?.phone}
              </Text>
              <View
                style={{
                  backgroundColor: tc.subtle,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 8,
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
              <Avatar name={lang === 'en' ? 'Guest' : 'Khách'} size={80} />
              <Text
                style={{
                  fontSize: fs(20),
                  fontWeight: '800',
                  color: tc.text,
                  marginTop: 12,
                }}
              >
                {t('profile_guest_name')}
              </Text>
              <Text
                style={{
                  fontSize: fs(13),
                  color: tc.textMuted,
                  marginTop: 4,
                  fontWeight: '500',
                }}
              >
                {t('profile_not_logged_in')}
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/(auth)/login')}
                style={{
                  backgroundColor: COLORS.primary,
                  paddingHorizontal: 20,
                  paddingVertical: 8,
                  borderRadius: 14,
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
              borderRadius: 14,
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

        {/* ── Customer Wallet Card (F6) ────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/bank-account')}>
            <Card
              style={{
                gap: 8,
                backgroundColor: '#0F172A',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                padding: 18,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <WalletIcon size={18} color="#38BDF8" />
                  <Text style={{ fontWeight: '800', fontSize: fs(14.5), color: '#FFFFFF' }}>
                    {lang === 'en' ? 'GreenHouse Wallet' : 'Ví GreenHouse'}
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => router.push('/bank-account')}
                  style={{
                    backgroundColor: COLORS.primary,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <PlusCircle size={14} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(12) }}>
                    {lang === 'en' ? 'Top up' : 'Nạp tiền'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: fs(22), fontWeight: '900', color: '#FFFFFF' }}>
                {isWalletLoading && !wallet
                  ? '...'
                  : // P1-27: never render 0₫ as the balance when the fetch
                    // errored — a failed fetch is not a zero balance.
                    !wallet && isWalletError
                    ? lang === 'en'
                      ? 'Failed to load'
                      : 'Không tải được'
                    : `${new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(wallet?.balance ?? 0)}₫`}
              </Text>
              <Text style={{ fontSize: fs(12), color: '#94A3B8' }}>
                {lang === 'en'
                  ? 'Tap to manage payment methods and top up'
                  : 'Bấm để quản lý phương thức thanh toán và nạp tiền'}
              </Text>
            </Card>
          </TouchableOpacity>
        </View>

        {/* ── Loyalty points summary (Feature 12) ─────────────────────── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/loyalty' as never)}>
            <Card style={{ gap: 6, backgroundColor: '#FFFBEB' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Star size={20} color="#D97706" />
                <Text style={{ flex: 1, fontWeight: '800', fontSize: fs(15), color: '#92400E' }}>
                  {t('profile_loyalty_title', { tier: tLoyaltyTier(loyalty?.tier_label) })}
                </Text>
                <ChevronRight size={16} color="#92400E" />
              </View>
              <Text style={{ fontSize: fs(22), fontWeight: '800', color: tc.text }}>
                {isLoyaltyLoading && !loyalty ? (
                  <ActivityIndicator size="small" color="#D97706" />
                ) : (
                  t('profile_loyalty_points', {
                    points: new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(
                      loyalty?.points_balance ?? 0,
                    ),
                  })
                )}
              </Text>
              <Text style={{ fontSize: fs(12.5), color: tc.textSecondary }}>
                {t('profile_loyalty_redeem_desc', { cap: loyalty?.redemption_cap_percent ?? 20 })}
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
                  fontSize: fs(12),
                  fontWeight: '700',
                  color: tc.textMuted,
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
                        if (item.route) {
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
                          fontSize: fs(15),
                          color: tc.text,
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

          {/* ── App Permissions (Bug 10) ─────────────────────────────────── */}
          <AppPermissionsSection />

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

          {displayUser && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleDeleteAccount}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: 14,
              }}
            >
              <Text style={{ fontSize: fs(14), fontWeight: '700', color: COLORS.error }}>
                {t('delete_account')}
              </Text>
            </TouchableOpacity>
          )}

          <Text
            style={{
              textAlign: 'center',
              fontSize: fs(12),
              color: tc.textMuted,
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
