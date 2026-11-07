import { useState, useEffect, useRef, useMemo } from 'react';
import {
  formatDate,
  formatDateKey,
  formatDateWithWeekday,
  formatTime,
  toVnDayjs,
  vnDateKey,
  vnNow,
} from '@/utils/date-format';
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
  Briefcase,
  Home,
  UtensilsCrossed,
  Shirt,
  Users,
  Heart,
  Leaf,
  ShieldCheck,
  Package,
  Wrench,
  Zap,
  Droplets,
  Lightbulb,
  Repeat,
  FileText,
  Star,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { Alert } from '@/components/common/app-alert';
import dayjs from 'dayjs';
import { useAuthStore } from '@/stores/auth.store';
import { ScalePressable } from '@/components/common/scale-pressable';
import {
  TimeDropdownPicker,
  DurationDropdownPicker,
  ScheduledTimePreview,
  getDefaultFutureTimeSlot,
  getNowVietnam,
} from '@/components/common/time-dropdown-picker';
import { DateTimePickerBottomSheet } from '@/components/common/date-time-bottom-sheet';
import {
  useServices,
  useCreateJob,
  useAnalyzeBooking,
  useEstimatePrice,
  useAnalyzeIssuePhoto,
  useCreateRecurringPlan,
  useValidateVoucher,
  useMyProfile,
} from '@/hooks/use-api';
import type { IssuePhotoAnalysis } from '@/hooks/use-api';
import { useResendVerification } from '@/components/common/verification-banner';
import { mapAuthErrorMessage } from '@/services/i18n';
import { locationService, OsmPlace, parseVietnameseAddress } from '@/services/location.service';
import { Button, Input, Card, COLORS, Skeleton, useThemeColors } from '@/components/ui';
import { VoucherInput } from '@/components/common/voucher-input';
import type { VoucherPreview } from '@/hooks/use-api';
import { useTranslation } from '@/hooks/use-i18n';

const STEPS = [
  'booking_step_service',
  'booking_step_address',
  'booking_step_schedule',
  'booking_step_description',
  'booking_step_confirm',
];
const STEP_KEYS = STEPS;

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

function renderServiceIcon(slug: string, size = 26, color = COLORS.primary) {
  switch (slug) {
    case 'house_cleaning':
      return <Home size={size} color={color} />;
    case 'cooking':
      return <UtensilsCrossed size={size} color={color} />;
    case 'laundry':
      return <Shirt size={size} color={color} />;
    case 'family_care':
      return <Users size={size} color={color} />;
    case 'petcare':
      return <Heart size={size} color={color} />;
    case 'plantcare':
      return <Leaf size={size} color={color} />;
    case 'house_management':
      return <ShieldCheck size={size} color={color} />;
    case 'housekeeping_hourly':
    case 'hourly_helper':
    case 'deep_cleaning':
      return <Sparkles size={size} color={color} />;
    case 'moving_help':
      return <Package size={size} color={color} />;
    case 'handyman':
      return <Wrench size={size} color={color} />;
    case 'electrician':
      return <Zap size={size} color={color} />;
    case 'plumbing':
      return <Droplets size={size} color={color} />;
    default:
      return <Briefcase size={size} color={color} />;
  }
}

const DEFAULT_SERVICES: BookingServiceOption[] = [
  {
    _id: '6aa1269cd33a3aed2b36a5e1',
    name: 'Dọn dẹp vệ sinh nhà cửa',
    slug: 'house_cleaning',
    icon: 'house_cleaning',
    description: 'Lau sàn, hút bụi, dọn phòng khách, phòng ngủ, nhà bếp, vệ sinh...',
    base_price_min: 80000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e2',
    name: 'Đi chợ & Nấu ăn gia đình',
    slug: 'cooking',
    icon: 'cooking',
    description: 'Đi chợ mua nguyên liệu, nấu cơm canh, món mặn, món chay theo yêu cầu...',
    base_price_min: 100000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e3',
    name: 'Giặt giũ & Là ủi quần áo',
    slug: 'laundry',
    icon: 'laundry',
    description: 'Phân loại, giặt tay/máy, phơi, gấp, là ủi quần áo gọn gàng...',
    base_price_min: 70000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e4',
    name: 'Chăm sóc Gia Chủ',
    slug: 'family_care',
    icon: 'family_care',
    description: 'Trông trẻ, chăm sóc người già, người bệnh, hỗ trợ bà bầu...',
    base_price_min: 120000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e5',
    name: 'Chăm sóc thú cưng',
    slug: 'petcare',
    icon: 'petcare',
    description: 'Cho ăn, tắm rửa, dắt đi dạo, vệ sinh chuồng trại thú cưng...',
    base_price_min: 80000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e6',
    name: 'Chăm sóc cây cảnh',
    slug: 'plantcare',
    icon: 'plantcare',
    description: 'Tưới cây, bón phân, cắt tỉa, thay chậu, phòng trừ sâu bệnh...',
    base_price_min: 80000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e7',
    name: 'Trông giữ & Quản lý nhà cửa',
    slug: 'house_management',
    icon: 'house_management',
    description: 'Trông coi nhà khi vắng, nhận bưu phẩm, kiểm tra an ninh, bảo trì...',
    base_price_min: 150000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e8',
    name: 'Giúp việc theo giờ',
    slug: 'housekeeping_hourly',
    icon: 'housekeeping_hourly',
    description: 'Dọn dẹp, rửa chén, lau kính, hỗ trợ việc nhà linh hoạt theo giờ...',
    base_price_min: 60000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5e9',
    name: 'Tổng vệ sinh nhà cửa',
    slug: 'deep_cleaning',
    icon: 'deep_cleaning',
    description: 'Vệ sinh toàn bộ nhà chuyên sâu, chà sàn, lau kính, tẩy rửa...',
    base_price_min: 500000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5ea',
    name: 'Dọn nhà & Chuyển nhà',
    slug: 'moving_help',
    icon: 'moving_help',
    description: 'Đóng gói đồ đạc, sắp xếp, vận chuyển, bày trí nhà mới...',
    base_price_min: 200000,
  },
  {
    _id: '6aa1269cd33a3aed2b36a5eb',
    name: 'Phụ việc lặt vặt',
    slug: 'handyman',
    icon: 'handyman',
    description: 'Treo tranh, lắp kệ, sửa nhỏ, thay bóng đèn, việc vặt trong nhà...',
    base_price_min: 80000,
  },
];

export default function BookingScreen() {
  const router = useRouter();
  const { t, tService, tServiceDesc, lang, fs } = useTranslation();
  const tc = useThemeColors();
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
  const { data: myProfile } = useMyProfile();
  const { resendAndGoToOtp } = useResendVerification();
  const analyzeAI = useAnalyzeBooking();
  const estimatePrice = useEstimatePrice();
  const analyzeIssuePhoto = useAnalyzeIssuePhoto();
  const validateVoucher = useValidateVoucher();

  // ── Roadmap Phase 1: gửi riêng cho thợ yêu thích + gói định kỳ ────────────
  const [offerToFavorite, setOfferToFavorite] = useState(!!params.favorite_helper_id);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFreq, setRecurringFreq] = useState<'weekly' | 'monthly'>('weekly');
  const [recurringWeekdays, setRecurringWeekdays] = useState<number[]>([
    vnNow().add(1, 'day').day(),
  ]);
  const [recurringMonthDay, setRecurringMonthDay] = useState(vnNow().add(1, 'day').date());
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
  const [date, setDate] = useState(vnDateKey(1));
  const [dateChip, setDateChip] = useState<'today' | 'tomorrow' | 'sat' | 'sun' | null>('tomorrow');
  const [timeSlot, setTimeSlot] = useState(() => getDefaultFutureTimeSlot(vnDateKey(1)));
  const [duration, setDuration] = useState(3);
  const [dateTimePickerOpen, setDateTimePickerOpen] = useState(false);
  const [bottomSheetInitialTab, setBottomSheetInitialTab] = useState<'date' | 'time'>('date');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(vnNow());
  const [customTimeOpen, setCustomTimeOpen] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState('');
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const scrollRef = useRef<ScrollView>(null);

  // A20/G15: vị trí từng ô để cuộn tới đúng ô lỗi thay vì về đầu trang.
  const fieldRefs = useRef<Record<string, View | null>>({});

  const scrollToField = (key: string) => {
    const node = fieldRefs.current[key];
    const scroll = scrollRef.current;
    if (!node || !scroll) {
      scroll?.scrollTo({ y: 0, animated: true });
      return;
    }
    node.measureLayout(
      scroll as unknown as number,
      (_x, y) => {
        scroll.scrollTo({ y: Math.max(0, y - 12), animated: true });
      },
      () => {
        scroll.scrollTo({ y: 0, animated: true });
      },
    );
  };

  const clearFieldError = (f: string) => {
    setFieldErrors(prev => {
      if (!prev[f]) return prev;
      const next = { ...prev };
      delete next[f];
      return next;
    });
  };

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
      if (params.preferred_date === vnDateKey()) setDateChip('today');
      else if (params.preferred_date === vnDateKey(1)) setDateChip('tomorrow');
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
    setDate(vnDateKey(1));
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

  const currentEstimateAmount = useMemo(() => {
    if (selectedServiceData?.fixed_price) return selectedServiceData.fixed_price;
    if (priceEstimate?.price_max) return priceEstimate.price_max;
    if (selectedServiceData?.base_price_min) return selectedServiceData.base_price_min;
    if (targetPrice) {
      const p = Number(String(targetPrice).replace(/[^0-9]/g, ''));
      if (p > 0) return p;
    }
    return 0;
  }, [selectedServiceData, priceEstimate, targetPrice]);

  // Khi giá ước tính thay đổi sau khi đã áp voucher thì tính lại preview ngay
  useEffect(() => {
    if (voucherCode && voucherPreview) {
      validateVoucher
        .mutateAsync({
          code: voucherCode,
          amount: currentEstimateAmount || 0,
        })
        .then(res => {
          setVoucherPreview(res);
        })
        .catch(() => {});
    }
  }, [currentEstimateAmount]);

  // ── Photo Pickers for Step 3 ───────────────────────────────────────────────
  const handleTakeJobPhoto = async () => {
    try {
      // B14: camera không hỗ trợ trên web → chọn ảnh từ thư viện (mẫu home.tsx)
      if (Platform.OS === 'web') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
        if (!result.canceled && result.assets[0]?.uri) {
          setPhotos(prev => [...prev, result.assets[0].uri].slice(0, 6));
        }
        return;
      }
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: t('booking_toast_camera_perm') });
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
      Toast.show({ type: 'error', text1: t('booking_toast_camera_error') });
    }
  };

  const handlePickJobPhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Toast.show({ type: 'error', text1: t('booking_toast_gallery_perm') });
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
      Toast.show({ type: 'error', text1: t('booking_toast_gallery_error') });
    }
  };

  // ── Feature 17: Phân tích ảnh sự cố bằng AI Vision ─────────────────────────
  // Nếu đã có ảnh trong photos: phân tích ngay photos[0].
  // Nếu chưa có ảnh: mở picker để chọn 1 ảnh, thêm vào photos rồi phân tích.
  const handleAnalyzeIssuePhoto = async () => {
    const unavailableToast = (msg?: string) =>
      Toast.show({
        type: 'info',
        text1: t('booking_ai_photo_failed_title'),
        text2: msg || t('booking_ai_photo_failed_desc'),
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
            Toast.show({ type: 'error', text1: t('booking_toast_gallery_perm') });
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
            text1: t('booking_ai_photo_no_select_title'),
            text2: t('booking_ai_photo_no_select_desc'),
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
        unavailableToast(t('booking_ai_photo_path_error'));
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
        unavailableToast(t('booking_ai_photo_read_error'));
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
                t('booking_ai_suggest_change_title'),
                t('booking_ai_suggest_change_desc', {
                  newSvc: tService(svc),
                  oldSvc: tService(currentSvc) || (lang === 'en' ? 'other' : 'khác'),
                }),
                [
                  { text: t('booking_keep_current_svc'), style: 'cancel' },
                  {
                    text: t('booking_change_to_svc', { name: tService(svc) }),
                    onPress: () => setSelectedService(svc._id),
                  },
                ],
              );
            } else {
              setSelectedService(svc._id);
            }
          } else {
            // Item 7: AI suggests a service slug not found in catalog -> inform user and switch to custom service
            const customName = res.suggested_service_name || res.suggested_service_slug;
            Alert.alert(
              t('booking_ai_service_tip_title'),
              t('booking_ai_service_tip_desc', { name: customName }),
              [
                {
                  text: t('common_confirm'),
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
          text1: t('booking_ai_photo_success_title'),
          text2: t('booking_ai_photo_success_desc'),
        });
      } else {
        // B78: hiển thị lý do phù hợp theo reason từ server
        const reasonMsg =
          res?.reason === 'no_api_key'
            ? lang === 'en'
              ? 'AI analysis is not configured yet (no API key). The photo is attached; please describe the issue briefly.'
              : 'Tính năng chưa khả dụng (chưa cấu hình AI). Ảnh đã được đính kèm, bạn vui lòng mô tả ngắn gọn giúp mình nhé!'
            : res?.reason === 'invalid_image'
              ? lang === 'en'
                ? 'The issue photo is invalid. Please retake a clearer photo.'
                : 'Ảnh sự cố không hợp lệ. Vui lòng chụp lại ảnh rõ hơn.'
              : res?.reason === 'unsupported'
                ? lang === 'en'
                  ? 'This image format is not supported for AI analysis. Please use JPG, PNG or WEBP.'
                  : 'Định dạng ảnh chưa được hỗ trợ phân tích. Vui lòng dùng ảnh JPG, PNG hoặc WEBP.'
                : res?.message;
        unavailableToast(reasonMsg);
      }
    } catch (err: any) {
      console.warn('AI issue photo analysis error:', err);
      unavailableToast(err?.response?.data?.message || err?.message);
    } finally {
      setIsAnalyzingPhoto(false);
    }
  };

  // ── Goong Maps GPS & Search Handlers ────────────────────────────────────
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
          text1: t('booking_gps_located_title'),
          text2: parsed.full_address || details.full_address,
        });
      } else {
        Toast.show({
          type: 'info',
          text1: t('booking_gps_auto_fail_title'),
          text2: t('booking_gps_auto_fail_desc'),
        });
      }
    } catch {
      Toast.show({
        type: 'info',
        text1: t('booking_gps_fail_title'),
        text2: t('booking_gps_fail_desc'),
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

    // 2. Dự phòng phân tách token từ phải sang trái khi địa chỉ không có tiền tố hành chính (vd Đà Nẵng)
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
      text1: t('booking_toast_map_selected'),
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
              t('booking_ai_suggest_change_title'),
              t('booking_ai_suggest_desc', {
                newSvc: tService(svc),
                currentSvc: currentSvc ? tService(currentSvc) : lang === 'en' ? 'other' : 'khác',
              }),
              [
                { text: t('booking_keep_current_svc'), style: 'cancel' },
                {
                  text: t('booking_change_to_svc', { name: tService(svc) }),
                  onPress: () => setSelectedService(svc._id),
                },
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
                t('booking_ai_suggest_change_title'),
                t('booking_ai_suggest_desc', {
                  newSvc: tService(fallbackSvc),
                  currentSvc: currentSvc ? tService(currentSvc) : lang === 'en' ? 'other' : 'khác',
                }),
                [
                  { text: t('booking_keep_current_svc'), style: 'cancel' },
                  {
                    text: t('booking_change_to_svc', { name: tService(fallbackSvc) }),
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
        const tasksPrefix =
          lang === 'en' ? '\n\nTasks to perform:\n• ' : '\n\nCác hạng mục cần làm:\n• ';
        const notesPrefix = lang === 'en' ? '\n\nGhi chú: ' : '\n\nGhi chú: ';
        const tasksList = result.tasks?.length ? `${tasksPrefix}${result.tasks.join('\n• ')}` : '';
        const notesStr = result.notes ? `${notesPrefix}${result.notes}` : '';
        setDescription(`${aiInput}${tasksList}${notesStr}`);
      }

      Toast.show({
        type: 'success',
        text1: t('booking_ai_desc_success_title'),
        text2: t('booking_ai_desc_success_desc'),
      });
    } catch {
      Toast.show({ type: 'error', text1: t('booking_ai_desc_fail') });
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

  // P0-7: tài khoản chưa xác minh email thì server chặn tạo đơn — hiện hộp
  // thoại kèm nút gửi lại mã (đưa sang màn OTP) thay vì lỗi trần ở cuối submit.
  const promptVerifyBeforeBooking = (email?: string) => {
    if (!email?.trim()) {
      Toast.show({ type: 'error', text1: t('verify_banner_no_email') });
      return;
    }
    Alert.alert(t('booking_verify_title'), t('booking_verify_desc'), [
      { text: t('common_cancel'), style: 'cancel' },
      {
        text: t('booking_verify_resend'),
        onPress: async () => {
          try {
            await resendAndGoToOtp(email);
          } catch (err: unknown) {
            const raw = (err as { response?: { data?: { message?: unknown } } })?.response
              ?.data?.message;
            Toast.show({
              type: 'error',
              text1:
                mapAuthErrorMessage(raw, lang) ??
                (lang === 'en'
                  ? 'Could not resend the code. Please try again.'
                  : 'Không gửi lại được mã. Vui lòng thử lại.'),
            });
          }
        },
      },
    ]);
  };

  const handleSubmit = async () => {
    if (!useAuthStore.getState().isAuthenticated) {
      Toast.show({
        type: 'info',
        text1: t('booking_login_required_title'),
        text2: t('booking_login_required_desc'),
      });
      router.push('/(auth)/login');
      return;
    }

    // P0-7: kiểm tra xác minh TRƯỚC khi submit — chỉ chặn khi biết chắc chưa
    // xác minh (profile store đều có is_verified); chưa rõ thì để server quyết.
    const verifyState = myProfile ?? useAuthStore.getState().user;
    if (verifyState && verifyState.is_verified === false) {
      promptVerifyBeforeBooking((verifyState as { email?: string }).email);
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
        text1: t('booking_address_validation_error'),
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
          text1: t('booking_coords_unconfirmed_title'),
          text2: t('booking_coords_unconfirmed_desc'),
        });
        setStep(1);
        return;
      }
    }

    if (!date || !timeSlot) {
      Toast.show({ type: 'error', text1: t('booking_time_validation_error') });
      setStep(2);
      return;
    }
    if (!title.trim() || !description.trim()) {
      Toast.show({ type: 'error', text1: t('booking_title_desc_required') });
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
      const startDateTime = toVnDayjs(`${date} ${timeSlot}`);
      if (startDateTime.isBefore(vnNow().subtract(1, 'minute'))) {
        Toast.show({ type: 'error', text1: t('booking_time_past_error') });
        return;
      }
      const endTime = formatTime(startDateTime.add(durMinsTotal, 'minute'));
      const cleanNum = targetPrice ? Number(String(targetPrice).replace(/[^0-9]/g, '')) : undefined;
      if (cleanNum !== undefined && cleanNum < 50000) {
        Toast.show({ type: 'error', text1: t('booking_min_price_error') });
        return;
      }

      await createJob.mutateAsync({
        service_id: currentServiceId === 'custom' ? undefined : currentServiceId,
        custom_service_name: customServiceName.trim() || undefined,
        target_price: cleanNum && cleanNum > 0 ? cleanNum : undefined,
        title: title.trim() || customServiceName.trim() || t('booking_default_title'),
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
      const rawMsg = err?.response?.data?.message;
      const msgStr = Array.isArray(rawMsg) ? rawMsg[0] : rawMsg;
      // P0-7: server vẫn có thể chặn (vd. profile chưa kịp load ở pre-check)
      // → đưa lối gửi lại mã thay vì toast lỗi trần.
      if (typeof msgStr === 'string' && msgStr.includes('chưa được xác minh')) {
        promptVerifyBeforeBooking(
          (myProfile as { email?: string } | undefined)?.email ??
            (useAuthStore.getState().user as { email?: string } | null)?.email,
        );
        return;
      }
      const msg =
        mapAuthErrorMessage(msgStr, lang) ??
        (typeof msgStr === 'string' ? msgStr : t('booking_create_failed'));
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handleNextStep = () => {
    const nextErrors: Record<string, string> = {};
    if (step === 0) {
      if (!selectedService) {
        nextErrors.service = t('booking_select_service_error');
        setFieldErrors(nextErrors);
        scrollToField('service');
        return;
      }
      if (selectedService === 'custom') {
        if (!customServiceName.trim()) {
          nextErrors.customServiceName = t('booking_enter_service_name_error');
        }
        if (targetPrice) {
          const cleanP = Number(String(targetPrice).replace(/[^0-9]/g, ''));
          if (cleanP > 0 && cleanP < 50000) {
            nextErrors.targetPrice = t('booking_min_price_error');
          }
        }
        if (Object.keys(nextErrors).length > 0) {
          setFieldErrors(nextErrors);
          // G15: cuộn tới ô lỗi ĐẦU TIÊN theo thứ tự hiển thị — chỉ sai giá
          // thì cuộn tới ô targetPrice, không cuộn về ô tên dịch vụ nữa.
          scrollToField(nextErrors.customServiceName ? 'customServiceName' : 'targetPrice');
          return;
        }
      }
      setFieldErrors({});
      setStep(1);
    } else if (step === 1) {
      const hasFullAddress = address.full_address.trim().length > 0;
      const hasLocality = Boolean(
        address.district.trim() ||
        address.ward.trim() ||
        address.city.trim() ||
        (address.coordinates && (address.coordinates[0] !== 0 || address.coordinates[1] !== 0)),
      );
      if (!hasFullAddress) {
        nextErrors.full_address = t('booking_address_validation_error');
      } else if (!hasLocality) {
        nextErrors.full_address =
          lang === 'en'
            ? 'Please provide district/ward or pick location on map'
            : 'Vui lòng điền quận/huyện hoặc định vị trên bản đồ';
      }
      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors);
        scrollToField('full_address');
        return;
      }
      setFieldErrors({});
      if (!coordsDerived || (address.coordinates[0] === 0 && address.coordinates[1] === 0)) {
        ensureResolvedCoordinates(address).catch(() => {});
      }
      setStep(2);
    } else if (step === 2) {
      if (!date || !timeSlot) {
        nextErrors.timeSlot = t('booking_time_validation_error');
        setFieldErrors(nextErrors);
        scrollToField('timeSlot');
        return;
      }
      const selectedStart = toVnDayjs(`${date} ${timeSlot}`);
      if (selectedStart.isBefore(vnNow())) {
        nextErrors.timeSlot = t('booking_time_past_error');
        setFieldErrors(nextErrors);
        scrollToField('timeSlot');
        return;
      }
      setFieldErrors({});
      setStep(3);
    } else if (step === 3) {
      if (!title.trim()) {
        nextErrors.title =
          lang === 'en' ? 'Please enter job title' : 'Vui lòng nhập tiêu đề công việc';
      }
      if (!description.trim()) {
        nextErrors.description =
          lang === 'en' ? 'Please describe job details' : 'Vui lòng nhập mô tả chi tiết công việc';
      }
      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors);
        scrollToField(nextErrors.title ? 'title' : 'description');
        return;
      }
      setFieldErrors({});
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
    <View style={{ flex: 1, backgroundColor: tc.surface }}>
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
            borderRadius: 14,
            backgroundColor: tc.subtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <Text style={{ fontSize: fs(18), fontWeight: '800', color: tc.text, marginLeft: 12 }}>
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
                borderRadius: 8,
                backgroundColor: i <= step ? COLORS.primary : COLORS.gray[200],
              }}
            />
          ))}
        </View>
        <Text style={{ fontSize: fs(12), color: tc.textMuted, fontWeight: '600' }}>
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
          ref={scrollRef}
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
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(16) }}>
                    {t('booking_ai_desc_title')}
                  </Text>
                </View>
                <TextInput
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    borderRadius: 14,
                    padding: 12,
                    color: '#fff',
                    fontSize: fs(14),
                    minHeight: 80,
                    textAlignVertical: 'top',
                  }}
                  placeholder=""
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={aiInput}
                  onChangeText={setAiInput}
                  multiline
                />
                <Button
                  title={t('booking_ai_analyze_btn')}
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
                      borderRadius: 14,
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Check size={15} color="#34D399" />
                        <Text style={{ color: '#34D399', fontWeight: '800', fontSize: fs(13.5) }}>
                          {aiSuggestion.service_name || t('booking_ai_done')}
                        </Text>
                      </View>
                      {aiSuggestion.estimated_duration_hours && (
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: fs(12) }}>
                          {t('booking_ai_est_duration', {
                            hours: aiSuggestion.estimated_duration_hours,
                          })}
                        </Text>
                      )}
                    </View>

                    {aiSuggestion.tasks && aiSuggestion.tasks.length > 0 && (
                      <View style={{ gap: 3 }}>
                        <Text
                          style={{
                            color: 'rgba(255,255,255,0.6)',
                            fontSize: fs(11.5),
                            fontWeight: '700',
                          }}
                        >
                          {t('booking_ai_tasks_needed')}
                        </Text>
                        {aiSuggestion.tasks.map((t, i) => (
                          <Text key={i} style={{ color: '#fff', fontSize: fs(12.5) }}>
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
                          fontSize: fs(13.5),
                          marginTop: 2,
                        }}
                      >
                        {t('booking_ai_est_price')}{' '}
                        {new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(
                          aiSuggestion.price_min,
                        )}
                        ₫ –{' '}
                        {new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(
                          aiSuggestion.price_max ?? 0,
                        )}
                        ₫
                      </Text>
                    )}

                    {aiSuggestion.notes && (
                      <Text
                        style={{
                          color: 'rgba(255,255,255,0.5)',
                          fontSize: fs(11.5),
                          fontStyle: 'italic',
                        }}
                      >
                        {aiSuggestion.notes}
                      </Text>
                    )}

                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => {
                        if (!selectedService) {
                          setSelectedService(svcList[0]._id);
                        }
                        clearFieldError('service');
                        setStep(1);
                      }}
                      style={{
                        backgroundColor: COLORS.primary,
                        paddingVertical: 9,
                        borderRadius: 8,
                        alignItems: 'center',
                        marginTop: 4,
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(13) }}>
                        {t('booking_use_suggestion')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Card>

              <Text style={{ fontSize: fs(16), fontWeight: '800', color: tc.text }}>
                {t('booking_or_choose_below')}
              </Text>

              <View
                style={{ gap: 10 }}
                ref={el => {
                  fieldRefs.current.service = el;
                }}
              >
                {isLoadingServices ? (
                  // B28: skeleton hàng dịch vụ giữ khung thay spinner trắng
                  <View style={{ gap: 10 }}>
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} width="100%" height={72} radius={14} />
                    ))}
                    <Text
                      style={{
                        fontSize: fs(13),
                        color: tc.textMuted,
                        fontWeight: '600',
                        textAlign: 'center',
                      }}
                    >
                      {t('booking_loading_services')}
                    </Text>
                  </View>
                ) : (
                  svcList.map(svc => (
                    <TouchableOpacity
                      key={svc._id}
                      onPress={() => {
                        setSelectedService(svc._id);
                        clearFieldError('service');
                        setStep(1);
                      }}
                      style={{
                        borderWidth: 2,
                        borderColor:
                          selectedService === svc._id ? COLORS.primary : COLORS.gray[200],
                        borderRadius: 14,
                        padding: 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 14,
                        backgroundColor: selectedService === svc._id ? COLORS.primaryLight : '#fff',
                      }}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 14,
                          backgroundColor:
                            selectedService === svc._id ? '#DCFCE7' : COLORS.gray[100],
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {renderServiceIcon(
                          svc.slug,
                          26,
                          selectedService === svc._id ? COLORS.primary : COLORS.gray[700],
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                          {tService(svc)}
                        </Text>
                        {svc.description && (
                          <Text
                            style={{ fontSize: fs(12), color: tc.textMuted, marginTop: 2 }}
                            numberOfLines={1}
                          >
                            {tServiceDesc(svc)}
                          </Text>
                        )}
                        {svc.pricing_model === 'fixed' && svc.fixed_price ? (
                          <Text
                            style={{
                              fontSize: fs(12),
                              color: COLORS.primary,
                              marginTop: 4,
                              fontWeight: '700',
                            }}
                          >
                            {t('booking_fixed_price')}{' '}
                            {new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(
                              svc.fixed_price,
                            )}
                            ₫ — {t('booking_fixed_price_sub')}
                          </Text>
                        ) : svc.base_price_min ? (
                          <Text
                            style={{
                              fontSize: fs(12),
                              color: COLORS.primary,
                              marginTop: 4,
                              fontWeight: '700',
                            }}
                          >
                            {lang === 'en'
                              ? `From ${new Intl.NumberFormat('en-US').format(svc.base_price_min)}₫`
                              : `Từ ${new Intl.NumberFormat('vi-VN').format(svc.base_price_min)}₫`}
                          </Text>
                        ) : null}
                      </View>
                      {selectedService === svc._id && (
                        <View
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 14,
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
                  onPress={() => {
                    setSelectedService('custom');
                    clearFieldError('service');
                  }}
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    borderWidth: 2,
                    borderColor: selectedService === 'custom' ? COLORS.primary : '#86EFAC',
                    backgroundColor: selectedService === 'custom' ? COLORS.primaryLight : '#F0FDF4',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      backgroundColor: '#DCFCE7',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Lightbulb size={24} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                        {t('booking_other_service_title')}
                      </Text>
                      <View
                        style={{
                          backgroundColor: '#DCFCE7',
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 8,
                        }}
                      >
                        <Text
                          style={{ fontSize: fs(10), fontWeight: '900', color: COLORS.primary }}
                        >
                          {t('booking_new_badge')}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: fs(12), color: tc.textSecondary, marginTop: 2 }}>
                      {t('booking_other_service_desc')}
                    </Text>
                    <Text
                      style={{
                        fontSize: fs(12),
                        color: COLORS.primary,
                        marginTop: 4,
                        fontWeight: '700',
                      }}
                    >
                      {t('booking_other_service_sub')}
                    </Text>
                  </View>
                  {selectedService === 'custom' && (
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 14,
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
                    ref={el => {
                      fieldRefs.current.customServiceName = el;
                    }}
                    style={{
                      backgroundColor: tc.surface,
                      borderRadius: 14,
                      padding: 16,
                      borderWidth: 1.5,
                      borderColor: COLORS.primary,
                      gap: 12,
                      marginTop: 4,
                    }}
                  >
                    <Input
                      label={t('booking_other_service_name_label')}
                      placeholder=""
                      value={customServiceName}
                      error={fieldErrors.customServiceName}
                      onChangeText={v => {
                        setCustomServiceName(v);
                        clearFieldError('customServiceName');
                      }}
                    />
                    {/* G15: ô giá có ref riêng để scrollToField('targetPrice')
                        đo đúng vị trí ô giá thay vì đầu hộp dịch vụ khác. */}
                    <View
                      ref={el => {
                        fieldRefs.current.targetPrice = el;
                      }}
                    >
                      <Input
                        label={t('booking_other_service_price_label')}
                        placeholder=""
                        value={targetPrice}
                        error={fieldErrors.targetPrice}
                        onChangeText={v => {
                          setTargetPrice(v.replace(/[^0-9]/g, ''));
                          clearFieldError('targetPrice');
                        }}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                )}
                {fieldErrors.service && (
                  <Text style={{ fontSize: fs(12), color: COLORS.error }}>
                    {fieldErrors.service}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* ── STEP 1: Địa chỉ ──────────────────────────────────────── */}
          {step === 1 && (
            <View style={{ gap: 14 }}>
              <Text style={{ fontSize: fs(20), fontWeight: '800', color: tc.text }}>
                {t('booking_step_address_title')}
              </Text>

              {/* Nút GPS Goong Maps */}
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
                <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: fs(14) }}>
                  {isLocating ? t('booking_locating_gps') : t('booking_get_gps')}
                </Text>
              </TouchableOpacity>

              {/* Ô Tìm kiếm địa điểm Goong Maps */}
              <View style={{ gap: 6, position: 'relative', zIndex: 10 }}>
                <Text style={{ fontSize: fs(13), fontWeight: '700', color: tc.textSecondary }}>
                  {t('booking_search_map_title')}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderWidth: 1.5,
                    borderColor: tc.border,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    backgroundColor: tc.surface,
                    gap: 10,
                  }}
                >
                  <Search size={18} color={COLORS.gray[400]} />
                  <TextInput
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      fontSize: fs(14),
                      color: tc.text,
                    }}
                    placeholder={t('booking_search_address_placeholder')}
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
                            borderBottomColor: tc.border,
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            gap: 8,
                          }}
                        >
                          <MapPin size={16} color={COLORS.primary} style={{ marginTop: 2 }} />
                          <Text
                            style={{
                              fontSize: fs(13),
                              color: tc.text,
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
                        backgroundColor: tc.background,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: tc.border,
                      }}
                    >
                      <Text style={{ fontSize: fs(13), color: tc.textMuted, lineHeight: 18 }}>
                        {t('booking_no_location_found')}
                      </Text>
                    </View>
                  )}
              </View>

              <View
                ref={el => {
                  fieldRefs.current.full_address = el;
                }}
              >
                <Input
                  label={t('booking_detail_address_label')}
                  placeholder=""
                  value={address.full_address}
                  error={fieldErrors.full_address}
                  onChangeText={v => {
                    setAddress(a => ({ ...a, full_address: v }));
                    setCoordsDerived(false);
                    clearFieldError('full_address');
                  }}
                  leftIcon={<MapPin size={16} color={COLORS.gray[400]} />}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Input
                    label={t('booking_ward_label')}
                    placeholder=""
                    value={address.ward}
                    onChangeText={v => {
                      setAddress(a => ({ ...a, ward: v }));
                      setCoordsDerived(false);
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label={t('booking_district_label')}
                    placeholder=""
                    value={address.district}
                    onChangeText={v => {
                      setAddress(a => ({ ...a, district: v }));
                      setCoordsDerived(false);
                    }}
                  />
                </View>
              </View>
              <Input
                label={t('booking_city_label')}
                placeholder=""
                value={address.city}
                onChangeText={v => {
                  setAddress(a => ({ ...a, city: v }));
                  setCoordsDerived(false);
                }}
              />
              <Input
                label={t('booking_address_notes_guide')}
                placeholder=""
                value={address.notes}
                onChangeText={v => setAddress(a => ({ ...a, notes: v }))}
              />
            </View>
          )}

          {/* ── STEP 2: Lịch hẹn ─────────────────────────────────────── */}
          {step === 2 && (
            <View style={{ gap: 20 }}>
              <Text style={{ fontSize: fs(20), fontWeight: '800', color: tc.text }}>
                {t('booking_step_schedule_title')}
              </Text>

              {/* 1. Lịch làm việc: Ngày & Giờ (Trigger mở Bottom Sheet Item 1) */}
              <View
                style={{ gap: 10 }}
                ref={el => {
                  fieldRefs.current.timeSlot = el;
                }}
              >
                <Text style={{ fontSize: fs(14), fontWeight: '700', color: tc.text }}>
                  {t('booking_start_time_title')}
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
                      style={{ fontSize: fs(15), fontWeight: '700', color: tc.text }}
                      numberOfLines={1}
                    >
                      {formatDateWithWeekday(date, lang)}
                    </Text>
                    <Text
                      style={{
                        fontSize: fs(11),
                        color: '#64748B',
                        fontWeight: '500',
                        marginTop: 1,
                      }}
                    >
                      {t('booking_tap_to_open_calendar')}
                    </Text>
                  </View>
                  <ChevronRight size={18} color="#16A34A" />
                </TouchableOpacity>

                {/* Day suggestion chips: Hôm nay / Ngày mai / Thứ 7 / Chủ nhật */}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[
                    { key: 'today', labelKey: 'chip_today' },
                    { key: 'tomorrow', labelKey: 'chip_tomorrow' },
                    { key: 'sat', labelKey: 'chip_saturday' },
                    { key: 'sun', labelKey: 'chip_sunday' },
                  ].map(c => {
                    const isSel = dateChip === c.key;
                    return (
                      <ScalePressable
                        key={c.key}
                        onPress={() => {
                          setDateChip(c.key as any);
                          clearFieldError('timeSlot');
                          const now = vnNow();
                          if (c.key === 'today') {
                            const todayStr = vnDateKey();
                            setDate(todayStr);
                            const [th, tm] = timeSlot.split(':').map(Number);
                            const nowVn = getNowVietnam();
                            if (th * 60 + tm <= nowVn.totalMinutes) {
                              setTimeSlot(getDefaultFutureTimeSlot(todayStr));
                            }
                          } else if (c.key === 'tomorrow') setDate(vnDateKey(1));
                          else if (c.key === 'sat') {
                            const nextSat = now.day() <= 6 ? now.day(6) : now.add(1, 'week').day(6);
                            setDate(formatDateKey(nextSat));
                          } else if (c.key === 'sun') {
                            const nextSun = now.day() === 0 ? now : now.day(7);
                            setDate(formatDateKey(nextSun));
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
                            fontSize: fs(11.5),
                            fontWeight: '700',
                            color: isSel ? '#047857' : COLORS.gray[700],
                          }}
                        >
                          {t(c.labelKey)}
                        </Text>
                      </ScalePressable>
                    );
                  })}
                </View>

                {/* Giờ bắt đầu — Dropdown Type 12 */}
                <TimeDropdownPicker
                  value={timeSlot}
                  onChange={v => {
                    setTimeSlot(v);
                    clearFieldError('timeSlot');
                  }}
                  selectedDate={date}
                  label={t('booking_time_label')}
                  showChips={true}
                />
                {fieldErrors.timeSlot && (
                  <Text style={{ fontSize: fs(12), color: COLORS.error }}>
                    {fieldErrors.timeSlot}
                  </Text>
                )}

                {/* Thời lượng ước tính — Dropdown Type 12 */}
                <DurationDropdownPicker
                  valueMinutes={Math.round(duration * 60)}
                  onChangeMinutes={mins => {
                    setDuration(mins / 60);
                  }}
                />

                {/* Lịch dự kiến — Tóm tắt */}
                <ScheduledTimePreview
                  startDate={date}
                  startTime={timeSlot}
                  durationMinutes={Math.round(duration * 60)}
                  price={
                    targetPrice ? Number(String(targetPrice).replace(/[^0-9]/g, '')) : undefined
                  }
                />
              </View>
            </View>
          )}

          {/* ── STEP 3: Mô tả & Ảnh hiện trạng ───────────────────────── */}
          {step === 3 && (
            <View style={{ gap: 16 }}>
              <Text style={{ fontSize: fs(20), fontWeight: '800', color: tc.text }}>
                {t('booking_step_details_title')}
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
                    <Text style={{ fontSize: fs(13), fontWeight: '800', color: '#166534' }}>
                      {t('booking_photos_attached', { count: photos.length })}
                    </Text>
                    <Text style={{ fontSize: fs(12), color: '#15803D', marginTop: 2 }}>
                      {t('booking_photos_attached_hint')}
                    </Text>
                  </View>
                </View>
              )}

              <View
                ref={el => {
                  fieldRefs.current.title = el;
                }}
              >
                <Input
                  label={t('booking_title_label')}
                  placeholder=""
                  value={title}
                  error={fieldErrors.title}
                  onChangeText={v => {
                    setTitle(v);
                    clearFieldError('title');
                  }}
                />
              </View>

              <View
                style={{ gap: 6 }}
                ref={el => {
                  fieldRefs.current.description = el;
                }}
              >
                <Text style={{ fontSize: fs(14), fontWeight: '700', color: tc.textSecondary }}>
                  {t('booking_description_label')}
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: fieldErrors.description ? COLORS.error : COLORS.gray[200],
                    borderRadius: 14,
                    padding: 14,
                    fontSize: fs(15),
                    color: tc.text,
                    backgroundColor: tc.background,
                    minHeight: 120,
                    textAlignVertical: 'top',
                  }}
                  placeholder=""
                  value={description}
                  onChangeText={v => {
                    setDescription(v);
                    clearFieldError('description');
                  }}
                  multiline
                  placeholderTextColor={COLORS.gray[400]}
                />
                {fieldErrors.description && (
                  <Text style={{ fontSize: fs(12), color: COLORS.error, marginTop: -2 }}>
                    {fieldErrors.description}
                  </Text>
                )}
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
                  <Text style={{ fontSize: fs(14), fontWeight: '700', color: tc.textSecondary }}>
                    {t('booking_photos_label', { count: photos.length })}
                  </Text>
                  <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
                    {t('booking_optional')}
                  </Text>
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
                      borderRadius: 14,
                      paddingVertical: 11,
                    }}
                  >
                    <Camera size={18} color={COLORS.primary} />
                    <Text style={{ fontWeight: '700', fontSize: fs(13), color: COLORS.primary }}>
                      {t('booking_take_photo')}
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
                      backgroundColor: tc.subtle,
                      borderRadius: 14,
                      paddingVertical: 11,
                    }}
                  >
                    <ImagePlus size={18} color={COLORS.gray[700]} />
                    <Text style={{ fontWeight: '700', fontSize: fs(13), color: tc.text }}>
                      {t('booking_pick_gallery')}
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
                          borderRadius: 14,
                          overflow: 'hidden',
                          position: 'relative',
                          borderWidth: 1,
                          borderColor: tc.border,
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
                            borderRadius: 14,
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
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(15), flex: 1 }}>
                  {analyzeIssuePhoto.isPending || isAnalyzingPhoto
                    ? t('booking_ai_analyzing_photo')
                    : t('booking_ai_analyze_photo')}
                </Text>
                {analyzeIssuePhoto.isPending || isAnalyzingPhoto ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ChevronRight size={18} color="rgba(255,255,255,0.7)" />
                )}
              </ScalePressable>

              {photoAnalysis?.available && (
                <Card style={{ backgroundColor: COLORS.primaryLight, gap: 6 }}>
                  <Text style={{ fontSize: fs(13), fontWeight: '700', color: COLORS.primary }}>
                    {t('booking_ai_detected_title')}
                  </Text>
                  <Text style={{ fontSize: fs(15), fontWeight: '700', color: tc.text }}>
                    {t('booking_ai_issue_label')} {photoAnalysis.detected_issue ?? '—'}
                  </Text>
                  {photoAnalysis.price_min != null && photoAnalysis.price_max != null && (
                    <Text style={{ fontSize: fs(13), color: tc.textSecondary }}>
                      {t('booking_ai_price_range')}{' '}
                      {new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(
                        photoAnalysis.price_min,
                      )}
                      ₫ –{' '}
                      {new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(
                        photoAnalysis.price_max,
                      )}
                      ₫
                      {photoAnalysis.confidence != null
                        ? ` · ${t('booking_ai_confidence')} ${Math.round(photoAnalysis.confidence * 100)}%`
                        : ''}
                    </Text>
                  )}
                  <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
                    {t('booking_ai_desc_hint')}
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
                      ? t('booking_ai_estimating')
                      : t('booking_ai_estimate_market')}
                  </Text>
                  {!estimatePrice.isPending && (
                    <ChevronRight size={16} color="rgba(255,255,255,0.7)" />
                  )}
                </ScalePressable>
              )}

              {priceEstimate && (
                <Card style={{ backgroundColor: COLORS.primaryLight, gap: 6 }}>
                  <Text style={{ fontSize: fs(13), fontWeight: '700', color: COLORS.primary }}>
                    {t('booking_ai_estimate_title')}
                  </Text>
                  <Text style={{ fontSize: fs(22), fontWeight: '800', color: tc.text }}>
                    {new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(
                      priceEstimate.price_min,
                    )}
                    ₫ –
                    {new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(
                      priceEstimate.price_max,
                    )}
                    ₫
                  </Text>
                  <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
                    {t('booking_ai_market_note')}
                  </Text>
                </Card>
              )}
            </View>
          )}

          {/* ── STEP 4: Xác nhận ─────────────────────────────────────── */}
          {step === 4 && (
            <View style={{ gap: 16 }}>
              <Text style={{ fontSize: fs(20), fontWeight: '800', color: tc.text }}>
                {t('booking_confirm_title')}
              </Text>

              <Card style={{ gap: 14 }}>
                <Row
                  icon={<Briefcase size={16} color={COLORS.primary} />}
                  label={t('common_service')}
                  value={tService(selectedServiceData) || '—'}
                />
                <Row
                  icon={<MapPin size={16} color={COLORS.primary} />}
                  label={t('booking_step_address')}
                  value={
                    [address.full_address, address.ward, address.district, address.city]
                      .filter(Boolean)
                      .join(', ') || t('booking_address_unknown')
                  }
                />
                {address.notes ? (
                  <Row
                    icon={<FileText size={16} color={COLORS.primary} />}
                    label={t('booking_address_notes_label')}
                    value={address.notes}
                  />
                ) : null}
                <Row
                  icon={<Calendar size={16} color={COLORS.primary} />}
                  label={t('booking_date_label')}
                  value={formatDateWithWeekday(date, lang)}
                />
                <Row
                  icon={<Clock size={16} color={COLORS.primary} />}
                  label={t('booking_time_label')}
                  value={`${timeSlot} • ${duration} ${t('common_hours')}`}
                />
                {photos.length > 0 && (
                  <Row
                    icon={<Camera size={16} color={COLORS.primary} />}
                    label={t('booking_attached_photos_label')}
                    value={`${photos.length} ${t('common_photos')}`}
                  />
                )}
                <View style={{ height: 1, backgroundColor: tc.subtle }} />
                <Text style={{ fontWeight: '800', fontSize: fs(16), color: tc.text }}>{title}</Text>
                <Text style={{ color: tc.textSecondary, fontSize: fs(14), lineHeight: 20 }}>
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
                  <Text style={{ fontWeight: '800', fontSize: fs(16), color: '#065F46' }}>
                    {t('booking_fixed_price')}{' '}
                    {new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(
                      selectedServiceData?.fixed_price ?? 0,
                    )}
                    ₫
                  </Text>
                  <Text style={{ fontSize: fs(13), color: tc.textSecondary, lineHeight: 19 }}>
                    {t('booking_fixed_price_desc')}
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
                <Lightbulb size={20} color="#EA580C" style={{ marginTop: 2 }} />
                <Text
                  style={{ flex: 1, fontSize: fs(13), color: tc.textSecondary, lineHeight: 18 }}
                >
                  {isFixedPriceService
                    ? t('booking_quote_tip_fixed')
                    : t('booking_quote_tip_regular')}
                </Text>
              </Card>

              {/* ── Ưu tiên gửi riêng cho thợ yêu thích ─────────────────── */}
              {params.favorite_helper_id && (
                <Card style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Star size={20} color="#F59E0B" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                        {t('booking_send_private_to', {
                          name:
                            params.favorite_helper_name ??
                            (lang === 'en' ? 'favorite helper' : 'thợ yêu thích'),
                        })}
                      </Text>
                      <Text style={{ fontSize: fs(12.5), color: tc.textSecondary, lineHeight: 17 }}>
                        {t('booking_private_offer_desc')}
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
                  <Users size={20} color={COLORS.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                      {t('booking_helpers_needed_title')}
                    </Text>
                    <Text style={{ fontSize: fs(12.5), color: tc.textSecondary, lineHeight: 17 }}>
                      {t('booking_helpers_needed_desc')}
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
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderColor: helpersNeeded === n ? COLORS.primary : COLORS.gray[200],
                        backgroundColor: helpersNeeded === n ? COLORS.primaryLight : '#fff',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: '800',
                          fontSize: fs(15),
                          color: helpersNeeded === n ? COLORS.primaryDark : COLORS.gray[700],
                        }}
                      >
                        {n} {t(n > 1 ? 'common_helpers_plural' : 'common_helper')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Card>

              {/* ── Gói định kỳ ─────────────────────────────────────────── */}
              <Card style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Repeat size={20} color={COLORS.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                      {t('booking_set_recurring')}
                    </Text>
                    <Text style={{ fontSize: fs(12.5), color: tc.textSecondary, lineHeight: 17 }}>
                      {t('booking_recurring_desc')}
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
                          { key: 'weekly', label: t('booking_weekly') },
                          { key: 'monthly', label: t('booking_monthly') },
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
                              fontSize: fs(13),
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
                        {(lang === 'en'
                          ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                          : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
                        ).map((label, idx) => {
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
                                borderRadius: 14,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: active ? COLORS.primary : COLORS.gray[100],
                              }}
                            >
                              <Text
                                style={{
                                  fontWeight: '700',
                                  fontSize: fs(13),
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
                        <Text style={{ fontSize: fs(13.5), color: tc.textSecondary }}>
                          {t('booking_on_day')}
                        </Text>
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
                            borderColor: tc.border,
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            fontSize: fs(14),
                            fontWeight: '700',
                            textAlign: 'center',
                          }}
                        />
                        <Text style={{ fontSize: fs(13.5), color: tc.textSecondary }}>
                          {t('booking_every_month')}
                        </Text>
                      </View>
                    )}
                    <Text style={{ fontSize: fs(12), color: tc.textMuted, lineHeight: 17 }}>
                      {t('booking_recurring_preview', {
                        date: formatDate(date),
                        time: timeSlot,
                        duration,
                      })}
                    </Text>
                  </View>
                )}
              </Card>

              {/* ── Bảng tóm tắt giá (Tạm tính − Tiền giảm = Còn phải trả) ── */}
              {(() => {
                const fmtNum = (n: number) =>
                  new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(n);

                let subtotalText = '';
                if (priceEstimate) {
                  subtotalText = `${fmtNum(priceEstimate.price_min)}₫ – ${fmtNum(priceEstimate.price_max)}₫`;
                } else if (currentEstimateAmount > 0) {
                  subtotalText = `${fmtNum(currentEstimateAmount)}₫`;
                } else {
                  subtotalText = lang === 'en' ? 'Quoted upon offer' : 'Thợ báo giá theo thực tế';
                }

                const calcDiscount = voucherPreview
                  ? voucherPreview.discount_amount > 0
                    ? voucherPreview.discount_amount
                    : currentEstimateAmount > 0
                      ? voucherPreview.discount_type === 'percent'
                        ? Math.min(
                            Math.round(
                              (currentEstimateAmount * voucherPreview.discount_value) / 100,
                            ),
                            voucherPreview.max_discount_amount ?? Infinity,
                          )
                        : voucherPreview.discount_value
                      : 0
                  : 0;

                let discountText = '0₫';
                if (voucherPreview) {
                  if (calcDiscount > 0) {
                    discountText = `−${fmtNum(calcDiscount)}₫`;
                  } else if (voucherPreview.discount_type === 'percent') {
                    discountText = `−${voucherPreview.discount_value}%${voucherPreview.max_discount_amount ? ` (${lang === 'en' ? 'max' : 'tối đa'} ${fmtNum(voucherPreview.max_discount_amount)}₫)` : ''}`;
                  } else {
                    discountText = `−${fmtNum(voucherPreview.discount_value)}₫`;
                  }
                }

                let netToPayText = '';
                if (priceEstimate) {
                  if (calcDiscount > 0) {
                    netToPayText = `${fmtNum(Math.max(0, priceEstimate.price_min - calcDiscount))}₫ – ${fmtNum(Math.max(0, priceEstimate.price_max - calcDiscount))}₫`;
                  } else if (voucherPreview?.discount_type === 'percent') {
                    const factor = 1 - voucherPreview.discount_value / 100;
                    netToPayText = `~${fmtNum(Math.max(0, Math.round(priceEstimate.price_min * factor)))}₫ – ${fmtNum(Math.max(0, Math.round(priceEstimate.price_max * factor)))}₫`;
                  } else {
                    netToPayText = `${fmtNum(priceEstimate.price_min)}₫ – ${fmtNum(priceEstimate.price_max)}₫`;
                  }
                } else if (currentEstimateAmount > 0) {
                  netToPayText = `${fmtNum(Math.max(0, currentEstimateAmount - calcDiscount))}₫`;
                } else {
                  netToPayText = voucherPreview
                    ? lang === 'en'
                      ? 'Calculated on final quote'
                      : 'Tính theo giá chốt trừ voucher'
                    : lang === 'en'
                      ? 'Quoted upon offer'
                      : 'Theo giá chốt của thợ';
                }

                return (
                  <Card
                    style={{
                      backgroundColor: '#F9FAFB',
                      borderColor: tc.border,
                      borderWidth: 1,
                      gap: 12,
                      padding: 16,
                    }}
                  >
                    <Text style={{ fontSize: fs(15), fontWeight: '800', color: tc.text }}>
                      {lang === 'en' ? 'Price Summary' : 'Tóm tắt chi phí'}
                    </Text>
                    <View style={{ gap: 8 }}>
                      {/* Dòng 1: Tạm tính */}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontSize: fs(13.5), color: tc.textSecondary }}>
                          {lang === 'en' ? 'Subtotal (est.)' : 'Tạm tính'}
                        </Text>
                        <Text style={{ fontSize: fs(14), fontWeight: '700', color: tc.text }}>
                          {subtotalText}
                        </Text>
                      </View>

                      {/* Dòng 2: Tiền giảm */}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: fs(13.5),
                            color: voucherPreview ? '#16A34A' : COLORS.gray[600],
                          }}
                        >
                          {lang === 'en' ? 'Voucher discount' : 'Tiền giảm'}
                        </Text>
                        <Text
                          style={{
                            fontSize: fs(14),
                            fontWeight: '700',
                            color: voucherPreview ? '#16A34A' : COLORS.gray[900],
                          }}
                        >
                          {discountText}
                        </Text>
                      </View>

                      <View
                        style={{
                          height: 1,
                          backgroundColor: tc.border,
                          marginVertical: 2,
                        }}
                      />

                      {/* Dòng 3: Còn phải trả */}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontSize: fs(14.5), fontWeight: '800', color: tc.text }}>
                          {lang === 'en' ? 'Est. payment' : 'Còn phải trả'}
                        </Text>
                        <Text
                          style={{
                            fontSize: fs(16),
                            fontWeight: '900',
                            color: COLORS.primaryDark,
                          }}
                        >
                          {netToPayText}
                        </Text>
                      </View>
                    </View>
                  </Card>
                );
              })()}

              {/* ── Mã giảm giá (Roadmap Phase 1 — Voucher) ──────────────── */}
              <VoucherInput
                estimatedAmount={currentEstimateAmount || undefined}
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
          backgroundColor: tc.surface,
          paddingHorizontal: 20,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: tc.border,
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
          clearFieldError('timeSlot');
        }}
      />
    </View>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const { fs } = useTranslation();
  const tc = useThemeColors();
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View
        style={{
          width: 20,
          height: 20,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fs(12), color: tc.textMuted, fontWeight: '600' }}>{label}</Text>
        <Text style={{ fontSize: fs(14), fontWeight: '700', color: tc.text, marginTop: 2 }}>
          {value}
        </Text>
      </View>
    </View>
  );
}
