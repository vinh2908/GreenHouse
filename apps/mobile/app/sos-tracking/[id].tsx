import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
  Share,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ShieldCheck,
  Phone,
  MessageCircle,
  MapPin,
  Share2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Navigation,
} from 'lucide-react-native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import Toast from 'react-native-toast-message';
import { useJobDetail, useCancelJob } from '@/hooks/use-api';
import { useJobSocketUpdates, useHelperLocation } from '@/hooks/use-socket';
import { socketService, SOCKET_EVENTS } from '@/services/socket.service';
import { LiveTrackingMap } from '@/components/common/live-tracking-map';
import {
  Button,
  Card,
  Avatar,
  LoadingSpinner,
  COLORS,
  Separator,
  PriceText,
} from '@/components/ui';

dayjs.extend(relativeTime);
dayjs.locale('vi');

export default function SosTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // ── Realtime Socket Updates ──────────────────────────────────────────────
  useJobSocketUpdates(id);
  const helperLocation = useHelperLocation(id);

  const { data: job, isLoading, refetch } = useJobDetail(id);
  const cancelJob = useCancelJob();

  const [eta, setEta] = useState(15);

  // Lắng nghe sự kiện sos:accepted trực tiếp
  useEffect(() => {
    const unsub = socketService.on(SOCKET_EVENTS.SOS_ACCEPTED, (data: any) => {
      refetch();
      Toast.show({
        type: 'success',
        text1: '🚨 ĐÃ CÓ THỢ NHẬN CỨU HỘ!',
        text2: 'Thợ đang chuẩn bị đồ nghề và di chuyển gấp đến bạn.',
      });
    });
    return () => {
      unsub();
    };
  }, [refetch]);

  if (isLoading) return <LoadingSpinner />;

  const isMatched =
    job?.status === 'confirmed' ||
    job?.status === 'helper_on_the_way' ||
    job?.status === 'helper_arrived' ||
    job?.status === 'in_progress';
  const helperObj = typeof job?.helper_id === 'object' && job?.helper_id ? job.helper_id : null;
  const helperName = helperObj?.full_name || 'Anh Tuấn (Thợ Điện Nước)';
  const helperPhone = helperObj?.phone || '0902222222';
  const helperAvatar = helperObj?.avatar;

  const handleCallHelper = () => {
    Linking.openURL(`tel:${helperPhone}`);
  };

  const handleShareSos = async () => {
    try {
      await Share.share({
        message: `🚨 Tôi đang gọi cứu hộ sự cố khẩn cấp "${job?.title}" tại địa chỉ: ${job?.address?.full_address}. Thợ phụ trách: ${helperName} (${helperPhone}). Theo dõi qua Green House.`,
      });
    } catch {
      /* ignore */
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Hủy yêu cầu cứu hộ?',
      isMatched
        ? 'Thợ đang trên đường di chuyển khẩn cấp đến bạn. Hủy lúc này có thể phát sinh phí di chuyển của thợ.'
        : 'Bạn có chắc chắn muốn hủy yêu cầu cứu hộ?',
      [
        { text: 'Tiếp tục chờ', style: 'cancel' },
        {
          text: 'Xác nhận hủy',
          style: 'destructive',
          onPress: async () => {
            await cancelJob.mutateAsync({ jobId: id!, reason: 'Khách hàng hủy yêu cầu SOS' });
            router.replace('/(customer)/home');
          },
        },
      ],
    );
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* ── Top Header (Safe Insets) ─────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: isMatched ? '#10B981' : '#DC2626',
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.replace('/(customer)/home')}
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '900', color: '#FFFFFF' }}>
          {isMatched ? 'THỢ ĐANG ĐẾN CỨU HỘ' : 'RADAR QUÉT TÌM THỢ KHẨN CẤP'}
        </Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleShareSos}
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Share2 size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }}
      >
        {/* ── TRƯỜNG HỢP 1: ĐANG PHÁT SÓNG QUÉT TÌM THỢ GẦN NHẤT ─────── */}
        {!isMatched && (
          <Card
            style={{
              alignItems: 'center',
              padding: 24,
              gap: 14,
              backgroundColor: '#FEF2F2',
              borderColor: '#FECACA',
              borderWidth: 2,
            }}
          >
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: '#FEE2E2',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ActivityIndicator size="large" color="#DC2626" />
            </View>
            <Text
              style={{ fontSize: 19, fontWeight: '900', color: '#991B1B', textAlign: 'center' }}
            >
              Đang broadcast tín hiệu tới 5 thợ gần bạn nhất
            </Text>
            <Text style={{ fontSize: 13, color: '#B91C1C', textAlign: 'center', lineHeight: 19 }}>
              Hệ thống đang quét các đối tác thợ online trong bán kính 10km đã xác minh e-KYC. Thợ
              đầu tiên bấm nhận sẽ lập tức di chuyển đến bạn.
            </Text>

            <View
              style={{
                backgroundColor: '#fff',
                padding: 12,
                borderRadius: 12,
                width: '100%',
                gap: 6,
                marginTop: 4,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12.5, color: COLORS.gray[600] }}>Sự cố khẩn cấp:</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[900] }}>
                  {job?.title}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12.5, color: COLORS.gray[600] }}>Thời gian cam kết:</Text>
                <Text style={{ fontSize: 13, fontWeight: '900', color: '#DC2626' }}>
                  Có mặt sau 15 phút
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* ── TRƯỜNG HỢP 2: ĐÃ CÓ THỢ NHẬN (BẢN ĐỒ TRACKING NHƯ GRAB) ─── */}
        {isMatched && (
          <>
            {/* 1. Bản đồ Live Tracking thời gian thực (Grab Map Style) */}
            <LiveTrackingMap
              customerLocation={{
                latitude: job?.address?.location?.coordinates?.[1] || 10.7725,
                longitude: job?.address?.location?.coordinates?.[0] || 106.6983,
              }}
              helperLocation={
                helperLocation?.current
                  ? {
                      latitude: helperLocation.current.lat,
                      longitude: helperLocation.current.lng,
                    }
                  : undefined
              }
              customerAddress={job?.address?.full_address}
              helperName={helperName}
              etaMinutes={eta}
              height={260}
            />

            {/* 2. Thẻ định danh Thợ cứu hộ */}
            <Card style={{ padding: 16, gap: 14 }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: COLORS.gray[900] }}>
                Thông tin thợ cứu hộ phụ trách
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={helperName} uri={helperAvatar} size={54} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontWeight: '800', fontSize: 16, color: COLORS.gray[900] }}>
                      {helperName}
                    </Text>
                    <ShieldCheck size={18} color={COLORS.success} />
                  </View>
                  <Text style={{ fontSize: 13, color: COLORS.gray[500], marginTop: 2 }}>
                    {helperPhone}
                  </Text>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}
                  >
                    <View
                      style={{
                        backgroundColor: '#ECFDF5',
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 6,
                      }}
                    >
                      <Text style={{ fontSize: 11, color: COLORS.success, fontWeight: '700' }}>
                        e-KYC 100%
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '800' }}>
                      ★ 4.9 (48 đơn)
                    </Text>
                  </View>
                </View>
              </View>

              <Separator my={2} />

              {/* Nút Gọi điện & Nhắn tin */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleCallHelper}
                  style={{
                    flex: 1,
                    backgroundColor: '#10B981',
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                  }}
                >
                  <Phone size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                    Gọi điện ngay
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => router.push({ pathname: '/chat/[jobId]', params: { jobId: id } })}
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.primaryLight,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                    borderWidth: 1.5,
                    borderColor: '#FFD9C5',
                  }}
                >
                  <MessageCircle size={18} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: 14 }}>
                    Nhắn tin
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
          </>
        )}

        {/* ── Thông tin địa chỉ & sự cố ────────────────────────────────── */}
        <Card style={{ padding: 16, gap: 10 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.gray[900] }}>
            Địa chỉ cứu hộ
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <MapPin size={16} color={COLORS.primary} style={{ marginTop: 2 }} />
            <Text
              style={{
                flex: 1,
                fontSize: 14,
                color: COLORS.gray[700],
                lineHeight: 20,
                fontWeight: '600',
              }}
            >
              {job?.address?.full_address}
              {job?.address?.district ? `, ${job?.address.district}` : ''}
            </Text>
          </View>
          <Separator my={2} />
          <Text style={{ fontSize: 13, color: COLORS.gray[600], lineHeight: 19 }}>
            {job?.description}
          </Text>
        </Card>

        {/* ── Nút chia sẻ cho người thân & Hủy yêu cầu ─────────────────── */}
        <View style={{ gap: 10 }}>
          <Button
            title="Chia sẻ vị trí cứu hộ cho người thân"
            variant="outline"
            icon={<Share2 size={18} color={COLORS.primary} />}
            onPress={handleShareSos}
          />

          <Button
            title="Hủy yêu cầu cứu hộ"
            variant="ghost"
            style={{ borderWidth: 1, borderColor: COLORS.gray[200] }}
            onPress={handleCancel}
          />
        </View>
      </ScrollView>
    </View>
  );
}
