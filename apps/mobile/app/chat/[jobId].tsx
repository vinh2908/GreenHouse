import { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  Send,
  Phone,
  ImagePlus,
  X,
  AlertCircle,
  MessageSquare,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import dayjs from 'dayjs';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import {
  useMessages,
  useSendMessage,
  useCallConfig,
  useMarkConversationRead,
} from '@/hooks/use-api';
import { useChatSocket } from '@/hooks/use-socket';
import apiClient from '@/services/api-client';
import { uploadFile } from '@/services/upload.service';
import { ImageViewerModal } from '@/components/common/photo-thumbs';
import { Alert } from '@/components/common/app-alert';
import { useTranslation } from '@/hooks/use-i18n';
import { formatDayLabel, formatTime } from '@/utils/date-format';
import { Avatar, COLORS, LoadingSpinner, EmptyState, Skeleton, ErrorState, useThemeColors } from '@/components/ui';

export function resolveMediaUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();

  // Data URLs or Blob URLs pass through
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  // Determine current server origin from apiClient baseURL
  const apiBase =
    apiClient.defaults.baseURL ||
    process.env.EXPO_PUBLIC_API_URL ||
    'https://greenhouse-api-chb9.onrender.com/api/v1';
  const origin = apiBase.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');

  // Relative URL (e.g. /uploads/2026-10/xxx.jpg)
  if (url.startsWith('/')) {
    url = `${origin}${url}`;
  }

  // Localhost or LAN IP URLs in production/web/mobile
  if (/^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?(\/.*)?$/i.test(url)) {
    const path = url.replace(/^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?/i, '');
    url = `${origin}${path}`;
  }

  // Mixed content fix: promote http:// to https:// for any remote URL
  if (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
    url = url.replace(/^http:\/\//i, 'https://');
  }

  return url;
}

function ChatImageBubble({ uri, onPress }: { uri: string; onPress: () => void }) {
  const { lang, fs } = useTranslation();
  const tc = useThemeColors();
  const resolvedUrl = useMemo(() => resolveMediaUrl(uri), [uri]);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => {
        if (status === 'success') {
          onPress();
        }
      }}
      style={{
        width: 220,
        height: 220,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: status === 'error' ? '#FECACA' : COLORS.gray[200],
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {status !== 'error' && (
        <Image
          source={{ uri: resolvedUrl }}
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          resizeMode="cover"
          onLoadStart={() => setStatus('loading')}
          onLoad={() => setStatus('success')}
          onError={() => setStatus('error')}
        />
      )}

      {status === 'loading' && (
        <View style={{ alignItems: 'center', gap: 6, zIndex: 2 }}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={{ fontSize: fs(11), color: tc.textMuted, fontWeight: '600' }}>
            {lang === 'en' ? 'Loading image...' : 'Đang tải ảnh...'}
          </Text>
        </View>
      )}

      {status === 'error' && (
        <View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            padding: 14,
            gap: 6,
            backgroundColor: '#FEF2F2',
            width: '100%',
            height: '100%',
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 14,
              backgroundColor: '#FEE2E2',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertCircle size={20} color="#DC2626" />
          </View>
          <Text
            style={{
              fontSize: fs(12),
              fontWeight: '700',
              color: '#DC2626',
              textAlign: 'center',
            }}
          >
            {lang === 'en' ? 'Failed to load image' : 'Không tải được ảnh'}
          </Text>
          <Text
            style={{
              fontSize: fs(10.5),
              color: tc.textMuted,
              textAlign: 'center',
              lineHeight: 14,
            }}
            numberOfLines={2}
          >
            {lang === 'en'
              ? 'File does not exist or was deleted from server'
              : 'Tệp tin không tồn tại hoặc đã bị xóa khỏi máy chủ'}
          </Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setStatus('loading')}
            style={{
              marginTop: 4,
              backgroundColor: '#DC2626',
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 8,
            }}
          >
            <Text style={{ fontSize: fs(10), color: '#fff', fontWeight: '700' }}>
              {lang === 'en' ? 'Retry' : 'Thử lại'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ChatScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const currentUser = useAuthStore(s => s.user);
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();

  const [conversation, setConversation] = useState<any>(null);
  const [loadingConv, setLoadingConv] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [text, setText] = useState('');
  // Ảnh đang gửi (optimistic): hiện bong bóng mờ + spinner; gửi lỗi thì giữ
  // lại làm "bản nháp" — chạm để thử lại, ✕ để bỏ.
  const [pendingPhoto, setPendingPhoto] = useState<{ uri: string; failed: boolean } | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const conversationId = conversation?._id;
  // P2-6: chỉ tự cuộn xuống cuối khi khách đang ở gần cuối danh sách (hoặc
  // vừa gửi tin); đang đọc lịch sử phía trên thì tin mới/ảnh load xong
  // không được giật màn hình về cuối.
  const stickToBottomRef = useRef(true);
  const handleListScroll = (e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    stickToBottomRef.current =
      contentSize.height - (contentOffset.y + layoutMeasurement.height) < 100;
  };

  // ── Realtime Chat Updates ──────────────────────────────────────────────
  useChatSocket(conversationId ?? undefined);

  const {
    data: messagePages,
    isLoading: mLoading,
    isError: mError,
    isRefetching: mRefetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMessages(conversationId ?? undefined);
  const sendMsg = useSendMessage();
  const markRead = useMarkConversationRead();

  // P1-20: trang 1 = 30 tin mới nhất, trang sau = 30 tin cũ hơn → đảo thứ tự
  // trang rồi nối lại để hiển thị cũ → mới. Khử trùng theo _id (A82).
  const allMessages = useMemo(() => {
    const pages = messagePages?.pages ?? [];
    const flat: any[] = [...pages].reverse().flat();
    if (!Array.isArray(flat)) return [];
    const seen = new Set<string>();
    const res: any[] = [];
    for (const m of flat) {
      const id = String(m._id || m.id || '');
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      res.push(m);
    }
    return res;
  }, [messagePages]);

  useEffect(() => {
    if (conversationId) {
      markRead.mutate(conversationId);
    }
  }, [conversationId, allMessages.length]);

  // Fetch or create conversation by job
  useEffect(() => {
    // S6: no jobId (e.g. deep link / deleted job) — clear the skeleton and
    // show the "unavailable" state instead of spinning forever.
    if (!jobId) {
      setLoadingConv(false);
      setErrorMsg(
        lang === 'en'
          ? 'Conversation unavailable — the job for this chat no longer exists.'
          : 'Cuộc trò chuyện không còn khả dụng — đơn hàng của đoạn chat này không còn tồn tại.',
      );
      return;
    }
    setLoadingConv(true);
    setErrorMsg(null);
    apiClient
      .get(`/chat/jobs/${jobId}/conversation`)
      .then(({ data }) => {
        setConversation(data.data);
        (globalThis as any).__activeConversationId = data.data?._id;
      })
      .catch(err => {
        const msg =
          err?.response?.data?.message ||
          (lang === 'en' ? 'Could not open conversation' : 'Không thể mở cuộc trò chuyện');
        setErrorMsg(msg);
      })
      .finally(() => {
        setLoadingConv(false);
      });

    return () => {
      (globalThis as any).__activeConversationId = null;
    };
  }, [jobId]);

  const handleSend = async () => {
    if (!text.trim() || !conversationId) return;
    const content = text.trim();
    try {
      await sendMsg.mutateAsync({ conversationId, content });
      // Chỉ xóa ô nhập khi gửi thành công — gửi lỗi thì giữ nguyên nội dung
      // để khách bấm gửi lại, không mất tin đã gõ (P1-21).
      setText('');
      stickToBottomRef.current = true;
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: lang === 'en' ? 'Failed to send message' : 'Gửi tin nhắn thất bại',
        text2:
          lang === 'en'
            ? 'Your message is kept — please try sending again.'
            : 'Tin nhắn của bạn vẫn còn — hãy bấm gửi lại.',
      });
    }
  };

  // ── Gửi ảnh: upload qua /uploads → gửi message type 'image' (content = URL) ──
  const sendPhoto = async (uri: string) => {
    if (!conversationId) return;
    setPendingPhoto({ uri, failed: false });
    try {
      const url = await uploadFile(uri);
      await sendMsg.mutateAsync({ conversationId, content: url, type: 'image' });
      setPendingPhoto(null);
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch {
      setPendingPhoto({ uri, failed: true });
      Toast.show({
        type: 'error',
        text1: lang === 'en' ? 'Failed to send photo' : 'Gửi ảnh thất bại',
        text2: lang === 'en' ? 'Tap photo to retry sending' : 'Chạm vào ảnh để thử gửi lại',
      });
    }
  };

  const pickPhoto = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        // B14: camera không hỗ trợ trên web → chọn ảnh từ thư viện (mẫu home.tsx)
        if (Platform.OS === 'web') {
          const webResult = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
          });
          if (!webResult.canceled && webResult.assets[0]?.uri) {
            void sendPhoto(webResult.assets[0].uri);
          }
          return;
        }
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Toast.show({
            type: 'error',
            text1:
              lang === 'en'
                ? 'Camera permission required to take photo'
                : 'Cần quyền truy cập camera để chụp ảnh',
          });
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
        if (!result.canceled && result.assets[0]?.uri) void sendPhoto(result.assets[0].uri);
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Toast.show({
            type: 'error',
            text1:
              lang === 'en'
                ? 'Photo library permission required'
                : 'Cần quyền truy cập thư viện ảnh',
          });
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
        if (!result.canceled && result.assets[0]?.uri) void sendPhoto(result.assets[0].uri);
      }
    } catch {
      Toast.show({
        type: 'error',
        text1: lang === 'en' ? 'Could not select photo' : 'Không thể chọn ảnh',
      });
    }
  };

  const handleAttach = () => {
    Alert.alert(
      lang === 'en' ? 'Send Photo' : 'Gửi ảnh',
      lang === 'en' ? 'Select photo source' : 'Chọn nguồn ảnh',
      [
        {
          text: lang === 'en' ? 'Take Photo' : 'Chụp ảnh',
          onPress: () => void pickPhoto('camera'),
        },
        {
          text: lang === 'en' ? 'Photo Library' : 'Thư viện ảnh',
          onPress: () => void pickPhoto('library'),
        },
        { text: lang === 'en' ? 'Cancel' : 'Hủy', style: 'cancel' },
      ],
    );
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
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

  const { data: callConfig } = useCallConfig();

  const partnerName =
    partner?.full_name ||
    (currentUser?.active_role === 'helper'
      ? lang === 'en'
        ? 'Customer'
        : 'Khách hàng'
      : lang === 'en'
        ? 'Assigned Helper'
        : 'Thợ phụ trách');
  const partnerAvatar = partner?.avatar;
  const partnerPhone = partner?.phone;

  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      {/* ── Top Header Bar (Safe Insets) ───────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 12,
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
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
              borderRadius: 14,
              backgroundColor: tc.subtle,
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
                style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}
                numberOfLines={1}
              >
                {partnerName}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Gọi thoại che số (Roadmap Phase 1) — ẩn khi server chưa cấu hình VoIP ── */}
        {callConfig?.enabled && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() =>
              router.push({
                pathname: '/call/[jobId]',
                params: { jobId, partnerName },
              })
            }
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              backgroundColor: COLORS.primaryLight,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Phone size={19} color={COLORS.primaryDark} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Chat Messages List ──────────────────────────────────────── */}
      {loadingConv ? (
        // B28: skeleton bong bóng chat giữ khung thay spinner trắng
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <Skeleton width="70%" height={52} radius={14} style={{ alignSelf: 'flex-start' }} />
          <Skeleton width="60%" height={52} radius={14} style={{ alignSelf: 'flex-end' }} />
          <Skeleton width="75%" height={52} radius={14} style={{ alignSelf: 'flex-start' }} />
          <Skeleton width="55%" height={40} radius={14} style={{ alignSelf: 'flex-end' }} />
          <Skeleton width="65%" height={52} radius={14} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : errorMsg ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <EmptyState
            icon={<MessageSquare size={36} color={COLORS.gray[400]} />}
            title={lang === 'en' ? 'Could not open conversation' : 'Chưa thể mở cuộc trò chuyện'}
            subtitle={errorMsg}
            action={lang === 'en' ? 'Back' : 'Quay lại'}
            onAction={() => router.back()}
          />
        </View>
      ) : mError ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <ErrorState
            title={lang === 'en' ? 'Unable to load messages' : 'Không thể tải tin nhắn'}
            subtitle={
              lang === 'en'
                ? 'Could not fetch messages. Please check your connection and retry.'
                : 'Không thể kết nối đến máy chủ trò chuyện. Vui lòng kiểm tra mạng và thử lại.'
            }
            onRetry={() => refetch()}
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
            refreshControl={
              <RefreshControl refreshing={mRefetching} onRefresh={refetch} colors={[COLORS.primary]} />
            }
            onScroll={handleListScroll}
            scrollEventThrottle={16}
            ListHeaderComponent={
              mLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                </View>
              ) : hasNextPage ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  style={{
                    alignSelf: 'center',
                    backgroundColor: tc.subtle,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 999,
                    marginBottom: 4,
                  }}
                >
                  <Text style={{ fontSize: fs(12.5), fontWeight: '700', color: COLORS.primary }}>
                    {isFetchingNextPage
                      ? lang === 'en'
                        ? 'Loading…'
                        : 'Đang tải…'
                      : lang === 'en'
                        ? 'Load older messages'
                        : 'Tải tin nhắn cũ hơn'}
                  </Text>
                </TouchableOpacity>
              ) : null
            }
            ListFooterComponent={
              pendingPhoto ? (
                <View style={{ alignItems: 'flex-end', marginVertical: 2 }}>
                  <View>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      disabled={!pendingPhoto.failed}
                      onPress={() => void sendPhoto(pendingPhoto.uri)}
                    >
                      <Image
                        source={{ uri: pendingPhoto.uri }}
                        style={{
                          width: 220,
                          height: 220,
                          borderRadius: 14,
                          opacity: 0.55,
                          backgroundColor: tc.subtle,
                        }}
                        resizeMode="cover"
                      />
                      <View
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {pendingPhoto.failed ? (
                          <Text
                            style={{
                              color: '#fff',
                              fontWeight: '700',
                              fontSize: fs(13),
                              backgroundColor: 'rgba(220,38,38,0.85)',
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 8,
                              overflow: 'hidden',
                            }}
                          >
                            {lang === 'en'
                              ? 'Sending failed — tap to retry'
                              : 'Gửi thất bại — chạm để thử lại'}
                          </Text>
                        ) : (
                          <ActivityIndicator size="large" color="#fff" />
                        )}
                      </View>
                    </TouchableOpacity>
                    {pendingPhoto.failed && (
                      <TouchableOpacity
                        onPress={() => setPendingPhoto(null)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{
                          position: 'absolute',
                          top: -8,
                          left: -8,
                          width: 24,
                          height: 24,
                          borderRadius: 14,
                          backgroundColor: COLORS.gray[700],
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <X size={14} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ) : null
            }
            onContentSizeChange={() => {
              if (stickToBottomRef.current) {
                listRef.current?.scrollToEnd({ animated: false });
              }
            }}
            ListEmptyComponent={
              mLoading ? null : (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 999,
                    backgroundColor: COLORS.primaryLight,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MessageSquare size={28} color={COLORS.primary} />
                </View>
                <Text style={{ fontSize: fs(16), fontWeight: '800', color: tc.text }}>
                  {lang === 'en' ? 'Start the conversation' : 'Bắt đầu cuộc trò chuyện'}
                </Text>
                <Text
                  style={{
                    color: tc.textMuted,
                    fontSize: fs(13),
                    textAlign: 'center',
                    paddingHorizontal: 20,
                  }}
                >
                  {lang === 'en'
                    ? 'Send a message to discuss location, details, and schedule with your partner.'
                    : 'Gửi tin nhắn để trao đổi chi tiết về địa chỉ, sự cố và thời gian làm việc với đối phương.'}
                </Text>
              </View>
              )
            }
            renderItem={({
              item,
              index,
            }: {
              item: {
                _id: string;
                sender_id: { _id: string; full_name?: string } | string;
                content: string;
                type?: string;
                created_at: string;
              };
              index: number;
            }) => {
              const senderId =
                typeof item.sender_id === 'string' ? item.sender_id : item.sender_id?._id;
              const isMe = senderId === currentUser?._id;
              // B21: dải phân cách ngày khi created_at đổi ngày so với tin trước
              const prev = index > 0 ? allMessages[index - 1] : null;
              const showDaySeparator =
                !prev || !dayjs(prev.created_at).isSame(dayjs(item.created_at), 'day');
              const daySeparator = showDaySeparator ? (
                <View style={{ alignItems: 'center', marginVertical: 6 }}>
                  <Text
                    style={{
                      fontSize: fs(11.5),
                      fontWeight: '700',
                      color: tc.textMuted,
                      backgroundColor: tc.subtle,
                      paddingHorizontal: 12,
                      paddingVertical: 4,
                      borderRadius: 999,
                      overflow: 'hidden',
                    }}
                  >
                    {formatDayLabel(item.created_at, undefined, lang === 'en' ? 'en' : 'vi')}
                  </Text>
                </View>
              ) : null;
              if (item.type === 'image') {
                return (
                  <>
                    {daySeparator}
                    <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start', marginVertical: 2 }}>
                    <ChatImageBubble
                      uri={item.content}
                      onPress={() => setViewingImage(item.content)}
                    />
                    <Text
                      style={{
                        fontSize: fs(10.5),
                        color: tc.textMuted,
                        marginTop: 4,
                        marginHorizontal: 6,
                        fontWeight: '600',
                      }}
                    >
                      {formatTime(dayjs(item.created_at))}
                    </Text>
                    </View>
                  </>
                );
              }
              return (
                <>
                  {daySeparator}
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
                      {item.content}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: fs(10.5),
                      color: tc.textMuted,
                      marginTop: 4,
                      marginHorizontal: 6,
                      fontWeight: '600',
                    }}
                  >
                    {formatTime(dayjs(item.created_at))}
                  </Text>
                  </View>
                </>
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
              backgroundColor: tc.surface,
              borderTopWidth: 1,
              borderTopColor: tc.border,
            }}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleAttach}
              disabled={!!pendingPhoto && !pendingPhoto.failed}
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: tc.subtle,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pendingPhoto && !pendingPhoto.failed ? 0.5 : 1,
              }}
            >
              <ImagePlus size={20} color={COLORS.primary} />
            </TouchableOpacity>
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
                backgroundColor: tc.background,
                color: tc.text,
              }}
              placeholder={lang === 'en' ? 'Type a message...' : 'Nhập tin nhắn trao đổi...'}
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
                borderRadius: 14,
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
      <ImageViewerModal
        uri={viewingImage ? resolveMediaUrl(viewingImage) : null}
        visible={!!viewingImage}
        onClose={() => setViewingImage(null)}
      />
    </View>
  );
}
