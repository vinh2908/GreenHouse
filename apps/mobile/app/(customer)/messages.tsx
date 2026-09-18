import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MessageCircle, ChevronRight, ShieldCheck } from 'lucide-react-native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useConversations } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import { Card, Avatar, COLORS, EmptyState, LoadingSpinner, Badge } from '@/components/ui';

dayjs.extend(relativeTime);
dayjs.locale('vi');

export default function ConversationsScreen() {
  const router = useRouter();
  const currentUser = useAuthStore(s => s.user);
  const { data: conversations, isLoading, refetch } = useConversations();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: Math.max(insets.top + 8, 20),
          paddingBottom: 14,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.gray[900] }}>
          Tin nhắn & Trao đổi
        </Text>
        <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}>
          Trò chuyện trực tiếp với thợ và khách hàng
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} colors={[COLORS.primary]} />
        }
      >
        {isLoading ? (
          <LoadingSpinner />
        ) : !conversations?.length ? (
          <EmptyState
            emoji="💬"
            title="Chưa có cuộc trò chuyện nào"
            subtitle="Khi bạn chấp nhận báo giá hoặc nhận đơn công việc, cuộc trò chuyện sẽ tự động được mở tại đây để hai bên trao đổi."
          />
        ) : (
          conversations.map((conv: any) => {
            const partner =
              conv.participants?.find((p: any) => {
                const pId = typeof p === 'string' ? p : p._id;
                return pId !== currentUser?._id;
              }) ||
              conv.participants?.[0] ||
              {};

            const partnerName = partner?.full_name || 'Thợ đối tác';
            const partnerAvatar = partner?.avatar;
            const jobTitle =
              conv.job_id?.title ||
              (typeof conv.job_id === 'string'
                ? `Đơn hàng #${conv.job_id.slice(-6)}`
                : 'Công việc');
            const targetJobId = typeof conv.job_id === 'object' ? conv.job_id?._id : conv.job_id;

            return (
              <TouchableOpacity
                key={conv._id}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({ pathname: '/chat/[jobId]', params: { jobId: targetJobId } })
                }
              >
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 }}>
                  <Avatar name={partnerName} uri={partnerAvatar} size={50} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text
                        style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}
                        numberOfLines={1}
                      >
                        {partnerName}
                      </Text>
                      <ShieldCheck size={14} color={COLORS.success} />
                    </View>
                    <Text
                      style={{ fontSize: 12, color: COLORS.primary, fontWeight: '700' }}
                      numberOfLines={1}
                    >
                      📌 {jobTitle}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: conv.last_message ? COLORS.gray[700] : COLORS.gray[400],
                        marginTop: 2,
                      }}
                      numberOfLines={1}
                    >
                      {conv.last_message || 'Bắt đầu trao đổi thông tin công việc...'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {conv.last_message_at && (
                      <Text style={{ fontSize: 11, color: COLORS.gray[400], fontWeight: '600' }}>
                        {dayjs(conv.last_message_at).format('HH:mm')}
                      </Text>
                    )}
                    <ChevronRight size={14} color={COLORS.gray[300]} />
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
