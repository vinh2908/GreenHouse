import { useState, useRef, useEffect } from 'react';
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
import { ArrowLeft, Send, ShieldCheck, Phone } from 'lucide-react-native';
import dayjs from 'dayjs';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useMessages, useSendMessage } from '@/hooks/use-api';
import { useChatSocket } from '@/hooks/use-socket';
import apiClient from '@/services/api-client';
import { Avatar, COLORS, LoadingSpinner, EmptyState } from '@/components/ui';

export default function ChatScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const currentUser = useAuthStore(s => s.user);

  const [conversation, setConversation] = useState<any>(null);
  const [loadingConv, setLoadingConv] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  const conversationId = conversation?._id;

  // ── Realtime Chat Updates ──────────────────────────────────────────────
  useChatSocket(conversationId ?? undefined);

  const { data: messages, isLoading: mLoading, refetch } = useMessages(conversationId ?? undefined);
  const sendMsg = useSendMessage();

  // Fetch or create conversation by job
  useEffect(() => {
    if (!jobId) return;
    setLoadingConv(true);
    setErrorMsg(null);
    apiClient
      .get(`/chat/jobs/${jobId}/conversation`)
      .then(({ data }) => {
        setConversation(data.data);
      })
      .catch(err => {
        const msg = err?.response?.data?.message || 'Không thể mở cuộc trò chuyện';
        setErrorMsg(msg);
      })
      .finally(() => {
        setLoadingConv(false);
      });
  }, [jobId]);

  const handleSend = async () => {
    if (!text.trim() || !conversationId) return;
    const content = text.trim();
    setText('');
    try {
      await sendMsg.mutateAsync({ conversationId, content });
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Gửi tin nhắn thất bại' });
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    }
    router.replace(
      currentUser?.active_role === 'helper' ? '/(helper)/jobs' : '/(customer)/messages',
    );
  };

  // Xác định người đối thoại (Partner)
  const partner =
    conversation?.participants?.find((p: any) => {
      const pId = typeof p === 'string' ? p : p._id;
      return pId !== currentUser?._id;
    }) || {};

  const partnerName =
    partner?.full_name || (currentUser?.active_role === 'helper' ? 'Khách hàng' : 'Thợ phụ trách');
  const partnerAvatar = partner?.avatar;
  const partnerPhone = partner?.phone;

  const allMessages = Array.isArray(messages) ? messages : [];
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* ── Top Header Bar (Safe Insets) ───────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 12,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
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

          <Avatar name={partnerName} uri={partnerAvatar} size={42} />

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text
                style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}
                numberOfLines={1}
              >
                {partnerName}
              </Text>
              <ShieldCheck size={15} color={COLORS.success} />
            </View>
            <Text style={{ fontSize: 11.5, color: COLORS.success, fontWeight: '700' }}>
              ● Đang hoạt động
            </Text>
          </View>
        </View>
      </View>

      {/* ── Chat Messages List ──────────────────────────────────────── */}
      {loadingConv ? (
        <LoadingSpinner />
      ) : errorMsg ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <EmptyState
            emoji="💬"
            title="Chưa thể mở cuộc trò chuyện"
            subtitle={errorMsg}
            action="Quay lại"
            onAction={() => router.back()}
          />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <FlatList
            ref={listRef}
            data={allMessages}
            keyExtractor={(item: { _id: string }) => item._id}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 20 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: COLORS.primaryLight,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 28 }}>💬</Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.gray[800] }}>
                  Bắt đầu cuộc trò chuyện
                </Text>
                <Text
                  style={{
                    color: COLORS.gray[500],
                    fontSize: 13,
                    textAlign: 'center',
                    paddingHorizontal: 20,
                  }}
                >
                  Gửi tin nhắn để trao đổi chi tiết về địa chỉ, sự cố và thời gian làm việc với đối
                  phương.
                </Text>
              </View>
            }
            renderItem={({
              item,
            }: {
              item: {
                _id: string;
                sender_id: { _id: string; full_name?: string } | string;
                content: string;
                created_at: string;
              };
            }) => {
              const senderId =
                typeof item.sender_id === 'string' ? item.sender_id : item.sender_id?._id;
              const isMe = senderId === currentUser?._id;
              return (
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
                      {item.content}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 10.5,
                      color: COLORS.gray[400],
                      marginTop: 4,
                      marginHorizontal: 6,
                      fontWeight: '600',
                    }}
                  >
                    {dayjs(item.created_at).format('HH:mm')}
                  </Text>
                </View>
              );
            }}
          />

          {/* ── Message Input Bar ─────────────────────────────────────── */}
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
              placeholder="Nhập tin nhắn trao đổi..."
              value={text}
              onChangeText={setText}
              multiline
              placeholderTextColor={COLORS.gray[400]}
            />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleSend}
              disabled={!text.trim() || sendMsg.isPending}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: text.trim() ? COLORS.primary : COLORS.gray[200],
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: text.trim() ? COLORS.primary : 'transparent',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.3,
                shadowRadius: 6,
                elevation: 3,
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
