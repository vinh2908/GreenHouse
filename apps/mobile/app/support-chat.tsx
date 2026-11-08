import { useEffect, useRef, useState } from 'react';
import { formatTime } from '@/utils/date-format';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Send, Headset } from 'lucide-react-native';
import dayjs from 'dayjs';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import {
  useMySupportConversation,
  useEnsureSupportConversation,
  useSupportMessages,
  useSendSupportMessage,
  useReopenSupportConversation,
  useMarkSupportRead,
  type SupportMessageItem,
} from '@/hooks/use-api';
import { useSupportSocket } from '@/hooks/use-socket';
import { getSupportFaqs } from '@/components/common/support-faq';
import { useTranslation } from '@/hooks/use-i18n';
import { COLORS, LoadingSpinner, useThemeColors } from '@/components/ui';

// Bong bóng cục bộ (FAQ tĩnh, không lưu server)
interface LocalBubble {
  id: string;
  question: string;
  answer: string;
  sent: boolean;
}

type ThreadItem = { kind: 'msg'; msg: SupportMessageItem } | { kind: 'faq'; faq: LocalBubble };

export default function SupportChatScreen() {
  const router = useRouter();
  // B77: mở hỗ trợ từ màn đơn thì gắn job_id cho thread
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  const { t, lang, fs } = useTranslation();
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();
  const currentUser = useAuthStore(s => s.user);
  const [text, setText] = useState('');
  const [localFaqs, setLocalFaqs] = useState<LocalBubble[]>([]);
  const listRef = useRef<FlatList>(null);

  useSupportSocket();

  const { data: mine, isLoading } = useMySupportConversation();
  const conversation = mine?.conversation ?? null;
  const conversationId = conversation?._id;
  const isClosed = conversation?.status === 'closed';

  const ensureConversation = useEnsureSupportConversation();
  const { data: messages } = useSupportMessages(conversationId);
  const sendMsg = useSendSupportMessage();
  const reopenConv = useReopenSupportConversation();
  const markRead = useMarkSupportRead();

  // Tự tạo hội thoại khi mở màn hình + đánh dấu đã đọc phản hồi của đội hỗ trợ
  useEffect(() => {
    if (!isLoading && !conversation) {
      ensureConversation.mutate(jobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, conversation?._id]);

  useEffect(() => {
    if (conversationId && (conversation?.unread_for_user ?? 0) > 0) {
      markRead.mutate(conversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conversation?.unread_for_user]);

  const ensureId = async (): Promise<string | null> => {
    if (conversationId && !isClosed) return conversationId;
    try {
      const conv = await ensureConversation.mutateAsync();
      return conv?._id ?? null;
    } catch {
      return null;
    }
  };

  const handleSend = async (raw?: string) => {
    const content = (raw ?? text).trim();
    if (!content || sendMsg.isPending || isClosed) return;
    const id = await ensureId();
    if (!id) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en' ? 'Could not open support conversation' : 'Không mở được hội thoại hỗ trợ',
      });
      return;
    }
    if (!raw) setText('');
    try {
      await sendMsg.mutateAsync({ conversationId: id, content });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (lang === 'en' ? 'Failed to send message' : 'Gửi tin nhắn thất bại');
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handleFaqTap = (q: string, a: string) => {
    setLocalFaqs(prev => [
      ...prev,
      { id: `faq-${Date.now()}-${prev.length}`, question: q, answer: a, sent: false },
    ]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleSendFaq = async (bubble: LocalBubble) => {
    await handleSend(bubble.question);
    setLocalFaqs(prev => prev.map(b => (b.id === bubble.id ? { ...b, sent: true } : b)));
  };

  const serverMessages: ThreadItem[] = (Array.isArray(messages) ? messages : []).map(msg => ({
    kind: 'msg' as const,
    msg,
  }));
  const thread: ThreadItem[] = [
    ...serverMessages,
    ...localFaqs.map(faq => ({ kind: 'faq' as const, faq })),
  ];

  const renderBubble = (isMe: boolean, content: string, time?: string) => (
    <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start', marginVertical: 2 }}>
      <View
        style={{
          maxWidth: '80%',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 14,
          borderBottomRightRadius: isMe ? 4 : 20,
          borderBottomLeftRadius: isMe ? 20 : 4,
          backgroundColor: isMe ? COLORS.primary : '#FFFFFF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 3,
          elevation: 2,
          borderWidth: isMe ? 0 : 1,
          borderColor: tc.border,
        }}
      >
        <Text
          style={{
            fontSize: fs(15),
            color: isMe ? '#FFFFFF' : COLORS.gray[900],
            lineHeight: 21,
            fontWeight: '500',
          }}
        >
          {content}
        </Text>
      </View>
      {time && (
        <Text
          style={{
            fontSize: fs(10.5),
            color: tc.textMuted,
            marginTop: 4,
            marginHorizontal: 6,
            fontWeight: '600',
          }}
        >
          {time}
        </Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 12,
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/help-center'))}
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
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            backgroundColor: COLORS.primaryLight,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Headset size={21} color={COLORS.primaryDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
            {t('support_title')}
          </Text>
          <Text style={{ fontSize: fs(11.5), color: COLORS.success, fontWeight: '700' }}>
            {t('support_online')}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <FlatList
            ref={listRef}
            data={thread}
            keyExtractor={item => (item.kind === 'msg' ? item.msg._id : item.faq.id)}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 20 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListHeaderComponent={
              <View style={{ gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: fs(14), fontWeight: '800', color: tc.text }}>
                  {t('support_faq_heading')}
                </Text>
                {getSupportFaqs(lang).map(faq => (
                  <TouchableOpacity
                    key={faq.q}
                    activeOpacity={0.75}
                    onPress={() => handleFaqTap(faq.q, faq.a)}
                    style={{
                      backgroundColor: tc.surface,
                      borderWidth: 1,
                      borderColor: tc.border,
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 11,
                    }}
                  >
                    <Text style={{ fontSize: fs(13.5), fontWeight: '600', color: tc.text }}>
                      {faq.q}
                    </Text>
                  </TouchableOpacity>
                ))}
                {conversation?.job_id && (
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#EFF6FF',
                      borderWidth: 1,
                      borderColor: '#BFDBFE',
                      borderRadius: 14,
                      padding: 12,
                    }}
                    onPress={() =>
                      router.push(
                        `/(customer)/job-detail/${typeof conversation.job_id === 'object' ? (conversation.job_id as any)._id : conversation.job_id}` as any,
                      )
                    }
                  >
                    <Text style={{ fontSize: fs(13), color: '#1E40AF', fontWeight: '700' }}>
                      {lang === 'en' ? 'Related job: ' : 'Đơn liên quan: '}
                      {typeof conversation.job_id === 'object'
                        ? ((conversation.job_id as any).title ?? (conversation.job_id as any)._id)
                        : conversation.job_id}
                    </Text>
                  </TouchableOpacity>
                )}
                {isClosed && (
                  <View
                    style={{
                      backgroundColor: '#FFFBEB',
                      borderWidth: 1,
                      borderColor: '#FDE68A',
                      borderRadius: 14,
                      padding: 12,
                    }}
                  >
                    <Text style={{ fontSize: fs(13), color: '#92400E', lineHeight: 19 }}>
                      {t('support_closed_notice')}
                    </Text>
                    <TouchableOpacity
                      style={{
                        marginTop: 10,
                        backgroundColor: COLORS.primary,
                        borderRadius: 10,
                        paddingVertical: 12,
                        alignItems: 'center',
                      }}
                      disabled={reopenConv.isPending}
                      onPress={() => conversationId && reopenConv.mutate(conversationId)}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(14) }}>
                        {lang === 'en' ? 'Reopen conversation' : 'Mở lại'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            }
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                <Text style={{ fontSize: fs(15), fontWeight: '800', color: tc.text }}>
                  {t('support_greeting', {
                    name: currentUser?.full_name ?? (lang === 'en' ? 'you' : 'bạn'),
                  })}
                </Text>
                <Text
                  style={{
                    color: tc.textMuted,
                    fontSize: fs(13),
                    textAlign: 'center',
                    paddingHorizontal: 20,
                    lineHeight: 19,
                  }}
                >
                  {t('support_empty_sub')}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              if (item.kind === 'faq') {
                return (
                  <View style={{ gap: 6 }}>
                    {renderBubble(false, item.faq.answer)}
                    {!item.faq.sent ? (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => handleSendFaq(item.faq)}
                        style={{
                          alignSelf: 'flex-start',
                          marginLeft: 4,
                          backgroundColor: COLORS.primaryLight,
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: fs(12.5),
                            fontWeight: '700',
                            color: COLORS.primaryDark,
                          }}
                        >
                          {t('support_send_question')}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text
                        style={{
                          fontSize: fs(11.5),
                          color: tc.textMuted,
                          marginLeft: 6,
                          fontWeight: '600',
                        }}
                      >
                        {t('support_sent')}
                      </Text>
                    )}
                  </View>
                );
              }
              const isMe = item.msg.sender_role === 'user';
              return renderBubble(isMe, item.msg.content, formatTime(dayjs(item.msg.created_at)));
            }}
          />

          {/* ── Composer ─────────────────────────────────────────────── */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 16,
              paddingVertical: 12,
              backgroundColor: tc.surface,
              borderTopWidth: 1,
              borderTopColor: tc.border,
            }}
          >
            <TextInput
              style={{
                flex: 1,
                borderWidth: 1.5,
                borderColor: tc.border,
                borderRadius: 14,
                paddingHorizontal: 18,
                paddingVertical: 11,
                fontSize: fs(15),
                maxHeight: 100,
                backgroundColor: isClosed ? tc.subtle : tc.background,
                color: tc.text,
                opacity: isClosed ? 0.6 : 1,
              }}
              placeholder={isClosed ? (lang === 'en' ? 'Conversation closed' : 'Hội thoại đã đóng') : t('support_placeholder')}
              value={text}
              onChangeText={setText}
              editable={!isClosed}
              multiline
              placeholderTextColor={COLORS.gray[400]}
            />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleSend()}
              disabled={!text.trim() || sendMsg.isPending || isClosed}
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: text.trim() && !isClosed ? COLORS.primary : COLORS.gray[200],
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {sendMsg.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Send size={18} color={text.trim() && !isClosed ? '#fff' : COLORS.gray[400]} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
