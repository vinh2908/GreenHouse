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
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Send, ShieldCheck, Phone, ImagePlus, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import dayjs from 'dayjs';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useMessages, useSendMessage, useCallConfig } from '@/hooks/use-api';
import { useChatSocket } from '@/hooks/use-socket';
import apiClient from '@/services/api-client';
import { uploadFile } from '@/services/upload.service';
import { ImageViewerModal } from '@/components/common/photo-thumbs';
import { Alert } from '@/components/common/app-alert';
import { Avatar, COLORS, LoadingSpinner, EmptyState } from '@/components/ui';

export default function ChatScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const currentUser = useAuthStore(s => s.user);

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
        (globalThis as any).__activeConversationId = data.data?._id;
      })
      .catch(err => {
        const msg = err?.response?.data?.message || 'Không thể mở cuộc trò chuyện';
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
        text1: 'Gửi ảnh thất bại',
        text2: 'Chạm vào ảnh để thử gửi lại',
      });
    }
  };

  const pickPhoto = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Toast.show({ type: 'error', text1: 'Cần quyền truy cập camera để chụp ảnh' });
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
          Toast.show({ type: 'error', text1: 'Cần quyền truy cập thư viện ảnh' });
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
        if (!result.canceled && result.assets[0]?.uri) void sendPhoto(result.assets[0].uri);
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể chọn ảnh' });
    }
  };

  const handleAttach = () => {
    Alert.alert('Gửi ảnh', 'Chọn nguồn ảnh', [
      { text: '📷 Chụp ảnh', onPress: () => void pickPhoto('camera') },
      { text: '🖼️ Thư viện ảnh', onPress: () => void pickPhoto('library') },
      { text: 'Hủy', style: 'cancel' },
    ]);
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
              borderRadius: 12,
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
                          borderRadius: 16,
                          opacity: 0.55,
                          backgroundColor: COLORS.gray[100],
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
                              fontSize: 13,
                              backgroundColor: 'rgba(220,38,38,0.85)',
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 8,
                              overflow: 'hidden',
                            }}
                          >
                            Gửi thất bại — chạm để thử lại
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
                          borderRadius: 12,
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
                type?: string;
                created_at: string;
              };
            }) => {
              const senderId =
                typeof item.sender_id === 'string' ? item.sender_id : item.sender_id?._id;
              const isMe = senderId === currentUser?._id;
              if (item.type === 'image') {
                return (
                  <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start', marginVertical: 2 }}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => setViewingImage(item.content)}
                    >
                      <Image
                        source={{ uri: item.content }}
                        style={{
                          width: 220,
                          height: 220,
                          borderRadius: 16,
                          backgroundColor: COLORS.gray[100],
                        }}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
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
              }
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
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleAttach}
              disabled={!!pendingPhoto && !pendingPhoto.failed}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: COLORS.gray[100],
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
      <ImageViewerModal
        uri={viewingImage}
        visible={!!viewingImage}
        onClose={() => setViewingImage(null)}
      />
    </View>
  );
}
