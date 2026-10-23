import { useEffect, useRef, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { ArrowLeft, Send, Headset } from 'lucide-react-native';
import dayjs from 'dayjs';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import {
  useMySupportConversation,
  useEnsureSupportConversation,
  useSupportMessages,
  useSendSupportMessage,
  useMarkSupportRead,
  type SupportMessageItem,
} from '@/hooks/use-api';
import { useSupportSocket } from '@/hooks/use-socket';
import { SUPPORT_FAQS } from '@/components/common/support-faq';
import { useTranslation } from '@/hooks/use-i18n';
import { COLORS, LoadingSpinner } from '@/components/ui';

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
  const { t } = useTranslation();
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
  const markRead = useMarkSupportRead();

  // Tự tạo hội thoại khi mở màn hình + đánh dấu đã đọc phản hồi của đội hỗ trợ
  useEffect(() => {
    if (!isLoading && !conversation) {
      ensureConversation.mutate();
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
    if (!content || sendMsg.isPending) return;
    const id = await ensureId();
    if (!id) {
      Toast.show({ type: 'error', text1: 'Không mở được hội thoại hỗ trợ' });
      return;
    }
    if (!raw) setText('');
    try {
      await sendMsg.mutateAsync({ conversationId: id, content });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gửi tin nhắn thất bại';
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
          borderRadius: 20,
          borderBottomRightRadius: isMe ? 4 : 20,
          borderBottomLeftRadius: isMe ? 20 : 4,
          backgroundColor: isMe ? COLORS.primary : '#FFFFFF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 3,
          elevation: 2,
          borderWidth: isMe ? 0 : 1,
          borderColor: COLORS.gray[100],
        }}
      >
        <Text
          style={{
            fontSize: 15,
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
            fontSize: 10.5,
            color: COLORS.gray[400],
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
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 12,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/help-center'))}
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
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: COLORS.primaryLight,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Headset size={21} color={COLORS.primaryDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
            {t('support_title')}
          </Text>
          <Text style={{ fontSize: 11.5, color: COLORS.success, fontWeight: '700' }}>
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
                <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.gray[900] }}>
                  {t('support_faq_heading')}
                </Text>
                {SUPPORT_FAQS.map(faq => (
                  <TouchableOpacity
                    key={faq.q}
                    activeOpacity={0.75}
                    onPress={() => handleFaqTap(faq.q, faq.a)}
                    style={{
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: COLORS.gray[200],
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 11,
                    }}
                  >
                    <Text style={{ fontSize: 13.5, fontWeight: '600', color: COLORS.gray[800] }}>
                      {faq.q}
                    </Text>
                  </TouchableOpacity>
                ))}
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
                    <Text style={{ fontSize: 13, color: '#92400E', lineHeight: 19 }}>
                      {t('support_closed_notice')}
                    </Text>
                  </View>
                )}
              </View>
            }
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[800] }}>
                  {t('support_greeting', { name: currentUser?.full_name ?? 'bạn' })}
                </Text>
                <Text
                  style={{
                    color: COLORS.gray[500],
                    fontSize: 13,
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
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                        }}
                      >
                        <Text
                          style={{ fontSize: 12.5, fontWeight: '700', color: COLORS.primaryDark }}
                        >
                          {t('support_send_question')}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text
                        style={{
                          fontSize: 11.5,
                          color: COLORS.gray[400],
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
              return renderBubble(
                isMe,
                item.msg.content,
                dayjs(item.msg.created_at).format('HH:mm'),
              );
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
              backgroundColor: '#fff',
              borderTopWidth: 1,
              borderTopColor: COLORS.gray[100],
            }}
          >
            <TextInput
              style={{
                flex: 1,
                borderWidth: 1.5,
                borderColor: COLORS.gray[200],
                borderRadius: 24,
                paddingHorizontal: 18,
                paddingVertical: 11,
                fontSize: 15,
                maxHeight: 100,
                backgroundColor: COLORS.gray[50],
                color: COLORS.gray[900],
              }}
              placeholder={t('support_placeholder')}
              value={text}
              onChangeText={setText}
              multiline
              placeholderTextColor={COLORS.gray[400]}
            />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleSend()}
              disabled={!text.trim() || sendMsg.isPending}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: text.trim() ? COLORS.primary : COLORS.gray[200],
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {sendMsg.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Send size={18} color={text.trim() ? '#fff' : COLORS.gray[400]} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
