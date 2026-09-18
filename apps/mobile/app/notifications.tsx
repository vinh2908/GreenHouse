import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell, CheckCheck, ArrowLeft, ChevronRight } from 'lucide-react-native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useNotifications, useMarkAllRead, useMarkNotificationRead } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import { Card, COLORS, EmptyState, LoadingSpinner } from '@/components/ui';

dayjs.extend(relativeTime);
dayjs.locale('vi');

const NOTIF_ICONS: Record<string, string> = {
  new_quote_received: '💰',
  job_confirmed: '✅',
  helper_on_the_way: '🚗',
  helper_arrived: '📍',
  job_completed: '🎉',
  new_job_nearby: '🔔',
  quote_accepted: '🎯',
  quote_rejected: '❌',
  payment_success: '💸',
  review_received: '⭐',
  promotion: '🎁',
  system: '📢',
};

export default function NotificationsScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const { data: notifications, isLoading, refetch } = useNotifications();
  const markAll = useMarkAllRead();
  const markRead = useMarkNotificationRead();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    }
    router.replace(user?.active_role === 'helper' ? '/(helper)/dashboard' : '/(customer)/home');
  };

  const handlePressNotification = async (n: any) => {
    // Đánh dấu đã đọc
    if (!n.is_read) {
      markRead.mutate(n._id);
    }

    // Điều hướng đến Job tương ứng nếu có job_id
    const jobId = n.data?.job_id || n.payload?.job_id;
    if (jobId) {
      if (user?.active_role === 'helper') {
        router.push({ pathname: '/helper-job-detail/[id]', params: { id: jobId } });
      } else {
        router.push({ pathname: '/job-detail/[id]', params: { id: jobId } });
      }
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
          <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900] }}>
            Thông báo
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => markAll.mutate()}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <CheckCheck size={16} color={COLORS.primary} />
          <Text style={{ color: COLORS.primary, fontSize: 13, fontWeight: '700' }}>Đọc tất cả</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} colors={[COLORS.primary]} />
        }
      >
        {isLoading ? (
          <LoadingSpinner />
        ) : !notifications?.length ? (
          <EmptyState
            emoji="🔔"
            title="Chưa có thông báo nào"
            subtitle="Các cập nhật báo giá, tình trạng đơn hàng và thanh toán sẽ xuất hiện tại đây"
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
                  <Text style={{ fontSize: 22 }}>{NOTIF_ICONS[n.type] ?? '📢'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontWeight: n.is_read ? '600' : '800',
                      fontSize: 14,
                      color: COLORS.gray[900],
                    }}
                  >
                    {n.title}
                  </Text>
                  <Text
                    style={{ fontSize: 13, color: COLORS.gray[600], marginTop: 3, lineHeight: 18 }}
                  >
                    {n.body}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: COLORS.gray[400],
                      marginTop: 6,
                      fontWeight: '600',
                    }}
                  >
                    {dayjs(n.created_at).fromNow()}
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
