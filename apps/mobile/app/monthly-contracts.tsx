import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, ChevronRight } from 'lucide-react-native';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import {
  useMonthlyContracts,
  type MonthlyContractItem,
  type MonthlyContractStatus,
} from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import { Badge, Card, COLORS, EmptyState, LoadingSpinner } from '@/components/ui';

dayjs.locale('vi');

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const fmt = (n?: number) => new Intl.NumberFormat('vi-VN').format(n ?? 0);

export const MONTHLY_STATUS_META: Record<
  MonthlyContractStatus,
  { label: string; bg: string; color: string }
> = {
  pending: { label: 'Chờ duyệt', bg: COLORS.warningLight, color: COLORS.warning },
  active: { label: 'Đang hiệu lực', bg: COLORS.successLight, color: COLORS.success },
  rejected: { label: 'Đã từ chối', bg: COLORS.errorLight, color: COLORS.error },
  cancelled: { label: 'Đã hủy', bg: COLORS.gray[100], color: COLORS.gray[500] },
  ended: { label: 'Đã kết thúc', bg: COLORS.gray[100], color: COLORS.gray[600] },
};

export function describeMonthlySchedule(c: MonthlyContractItem): string {
  const days = (c.schedule?.days_of_week ?? [])
    .map(d => WEEKDAY_LABELS[d] ?? '')
    .filter(Boolean)
    .join(', ');
  return `${days || '—'} · ${c.schedule?.time_start ?? ''}–${c.schedule?.time_end ?? ''}`;
}

export function personName(p: MonthlyContractItem['customer_id']): string {
  return typeof p === 'object' && p ? p.full_name ?? '—' : '—';
}

export default function MonthlyContractsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Vai trò hiện tại lấy từ auth store (active_role) như các màn hình dùng chung khác
  const user = useAuthStore(s => s.user);
  const isHelper = user?.active_role === 'helper';
  const { data: contracts, isLoading, isRefetching, refetch } = useMonthlyContracts(
    isHelper ? 'helper' : 'customer',
  );

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(isHelper ? '/(helper)/profile' : '/(customer)/profile');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
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
            Hợp đồng theo tháng 📅
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
            {isHelper
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
              borderRadius: 12,
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
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[COLORS.primary]} />
          }
        >
          {(contracts ?? []).length === 0 ? (
            <EmptyState
              emoji="📅"
              title="Chưa có hợp đồng theo tháng nào"
              subtitle={
                isHelper
                  ? 'Khi khách hàng mời bạn làm giúp việc theo tháng, hợp đồng sẽ hiện ở đây để bạn duyệt và điểm danh hằng ngày.'
                  : 'Thuê 1 thợ quen theo tháng với lịch cố định: thợ điểm danh từng buổi, cuối tháng chốt lương theo số buổi thực tế — minh bạch cho cả hai bên.'
              }
              action={isHelper ? undefined : 'Tạo hợp đồng mới'}
              onAction={
                isHelper ? undefined : () => router.push('/monthly-contract-create')
              }
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
                      <Text style={{ fontSize: 20 }}>📅</Text>
                      <Text
                        style={{ flex: 1, fontSize: 15.5, fontWeight: '800', color: COLORS.gray[900] }}
                        numberOfLines={1}
                      >
                        {c.title}
                      </Text>
                      <Badge label={meta.label} color={meta.bg} textColor={meta.color} />
                    </View>
                    <Text style={{ fontSize: 13, color: COLORS.gray[600] }}>
                      {isHelper ? 'Khách hàng' : 'Thợ'}: {personName(partner)} · Lương{' '}
                      {fmt(c.monthly_salary)}₫/tháng
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>
                      Lịch: {describeMonthlySchedule(c)} · Từ{' '}
                      {dayjs(c.start_date).format('DD/MM/YYYY')}
                      {c.end_date ? ` đến ${dayjs(c.end_date).format('DD/MM/YYYY')}` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ flex: 1, fontSize: 12.5, color: COLORS.primaryDark, fontWeight: '700' }}>
                        Xem chi tiết & điểm danh
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
