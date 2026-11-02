import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, MapPin } from 'lucide-react-native';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import Toast from 'react-native-toast-message';
import { Alert } from '@/components/common/app-alert';
import { useAuthStore } from '@/stores/auth.store';
import {
  useMonthlyContract,
  useRespondMonthlyContract,
  useCancelMonthlyContract,
  useEndMonthlyContract,
  useMonthlyAttendance,
  useCheckinMonthly,
  useConfirmAttendance,
  useMonthlyLeaveRequests,
  useRequestLeave,
  useRespondLeave,
  useMonthlySettlement,
  useSettleMonth,
  type AttendanceStatus,
} from '@/hooks/use-api';
import { Badge, Button, Card, COLORS, LoadingSpinner } from '@/components/ui';
import { MONTHLY_STATUS_META, describeMonthlySchedule, personName } from '../monthly-contracts';

dayjs.locale('vi');

const fmt = (n?: number) => new Intl.NumberFormat('vi-VN').format(n ?? 0);

const ATT_META: Record<AttendanceStatus, { label: string; bg: string; color: string }> = {
  checked_in: {
    label: 'Đã điểm danh — chờ xác nhận',
    bg: COLORS.warningLight,
    color: COLORS.warning,
  },
  confirmed: { label: 'Đã xác nhận có mặt', bg: COLORS.successLight, color: COLORS.success },
  absent: { label: 'Vắng', bg: COLORS.errorLight, color: COLORS.error },
  leave: { label: 'Nghỉ phép', bg: '#EFF6FF', color: '#2563EB' },
};

const LEAVE_META: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Chờ duyệt', bg: COLORS.warningLight, color: COLORS.warning },
  approved: { label: 'Đã duyệt', bg: COLORS.successLight, color: COLORS.success },
  rejected: { label: 'Đã từ chối', bg: COLORS.errorLight, color: COLORS.error },
};

export default function MonthlyContractDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore(s => s.user);
  const isHelper = user?.active_role === 'helper';

  const currentMonth = dayjs().format('YYYY-MM');
  const [month, setMonth] = useState(currentMonth);

  const { data: contract, isLoading, refetch, isRefetching } = useMonthlyContract(id);
  const { data: attendance } = useMonthlyAttendance(id, month);
  const { data: leaves } = useMonthlyLeaveRequests(id);
  const { data: settlement } = useMonthlySettlement(
    id,
    contract && (contract.status === 'active' || contract.status === 'ended') ? month : undefined,
  );

  const respond = useRespondMonthlyContract();
  const cancel = useCancelMonthlyContract();
  const end = useEndMonthlyContract();
  const checkin = useCheckinMonthly();
  const confirmAtt = useConfirmAttendance();
  const requestLeave = useRequestLeave();
  const respondLeave = useRespondLeave();
  const settle = useSettleMonth();

  const [leaveDate, setLeaveDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');

  const recordByDate = useMemo(() => {
    const map = new Map<string, AttendanceStatus>();
    (attendance?.records ?? []).forEach(r => map.set(r.date, r.status));
    return map;
  }, [attendance]);

  const todayStr = attendance?.today ?? dayjs().format('YYYY-MM-DD');
  const todayRecord = recordByDate.get(todayStr);
  const isScheduledToday =
    (attendance?.scheduled_dates ?? []).includes(todayStr) && month === currentMonth;

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/monthly-contracts');
  };

  const confirmDialog = (
    title: string,
    body: string,
    label: string,
    fn: () => void,
    destructive = false,
  ) =>
    Alert.alert(title, body, [
      { text: 'Để sau', style: 'cancel' },
      { text: label, style: destructive ? 'destructive' : 'default', onPress: fn },
    ]);

  const handleRequestLeave = async () => {
    if (!id) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(leaveDate.trim())) {
      Toast.show({ type: 'error', text1: 'Ngày nghỉ phải có dạng YYYY-MM-DD (VD: 2026-11-05)' });
      return;
    }
    if (leaveReason.trim().length < 3) {
      Toast.show({ type: 'error', text1: 'Vui lòng nhập lý do xin nghỉ' });
      return;
    }
    try {
      await requestLeave.mutateAsync({ id, date: leaveDate.trim(), reason: leaveReason.trim() });
      setLeaveDate('');
      setLeaveReason('');
    } catch {
      // Toast lỗi đã hiển thị bởi hook
    }
  };

  if (isLoading || !contract) return <LoadingSpinner />;

  const meta = MONTHLY_STATUS_META[contract.status];
  const partner = isHelper ? contract.customer_id : contract.helper_id;
  const isActive = contract.status === 'active';
  const pendingLeaves = (leaves ?? []).filter(l => l.status === 'pending');

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
          <Text
            style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900] }}
            numberOfLines={1}
          >
            {contract.title}
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
            Hợp đồng giúp việc theo tháng
          </Text>
        </View>
        <Badge label={meta.label} color={meta.bg} textColor={meta.color} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[COLORS.primary]} />
        }
      >
        {/* ── Thông tin hợp đồng ── */}
        <Card style={{ gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
            📋 Thông tin hợp đồng
          </Text>
          <InfoRow label={isHelper ? 'Khách hàng' : 'Thợ thực hiện'} value={personName(partner)} />
          <InfoRow label="Lương tháng" value={`${fmt(contract.monthly_salary)}₫`} strong />
          <InfoRow
            label="Phí sàn"
            value={`${contract.platform_fee_percent ?? 15}% (trừ khi chốt lương)`}
          />
          <InfoRow label="Lịch làm việc" value={describeMonthlySchedule(contract)} />
          <InfoRow
            label="Thời gian"
            value={`${dayjs(contract.start_date).format('DD/MM/YYYY')}${
              contract.end_date
                ? ` → ${dayjs(contract.end_date).format('DD/MM/YYYY')}`
                : ' → Chưa ấn định ngày kết thúc'
            }`}
          />
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
            <MapPin size={14} color={COLORS.gray[500]} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, fontSize: 13, color: COLORS.gray[700], lineHeight: 19 }}>
              {contract.address.full_address}, {contract.address.district}, {contract.address.city}
              {contract.address.notes ? ` (${contract.address.notes})` : ''}
            </Text>
          </View>
          {contract.end_reason && (
            <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>
              Lý do kết thúc/hủy: {contract.end_reason}
            </Text>
          )}
        </Card>

        {/* ── Hành động theo vai trò & trạng thái ── */}
        {isHelper && contract.status === 'pending' && (
          <Card style={{ gap: 8 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '800', color: COLORS.gray[900] }}>
              Khách hàng đang mời bạn ký hợp đồng này
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                title="Từ chối"
                variant="outline"
                style={{ flex: 1 }}
                loading={respond.isPending}
                onPress={() =>
                  confirmDialog(
                    'Từ chối hợp đồng?',
                    'Khách hàng sẽ được thông báo.',
                    'Từ chối',
                    () =>
                      respond.mutate({
                        id: contract._id,
                        path: 'respond',
                        body: { accept: false },
                      }),
                  )
                }
              />
              <Button
                title="Đồng ý nhận"
                style={{ flex: 1 }}
                loading={respond.isPending}
                onPress={() =>
                  confirmDialog(
                    'Đồng ý hợp đồng?',
                    'Hợp đồng sẽ có hiệu lực ngay. Bạn cần điểm danh đúng các buổi theo lịch.',
                    'Đồng ý',
                    () =>
                      respond.mutate({ id: contract._id, path: 'respond', body: { accept: true } }),
                  )
                }
              />
            </View>
          </Card>
        )}

        {isHelper && isActive && (
          <Card style={{ gap: 8 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '800', color: COLORS.gray[900] }}>
              🟢 Điểm danh hôm nay ({dayjs().format('DD/MM/YYYY')})
            </Text>
            {todayRecord ? (
              <Text style={{ fontSize: 13, color: COLORS.gray[600] }}>
                Trạng thái hôm nay: {ATT_META[todayRecord].label}
              </Text>
            ) : isScheduledToday ? (
              <Button
                title="Điểm danh buổi hôm nay"
                loading={checkin.isPending}
                onPress={() => checkin.mutate(contract._id)}
              />
            ) : (
              <Text style={{ fontSize: 13, color: COLORS.gray[600] }}>
                Hôm nay không nằm trong lịch làm việc của hợp đồng.
              </Text>
            )}
          </Card>
        )}

        {(contract.status === 'pending' || isActive) && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title="Hủy hợp đồng"
              variant="danger"
              style={{ flex: 1 }}
              loading={cancel.isPending}
              onPress={() =>
                confirmDialog(
                  'Hủy hợp đồng?',
                  'Hợp đồng sẽ dừng ngay và bên còn lại được thông báo.',
                  'Hủy hợp đồng',
                  () => cancel.mutate({ id: contract._id, path: 'cancel' }),
                  true,
                )
              }
            />
            {isActive && (
              <Button
                title="Kết thúc hợp đồng"
                variant="outline"
                style={{ flex: 1 }}
                loading={end.isPending}
                onPress={() =>
                  confirmDialog(
                    'Kết thúc hợp đồng?',
                    'Bạn vẫn có thể chốt lương các tháng chưa chốt sau khi kết thúc.',
                    'Kết thúc',
                    () => end.mutate({ id: contract._id, path: 'end', body: {} }),
                    true,
                  )
                }
              />
            )}
          </View>
        )}

        {/* ── Điểm danh theo tháng ── */}
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
              📆 Điểm danh tháng {dayjs(`${month}-01`).format('MM/YYYY')}
            </Text>
            <TouchableOpacity
              onPress={() => setMonth(dayjs(`${month}-01`).subtract(1, 'month').format('YYYY-MM'))}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: COLORS.gray[100],
              }}
            >
              <Text style={{ fontWeight: '800', color: COLORS.gray[700] }}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={month >= currentMonth}
              onPress={() => setMonth(dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM'))}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: COLORS.gray[100],
                opacity: month >= currentMonth ? 0.4 : 1,
              }}
            >
              <Text style={{ fontWeight: '800', color: COLORS.gray[700] }}>›</Text>
            </TouchableOpacity>
          </View>

          {(attendance?.scheduled_dates ?? []).length === 0 ? (
            <Text style={{ fontSize: 13, color: COLORS.gray[500] }}>
              Tháng này không có buổi làm nào theo lịch của hợp đồng.
            </Text>
          ) : (
            (attendance?.scheduled_dates ?? []).map(date => {
              const st = recordByDate.get(date);
              const isToday = date === todayStr;
              const isPast = date < todayStr;
              return (
                <View
                  key={date}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 7,
                    borderTopWidth: 1,
                    borderTopColor: COLORS.gray[100],
                  }}
                >
                  <Text
                    style={{ width: 118, fontSize: 13, fontWeight: '700', color: COLORS.gray[800] }}
                  >
                    {dayjs(date).format('ddd, DD/MM')}
                    {isToday ? ' • Hôm nay' : ''}
                  </Text>
                  <View style={{ flex: 1 }}>
                    {st ? (
                      <Badge
                        label={ATT_META[st].label}
                        color={ATT_META[st].bg}
                        textColor={ATT_META[st].color}
                      />
                    ) : (
                      <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>
                        {isPast ? 'Không có điểm danh (tính vắng khi chốt lương)' : 'Chưa tới'}
                      </Text>
                    )}
                  </View>
                  {!isHelper && st === 'checked_in' && (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => confirmAtt.mutate({ id: contract._id, date, approve: true })}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 8,
                          backgroundColor: COLORS.success,
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                          Có mặt
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() =>
                          confirmAtt.mutate({ id: contract._id, date, approve: false })
                        }
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 8,
                          backgroundColor: COLORS.error,
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Vắng</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </Card>

        {/* ── Xin nghỉ ── */}
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
            🌴 Đơn xin nghỉ
          </Text>
          {(leaves ?? []).length === 0 && (
            <Text style={{ fontSize: 13, color: COLORS.gray[500] }}>Chưa có đơn xin nghỉ nào.</Text>
          )}
          {(leaves ?? []).slice(0, 6).map(l => {
            const m = LEAVE_META[l.status];
            return (
              <View
                key={l._id}
                style={{
                  gap: 4,
                  borderTopWidth: 1,
                  borderTopColor: COLORS.gray[100],
                  paddingTop: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text
                    style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: COLORS.gray[800] }}
                  >
                    Nghỉ ngày {dayjs(l.date).format('DD/MM/YYYY')}
                  </Text>
                  <Badge label={m.label} color={m.bg} textColor={m.color} />
                </View>
                <Text style={{ fontSize: 12.5, color: COLORS.gray[600] }}>Lý do: {l.reason}</Text>
                {!isHelper && l.status === 'pending' && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                    <Button
                      title="Duyệt nghỉ"
                      size="sm"
                      style={{ flex: 1 }}
                      loading={respondLeave.isPending}
                      onPress={() =>
                        respondLeave.mutate({ id: contract._id, leaveId: l._id, approve: true })
                      }
                    />
                    <Button
                      title="Từ chối"
                      size="sm"
                      variant="outline"
                      style={{ flex: 1 }}
                      loading={respondLeave.isPending}
                      onPress={() =>
                        respondLeave.mutate({ id: contract._id, leaveId: l._id, approve: false })
                      }
                    />
                  </View>
                )}
              </View>
            );
          })}
          {pendingLeaves.length > 0 && isHelper && (
            <Text style={{ fontSize: 12.5, color: COLORS.warning }}>
              Bạn có {pendingLeaves.length} đơn đang chờ khách duyệt.
            </Text>
          )}

          {isHelper && isActive && (
            <View
              style={{
                gap: 8,
                borderTopWidth: 1,
                borderTopColor: COLORS.gray[100],
                paddingTop: 10,
              }}
            >
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: COLORS.gray[800] }}>
                Xin nghỉ 1 buổi
              </Text>
              <TextInput
                value={leaveDate}
                onChangeText={setLeaveDate}
                placeholder="Ngày nghỉ (YYYY-MM-DD), VD: 2026-11-05"
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.gray[200],
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  backgroundColor: '#fff',
                }}
              />
              <TextInput
                value={leaveReason}
                onChangeText={setLeaveReason}
                placeholder="Lý do xin nghỉ…"
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.gray[200],
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  backgroundColor: '#fff',
                }}
              />
              <Button
                title="Gửi đơn xin nghỉ"
                variant="outline"
                loading={requestLeave.isPending}
                onPress={handleRequestLeave}
              />
            </View>
          )}
        </Card>

        {/* ── Chốt lương ── */}
        {(isActive || contract.status === 'ended') && (
          <Card style={{ gap: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
              💰 Chốt lương tháng {dayjs(`${month}-01`).format('MM/YYYY')}
            </Text>
            {settlement ? (
              <>
                <InfoRow label="Số buổi theo lịch" value={`${settlement.scheduled_days} buổi`} />
                <InfoRow label="Buổi đã xác nhận" value={`${settlement.confirmed_days} buổi`} />
                <InfoRow label="Buổi nghỉ phép" value={`${settlement.leave_days} buổi`} />
                <InfoRow label="Buổi vắng" value={`${settlement.absent_days} buổi`} />
                <InfoRow
                  label="Lương theo buổi thực tế"
                  value={`${fmt(settlement.gross_amount)}₫`}
                />
                <InfoRow
                  label={`Phí sàn (${contract.platform_fee_percent ?? 15}%)`}
                  value={`−${fmt(settlement.platform_fee)}₫`}
                />
                <InfoRow
                  label="Thợ thực nhận"
                  value={`${fmt(settlement.helper_receives)}₫`}
                  strong
                />
                {settlement.status === 'settled' ? (
                  <Badge
                    label={`✅ Đã chốt lương${settlement.settled_at ? ` · ${dayjs(settlement.settled_at).format('DD/MM/YYYY HH:mm')}` : ''}`}
                    color={COLORS.successLight}
                    textColor={COLORS.success}
                  />
                ) : !isHelper ? (
                  <Button
                    title="Chốt lương tháng này"
                    loading={settle.isPending}
                    onPress={() =>
                      confirmDialog(
                        'Chốt lương tháng này?',
                        `Thợ sẽ nhận ${fmt(settlement.helper_receives)}₫ vào ví (đã trừ phí sàn). Tháng này sẽ không chốt lại được.`,
                        'Chốt lương',
                        () => settle.mutate({ id: contract._id, month }),
                      )
                    }
                  />
                ) : (
                  <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>
                    Khách hàng sẽ chốt lương sau khi xác nhận đủ các buổi trong tháng.
                  </Text>
                )}
              </>
            ) : (
              <Text style={{ fontSize: 13, color: COLORS.gray[500] }}>Đang tải số liệu…</Text>
            )}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={{ width: 130, fontSize: 13, color: COLORS.gray[500] }}>{label}</Text>
      <Text
        style={{
          flex: 1,
          fontSize: 13.5,
          color: strong ? COLORS.gray[900] : COLORS.gray[700],
          fontWeight: strong ? '800' : '600',
        }}
      >
        {value}
      </Text>
    </View>
  );
}
