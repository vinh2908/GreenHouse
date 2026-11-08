import { useMemo, useState } from 'react';
import {
  formatDate,
  formatDateTime,
  formatMonthKey,
  formatMonthSlash,
  formatShortDay,
  toVnDayjs,
  vnDateKey,
  vnNow,
} from '@/utils/date-format';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
} from 'react-native';
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
import { Badge, Button, Card, COLORS, LoadingSpinner, useThemeColors } from '@/components/ui';
import { useTranslation } from '@/hooks/use-i18n';
import { useMonthlyContractSocket } from '@/hooks/use-socket';
import { MONTHLY_STATUS_META, describeMonthlySchedule, personName } from '../monthly-contracts';

const fmt = (n?: number, l: string = 'vi') =>
  new Intl.NumberFormat(l === 'en' ? 'en-US' : 'vi-VN').format(n ?? 0);

const ATT_META: Record<
  AttendanceStatus,
  { label: string; label_en: string; bg: string; color: string }
> = {
  checked_in: {
    label: 'Đã điểm danh — chờ xác nhận',
    label_en: 'Checked in — pending',
    bg: COLORS.warningLight,
    color: COLORS.warning,
  },
  confirmed: {
    label: 'Đã xác nhận có mặt',
    label_en: 'Confirmed present',
    bg: COLORS.successLight,
    color: COLORS.success,
  },
  absent: { label: 'Vắng', label_en: 'Absent', bg: COLORS.errorLight, color: COLORS.error },
  leave: { label: 'Nghỉ phép', label_en: 'On leave', bg: '#EFF6FF', color: '#2563EB' },
};

const LEAVE_META: Record<string, { label: string; label_en: string; bg: string; color: string }> = {
  pending: {
    label: 'Chờ duyệt',
    label_en: 'Pending',
    bg: COLORS.warningLight,
    color: COLORS.warning,
  },
  approved: {
    label: 'Đã duyệt',
    label_en: 'Approved',
    bg: COLORS.successLight,
    color: COLORS.success,
  },
  rejected: {
    label: 'Đã từ chối',
    label_en: 'Rejected',
    bg: COLORS.errorLight,
    color: COLORS.error,
  },
};

export default function MonthlyContractDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();
  const fmt = (n?: number) =>
    new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(n ?? 0);
  const user = useAuthStore(s => s.user);
  const isHelper = user?.active_role === 'helper';

  // A85: Lắng nghe socket event cập nhật hợp đồng tháng tức thì
  useMonthlyContractSocket(id);

  const currentMonth = formatMonthKey(vnNow());
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
  // A102: Lý do bắt buộc khi kết thúc / hủy / từ chối hợp đồng — bên kia nhận thông báo ghi rõ lý do.
  const [reasonAction, setReasonAction] = useState<'end' | 'cancel' | 'decline' | null>(null);
  const [actionReason, setActionReason] = useState('');

  const recordByDate = useMemo(() => {
    const map = new Map<string, AttendanceStatus>();
    (attendance?.records ?? []).forEach(r => map.set(r.date, r.status));
    return map;
  }, [attendance]);

  const todayStr = attendance?.today ?? vnDateKey();
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
      { text: lang === 'en' ? 'Later' : 'Để sau', style: 'cancel' },
      { text: label, style: destructive ? 'destructive' : 'default', onPress: fn },
    ]);

  // A102: Xác nhận kết thúc/hủy/từ chối hợp đồng — bắt buộc nhập lý do.
  const handleConfirmReasonAction = async () => {
    if (!id || !reasonAction) return;
    if (actionReason.trim().length < 3) {
      Toast.show({
        type: 'error',
        text1: lang === 'en' ? 'Please enter a reason' : 'Vui lòng nhập lý do',
      });
      return;
    }
    const reason = actionReason.trim();
    try {
      if (reasonAction === 'end') {
        await end.mutateAsync({ id, path: 'end', body: { reason } });
      } else if (reasonAction === 'cancel') {
        await cancel.mutateAsync({ id, path: 'cancel', body: { reason } });
      } else {
        await respond.mutateAsync({
          id,
          path: 'respond',
          body: { accept: false, reason },
        });
      }
      setReasonAction(null);
      setActionReason('');
    } catch {
      // Toast lỗi đã hiển thị bởi hook
    }
  };

  const handleRequestLeave = async () => {
    if (!id) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(leaveDate.trim())) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Leave date must be in YYYY-MM-DD format (e.g. 2026-11-05)'
            : 'Ngày nghỉ phải có dạng YYYY-MM-DD (VD: 2026-11-05)',
      });
      return;
    }
    if (leaveReason.trim().length < 3) {
      Toast.show({
        type: 'error',
        text1: lang === 'en' ? 'Please enter leave reason' : 'Vui lòng nhập lý do xin nghỉ',
      });
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
          <Text style={{ fontSize: fs(18), fontWeight: '800', color: tc.text }} numberOfLines={1}>
            {contract.title}
          </Text>
          <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
            {lang === 'en' ? 'Monthly helper contract' : 'Hợp đồng giúp việc theo tháng'}
          </Text>
        </View>
        <Badge
          label={lang === 'en' ? meta.label_en : meta.label}
          color={meta.bg}
          textColor={meta.color}
        />
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
          <Text style={{ fontSize: fs(15), fontWeight: '800', color: tc.text }}>
            {lang === 'en' ? 'Contract Information' : 'Thông tin hợp đồng'}
          </Text>
          <InfoRow
            label={
              isHelper
                ? lang === 'en'
                  ? 'Customer'
                  : 'Khách hàng'
                : lang === 'en'
                  ? 'Helper'
                  : 'Thợ thực hiện'
            }
            value={personName(partner)}
          />
          <InfoRow
            label={lang === 'en' ? 'Monthly salary' : 'Lương tháng'}
            value={`${fmt(contract.monthly_salary)}₫`}
            strong
          />
          <InfoRow
            label={lang === 'en' ? 'Platform fee' : 'Phí sàn'}
            value={`${contract.platform_fee_percent ?? 15}% ${lang === 'en' ? '(deducted at settlement)' : '(trừ khi chốt lương)'}`}
          />
          <InfoRow
            label={lang === 'en' ? 'Work schedule' : 'Lịch làm việc'}
            value={describeMonthlySchedule(contract, lang)}
          />
          <InfoRow
            label={lang === 'en' ? 'Duration' : 'Thời gian'}
            value={`${formatDate(contract.start_date, lang)}${
              contract.end_date
                ? ` → ${formatDate(contract.end_date, lang)}`
                : lang === 'en'
                  ? ' → Ongoing'
                  : ' → Chưa ấn định ngày kết thúc'
            }`}
          />
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
            <MapPin size={14} color={COLORS.gray[500]} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, fontSize: fs(13), color: tc.textSecondary, lineHeight: 19 }}>
              {contract.address.full_address}, {contract.address.district}, {contract.address.city}
              {contract.address.notes ? ` (${contract.address.notes})` : ''}
            </Text>
          </View>
          {contract.end_reason && (
            <Text style={{ fontSize: fs(12.5), color: tc.textMuted }}>
              {lang === 'en' ? 'Reason for ending/cancelling: ' : 'Lý do kết thúc/hủy: '}
              {contract.end_reason}
            </Text>
          )}
        </Card>

        {/* ── Hành động theo vai trò & trạng thái ── */}
        {isHelper && contract.status === 'pending' && (
          <Card style={{ gap: 8 }}>
            <Text style={{ fontSize: fs(14.5), fontWeight: '800', color: tc.text }}>
              {lang === 'en'
                ? 'Customer has invited you to this contract'
                : 'Khách hàng đang mời bạn ký hợp đồng này'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                title={lang === 'en' ? 'Decline' : 'Từ chối'}
                variant="outline"
                style={{ flex: 1 }}
                loading={respond.isPending}
                // A102: Từ chối hợp đồng phải nhập lý do (modal bên dưới).
                onPress={() => {
                  setActionReason('');
                  setReasonAction('decline');
                }}
              />
              <Button
                title={lang === 'en' ? 'Accept' : 'Đồng ý nhận'}
                style={{ flex: 1 }}
                loading={respond.isPending}
                onPress={() =>
                  confirmDialog(
                    lang === 'en' ? 'Accept contract?' : 'Đồng ý hợp đồng?',
                    lang === 'en'
                      ? 'Contract will take effect immediately. Please check in on scheduled days.'
                      : 'Hợp đồng sẽ có hiệu lực ngay. Bạn cần điểm danh đúng các buổi theo lịch.',
                    lang === 'en' ? 'Accept' : 'Đồng ý',
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
            <Text style={{ fontSize: fs(14.5), fontWeight: '800', color: tc.text }}>
              {lang === 'en'
                ? `Today's Attendance (${formatDate(dayjs(), 'en')})`
                : `Điểm danh hôm nay (${formatDate(dayjs(), 'vi')})`}
            </Text>
            {todayRecord ? (
              <Text style={{ fontSize: fs(13), color: tc.textSecondary }}>
                {lang === 'en'
                  ? `Today's status: ${ATT_META[todayRecord].label_en}`
                  : `Trạng thái hôm nay: ${ATT_META[todayRecord].label}`}
              </Text>
            ) : isScheduledToday ? (
              <Button
                title={lang === 'en' ? "Check in today's session" : 'Điểm danh buổi hôm nay'}
                loading={checkin.isPending}
                onPress={() => checkin.mutate(contract._id)}
              />
            ) : (
              <Text style={{ fontSize: fs(13), color: tc.textSecondary }}>
                {lang === 'en'
                  ? 'Today is not in the contract working schedule.'
                  : 'Hôm nay không nằm trong lịch làm việc của hợp đồng.'}
              </Text>
            )}
          </Card>
        )}

        {(contract.status === 'pending' || isActive) && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title={lang === 'en' ? 'Cancel contract' : 'Hủy hợp đồng'}
              variant="danger"
              style={{ flex: 1 }}
              loading={cancel.isPending}
              // A102: Hủy hợp đồng phải nhập lý do (modal bên dưới).
              onPress={() => {
                setActionReason('');
                setReasonAction('cancel');
              }}
            />
            {isActive && (
              <Button
                title={lang === 'en' ? 'End contract' : 'Kết thúc hợp đồng'}
                variant="outline"
                style={{ flex: 1 }}
                loading={end.isPending}
                // A102: Kết thúc hợp đồng phải nhập lý do (modal bên dưới).
                onPress={() => {
                  setActionReason('');
                  setReasonAction('end');
                }}
              />
            )}
          </View>
        )}

        {/* ── Điểm danh theo tháng ── */}
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: fs(15), fontWeight: '800', color: tc.text }}>
              {lang === 'en'
                ? `Attendance for Month ${formatMonthSlash(`${month}-01`, lang)}`
                : `Điểm danh tháng ${formatMonthSlash(`${month}-01`, lang)}`}
            </Text>
            <TouchableOpacity
              onPress={() =>
                setMonth(formatMonthKey(toVnDayjs(`${month}-01`).subtract(1, 'month')))
              }
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: tc.subtle,
              }}
            >
              <Text style={{ fontWeight: '800', color: tc.textSecondary }}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={month >= currentMonth}
              onPress={() => setMonth(formatMonthKey(toVnDayjs(`${month}-01`).add(1, 'month')))}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: tc.subtle,
                opacity: month >= currentMonth ? 0.4 : 1,
              }}
            >
              <Text style={{ fontWeight: '800', color: tc.textSecondary }}>›</Text>
            </TouchableOpacity>
          </View>

          {(attendance?.scheduled_dates ?? []).length === 0 ? (
            <Text style={{ fontSize: fs(13), color: tc.textMuted }}>
              {lang === 'en'
                ? 'No work sessions scheduled for this month.'
                : 'Tháng này không có buổi làm nào theo lịch của hợp đồng.'}
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
                    borderTopColor: tc.border,
                  }}
                >
                  <Text
                    style={{
                      width: 118,
                      fontSize: fs(13),
                      fontWeight: '700',
                      color: tc.text,
                    }}
                  >
                    {formatShortDay(date, lang)}
                    {isToday ? (lang === 'en' ? ' • Today' : ' • Hôm nay') : ''}
                  </Text>
                  <View style={{ flex: 1 }}>
                    {st ? (
                      <Badge
                        label={lang === 'en' ? ATT_META[st].label_en : ATT_META[st].label}
                        color={ATT_META[st].bg}
                        textColor={ATT_META[st].color}
                      />
                    ) : (
                      <Text style={{ fontSize: fs(12.5), color: tc.textMuted }}>
                        {isPast
                          ? lang === 'en'
                            ? 'No check-in (counted as absent at settlement)'
                            : 'Không có điểm danh (tính vắng khi chốt lương)'
                          : lang === 'en'
                            ? 'Upcoming'
                            : 'Chưa tới'}
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
                        <Text style={{ color: '#fff', fontSize: fs(12), fontWeight: '800' }}>
                          {lang === 'en' ? 'Present' : 'Có mặt'}
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
                        <Text style={{ color: '#fff', fontSize: fs(12), fontWeight: '800' }}>
                          {lang === 'en' ? 'Absent' : 'Vắng'}
                        </Text>
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
          <Text style={{ fontSize: fs(15), fontWeight: '800', color: tc.text }}>
            {lang === 'en' ? 'Leave Requests' : 'Đơn xin nghỉ'}
          </Text>
          {(leaves ?? []).length === 0 && (
            <Text style={{ fontSize: fs(13), color: tc.textMuted }}>
              {lang === 'en' ? 'No leave requests yet.' : 'Chưa có đơn xin nghỉ nào.'}
            </Text>
          )}
          {(leaves ?? []).slice(0, 6).map(l => {
            const m = LEAVE_META[l.status];
            return (
              <View
                key={l._id}
                style={{
                  gap: 4,
                  borderTopWidth: 1,
                  borderTopColor: tc.border,
                  paddingTop: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: fs(13.5),
                      fontWeight: '700',
                      color: tc.text,
                    }}
                  >
                    {lang === 'en'
                      ? `Leave on ${formatDate(l.date, 'en')}`
                      : `Nghỉ ngày ${formatDate(l.date, 'vi')}`}
                  </Text>
                  <Badge
                    label={lang === 'en' ? m.label_en : m.label}
                    color={m.bg}
                    textColor={m.color}
                  />
                </View>
                <Text style={{ fontSize: fs(12.5), color: tc.textSecondary }}>
                  {lang === 'en' ? 'Reason: ' : 'Lý do: '}
                  {l.reason}
                </Text>
                {!isHelper && l.status === 'pending' && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                    <Button
                      title={lang === 'en' ? 'Approve' : 'Duyệt nghỉ'}
                      size="sm"
                      style={{ flex: 1 }}
                      loading={respondLeave.isPending}
                      onPress={() =>
                        respondLeave.mutate({ id: contract._id, leaveId: l._id, approve: true })
                      }
                    />
                    <Button
                      title={lang === 'en' ? 'Decline' : 'Từ chối'}
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
            <Text style={{ fontSize: fs(12.5), color: COLORS.warning }}>
              {lang === 'en'
                ? `You have ${pendingLeaves.length} requests awaiting customer approval.`
                : `Bạn có ${pendingLeaves.length} đơn đang chờ khách duyệt.`}
            </Text>
          )}

          {isHelper && isActive && (
            <View
              style={{
                gap: 8,
                borderTopWidth: 1,
                borderTopColor: tc.border,
                paddingTop: 10,
              }}
            >
              <Text style={{ fontSize: fs(13.5), fontWeight: '800', color: tc.text }}>
                {lang === 'en' ? 'Request 1 session off' : 'Xin nghỉ 1 buổi'}
              </Text>
              <TextInput
                value={leaveDate}
                onChangeText={setLeaveDate}
                placeholder={
                  lang === 'en'
                    ? 'Leave date (YYYY-MM-DD), e.g. 2026-11-05'
                    : 'Ngày nghỉ (YYYY-MM-DD), VD: 2026-11-05'
                }
                style={{
                  borderWidth: 1,
                  borderColor: tc.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: fs(14),
                  backgroundColor: tc.surface,
                }}
              />
              <TextInput
                value={leaveReason}
                onChangeText={setLeaveReason}
                placeholder={lang === 'en' ? 'Reason for leave...' : 'Lý do xin nghỉ…'}
                style={{
                  borderWidth: 1,
                  borderColor: tc.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: fs(14),
                  backgroundColor: tc.surface,
                }}
              />
              <Button
                title={lang === 'en' ? 'Submit leave request' : 'Gửi đơn xin nghỉ'}
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
            <Text style={{ fontSize: fs(15), fontWeight: '800', color: tc.text }}>
              {lang === 'en'
                ? `Wage Settlement for Month ${formatMonthSlash(`${month}-01`, lang)}`
                : `Chốt lương tháng ${formatMonthSlash(`${month}-01`, lang)}`}
            </Text>
            {settlement ? (
              <>
                <InfoRow
                  label={lang === 'en' ? 'Scheduled sessions' : 'Số buổi theo lịch'}
                  value={`${settlement.scheduled_days} ${lang === 'en' ? 'sessions' : 'buổi'}`}
                />
                <InfoRow
                  label={lang === 'en' ? 'Confirmed sessions' : 'Buổi đã xác nhận'}
                  value={`${settlement.confirmed_days} ${lang === 'en' ? 'sessions' : 'buổi'}`}
                />
                <InfoRow
                  label={lang === 'en' ? 'Leave sessions' : 'Buổi nghỉ phép'}
                  value={`${settlement.leave_days} ${lang === 'en' ? 'sessions' : 'buổi'}`}
                />
                <InfoRow
                  label={lang === 'en' ? 'Absent sessions' : 'Buổi vắng'}
                  value={`${settlement.absent_days} ${lang === 'en' ? 'sessions' : 'buổi'}`}
                />
                <InfoRow
                  label={lang === 'en' ? 'Actual session earnings' : 'Lương theo buổi thực tế'}
                  value={`${fmt(settlement.gross_amount)}₫`}
                />
                <InfoRow
                  label={
                    lang === 'en'
                      ? `Platform fee (${contract.platform_fee_percent ?? 15}%)`
                      : `Phí sàn (${contract.platform_fee_percent ?? 15}%)`
                  }
                  value={`−${fmt(settlement.platform_fee)}₫`}
                />
                <InfoRow
                  label={lang === 'en' ? 'Helper receives' : 'Thợ thực nhận'}
                  value={`${fmt(settlement.helper_receives)}₫`}
                  strong
                />
                {settlement.status === 'settled' ? (
                  <Badge
                    label={
                      lang === 'en'
                        ? `Wages settled${settlement.settled_at ? ` · ${formatDateTime(dayjs(settlement.settled_at), lang)}` : ''}`
                        : `Đã chốt lương${settlement.settled_at ? ` · ${formatDateTime(dayjs(settlement.settled_at), lang)}` : ''}`
                    }
                    color={COLORS.successLight}
                    textColor={COLORS.success}
                  />
                ) : !isHelper ? (
                  <Button
                    title={lang === 'en' ? 'Settle wages for this month' : 'Chốt lương tháng này'}
                    loading={settle.isPending}
                    onPress={() =>
                      confirmDialog(
                        lang === 'en' ? 'Settle wages for this month?' : 'Chốt lương tháng này?',
                        lang === 'en'
                          ? `Helper will receive ${fmt(settlement.helper_receives)}₫ in wallet (platform fee deducted). This month cannot be resettled.`
                          : `Thợ sẽ nhận ${fmt(settlement.helper_receives)}₫ vào ví (đã trừ phí sàn). Tháng này sẽ không chốt lại được.`,
                        lang === 'en' ? 'Settle wages' : 'Chốt lương',
                        () => settle.mutate({ id: contract._id, month }),
                      )
                    }
                  />
                ) : (
                  <Text style={{ fontSize: fs(12.5), color: tc.textMuted }}>
                    {lang === 'en'
                      ? 'Customer will settle wages after confirming all sessions in the month.'
                      : 'Khách hàng sẽ chốt lương sau khi xác nhận đủ các buổi trong tháng.'}
                  </Text>
                )}
              </>
            ) : (
              <Text style={{ fontSize: fs(13), color: tc.textMuted }}>
                {lang === 'en' ? 'Loading figures...' : 'Đang tải số liệu…'}
              </Text>
            )}
          </Card>
        )}
      </ScrollView>

      {/* A102: Modal nhập lý do bắt buộc khi kết thúc / hủy / từ chối hợp đồng */}
      <Modal
        visible={reasonAction !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setReasonAction(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: tc.surface,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 20,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: fs(16), fontWeight: '800', color: tc.text }}>
              {reasonAction === 'end'
                ? lang === 'en'
                  ? 'End contract?'
                  : 'Kết thúc hợp đồng?'
                : reasonAction === 'cancel'
                  ? lang === 'en'
                    ? 'Cancel contract?'
                    : 'Hủy hợp đồng?'
                  : lang === 'en'
                    ? 'Decline contract?'
                    : 'Từ chối hợp đồng?'}
            </Text>
            <Text style={{ fontSize: fs(13), color: tc.textMuted }}>
              {lang === 'en'
                ? 'Please enter a reason. The other party will be notified with this reason.'
                : 'Vui lòng nhập lý do. Bên còn lại sẽ nhận thông báo ghi rõ lý do này.'}
            </Text>
            <TextInput
              value={actionReason}
              onChangeText={setActionReason}
              placeholder={lang === 'en' ? 'Reason…' : 'Lý do…'}
              multiline
              style={{
                borderWidth: 1,
                borderColor: actionReason.trim().length >= 3 ? tc.border : COLORS.error,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: fs(14),
                backgroundColor: tc.surface,
                color: tc.text,
                minHeight: 80,
                textAlignVertical: 'top',
              }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                title={lang === 'en' ? 'Back' : 'Quay lại'}
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setReasonAction(null)}
              />
              <Button
                title={
                  reasonAction === 'end'
                    ? lang === 'en'
                      ? 'End'
                      : 'Kết thúc'
                    : reasonAction === 'cancel'
                      ? lang === 'en'
                        ? 'Cancel contract'
                        : 'Hủy hợp đồng'
                      : lang === 'en'
                        ? 'Decline'
                        : 'Từ chối'
                }
                variant="danger"
                style={{ flex: 1 }}
                loading={end.isPending || cancel.isPending || respond.isPending}
                disabled={actionReason.trim().length < 3}
                onPress={handleConfirmReasonAction}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { fs } = useTranslation();
  const tc = useThemeColors();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={{ width: 130, fontSize: fs(13), color: tc.textMuted }}>{label}</Text>
      <Text
        style={{
          flex: 1,
          fontSize: fs(13.5),
          color: strong ? tc.text : tc.textSecondary,
          fontWeight: strong ? '800' : '600',
        }}
      >
        {value}
      </Text>
    </View>
  );
}
