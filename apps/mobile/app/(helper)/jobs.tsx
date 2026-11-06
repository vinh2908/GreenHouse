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
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useAuthStore } from '@/stores/auth.store';
import {
  useAvailableJobs,
  useHelperJobs,
  useHelperProfile,
  useTeamInvitations,
  useRespondTeamInvitation,
  useAcceptFixedPrice,
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
} from '@/components/ui';
import { OfflineBanner } from '@/components/common/offline-banner';

dayjs.extend(relativeTime);

export default function HelperJobsScreen() {
  const router = useRouter();
  const { t, tService, fs, lang } = useTranslation();
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
  const {
    data: available,
    isLoading: aLoading,
    isError: aError,
    isRefetching: aRefetching,
    refetch: ra,
    dataUpdatedAt: aUpdatedAt,
  } = useAvailableJobs(undefined, 1, Boolean(isAuth && isVerified !== false));
  const {
    data: active,
    isLoading: acLoading,
    isError: acError,
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
    isRefetching: hRefetching,
    refetch: rh,
    dataUpdatedAt: hUpdatedAt,
  } = useHelperJobs('completed,cancelled,refunded');

  const datasets = [
    {
      data: available?.jobs,
      loading: aLoading,
      isError: aError,
      refetching: aRefetching,
      refetch: ra,
    },
    { data: active, loading: acLoading, isError: acError, refetching: acRefetching, refetch: rac },
    { data: history, loading: hLoading, isError: hError, refetching: hRefetching, refetch: rh },
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
      <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: Math.max(insets.top + 8, 20),
            paddingBottom: 14,
            backgroundColor: '#fff',
            borderBottomWidth: 1,
            borderBottomColor: COLORS.gray[100],
          }}
        >
          <View
            style={{
              width: 140,
              height: 24,
              borderRadius: 8,
              backgroundColor: COLORS.gray[200],
            }}
          />
          <View
            style={{
              width: 200,
              height: 14,
              borderRadius: 8,
              backgroundColor: COLORS.gray[100],
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
                backgroundColor: COLORS.gray[200],
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
            onRefresh={ds.refetch}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {tabIndex === 0 && (pLoading || (aLoading && !available)) ? (
          <Card style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={{ fontSize: fs(13), color: COLORS.gray[500] }}>
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
          <Card style={{ alignItems: 'center', paddingVertical: 20 }}>
            <ErrorState
              title={lang === 'en' ? 'Unable to load jobs' : 'Không thể tải danh sách công việc'}
              subtitle={
                lang === 'en'
                  ? 'Connection to server failed. Please check your network and retry.'
                  : 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.'
              }
              onRetry={() => ds.refetch()}
            />
          </Card>
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
              recurring_plan_id?: string;
              is_recurring?: boolean;
              is_private_offer?: boolean;
              is_fixed_price?: boolean;
              fixed_price?: number;
              is_warranty?: boolean;
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
                        color: COLORS.gray[900],
                        flex: 1,
                        marginRight: 8,
                        lineHeight: Math.round(fs(20)),
                      }}
                      numberOfLines={2}
                    >
                      {job.title}
                    </Text>
                    <JobStatusBadge status={job.status} />
                  </View>
                  <View
                    style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                  >
                    <Badge label={tService(job.service_id) || t('common_service')} size="sm" />
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
                        style={{ fontSize: fs(12), color: COLORS.gray[600], fontWeight: '500' }}
                      >
                        {job.address?.district || job.address?.city || t('jobs_unspecified')}
                      </Text>
                    </View>
                    {job.distance_km != null && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Navigation size={13} color={COLORS.primary} />
                        <Text
                          style={{ fontSize: fs(12), color: COLORS.primary, fontWeight: '700' }}
                        >
                          {job.distance_km} km ~ {job.estimated_minutes ?? '?'}{' '}
                          {t('jobs_minutes_unit')}
                        </Text>
                      </View>
                    )}
                    {job.preferred_time_start && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Clock size={13} color={COLORS.gray[400]} />
                        <Text style={{ fontSize: fs(12), color: COLORS.gray[500] }}>
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
                      borderTopColor: COLORS.gray[100],
                    }}
                  >
                    <Text style={{ fontSize: fs(12), color: COLORS.gray[500] }}>
                      {dayjs(job.created_at).fromNow()}
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
      </ScrollView>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <OfflineBanner />
      {/* Header */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
          paddingHorizontal: 20,
          paddingTop: Math.max(insets.top + 8, 20),
          paddingBottom: 14,
        }}
      >
        <Text style={{ fontSize: fs(20), fontWeight: '800', color: COLORS.gray[900] }}>
          {t('helper_jobs_title')}
        </Text>
        <Text style={{ fontSize: fs(12), color: COLORS.gray[500], marginTop: 2 }}>
          {t('helper_jobs_subtitle')} • {lang === 'en' ? 'Updated' : 'Cập nhật'} lúc{' '}
          {dayjs(Math.max(aUpdatedAt || 0, acUpdatedAt || 0, hUpdatedAt || 0) || Date.now()).format(
            'HH:mm',
          )}
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
            <Text style={{ fontWeight: '800', fontSize: fs(13.5), color: COLORS.gray[900] }}>
              {t('helper_jobs_demand_map')}
            </Text>
            <Text style={{ fontSize: fs(11.5), color: COLORS.gray[500] }}>
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
            <Text style={{ fontWeight: '800', fontSize: fs(14.5), color: COLORS.gray[900] }}>
              {lang === 'en' ? 'Team Invitations' : 'Lời mời vào nhóm'} ({teamInvitations!.length})
            </Text>
          </View>
          {teamInvitations!.map(inv => (
            <Card key={inv.job_id} style={{ gap: 8 }}>
              <Text style={{ fontWeight: '800', fontSize: fs(14), color: COLORS.gray[900] }}>
                {inv.title}
              </Text>
              <Text
                style={{
                  fontSize: fs(12.5),
                  color: COLORS.gray[600],
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
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
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
