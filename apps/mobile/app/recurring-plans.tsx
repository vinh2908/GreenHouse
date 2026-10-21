import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Pause, Play, SkipForward, Trash2, Plus, ChevronRight } from 'lucide-react-native';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
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
import { Badge, Card, COLORS, EmptyState, LoadingSpinner } from '@/components/ui';

dayjs.locale('vi');

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function describeSchedule(plan: RecurringPlanItem): string {
  if (plan.frequency === 'weekly') {
    const days = (plan.weekdays ?? []).map(d => WEEKDAY_LABELS[d] ?? '').filter(Boolean).join(', ');
    return `Hàng tuần · ${days || '—'} · ${plan.time_start}`;
  }
  const days = (plan.month_days ?? []).join(', ');
  return `Hàng tháng · ngày ${days || '—'} · ${plan.time_start}`;
}

function statusBadge(status: RecurringPlanItem['status']) {
  if (status === 'active')
    return <Badge label="Đang chạy" color={COLORS.successLight} textColor={COLORS.success} />;
  if (status === 'paused')
    return <Badge label="Tạm dừng" color={COLORS.warningLight} textColor={COLORS.warning} />;
  return <Badge label="Đã hủy" color={COLORS.errorLight} textColor={COLORS.error} />;
}

export default function RecurringPlansScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const confirm = (title: string, body: string, actionLabel: string, fn: () => void, destructive = false) =>
    Alert.alert(title, body, [
      { text: 'Để sau', style: 'cancel' },
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
            Gói định kỳ của tôi 🔁
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
            Việc lặp lại tự động — không cần đăng lại mỗi lần
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
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[COLORS.primary]} />
          }
        >
          {(plans ?? []).length === 0 ? (
            <EmptyState
              emoji="🔁"
              title="Chưa có gói định kỳ nào"
              subtitle="Việc nhà lặp lại hàng tuần/hàng tháng? Tạo gói định kỳ một lần, hệ thống tự đăng đơn cho từng buổi — có thể ưu tiên thợ quen cho mọi buổi."
              action="Tạo gói định kỳ"
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
                        style={{ flex: 1, fontSize: 15.5, fontWeight: '800', color: COLORS.gray[900] }}
                        numberOfLines={1}
                      >
                        {plan.title}
                      </Text>
                      {statusBadge(plan.status)}
                    </View>
                    <Text style={{ fontSize: 13, color: COLORS.gray[600], marginTop: 6 }}>
                      {describeSchedule(plan)}
                      {plan.duration_hours ? ` · ${plan.duration_hours} giờ/buổi` : ''}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[500], marginTop: 2 }}>
                      {service?.name ?? 'Dịch vụ'} · Đã sinh {plan.jobs_generated} đơn
                      {helper ? ` · Thợ quen: ${helper.full_name ?? ''}` : ''}
                    </Text>
                    {plan.status === 'active' && plan.next_occurrence_at && (
                      <Text style={{ fontSize: 12.5, color: COLORS.primaryDark, fontWeight: '700', marginTop: 2 }}>
                        Buổi tới: {dayjs(plan.next_occurrence_at).format('dddd, DD/MM/YYYY HH:mm')}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {expanded && <PlanDetail planId={plan._id} />}

                  {plan.status !== 'cancelled' && (
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      {plan.status === 'active' ? (
                        <ActionChip
                          icon={<Pause size={14} color={COLORS.gray[700]} />}
                          label="Tạm dừng"
                          onPress={() =>
                            confirm('Tạm dừng gói?', 'Hệ thống sẽ ngừng sinh đơn mới. Các đơn đã sinh vẫn giữ nguyên.', 'Tạm dừng', () =>
                              pausePlan.mutate(plan._id),
                            )
                          }
                        />
                      ) : (
                        <ActionChip
                          icon={<Play size={14} color={COLORS.primaryDark} />}
                          label="Tiếp tục"
                          onPress={() => resumePlan.mutate(plan._id)}
                        />
                      )}
                      {plan.status === 'active' && (
                        <ActionChip
                          icon={<SkipForward size={14} color={COLORS.gray[700]} />}
                          label="Bỏ qua buổi tới"
                          onPress={() =>
                            confirm('Bỏ qua buổi tới?', 'Buổi gần nhất sẽ không diễn ra (đơn của buổi đó nếu đã sinh và chưa có thợ chốt sẽ bị hủy).', 'Bỏ qua buổi', () =>
                              skipNext.mutate(plan._id),
                            )
                          }
                        />
                      )}
                      <ActionChip
                        icon={<Trash2 size={14} color={COLORS.error} />}
                        label="Hủy gói"
                        danger
                        onPress={() =>
                          confirm('Hủy gói định kỳ?', 'Các đơn tương lai chưa có thợ chốt sẽ bị hủy theo. Thao tác này không khôi phục được.', 'Hủy gói', () =>
                            cancelPlan.mutate(plan._id),
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

function PlanDetail({ planId }: { planId: string }) {
  const router = useRouter();
  const { data, isLoading } = useRecurringPlanDetail(planId);
  if (isLoading) return <LoadingSpinner size="small" />;
  const jobs = data?.jobs ?? [];
  if (jobs.length === 0) {
    return (
      <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>
        Chưa có đơn nào được sinh từ gói này.
      </Text>
    );
  }
  return (
    <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: COLORS.gray[100], paddingTop: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.gray[800] }}>
        Các đơn đã sinh
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
          <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.gray[500] }}>{job.status}</Text>
          <ChevronRight size={15} color={COLORS.gray[400]} />
        </TouchableOpacity>
      ))}
    </View>
  );
}
