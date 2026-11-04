import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Pause,
  Play,
  SkipForward,
  Trash2,
  Plus,
  ChevronRight,
} from 'lucide-react-native';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import 'dayjs/locale/en';
import { Alert } from '@/components/common/app-alert';
import {
  useRecurringPlans,
  useRecurringPlanDetail,
  usePauseRecurringPlan,
  useResumeRecurringPlan,
  useSkipNextOccurrence,
  useCancelRecurringPlan,
  type RecurringPlanItem,
} from '@/hooks/use-api';
import { useTranslation } from '@/hooks/use-i18n';
import { Badge, Card, COLORS, EmptyState, LoadingSpinner } from '@/components/ui';

const WEEKDAY_LABELS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEEKDAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeSchedule(plan: RecurringPlanItem, lang: string = 'vi'): string {
  const labels = lang === 'en' ? WEEKDAY_LABELS_EN : WEEKDAY_LABELS_VI;
  if (plan.frequency === 'weekly') {
    const days = (plan.weekdays ?? [])
      .map(d => labels[d] ?? '')
      .filter(Boolean)
      .join(', ');
    return lang === 'en'
      ? `Weekly · ${days || '—'} · ${plan.time_start}`
      : `Hàng tuần · ${days || '—'} · ${plan.time_start}`;
  }
  const days = (plan.month_days ?? []).join(', ');
  return lang === 'en'
    ? `Monthly · day ${days || '—'} · ${plan.time_start}`
    : `Hàng tháng · ngày ${days || '—'} · ${plan.time_start}`;
}

function statusBadge(status: RecurringPlanItem['status'], lang: string = 'vi') {
  if (status === 'active')
    return (
      <Badge
        label={lang === 'en' ? 'Active' : 'Đang chạy'}
        color={COLORS.successLight}
        textColor={COLORS.success}
      />
    );
  if (status === 'paused')
    return (
      <Badge
        label={lang === 'en' ? 'Paused' : 'Tạm dừng'}
        color={COLORS.warningLight}
        textColor={COLORS.warning}
      />
    );
  return (
    <Badge
      label={lang === 'en' ? 'Cancelled' : 'Đã hủy'}
      color={COLORS.errorLight}
      textColor={COLORS.error}
    />
  );
}

export default function RecurringPlansScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, fs, lang, tService } = useTranslation();
  const { data: plans, isLoading, isRefetching, refetch } = useRecurringPlans();
  const pausePlan = usePauseRecurringPlan();
  const resumePlan = useResumeRecurringPlan();
  const skipNext = useSkipNextOccurrence();
  const cancelPlan = useCancelRecurringPlan();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(customer)/profile');
  };

  const confirm = (
    title: string,
    body: string,
    actionLabel: string,
    fn: () => void,
    destructive = false,
  ) =>
    Alert.alert(title, body, [
      { text: lang === 'en' ? 'Not now' : 'Để sau', style: 'cancel' },
      { text: actionLabel, style: destructive ? 'destructive' : 'default', onPress: fn },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleBack}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: COLORS.gray[100],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900] }}>
            {lang === 'en' ? 'My Recurring Plans 🔁' : 'Gói định kỳ của tôi 🔁'}
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
            {lang === 'en'
              ? 'Automated repeating service — no need to repost each time'
              : 'Việc lặp lại tự động — không cần đăng lại mỗi lần'}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() =>
            router.push({ pathname: '/(customer)/booking', params: { package_mode: 'recurring' } })
          }
          style={{
            backgroundColor: COLORS.primary,
            width: 38,
            height: 38,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plus size={22} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 110 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={[COLORS.primary]}
            />
          }
        >
          {(plans ?? []).length === 0 ? (
            <EmptyState
              emoji="🔁"
              title={lang === 'en' ? 'No recurring plans yet' : 'Chưa có gói định kỳ nào'}
              subtitle={
                lang === 'en'
                  ? 'Chores repeating weekly or monthly? Set up a recurring plan once and the system posts jobs automatically for each session — with option to prioritize preferred helpers.'
                  : 'Việc nhà lặp lại hàng tuần/hàng tháng? Tạo gói định kỳ một lần, hệ thống tự đăng đơn cho từng buổi — có thể ưu tiên thợ quen cho mọi buổi.'
              }
              action={lang === 'en' ? 'Create Recurring Plan' : 'Tạo gói định kỳ'}
              onAction={() =>
                router.push({
                  pathname: '/(customer)/booking',
                  params: { package_mode: 'recurring' },
                })
              }
            />
          ) : (
            (plans ?? []).map(plan => {
              const service =
                typeof plan.service_id === 'object' && plan.service_id ? plan.service_id : null;
              const helper =
                typeof plan.preferred_helper_id === 'object' && plan.preferred_helper_id
                  ? plan.preferred_helper_id
                  : null;
              const expanded = expandedId === plan._id;
              return (
                <Card key={plan._id} style={{ gap: 10 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setExpandedId(expanded ? null : plan._id)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 20 }}>{service?.icon ?? '🔁'}</Text>
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 15.5,
                          fontWeight: '800',
                          color: COLORS.gray[900],
                        }}
                        numberOfLines={1}
                      >
                        {plan.title}
                      </Text>
                      {statusBadge(plan.status, lang)}
                    </View>
                    <Text style={{ fontSize: 13, color: COLORS.gray[600], marginTop: 6 }}>
                      {describeSchedule(plan, lang)}
                      {plan.duration_hours
                        ? lang === 'en'
                          ? ` · ${plan.duration_hours} hrs/session`
                          : ` · ${plan.duration_hours} giờ/buổi`
                        : ''}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[500], marginTop: 2 }}>
                      {(tService(service) || (lang === 'en' ? 'Service' : 'Dịch vụ')) +
                        (lang === 'en'
                          ? ` · ${plan.jobs_generated || 0} ${plan.jobs_generated === 1 ? 'job' : 'jobs'} created`
                          : ` · Đã sinh ${plan.jobs_generated || 0} đơn`)}
                      {helper
                        ? lang === 'en'
                          ? ` · Preferred helper: ${helper.full_name ?? ''}`
                          : ` · Thợ quen: ${helper.full_name ?? ''}`
                        : ''}
                    </Text>
                    {plan.status === 'active' &&
                      plan.next_occurrence_at &&
                      !dayjs(plan.next_occurrence_at).isBefore(dayjs().subtract(1, 'hour')) && (
                        <Text
                          style={{
                            fontSize: 12.5,
                            color: COLORS.primaryDark,
                            fontWeight: '700',
                            marginTop: 2,
                          }}
                        >
                          {lang === 'en' ? 'Next session: ' : 'Buổi tới: '}
                          {dayjs(plan.next_occurrence_at)
                            .locale(lang === 'en' ? 'en' : 'vi')
                            .format('dddd, DD/MM/YYYY HH:mm')}
                        </Text>
                      )}
                  </TouchableOpacity>

                  {expanded && <PlanDetail planId={plan._id} lang={lang} />}

                  {plan.status !== 'cancelled' && (
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      {plan.status === 'active' ? (
                        <ActionChip
                          icon={<Pause size={14} color={COLORS.gray[700]} />}
                          label={lang === 'en' ? 'Pause' : 'Tạm dừng'}
                          onPress={() =>
                            confirm(
                              lang === 'en' ? 'Pause plan?' : 'Tạm dừng gói?',
                              lang === 'en'
                                ? 'The system will stop generating new jobs. Already created jobs will remain.'
                                : 'Hệ thống sẽ ngừng sinh đơn mới. Các đơn đã sinh vẫn giữ nguyên.',
                              lang === 'en' ? 'Pause' : 'Tạm dừng',
                              () => pausePlan.mutate(plan._id),
                            )
                          }
                        />
                      ) : (
                        <ActionChip
                          icon={<Play size={14} color={COLORS.primaryDark} />}
                          label={lang === 'en' ? 'Resume' : 'Tiếp tục'}
                          onPress={() => resumePlan.mutate(plan._id)}
                        />
                      )}
                      {plan.status === 'active' && (
                        <ActionChip
                          icon={<SkipForward size={14} color={COLORS.gray[700]} />}
                          label={lang === 'en' ? 'Skip next session' : 'Bỏ qua buổi tới'}
                          onPress={() =>
                            confirm(
                              lang === 'en' ? 'Skip next session?' : 'Bỏ qua buổi tới?',
                              lang === 'en'
                                ? 'The upcoming session will not occur (its job will be cancelled if not yet accepted by a helper).'
                                : 'Buổi gần nhất sẽ không diễn ra (đơn của buổi đó nếu đã sinh và chưa có thợ chốt sẽ bị hủy).',
                              lang === 'en' ? 'Skip session' : 'Bỏ qua buổi',
                              () => skipNext.mutate(plan._id),
                            )
                          }
                        />
                      )}
                      <ActionChip
                        icon={<Trash2 size={14} color={COLORS.error} />}
                        label={lang === 'en' ? 'Cancel plan' : 'Hủy gói'}
                        danger
                        onPress={() =>
                          confirm(
                            lang === 'en' ? 'Cancel recurring plan?' : 'Hủy gói định kỳ?',
                            lang === 'en'
                              ? 'Future unassigned jobs will be cancelled. This action cannot be undone.'
                              : 'Các đơn tương lai chưa có thợ chốt sẽ bị hủy theo. Thao tác này không khôi phục được.',
                            lang === 'en' ? 'Cancel plan' : 'Hủy gói',
                            () => cancelPlan.mutate(plan._id),
                            true,
                          )
                        }
                      />
                    </View>
                  )}
                </Card>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ActionChip({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: danger ? COLORS.errorLight : COLORS.gray[100],
      }}
    >
      {icon}
      <Text
        style={{
          fontSize: 12.5,
          fontWeight: '700',
          color: danger ? COLORS.error : COLORS.gray[700],
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function PlanDetail({ planId, lang = 'vi' }: { planId: string; lang?: string }) {
  const router = useRouter();
  const { data, isLoading } = useRecurringPlanDetail(planId);
  if (isLoading) return <LoadingSpinner size="small" />;
  const jobs = data?.jobs ?? [];
  if (jobs.length === 0) {
    return (
      <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>
        {lang === 'en'
          ? 'No jobs generated from this plan yet.'
          : 'Chưa có đơn nào được sinh từ gói này.'}
      </Text>
    );
  }
  return (
    <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: COLORS.gray[100], paddingTop: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.gray[800] }}>
        {lang === 'en' ? 'Generated Jobs' : 'Các đơn đã sinh'}
      </Text>
      {jobs.slice(0, 8).map((job: any) => (
        <TouchableOpacity
          key={job._id}
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: '/job-detail/[id]', params: { id: job._id } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
        >
          <Text style={{ flex: 1, fontSize: 13, color: COLORS.gray[700] }}>
            📅 {job.occurrence_date ?? dayjs(job.preferred_date).format('DD/MM/YYYY')} ·{' '}
            {job.preferred_time_start ?? ''}
          </Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.gray[500] }}>
            {job.status}
          </Text>
          <ChevronRight size={15} color={COLORS.gray[400]} />
        </TouchableOpacity>
      ))}
    </View>
  );
}
