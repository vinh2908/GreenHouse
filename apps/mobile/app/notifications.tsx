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
} from 'lucide-react-native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useNotifications, useMarkAllRead, useMarkNotificationRead } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import { resolveNotificationRoute } from '@/utils/notification-route';
import { refreshSosState } from '@/hooks/use-sos-backup';
import { useTranslation } from '@/hooks/use-i18n';
import { Card, COLORS, EmptyState, ErrorState, LoadingSpinner } from '@/components/ui';

dayjs.extend(relativeTime);

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
  const user = useAuthStore(s => s.user);
  const { data: notifications, isLoading, isError, refetch, dataUpdatedAt } = useNotifications();
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
    <View style={{ flex: 1, backgroundColor: COLORS.gray[50] }}>
      {/* Header (Safe Insets) */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
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
              borderRadius: 12,
              backgroundColor: COLORS.gray[100],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowLeft size={20} color={COLORS.gray[800]} />
          </TouchableOpacity>
          <View>
            <Text style={{ fontSize: fs(18), fontWeight: '800', color: COLORS.gray[900] }}>
              {lang === 'en' ? 'Notifications' : 'Thông báo'}
            </Text>
            {dataUpdatedAt ? (
              <Text style={{ fontSize: fs(11), color: COLORS.gray[500] }}>
                {lang === 'en' ? 'Updated at' : 'Cập nhật lúc'}{' '}
                {dayjs(dataUpdatedAt).format('HH:mm')}
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

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} colors={[COLORS.primary]} />
        }
      >
        {isError ? (
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
            title={lang === 'en' ? 'No notifications yet' : 'Chưa có thông báo nào'}
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
                  borderRadius: 16,
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
                      color: COLORS.gray[900],
                    }}
                  >
                    {formatNotifTitle(n.title, n.type)}
                  </Text>
                  <Text
                    style={{
                      fontSize: fs(13),
                      color: COLORS.gray[600],
                      marginTop: 3,
                      lineHeight: 18,
                    }}
                  >
                    {formatNotifBody(n.body, n.type, n.data)}
                  </Text>
                  <Text
                    style={{
                      fontSize: fs(11),
                      color: COLORS.gray[500],
                      marginTop: 6,
                      fontWeight: '600',
                    }}
                  >
                    {dayjs(n.created_at)
                      .locale(lang === 'en' ? 'en' : 'vi')
                      .fromNow()}
                  </Text>
                </View>
                {!n.is_read && (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
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
