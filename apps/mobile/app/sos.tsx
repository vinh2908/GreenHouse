import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Flame,
  Zap,
  Droplets,
  Key,
  ShieldAlert,
  MapPin,
  PhoneCall,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Navigation,
  Wind,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useCreateSosJob } from '@/hooks/use-api';
import { lightImpact } from '@/services/haptics';
import { useTranslation } from '@/hooks/use-i18n';
import { locationService, parseVietnameseAddress } from '@/services/location.service';
import { Button, Card, LoadingSpinner, COLORS, Separator, PriceText, useThemeColors } from '@/components/ui';

// ── Danh sách sự cố SOS khẩn cấp hợp lệ (Whitelist) ──────────────────────────
const SOS_CATEGORIES = [
  {
    id: 'electrician',
    name: 'Chập điện & Cháy khét ổ cắm',
    icon: Zap,
    desc: 'Mất điện toàn nhà, ổ cắm tóe lửa, mùi khét dây điện',
    color: '#EF4444',
    bg: '#FEF2F2',
  },
  {
    id: 'plumbing',
    name: 'Vỡ đường ống nước & Ngập sàn',
    icon: Droplets,
    desc: 'Bục ống nước, van tổng không khóa được, nước tràn ngập nhà',
    color: '#3B82F6',
    bg: '#EFF6FF',
  },
  {
    id: 'locksmith',
    name: 'Kẹt khóa & Mất chìa khẩn cấp',
    icon: Key,
    desc: 'Kẹt khóa cửa ngoài, trẻ nhỏ/người già bị kẹt bên trong phòng',
    color: '#F59E0B',
    bg: '#FFFBEB',
  },
  {
    id: 'ac_repair',
    name: 'Rò rỉ khí gas máy lạnh',
    icon: Wind,
    desc: 'Mùi gas nồng nặc trong phòng kín, rung lắc rơi dàn lạnh',
    color: '#06B6D4',
    bg: '#ECFEFF',
  },
];

export default function SosScreen() {
  const router = useRouter();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();
  const createSos = useCreateSosJob();

  const sosCategories = [
    {
      id: 'electrician',
      name: lang === 'en' ? 'Electrical Short & Burning Smell' : 'Chập điện & Cháy khét ổ cắm',
      icon: Zap,
      desc:
        lang === 'en'
          ? 'Total blackout, sparking sockets, burning wires smell'
          : 'Mất điện toàn nhà, ổ cắm tóe lửa, mùi khét dây điện',
      color: '#EF4444',
      bg: '#FEF2F2',
    },
    {
      id: 'plumbing',
      name: lang === 'en' ? 'Burst Pipe & Floor Flooding' : 'Vỡ đường ống nước & Ngập sàn',
      icon: Droplets,
      desc:
        lang === 'en'
          ? 'Pipe burst, main valve stuck, severe indoor flooding'
          : 'Bục ống nước, van tổng không khóa được, nước tràn ngập nhà',
      color: '#3B82F6',
      bg: '#EFF6FF',
    },
    {
      id: 'locksmith',
      name: lang === 'en' ? 'Jammed Lock & Lost Key Emergency' : 'Kẹt khóa & Mất chìa khẩn cấp',
      icon: Key,
      desc:
        lang === 'en'
          ? 'Stuck door lock, child or elderly locked inside room'
          : 'Kẹt khóa cửa ngoài, trẻ nhỏ/người già bị kẹt bên trong phòng',
      color: '#F59E0B',
      bg: '#FFFBEB',
    },
    {
      id: 'ac_repair',
      name: lang === 'en' ? 'AC Gas Leak & Heavy Vibration' : 'Rò rỉ khí gas máy lạnh',
      icon: Wind,
      desc:
        lang === 'en'
          ? 'Strong gas odor in closed room, AC unit loose/falling'
          : 'Mùi gas nồng nặc trong phòng kín, rung lắc rơi dàn lạnh',
      color: '#06B6D4',
      bg: '#ECFEFF',
    },
  ];

  const [selectedCategory, setSelectedCategory] = useState('electrician');
  // Chỉ dùng địa chỉ thật từ GPS/reverse-geocode — không bịa sẵn phường/quận/
  // thành phố (khách ở Đà Nẵng từng bị gán địa chỉ Hồ Chí Minh). Geocoder
  // không trả được field nào thì để trống field đó (API đã cho phép).
  const [address, setAddress] = useState({
    full_address: '',
    ward: '',
    district: '',
    city: '',
    coordinates: [0, 0] as [number, number],
  });
  const [description, setDescription] = useState(
    lang === 'en'
      ? 'Emergency incident requiring immediate helper dispatch!'
      : 'Sự cố khẩn cấp cần thợ có mặt xử lý ngay lập tức!',
  );
  const [isLocating, setIsLocating] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);

  // Tự động định vị GPS bằng Goong Maps khi mở màn hình SOS
  useEffect(() => {
    fetchLiveLocation();
  }, []);

  const fetchLiveLocation = async () => {
    setIsLocating(true);
    let timer: any;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), 12000);
      });
      const details = await Promise.race([
        locationService.getCurrentLocationDetails(),
        timeoutPromise,
      ]);
      if (details) {
        const parsed = parseVietnameseAddress(details.full_address || details.road, details);
        setAddress({
          full_address: parsed.road || details.road || details.full_address,
          ward: parsed.ward || details.ward || '',
          district: parsed.district || details.district || '',
          city: parsed.city || details.city || '',
          coordinates: details.coordinates,
        });
      }
    } catch {
      /* ignore */
    } finally {
      if (timer) clearTimeout(timer);
      setIsLocating(false);
    }
  };

  const selectedCatObj = sosCategories.find(c => c.id === selectedCategory) || sosCategories[0];
  const surcharge = 100000;
  const baseCost = 200000;
  const totalEstimate = baseCost + surcharge;

  const handleCallEmergency = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const executeSendSos = async () => {
    // B20: rung nhẹ khi xác nhận gửi SOS
    void lightImpact();
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
          location: { type: 'Point', coordinates: address.coordinates },
        },
        surcharge: surcharge,
      });

      const newJobId =
        (res as any)?.data?.data?._id || (res as any)?.data?._id || (res as any)?._id;
      Toast.show({
        type: 'success',
        text1: lang === 'en' ? 'SOS Emergency Signal Sent!' : 'Đã phát tín hiệu cứu hộ SOS!',
        text2:
          lang === 'en'
            ? 'The system is dispatching nearest helpers to arrive within 15 minutes.'
            : 'Hệ thống đang điều phối các thợ gần nhất có mặt sau 15 phút.',
      });

      if (newJobId) {
        router.replace({ pathname: '/sos-tracking/[id]', params: { id: String(newJobId) } });
      } else {
        router.replace('/(customer)/jobs');
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        (lang === 'en' ? 'Failed to send SOS request' : 'Gửi yêu cầu cứu hộ thất bại');
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handleSendSos = () => {
    if (
      !address.full_address.trim() ||
      (address.coordinates[0] === 0 && address.coordinates[1] === 0)
    ) {
      Toast.show({
        type: 'error',
        text1: lang === 'en' ? 'Rescue address missing' : 'Chưa có địa chỉ cứu hộ',
        text2:
          lang === 'en'
            ? 'Please tap GPS locate or enter address below before sending SOS signal.'
            : 'Vui lòng bấm định vị GPS hoặc nhập địa chỉ cấp cứu bên dưới trước khi phát tín hiệu SOS.',
      });
      return;
    }

    const title = lang === 'en' ? 'Confirm Emergency SOS' : 'Xác nhận cứu hộ khẩn cấp';
    const msg =
      lang === 'en'
        ? `Emergency type: ${selectedCatObj.name}\nAddress: ${address.full_address}\nEstimated total: ${totalEstimate.toLocaleString('vi-VN')}₫ (includes emergency surcharge ${surcharge.toLocaleString('vi-VN')}₫).\n\nDo you want to dispatch SOS signal now?`
        : `Loại sự cố: ${selectedCatObj.name}\nĐịa chỉ: ${address.full_address}\nTổng tiền ước tính: ${totalEstimate.toLocaleString('vi-VN')}₫ (đã gồm phụ phí khẩn cấp: ${surcharge.toLocaleString('vi-VN')}₫).\n\nBạn có chắc chắn muốn gửi tín hiệu cứu hộ SOS ngay?`;

    Alert.alert(title, msg, [
      {
        text: lang === 'en' ? 'Cancel' : 'Hủy',
        style: 'cancel',
      },
      {
        text: lang === 'en' ? 'Send SOS' : 'Gửi SOS',
        style: 'destructive',
        onPress: executeSendSos,
      },
    ]);
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      {/* ── Top Header (Safe Insets) ─────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: '#EF4444',
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={{
            width: 38,
            height: 38,
            borderRadius: 14,
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ShieldAlert size={22} color="#FFFFFF" />
          <Text style={{ fontSize: fs(18), fontWeight: '900', color: '#FFFFFF' }}>
            {lang === 'en' ? 'EMERGENCY SOS DISPATCH' : 'CỨU HỘ KHẨN CẤP SOS'}
          </Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}
        >
          {/* ── CẢNH BÁO AN TOÀN TÍNH MẠNG / CHÁY NỔ ───────────────────── */}
          <Card
            style={{
              backgroundColor: '#FEF2F2',
              borderColor: '#F87171',
              borderWidth: 2,
              padding: 14,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={20} color="#DC2626" />
              <Text style={{ fontSize: fs(14), fontWeight: '900', color: '#B91C1C' }}>
                {lang === 'en'
                  ? 'LIFE THREATENING / FIRE HAZARD WARNING'
                  : 'CẢNH BÁO NGUY HIỂM TÍNH MẠNG / HỎA HOẠN'}
              </Text>
            </View>
            <Text style={{ fontSize: fs(12.5), color: '#991B1B', lineHeight: 18 }}>
              {lang === 'en'
                ? 'If the incident poses high fire risk or threatens life, please immediately call national emergency authorities:'
                : 'Nếu sự cố có nguy cơ cháy nổ lớn hoặc đe dọa tính mạng, vui lòng gọi cơ quan cứu hộ quốc gia ngay:'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
              <TouchableOpacity
                onPress={() => handleCallEmergency('114')}
                style={{
                  flex: 1,
                  backgroundColor: '#DC2626',
                  borderRadius: 8,
                  paddingVertical: 8,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <PhoneCall size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(13) }}>
                  {lang === 'en' ? 'Call 114 (Firefighters)' : 'Gọi 114 (Cứu hỏa)'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleCallEmergency('115')}
                style={{
                  flex: 1,
                  backgroundColor: '#2563EB',
                  borderRadius: 8,
                  paddingVertical: 8,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <PhoneCall size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(13) }}>
                  {lang === 'en' ? 'Call 115 (Ambulance)' : 'Gọi 115 (Cấp cứu)'}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>

          {/* ── 1. CHỌN NHANH SỰ CỐ KHẨN CẤP (1 CHẠM) ─────────────────── */}
          <Text style={{ fontSize: fs(16), fontWeight: '900', color: tc.text }}>
            {lang === 'en'
              ? '1. Select Emergency Type (1-Tap):'
              : '1. Chọn loại sự cố khẩn cấp (1 chạm):'}
          </Text>

          <View style={{ gap: 10 }}>
            {sosCategories.map(cat => {
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
                    borderRadius: 14,
                    padding: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      backgroundColor: cat.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {React.createElement(cat.icon, { size: 26, color: cat.color })}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fs(15), fontWeight: '800', color: tc.text }}>
                      {cat.name}
                    </Text>
                    <Text style={{ fontSize: fs(12), color: tc.textMuted, marginTop: 2 }}>
                      {cat.desc}
                    </Text>
                  </View>
                  {isSelected && (
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 14,
                        backgroundColor: cat.color,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CheckCircle2 size={16} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── 2. XÁC NHẬN VỊ TRÍ HIỆN TẠI (GPS TỰ ĐỘNG) ──────────────── */}
          <Card style={{ padding: 16, gap: 10 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: fs(14), fontWeight: '800', color: tc.text }}>
                {lang === 'en'
                  ? '2. Rescue Location (Goong Maps)'
                  : '2. Vị trí cứu hộ (Bản đồ Goong)'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  onPress={() => setIsEditingAddress(!isEditingAddress)}
                  style={{
                    backgroundColor: tc.subtle,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: fs(11), color: tc.textSecondary, fontWeight: '700' }}>
                    {isEditingAddress
                      ? lang === 'en'
                        ? 'Collapse'
                        : 'Thu gọn'
                      : lang === 'en'
                        ? 'Enter manually'
                        : 'Nhập tay'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={fetchLiveLocation}
                  disabled={isLocating}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: '#ECFDF5',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 8,
                  }}
                >
                  {isLocating ? (
                    <ActivityIndicator size="small" color={COLORS.success} />
                  ) : (
                    <Navigation size={12} color={COLORS.success} />
                  )}
                  <Text style={{ fontSize: fs(11), color: COLORS.success, fontWeight: '700' }}>
                    {isLocating
                      ? lang === 'en'
                        ? 'Locating GPS...'
                        : 'Đang dò GPS...'
                      : lang === 'en'
                        ? 'Relocate'
                        : 'Định vị lại'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {isEditingAddress ? (
              <View style={{ gap: 8, marginTop: 4 }}>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: COLORS.primary,
                    borderRadius: 8,
                    padding: 10,
                    fontSize: fs(14),
                    color: tc.text,
                    backgroundColor: tc.surface,
                  }}
                  placeholder={
                    lang === 'en'
                      ? 'House number, street, ward, district...'
                      : 'Gõ số nhà, tên đường, phường, quận...'
                  }
                  value={address.full_address}
                  onChangeText={v => setAddress(a => ({ ...a, full_address: v }))}
                  placeholderTextColor={COLORS.gray[400]}
                />
                <TouchableOpacity
                  onPress={async () => {
                    if (address.full_address.trim()) {
                      const places = await locationService.searchPlaces(
                        address.full_address.trim(),
                      );
                      if (places && places.length > 0) {
                        const p = places[0];
                        setAddress({
                          full_address: p.display_name,
                          ward: p.address?.suburb || '',
                          district: p.address?.city_district || p.address?.district || '',
                          city: p.address?.city || p.address?.state || '',
                          coordinates: [parseFloat(p.lon), parseFloat(p.lat)],
                        });
                        setIsEditingAddress(false);
                        Toast.show({
                          type: 'success',
                          text1:
                            lang === 'en'
                              ? 'Coordinates found for address'
                              : 'Đã xác định tọa độ từ địa chỉ',
                        });
                      } else {
                        Toast.show({
                          type: 'error',
                          text1:
                            lang === 'en'
                              ? 'Could not find coordinates for this address, please enter more details'
                              : 'Không tìm thấy tọa độ cho địa chỉ này, vui lòng nhập chi tiết hơn',
                        });
                      }
                    }
                  }}
                  style={{
                    backgroundColor: COLORS.primary,
                    paddingVertical: 8,
                    borderRadius: 8,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: fs(13) }}>
                    {lang === 'en' ? 'Confirm this address' : 'Xác nhận địa chỉ này'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 8,
                  backgroundColor: tc.background,
                  padding: 12,
                  borderRadius: 14,
                }}
              >
                <MapPin size={18} color={COLORS.primary} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fs(14), fontWeight: '700', color: tc.text }}>
                    {address.full_address ||
                      (lang === 'en'
                        ? 'No location yet — tap "Relocate" or "Enter manually"'
                        : 'Chưa có vị trí — bấm "Định vị lại" hoặc "Nhập tay"')}
                  </Text>
                  <Text style={{ fontSize: fs(12), color: tc.textMuted, marginTop: 2 }}>
                    {[address.ward, address.district, address.city].filter(Boolean).join(', ')}
                  </Text>
                </View>
              </View>
            )}
          </Card>

          {/* ── 3. CHI PHÍ SOS & CAM KẾT THỜI GIAN ──────────────────────── */}
          <Card
            style={{
              padding: 16,
              gap: 12,
              backgroundColor: '#FFF7ED',
              borderColor: '#FFD9C5',
              borderWidth: 1.5,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Clock size={18} color={COLORS.primary} />
                <Text style={{ fontSize: fs(15), fontWeight: '900', color: tc.text }}>
                  {lang === 'en' ? 'Helper Arrival Time' : 'Thời gian thợ có mặt'}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: COLORS.primary,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: '#fff', fontSize: fs(13), fontWeight: '900' }}>
                  {lang === 'en' ? '15 - 20 MINUTES' : '15 - 20 PHÚT'}
                </Text>
              </View>
            </View>

            <Separator my={2} />

            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: fs(13), color: tc.textSecondary }}>
                  {lang === 'en' ? 'Base rescue fee:' : 'Công thợ cứu hộ cơ bản:'}
                </Text>
                <PriceText amount={baseCost} size={14} color={COLORS.gray[900]} bold={false} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: fs(13), color: tc.textSecondary }}>
                  {lang === 'en'
                    ? 'Emergency dispatch surcharge (+50%):'
                    : 'Phụ phí cứu hộ khẩn cấp (+50%):'}
                </Text>
                <PriceText amount={surcharge} size={14} color="#DC2626" bold={false} />
              </View>
              <Separator my={2} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: fs(15), fontWeight: '900', color: tc.text }}>
                  {lang === 'en' ? 'Estimated Total:' : 'Ước tính tổng cộng:'}
                </Text>
                <PriceText amount={totalEstimate} size={18} color="#DC2626" />
              </View>
            </View>

            <Text style={{ fontSize: fs(11.5), color: tc.textMuted, lineHeight: 16 }}>
              {lang === 'en'
                ? '* Emergency surcharge is used to prioritize immediate helper dispatch. You only pay after helper completes the resolution.'
                : '* Phụ phí khẩn cấp dùng để ưu tiên thợ di chuyển ngay lập tức. Khách hàng chỉ thanh toán sau khi thợ hoàn tất xử lý sự cố.'}
            </Text>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── NÚT GỌI CỨU HỘ SOS TO RỰC RỠ Ở ĐÁY ───────────────────────── */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: tc.surface,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderTopWidth: 1,
          borderTopColor: COLORS.gray[200],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1,
          shadowRadius: 10,
          elevation: 10,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.88}
          disabled={createSos.isPending}
          onPress={handleSendSos}
          style={{
            backgroundColor: '#DC2626',
            borderRadius: 14,
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
          <Text
            style={{ color: '#FFFFFF', fontSize: fs(17), fontWeight: '900', letterSpacing: 0.5 }}
          >
            {createSos.isPending
              ? lang === 'en'
                ? 'DISPATCHING SIGNAL...'
                : 'ĐANG PHÁT TÍN HIỆU...'
              : lang === 'en'
                ? 'CALL EMERGENCY SOS NOW (15M ARRIVAL)'
                : 'GỌI CỨU HỘ SOS NGAY (15P CÓ MẶT)'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
