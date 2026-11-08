import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronRight,
  MapPin,
  Clock,
  Navigation,
  Map,
  Users,
  Check,
  Search,
  ClipboardList,
  BookOpen,
  ShieldCheck,
  EyeOff,
  RotateCcw,
  AlertCircle,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { formatTime, formatRelativeTime } from '@/utils/date-format';
import { useAuthStore } from '@/stores/auth.store';
import {
  useAvailableJobs,
  useHelperJobs,
  useHelperProfile,
  useTeamInvitations,
  useRespondTeamInvitation,
  useAcceptFixedPrice,
  useSkippedJobs,
  useUnrejectJob,
} from '@/hooks/use-api';
import { useTranslation } from '@/hooks/use-i18n';
import {
  Button,
  Card,
  JobStatusBadge,
  Badge,
  COLORS,
  EmptyState,
  ErrorState,
  useThemeColors,
} from '@/components/ui';
import { OfflineBanner } from '@/components/common/offline-banner';

export default function HelperJobsScreen() {
  const router = useRouter();
  const { t, tService, fs, lang } = useTranslation();
  const tc = useThemeColors();
  const [tab, setTab] = useState(0);
  const tabBarScrollRef = useRef<ScrollView>(null);
  const tabLayouts = useRef<{ [key: number]: { x: number; width: number } }>({});
  const containerWidthRef = useRef<number>(360);

  const tabs = [
    { key: 'available', label: t('helper_jobs_tab_available') },
    { key: 'active', label: t('helper_jobs_tab_active') },
    { key: 'history', label: t('helper_jobs_tab_history') },
  ];

  const handleSelectTab = (index: number) => {
    setTab(index);
    const layout = tabLayouts.current[index];
    if (layout && containerWidthRef.current > 0) {
      const targetX = Math.max(0, layout.x - (containerWidthRef.current - layout.width) / 2);
      tabBarScrollRef.current?.scrollTo({ x: targetX, animated: true });
    } else {
      if (index === 0) {
        tabBarScrollRef.current?.scrollTo({ x: 0, animated: true });
      } else if (index === tabs.length - 1) {
        tabBarScrollRef.current?.scrollToEnd({ animated: true });
      }
    }
  };

  // ── Đơn nhóm: lời mời vào nhóm đang chờ (Roadmap Phase 1) ────────────────
  const { data: teamInvitations } = useTeamInvitations();
  const respondInvitation = useRespondTeamInvitation();
  // Feature 7/9: nhận việc trực tiếp (giá cam kết / đơn bảo hành)
  const acceptFixed = useAcceptFixedPrice();
  const isAuth = useAuthStore(s => s.isAuthenticated);
  const { data: helperProfile, isLoading: pLoading } = useHelperProfile();
  const kycStatus = helperProfile?.verification_status as string | undefined;
  const isVerified = kycStatus === 'approved';

  // Lệnh 7: Xem và hoàn tác đơn đã bỏ qua
  const [showSkipped, setShowSkipped] = useState(false);
  const {
    data: skippedData,
    isLoading: skippedLoading,
    refetch: refetchSkipped,
  } = useSkippedJobs(1, Boolean(isAuth && isVerified !== false));
  const unrejectJob = useUnrejectJob();

  const getJobServiceLabel = (job: any) => {
    if (job?.custom_service_name && String(job.custom_service_name).trim()) {
      return `${t('common_service')}: ${String(job.custom_service_name).trim()}`;
    }
    const svcName = tService(job?.service_id);
    if (svcName) return svcName;
    return t('common_service');
  };
  const [availablePage, setAvailablePage] = useState(1);
  const {
    data: available,
    isLoading: aLoading,
    isError: aError,
    error: aErrorObj,
    isRefetching: aRefetching,
    refetch: ra,
    dataUpdatedAt: aUpdatedAt,
  } = useAvailableJobs(undefined, availablePage, Boolean(isAuth && isVerified !== false));
  const {
    data: active,
    isLoading: acLoading,
    isError: acError,
    error: acErrorObj,
    isRefetching: acRefetching,
    refetch: rac,
    dataUpdatedAt: acUpdatedAt,
  } = useHelperJobs(
    'confirmed,helper_on_the_way,helper_arrived,in_progress,pending_review,disputed',
  );
  const {
    data: history,
    isLoading: hLoading,
    isError: hError,
    error: hErrorObj,
    isRefetching: hRefetching,
    refetch: rh,
    dataUpdatedAt: hUpdatedAt,
  } = useHelperJobs('completed,cancelled,refunded');

  const datasets = [
    {
      data: available?.jobs,
      loading: aLoading,
      isError: aError,
      error: aErrorObj,
      refetching: aRefetching,
      refetch: ra,
    },
    {
      data: Array.isArray(active) ? active : (active?.items ?? []),
      loading: acLoading,
      isError: acError,
      error: acErrorObj,
      refetching: acRefetching,
      refetch: rac,
    },
    {
      data: Array.isArray(history) ? history : (history?.items ?? []),
      loading: hLoading,
      isError: hError,
      error: hErrorObj,
      refetching: hRefetching,
      refetch: rh,
    },
  ];

  const insets = useSafeAreaInsets();
  const user = useAuthStore(s => s.user);
  const isAuthLoading = useAuthStore(s => s.isLoading);
  const isSwitchingRole = useAuthStore(s => s.isSwitchingRole);

  useEffect(() => {
    if (!isAuthLoading && !isSwitchingRole && user && user.active_role === 'customer') {
      router.replace('/(customer)/jobs');
    }
  }, [isAuthLoading, isSwitchingRole, user?.active_role, router]);

  if (isAuthLoading || (!isSwitchingRole && user && user.active_role === 'customer')) {
    return (
      <View style={{ flex: 1, backgroundColor: tc.background }}>
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: Math.max(insets.top + 8, 20),
            paddingBottom: 14,
            backgroundColor: tc.surface,
            borderBottomWidth: 1,
            borderBottomColor: tc.border,
          }}
        >
          <View
            style={{
              width: 140,
              height: 24,
              borderRadius: 8,
              backgroundColor: tc.border,
            }}
          />
          <View
            style={{
              width: 200,
              height: 14,
              borderRadius: 8,
              backgroundColor: tc.subtle,
              marginTop: 6,
            }}
          />
        </View>
        <View style={{ padding: 16, gap: 12 }}>
          {[1, 2, 3].map(i => (
            <View
              key={i}
              style={{
                height: 110,
                borderRadius: 14,
                backgroundColor: tc.border,
              }}
            />
          ))}
        </View>
      </View>
    );
  }

  const renderTabContent = (tabIndex: number) => {
    const ds = datasets[tabIndex];
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={ds.loading || ds.refetching}
            onRefresh={() => {
              ds.refetch();
              if (tabIndex === 0) refetchSkipped();
            }}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {tabIndex === 0 && isVerified && (
          <View style={{ marginBottom: 4 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setShowSkipped(prev => !prev)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: showSkipped ? '#FEF2F2' : tc.surface,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: showSkipped ? '#FCA5A5' : tc.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <EyeOff size={16} color={showSkipped ? '#DC2626' : tc.textSecondary} />
                <Text
                  style={{
                    fontSize: fs(13),
                    fontWeight: '700',
                    color: showSkipped ? '#DC2626' : tc.text,
                  }}
                >
                  {lang === 'en' ? 'Skipped Jobs' : 'Đơn đã bỏ qua'} ({skippedData?.total ?? 0})
                </Text>
              </View>
              <Text style={{ fontSize: fs(12), color: COLORS.primary, fontWeight: '600' }}>
                {showSkipped
                  ? lang === 'en'
                    ? 'Hide'
                    : 'Thu gọn'
                  : lang === 'en'
                    ? 'Review & Restore'
                    : 'Xem lại'}
              </Text>
            </TouchableOpacity>

            {showSkipped && (
              <View style={{ marginTop: 8, gap: 8 }}>
                {skippedLoading ? (
                  <Card style={{ alignItems: 'center', paddingVertical: 16 }}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  </Card>
                ) : !skippedData?.jobs || skippedData.jobs.length === 0 ? (
                  <Card style={{ alignItems: 'center', paddingVertical: 16 }}>
                    <Text style={{ fontSize: fs(13), color: tc.textMuted }}>
                      {lang === 'en'
                        ? 'No skipped jobs to restore.'
                        : 'Bạn chưa bỏ qua đơn hàng nào.'}
                    </Text>
                  </Card>
                ) : (
                  skippedData.jobs.map((job: any) => (
                    <Card
                      key={job._id}
                      style={{
                        padding: 12,
                        gap: 8,
                        borderLeftWidth: 3,
                        borderLeftColor: '#F87171',
                        backgroundColor: tc.surface,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Badge label={getJobServiceLabel(job)} size="sm" />
                        <JobStatusBadge status={job.status} />
                      </View>
                      <Text
                        style={{ fontSize: fs(14), fontWeight: '700', color: tc.text }}
                        numberOfLines={2}
                      >
                        {job.title}
                      </Text>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: 2,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <MapPin size={12} color={COLORS.gray[500]} />
                          <Text style={{ fontSize: fs(12), color: tc.textSecondary }}>
                            {job.address?.district || job.address?.city || t('jobs_unspecified')}
                          </Text>
                          {job.distance_km != null ? (
                            <Text
                              style={{
                                fontSize: fs(12),
                                color: COLORS.primary,
                                fontWeight: '600',
                              }}
                            >
                              · {job.distance_km === 0 ? '< 100m' : `${job.distance_km} km`}
                            </Text>
                          ) : (
                            <Text
                              style={{
                                fontSize: fs(12),
                                color: tc.textMuted,
                                fontWeight: '500',
                              }}
                            >
                              · {lang === 'en' ? 'Location not specified' : 'Chưa xác định vị trí'}
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          disabled={unrejectJob.isPending}
                          onPress={() => unrejectJob.mutate(job._id)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 8,
                            backgroundColor: '#EFF6FF',
                            borderWidth: 1,
                            borderColor: '#BFDBFE',
                          }}
                        >
                          <RotateCcw size={12} color="#1D4ED8" />
                          <Text
                            style={{
                              fontSize: fs(11.5),
                              fontWeight: '700',
                              color: '#1D4ED8',
                            }}
                          >
                            {lang === 'en' ? 'Restore Job' : 'Hiện lại đơn này'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </Card>
                  ))
                )}
              </View>
            )}
          </View>
        )}
        {tabIndex === 0 && (pLoading || (aLoading && !available)) ? (
          <Card style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={{ fontSize: fs(13), color: tc.textMuted }}>
              {lang === 'en'
                ? 'Checking status and loading new jobs...'
                : 'Đang kiểm tra trạng thái và tải đơn mới...'}
            </Text>
          </Card>
        ) : tabIndex === 0 && !pLoading && helperProfile && !isVerified ? (
          <Card style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }}>
            <EmptyState
              icon={
                kycStatus === 'pending' ? (
                  <Clock size={36} color={COLORS.gray[400]} />
                ) : (
                  <ShieldCheck size={36} color={COLORS.gray[400]} />
                )
              }
              title={
                kycStatus === 'pending'
                  ? lang === 'en'
                    ? 'e-KYC profile pending approval'
                    : 'Hồ sơ e-KYC đang chờ duyệt'
                  : lang === 'en'
                    ? 'e-KYC verification required'
                    : 'Cần xác thực e-KYC để nhận việc'
              }
              subtitle={
                kycStatus === 'pending'
                  ? lang === 'en'
                    ? 'You will see new jobs once your profile is approved (usually within 24h).'
                    : 'Bạn sẽ thấy đơn mới ngay khi hồ sơ được duyệt (thường trong 24h).'
                  : kycStatus === 'rejected'
                    ? lang === 'en'
                      ? `Profile rejected${helperProfile?.rejection_reason ? ': ' + helperProfile.rejection_reason : ''}. Please resubmit.`
                      : `Hồ sơ bị từ chối${helperProfile?.rejection_reason ? ': ' + helperProfile.rejection_reason : ''}. Vui lòng nộp lại.`
                    : lang === 'en'
                      ? 'Only verified helpers can view jobs and submit quotes.'
                      : 'Chỉ thợ đã xác thực danh tính mới được xem đơn và gửi báo giá cho khách.'
              }
            />
            {kycStatus !== 'pending' && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push('/kyc')}
                style={{
                  backgroundColor: COLORS.primary,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 14,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{t('jobs_verify_now')}</Text>
              </TouchableOpacity>
            )}
          </Card>
        ) : ds.isError ? (
          (() => {
            const errObj = (ds as any).error;
            const is401 =
              errObj?.response?.status === 401 ||
              errObj?.status === 401 ||
              errObj?.name === 'SessionExpiredError' ||
              errObj?.isSessionExpired;
            if (is401) {
              return (
                <Card style={{ alignItems: 'center', paddingVertical: 20 }}>
                  <EmptyState
                    icon={<AlertCircle size={36} color={COLORS.gray[400]} />}
                    title={lang === 'en' ? 'Session expired' : 'Phiên đăng nhập đã hết hạn'}
                    subtitle={
                      lang === 'en'
                        ? 'Your session has expired. Please log in again to view your jobs.'
                        : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để xem danh sách công việc.'
                    }
                    action={lang === 'en' ? 'Log in again' : 'Đăng nhập lại'}
                    onAction={() => router.push('/(auth)/login')}
                  />
                </Card>
              );
            }
            return (
              <Card style={{ alignItems: 'center', paddingVertical: 20 }}>
                <ErrorState
                  title={
                    lang === 'en' ? 'Unable to load jobs' : 'Không thể tải danh sách công việc'
                  }
                  subtitle={
                    lang === 'en'
                      ? 'Connection to server failed. Please check your network and retry.'
                      : 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.'
                  }
                  onRetry={() => ds.refetch()}
                />
              </Card>
            );
          })()
        ) : !ds.loading && (!ds.data || ds.data.length === 0) ? (
          <Card style={{ alignItems: 'center', paddingVertical: 40 }}>
            <EmptyState
              icon={
                tabIndex === 0 ? (
                  available?.empty_reason === 'outside_working_hours' ? (
                    <Clock size={36} color={COLORS.gray[400]} />
                  ) : (
                    <Search size={36} color={COLORS.gray[400]} />
                  )
                ) : tabIndex === 1 ? (
                  <ClipboardList size={36} color={COLORS.gray[400]} />
                ) : (
                  <BookOpen size={36} color={COLORS.gray[400]} />
                )
              }
              title={
                tabIndex === 0
                  ? available?.empty_reason === 'outside_working_hours'
                    ? t('jobs_outside_hours_title')
                    : t('helper_jobs_empty_available')
                  : tabIndex === 1
                    ? t('helper_jobs_empty_active')
                    : t('helper_jobs_empty_history')
              }
              subtitle={
                tabIndex === 0
                  ? available?.empty_reason === 'outside_working_hours'
                    ? t('jobs_outside_hours_sub')
                    : t('helper_jobs_empty_available_sub')
                  : tabIndex === 1
                    ? t('helper_jobs_empty_active_sub')
                    : t('helper_jobs_empty_history_sub')
              }
            />
          </Card>
        ) : (
          (ds.data ?? []).map(
            (job: {
              _id: string;
              title: string;
              status: string;
              service_id: { name: string } | null;
              address: { district: string; city: string };
              total_quotes_count: number;
              created_at: string;
              preferred_time_start?: string;
              distance_km?: number;
              estimated_minutes?: number;
              estimated_travel_minutes?: number;
              routing_error?: boolean;
              recurring_plan_id?: string;
              is_recurring?: boolean;
              is_private_offer?: boolean;
              is_fixed_price?: boolean;
              fixed_price?: number;
              is_warranty?: boolean;
              is_sos?: boolean;
            }) => (
              <TouchableOpacity
                key={job._id}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({ pathname: '/helper-job-detail/[id]', params: { id: job._id } })
                }
              >
                <Card style={{ gap: 10, padding: 16 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: '800',
                        fontSize: fs(15),
                        color: tc.text,
                        flex: 1,
                        marginRight: 8,
                        lineHeight: Math.round(fs(20)),
                      }}
                      numberOfLines={2}
                    >
                      {job.title}
                    </Text>
                    {/* B109: badge SOS đỏ cho đơn SOS */}
                    {job.is_sos ? (
                      <View
                        style={{
                          backgroundColor: '#DC2626',
                          borderRadius: 6,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          marginRight: 6,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(11) }}>
                          SOS
                        </Text>
                      </View>
                    ) : null}
                    <JobStatusBadge status={job.status} />
                  </View>
                  <View
                    style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                  >
                    <Badge label={getJobServiceLabel(job)} size="sm" />
                    {job.is_private_offer ? (
                      <Badge
                        label={t('jobs_badge_private_for_you')}
                        size="sm"
                        color="#FDF2F8"
                        textColor="#9D174D"
                      />
                    ) : null}
                    {job.is_recurring || job.recurring_plan_id ? (
                      <Badge
                        label={t('jobs_badge_recurring')}
                        size="sm"
                        color="#EFF6FF"
                        textColor="#1D4ED8"
                      />
                    ) : null}
                    {job.is_fixed_price ? (
                      <Badge
                        label={t('jobs_badge_fixed_price', {
                          price: new Intl.NumberFormat('vi-VN').format(job.fixed_price ?? 0),
                        })}
                        size="sm"
                        color="#ECFDF5"
                        textColor="#065F46"
                      />
                    ) : null}
                    {job.is_warranty ? (
                      <Badge
                        label={t('jobs_badge_warranty')}
                        size="sm"
                        color="#FFFBEB"
                        textColor="#92400E"
                      />
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <MapPin size={13} color={COLORS.gray[500]} />
                      <Text
                        style={{ fontSize: fs(12), color: tc.textSecondary, fontWeight: '500' }}
                      >
                        {job.address?.district || job.address?.city || t('jobs_unspecified')}
                      </Text>
                    </View>
                    {job.distance_km != null ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Navigation size={13} color={COLORS.primary} />
                        <Text
                          style={{ fontSize: fs(12), color: COLORS.primary, fontWeight: '700' }}
                        >
                          {job.distance_km === 0 ? '< 100m' : `${job.distance_km} km`} ~{' '}
                          {(job.estimated_minutes ?? (job as any).estimated_travel_minutes)
                            ? `${job.estimated_minutes ?? (job as any).estimated_travel_minutes} ${t('jobs_minutes_unit')}`
                            : '< 1 phút'}
                        </Text>
                      </View>
                    ) : (job as any).routing_error ? (
                      <TouchableOpacity
                        onPress={() => ra()}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                      >
                        <AlertCircle size={13} color={COLORS.error || '#ef4444'} />
                        <Text
                          style={{
                            fontSize: fs(12),
                            color: COLORS.error || '#ef4444',
                            fontWeight: '600',
                            textDecorationLine: 'underline',
                          }}
                        >
                          {lang === 'en'
                            ? 'Route error · Tap to retry'
                            : 'Lỗi tuyến đường · Thử lại'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Navigation size={13} color={COLORS.gray[400]} />
                        <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
                          {lang === 'en' ? 'Location not specified' : 'Chưa xác định vị trí'}
                        </Text>
                      </View>
                    )}
                    {job.preferred_time_start && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Clock size={13} color={COLORS.gray[400]} />
                        <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
                          {job.preferred_time_start}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: 8,
                      borderTopWidth: 1,
                      borderTopColor: tc.border,
                    }}
                  >
                    <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
                      {formatRelativeTime(job.created_at, lang)}
                    </Text>
                    {tabIndex === 0 && (job.is_fixed_price || job.is_warranty) ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={acceptFixed.isPending}
                        onPress={() =>
                          acceptFixed.mutate(job._id, {
                            onSuccess: () =>
                              router.push({
                                pathname: '/helper-job-detail/[id]',
                                params: { id: job._id },
                              }),
                            onError: (err: any) => {
                              const msg =
                                err?.response?.data?.message ||
                                (lang === 'en'
                                  ? 'Failed to accept job. Try again later.'
                                  : 'Nhận việc thất bại. Thử lại sau.');
                              Toast.show({ type: 'error', text1: msg });
                            },
                          })
                        }
                        style={{
                          backgroundColor: COLORS.primary,
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ fontSize: fs(13), fontWeight: '800', color: '#fff' }}>
                          {job.is_warranty
                            ? lang === 'en'
                              ? 'Accept warranty job'
                              : 'Nhận việc bảo hành'
                            : lang === 'en'
                              ? `Accept now • ${new Intl.NumberFormat('en-US').format(job.fixed_price ?? 0)}₫`
                              : `Nhận việc ngay • ${new Intl.NumberFormat('vi-VN').format(job.fixed_price ?? 0)}₫`}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <Text
                          style={{ fontSize: fs(13), fontWeight: '800', color: COLORS.primary }}
                        >
                          {tabIndex === 0
                            ? t('helper_jobs_quote_now')
                            : t('helper_jobs_view_detail')}
                        </Text>
                        <ChevronRight size={14} color={COLORS.primary} />
                      </View>
                    )}
                  </View>
                </Card>
              </TouchableOpacity>
            ),
          )
        )}

        {tabIndex === 0 && available && available.total_pages > 1 && (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: 12,
              paddingHorizontal: 8,
            }}
          >
            <TouchableOpacity
              disabled={availablePage <= 1}
              onPress={() => setAvailablePage(p => Math.max(1, p - 1))}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: availablePage <= 1 ? COLORS.gray[100] : COLORS.primaryLight,
              }}
            >
              <Text
                style={{
                  fontSize: fs(13),
                  fontWeight: '700',
                  color: availablePage <= 1 ? COLORS.gray[400] : COLORS.primary,
                }}
              >
                {lang === 'en' ? 'Previous' : 'Trang trước'}
              </Text>
            </TouchableOpacity>

            <Text style={{ fontSize: fs(13), fontWeight: '600', color: tc.textMuted }}>
              {lang === 'en'
                ? `Page ${available.page} / ${available.total_pages}`
                : `Trang ${available.page} / ${available.total_pages}`}
            </Text>

            <TouchableOpacity
              disabled={availablePage >= available.total_pages}
              onPress={() => setAvailablePage(p => p + 1)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor:
                  availablePage >= available.total_pages ? COLORS.gray[100] : COLORS.primaryLight,
              }}
            >
              <Text
                style={{
                  fontSize: fs(13),
                  fontWeight: '700',
                  color: availablePage >= available.total_pages ? COLORS.gray[400] : COLORS.primary,
                }}
              >
                {lang === 'en' ? 'Next' : 'Trang sau'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      <OfflineBanner />
      {/* Header */}
      <View
        style={{
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
          paddingHorizontal: 20,
          paddingTop: Math.max(insets.top + 8, 20),
          paddingBottom: 14,
        }}
      >
        <Text style={{ fontSize: fs(20), fontWeight: '800', color: tc.text }}>
          {t('helper_jobs_title')}
        </Text>
        <Text style={{ fontSize: fs(12), color: tc.textMuted, marginTop: 2 }}>
          {t('helper_jobs_subtitle')} • {lang === 'en' ? 'Updated' : 'Cập nhật'} lúc{' '}
          {formatTime(Math.max(aUpdatedAt || 0, acUpdatedAt || 0, hUpdatedAt || 0) || Date.now())}
        </Text>
        {/* Bản đồ nhu cầu (Feature 15) */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/demand-map')}
          style={{
            marginTop: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: COLORS.primaryLight,
            borderWidth: 1,
            borderColor: COLORS.primary,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Map size={18} color={COLORS.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', fontSize: fs(13.5), color: tc.text }}>
              {t('helper_jobs_demand_map')}
            </Text>
            <Text style={{ fontSize: fs(11.5), color: tc.textMuted }}>
              {t('helper_jobs_demand_map_sub')}
            </Text>
          </View>
          <ChevronRight size={16} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* ── Lời mời vào nhóm (Đơn nhóm) ─────────────────────────────────── */}
      {(teamInvitations ?? []).length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Users size={16} color={COLORS.gray[900]} />
            <Text style={{ fontWeight: '800', fontSize: fs(14.5), color: tc.text }}>
              {lang === 'en' ? 'Team Invitations' : 'Lời mời vào nhóm'} ({teamInvitations!.length})
            </Text>
          </View>
          {teamInvitations!.map(inv => (
            <Card key={inv.job_id} style={{ gap: 8 }}>
              <Text style={{ fontWeight: '800', fontSize: fs(14), color: tc.text }}>
                {inv.title}
              </Text>
              <Text
                style={{
                  fontSize: fs(12.5),
                  color: tc.textSecondary,
                  lineHeight: Math.round(fs(18)),
                }}
              >
                {inv.address_text ? `${inv.address_text}\n` : ''}
                {lang === 'en'
                  ? `You will receive ${inv.split_percent}% of job pay (after platform fee) when completed with team of ${inv.helpers_needed} helpers.`
                  : `Bạn sẽ nhận ${inv.split_percent}% tiền công của đơn (sau phí sàn) khi hoàn thành cùng nhóm ${inv.helpers_needed} thợ.`}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  title={lang === 'en' ? 'Accept' : 'Nhận lời'}
                  size="sm"
                  loading={respondInvitation.isPending}
                  onPress={() => respondInvitation.mutate({ jobId: inv.job_id, action: 'accept' })}
                  icon={<Check size={14} color="#fff" />}
                />
                <Button
                  title={lang === 'en' ? 'Decline' : 'Từ chối'}
                  size="sm"
                  variant="outline"
                  onPress={() => respondInvitation.mutate({ jobId: inv.job_id, action: 'decline' })}
                />
                <Button
                  title={lang === 'en' ? 'View Job' : 'Xem đơn'}
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    router.push({
                      pathname: '/helper-job-detail/[id]',
                      params: { id: inv.job_id },
                    })
                  }
                />
              </View>
            </Card>
          ))}
        </View>
      )}

      {/* Tabs */}
      <View
        style={{
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
        }}
      >
        <ScrollView
          ref={tabBarScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled={true}
          directionalLockEnabled={true}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          onLayout={e => {
            containerWidthRef.current = e.nativeEvent.layout.width;
          }}
          contentContainerStyle={{
            flexDirection: 'row',
            paddingHorizontal: 8,
            paddingVertical: 8,
            gap: 6,
          }}
        >
          {tabs.map((tItem, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.8}
              onPress={() => handleSelectTab(i)}
              onLayout={e => {
                tabLayouts.current[i] = e.nativeEvent.layout;
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 14,
                backgroundColor: tab === i ? COLORS.primary : COLORS.gray[100],
              }}
            >
              <Text
                style={{
                  fontSize: fs(13),
                  fontWeight: tab === i ? '800' : '600',
                  color: tab === i ? '#fff' : COLORS.gray[600],
                }}
              >
                {tItem.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Tab Content */}
      <View style={{ flex: 1 }}>{renderTabContent(tab)}</View>
    </View>
  );
}
