import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MessageCircle, ChevronRight } from 'lucide-react-native';
import { formatConversationTime, formatTime } from '@/utils/date-format';
import { useConversations } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import { useTranslation } from '@/hooks/use-i18n';
import {
  Card,
  Avatar,
  COLORS,
  EmptyState,
  ErrorState,
  LoadingSpinner,
  Badge,
  useThemeColors,
} from '@/components/ui';


export default function ConversationsScreen() {
  const router = useRouter();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();
  const currentUser = useAuthStore(s => s.user);
  const isAuth = useAuthStore(s => s.isAuthenticated);
  const {
    data: conversations,
    isLoading,
    isError,
    error,
    isRefetching,
    refetch,
    dataUpdatedAt,
  } = useConversations();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: Math.max(insets.top + 8, 20),
          paddingBottom: 14,
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
        }}
      >
        <Text style={{ fontSize: fs(20), fontWeight: '800', color: tc.text }}>
          {t('messages_title')}
        </Text>
        <Text style={{ fontSize: fs(12), color: tc.textMuted, marginTop: 2 }}>
          {t('messages_subtitle')}
        </Text>
        {/* A97: Thời gian cập nhật lần cuối — đổi mỗi khi tải lại dữ liệu */}
        {dataUpdatedAt ? (
          <Text style={{ fontSize: fs(11), color: tc.textMuted, marginTop: 2 }}>
            {lang === 'en' ? 'Updated at' : 'Cập nhật lúc'} {formatTime(dataUpdatedAt)}
          </Text>
        ) : null}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[COLORS.primary]} />
        }
      >
        {!isAuth ? (
          <EmptyState
            icon={<MessageCircle size={36} color={COLORS.gray[400]} />}
            title={lang === 'en' ? 'Log in to see messages' : 'Đăng nhập để xem tin nhắn'}
            subtitle={
              lang === 'en'
                ? 'Your conversations with helpers will appear here after you log in.'
                : 'Đăng nhập để xem cuộc trò chuyện với thợ tại đây.'
            }
            action={lang === 'en' ? 'Log in' : 'Đăng nhập'}
            onAction={() => router.push('/(auth)/login')}
          />
        ) : isError ? (
          (() => {
            const is401 =
              (error as any)?.response?.status === 401 ||
              (error as any)?.status === 401 ||
              (error as any)?.name === 'SessionExpiredError' ||
              (error as any)?.isSessionExpired;
            if (is401) {
              return (
                <EmptyState
                  icon={<MessageCircle size={36} color={COLORS.gray[400]} />}
                  title={
                    lang === 'en' ? 'Session expired' : 'Phiên đăng nhập đã hết hạn'
                  }
                  subtitle={
                    lang === 'en'
                      ? 'Your session has expired. Please log in again to view your conversations.'
                      : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để xem tin nhắn.'
                  }
                  action={lang === 'en' ? 'Log in again' : 'Đăng nhập lại'}
                  onAction={() => router.push('/(auth)/login')}
                />
              );
            }
            return (
              <ErrorState
                title={
                  lang === 'en'
                    ? 'Unable to load conversations'
                    : 'Không thể tải cuộc trò chuyện'
                }
                subtitle={
                  lang === 'en'
                    ? 'Could not connect to chat server. Please retry.'
                    : 'Không thể kết nối đến máy chủ trò chuyện. Vui lòng thử lại.'
                }
                onRetry={() => refetch()}
              />
            );
          })()
        ) : isLoading ? (
          <LoadingSpinner />
        ) : !conversations?.length ? (
          <EmptyState
            icon={<MessageCircle size={36} color={COLORS.gray[400]} />}
            title={t('messages_empty_title')}
            subtitle={t('messages_empty_sub')}
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

            const partnerName = partner?.full_name || t('messages_partner_helper');
            const partnerAvatar = partner?.avatar;
            const jobTitle =
              conv.job_id?.title ||
              (typeof conv.job_id === 'string'
                ? `${lang === 'en' ? 'Order #' : 'Đơn hàng #'}${conv.job_id.slice(-6)}`
                : t('messages_job_fallback'));
            const targetJobId = typeof conv.job_id === 'object' ? conv.job_id?._id : conv.job_id;
            const isUnread = Boolean(Number(conv.unread_count) > 0);

            return (
              <TouchableOpacity
                key={conv._id}
                activeOpacity={0.85}
                onPress={() => {
                  // S6: a deleted job leaves conv.job_id null — never push
                  // /chat/undefined (the chat screen would skeleton forever).
                  if (!targetJobId) {
                    Toast.show({
                      type: 'info',
                      text1:
                        lang === 'en'
                          ? 'Conversation unavailable'
                          : 'Cuộc trò chuyện không còn khả dụng',
                      text2:
                        lang === 'en'
                          ? 'The job for this conversation was deleted.'
                          : 'Đơn hàng của cuộc trò chuyện này đã bị xóa.',
                    });
                    return;
                  }
                  router.push({ pathname: '/chat/[jobId]', params: { jobId: targetJobId } });
                }}
              >
                <Card
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    padding: 14,
                    backgroundColor: isUnread ? '#F0FDF4' : '#FFFFFF',
                    borderColor: isUnread ? '#BBF7D0' : 'rgba(0, 0, 0, 0.04)',
                  }}
                >
                  <Avatar name={partnerName} uri={partnerAvatar} size={50} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text
                        style={{
                          fontWeight: isUnread ? '900' : '800',
                          fontSize: fs(15),
                          color: tc.text,
                        }}
                        numberOfLines={1}
                      >
                        {partnerName}
                      </Text>
                    </View>
                    <Text
                      style={{ fontSize: fs(12), color: COLORS.primary, fontWeight: '700' }}
                      numberOfLines={1}
                    >
                      {jobTitle}
                    </Text>
                    <Text
                      style={{
                        fontSize: fs(13),
                        color: isUnread
                          ? COLORS.gray[900]
                          : conv.last_message
                            ? COLORS.gray[700]
                            : COLORS.gray[500],
                        fontWeight: isUnread ? '800' : '500',
                        marginTop: 2,
                      }}
                      numberOfLines={1}
                    >
                      {conv.last_message_type === 'image'
                        ? t('messages_photo')
                        : conv.last_message || t('messages_chat_hint')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {conv.last_message_at && (
                      <Text
                        style={{
                          fontSize: fs(11),
                          color: isUnread ? COLORS.primaryDark : COLORS.gray[500],
                          fontWeight: isUnread ? '700' : '600',
                        }}
                      >
                        {formatConversationTime(conv.last_message_at, undefined, lang)}
                      </Text>
                    )}
                    {isUnread ? (
                      <View
                        style={{
                          backgroundColor: COLORS.error,
                          borderRadius: 999,
                          minWidth: 18,
                          height: 18,
                          paddingHorizontal: 5,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: fs(10), fontWeight: '800' }}>
                          {conv.unread_count > 99 ? '99+' : conv.unread_count}
                        </Text>
                      </View>
                    ) : (
                      <ChevronRight size={14} color={COLORS.gray[300]} />
                    )}
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
