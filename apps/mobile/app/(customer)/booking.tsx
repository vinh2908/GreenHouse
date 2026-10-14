import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Calendar,
  Clock,
  FileText,
  Sparkles,
  ChevronRight,
  Check,
  Search,
  Navigation,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import dayjs from 'dayjs';
import { useServices, useCreateJob, useAnalyzeBooking, useEstimatePrice } from '@/hooks/use-api';
import { locationService, OsmPlace } from '@/services/location.service';
import { Button, Input, Card, COLORS, LoadingSpinner, PriceText } from '@/components/ui';

const STEPS = ['Dịch vụ', 'Địa chỉ', 'Lịch hẹn', 'Mô tả', 'Xác nhận'];

const TIME_SLOTS = [
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
];

const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 8];

const DEFAULT_SERVICES = [
  {
    _id: '6aa1269cd33a3aed2b36a5e1',
    name: 'Dọn dẹp vệ sinh nhà cửa',
    slug: 'house_cleaning',
    icon: '🏠',
    description: 'Lau sàn, hút bụi, dọn phòng khách, phòng ngủ, nhà bếp, vệ sinh...',
    base_price_min: 80000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e2',
    name: 'Đi chợ & Nấu ăn gia đình',
    slug: 'cooking',
    icon: '🍳',
    description: 'Đi chợ mua nguyên liệu, nấu cơm canh, món mặn, món chay theo yêu cầu...',
    base_price_min: 100000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e3',
    name: 'Giặt giũ & Là ủi quần áo',
    slug: 'laundry',
    icon: '👔',
    description: 'Phân loại, giặt tay/máy, phơi, gấp, là ủi quần áo gọn gàng...',
    base_price_min: 70000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e4',
    name: 'Chăm sóc Gia Chủ',
    slug: 'family_care',
    icon: '👨‍👩‍👧',
    description: 'Trông trẻ, chăm sóc người già, người bệnh, hỗ trợ bà bầu...',
    base_price_min: 120000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e5',
    name: 'Chăm sóc thú cưng',
    slug: 'petcare',
    icon: '🐾',
    description: 'Cho ăn, tắm rửa, dắt đi dạo, vệ sinh chuồng trại thú cưng...',
    base_price_min: 80000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e6',
    name: 'Chăm sóc cây cảnh',
    slug: 'plantcare',
    icon: '🌿',
    description: 'Tưới cây, bón phân, cắt tỉa, thay chậu, phòng trừ sâu bệnh...',
    base_price_min: 80000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e7',
    name: 'Trông giữ & Quản lý nhà cửa',
    slug: 'house_management',
    icon: '🔐',
    description: 'Trông coi nhà khi vắng, nhận bưu phẩm, kiểm tra an ninh, bảo trì...',
    base_price_min: 150000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e8',
    name: 'Giúp việc theo giờ',
    slug: 'hourly_helper',
    icon: '🧹',
    description: 'Dọn dẹp, rửa chén, lau kính, hỗ trợ việc nhà linh hoạt theo giờ...',
    base_price_min: 60000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e9',
    name: 'Tổng vệ sinh nhà cửa',
    slug: 'deep_cleaning',
    icon: '✨',
    description: 'Vệ sinh toàn bộ nhà chuyên sâu, chà sàn, lau kính, tẩy rửa...',
    base_price_min: 500000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5ea',
    name: 'Dọn nhà & Chuyển nhà',
    slug: 'moving_help',
    icon: '📦',
    description: 'Đóng gói đồ đạc, sắp xếp, vận chuyển, bày trí nhà mới...',
    base_price_min: 200000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5eb',
    name: 'Phụ việc lặt vặt',
    slug: 'handyman',
    icon: '🔧',
    description: 'Treo tranh, lắp kệ, sửa nhỏ, thay bóng đèn, việc vặt trong nhà...',
    base_price_min: 80000,
  },
];

export default function BookingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ service_id?: string; service_slug?: string }>();
  const { data: services } = useServices();
  const createJob = useCreateJob();
  const analyzeAI = useAnalyzeBooking();
  const estimatePrice = useEstimatePrice();

  const [step, setStep] = useState(params.service_id ? 1 : 0);
  const [selectedService, setSelectedService] = useState<string>(params.service_id ?? '');
  const [address, setAddress] = useState({
    full_address: '',
    ward: '',
    district: '',
    city: 'Hồ Chí Minh',
    coordinates: [106.6983, 10.7725] as [number, number],
  });

  const [isLocating, setIsLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OsmPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [date, setDate] = useState(dayjs().add(1, 'day').format('YYYY-MM-DD'));
  const [timeSlot, setTimeSlot] = useState('09:00');
  const [duration, setDuration] = useState(3);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [aiInput, setAiInput] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<{
    service_type?: string;
    service_name?: string;
    estimated_duration_hours?: number;
    num_workers?: number;
    tasks?: string[];
    price_min?: number;
    price_max?: number;
    confidence?: number;
    notes?: string;
  } | null>(null);
  const [priceEstimate, setPriceEstimate] = useState<{
    price_min: number;
    price_max: number;
  } | null>(null);

  // Khi params thay đổi hoặc chuyển vào màn hình
  useEffect(() => {
    if (params.service_id) {
      setSelectedService(params.service_id);
      setStep(1);
    } else {
      setSelectedService('');
      setStep(0);
    }
  }, [params.service_id, params.service_slug]);

  const resetForm = () => {
    setStep(0);
    setSelectedService('');
    setAddress({
      full_address: '',
      ward: '',
      district: '',
      city: 'Hồ Chí Minh',
      coordinates: [106.6983, 10.7725],
    });
    setDate(dayjs().add(1, 'day').format('YYYY-MM-DD'));
    setTimeSlot('09:00');
    setDuration(3);
    setTitle('');
    setDescription('');
    setAiInput('');
    setAiSuggestion(null);
    setPriceEstimate(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const selectedServiceData = services?.find(s => s._id === selectedService);

  // ── OpenStreetMap GPS & Search Handlers ────────────────────────────────────
  const handleGetLiveLocation = async () => {
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
        Toast.show({
          type: 'success',
          text1: 'Đã định vị thành công (OpenStreetMap)',
          text2: details.full_address,
        });
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể lấy vị trí hiện tại' });
    } finally {
      setIsLocating(false);
    }
  };

  const handleSearchAddress = async (text: string) => {
    setSearchQuery(text);
    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await locationService.searchPlaces(text);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectOsmPlace = (place: OsmPlace) => {
    const addr = place.address || {};
    const house = addr.house_number ? `${addr.house_number} ` : '';
    const street = `${house}${addr.road || ''}`.trim() || place.display_name.split(',')[0];
    const ward = addr.suburb || addr.quarter || addr.neighbourhood || '';
    const district = addr.city_district || addr.district || addr.county || 'Quận 1';
    const city = addr.city || addr.state || 'Hồ Chí Minh';

    setAddress({
      full_address: street || place.display_name.split(',').slice(0, 2).join(', '),
      ward,
      district,
      city,
      coordinates: [parseFloat(place.lon), parseFloat(place.lat)],
    });

    setSearchQuery('');
    setSearchResults([]);
    Toast.show({
      type: 'success',
      text1: 'Đã chọn địa điểm từ bản đồ',
      text2: place.display_name.split(',').slice(0, 2).join(', '),
    });
  };

  const handleAiAnalyze = async () => {
    if (!aiInput.trim()) return;
    try {
      const { data } = await analyzeAI.mutateAsync(aiInput);
      const result = data.data;
      setAiSuggestion(result);

      // Tự động gán Dịch vụ phù hợp
      if (result.service_type) {
        const svcList = services && services.length > 0 ? services : DEFAULT_SERVICES;
        const svc = svcList.find(
          s =>
            s.slug === result.service_type ||
            s.name.toLowerCase().includes(result.service_type.toLowerCase()),
        );
        if (svc) {
          setSelectedService(svc._id);
        } else {
          // Fallback map tương đối
          const fallbackSvc = svcList.find(s =>
            result.service_type.includes('clean')
              ? s.slug.includes('clean') || s.slug.includes('housekeeping')
              : result.service_type.includes('cook')
                ? s.slug.includes('cook')
                : result.service_type.includes('repair') ||
                    result.service_type.includes('electric') ||
                    result.service_type.includes('chay') ||
                    result.service_type.includes('dien')
                  ? s.slug.includes('electric') || s.slug.includes('plumb') || s.slug.includes('ac')
                  : true,
          );
          if (fallbackSvc) setSelectedService(fallbackSvc._id);
        }
      }

      // Tự động điền thời gian ước tính
      if (result.estimated_duration_hours) {
        setDuration(Math.min(Math.max(Math.round(result.estimated_duration_hours), 1), 8));
      }

      // Tự động điền Tiêu đề và Mô tả chi tiết
      if (result.service_name || result.tasks) {
        setTitle(result.service_name || aiInput.slice(0, 60));
        const tasksList = result.tasks?.length
          ? `\n\nCác hạng mục cần làm:\n• ${result.tasks.join('\n• ')}`
          : '';
        const notesStr = result.notes ? `\n\nGhi chú: ${result.notes}` : '';
        setDescription(`${aiInput}${tasksList}${notesStr}`);
      }

      Toast.show({
        type: 'success',
        text1: 'AI đã phân tích thành công!',
        text2: 'Đã tự động chọn dịch vụ & tạo chi tiết công việc',
      });
    } catch {
      Toast.show({ type: 'error', text1: 'Phân tích thất bại, vui lòng thử lại' });
    }
  };

  const handleEstimatePrice = async () => {
    if (!description || !selectedService) return;
    try {
      const svc = services?.find(s => s._id === selectedService);
      const { data } = await estimatePrice.mutateAsync({
        description,
        service_type: svc?.slug,
      });
      setPriceEstimate(data.data);
    } catch {
      /* ignore */
    }
  };

  const handleSubmit = async () => {
    // Nếu chưa có service_id, tự động lấy service mặc định đầu tiên
    let currentServiceId = selectedService;
    if (!currentServiceId) {
      const defaultSvc = (services && services.length > 0 ? services : DEFAULT_SERVICES)[0];
      currentServiceId = defaultSvc._id;
      setSelectedService(currentServiceId);
    }

    if (!address.full_address.trim() || !address.district.trim()) {
      Toast.show({ type: 'error', text1: 'Vui lòng nhập đầy đủ địa chỉ làm việc' });
      setStep(1);
      return;
    }
    if (!date || !timeSlot) {
      Toast.show({ type: 'error', text1: 'Vui lòng chọn thời gian bắt đầu' });
      setStep(2);
      return;
    }
    if (!title.trim() || !description.trim()) {
      Toast.show({ type: 'error', text1: 'Vui lòng điền tiêu đề và mô tả công việc' });
      setStep(3);
      return;
    }

    try {
      await createJob.mutateAsync({
        service_id: currentServiceId,
        title: title.trim(),
        description: description.trim(),
        address: {
          full_address: address.full_address.trim(),
          ward: address.ward?.trim() || undefined,
          district: address.district.trim(),
          city: address.city?.trim() || 'Hồ Chí Minh',
          location: { type: 'Point', coordinates: address.coordinates || [106.6983, 10.7725] },
        },
        preferred_date: date,
        preferred_time_start: timeSlot,
        is_flexible_time: false,
      });
      resetForm();
      router.replace('/(customer)/jobs');
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.message)
          ? err.response.data.message[0]
          : 'Đăng việc thất bại. Vui lòng thử lại');
      Toast.show({
        type: 'error',
        text1: typeof msg === 'string' ? msg : 'Đăng việc không thành công',
      });
    }
  };

  const handleNextStep = () => {
    if (step === 0) {
      if (!selectedService) {
        Toast.show({ type: 'error', text1: 'Vui lòng chọn 1 dịch vụ cần làm' });
        return;
      }
      setStep(1);
    } else if (step === 1) {
      if (!address.full_address.trim() || !address.district.trim()) {
        Toast.show({ type: 'error', text1: 'Vui lòng nhập địa chỉ chi tiết và quận/huyện' });
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!date || !timeSlot) {
        Toast.show({ type: 'error', text1: 'Vui lòng chọn ngày và giờ bắt đầu làm việc' });
        return;
      }
      setStep(3);
    } else if (step === 3) {
      if (!title.trim() || !description.trim()) {
        Toast.show({ type: 'error', text1: 'Vui lòng điền tiêu đề và mô tả công việc' });
        return;
      }
      setStep(4);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(s => s - 1);
    } else {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(customer)/home');
      }
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header (Safe Insets) */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
        }}
      >
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
        <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900], marginLeft: 12 }}>
          Đăng yêu cầu dịch vụ
        </Text>
      </View>

      {/* Progress bar */}
      <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          {STEPS.map((s, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: i <= step ? COLORS.primary : COLORS.gray[200],
              }}
            />
          ))}
        </View>
        <Text style={{ fontSize: 12, color: COLORS.gray[500], fontWeight: '600' }}>
          Bước {step + 1}/{STEPS.length}: {STEPS[step]}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 180 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── STEP 0: Chọn dịch vụ ─────────────────────────────────── */}
          {step === 0 && (
            <View style={{ gap: 16 }}>
              {/* AI Assistant */}
              <Card style={{ backgroundColor: '#1E1E24', gap: 12, padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={20} color={COLORS.primary} />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                    Mô tả để AI hỗ trợ
                  </Text>
                </View>
                <TextInput
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    padding: 12,
                    color: '#fff',
                    fontSize: 14,
                    minHeight: 80,
                    textAlignVertical: 'top',
                  }}
                  placeholder="VD: Tôi cần người dọn căn hộ 2 phòng ngủ vào chiều mai..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={aiInput}
                  onChangeText={setAiInput}
                  multiline
                />
                <Button
                  title="Phân tích với AI"
                  loading={analyzeAI.isPending}
                  onPress={handleAiAnalyze}
                  size="sm"
                  style={{ backgroundColor: COLORS.primary }}
                />
                {aiSuggestion && (
                  <View
                    style={{
                      gap: 8,
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      padding: 12,
                      borderRadius: 12,
                      borderLeftWidth: 3,
                      borderLeftColor: COLORS.primary,
                      marginTop: 4,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#34D399', fontWeight: '800', fontSize: 13.5 }}>
                        ✓ {aiSuggestion.service_name || 'Đã phân tích xong'}
                      </Text>
                      {aiSuggestion.estimated_duration_hours && (
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                          Ước tính: {aiSuggestion.estimated_duration_hours}h
                        </Text>
                      )}
                    </View>

                    {aiSuggestion.tasks && aiSuggestion.tasks.length > 0 && (
                      <View style={{ gap: 3 }}>
                        <Text
                          style={{
                            color: 'rgba(255,255,255,0.6)',
                            fontSize: 11.5,
                            fontWeight: '700',
                          }}
                        >
                          Hạng mục cần làm:
                        </Text>
                        {aiSuggestion.tasks.map((t, i) => (
                          <Text key={i} style={{ color: '#fff', fontSize: 12.5 }}>
                            • {t}
                          </Text>
                        ))}
                      </View>
                    )}

                    {aiSuggestion.price_min && (
                      <Text
                        style={{
                          color: '#FBBF24',
                          fontWeight: '800',
                          fontSize: 13.5,
                          marginTop: 2,
                        }}
                      >
                        Ước giá thị trường:{' '}
                        {new Intl.NumberFormat('vi-VN').format(aiSuggestion.price_min)}₫ –{' '}
                        {new Intl.NumberFormat('vi-VN').format(aiSuggestion.price_max ?? 0)}₫
                      </Text>
                    )}

                    {aiSuggestion.notes && (
                      <Text
                        style={{
                          color: 'rgba(255,255,255,0.5)',
                          fontSize: 11.5,
                          fontStyle: 'italic',
                        }}
                      >
                        💡 {aiSuggestion.notes}
                      </Text>
                    )}

                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => {
                        if (!selectedService) {
                          const svcList =
                            services && services.length > 0 ? services : DEFAULT_SERVICES;
                          setSelectedService(svcList[0]._id);
                        }
                        setStep(1);
                      }}
                      style={{
                        backgroundColor: COLORS.primary,
                        paddingVertical: 9,
                        borderRadius: 10,
                        alignItems: 'center',
                        marginTop: 4,
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                        Tiếp tục với gợi ý này →
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Card>

              <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.gray[800] }}>
                Hoặc chọn dịch vụ bên dưới:
              </Text>

              <View style={{ gap: 10 }}>
                {(services && services.length > 0 ? services : DEFAULT_SERVICES).map(svc => (
                  <TouchableOpacity
                    key={svc._id}
                    onPress={() => {
                      setSelectedService(svc._id);
                      setStep(1);
                    }}
                    style={{
                      borderWidth: 2,
                      borderColor: selectedService === svc._id ? COLORS.primary : COLORS.gray[200],
                      borderRadius: 16,
                      padding: 16,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      backgroundColor: selectedService === svc._id ? COLORS.primaryLight : '#fff',
                    }}
                  >
                    <Text style={{ fontSize: 32 }}>
                      {(
                        {
                          house_cleaning: '🏠',
                          cooking: '🍳',
                          laundry: '👔',
                          family_care: '👨‍👩‍👧',
                          petcare: '🐾',
                          plantcare: '🌿',
                          house_management: '🔐',
                          hourly_helper: '🧹',
                          deep_cleaning: '✨',
                          moving_help: '📦',
                          handyman: '🔧',
                        } as Record<string, string>
                      )[svc.slug] ?? '🏠'}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                        {svc.name}
                      </Text>
                      {svc.description && (
                        <Text
                          style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}
                          numberOfLines={1}
                        >
                          {svc.description}
                        </Text>
                      )}
                      {svc.base_price_min && (
                        <Text
                          style={{
                            fontSize: 12,
                            color: COLORS.primary,
                            marginTop: 4,
                            fontWeight: '700',
                          }}
                        >
                          Từ {new Intl.NumberFormat('vi-VN').format(svc.base_price_min)}₫
                        </Text>
                      )}
                    </View>
                    {selectedService === svc._id && (
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: COLORS.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={16} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ── STEP 1: Địa chỉ ──────────────────────────────────────── */}
          {step === 1 && (
            <View style={{ gap: 14 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.gray[900] }}>
                Địa chỉ làm việc
              </Text>

              {/* Nút GPS OpenStreetMap */}
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={isLocating}
                onPress={handleGetLiveLocation}
                style={{
                  borderWidth: 2,
                  borderColor: COLORS.primary,
                  borderRadius: 14,
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: COLORS.primaryLight,
                }}
              >
                {isLocating ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Navigation size={18} color={COLORS.primary} />
                )}
                <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: 14 }}>
                  {isLocating
                    ? 'Đang định vị vị trí...'
                    : 'Lấy vị trí GPS hiện tại (OpenStreetMap)'}
                </Text>
              </TouchableOpacity>

              {/* Ô Tìm kiếm địa điểm OpenStreetMap */}
              <View style={{ gap: 6, position: 'relative', zIndex: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  Tìm kiếm địa điểm trên bản đồ
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    backgroundColor: '#fff',
                    gap: 10,
                  }}
                >
                  <Search size={18} color={COLORS.gray[400]} />
                  <TextInput
                    style={{ flex: 1, paddingVertical: 12, fontSize: 14, color: COLORS.gray[900] }}
                    placeholder="Gõ tên đường, tòa nhà, chung cư..."
                    value={searchQuery}
                    onChangeText={handleSearchAddress}
                    placeholderTextColor={COLORS.gray[400]}
                  />
                  {isSearching && <ActivityIndicator size="small" color={COLORS.primary} />}
                </View>

                {/* Danh sách gợi ý địa điểm OpenStreetMap */}
                {searchResults.length > 0 && (
                  <Card
                    style={{
                      padding: 6,
                      gap: 0,
                      marginTop: 4,
                      maxHeight: 200,
                      borderColor: COLORS.primaryLight,
                      borderWidth: 1.5,
                    }}
                  >
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>
                      {searchResults.map((place, idx) => (
                        <TouchableOpacity
                          key={place.place_id || idx}
                          onPress={() => handleSelectOsmPlace(place)}
                          style={{
                            padding: 10,
                            borderBottomWidth: idx < searchResults.length - 1 ? 1 : 0,
                            borderBottomColor: COLORS.gray[100],
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            gap: 8,
                          }}
                        >
                          <MapPin size={16} color={COLORS.primary} style={{ marginTop: 2 }} />
                          <Text
                            style={{
                              fontSize: 13,
                              color: COLORS.gray[800],
                              flex: 1,
                              lineHeight: 18,
                            }}
                          >
                            {place.display_name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </Card>
                )}
              </View>

              <Input
                label="Địa chỉ chi tiết (Số nhà & tên đường) *"
                placeholder="VD: 128 Đường Lê Lợi"
                value={address.full_address}
                onChangeText={v => setAddress(a => ({ ...a, full_address: v }))}
                leftIcon={<MapPin size={16} color={COLORS.gray[400]} />}
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Phường/Xã"
                    placeholder="Phường 1"
                    value={address.ward}
                    onChangeText={v => setAddress(a => ({ ...a, ward: v }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Quận/Huyện *"
                    placeholder="Quận 1"
                    value={address.district}
                    onChangeText={v => setAddress(a => ({ ...a, district: v }))}
                  />
                </View>
              </View>
              <Input
                label="Thành phố"
                value={address.city}
                onChangeText={v => setAddress(a => ({ ...a, city: v }))}
              />
            </View>
          )}

          {/* ── STEP 2: Lịch hẹn ─────────────────────────────────────── */}
          {step === 2 && (
            <View style={{ gap: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.gray[900] }}>
                Chọn lịch hẹn
              </Text>

              {/* Date picker */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: COLORS.gray[700],
                    marginBottom: 10,
                  }}
                >
                  <Calendar size={14} color={COLORS.gray[600]} /> Ngày làm việc
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {Array.from({ length: 14 }).map((_, i) => {
                      const d = dayjs().add(i + 1, 'day');
                      const val = d.format('YYYY-MM-DD');
                      const isSelected = date === val;
                      return (
                        <TouchableOpacity
                          key={val}
                          onPress={() => setDate(val)}
                          style={{
                            width: 56,
                            alignItems: 'center',
                            paddingVertical: 10,
                            borderRadius: 14,
                            borderWidth: 2,
                            borderColor: isSelected ? COLORS.primary : COLORS.gray[200],
                            backgroundColor: isSelected ? COLORS.primary : '#fff',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              color: isSelected ? 'rgba(255,255,255,0.8)' : COLORS.gray[500],
                              fontWeight: '600',
                            }}
                          >
                            {d.format('ddd').toUpperCase()}
                          </Text>
                          <Text
                            style={{
                              fontSize: 18,
                              fontWeight: '800',
                              color: isSelected ? '#fff' : COLORS.gray[800],
                              marginTop: 2,
                            }}
                          >
                            {d.format('D')}
                          </Text>
                          <Text
                            style={{
                              fontSize: 11,
                              color: isSelected ? 'rgba(255,255,255,0.8)' : COLORS.gray[500],
                              fontWeight: '600',
                            }}
                          >
                            Th{d.format('M')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {/* Time slot */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: COLORS.gray[700],
                    marginBottom: 10,
                  }}
                >
                  Giờ bắt đầu
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {TIME_SLOTS.map(t => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setTimeSlot(t)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: timeSlot === t ? COLORS.primary : COLORS.gray[200],
                        backgroundColor: timeSlot === t ? COLORS.primaryLight : '#fff',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '700',
                          color: timeSlot === t ? COLORS.primary : COLORS.gray[700],
                        }}
                      >
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Duration */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: COLORS.gray[700],
                    marginBottom: 10,
                  }}
                >
                  Thời gian ước tính
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {DURATION_OPTIONS.map(d => (
                      <TouchableOpacity
                        key={d}
                        onPress={() => setDuration(d)}
                        style={{
                          paddingHorizontal: 20,
                          paddingVertical: 12,
                          borderRadius: 12,
                          borderWidth: 2,
                          borderColor: duration === d ? COLORS.primary : COLORS.gray[200],
                          backgroundColor: duration === d ? COLORS.primaryLight : '#fff',
                        }}
                      >
                        <Text
                          style={{
                            fontWeight: '800',
                            color: duration === d ? COLORS.primary : COLORS.gray[700],
                          }}
                        >
                          {d}h
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>
          )}

          {/* ── STEP 3: Mô tả ────────────────────────────────────────── */}
          {step === 3 && (
            <View style={{ gap: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.gray[900] }}>
                Chi tiết công việc
              </Text>

              <Input
                label="Tiêu đề yêu cầu *"
                placeholder="VD: Dọn dẹp căn hộ 2 phòng ngủ, giặt rèm cửa..."
                value={title}
                onChangeText={setTitle}
              />

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[700] }}>
                  Mô tả chi tiết *
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 15,
                    color: COLORS.gray[900],
                    backgroundColor: COLORS.gray[50],
                    minHeight: 120,
                    textAlignVertical: 'top',
                  }}
                  placeholder="Mô tả chi tiết: diện tích, tình trạng thiết bị, yêu cầu riêng..."
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              {/* AI Price estimate */}
              {description.length > 20 && (
                <TouchableOpacity
                  onPress={handleEstimatePrice}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: '#1E1E24',
                    borderRadius: 14,
                    padding: 14,
                  }}
                >
                  <Sparkles size={18} color={COLORS.primary} />
                  <Text style={{ color: '#fff', fontWeight: '700', flex: 1 }}>
                    {estimatePrice.isPending
                      ? 'Đang ước tính giá...'
                      : 'AI ước tính giá thị trường'}
                  </Text>
                  {!estimatePrice.isPending && (
                    <ChevronRight size={16} color="rgba(255,255,255,0.4)" />
                  )}
                </TouchableOpacity>
              )}

              {priceEstimate && (
                <Card style={{ backgroundColor: COLORS.primaryLight, gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.primary }}>
                    Ước tính giá (AI)
                  </Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.gray[900] }}>
                    {new Intl.NumberFormat('vi-VN').format(priceEstimate.price_min)}₫ –
                    {new Intl.NumberFormat('vi-VN').format(priceEstimate.price_max)}₫
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
                    Giá thực tế do thợ tự do báo giá cụ thể
                  </Text>
                </Card>
              )}
            </View>
          )}

          {/* ── STEP 4: Xác nhận ─────────────────────────────────────── */}
          {step === 4 && (
            <View style={{ gap: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.gray[900] }}>
                Xác nhận yêu cầu
              </Text>

              <Card style={{ gap: 14 }}>
                <Row icon="🏠" label="Dịch vụ" value={selectedServiceData?.name ?? '—'} />
                <Row
                  icon="📍"
                  label="Địa chỉ"
                  value={`${address.full_address}, ${address.district}, ${address.city}`}
                />
                <Row icon="📅" label="Ngày" value={dayjs(date).format('dddd, DD/MM/YYYY')} />
                <Row icon="🕐" label="Giờ" value={`${timeSlot} • ${duration} giờ`} />
                <View style={{ height: 1, backgroundColor: COLORS.gray[100] }} />
                <Text style={{ fontWeight: '800', fontSize: 16, color: COLORS.gray[900] }}>
                  {title}
                </Text>
                <Text style={{ color: COLORS.gray[600], fontSize: 14, lineHeight: 20 }}>
                  {description}
                </Text>
              </Card>

              <Card
                style={{
                  backgroundColor: '#FFF7ED',
                  flexDirection: 'row',
                  gap: 10,
                  alignItems: 'flex-start',
                }}
              >
                <Text style={{ fontSize: 20 }}>💡</Text>
                <Text style={{ flex: 1, fontSize: 13, color: COLORS.gray[700], lineHeight: 18 }}>
                  Sau khi đăng, các thợ xung quanh sẽ gửi báo giá. Bạn có thể tự do so sánh tay nghề
                  & giá cả trước khi chọn thợ.
                </Text>
              </Card>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom CTA */}
      <View
        style={{
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 92 : 72,
          left: 0,
          right: 0,
          backgroundColor: '#fff',
          paddingHorizontal: 20,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: COLORS.gray[100],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 10,
        }}
      >
        <Button
          title={step === STEPS.length - 1 ? 'Đăng yêu cầu ngay' : 'Tiếp theo'}
          loading={createJob.isPending}
          onPress={handleNextStep}
          icon={step < STEPS.length - 1 ? <ArrowRight size={18} color="#fff" /> : undefined}
        />
      </View>
    </View>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, color: COLORS.gray[500], fontWeight: '600' }}>{label}</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[900], marginTop: 2 }}>
          {value}
        </Text>
      </View>
    </View>
  );
}
