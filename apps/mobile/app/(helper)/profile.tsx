import { View, Text, ScrollView, TouchableOpacity, Switch, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
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
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { Alert } from '@/components/common/app-alert';
import { useAuthStore } from '@/stores/auth.store';
import {
  useHelperProfile,
  useMyProfile,
  useSetHelperStatus,
  useSwitchRole,
  useUpdateHelperLocation,
} from '@/hooks/use-api';
import { locationService } from '@/services/location.service';
import { Avatar, Card, COLORS, Separator } from '@/components/ui';
import { useTranslation } from '@/hooks/use-i18n';
import { DisplaySettingsSection } from '@/components/common/display-settings';
import { useState, useEffect } from 'react';

export default function HelperProfileScreen() {
  const router = useRouter();
  const storedUser = useAuthStore(s => s.user);

  // [H2 Fix]: Nếu tài khoản đang ở vai trò khách, lập tức chuyển sang hồ sơ khách
  if (storedUser?.active_role === 'customer') {
    return <Redirect href="/(customer)/profile" />;
  }

  const { t, fs } = useTranslation();
  const queryClient = useQueryClient();
  const logout = useAuthStore(s => s.logout);
  const { data: myProfile } = useMyProfile();
  const user = myProfile ?? storedUser;
  const { data: profile } = useHelperProfile();
  const setStatus = useSetHelperStatus();
  const updateLocation = useUpdateHelperLocation();
  const switchRole = useSwitchRole();

  const isWorking = profile?.status === 'busy';
  const isOnline = profile?.status === 'online' || isWorking;

  const handleSwitchToCustomer = async () => {
    try {
      await switchRole.mutateAsync('customer');
      useAuthStore.getState().switchRole('customer');
      router.replace('/(customer)/home');
    } catch {
      useAuthStore.getState().switchRole('customer');
      router.replace('/(customer)/home');
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

    Alert.alert(
      'Đăng xuất khỏi Green House?',
      'Bạn có chắc chắn muốn đăng xuất tài khoản Thợ? Dữ liệu công việc và số dư ví của bạn luôn được bảo lưu an toàn.',
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

  const KYC_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    unsubmitted: { label: 'Chưa xác minh', color: COLORS.error, bg: '#FEF2F2' },
    pending: { label: 'Chờ duyệt hồ sơ', color: '#D97706', bg: '#FFFBEB' },
    approved: { label: 'Đã xác thực e-KYC ✓', color: COLORS.success, bg: '#ECFDF5' },
    rejected: { label: 'Hồ sơ bị từ chối', color: COLORS.error, bg: '#FEF2F2' },
  };

  const KYC_STATUS =
    KYC_CONFIG[profile?.verification_status || 'unsubmitted'] || KYC_CONFIG['unsubmitted'];
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
            onPress={() => router.push('/edit-profile')}
            style={{ alignItems: 'center' }}
          >
            <Avatar name={user?.full_name} uri={user?.avatar} size={80} />
            <Text
              style={{ fontSize: 20, fontWeight: '800', color: COLORS.gray[900], marginTop: 12 }}
            >
              {user?.full_name}
            </Text>
            <Text
              style={{ fontSize: 14, color: COLORS.gray[500], marginTop: 4, fontWeight: '600' }}
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
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>
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
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.gray[900] }}>
                  {completedCount}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.gray[500], fontWeight: '600' }}>
                  Đơn hoàn tất
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: COLORS.gray[200] }} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#D97706' }}>
                  ★ {ratingScore > 0 ? ratingScore.toFixed(1) : '5.0'}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.gray[500], fontWeight: '600' }}>
                  Điểm uy tín
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: COLORS.gray[200] }} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.success }}>
                  {profile.completion_rate ?? 100}%
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.gray[500], fontWeight: '600' }}>
                  Nhận việc
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
            <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.primary }}>
              {t('profile_switch_customer')}
            </Text>
          </TouchableOpacity>

          {/* Online toggle */}
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                Trạng thái nhận đơn
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: isWorking ? '#D97706' : isOnline ? COLORS.success : COLORS.gray[500],
                  fontWeight: isOnline ? '700' : '500',
                  marginTop: 2,
                }}
              >
                {isWorking
                  ? '🟡 Đang bận làm việc (Cuốc đang chạy)'
                  : isOnline
                    ? '🟢 Đang nhận đơn mới'
                    : '⚫ Ngoại tuyến (Đã tắt nhận đơn)'}
              </Text>
            </View>
            <Switch
              value={isOnline}
              disabled={isWorking || setStatus.isPending}
              onValueChange={async v => {
                if (isWorking) {
                  Alert.alert(
                    'Đang có công việc diễn ra',
                    'Bạn đang có đơn công việc đang thực hiện. Hãy hoàn thành hoặc kết thúc công việc trước khi tắt nhận việc nhé!',
                    [{ text: 'Đã hiểu', style: 'default' }],
                  );
                  return;
                }
                if (v && profile?.verification_status !== 'approved') {
                  Alert.alert(
                    'Yêu cầu xác minh danh tính e-KYC',
                    'Vui lòng hoàn tất xác thực e-KYC trước khi bật chế độ nhận việc.',
                    [
                      { text: 'Để sau', style: 'cancel' },
                      { text: 'Xác thực ngay', onPress: () => router.push('/kyc') },
                    ],
                  );
                  return;
                }
                if (v) {
                  const coords = await locationService.getCurrentCoordinates();
                  if (coords) {
                    updateLocation.mutate([coords.longitude, coords.latitude]);
                  }
                }
                try {
                  await setStatus.mutateAsync(v ? 'online' : 'offline');
                  Toast.show({
                    type: 'success',
                    text1: v ? 'Đã bật nhận đơn mới' : 'Đã chuyển sang ngoại tuyến',
                    text2: v
                      ? 'Bạn sẽ nhận được thông báo khi có khách hàng đặt dịch vụ gần bạn'
                      : 'Hệ thống đã tạm dừng nhận việc cho bạn',
                  });
                } catch (err: any) {
                  const msg = err?.response?.data?.message || 'Không thể cập nhật trạng thái';
                  Toast.show({ type: 'error', text1: msg });
                }
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
                <Text style={{ fontWeight: '800', fontSize: 14, color: KYC_STATUS.color }}>
                  Xác minh danh tính Thợ (e-KYC)
                </Text>
                <Text
                  style={{ fontSize: 13, color: KYC_STATUS.color, marginTop: 2, fontWeight: '600' }}
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
              { icon: CreditCard, label: t('profile_bank_account'), route: '/bank-account' },
              { icon: FileText, label: t('profile_work_schedule'), route: '/helper-availability' },
              {
                icon: FileText,
                label: t('profile_monthly_contracts'),
                route: '/monthly-contracts',
              },
              { icon: FileText, label: t('profile_career'), route: '/edit-profile' },
              {
                icon: HelpCircle,
                label: t('profile_support_online'),
                route: '/support-chat',
              },
              {
                icon: HelpCircle,
                label: t('profile_help_center'),
                route: '/help-center',
              },
              {
                icon: Shield,
                label: t('profile_privacy_insurance'),
                route: '/policy-insurance',
              },
              {
                icon: Star,
                label: t('profile_reviews'),
                route: user?._id ? `/helper-profile/${user._id}` : null,
              },
            ].map((item, i) => (
              <View key={item.label}>
                {i > 0 && <Separator my={0} />}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => (item.route ? router.push(item.route as any) : null)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    paddingVertical: 14,
                  }}
                >
                  <item.icon size={20} color={COLORS.gray[600]} />
                  <Text
                    style={{ flex: 1, fontSize: 15, color: COLORS.gray[900], fontWeight: '600' }}
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
              fontSize: 12,
              color: COLORS.gray[400],
              fontWeight: '500',
            }}
          >
            Green House Đối Tác v1.0.0 • Verified Ecosystem
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
