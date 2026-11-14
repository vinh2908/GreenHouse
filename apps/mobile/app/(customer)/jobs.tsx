import { useState, useEffect } from 'react';
import { formatDate, formatTime, formatRelativeTime } from '@/utils/date-format';
import Toast from 'react-native-toast-message';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, Plus, Clock, MapPin, ClipboardList } from 'lucide-react-native';
import dayjs from 'dayjs';
import { useAuthStore } from '@/stores/auth.store';
import { useMyJobs, useMyProfile, useRebroadcastJob } from '@/hooks/use-api';
import { useTranslation } from '@/hooks/use-i18n';
import { OverdueJobBanner } from '@/components/common/overdue-job-banner';
import { isOverdueUnassigned } from '@/utils/job-overdue';
import {
  Card,
  JobStatusBadge,
  EmptyState,
  ErrorState,
  COLORS,
  Badge,
  useThemeColors,
} from '@/components/ui';

const TABS = [
  { key: undefined, labelKey: 'jobs_tab_all' },
  { key: 'open,receiving_quotes', labelKey: 'jobs_tab_waiting' },
  { key: 'confirmed,helper_on_the_way,helper_arrived,in_progress', labelKey: 'jobs_tab_working' },
  { key: 'pending_review,disputed', labelKey: 'jobs_tab_review' },
  { key: 'completed,refunded', labelKey: 'jobs_tab_done' },
  { key: 'expired', labelKey: 'jobs_tab_expired' },
  { key: 'cancelled', labelKey: 'jobs_tab_cancelled' },
];

export default function CustomerJobsScreen() {
  const router = useRouter();
  const { t, tService, fs, lang } = useTranslation();
  const tc = useThemeColors();
  const [activeTab, setActiveTab] = useState(0);
  const user = useAuthStore(s => s.user);
  const isAuth = useAuthStore(s => s.isAuthenticated);
  const isAuthLoading = useAuthStore(s => s.isLoading);
  const isSwitchingRole = useAuthStore(s => s.isSwitchingRole);
  const isHelper = user?.active_role === 'helper';
  const [page, setPage] = useState(1);
  const [accumulatedJobs, setAccumulatedJobs] = useState<any[]>([]);
  // R7 item 3: nút gửi lại trên banner quá giờ (theo dõi đúng đơn đang gửi).
  const rebroadcastJob = useRebroadcastJob();
  const [rebroadcastingId, setRebroadcastingId] = useState<string | null>(null);

  const handleRebroadcast = async (jobId: string) => {
    if (rebroadcastJob.isPending) return;
    setRebroadcastingId(jobId);
    try {
      await rebroadcastJob.mutateAsync(jobId);
      Toast.show({ type: 'success', text1: t('overdue_rebroadcast_sent') });
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      Toast.show({
        type: 'error',
        text1: typeof msg === 'string' && msg ? msg : t('overdue_rebroadcast_cooldown'),
      });
    } finally {
      setRebroadcastingId(null);
    }
  };

  const {
    data: jobs,
    isLoading,
    isError,
    isRefetching,
    refetch,
    dataUpdatedAt,
  } = useMyJobs(TABS[activeTab].key, page, 10);
  const totalPages = jobs?.total_pages ?? 1;

  useEffect(() => {
    if (jobs) {
      const items = Array.isArray(jobs) ? jobs : (jobs?.items ?? []);
      if (page === 1) {
        setAccumulatedJobs(items);
      } else {
        setAccumulatedJobs(prev => {
          const ids = new Set(prev.map(j => j._id));
          return [...prev, ...items.filter((j: any) => !ids.has(j._id))];
        });
      }
    }
  }, [jobs, page]);

  const jobList: any[] =
    page === 1 && (isLoading || accumulatedJobs.length === 0)
      ? Array.isArray(jobs)
        ? jobs
        : (jobs?.items ?? [])
      : accumulatedJobs;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!isAuthLoading && !isSwitchingRole && isHelper) {
      router.replace('/(helper)/jobs');
    }
  }, [isAuthLoading, isSwitchingRole, isHelper, router]);

  if (isAuthLoading || (!isSwitchingRole && isHelper)) {
    return (
      <View style={{ flex: 1, backgroundColor: tc.background }}>
        {/* Header skeleton */}
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

        {/* Tab bar skeleton */}
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 16,
            paddingVertical: 12,
            gap: 10,
            backgroundColor: tc.surface,
            borderBottomWidth: 1,
            borderBottomColor: tc.border,
          }}
        >
          {[80, 100, 90, 80].map((w, i) => (
            <View
              key={i}
              style={{
                width: w,
                height: 32,
                borderRadius: 14,
                backgroundColor: tc.subtle,
              }}
            />
          ))}
        </View>

        {/* Content skeleton cards */}
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

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: Math.max(insets.top + 8, 20),
          paddingBottom: 14,
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
        }}
      >
        <View>
          <Text style={{ fontSize: fs(20), fontWeight: '800', color: tc.text }}>
            {t('jobs_title')}
          </Text>
          <Text style={{ fontSize: fs(12), color: tc.textMuted, marginTop: 2 }}>
            {t('jobs_subtitle')}{' '}
            {dataUpdatedAt
              ? `• ${lang === 'en' ? 'Updated at ' : 'Cập nhật lúc '}${formatTime(dayjs(dataUpdatedAt))}`
              : ''}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/(customer)/booking')}
          style={{
            backgroundColor: COLORS.primary,
            width: 38,
            height: 38,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: COLORS.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 4,
          }}
        >
          <Plus size={22} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* Tabs Pill Bar */}
      <View
        style={{
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
        >
          {TABS.map((tab, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.8}
              onPress={() => {
                setActiveTab(i);
                setPage(1);
                setAccumulatedJobs([]);
              }}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 14,
                backgroundColor: activeTab === i ? COLORS.primary : COLORS.gray[100],
              }}
            >
              <Text
                style={{
                  fontSize: fs(13),
                  fontWeight: activeTab === i ? '800' : '600',
                  color: activeTab === i ? '#fff' : COLORS.gray[600],
                }}
              >
                {t(tab.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Job Cards List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
          const isCloseToBottom =
            nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y >=
            nativeEvent.contentSize.height - 80;
          if (isCloseToBottom && !isLoading && !isRefetching && page < totalPages) {
            setPage(p => p + 1);
          }
        }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading || isRefetching}
            onRefresh={() => {
              setPage(1);
              refetch();
            }}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {isError && isAuth ? (
          <Card style={{ alignItems: 'center', paddingVertical: 20 }}>
            <ErrorState
              title={lang === 'en' ? 'Unable to load orders' : 'Không thể tải danh sách đơn'}
              subtitle={
                lang === 'en'
                  ? 'Failed to fetch your orders. Please check your network and retry.'
                  : 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.'
              }
              onRetry={() => refetch()}
            />
          </Card>
        ) : !isLoading && (!jobList || jobList.length === 0) ? (
          <Card style={{ alignItems: 'center', paddingVertical: 40 }}>
            <EmptyState
              icon={<ClipboardList size={36} color={COLORS.gray[400]} />}
              title={t('jobs_empty_title')}
              subtitle={
                activeTab === 0
                  ? t('jobs_empty_sub_all')
                  : `${t('jobs_empty_title')} — "${t(TABS[activeTab].labelKey)}".`
              }
              action={t('jobs_empty_action')}
              onAction={() => router.push('/(customer)/booking')}
            />
          </Card>
        ) : (
          jobList.map(
            (job: {
              _id: string;
              title: string;
              status: string;
              service_id: { name: string } | null;
              address: { district: string; city: string };
              total_quotes_count: number;
              created_at: string;
              helper_id?: { full_name: string } | null;
              recurring_plan_id?: string;
              private_offer_helper_id?: string;
              is_warranty?: boolean;
              is_sos?: boolean;
              preferred_date?: string;
              preferred_time_start?: string;
            }) => (
              <View key={job._id} style={{ gap: 10 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({ pathname: '/job-detail/[id]', params: { id: job._id } })
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
                      style={{
                        flexDirection: 'row',
                        gap: 8,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      <Badge
                        label={tService(job.service_id) || t('jobs_service_fallback')}
                        size="sm"
                      />
                      {job.recurring_plan_id ? (
                        <Badge
                          label={t('jobs_badge_recurring')}
                          size="sm"
                          color="#EFF6FF"
                          textColor="#1D4ED8"
                        />
                      ) : null}
                      {job.private_offer_helper_id ? (
                        <Badge
                          label={t('jobs_badge_private')}
                          size="sm"
                          color="#FDF2F8"
                          textColor="#9D174D"
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Clock size={13} color={COLORS.gray[400]} />
                        <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
                          {formatRelativeTime(job.created_at, lang)}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingTop: 10,
                        borderTopWidth: 1,
                        borderTopColor: tc.border,
                      }}
                    >
                      {(() => {
                        if (job.status === 'cancelled') {
                          return (
                            <Text
                              style={{ fontSize: fs(12.5), color: COLORS.error, fontWeight: '700' }}
                            >
                              {t('jobs_customer_cancelled')}
                            </Text>
                          );
                        }
                        if (job.status === 'refunded') {
                          return (
                            <Text
                              style={{
                                fontSize: fs(12.5),
                                color: tc.textSecondary,
                                fontWeight: '700',
                              }}
                            >
                              {t('status_refunded')}
                            </Text>
                          );
                        }
                        if (job.status === 'disputed') {
                          return (
                            <Text
                              style={{ fontSize: fs(12.5), color: COLORS.error, fontWeight: '700' }}
                            >
                              {t('status_disputed')}
                            </Text>
                          );
                        }
                        if (job.status === 'completed') {
                          return (
                            <Text
                              style={{
                                fontSize: fs(12.5),
                                color: COLORS.success,
                                fontWeight: '700',
                              }}
                            >
                              {job.helper_id
                                ? `${t('jobs_helper_label')} ${(job.helper_id as any).full_name}`
                                : t('status_completed')}
                            </Text>
                          );
                        }
                        if (job.helper_id) {
                          return (
                            <Text
                              style={{
                                fontSize: fs(13),
                                color: tc.textSecondary,
                                fontWeight: '600',
                              }}
                            >
                              {t('jobs_helper_label')}{' '}
                              <Text style={{ color: tc.text, fontWeight: '700' }}>
                                {(job.helper_id as any).full_name}
                              </Text>
                            </Text>
                          );
                        }
                        return (
                          <Text
                            style={{
                              fontSize: fs(12.5),
                              color: job.total_quotes_count > 0 ? COLORS.primary : COLORS.gray[500],
                              fontWeight: '700',
                            }}
                          >
                            {job.total_quotes_count > 0
                              ? t('jobs_quotes_count', { count: job.total_quotes_count })
                              : t('jobs_waiting_quotes')}
                          </Text>
                        );
                      })()}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <Text
                          style={{ fontSize: fs(12.5), color: COLORS.primary, fontWeight: '700' }}
                        >
                          {t('jobs_details')}
                        </Text>
                        <ChevronRight size={14} color={COLORS.primary} />
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>

                {/* R7 item 3: banner đơn quá giờ hẹn chưa có thợ — đặt NGOÀI
                    TouchableOpacity của thẻ để 3 nút bấm không kích hoạt điều
                    hướng sang chi tiết. Dời giờ mở thẳng modal sửa ở màn chi
                    tiết (focus=edit); hủy mở màn chi tiết (cần nhập lý do). */}
                {isOverdueUnassigned(job as any) && (
                  <OverdueJobBanner
                    timeLabel={`${job.preferred_time_start ?? ''} · ${job.preferred_date ? formatDate(job.preferred_date, lang) : ''}`}
                    onReschedule={() =>
                      router.push({
                        pathname: '/job-detail/[id]',
                        params: { id: job._id, focus: 'edit' },
                      })
                    }
                    onRebroadcast={() => handleRebroadcast(job._id)}
                    onCancel={() =>
                      router.push({ pathname: '/job-detail/[id]', params: { id: job._id } })
                    }
                    rebroadcasting={rebroadcastingId === job._id}
                  />
                )}
              </View>
            ),
          )
        )}

        {page < totalPages && (
          <View
            style={{
              alignItems: 'center',
              marginTop: 12,
              marginBottom: 20,
            }}
          >
            {isRefetching ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setPage(p => p + 1)}
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: COLORS.primaryLight,
                }}
              >
                <Text
                  style={{
                    fontSize: fs(13),
                    fontWeight: '700',
                    color: COLORS.primary,
                  }}
                >
                  {lang === 'en' ? 'Load more...' : 'Tải thêm đơn...'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
