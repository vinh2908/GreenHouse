import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, SafeAreaView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, Linking, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, Flame, Zap, Droplets, Key, ShieldAlert,
  MapPin, PhoneCall, AlertTriangle, CheckCircle2, Clock, Navigation,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useCreateSosJob } from '@/hooks/use-api';
import { locationService } from '@/services/location.service';
import { Button, Card, LoadingSpinner, COLORS, Separator, PriceText } from '@/components/ui';

// ── Danh sách sự cố SOS khẩn cấp hợp lệ (Whitelist) ──────────────────────────
const SOS_CATEGORIES = [
  {
    id: 'electrician',
    name: 'Chập điện & Cháy khét ổ cắm',
    emoji: '⚡',
    desc: 'Mất điện toàn nhà, ổ cắm tóe lửa, mùi khét dây điện',
    color: '#EF4444',
    bg: '#FEF2F2',
  },
  {
    id: 'plumbing',
    name: 'Vỡ đường ống nước & Ngập sàn',
    emoji: '🚰',
    desc: 'Bục ống nước, van tổng không khóa được, nước tràn ngập nhà',
    color: '#3B82F6',
    bg: '#EFF6FF',
  },
  {
    id: 'locksmith',
    name: 'Kẹt khóa & Mất chìa khẩn cấp',
    emoji: '🔑',
    desc: 'Kẹt khóa cửa ngoài, trẻ nhỏ/người già bị kẹt bên trong phòng',
    color: '#F59E0B',
    bg: '#FFFBEB',
  },
  {
    id: 'ac_repair',
    name: 'Rò rỉ khí gas máy lạnh',
    emoji: '❄️',
    desc: 'Mùi gas nồng nặc trong phòng kín, rung lắc rơi dàn lạnh',
    color: '#06B6D4',
    bg: '#ECFEFF',
  },
];

export default function SosScreen() {
  const router = useRouter();
  const createSos = useCreateSosJob();

  const [selectedCategory, setSelectedCategory] = useState('electrician');
  const [address, setAddress] = useState({
    full_address: '128 Đường Lê Lợi, Phường Bến Thành',
    ward: 'Phường Bến Thành',
    district: 'Quận 1',
    city: 'Hồ Chí Minh',
    coordinates: [106.6983, 10.7725] as [number, number],
  });
  const [description, setDescription] = useState('Sự cố khẩn cấp cần thợ có mặt xử lý ngay lập tức!');
  const [isLocating, setIsLocating] = useState(false);

  // Tự động định vị GPS bằng OpenStreetMap khi mở màn hình SOS
  useEffect(() => {
    fetchLiveLocation();
  }, []);

  const fetchLiveLocation = async () => {
    setIsLocating(true);
    try {
      const details = await locationService.getCurrentLocationDetails();
      if (details) {
        setAddress({
          full_address: details.road || details.full_address,
          ward: details.ward || 'Phường Bến Thành',
          district: details.district || 'Quận 1',
          city: details.city || 'Hồ Chí Minh',
          coordinates: details.coordinates,
        });
      }
    } catch { /* ignore */ }
    finally {
      setIsLocating(false);
    }
  };

  const selectedCatObj = SOS_CATEGORIES.find(c => c.id === selectedCategory) || SOS_CATEGORIES[0];
  const surcharge = 100000;
  const baseCost = 200000;
  const totalEstimate = baseCost + surcharge;

  const handleCallEmergency = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleSendSos = async () => {
    try {
      const res = await createSos.mutateAsync({
        category: selectedCategory,
        title: selectedCatObj.name,
        description: description,
        address: {
          full_address: address.full_address,
          ward: address.ward,
          district: address.district,
          city: address.city,
          location: { type: 'Point', coordinates: address.coordinates || [106.6983, 10.7725] },
        },
        surcharge: surcharge,
      });

      const newJobId = (res as any)?.data?.data?._id || (res as any)?.data?._id || (res as any)?._id;
      Toast.show({
        type: 'success',
        text1: '🚨 ĐÃ PHÁT TÍN HIỆU CỨU HỘ SOS!',
        text2: 'Hệ thống đang điều phối các thợ gần nhất có mặt sau 15 phút.',
      });

      if (newJobId) {
        router.replace({ pathname: '/sos-tracking/[id]', params: { id: String(newJobId) } });
      } else {
        router.replace('/(customer)/jobs');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Gửi yêu cầu cứu hộ thất bại';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* ── Top Header ─────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 14,
          backgroundColor: '#EF4444',
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ShieldAlert size={22} color="#FFFFFF" />
          <Text style={{ fontSize: 18, fontWeight: '900', color: '#FFFFFF' }}>
            CỨU HỘ KHẨN CẤP SOS
          </Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>

          {/* ── CẢNH BÁO AN TOÀN TÍNH MẠNG / CHÁY NỔ ───────────────────── */}
          <Card style={{ backgroundColor: '#FEF2F2', borderColor: '#F87171', borderWidth: 2, padding: 14, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={20} color="#DC2626" />
              <Text style={{ fontSize: 14, fontWeight: '900', color: '#B91C1C' }}>
                CẢNH BÁO NGUY HIỂM TÍNH MẠNG / HỎA HOẠN
              </Text>
            </View>
            <Text style={{ fontSize: 12.5, color: '#991B1B', lineHeight: 18 }}>
              Nếu sự cố có nguy cơ cháy nổ lớn hoặc đe dọa tính mạng, vui lòng gọi cơ quan cứu hộ quốc gia ngay:
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
              <TouchableOpacity
                onPress={() => handleCallEmergency('114')}
                style={{ flex: 1, backgroundColor: '#DC2626', borderRadius: 10, paddingVertical: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
              >
                <PhoneCall size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Gọi 114 (Cứu hỏa)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleCallEmergency('115')}
                style={{ flex: 1, backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
              >
                <PhoneCall size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Gọi 115 (Cấp cứu)</Text>
              </TouchableOpacity>
            </View>
          </Card>

          {/* ── 1. CHỌN NHANH SỰ CỐ KHẨN CẤP (1 CHẠM) ─────────────────── */}
          <Text style={{ fontSize: 16, fontWeight: '900', color: COLORS.gray[900] }}>
            1. Chọn loại sự cố khẩn cấp (1 chạm):
          </Text>

          <View style={{ gap: 10 }}>
            {SOS_CATEGORIES.map(cat => {
              const isSelected = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  activeOpacity={0.8}
                  onPress={() => setSelectedCategory(cat.id)}
                  style={{
                    backgroundColor: isSelected ? cat.bg : '#FFFFFF',
                    borderWidth: 2,
                    borderColor: isSelected ? cat.color : COLORS.gray[200],
                    borderRadius: 16,
                    padding: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <Text style={{ fontSize: 32 }}>{cat.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                      {cat.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}>
                      {cat.desc}
                    </Text>
                  </View>
                  {isSelected && (
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: cat.color, alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle2 size={16} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── 2. XÁC NHẬN VỊ TRÍ HIỆN TẠI (GPS TỰ ĐỘNG) ──────────────── */}
          <Card style={{ padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.gray[900] }}>
                2. Vị trí cứu hộ (OpenStreetMap)
              </Text>
              <TouchableOpacity
                onPress={fetchLiveLocation}
                disabled={isLocating}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
              >
                {isLocating ? (
                  <ActivityIndicator size="small" color={COLORS.success} />
                ) : (
                  <Navigation size={12} color={COLORS.success} />
                )}
                <Text style={{ fontSize: 11, color: COLORS.success, fontWeight: '700' }}>
                  {isLocating ? 'Đang dò GPS...' : 'Định vị lại'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: COLORS.gray[50], padding: 12, borderRadius: 12 }}>
              <MapPin size={18} color={COLORS.primary} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[900] }}>
                  {address.full_address}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}>
                  {address.ward ? address.ward + ', ' : ''}{address.district}, {address.city}
                </Text>
              </View>
            </View>
          </Card>

          {/* ── 3. CHI PHÍ SOS & CAM KẾT THỜI GIAN ──────────────────────── */}
          <Card style={{ padding: 16, gap: 12, backgroundColor: '#FFF7ED', borderColor: '#FFD9C5', borderWidth: 1.5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Clock size={18} color={COLORS.primary} />
                <Text style={{ fontSize: 15, fontWeight: '900', color: COLORS.gray[900] }}>
                  Thời gian thợ có mặt
                </Text>
              </View>
              <View style={{ backgroundColor: COLORS.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>15 - 20 PHÚT</Text>
              </View>
            </View>

            <Separator my={2} />

            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: COLORS.gray[600] }}>Công thợ cứu hộ cơ bản:</Text>
                <PriceText amount={baseCost} size={14} color={COLORS.gray[900]} bold={false} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: COLORS.gray[600] }}>Phụ phí cứu hộ khẩn cấp (+50%):</Text>
                <PriceText amount={surcharge} size={14} color="#DC2626" bold={false} />
              </View>
              <Separator my={2} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: COLORS.gray[900] }}>Ước tính tổng cộng:</Text>
                <PriceText amount={totalEstimate} size={18} color="#DC2626" />
              </View>
            </View>

            <Text style={{ fontSize: 11.5, color: COLORS.gray[500], lineHeight: 16 }}>
              * Phụ phí khẩn cấp dùng để ưu tiên thợ di chuyển ngay lập tức. Khách hàng chỉ thanh toán sau khi thợ hoàn tất xử lý sự cố.
            </Text>
          </Card>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── NÚT GỌI CỨU HỘ SOS TO RỰC RỠ Ở ĐÁY ───────────────────────── */}
      <View
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14,
          borderTopWidth: 1, borderTopColor: COLORS.gray[200],
          shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1, shadowRadius: 10, elevation: 10,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.88}
          disabled={createSos.isPending}
          onPress={handleSendSos}
          style={{
            backgroundColor: '#DC2626',
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 10,
            shadowColor: '#DC2626',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.45,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          <Flame size={24} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '900', letterSpacing: 0.5 }}>
            {createSos.isPending ? 'ĐANG PHÁT TÍN HIỆU...' : 'GỌI CỨU HỘ SOS NGAY (15P CÓ MẶT)'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
