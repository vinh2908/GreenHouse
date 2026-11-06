import { View, Text, ScrollView, TouchableOpacity, Switch, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  LogOut,
  ChevronRight,
  Star,
  CreditCard,
  FileText,
  Home,
  HelpCircle,
  Shield,
  Bell,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { Alert } from '@/components/common/app-alert';
import { useAuthStore } from '@/stores/auth.store';
import {
  useHelperProfile,
  useHelperJobs,
  useMyProfile,
  useSetHelperStatus,
  useSwitchRole,
  useUpdateHelperLocation,
} from '@/hooks/use-api';
import { locationService } from '@/services/location.service';
import { Avatar, Card, COLORS, Separator } from '@/components/ui';
import { useTranslation } from '@/hooks/use-i18n';
import { DisplaySettingsSection } from '@/components/common/display-settings';
import { AppPermissionsSection } from '@/components/common/initial-permissions-modal';
import { useState, useEffect, useRef } from 'react';

export default function HelperProfileScreen() {
  const router = useRouter();
  const storedUser = useAuthStore(s => s.user);
  const isAuthLoading = useAuthStore(s => s.isLoading);
  const isSwitchingRole = useAuthStore(s => s.isSwitchingRole);

  // Chuyển hướng an toàn nếu đang ở vai trò khách và không trong quá trình chuyển vai trò
  useEffect(() => {
    if (!isAuthLoading && !isSwitchingRole && storedUser?.active_role === 'customer') {
      router.replace('/(customer)/home');
    }
  }, [isAuthLoading, isSwitchingRole, storedUser?.active_role]);

  const { t, fs } = useTranslation();
  const queryClient = useQueryClient();
  const logout = useAuthStore(s => s.logout);
  const { data: myProfile } = useMyProfile();
  const user = myProfile ?? storedUser;
  const { data: profile, isLoading: pLoading } = useHelperProfile();
  const { data: activeJobs } = useHelperJobs(
    'confirmed,helper_on_the_way,helper_arrived,in_progress',
  );
  const setStatus = useSetHelperStatus();
  const updateLocation = useUpdateHelperLocation();
  const switchRole = useSwitchRole();

  const isWorking =
    profile?.status === 'busy' ||
    Boolean(activeJobs && Array.isArray(activeJobs) && activeJobs.length > 0);
  const isOnline = profile?.status === 'online' || isWorking;

  // State cục bộ để nút Switch và nhãn trạng thái nhảy tức thì 0ms trên app native
  const [localOnline, setLocalOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (profile?.status) {
      setLocalOnline(profile.status === 'online');
    }
  }, [profile?.status]);

  const effectiveOnline = isWorking ? true : (localOnline ?? isOnline);

  const handleSwitchToCustomer = async () => {
    if (useAuthStore.getState().isSwitchingRole) return;
    useAuthStore.getState().setSwitchingRole(true);

    // 1. Cập nhật ngay auth store và local storage
    useAuthStore.getState().switchRole('customer');

    // 2. Cập nhật lạc quan cache ['profile', 'me'] để tránh trả về active_role thợ cũ
    queryClient.setQueryData(['profile', 'me'], (old: any) =>
      old ? { ...old, active_role: 'customer' } : old,
    );

    // 3. Chuyển hướng dứt khoát sang trang chủ khách
    router.replace('/(customer)/home');

    // 4. Đồng bộ lên backend API
    try {
      await switchRole.mutateAsync('customer');
    } catch {
      /* fallback sang auth store */
    }
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

    Alert.alert(t('helper_profile.logout_title'), t('helper_profile.logout_msg'), [
      { text: t('helper_profile.stay'), style: 'cancel' },
      {
        text: t('helper_profile.logout_now'),
        style: 'destructive',
        onPress: doLogout,
      },
    ]);
  };

  const KYC_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    loading: { label: t('kyc_status_loading'), color: COLORS.gray[500], bg: COLORS.gray[100] },
    unsubmitted: { label: t('kyc_status_unsubmitted'), color: COLORS.error, bg: '#FEF2F2' },
    pending: { label: t('kyc_status_pending'), color: '#D97706', bg: '#FFFBEB' },
    approved: { label: t('kyc_status_approved'), color: COLORS.success, bg: '#ECFDF5' },
    rejected: { label: t('kyc_status_rejected'), color: COLORS.error, bg: '#FEF2F2' },
  };

  const statusKey = pLoading ? 'loading' : profile?.verification_status || 'unsubmitted';
  const KYC_STATUS = KYC_CONFIG[statusKey] || KYC_CONFIG['unsubmitted'];
  const insets = useSafeAreaInsets();

  const completedCount = profile?.completed_jobs ?? profile?.total_completed ?? 0;
  const ratingScore = profile?.rating ?? profile?.average_rating ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {/* Header (Safe Insets) */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 24,
            paddingTop: Math.max(insets.top + 8, 20),
            paddingBottom: 24,
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: COLORS.gray[100],
          }}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/edit-profile?role=helper' as any)}
            style={{ alignItems: 'center' }}
          >
            <Avatar name={user?.full_name} uri={user?.avatar} size={80} />
            <Text
              style={{
                fontSize: fs(20),
                fontWeight: '800',
                color: COLORS.gray[900],
                marginTop: 12,
              }}
            >
              {user?.full_name}
            </Text>
            <Text
              style={{ fontSize: fs(14), color: COLORS.gray[500], marginTop: 4, fontWeight: '600' }}
            >
              {user?.phone}
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
                {t('profile_edit_helper')}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Stats */}
          {profile && (
            <View
              style={{
                flexDirection: 'row',
                gap: 24,
                marginTop: 16,
                paddingTop: 16,
                borderTopWidth: 1,
                borderTopColor: COLORS.gray[100],
                width: '100%',
                justifyContent: 'center',
              }}
            >
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: fs(20), fontWeight: '800', color: COLORS.gray[900] }}>
                  {completedCount}
                </Text>
                <Text style={{ fontSize: fs(12), color: COLORS.gray[500], fontWeight: '600' }}>
                  {t('helper_profile.completed_jobs')}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: COLORS.gray[200] }} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: fs(20), fontWeight: '800', color: '#D97706' }}>
                  ★ {ratingScore > 0 ? ratingScore.toFixed(1) : '5.0'}
                </Text>
                <Text style={{ fontSize: fs(12), color: COLORS.gray[500], fontWeight: '600' }}>
                  {t('helper_profile.reputation_points')}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: COLORS.gray[200] }} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: fs(20), fontWeight: '800', color: COLORS.success }}>
                  {profile.completion_rate ?? 100}%
                </Text>
                <Text style={{ fontSize: fs(12), color: COLORS.gray[500], fontWeight: '600' }}>
                  {t('helper_profile.acceptance_rate')}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={{ padding: 16, gap: 16 }}>
          {/* Switch to customer button */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleSwitchToCustomer}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 14,
              borderWidth: 1.5,
              borderColor: COLORS.primary,
              borderRadius: 16,
              backgroundColor: COLORS.primaryLight,
            }}
          >
            <Home size={18} color={COLORS.primary} />
            <Text style={{ fontSize: fs(15), fontWeight: '800', color: COLORS.primary }}>
              {t('profile_switch_customer')}
            </Text>
          </TouchableOpacity>

          {/* Online toggle */}
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', fontSize: fs(15), color: COLORS.gray[900] }}>
                {t('helper_profile.receiving_status')}
              </Text>
              <Text
                style={{
                  fontSize: fs(13),
                  color: isWorking
                    ? '#D97706'
                    : effectiveOnline
                      ? COLORS.success
                      : COLORS.gray[500],
                  fontWeight: effectiveOnline ? '700' : '500',
                  marginTop: 2,
                }}
              >
                {pLoading
                  ? t('helper_profile.loading_status')
                  : isWorking
                    ? t('helper_profile.status_busy_working')
                    : effectiveOnline
                      ? t('helper_profile.status_online')
                      : t('helper_profile.status_offline')}
              </Text>
            </View>
            <Switch
              value={effectiveOnline}
              disabled={isWorking || pLoading}
              onValueChange={v => {
                if (isWorking) {
                  Alert.alert(
                    t('helper_profile.job_in_progress_title'),
                    t('helper_profile.job_in_progress_msg'),
                    [{ text: t('helper_profile.i_understand'), style: 'default' }],
                  );
                  return;
                }
                if (v && profile?.verification_status !== 'approved') {
                  Alert.alert(
                    t('helper_profile.kyc_required_title'),
                    t('helper_profile.kyc_required_msg'),
                    [
                      { text: t('helper_profile.later'), style: 'cancel' },
                      { text: t('helper_profile.verify_now'), onPress: () => router.push('/kyc') },
                    ],
                  );
                  return;
                }

                // 1. Nhảy giao diện ngay lập tức bằng state cục bộ native
                setLocalOnline(v);

                // 2. Lấy toạ độ GPS chạy nền (non-blocking), không await để phản hồi tức thì
                if (v) {
                  locationService
                    .getCurrentCoordinates()
                    .then(coords => {
                      if (coords) {
                        updateLocation.mutate([coords.longitude, coords.latitude]);
                      }
                    })
                    .catch(() => {});
                }

                // 3. Gửi mutation lên server, rollback nếu lỗi
                setStatus.mutate(v ? 'online' : 'offline', {
                  onSuccess: () => {
                    Toast.show({
                      type: 'success',
                      text1: v
                        ? t('helper_profile.toast_online_title')
                        : t('helper_profile.toast_offline_title'),
                      text2: v
                        ? t('helper_profile.toast_online_sub')
                        : t('helper_profile.toast_offline_sub'),
                    });
                  },
                  onError: () => {
                    setLocalOnline(!v);
                  },
                });
              }}
              trackColor={{ false: COLORS.gray[300], true: isWorking ? '#F59E0B' : COLORS.primary }}
              thumbColor="#fff"
            />
          </Card>

          {/* KYC Status Card */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/kyc' } as any)}
          >
            <Card
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: KYC_STATUS.bg,
              }}
            >
              <ShieldCheck size={24} color={KYC_STATUS.color} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: fs(14), color: KYC_STATUS.color }}>
                  {t('helper_profile.kyc_title')}
                </Text>
                <Text
                  style={{
                    fontSize: fs(13),
                    color: KYC_STATUS.color,
                    marginTop: 2,
                    fontWeight: '600',
                  }}
                >
                  {KYC_STATUS.label}
                </Text>
              </View>
              <ChevronRight size={16} color={KYC_STATUS.color} />
            </Card>
          </TouchableOpacity>

          {/* Menu Items */}
          <Card style={{ gap: 0 }}>
            {[
              {
                icon: CreditCard,
                label: t('profile_bank_account'),
                onPress: () => router.push('/bank-account?role=helper' as any),
              },
              {
                icon: Bell,
                label: t('profile_notification_settings'),
                onPress: () => router.push('/notification-settings' as any),
              },
              {
                icon: FileText,
                label: t('profile_work_schedule'),
                onPress: () => router.push('/helper-availability' as any),
              },
              {
                icon: FileText,
                label: t('profile_monthly_contracts'),
                onPress: () => router.push('/monthly-contracts' as any),
              },
              {
                icon: FileText,
                label: t('profile_career'),
                onPress: () => router.push('/edit-profile?role=helper&tab=career' as any),
              },
              {
                icon: HelpCircle,
                label: t('profile_support_online'),
                onPress: () => router.push('/support-chat' as any),
              },
              {
                icon: HelpCircle,
                label: t('profile_help_center'),
                onPress: () => router.push('/help-center' as any),
              },
              {
                icon: Shield,
                label: t('profile_privacy_insurance'),
                onPress: () => router.push('/policy-insurance' as any),
              },
              {
                icon: Star,
                label: t('profile_reviews'),
                onPress: () => {
                  const targetId =
                    user?._id ||
                    user?.id ||
                    (profile?.user_id as any)?._id ||
                    (typeof profile?.user_id === 'string' ? profile?.user_id : null) ||
                    profile?._id;
                  if (targetId) {
                    router.push({
                      pathname: '/helper-profile/[id]',
                      params: { id: String(targetId) },
                    });
                  } else {
                    Toast.show({
                      type: 'info',
                      text1: t('profile_reviews'),
                      text2: t('helper_profile.no_reviews_yet'),
                    });
                  }
                },
              },
            ].map((item, i) => (
              <View key={item.label}>
                {i > 0 && <Separator my={0} />}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={item.onPress}
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

          {/* ── Display settings (Feature 20) ─────────────────────────── */}
          <DisplaySettingsSection />

          {/* ── App Permissions (Bug 10) ─────────────────────────────────── */}
          <AppPermissionsSection />

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
            <Text style={{ fontSize: fs(15), fontWeight: '800', color: COLORS.error }}>
              {t('profile_logout')}
            </Text>
          </TouchableOpacity>

          <Text
            style={{
              textAlign: 'center',
              fontSize: fs(12),
              color: COLORS.gray[500],
              fontWeight: '500',
            }}
          >
            {t('helper_profile.footer_version')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
