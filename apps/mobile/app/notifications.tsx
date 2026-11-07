import { useState } from 'react';
import { formatTime, formatRelativeTime } from '@/utils/date-format';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Bell,
  CheckCheck,
  ArrowLeft,
  ChevronRight,
  CircleDollarSign,
  CheckCircle2,
  Car,
  MapPin,
  Trophy,
  Target,
  XCircle,
  Banknote,
  Star,
  MessageSquare,
  ShieldCheck,
  AlertTriangle,
  Building2,
  Gift,
  Megaphone,
  HelpCircle,
  AlertOctagon,
  Clock,
  RefreshCw,
  Hourglass,
  Shield,
  RotateCcw,
  ClipboardList,
  Receipt,
  Scale,
  Users,
  CalendarClock,
  CalendarX,
  Undo2,
  FileWarning,
  PhoneMissed,
  Ticket,
  Award,
} from 'lucide-react-native';
import dayjs from 'dayjs';
import { useNotifications, useMarkAllRead, useMarkNotificationRead } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import { resolveNotificationRoute } from '@/utils/notification-route';
import { refreshSosState } from '@/hooks/use-sos-backup';
import { useTranslation } from '@/hooks/use-i18n';
import { Card, COLORS, EmptyState, ErrorState, LoadingSpinner, useThemeColors } from '@/components/ui';

function renderNotificationIcon(type: string) {
  const size = 22;
  switch (type) {
    case 'new_quote_received':
      return <CircleDollarSign size={size} color="#F59E0B" />;
    case 'job_confirmed':
      return <CheckCircle2 size={size} color="#10B981" />;
    case 'helper_on_the_way':
      return <Car size={size} color="#3B82F6" />;
    case 'helper_arrived':
      return <MapPin size={size} color="#EF4444" />;
    case 'job_completed':
      return <Trophy size={size} color="#8B5CF6" />;
    case 'new_job_nearby':
      return <Bell size={size} color="#22C55E" />;
    case 'quote_accepted':
      return <Target size={size} color="#10B981" />;
    case 'quote_rejected':
      return <XCircle size={size} color="#EF4444" />;
    case 'payment_success':
      return <Banknote size={size} color="#10B981" />;
    case 'refund_received':
      return <RotateCcw size={size} color="#10B981" />;
    case 'review_received':
      return <Star size={size} color="#F59E0B" />;
    case 'new_message':
      return <MessageSquare size={size} color="#3B82F6" />;
    case 'kyc_approved':
      return <ShieldCheck size={size} color="#10B981" />;
    case 'kyc_rejected':
      return <AlertTriangle size={size} color="#EF4444" />;
    case 'withdrawal_processed':
      return <Building2 size={size} color="#6366F1" />;
    case 'promotion':
      return <Gift size={size} color="#EC4899" />;
    case 'job_cancelled':
      return <XCircle size={size} color="#EF4444" />;
    case 'job_updated':
      return <ClipboardList size={size} color="#3B82F6" />;
    case 'cost_proposal':
    case 'cost_proposal_response':
      return <Receipt size={size} color="#F59E0B" />;
    case 'dispute_updated':
    case 'dispute_appealed':
    case 'dispute_opened':
    case 'dispute_resolved':
      return <Scale size={size} color="#EF4444" />;
    case 'claim_submitted':
      return <FileWarning size={size} color="#F59E0B" />;
    case 'call_missed':
      return <PhoneMissed size={size} color="#EF4444" />;
    case 'team_invitation':
    case 'team_response':
      return <Users size={size} color="#8B5CF6" />;
    case 'recurring_job_created':
      return <CalendarClock size={size} color="#22C55E" />;
    case 'recurring_plan_cancelled':
      return <CalendarX size={size} color="#EF4444" />;
    case 'sos_backup_withdrawn':
      return <Undo2 size={size} color="#6B7280" />;
    case 'system':
      return <Megaphone size={size} color="#3B82F6" />;
    case 'support_reply':
      return <HelpCircle size={size} color="#06B6D4" />;
    case 'sos_backup_decision_request':
    case 'sos_backup_decision_reminder':
    case 'sos_backup_job_cancelled':
    case 'sos_backup_request':
      return <AlertOctagon size={size} color="#EF4444" />;
    case 'sos_backup_helper_replaced':
      return <RefreshCw size={size} color="#3B82F6" />;
    case 'sos_backup_expired':
      return <Hourglass size={size} color="#F59E0B" />;
    case 'insurance_claim_update':
      return <Shield size={size} color="#10B981" />;
    // B103: thông báo hợp đồng tháng có icon lịch/tháng riêng (không dùng chuông chung)
    case 'monthly_contract_new':
    case 'monthly_contract_accepted':
    case 'monthly_contract_rejected':
    case 'monthly_contract_cancelled':
    case 'monthly_contract_ended':
    case 'monthly_contract_checkin':
    case 'monthly_contract_attendance':
    case 'monthly_contract_leave_request':
    case 'monthly_contract_leave_response':
    case 'monthly_contract_settled':
    case 'monthly_contract_started':
    case 'monthly_contract_expiring_soon':
      return <CalendarClock size={size} color="#0EA5E9" />;
    // B102: các nhóm mới cũng có icon riêng
    case 'team_invitation':
    case 'team_invitation_response':
      return <Users size={size} color="#8B5CF6" />;
    case 'dispute_evidence':
    case 'dispute_appealed':
      return <Scale size={size} color="#F59E0B" />;
    case 'loyalty_points_earned':
      return <Award size={size} color="#F59E0B" />;
    case 'voucher_restored':
    case 'voucher_expiring_soon':
      return <Ticket size={size} color="#EC4899" />;
    case 'review_appeal':
      return <Star size={size} color="#F59E0B" />;
    default:
      return <Bell size={size} color="#6B7280" />;
  }
}

// Việc "chạm thông báo → mở màn hình nào" nằm hết ở utils/notification-route.ts
// (dùng chung với đường chạm OS push). Tại đây chỉ còn xử lý riêng của SOS:
// thông báo chờ quyết định SOS phải kích hoạt làm mới trạng thái để popup
// quyết định hiện ra trên màn chi tiết đơn.
const SOS_DECISION_TYPES = new Set(['sos_backup_decision_request', 'sos_backup_decision_reminder']);

export default function NotificationsScreen() {
  const router = useRouter();
  const { t, fs, lang, formatNotifTitle, formatNotifBody } = useTranslation();
  const tc = useThemeColors();
  const user = useAuthStore(s => s.user);
  const isAuth = useAuthStore(s => s.isAuthenticated);
  // B23: 2 tab Tất cả / Chưa đọc dùng đúng hook useNotifications(unreadOnly)
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const { data: notifications, isLoading, isError, refetch, dataUpdatedAt } = useNotifications(
    tab === 'unread',
  );
  const markAll = useMarkAllRead();
  const markRead = useMarkNotificationRead();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(user?.active_role === 'helper' ? '/(helper)/dashboard' : '/(customer)/home');
  };

  const handlePressNotification = async (n: any) => {
    // Đánh dấu đã đọc
    if (!n.is_read) {
      markRead.mutate(n._id);
    }

    // SOS chờ quyết định: làm mới trạng thái SOS để popup quyết định hiện ngay
    // (kể cả khi sự kiện socket đã bị lỡ lúc app đóng/nền).
    if (SOS_DECISION_TYPES.has(n.type)) {
      void refreshSosState();
    }

    const route = resolveNotificationRoute(
      { type: n.type, data: n.data, payload: n.payload },
      user?.active_role,
      (user as { roles?: string[] } | null)?.roles,
    );
    if (route) {
      router.push(route as never);
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      {/* Header (Safe Insets) */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleBack}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            style={{
              width: 38,
              height: 38,
              borderRadius: 14,
              backgroundColor: tc.subtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowLeft size={20} color={COLORS.gray[800]} />
          </TouchableOpacity>
          <View>
            <Text style={{ fontSize: fs(18), fontWeight: '800', color: tc.text }}>
              {lang === 'en' ? 'Notifications' : 'Thông báo'}
            </Text>
            {dataUpdatedAt ? (
              <Text style={{ fontSize: fs(11), color: tc.textMuted }}>
                {lang === 'en' ? 'Updated at' : 'Cập nhật lúc'}{' '}
                {formatTime(dayjs(dataUpdatedAt))}
              </Text>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          onPress={() => markAll.mutate()}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <CheckCheck size={16} color={COLORS.primary} />
          <Text style={{ color: COLORS.primary, fontSize: fs(13), fontWeight: '700' }}>
            {lang === 'en' ? 'Mark all as read' : 'Đọc tất cả'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* B23: tab lọc Tất cả / Chưa đọc */}
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 16,
          paddingTop: 12,
          backgroundColor: tc.surface,
        }}
      >
        {(
          [
            { key: 'all', label: lang === 'en' ? 'All' : 'Tất cả' },
            { key: 'unread', label: lang === 'en' ? 'Unread' : 'Chưa đọc' },
          ] as const
        ).map(tabItem => {
          const active = tab === tabItem.key;
          return (
            <TouchableOpacity
              key={tabItem.key}
              activeOpacity={0.8}
              onPress={() => setTab(tabItem.key)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 999,
                alignItems: 'center',
                backgroundColor: active ? COLORS.primary : COLORS.gray[100],
              }}
            >
              <Text
                style={{
                  fontSize: fs(13.5),
                  fontWeight: '800',
                  color: active ? '#fff' : COLORS.gray[700],
                }}
              >
                {tabItem.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} colors={[COLORS.primary]} />
        }
      >
        {isError && isAuth ? (
          <ErrorState
            title={lang === 'en' ? 'Unable to load notifications' : 'Không thể tải thông báo'}
            subtitle={
              lang === 'en'
                ? 'Could not fetch your notifications. Please check your network and retry.'
                : 'Không thể kết nối đến máy chủ thông báo. Vui lòng kiểm tra mạng và thử lại.'
            }
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <LoadingSpinner />
        ) : !notifications?.length ? (
          <EmptyState
            icon={<Bell size={36} color={COLORS.gray[400]} />}
            title={
              tab === 'unread'
                ? lang === 'en'
                  ? 'No unread notifications'
                  : 'Không có thông báo chưa đọc'
                : lang === 'en'
                  ? 'No notifications yet'
                  : 'Chưa có thông báo nào'
            }
            subtitle={
              lang === 'en'
                ? 'Quotes updates, order status, and payments will appear here'
                : 'Các cập nhật báo giá, tình trạng đơn hàng và thanh toán sẽ xuất hiện tại đây'
            }
          />
        ) : (
          notifications.map(
            (n: {
              _id: string;
              type: string;
              title: string;
              body: string;
              is_read: boolean;
              created_at: string;
              data?: any;
            }) => (
              <TouchableOpacity
                key={n._id}
                activeOpacity={0.8}
                onPress={() => handlePressNotification(n)}
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  padding: 14,
                  backgroundColor: n.is_read ? '#fff' : '#FFF7F3',
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: n.is_read ? COLORS.gray[100] : '#FFD9C5',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: n.is_read ? COLORS.gray[100] : COLORS.primaryLight,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {renderNotificationIcon(n.type)}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontWeight: n.is_read ? '600' : '800',
                      fontSize: fs(14),
                      color: tc.text,
                    }}
                  >
                    {formatNotifTitle(n.title, n.type, n.data)}
                  </Text>
                  <Text
                    style={{
                      fontSize: fs(13),
                      color: tc.textSecondary,
                      marginTop: 3,
                      lineHeight: 18,
                    }}
                  >
                    {formatNotifBody(n.body, n.type, n.data)}
                  </Text>
                  <Text
                    style={{
                      fontSize: fs(11),
                      color: tc.textMuted,
                      marginTop: 6,
                      fontWeight: '600',
                    }}
                  >
                    {formatRelativeTime(n.created_at, lang)}
                  </Text>
                </View>
                {!n.is_read && (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 8,
                      backgroundColor: COLORS.primary,
                      marginRight: 4,
                    }}
                  />
                )}
                <ChevronRight size={14} color={COLORS.gray[300]} />
              </TouchableOpacity>
            ),
          )
        )}
      </ScrollView>
    </View>
  );
}
