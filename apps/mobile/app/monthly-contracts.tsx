import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { formatDate } from '@/utils/date-format';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, ChevronRight, Calendar } from 'lucide-react-native';
import {
  useMonthlyContracts,
  type MonthlyContractItem,
  type MonthlyContractStatus,
} from '@/hooks/use-api';
import { useMonthlyContractSocket } from '@/hooks/use-socket';
import { useAuthStore } from '@/stores/auth.store';
import { useTranslation } from '@/hooks/use-i18n';
import { Badge, Card, COLORS, EmptyState, LoadingSpinner, useThemeColors } from '@/components/ui';

const WEEKDAY_LABELS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEEKDAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmt = (n?: number, l: string = 'vi') =>
  new Intl.NumberFormat(l === 'en' ? 'en-US' : 'vi-VN').format(n ?? 0);

export const MONTHLY_STATUS_META: Record<
  MonthlyContractStatus,
  { label: string; label_en: string; bg: string; color: string }
> = {
  pending: {
    label: 'Chờ duyệt',
    label_en: 'Pending',
    bg: COLORS.warningLight,
    color: COLORS.warning,
  },
  active: {
    label: 'Đang hiệu lực',
    label_en: 'Active',
    bg: COLORS.successLight,
    color: COLORS.success,
  },
  rejected: {
    label: 'Đã từ chối',
    label_en: 'Rejected',
    bg: COLORS.errorLight,
    color: COLORS.error,
  },
  cancelled: {
    label: 'Đã hủy',
    label_en: 'Cancelled',
    bg: COLORS.gray[100],
    color: COLORS.gray[500],
  },
  ended: { label: 'Đã kết thúc', label_en: 'Ended', bg: COLORS.gray[100], color: COLORS.gray[600] },
};

export function describeMonthlySchedule(c: MonthlyContractItem, lang?: string): string {
  const labels = lang === 'en' ? WEEKDAY_LABELS_EN : WEEKDAY_LABELS_VI;
  const days = (c.schedule?.days_of_week ?? [])
    .map(d => labels[d] ?? '')
    .filter(Boolean)
    .join(', ');
  return `${days || '—'} · ${c.schedule?.time_start ?? ''}–${c.schedule?.time_end ?? ''}`;
}

export function personName(p: MonthlyContractItem['customer_id']): string {
  return typeof p === 'object' && p ? (p.full_name ?? '—') : '—';
}

export default function MonthlyContractsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();
  const fmt = (n?: number) =>
    new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(n ?? 0);
  // Vai trò hiện tại lấy từ auth store (active_role) như các màn hình dùng chung khác
  const user = useAuthStore(s => s.user);
  const isHelper = user?.active_role === 'helper';

  // A85: Lắng nghe socket event cập nhật hợp đồng tháng tức thì
  useMonthlyContractSocket();
  const {
    data: contracts,
    isLoading,
    isRefetching,
    refetch,
  } = useMonthlyContracts(isHelper ? 'helper' : 'customer');

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(isHelper ? '/(helper)/profile' : '/(customer)/profile');
  };

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleBack}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            backgroundColor: tc.subtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fs(18), fontWeight: '800', color: tc.text }}>
            {lang === 'en' ? 'Monthly Contracts' : 'Hợp đồng theo tháng'}
          </Text>
          <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
            {lang === 'en'
              ? isHelper
                ? 'Long-term helper contracts you are handling'
                : 'Hire a dedicated monthly helper — check-in & finalize wages in app'
              : isHelper
                ? 'Các hợp đồng giúp việc dài hạn bạn đang thực hiện'
                : 'Thuê 1 thợ cố định theo tháng — điểm danh & chốt lương trong app'}
          </Text>
        </View>
        {!isHelper && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/monthly-contract-create')}
            style={{
              backgroundColor: COLORS.primary,
              width: 38,
              height: 38,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={22} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        )}
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
          {(contracts ?? []).length === 0 ? (
            <EmptyState
              icon={<Calendar size={36} color={COLORS.gray[400]} />}
              title={lang === 'en' ? 'No monthly contracts yet' : 'Chưa có hợp đồng theo tháng nào'}
              subtitle={
                lang === 'en'
                  ? isHelper
                    ? 'When customers invite you for monthly home services, contracts will appear here for your review and daily attendance.'
                    : 'Hire a regular helper monthly on a fixed schedule: helper checks in each session, wages finalized monthly based on actual sessions — transparent for both parties.'
                  : isHelper
                    ? 'Khi khách hàng mời bạn làm giúp việc theo tháng, hợp đồng sẽ hiện ở đây để bạn duyệt và điểm danh hằng ngày.'
                    : 'Thuê 1 thợ quen theo tháng với lịch cố định: thợ điểm danh từng buổi, cuối tháng chốt lương theo số buổi thực tế — minh bạch cho cả hai bên.'
              }
              action={
                isHelper ? undefined : lang === 'en' ? 'Create new contract' : 'Tạo hợp đồng mới'
              }
              onAction={isHelper ? undefined : () => router.push('/monthly-contract-create')}
            />
          ) : (
            (contracts ?? []).map(c => {
              const meta = MONTHLY_STATUS_META[c.status];
              const partner = isHelper ? c.customer_id : c.helper_id;
              return (
                <TouchableOpacity
                  key={c._id}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({ pathname: '/monthly-contract/[id]', params: { id: c._id } })
                  }
                >
                  <Card style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Calendar size={20} color={COLORS.primary} />
                      <Text
                        style={{
                          flex: 1,
                          fontSize: fs(15.5),
                          fontWeight: '800',
                          color: tc.text,
                        }}
                        numberOfLines={1}
                      >
                        {c.title}
                      </Text>
                      <Badge
                        label={lang === 'en' ? meta.label_en : meta.label}
                        color={meta.bg}
                        textColor={meta.color}
                      />
                    </View>
                    <Text style={{ fontSize: fs(13), color: tc.textSecondary }}>
                      {isHelper
                        ? lang === 'en'
                          ? 'Customer'
                          : 'Khách hàng'
                        : lang === 'en'
                          ? 'Helper'
                          : 'Thợ'}
                      : {personName(partner)} · {lang === 'en' ? 'Salary ' : 'Lương '}
                      {fmt(c.monthly_salary)}₫/{lang === 'en' ? 'month' : 'tháng'}
                    </Text>
                    <Text style={{ fontSize: fs(12.5), color: tc.textMuted }}>
                      {lang === 'en' ? 'Schedule: ' : 'Lịch: '}
                      {describeMonthlySchedule(c, lang)} · {lang === 'en' ? 'From ' : 'Từ '}
                      {formatDate(c.start_date)}
                      {c.end_date
                        ? lang === 'en'
                          ? ` to ${formatDate(c.end_date)}`
                          : ` đến ${formatDate(c.end_date)}`
                        : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text
                        style={{
                          flex: 1,
                          fontSize: fs(12.5),
                          color: COLORS.primaryDark,
                          fontWeight: '700',
                        }}
                      >
                        {lang === 'en' ? 'View details & attendance' : 'Xem chi tiết & điểm danh'}
                      </Text>
                      <ChevronRight size={15} color={COLORS.gray[400]} />
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
