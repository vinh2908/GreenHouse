import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Calendar,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Clock,
  Check,
  Search,
  Navigation,
  Camera,
  ImagePlus,
  Trash2,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { Alert } from '@/components/common/app-alert';
import dayjs from 'dayjs';
import { useAuthStore } from '@/stores/auth.store';
import { ScalePressable } from '@/components/common/scale-pressable';
import { DateTimePickerBottomSheet } from '@/components/common/date-time-bottom-sheet';
import { DurationBottomSheet } from '@/components/common/duration-bottom-sheet';
import {
  useServices,
  useCreateJob,
  useAnalyzeBooking,
  useEstimatePrice,
  useAnalyzeIssuePhoto,
  useCreateRecurringPlan,
} from '@/hooks/use-api';
import type { IssuePhotoAnalysis } from '@/hooks/use-api';
import { locationService, OsmPlace, parseVietnameseAddress } from '@/services/location.service';
import { Button, Input, Card, COLORS } from '@/components/ui';
import { VoucherInput } from '@/components/common/voucher-input';
import type { VoucherPreview } from '@/hooks/use-api';
import { useTranslation } from '@/hooks/use-i18n';

const STEPS = ['Dịch vụ', 'Địa chỉ', 'Lịch hẹn', 'Mô tả', 'Xác nhận'];
const STEP_KEYS = [
  'booking_step_service',
  'booking_step_address',
  'booking_step_schedule',
  'booking_step_description',
  'booking_step_confirm',
];

const TIME_SLOTS = [
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
];

const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 8];

type BookingServiceOption = {
  _id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
  base_price_min: number;
  pricing_model?: 'quote' | 'fixed';
  fixed_price?: number;
};

const DEFAULT_SERVICES: BookingServiceOption[] = [
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
    slug: 'housekeeping_hourly',
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
  const { t, fs } = useTranslation();
  const params = useLocalSearchParams<{
    service_id?: string;
    service_slug?: string;
    favorite_helper_id?: string;
    favorite_helper_name?: string;
    prefill_title?: string;
    prefill_description?: string;
    package_mode?: string;
    custom_service_name?: string;
    target_price?: string;
    preferred_date?: string;
    preferred_time_start?: string;
    duration_hours?: string;
    attached_photo?: string;
    auto_analyze?: string;
  }>();
  const { data: services, isLoading: isLoadingServices } = useServices();
  const createJob = useCreateJob();
  const createRecurringPlan = useCreateRecurringPlan();
  const analyzeAI = useAnalyzeBooking();
  const estimatePrice = useEstimatePrice();
  const analyzeIssuePhoto = useAnalyzeIssuePhoto();

  // ── Roadmap Phase 1: gửi riêng cho thợ yêu thích + gói định kỳ ────────────
  const [offerToFavorite, setOfferToFavorite] = useState(!!params.favorite_helper_id);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFreq, setRecurringFreq] = useState<'weekly' | 'monthly'>('weekly');
  const [recurringWeekdays, setRecurringWeekdays] = useState<number[]>([
    dayjs().add(1, 'day').day(),
  ]);
  const [recurringMonthDay, setRecurringMonthDay] = useState(dayjs().add(1, 'day').date());
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherPreview, setVoucherPreview] = useState<VoucherPreview | null>(null);
  const [helpersNeeded, setHelpersNeeded] = useState(1); // Đơn nhóm (Feature 5)

  const [step, setStep] = useState(params.service_id || params.custom_service_name ? 1 : 0);
  const [selectedService, setSelectedService] = useState<string>(
    params.custom_service_name ? 'custom' : (params.service_id ?? ''),
  );
  const [customServiceName, setCustomServiceName] = useState(params.custom_service_name ?? '');
  const [targetPrice, setTargetPrice] = useState(params.target_price ?? '');
  const [address, setAddress] = useState({
    full_address: '',
    ward: '',
    district: '',
    city: '',
    notes: '',
    coordinates: [0, 0] as [number, number],
  });
  const [coordsDerived, setCoordsDerived] = useState(false);

  const [isLocating, setIsLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OsmPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const searchSeqRef = useRef(0);
  const searchTimeoutRef = useRef<any>(null);
  const [date, setDate] = useState(dayjs().add(1, 'day').format('YYYY-MM-DD'));
  const [dateChip, setDateChip] = useState<'today' | 'tomorrow' | 'sat' | 'sun' | null>('tomorrow');
  const [timeSlot, setTimeSlot] = useState('09:00');
  const [duration, setDuration] = useState(3);
  const [dateTimePickerOpen, setDateTimePickerOpen] = useState(false);
  const [bottomSheetInitialTab, setBottomSheetInitialTab] = useState<'date' | 'time'>('date');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(dayjs());
  const [customTimeOpen, setCustomTimeOpen] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState('');
  const [durationPickerOpen, setDurationPickerOpen] = useState(false);
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [customHours, setCustomHours] = useState(1);
  const [customMinutes, setCustomMinutes] = useState(30);
  const autoAnalyzedRef = useRef(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
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
  // Feature 17: kết quả phân tích ảnh sự cố bằng AI Vision
  const [photoAnalysis, setPhotoAnalysis] = useState<IssuePhotoAnalysis | null>(null);

  useEffect(() => {
    if (params.custom_service_name) {
      setSelectedService('custom');
      setCustomServiceName(params.custom_service_name);
      if (params.target_price) setTargetPrice(params.target_price.replace(/[^0-9]/g, ''));
      setStep(1);
    } else if (params.service_id) {
      setSelectedService(params.service_id);
      setStep(1);
    } else {
      setSelectedService('');
      setStep(0);
    }
    // Prefill ngày giờ nếu có
    if (params.preferred_date) {
      setDate(params.preferred_date);
      if (params.preferred_date === dayjs().format('YYYY-MM-DD')) setDateChip('today');
      else if (params.preferred_date === dayjs().add(1, 'day').format('YYYY-MM-DD'))
        setDateChip('tomorrow');
      else setDateChip(null);
    }
    if (params.preferred_time_start) {
      setTimeSlot(params.preferred_time_start);
      if (!TIME_SLOTS.includes(params.preferred_time_start)) {
        setCustomTimeInput(params.preferred_time_start);
      }
    }
    if (params.duration_hours) {
      const parsedDur = parseFloat(params.duration_hours);
      if (!isNaN(parsedDur) && parsedDur > 0) {
        setDuration(parsedDur);
        if (![1, 2, 3, 4].includes(parsedDur)) {
          setIsCustomDuration(true);
          const h = Math.floor(parsedDur);
          const m = Math.round((parsedDur - h) * 60);
          setCustomHours(h);
          setCustomMinutes(m);
        }
      }
    }
    if (params.attached_photo) {
      setPhotos([params.attached_photo]);
      setStep(3); // Bước 3: Mô tả & Ảnh sự cố
    }
    // Đặt lại / đặt từ thợ yêu thích: điền sẵn tiêu đề + mô tả của đơn cũ
    if (params.prefill_title) setTitle(params.prefill_title);
    if (params.prefill_description) setDescription(params.prefill_description);
    if (params.package_mode === 'recurring') setIsRecurring(true);
  }, [
    params.service_id,
    params.service_slug,
    params.custom_service_name,
    params.target_price,
    params.preferred_date,
    params.preferred_time_start,
    params.duration_hours,
    params.attached_photo,
  ]);

  useEffect(() => {
    if (params.attached_photo && params.auto_analyze === '1' && !autoAnalyzedRef.current) {
      autoAnalyzedRef.current = true;
      setTimeout(() => {
        handleAnalyzeIssuePhoto();
      }, 400);
    }
  }, [params.attached_photo, params.auto_analyze]);

  const resetForm = () => {
    setStep(0);
    setSelectedService('');
    setAddress({
      full_address: '',
      ward: '',
      district: '',
      city: '',
      notes: '',
      coordinates: [0, 0],
    });
    setCoordsDerived(false);
    setDate(dayjs().add(1, 'day').format('YYYY-MM-DD'));
    setTimeSlot('09:00');
    setDuration(3);
    setTitle('');
    setDescription('');
    setPhotos([]);
    setAiInput('');
    setAiSuggestion(null);
    setPriceEstimate(null);
    setPhotoAnalysis(null);
    setVoucherCode('');
    setVoucherPreview(null);
    setIsRecurring(false);
    setOfferToFavorite(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const svcList =
    services && services.length > 0 ? services : isLoadingServices ? [] : DEFAULT_SERVICES;
  const selectedServiceData = svcList.find(s => s._id === selectedService);
  // Feature 7: dịch vụ giá cam kết — giá cố định, không qua vòng báo giá
  const isFixedPriceService =
    selectedServiceData?.pricing_model === 'fixed' && (selectedServiceData?.fixed_price ?? 0) > 0;

  // ── Photo Pickers for Step 3 ───────────────────────────────────────────────
  const handleTakeJobPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Cần quyền truy cập camera để chụp ảnh hiện trạng' });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setPhotos(prev => [...prev, result.assets[0].uri].slice(0, 6));
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể mở máy ảnh' });
    }
  };

  const handlePickJobPhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Toast.show({ type: 'error', text1: 'Cần quyền truy cập thư viện ảnh' });
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 6,
        quality: 0.8,
      });
      if (!result.canceled && result.assets.length > 0) {
        const uris = result.assets.map(a => a.uri);
        setPhotos(prev => [...prev, ...uris].slice(0, 6));
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể chọn ảnh từ thư viện' });
    }
  };

  // ── Feature 17: Phân tích ảnh sự cố bằng AI Vision ─────────────────────────
  // Nếu đã có ảnh trong photos: phân tích ngay photos[0].
  // Nếu chưa có ảnh: mở picker để chọn 1 ảnh, thêm vào photos rồi phân tích.
  const handleAnalyzeIssuePhoto = async () => {
    const unavailableToast = (msg?: string) =>
      Toast.show({
        type: 'info',
        text1: 'Chưa phân tích được ảnh',
        text2: msg || 'Ảnh vẫn được đính kèm vào đơn, bạn tự mô tả giúp mình nhé',
      });

    setIsAnalyzingPhoto(true);
    try {
      let targetUri: string | undefined;
      let assetBase64: string | undefined;
      let assetMimeType: string | undefined;

      if (photos.length > 0) {
        // Đã có ảnh trong danh sách: phân tích ngay ảnh đầu tiên
        targetUri = photos[0];
      } else {
        // Chưa có ảnh: mở thư viện ảnh
        if (Platform.OS !== 'web') {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Toast.show({ type: 'error', text1: 'Cần quyền truy cập thư viện ảnh' });
            setIsAnalyzingPhoto(false);
            return;
          }
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsMultipleSelection: false,
          quality: 0.7,
          base64: true,
        });

        if (result.canceled || !result.assets[0]?.uri) {
          Toast.show({
            type: 'info',
            text1: 'Chưa chọn ảnh',
            text2: 'Vui lòng chọn ảnh chụp sự cố để AI phân tích',
          });
          setIsAnalyzingPhoto(false);
          return;
        }

        const asset = result.assets[0];
        targetUri = asset.uri;
        assetBase64 = asset.base64 ?? undefined;
        assetMimeType = asset.mimeType;
        setPhotos(prev => [...prev, targetUri!].slice(0, 6));
      }

      if (!targetUri) {
        unavailableToast('Không tìm thấy đường dẫn ảnh');
        return;
      }

      let base64: string | undefined = assetBase64;
      let mimeType: string = assetMimeType || 'image/jpeg';

      // 1. Kiểm tra nếu là Data URL
      if (!base64 && targetUri.startsWith('data:')) {
        const parts = targetUri.split(',');
        base64 = parts[1];
        const matchMime = parts[0].match(/:(.*?);/);
        if (matchMime) mimeType = matchMime[1];
      }

      // 2. Thử đọc native FileSystem
      if (!base64 && Platform.OS !== 'web' && FileSystem.readAsStringAsync) {
        try {
          base64 = await FileSystem.readAsStringAsync(targetUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch {
          /* ignore */
        }
      }

      // 3. Dự phòng đọc base64 trên trình duyệt Web (blob URI / fetch)
      if (!base64 && typeof fetch !== 'undefined') {
        try {
          const resp = await fetch(targetUri);
          const blob = await resp.blob();
          if (blob.type) mimeType = blob.type;
          base64 = await new Promise<string>((resolve, reject) => {
            const reader = new (globalThis as any).FileReader();
            reader.onloadend = () => {
              const resStr = (reader.result as string) || '';
              resolve(resStr.includes(',') ? resStr.split(',')[1] : resStr);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (fetchErr) {
          console.warn('Web blob read error:', fetchErr);
        }
      }

      if (!base64) {
        unavailableToast('Không thể đọc dữ liệu ảnh để phân tích AI');
        return;
      }

      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        mimeType = 'image/jpeg';
      }

      const { data } = await analyzeIssuePhoto.mutateAsync({
        image_base64: base64,
        mime_type: mimeType,
      });
      const res = data.data as IssuePhotoAnalysis;
      if (res?.available) {
        setPhotoAnalysis(res);
        if (res.description_draft) setDescription(res.description_draft);
        if (res.suggested_service_slug) {
          const svc = svcList.find(s => s.slug === res.suggested_service_slug);
          if (svc) {
            if (selectedService && selectedService !== svc._id) {
              const currentSvc = svcList.find(s => s._id === selectedService);
              Alert.alert(
                'AI gợi ý đổi dịch vụ',
                `AI nhận diện ảnh phù hợp với "${svc.name}" (hiện đang chọn "${currentSvc?.name || 'khác'}"). Bạn có muốn chuyển sang dịch vụ này không?`,
                [
                  { text: 'Giữ dịch vụ hiện tại', style: 'cancel' },
                  { text: 'Đổi sang ' + svc.name, onPress: () => setSelectedService(svc._id) },
                ],
              );
            } else {
              setSelectedService(svc._id);
            }
          } else {
            // Item 7: AI suggests a service slug not found in catalog -> inform user and switch to custom service
            const customName = res.suggested_service_name || res.suggested_service_slug;
            Alert.alert(
              'Gợi ý dịch vụ từ AI',
              `AI đề xuất dịch vụ "${customName}". Do danh mục chuẩn chưa có dịch vụ này, hệ thống đã chuyển sang "Dịch vụ theo yêu cầu" và điền sẵn tên dịch vụ cho bạn.`,
              [
                {
                  text: 'Đồng ý',
                  onPress: () => {
                    setSelectedService('custom');
                    setCustomServiceName(customName);
                  },
                },
              ],
            );
            setSelectedService('custom');
            setCustomServiceName(customName);
          }
        }
        Toast.show({
          type: 'success',
          text1: 'AI đã nhận diện sự cố trong ảnh!',
          text2: 'Đã điền sẵn mô tả & gợi ý dịch vụ cho bạn',
        });
      } else {
        unavailableToast(res?.message);
      }
    } catch (err: any) {
      console.warn('AI issue photo analysis error:', err);
      unavailableToast(err?.response?.data?.message || err?.message);
    } finally {
      setIsAnalyzingPhoto(false);
    }
  };

  // ── OpenStreetMap GPS & Search Handlers ────────────────────────────────────
  const handleGetLiveLocation = async () => {
    setIsLocating(true);
    let timer: any;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), 6000);
      });
      const details = await Promise.race([
        locationService.getCurrentLocationDetails(),
        timeoutPromise,
      ]);
      if (details) {
        const parsed = parseVietnameseAddress(details.full_address || details.road, details);
        setAddress(prev => ({
          ...prev,
          full_address: parsed.road || details.road || details.full_address || '',
          ward: parsed.ward || details.ward || '',
          district: parsed.district || details.district || '',
          city: parsed.city || details.city || '',
          coordinates: details.coordinates || prev.coordinates,
        }));
        setCoordsDerived(true);
        Toast.show({
          type: 'success',
          text1: 'Đã định vị vị trí của bạn',
          text2: parsed.full_address || details.full_address,
        });
      } else {
        Toast.show({
          type: 'info',
          text1: 'Không thể định vị tự động',
          text2: 'Vui lòng kiểm tra GPS hoặc nhập tay địa chỉ của bạn bên dưới.',
        });
      }
    } catch {
      Toast.show({
        type: 'info',
        text1: 'Không thể lấy vị trí hiện tại',
        text2: 'Vui lòng nhập tay địa chỉ của bạn bên dưới.',
      });
    } finally {
      if (timer) clearTimeout(timer);
      setIsLocating(false);
    }
  };

  const handleSearchAddress = (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (text.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    setHasSearched(false);
    const seq = ++searchSeqRef.current;
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const currentCoords =
          address.coordinates?.[0] && address.coordinates?.[1]
            ? { latitude: address.coordinates[1], longitude: address.coordinates[0] }
            : locationService.getCachedCoordinates();
        const results = await locationService.searchPlaces(text, currentCoords);
        if (seq === searchSeqRef.current) {
          setSearchResults(results);
          setHasSearched(true);
        }
      } catch {
        if (seq === searchSeqRef.current) {
          setSearchResults([]);
          setHasSearched(true);
        }
      } finally {
        if (seq === searchSeqRef.current) {
          setIsSearching(false);
        }
      }
    }, 350);
  };

  const handleSelectOsmPlace = (place: OsmPlace) => {
    setSearchResults([]);
    setHasSearched(false);
    setSearchQuery(place.display_name);
    if (place.lat && place.lon) {
      locationService.setCachedCoordinates({
        latitude: parseFloat(place.lat),
        longitude: parseFloat(place.lon),
      });
    }
    const addr = place.address || {};
    const house = addr.house_number ? `${addr.house_number} ` : '';
    let road = addr.road || addr.pedestrian || addr.suburb || '';
    let ward =
      addr.suburb || addr.quarter || addr.neighbourhood || addr.village || addr.commune || '';
    let district = addr.city_district || addr.district || addr.county || addr.borough || '';
    let city = addr.city || addr.state || addr.province || '';

    // 1. Nhận diện theo tiền tố hành chính tiếng Việt nếu có
    if (!district && place.display_name) {
      const matchDistrict = place.display_name.match(/(?:Quận|Huyện|Thị xã)\s+([^,]+)/i);
      if (matchDistrict) {
        district = matchDistrict[0].trim();
      }
    }
    if (!ward && place.display_name) {
      const matchWard = place.display_name.match(/(?:Phường|Xã|Thị trấn)\s+([^,]+)/i);
      if (matchWard) {
        ward = matchWard[0].trim();
      }
    }
    if (!city && place.display_name) {
      const matchCity = place.display_name.match(/(?:Thành phố|Tỉnh|TP\.?)\s+([^,]+)/i);
      if (matchCity) {
        city = matchCity[0].trim();
      }
    }

    // 2. Dự phòng phân tách token từ phải sang trái khi Nominatim/Photon không có tiền tố hành chính (vd Đà Nẵng)
    // Ví dụ: "254, Nguyễn Văn Linh, Phường Thạc Gián, Thanh Khê, Đà Nẵng, 550000, Việt Nam"
    if (place.display_name) {
      const tokens = place.display_name
        .split(',')
        .map(s => s.trim())
        .filter(
          s =>
            s.length > 0 &&
            !/^\d{4,6}$/.test(s) &&
            !/^Việt\s*Nam$/i.test(s) &&
            !/^Vietnam$/i.test(s),
        );

      if (tokens.length >= 1 && !city) {
        city = tokens[tokens.length - 1];
      }
      if (tokens.length >= 2 && !district) {
        district = tokens[tokens.length - 2];
      }
      if (tokens.length >= 3 && !ward) {
        ward = tokens[tokens.length - 3];
      }
      if (!road && tokens.length > 0) {
        road = tokens[0];
      }
    }

    const street = `${house}${road}`.trim() || place.display_name.split(',')[0].trim();
    const full_address = street || place.display_name.split(',').slice(0, 2).join(', ').trim();

    const parsed = parseVietnameseAddress(place.display_name, {
      road: street,
      ward,
      district,
      city,
      coordinates: [parseFloat(place.lon), parseFloat(place.lat)],
    });

    setAddress(prev => ({
      ...prev,
      full_address: parsed.road || street || '',
      ward: parsed.ward || ward || '',
      district: parsed.district || district || '',
      city: parsed.city || city || '',
      coordinates: [parseFloat(place.lon), parseFloat(place.lat)],
    }));
    setCoordsDerived(true);

    setSearchQuery('');
    setSearchResults([]);
    Toast.show({
      type: 'success',
      text1: 'Đã chọn địa điểm từ bản đồ',
      text2:
        parsed.full_address || full_address || place.display_name.split(',').slice(0, 2).join(', '),
    });
  };

  const ensureResolvedCoordinates = async (
    currentAddr: typeof address,
  ): Promise<[number, number] | null> => {
    if (
      coordsDerived &&
      currentAddr.coordinates &&
      (currentAddr.coordinates[0] !== 0 || currentAddr.coordinates[1] !== 0)
    ) {
      return currentAddr.coordinates;
    }
    const queryParts = [
      currentAddr.full_address,
      currentAddr.ward,
      currentAddr.district,
      currentAddr.city,
    ].filter(Boolean);
    if (!queryParts.length) return null;
    const queryStr = queryParts.join(', ');
    const currentCoords =
      currentAddr.coordinates?.[0] && currentAddr.coordinates?.[1]
        ? { latitude: currentAddr.coordinates[1], longitude: currentAddr.coordinates[0] }
        : locationService.getCachedCoordinates();
    try {
      const places = await locationService.searchPlaces(queryStr, currentCoords);
      if (places && places.length > 0) {
        const p = places[0];
        const newCoords: [number, number] = [parseFloat(p.lon), parseFloat(p.lat)];
        setAddress(prev => ({ ...prev, coordinates: newCoords }));
        setCoordsDerived(true);
        return newCoords;
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  const handleAiAnalyze = async () => {
    if (!aiInput.trim()) return;
    try {
      const { data } = await analyzeAI.mutateAsync(aiInput);
      const result = data.data;
      setAiSuggestion(result);

      if (result.service_type) {
        const svc = svcList.find(
          s =>
            s.slug === result.service_type ||
            s.name.toLowerCase().includes(result.service_type.toLowerCase()),
        );
        if (svc) {
          if (selectedService && selectedService !== svc._id) {
            const currentSvc = svcList.find(s => s._id === selectedService);
            Alert.alert(
              'AI gợi ý đổi dịch vụ',
              `AI đề xuất dịch vụ "${svc.name}" (hiện đang chọn "${currentSvc?.name || 'khác'}"). Bạn có muốn chuyển sang dịch vụ này không?`,
              [
                { text: 'Giữ dịch vụ hiện tại', style: 'cancel' },
                { text: 'Đổi sang ' + svc.name, onPress: () => setSelectedService(svc._id) },
              ],
            );
          } else {
            setSelectedService(svc._id);
          }
        } else {
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
          if (fallbackSvc) {
            if (selectedService && selectedService !== fallbackSvc._id) {
              const currentSvc = svcList.find(s => s._id === selectedService);
              Alert.alert(
                'AI gợi ý đổi dịch vụ',
                `AI đề xuất dịch vụ "${fallbackSvc.name}" (hiện đang chọn "${currentSvc?.name || 'khác'}"). Bạn có muốn chuyển sang dịch vụ này không?`,
                [
                  { text: 'Giữ dịch vụ hiện tại', style: 'cancel' },
                  {
                    text: 'Đổi sang ' + fallbackSvc.name,
                    onPress: () => setSelectedService(fallbackSvc._id),
                  },
                ],
              );
            } else {
              setSelectedService(fallbackSvc._id);
            }
          }
        }
      }

      if (result.estimated_duration_hours) {
        setDuration(Math.min(Math.max(Math.round(result.estimated_duration_hours), 1), 8));
      }

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
      const svc = svcList.find(s => s._id === selectedService);
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
    if (!useAuthStore.getState().isAuthenticated) {
      Toast.show({
        type: 'info',
        text1: 'Yêu cầu đăng nhập',
        text2: 'Vui lòng đăng nhập hoặc tạo tài khoản để gửi đơn đặt thợ',
      });
      router.push('/(auth)/login');
      return;
    }

    let currentServiceId = selectedService;
    if (!currentServiceId) {
      const defaultSvc = svcList[0];
      currentServiceId = defaultSvc._id;
      setSelectedService(currentServiceId);
    }

    const hasFullAddress = address.full_address.trim().length > 0;
    const hasDistrictOrFallback =
      address.district.trim().length > 0 || (address.ward?.trim() && address.city?.trim());
    if (!hasFullAddress || !hasDistrictOrFallback) {
      Toast.show({
        type: 'error',
        text1: 'Vui lòng nhập đầy đủ địa chỉ làm việc (Địa chỉ, Phường, Quận/Huyện hoặc Thành phố)',
      });
      setStep(1);
      return;
    }

    // [Lỗi 7 Fix]: Đảm bảo tọa độ được đồng bộ từ địa chỉ, không dùng tọa độ Bến Thành [106.6983, 10.7725]
    let currentCoords = address.coordinates;
    if (!coordsDerived || !currentCoords || (currentCoords[0] === 0 && currentCoords[1] === 0)) {
      const resolved = await ensureResolvedCoordinates(address);
      if (resolved) {
        currentCoords = resolved;
      } else {
        Toast.show({
          type: 'error',
          text1: 'Chưa xác định được tọa độ chính xác',
          text2:
            'Vui lòng chọn từ gợi ý tìm kiếm hoặc bấm nút lấy vị trí GPS để ghim đúng điểm cho thợ.',
        });
        setStep(1);
        return;
      }
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

    const jobAddress = {
      full_address: address.full_address.trim(),
      ward: address.ward?.trim() || undefined,
      district: address.district?.trim() || undefined,
      city: address.city?.trim() || undefined,
      notes: address.notes?.trim() || undefined,
      location: { type: 'Point', coordinates: currentCoords },
    };

    try {
      // ── Gói định kỳ: tạo kế hoạch lặp thay vì 1 đơn lẻ ─────────────────────
      if (isRecurring) {
        await createRecurringPlan.mutateAsync({
          service_id: currentServiceId,
          title: title.trim(),
          description: description.trim(),
          photos: photos.length > 0 ? photos : undefined,
          address: jobAddress,
          frequency: recurringFreq,
          weekdays: recurringFreq === 'weekly' ? recurringWeekdays : undefined,
          month_days: recurringFreq === 'monthly' ? [recurringMonthDay] : undefined,
          time_start: timeSlot,
          duration_hours: duration,
          start_date: date,
          preferred_helper_id:
            offerToFavorite && params.favorite_helper_id ? params.favorite_helper_id : undefined,
        });
        resetForm();
        router.replace('/recurring-plans');
        return;
      }

      const durHours = typeof duration === 'number' ? duration : parseFloat(String(duration)) || 2;
      const durMinsTotal = Math.round(durHours * 60);
      const startDateTime = dayjs(`${date} ${timeSlot}`);
      if (startDateTime.isBefore(dayjs().subtract(1, 'minute'))) {
        Toast.show({ type: 'error', text1: 'Thời gian bắt đầu không được ở trong quá khứ' });
        return;
      }
      const endTime = startDateTime.add(durMinsTotal, 'minute').format('HH:mm');
      const cleanNum = targetPrice ? Number(String(targetPrice).replace(/[^0-9]/g, '')) : undefined;
      if (cleanNum !== undefined && cleanNum < 50000) {
        Toast.show({ type: 'error', text1: 'Giá mong muốn tối thiểu là 50.000₫' });
        return;
      }

      await createJob.mutateAsync({
        service_id: currentServiceId === 'custom' ? undefined : currentServiceId,
        custom_service_name: customServiceName.trim() || undefined,
        target_price: cleanNum && cleanNum > 0 ? cleanNum : undefined,
        title: title.trim() || customServiceName.trim() || 'Yêu cầu dịch vụ',
        description: description.trim(),
        photos: photos.length > 0 ? photos : undefined,
        address: jobAddress,
        preferred_date: date,
        preferred_time_start: timeSlot,
        preferred_time_end: endTime,
        is_flexible_time: false,
        private_offer_helper_id:
          offerToFavorite && params.favorite_helper_id ? params.favorite_helper_id : undefined,
        voucher_code: voucherPreview ? voucherCode : undefined,
        helpers_needed: helpersNeeded > 1 ? helpersNeeded : undefined,
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
      if (selectedService === 'custom') {
        if (!customServiceName.trim()) {
          Toast.show({ type: 'error', text1: 'Vui lòng nhập tên công việc bạn cần làm' });
          return;
        }
        if (targetPrice) {
          const cleanP = Number(String(targetPrice).replace(/[^0-9]/g, ''));
          if (cleanP > 0 && cleanP < 50000) {
            Toast.show({ type: 'error', text1: 'Giá mong muốn tối thiểu là 50.000₫' });
            return;
          }
        }
      }
      setStep(1);
    } else if (step === 1) {
      const hasFullAddress = address.full_address.trim().length > 0;
      const hasLocality = Boolean(
        address.district.trim() ||
        address.ward.trim() ||
        address.city.trim() ||
        (address.coordinates && (address.coordinates[0] !== 0 || address.coordinates[1] !== 0)),
      );
      if (!hasFullAddress || !hasLocality) {
        Toast.show({
          type: 'error',
          text1:
            'Vui lòng nhập đầy đủ địa chỉ làm việc (Địa chỉ, Phường, Quận/Huyện hoặc Thành phố)',
        });
        return;
      }
      if (!coordsDerived || (address.coordinates[0] === 0 && address.coordinates[1] === 0)) {
        ensureResolvedCoordinates(address).catch(() => {});
      }
      setStep(2);
    } else if (step === 2) {
      if (!date || !timeSlot) {
        Toast.show({ type: 'error', text1: 'Vui lòng chọn ngày và giờ bắt đầu làm việc' });
        return;
      }
      const selectedStart = dayjs(`${date} ${timeSlot}`);
      if (selectedStart.isBefore(dayjs().subtract(1, 'minute'))) {
        Toast.show({ type: 'error', text1: 'Thời gian bắt đầu không được ở trong quá khứ' });
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
        <Text
          style={{ fontSize: fs(18), fontWeight: '800', color: COLORS.gray[900], marginLeft: 12 }}
        >
          {t('booking_screen_title')}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          {STEPS.map((_, i) => (
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
        <Text style={{ fontSize: fs(12), color: COLORS.gray[500], fontWeight: '600' }}>
          {t('booking_step_indicator', {
            step: step + 1,
            total: STEPS.length,
            name: t(STEP_KEYS[step]),
          })}
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
                        {t('booking_use_suggestion')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Card>

              <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.gray[800] }}>
                Hoặc chọn dịch vụ bên dưới:
              </Text>

              <View style={{ gap: 10 }}>
                {isLoadingServices ? (
                  <View style={{ paddingVertical: 40, alignItems: 'center', gap: 12 }}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={{ fontSize: 13, color: COLORS.gray[500], fontWeight: '600' }}>
                      Đang tải danh sách dịch vụ...
                    </Text>
                  </View>
                ) : (
                  svcList.map(svc => (
                    <TouchableOpacity
                      key={svc._id}
                      onPress={() => {
                        setSelectedService(svc._id);
                        setStep(1);
                      }}
                      style={{
                        borderWidth: 2,
                        borderColor:
                          selectedService === svc._id ? COLORS.primary : COLORS.gray[200],
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
                            housekeeping_hourly: '🧹',
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
                        {svc.pricing_model === 'fixed' && svc.fixed_price ? (
                          <Text
                            style={{
                              fontSize: 12,
                              color: COLORS.primary,
                              marginTop: 4,
                              fontWeight: '700',
                            }}
                          >
                            {t('booking_fixed_price')}{' '}
                            {new Intl.NumberFormat('vi-VN').format(svc.fixed_price)}₫ — nhận việc
                            ngay, không cần báo giá
                          </Text>
                        ) : svc.base_price_min ? (
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
                        ) : null}
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
                  ))
                )}

                {/* 12th Service: Dịch vụ khác — tự ghi việc, tự set giá */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelectedService('custom')}
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    borderWidth: 2,
                    borderColor: selectedService === 'custom' ? COLORS.primary : '#86EFAC',
                    backgroundColor: selectedService === 'custom' ? COLORS.primaryLight : '#F0FDF4',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <Text style={{ fontSize: 28 }}>💡</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                        Dịch vụ khác — tự ghi việc, tự set giá
                      </Text>
                      <View
                        style={{
                          backgroundColor: '#DCFCE7',
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 6,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '900', color: COLORS.primary }}>
                          MỚI
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 12, color: COLORS.gray[600], marginTop: 2 }}>
                      Việc gì cũng đăng được · bạn tự mô tả công việc và đặt giá mong muốn
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: COLORS.primary,
                        marginTop: 4,
                        fontWeight: '700',
                      }}
                    >
                      Deal giá trực tiếp với thợ
                    </Text>
                  </View>
                  {selectedService === 'custom' && (
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

                {selectedService === 'custom' && (
                  <View
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 16,
                      padding: 16,
                      borderWidth: 1.5,
                      borderColor: COLORS.primary,
                      gap: 12,
                      marginTop: 4,
                    }}
                  >
                    <Input
                      label="Tên công việc / dịch vụ bạn cần *"
                      placeholder="VD: Bốc hàng từ kho lên xe tải, dọn kho..."
                      value={customServiceName}
                      onChangeText={setCustomServiceName}
                    />
                    <Input
                      label="Giá bạn muốn trả (giá mở đầu để deal) *"
                      placeholder="VD: 200000"
                      value={targetPrice}
                      onChangeText={v => setTargetPrice(v.replace(/[^0-9]/g, ''))}
                      keyboardType="numeric"
                    />
                  </View>
                )}
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

                {!isSearching &&
                  hasSearched &&
                  searchResults.length === 0 &&
                  searchQuery.trim().length >= 2 && (
                    <View
                      style={{
                        padding: 10,
                        marginTop: 4,
                        backgroundColor: COLORS.gray[50],
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: COLORS.gray[200],
                      }}
                    >
                      <Text style={{ fontSize: 13, color: COLORS.gray[500], lineHeight: 18 }}>
                        Không tìm thấy địa điểm phù hợp. Vui lòng thử từ khóa khác hoặc nhập trực
                        tiếp vào các ô bên dưới.
                      </Text>
                    </View>
                  )}
              </View>

              <Input
                label="Địa chỉ chi tiết (Số nhà & tên đường) *"
                placeholder="VD: 128 Đường Lê Lợi"
                value={address.full_address}
                onChangeText={v => {
                  setAddress(a => ({ ...a, full_address: v }));
                  setCoordsDerived(false);
                }}
                leftIcon={<MapPin size={16} color={COLORS.gray[400]} />}
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Phường/Xã"
                    placeholder="VD: Phường / Xã"
                    value={address.ward}
                    onChangeText={v => {
                      setAddress(a => ({ ...a, ward: v }));
                      setCoordsDerived(false);
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Quận/Huyện"
                    placeholder="VD: Quận / Huyện"
                    value={address.district}
                    onChangeText={v => {
                      setAddress(a => ({ ...a, district: v }));
                      setCoordsDerived(false);
                    }}
                  />
                </View>
              </View>
              <Input
                label="Thành phố"
                placeholder="VD: Tỉnh / Thành phố"
                value={address.city}
                onChangeText={v => {
                  setAddress(a => ({ ...a, city: v }));
                  setCoordsDerived(false);
                }}
              />
              <Input
                label="Ghi chú hướng dẫn cho thợ (tùy chọn)"
                placeholder="VD: Chung cư lô B, mã sảnh #1234, gửi xe hầm B1..."
                value={address.notes}
                onChangeText={v => setAddress(a => ({ ...a, notes: v }))}
              />
            </View>
          )}

          {/* ── STEP 2: Lịch hẹn ─────────────────────────────────────── */}
          {step === 2 && (
            <View style={{ gap: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.gray[900] }}>
                Chọn lịch hẹn
              </Text>

              {/* 1. Lịch làm việc: Ngày & Giờ (Trigger mở Bottom Sheet Item 1) */}
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[800] }}>
                  Thời gian bắt đầu làm việc
                </Text>

                {/* Ngày làm việc trigger card - Chuẩn Demo */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setBottomSheetInitialTab('date');
                    setDateTimePickerOpen(true);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 14,
                    backgroundColor: '#F0FDF4',
                    borderWidth: 1.5,
                    borderColor: '#16A34A',
                  }}
                >
                  <Calendar size={18} color="#16A34A" />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ fontSize: 15, fontWeight: '700', color: COLORS.gray[900] }}
                      numberOfLines={1}
                    >
                      {(() => {
                        const dt = dayjs(date);
                        const dow = dt.format('dddd');
                        const capitalizedDow = dow.charAt(0).toUpperCase() + dow.slice(1);
                        return `${capitalizedDow}, ${dt.format('DD/MM/YYYY')}`;
                      })()}
                    </Text>
                    <Text
                      style={{ fontSize: 11, color: '#64748B', fontWeight: '500', marginTop: 1 }}
                    >
                      Bấm để mở lịch tháng trong bottom sheet
                    </Text>
                  </View>
                  <ChevronRight size={18} color="#16A34A" />
                </TouchableOpacity>

                {/* Day suggestion chips: Hôm nay / Ngày mai / Thứ 7 / Chủ nhật */}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[
                    { key: 'today', label: 'Hôm nay' },
                    { key: 'tomorrow', label: 'Ngày mai' },
                    { key: 'sat', label: 'Thứ 7' },
                    { key: 'sun', label: 'Chủ nhật' },
                  ].map(c => {
                    const isSel = dateChip === c.key;
                    return (
                      <ScalePressable
                        key={c.key}
                        onPress={() => {
                          setDateChip(c.key as any);
                          const now = dayjs();
                          if (c.key === 'today') setDate(now.format('YYYY-MM-DD'));
                          else if (c.key === 'tomorrow')
                            setDate(now.add(1, 'day').format('YYYY-MM-DD'));
                          else if (c.key === 'sat') {
                            const nextSat = now.day() <= 6 ? now.day(6) : now.add(1, 'week').day(6);
                            setDate(nextSat.format('YYYY-MM-DD'));
                          } else if (c.key === 'sun') {
                            const nextSun = now.day() === 0 ? now : now.day(7);
                            setDate(nextSun.format('YYYY-MM-DD'));
                          }
                        }}
                        style={{
                          flex: 1,
                          paddingVertical: 7,
                          borderRadius: 8,
                          backgroundColor: isSel ? '#DCFCE7' : '#FFFFFF',
                          borderWidth: 1.5,
                          borderColor: isSel ? '#16A34A' : '#E2E8F0',
                          alignItems: 'center',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11.5,
                            fontWeight: '700',
                            color: isSel ? '#047857' : COLORS.gray[700],
                          }}
                        >
                          {c.label}
                        </Text>
                      </ScalePressable>
                    );
                  })}
                </View>

                {/* Giờ bắt đầu trigger card - Chuẩn Demo */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setBottomSheetInitialTab('time');
                    setDateTimePickerOpen(true);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 14,
                    backgroundColor: '#F0FDF4',
                    borderWidth: 1.5,
                    borderColor: '#16A34A',
                  }}
                >
                  <Clock size={20} color="#16A34A" />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: '800',
                        color: '#047857',
                        fontVariant: ['tabular-nums'],
                      }}
                      numberOfLines={1}
                    >
                      {timeSlot}
                    </Text>
                    <Text
                      style={{ fontSize: 11, color: '#64748B', fontWeight: '500', marginTop: 1 }}
                    >
                      Bấm để mở bánh xe cuộn chọn giờ
                    </Text>
                  </View>
                  <ChevronRight size={18} color="#16A34A" />
                </TouchableOpacity>

                {/* Quick Time Suggestion Chips - Chuẩn Demo */}
                <View>
                  <Text
                    style={{ fontSize: 11.5, fontWeight: '600', color: '#64748B', marginBottom: 6 }}
                  >
                    Gợi ý nhanh — bấm là bánh xe chạy tới đúng giờ đó:
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
                  >
                    {[
                      { t: '07:00' },
                      { t: '08:00' },
                      { t: '09:00' },
                      { t: '12:00', tag: 'MỚI', tagType: 'new' },
                      { t: '14:00' },
                      { t: '17:00' },
                      { t: '18:00' },
                      { t: '19:00' },
                      { t: '20:00' },
                      { t: '21:00', tag: 'ĐÊM', tagType: 'night' },
                      { t: '22:00', tag: 'ĐÊM', tagType: 'night' },
                    ].map(item => {
                      const isSel = timeSlot === item.t;
                      return (
                        <TouchableOpacity
                          key={item.t}
                          activeOpacity={0.7}
                          onPress={() => {
                            setTimeSlot(item.t);
                          }}
                          style={{
                            position: 'relative',
                            backgroundColor: isSel ? '#DCFCE7' : '#FFFFFF',
                            borderWidth: 1.5,
                            borderColor: isSel ? '#16A34A' : '#E2E8F0',
                            borderRadius: 9,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {item.tag && (
                            <View
                              style={{
                                position: 'absolute',
                                top: -6,
                                right: -4,
                                paddingHorizontal: 4,
                                paddingVertical: 1,
                                borderRadius: 99,
                                backgroundColor: item.tagType === 'night' ? '#FEE2E2' : '#DCFCE7',
                                borderWidth: 1,
                                borderColor: item.tagType === 'night' ? '#FCA5A5' : '#16A34A',
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 8,
                                  fontWeight: '800',
                                  color: item.tagType === 'night' ? '#DC2626' : '#047857',
                                }}
                              >
                                {item.tag}
                              </Text>
                            </View>
                          )}
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: isSel ? '800' : '600',
                              color: isSel ? '#047857' : '#334155',
                              fontVariant: ['tabular-nums'],
                            }}
                          >
                            {item.t}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <Text
                    style={{
                      fontSize: 11.5,
                      fontWeight: '600',
                      color: '#64748B',
                      marginTop: 6,
                      marginBottom: 4,
                    }}
                  >
                    Giờ lẻ:
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
                  >
                    {['07:30', '08:30', '11:30', '13:30', '17:30', '19:30', '20:30', '21:30'].map(
                      t => {
                        const isSel = timeSlot === t;
                        return (
                          <TouchableOpacity
                            key={t}
                            activeOpacity={0.7}
                            onPress={() => {
                              setTimeSlot(t);
                            }}
                            style={{
                              backgroundColor: isSel ? '#DCFCE7' : '#FFFFFF',
                              borderWidth: 1.5,
                              borderColor: isSel ? '#16A34A' : '#E2E8F0',
                              borderRadius: 9,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: isSel ? '800' : '600',
                                color: isSel ? '#047857' : '#334155',
                                fontVariant: ['tabular-nums'],
                              }}
                            >
                              {t}
                            </Text>
                          </TouchableOpacity>
                        );
                      },
                    )}
                  </ScrollView>
                </View>
              </View>

              {/* 3. Thời gian ước tính: Chip 1/2/3/4h + Tùy chọn... */}
              <View>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[700] }}>
                    Thời gian ước tính:{' '}
                    <Text style={{ color: COLORS.primary, fontWeight: '800' }}>
                      {duration < 1
                        ? `${Math.round(duration * 60)} phút`
                        : `${Number(duration.toFixed(2)).toString().replace('.', ',')} giờ`}
                    </Text>
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[1, 2, 3, 4].map(d => (
                    <ScalePressable
                      key={d}
                      onPress={() => {
                        setDuration(d);
                        setIsCustomDuration(false);
                        setDurationPickerOpen(false);
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 11,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor:
                          !isCustomDuration && duration === d ? COLORS.primary : COLORS.gray[200],
                        backgroundColor:
                          !isCustomDuration && duration === d ? COLORS.primaryLight : '#fff',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: '800',
                          fontSize: 14,
                          color:
                            !isCustomDuration && duration === d ? COLORS.primary : COLORS.gray[700],
                        }}
                      >
                        {d}h
                      </Text>
                    </ScalePressable>
                  ))}
                  <ScalePressable
                    onPress={() => {
                      setIsCustomDuration(true);
                      setDurationPickerOpen(true);
                    }}
                    style={{
                      flex: isCustomDuration ? 1.4 : 1.2,
                      paddingVertical: 11,
                      paddingHorizontal: 6,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: isCustomDuration ? COLORS.primary : COLORS.gray[200],
                      backgroundColor: isCustomDuration ? COLORS.primaryLight : '#fff',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: '800',
                        fontSize: 12,
                        color: isCustomDuration ? COLORS.primary : COLORS.gray[700],
                      }}
                      numberOfLines={1}
                    >
                      {isCustomDuration
                        ? `${duration < 1 ? `${Math.round(duration * 60)}p` : `${Number(duration.toFixed(2)).toString().replace('.', ',')}h`}`
                        : 'Tùy chọn…'}
                    </Text>
                  </ScalePressable>
                </View>

                {/* Dynamic Schedule Summary Card with Next-Day notice */}
                {(() => {
                  const durTotal =
                    typeof duration === 'number' ? duration : parseFloat(String(duration)) || 2;
                  const durMinsTotal = Math.round(durTotal * 60);
                  const startDt = dayjs(`${date} ${timeSlot}`);
                  const endDt = startDt.add(durMinsTotal, 'minute');
                  const isNextDay = endDt.date() !== startDt.date();
                  const cleanPriceNum = targetPrice
                    ? Number(String(targetPrice).replace(/[^0-9]/g, ''))
                    : 0;

                  return (
                    <View
                      style={{
                        backgroundColor: '#F0FDF4',
                        borderRadius: 14,
                        padding: 14,
                        borderWidth: 1.5,
                        borderColor: '#BBF7D0',
                        marginTop: 14,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: '#166534',
                          fontWeight: '600',
                          lineHeight: 20,
                        }}
                      >
                        Lịch dự kiến:{' '}
                        <Text style={{ fontWeight: '800' }}>
                          {dayjs(date).format('dddd, DD/MM/YYYY')}, {timeSlot} –{' '}
                          {endDt.format('HH:mm')}
                          {isNextDay ? ' (ngày hôm sau)' : ''}
                        </Text>{' '}
                        · thời lượng{' '}
                        {durTotal < 1
                          ? `${Math.round(durTotal * 60)} phút`
                          : `${Number(durTotal.toFixed(2)).toString().replace('.', ',')} giờ`}
                        .
                        {cleanPriceNum > 0
                          ? ` Giá mở đầu để deal: ${new Intl.NumberFormat('vi-VN').format(cleanPriceNum)}₫.`
                          : ''}
                      </Text>
                    </View>
                  );
                })()}
              </View>
            </View>
          )}

          {/* ── STEP 3: Mô tả & Ảnh hiện trạng ───────────────────────── */}
          {step === 3 && (
            <View style={{ gap: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.gray[900] }}>
                Chi tiết công việc
              </Text>

              {/* Banner thông báo khi đã có ảnh sự cố được đính kèm */}
              {photos.length > 0 && !photoAnalysis && (
                <View
                  style={{
                    backgroundColor: '#F0FDF4',
                    borderColor: '#86EFAC',
                    borderWidth: 1.5,
                    borderRadius: 14,
                    padding: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Sparkles size={20} color="#16A34A" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#166534' }}>
                      Đã đính kèm {photos.length} ảnh sự cố
                    </Text>
                    <Text style={{ fontSize: 12, color: '#15803D', marginTop: 2 }}>
                      Bấm nút màu xanh "Phân tích ảnh sự cố bằng AI" bên dưới để hệ thống nhận diện
                      và điền mô tả ngay!
                    </Text>
                  </View>
                </View>
              )}

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

              {/* Đính kèm ảnh hiện trạng */}
              <View style={{ gap: 10 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[700] }}>
                    📸 Ảnh hiện trạng công việc ({photos.length}/6)
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.gray[400] }}>Không bắt buộc</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleTakeJobPhoto}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: COLORS.primaryLight,
                      borderWidth: 1.5,
                      borderColor: COLORS.primary,
                      borderRadius: 12,
                      paddingVertical: 11,
                    }}
                  >
                    <Camera size={18} color={COLORS.primary} />
                    <Text style={{ fontWeight: '700', fontSize: 13, color: COLORS.primary }}>
                      Chụp ảnh
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handlePickJobPhoto}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: COLORS.gray[100],
                      borderRadius: 12,
                      paddingVertical: 11,
                    }}
                  >
                    <ImagePlus size={18} color={COLORS.gray[700]} />
                    <Text style={{ fontWeight: '700', fontSize: 13, color: COLORS.gray[800] }}>
                      Chọn từ thư viện
                    </Text>
                  </TouchableOpacity>
                </View>

                {photos.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {photos.map((uri, idx) => (
                      <View
                        key={`job-photo-${idx}`}
                        style={{
                          width: '30%',
                          aspectRatio: 1,
                          borderRadius: 12,
                          overflow: 'hidden',
                          position: 'relative',
                          borderWidth: 1,
                          borderColor: COLORS.gray[200],
                        }}
                      >
                        <Image
                          source={{ uri }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                        <TouchableOpacity
                          onPress={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            backgroundColor: 'rgba(0,0,0,0.65)',
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Trash2 size={13} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Feature 17: Phân tích ảnh sự cố bằng AI */}
              <ScalePressable
                onPress={handleAnalyzeIssuePhoto}
                disabled={analyzeIssuePhoto.isPending || isAnalyzingPhoto}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: COLORS.primary,
                  borderRadius: 14,
                  padding: 14,
                  opacity: analyzeIssuePhoto.isPending || isAnalyzingPhoto ? 0.7 : 1,
                  shadowColor: COLORS.primary,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <Sparkles size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15, flex: 1 }}>
                  {analyzeIssuePhoto.isPending || isAnalyzingPhoto
                    ? 'AI đang phân tích ảnh...'
                    : 'Phân tích ảnh sự cố bằng AI'}
                </Text>
                {analyzeIssuePhoto.isPending || isAnalyzingPhoto ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ChevronRight size={18} color="rgba(255,255,255,0.7)" />
                )}
              </ScalePressable>

              {photoAnalysis?.available && (
                <Card style={{ backgroundColor: COLORS.primaryLight, gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.primary }}>
                    🔍 AI nhận diện sự cố
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.gray[900] }}>
                    Vấn đề phát hiện: {photoAnalysis.detected_issue ?? '—'}
                  </Text>
                  {photoAnalysis.price_min != null && photoAnalysis.price_max != null && (
                    <Text style={{ fontSize: 13, color: COLORS.gray[700] }}>
                      Khoảng giá: {new Intl.NumberFormat('vi-VN').format(photoAnalysis.price_min)}₫
                      – {new Intl.NumberFormat('vi-VN').format(photoAnalysis.price_max)}₫
                      {photoAnalysis.confidence != null
                        ? ` · độ tin cậy ${Math.round(photoAnalysis.confidence * 100)}%`
                        : ''}
                    </Text>
                  )}
                  <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
                    Mô tả đã được điền sẵn từ ảnh — bạn có thể sửa lại trước khi gửi đơn.
                  </Text>
                </Card>
              )}

              {/* AI Price estimate */}
              {description.length > 20 && (
                <ScalePressable
                  onPress={handleEstimatePrice}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: '#0F766E',
                    borderRadius: 14,
                    padding: 14,
                  }}
                >
                  <Sparkles size={18} color="#5EEAD4" />
                  <Text style={{ color: '#fff', fontWeight: '700', flex: 1 }}>
                    {estimatePrice.isPending
                      ? 'Đang ước tính giá...'
                      : 'AI ước tính giá thị trường'}
                  </Text>
                  {!estimatePrice.isPending && (
                    <ChevronRight size={16} color="rgba(255,255,255,0.7)" />
                  )}
                </ScalePressable>
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
              <Text style={{ fontSize: fs(20), fontWeight: '800', color: COLORS.gray[900] }}>
                {t('booking_confirm_title')}
              </Text>

              <Card style={{ gap: 14 }}>
                <Row icon="🏠" label="Dịch vụ" value={selectedServiceData?.name ?? '—'} />
                <Row
                  icon="📍"
                  label="Địa chỉ"
                  value={
                    [address.full_address, address.ward, address.district, address.city]
                      .filter(Boolean)
                      .join(', ') || 'Chưa rõ địa chỉ'
                  }
                />
                {address.notes ? (
                  <Row icon="📝" label="Ghi chú địa chỉ" value={address.notes} />
                ) : null}
                <Row icon="📅" label="Ngày" value={dayjs(date).format('dddd, DD/MM/YYYY')} />
                <Row icon="🕐" label="Giờ" value={`${timeSlot} • ${duration} giờ`} />
                {photos.length > 0 && (
                  <Row icon="📸" label="Hình ảnh đính kèm" value={`${photos.length} ảnh`} />
                )}
                <View style={{ height: 1, backgroundColor: COLORS.gray[100] }} />
                <Text style={{ fontWeight: '800', fontSize: 16, color: COLORS.gray[900] }}>
                  {title}
                </Text>
                <Text style={{ color: COLORS.gray[600], fontSize: 14, lineHeight: 20 }}>
                  {description}
                </Text>
              </Card>

              {/* ── Giá cam kết (Feature 7) ─────────────────────────────── */}
              {isFixedPriceService && (
                <Card
                  style={{
                    backgroundColor: '#ECFDF5',
                    borderColor: '#A7F3D0',
                    borderWidth: 1.5,
                    gap: 6,
                  }}
                >
                  <Text style={{ fontWeight: '800', fontSize: 16, color: '#065F46' }}>
                    {t('booking_fixed_price')}{' '}
                    {new Intl.NumberFormat('vi-VN').format(selectedServiceData?.fixed_price ?? 0)}₫
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.gray[700], lineHeight: 19 }}>
                    Dịch vụ này có giá cố định do Green House cam kết. Thợ sẽ nhận việc trực tiếp
                    với đúng mức giá trên — bạn không cần chờ đợi hay so sánh báo giá. Cứ đăng yêu
                    cầu như bình thường!
                  </Text>
                </Card>
              )}

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
                  {isFixedPriceService
                    ? 'Đơn giá cam kết sẽ được gửi tới các thợ quanh bạn — thợ đầu tiên nhận việc sẽ thực hiện với giá đã cam kết.'
                    : 'Sau khi đăng, các thợ xung quanh sẽ gửi báo giá. Bạn có thể tự do so sánh tay nghề & giá cả trước khi chọn thợ.'}
                </Text>
              </Card>

              {/* ── Ưu tiên gửi riêng cho thợ yêu thích ─────────────────── */}
              {params.favorite_helper_id && (
                <Card style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 20 }}>⭐</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                        Gửi riêng cho {params.favorite_helper_name ?? 'thợ yêu thích'}
                      </Text>
                      <Text style={{ fontSize: 12.5, color: COLORS.gray[600], lineHeight: 17 }}>
                        Đơn chỉ hiển thị với thợ này trong 24 giờ đầu. Hết thời gian chờ, đơn sẽ mở
                        công khai cho mọi thợ nếu thợ chưa báo giá.
                      </Text>
                    </View>
                    <Switch
                      value={offerToFavorite}
                      onValueChange={setOfferToFavorite}
                      trackColor={{ true: COLORS.primary, false: COLORS.gray[300] }}
                    />
                  </View>
                </Card>
              )}

              {/* ── Đơn nhóm: số thợ cần ────────────────────────────────── */}
              <Card style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 20 }}>👥</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                      Số thợ thực hiện
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[600], lineHeight: 17 }}>
                      Việc lớn cần nhiều người? Chọn 2–4 thợ — thợ chính sẽ lập nhóm và chia tiền
                      công minh bạch theo tỉ lệ.
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[1, 2, 3, 4].map(n => (
                    <TouchableOpacity
                      key={n}
                      onPress={() => setHelpersNeeded(n)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: helpersNeeded === n ? COLORS.primary : COLORS.gray[200],
                        backgroundColor: helpersNeeded === n ? COLORS.primaryLight : '#fff',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: '800',
                          fontSize: 15,
                          color: helpersNeeded === n ? COLORS.primaryDark : COLORS.gray[700],
                        }}
                      >
                        {n} thợ
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Card>

              {/* ── Gói định kỳ ─────────────────────────────────────────── */}
              <Card style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 20 }}>🔁</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                      Đặt thành gói định kỳ
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[600], lineHeight: 17 }}>
                      Hệ thống tự tạo đơn theo lịch lặp — bạn không cần đăng lại mỗi lần.
                    </Text>
                  </View>
                  <Switch
                    value={isRecurring}
                    onValueChange={setIsRecurring}
                    trackColor={{ true: COLORS.primary, false: COLORS.gray[300] }}
                  />
                </View>

                {isRecurring && (
                  <View style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(
                        [
                          { key: 'weekly', label: 'Hàng tuần' },
                          { key: 'monthly', label: 'Hàng tháng' },
                        ] as const
                      ).map(opt => (
                        <TouchableOpacity
                          key={opt.key}
                          activeOpacity={0.8}
                          onPress={() => setRecurringFreq(opt.key)}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 999,
                            backgroundColor:
                              recurringFreq === opt.key ? COLORS.primary : COLORS.gray[100],
                          }}
                        >
                          <Text
                            style={{
                              fontWeight: '700',
                              fontSize: 13,
                              color: recurringFreq === opt.key ? '#fff' : COLORS.gray[700],
                            }}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {recurringFreq === 'weekly' ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((label, idx) => {
                          const active = recurringWeekdays.includes(idx);
                          return (
                            <TouchableOpacity
                              key={label}
                              activeOpacity={0.8}
                              onPress={() =>
                                setRecurringWeekdays(prev =>
                                  prev.includes(idx)
                                    ? prev.filter(d => d !== idx)
                                    : [...prev, idx].sort(),
                                )
                              }
                              style={{
                                width: 42,
                                height: 42,
                                borderRadius: 21,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: active ? COLORS.primary : COLORS.gray[100],
                              }}
                            >
                              <Text
                                style={{
                                  fontWeight: '700',
                                  fontSize: 13,
                                  color: active ? '#fff' : COLORS.gray[700],
                                }}
                              >
                                {label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontSize: 13.5, color: COLORS.gray[700] }}>Vào ngày</Text>
                        <TextInput
                          value={String(recurringMonthDay)}
                          onChangeText={v => {
                            const n = parseInt(v.replace(/\D/g, ''), 10);
                            setRecurringMonthDay(
                              Number.isFinite(n) ? Math.min(31, Math.max(1, n)) : 1,
                            );
                          }}
                          keyboardType="number-pad"
                          style={{
                            width: 56,
                            borderWidth: 1,
                            borderColor: COLORS.gray[200],
                            borderRadius: 10,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            fontSize: 14,
                            fontWeight: '700',
                            textAlign: 'center',
                          }}
                        />
                        <Text style={{ fontSize: 13.5, color: COLORS.gray[700] }}>hàng tháng</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 12, color: COLORS.gray[500], lineHeight: 17 }}>
                      Buổi đầu tiên: {dayjs(date).format('DD/MM/YYYY')} lúc {timeSlot} ({duration}{' '}
                      giờ). Quản lý, tạm dừng hoặc bỏ qua từng buổi trong mục "Gói định kỳ của tôi".
                    </Text>
                  </View>
                )}
              </Card>

              {/* ── Mã giảm giá (Roadmap Phase 1 — Voucher) ──────────────── */}
              <VoucherInput
                estimatedAmount={priceEstimate?.price_max ?? selectedServiceData?.base_price_min}
                value={voucherCode}
                onApplied={(code, preview) => {
                  setVoucherCode(code);
                  setVoucherPreview(preview);
                }}
                onCleared={() => {
                  setVoucherCode('');
                  setVoucherPreview(null);
                }}
                preview={voucherPreview}
              />
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
          title={step === STEPS.length - 1 ? t('booking_submit') : t('booking_continue')}
          loading={createJob.isPending}
          onPress={handleNextStep}
          icon={step < STEPS.length - 1 ? <ArrowRight size={18} color="#fff" /> : undefined}
        />
      </View>

      {/* ── BOTTOM SHEET CHỌN NGÀY & GIỜ (ITEM 1) ── */}
      <DateTimePickerBottomSheet
        visible={dateTimePickerOpen}
        initialDate={date}
        initialTime={timeSlot}
        initialTab={bottomSheetInitialTab}
        onClose={() => setDateTimePickerOpen(false)}
        onConfirm={(selectedDate: string, selectedTime: string) => {
          setDate(selectedDate);
          setTimeSlot(selectedTime);
          setDateChip(null);
        }}
      />

      {/* ── BOTTOM SHEET CHỌN THỜI LƯỢNG TỰ DO (ITEM 2) ── */}
      <DurationBottomSheet
        visible={durationPickerOpen}
        initialHours={Math.floor(duration)}
        initialMinutes={Math.round((duration - Math.floor(duration)) * 60)}
        startDate={date}
        startTime={timeSlot}
        onClose={() => setDurationPickerOpen(false)}
        onConfirm={newDur => {
          setDuration(newDur);
          setIsCustomDuration(![1, 2, 3, 4].includes(newDur));
        }}
      />
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
