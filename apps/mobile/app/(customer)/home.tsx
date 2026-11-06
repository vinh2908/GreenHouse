import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Pressable,
  TextInput,
  Platform,
  AccessibilityInfo,
  Animated,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { ScalePressable } from '@/components/common/scale-pressable';
import {
  TimeDropdownPicker,
  DurationDropdownPicker,
  ScheduledTimePreview,
  getDefaultFutureTimeSlot,
  getNowVietnam,
} from '@/components/common/time-dropdown-picker';
import { DateTimePickerBottomSheet } from '@/components/common/date-time-bottom-sheet';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { WebView } from 'react-native-webview';
import Toast from 'react-native-toast-message';
import {
  Bell,
  MapPin,
  Navigation,
  Search,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Camera,
  Copy,
  Calendar,
  Clock,
  Zap,
  Check,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  Users,
  Tag,
  Home,
  UtensilsCrossed,
  Package,
  Baby,
  Wrench,
  Shirt,
  Wind,
  HeartHandshake,
  Truck,
  Lightbulb,
  Star,
} from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { useTranslation } from '@/hooks/use-i18n';
import { I18nKey } from '@/services/i18n';
import {
  useServices,
  useMyJobs,
  useUnreadCount,
  useMyProfile,
  useCreateJob,
  useNearbyHelpers,
  useMyVouchers,
} from '@/hooks/use-api';
import { locationService } from '@/services/location.service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocationPicker, PickerCoords } from '@/components/common/location-picker';
import { Avatar, COLORS, ErrorState } from '@/components/ui';
import { removeVietnameseDiacritics } from '@/utils/search';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import 'dayjs/locale/en';

dayjs.extend(relativeTime);

// ─── Danh mục dịch vụ chuẩn (12 items) ───────────────────────────────────────
interface ServiceItem {
  id: string;
  name: string;
  nameKey: I18nKey;
  priceType: 'fixed_from' | 'custom_deal' | 'quote_job' | 'quote_trip';
  baseAmount?: number;
  unitKey?: I18nKey;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  slug: string;
  isCustom?: boolean;
  badgeKey?: I18nKey;
  subtitle?: string;
  subtitleKey?: I18nKey;
}

const SERVICES_CATALOG: ServiceItem[] = [
  {
    id: '1',
    name: 'Giúp việc theo giờ',
    nameKey: 'svc_housekeeping_hourly',
    priceType: 'fixed_from',
    baseAmount: 60000,
    unitKey: 'price_per_hour',
    icon: Sparkles,
    slug: 'housekeeping_hourly',
  },
  {
    id: '2',
    name: 'Sửa điện gia dụng',
    nameKey: 'svc_electrician',
    priceType: 'quote_job',
    icon: Zap,
    slug: 'electrician',
  },
  {
    id: '3',
    name: 'Dọn nhà',
    nameKey: 'svc_house_cleaning',
    priceType: 'fixed_from',
    baseAmount: 150000,
    unitKey: 'price_per_shift',
    icon: Home,
    slug: 'house_cleaning',
  },
  {
    id: '4',
    name: 'Nấu ăn',
    nameKey: 'svc_cooking',
    priceType: 'fixed_from',
    baseAmount: 120000,
    unitKey: 'price_per_meal',
    icon: UtensilsCrossed,
    slug: 'cooking',
  },
  {
    id: '5',
    name: 'Chuyển nhà',
    nameKey: 'svc_moving_help',
    priceType: 'quote_trip',
    icon: Package,
    slug: 'moving_help',
  },
  {
    id: '6',
    name: 'Chăm trẻ',
    nameKey: 'svc_child_care',
    priceType: 'fixed_from',
    baseAmount: 55000,
    unitKey: 'price_per_hour',
    icon: Baby,
    slug: 'child_care',
  },
  {
    id: '7',
    name: 'Sửa ống nước',
    nameKey: 'svc_plumbing',
    priceType: 'quote_job',
    icon: Wrench,
    slug: 'plumbing',
  },
  {
    id: '8',
    name: 'Giặt ủi',
    nameKey: 'svc_laundry',
    priceType: 'fixed_from',
    baseAmount: 20000,
    unitKey: 'price_per_kg',
    icon: Shirt,
    slug: 'laundry',
  },
  {
    id: '9',
    name: 'Vệ sinh máy lạnh',
    nameKey: 'svc_ac_repair',
    priceType: 'fixed_from',
    baseAmount: 150000,
    unitKey: 'price_per_unit',
    icon: Wind,
    slug: 'ac_repair',
  },
  {
    id: '10',
    name: 'Chăm người già',
    nameKey: 'svc_elderly_care',
    priceType: 'fixed_from',
    baseAmount: 70000,
    unitKey: 'price_per_hour',
    icon: HeartHandshake,
    slug: 'elderly_care',
  },
  {
    id: '11',
    name: 'Bốc hàng, vận chuyển',
    nameKey: 'svc_handyman',
    priceType: 'custom_deal',
    icon: Truck,
    slug: 'handyman',
  },
  {
    id: '12',
    name: 'Dịch vụ khác — tự ghi việc, tự set giá',
    nameKey: 'svc_custom',
    priceType: 'custom_deal',
    icon: Lightbulb,
    slug: 'custom',
    isCustom: true,
    badgeKey: 'badge_new',
    subtitleKey: 'svc_custom_sub',
    subtitle: 'Việc gì cũng đăng được',
  },
];

// ─── Thợ đang ở gần (Dữ liệu thật từ API) ──────────────────────────────────
interface NearbyHelperItem {
  id: string;
  name: string;
  shortName: string;
  phone?: string;
  avatar?: string;
  rating: number;
  completedJobs: number;
  distKm: number;
  distance: string;
  eta: string;
  lat: number;
  lon: number;
  status: string;
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { t, tService, fs, lang, textScale, formatVoucherDesc } = useTranslation();
  const storedUser = useAuthStore(s => s.user);
  const { data: profile, refetch: refetchProfile } = useMyProfile();
  const user = profile ?? storedUser;
  const { data: services, isError: sError, refetch: refetchServices } = useServices();
  const {
    data: recentJobs,
    isLoading: jLoading,
    isError: jError,
    refetch: refetchJobs,
  } = useMyJobs();
  const { data: unread, refetch: refetchUnread } = useUnreadCount();
  const createJob = useCreateJob();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const { width: windowWidth } = useWindowDimensions();

  // Vị trí người dùng (chỉ nhận vị trí thật, không mặc định Sài Gòn/Đà Nẵng)
  const [currentLocationName, setCurrentLocationName] = useState('Chưa xác định vị trí');
  const [currentCoords, setCurrentCoords] = useState<PickerCoords | null>(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [selectedHelperId, setSelectedHelperId] = useState<string>('');
  const [isLocatingLive, setIsLocatingLive] = useState(false);
  const mapWebViewRef = useRef<WebView>(null);
  const mapIframeRef = useRef<any>(null);

  useEffect(() => {
    if (!selectedHelperId) return;
    if (Platform.OS === 'web') {
      mapIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ type: 'SELECT_HELPER', id: selectedHelperId }),
        '*',
      );
    } else {
      mapWebViewRef.current?.injectJavaScript(`
        if (typeof window.selectHelper === 'function') {
          window.selectHelper("${selectedHelperId}", true);
        }
        true;
      `);
    }
  }, [selectedHelperId]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const globalRef: any = typeof globalThis !== 'undefined' ? globalThis : null;
    if (!globalRef?.addEventListener) return;
    const handleMsg = (e: any) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data?.type === 'SELECT_HELPER' && data.id) {
          setSelectedHelperId(data.id);
        }
      } catch {}
    };
    globalRef.addEventListener('message', handleMsg);
    return () => globalRef.removeEventListener('message', handleMsg);
  }, []);

  // Yêu cầu lấy vị trí GPS thật
  const handleRequestLiveLocation = async () => {
    setIsLocatingLive(true);
    try {
      const details = await locationService.getCurrentLocationDetails();
      if (details && details.coordinates && details.coordinates.length >= 2) {
        const coords = {
          latitude: details.coordinates[1],
          longitude: details.coordinates[0],
        };
        const label = inferLocationLabel(details);
        setCurrentCoords(coords);
        setCurrentLocationName(label);
        AsyncStorage.setItem(
          '@homemate_customer_pinned_location',
          JSON.stringify({ coords, locationName: label, is_gps: true }),
        ).catch(() => {});
      } else {
        setCurrentCoords(null);
        setCurrentLocationName('Chưa xác định vị trí');
      }
    } catch {
      setCurrentCoords(null);
      setCurrentLocationName('Chưa xác định vị trí');
    } finally {
      setIsLocatingLive(false);
    }
  };

  // API Thợ gần & Vouchers thật
  const { data: nearbyRaw, refetch: refetchNearby } = useNearbyHelpers(currentCoords);
  const { data: vouchersRaw, refetch: refetchVouchers } = useMyVouchers();
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  const handlePullRefresh = async () => {
    setIsPullRefreshing(true);
    try {
      await Promise.allSettled([
        refetchProfile(),
        refetchServices(),
        refetchJobs(),
        refetchUnread(),
        refetchNearby(),
        refetchVouchers(),
      ]);
    } finally {
      setIsPullRefreshing(false);
    }
  };

  // Accessibility reduce motion
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub?.remove();
  }, []);

  // AI Card Shimmer Sweep
  const shineAnim = useRef(new Animated.Value(-150)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shineAnim, {
          toValue: 450,
          duration: 2400,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.delay(1600),
        Animated.timing(shineAnim, {
          toValue: -150,
          duration: 0,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion]);

  // Vouchers state & auto-scroll
  const [copiedVoucher, setCopiedVoucher] = useState<string | null>(null);
  const voucherScrollRef = useRef<ScrollView>(null);
  const [activeVoucherIdx, setActiveVoucherIdx] = useState(0);
  const isUserScrollingVouchers = useRef(false);
  const [voucherCardWidth, setVoucherCardWidth] = useState(272);

  // Date Time Bottom Sheet state (Item 1)
  const [dateTimePickerOpen, setDateTimePickerOpen] = useState(false);
  const [bottomSheetInitialTab, setBottomSheetInitialTab] = useState<'date' | 'time'>('date');

  // Month Calendar state
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(dayjs());

  const [customHours, setCustomHours] = useState(1);
  const [customMinutes, setCustomMinutes] = useState(30);
  const [isCustomDuration, setIsCustomDuration] = useState(false);

  // Khối Quick Booking Block ("Đăng việc theo ý bạn")
  const [quickServiceChip, setQuickServiceChip] = useState<
    'don_nha' | 'boc_hang' | 'may_lanh' | 'khac'
  >('boc_hang');
  const [quickDescription, setQuickDescription] = useState('');
  const [quickDealPrice, setQuickDealPrice] = useState('200000');
  const [quickDateChip, setQuickDateChip] = useState<'today' | 'tomorrow' | 'sat' | 'sun' | null>(
    'tomorrow',
  );
  const [quickDate, setQuickDate] = useState(dayjs().add(1, 'day').format('YYYY-MM-DD'));
  const [quickTimeSlot, setQuickTimeSlot] = useState(() =>
    getDefaultFutureTimeSlot(dayjs().add(1, 'day').format('YYYY-MM-DD')),
  );
  const [quickCustomTimeOpen, setQuickCustomTimeOpen] = useState(false);
  const [quickCustomTimeInput, setQuickCustomTimeInput] = useState('');
  const [quickDuration, setQuickDuration] = useState(2);
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);

  // Tìm kiếm dịch vụ tương tác (Item 8 & Bug 5: không phân biệt dấu + tự cuộn)
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const servicesSectionYRef = useRef<number>(0);

  const handleSearchChange = (text: string) => {
    setServiceSearchQuery(text);
    if (text.trim().length > 0 && servicesSectionYRef.current > 0) {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, servicesSectionYRef.current - 40),
        animated: true,
      });
    }
  };

  // Xác định khu vực hiện tại là Đà Nẵng hay HCM
  const isDaNang = useMemo(() => {
    return (
      currentLocationName.includes('Đà Nẵng') ||
      currentLocationName.includes('Da Nang') ||
      (currentCoords && currentCoords.latitude > 15.5 && currentCoords.latitude < 16.5)
    );
  }, [currentLocationName, currentCoords]);

  // Danh sách thợ gần thật từ API (chỉ tải khi đã có vị trí thật của người dùng)
  const nearbyHelpers: NearbyHelperItem[] = useMemo(() => {
    if (!currentCoords || !nearbyRaw || !Array.isArray(nearbyRaw) || nearbyRaw.length === 0)
      return [];
    return nearbyRaw
      .filter((h: any) => h.location?.coordinates && h.location.coordinates.length >= 2)
      .map((h: any, idx: number) => {
        const coords = h.location.coordinates; // [lng, lat]
        const helperName = h.user_id?.full_name || t('home_helper_fallback');
        const nameParts = helperName.trim().split(/\s+/);
        const shortName = nameParts.length > 2 ? nameParts.slice(-2).join(' ') : helperName;
        let distKm = 0;
        if (currentCoords) {
          distKm = calculateDistanceKm(
            currentCoords.latitude,
            currentCoords.longitude,
            coords[1],
            coords[0],
          );
        }
        const distText =
          distKm < 1
            ? `${Math.round(distKm * 1000)} m`
            : `${distKm.toFixed(1).replace('.', ',')} km`;
        const etaMinutes = Math.max(5, Math.round(distKm * 3.5) + 3);
        const etaText = t('home_eta_min', { min: etaMinutes });
        return {
          id: String(h._id || idx),
          name: helperName,
          shortName,
          phone: h.user_id?.phone,
          avatar: h.user_id?.avatar,
          rating: h.rating || 5.0,
          completedJobs: h.completed_jobs || 0,
          distKm,
          distance: distText,
          eta: etaText,
          lat: coords[1],
          lon: coords[0],
          status: 'Đang rảnh',
        };
      })
      .sort((a, b) => a.distKm - b.distKm);
  }, [nearbyRaw, currentCoords, lang, t]);

  // Vouchers thật còn hiệu lực
  const vouchers = useMemo(() => {
    if (!vouchersRaw || !Array.isArray(vouchersRaw) || vouchersRaw.length === 0) return [];
    return vouchersRaw.filter(v => v.is_active !== false);
  }, [vouchersRaw]);

  // Auto-scroll vouchers
  useEffect(() => {
    if (reduceMotion || vouchers.length <= 1) return;
    const timer = setInterval(() => {
      if (isUserScrollingVouchers.current) return;
      setActiveVoucherIdx(prev => {
        const next = (prev + 1) % vouchers.length;
        voucherScrollRef.current?.scrollTo({ x: next * voucherCardWidth, animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [vouchers.length, reduceMotion]);

  // Ma trận ngày của tháng cho bộ chọn lịch
  const calendarDays = useMemo(() => {
    const startOfMonth = calendarMonth.startOf('month');
    const daysInMonth = calendarMonth.daysInMonth();
    const startOffset = (startOfMonth.day() + 6) % 7; // T2 là 0
    const items: ({
      dayNum: number;
      dateStr: string;
      isPast: boolean;
      isToday: boolean;
      isSelected: boolean;
    } | null)[] = [];
    for (let i = 0; i < startOffset; i++) {
      items.push(null);
    }
    const todayStr = dayjs().format('YYYY-MM-DD');
    const startOfToday = dayjs().startOf('day');
    for (let d = 1; d <= daysInMonth; d++) {
      const dObj = calendarMonth.date(d);
      const dateStr = dObj.format('YYYY-MM-DD');
      items.push({
        dayNum: d,
        dateStr,
        isPast: dObj.isBefore(startOfToday),
        isToday: dateStr === todayStr,
        isSelected: dateStr === quickDate,
      });
    }
    return items;
  }, [calendarMonth, quickDate]);

  // Tọa độ gốc cho mini-map: chỉ trả về khi có vị trí thật, không mặc định Sài Gòn hay Đà Nẵng
  const mapCenter = useMemo(() => {
    if (currentCoords && currentCoords.latitude && currentCoords.longitude) {
      return { latitude: currentCoords.latitude, longitude: currentCoords.longitude };
    }
    return null;
  }, [currentCoords]);

  // Sinh HTML Goong bản đồ mini với ghim gọn, tương tác kéo/zoom/chọn thợ không reload
  const leafletMiniMapHtml = useMemo(() => {
    if (!mapCenter) return '';
    const pinsJson = JSON.stringify(
      nearbyHelpers.map(h => ({
        id: h.id,
        name: h.name, // Hiển thị đầy đủ TÊN THỢ khi chọn
        lat: h.lat,
        lon: h.lon,
      })),
    );

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <base target="_self" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css" />
  <script src="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #map { width: 100%; height: 100%; background: #f8fafc; overflow: hidden; }
    .goong-attribution {
      position: absolute;
      bottom: 4px;
      right: 6px;
      background: rgba(255,255,255,0.88);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 9px;
      color: #374151;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 10;
      pointer-events: auto;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .goong-attribution a { color: #0284c7; text-decoration: none; font-weight: 700; }
    .map-error-card {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
      padding: 16px;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #64748b;
      font-size: 12px;
      gap: 8px;
    }
    .map-retry-btn {
      background: #16a34a;
      color: #ffffff;
      border: none;
      padding: 6px 14px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 12px;
      cursor: pointer;
    }
    .pin-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #16A34A;
      border: 2.5px solid #FFFFFF;
      box-shadow: 0 2px 6px rgba(0,0,0,0.28);
      cursor: pointer;
      transform: translate(-50%, -50%);
      transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .pin-pill-selected {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #16A34A;
      border: 2px solid #FFFFFF;
      color: #FFFFFF;
      padding: 3px 8px;
      border-radius: 9999px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      font-weight: 800;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      white-space: nowrap;
      cursor: pointer;
      transform: translate(-50%, -50%);
    }
    .user-pill {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      background: #0284C7;
      color: #FFFFFF;
      padding: 2px 7px;
      border-radius: 9999px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 10px;
      font-weight: 700;
      border: 1.5px solid #FFFFFF;
      box-shadow: 0 1px 4px rgba(0,0,0,0.2);
      transform: translate(-50%, -50%);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="goong-attribution">© <a href="https://goong.io" target="_blank" rel="noopener">Goong Maps</a></div>
  <script>
    const mapKey = '${process.env.EXPO_PUBLIC_GOONG_MAP_KEY || ''}';
    if (!mapKey) {
      document.getElementById('map').innerHTML = '<div class="map-error-card"><span>' + ${JSON.stringify(t('home_map_no_key'))} + '</span></div>';
    } else {
      try {
        const map = new maplibregl.Map({
          container: 'map',
          style: 'https://tiles.goong.io/assets/goong_map_web.json?api_key=' + encodeURIComponent(mapKey),
          center: [${mapCenter.longitude}, ${mapCenter.latitude}],
          zoom: 14,
          interactive: true,
          cooperativeGestures: true,
          attributionControl: false
        });

        function addMountainFallbacks() {
          try {
            var canvas = document.createElement('canvas');
            canvas.width = 16;
            canvas.height = 16;
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, 16, 16);
            var emptyData = ctx.getImageData(0, 0, 16, 16);
            if (!map.hasImage('mountain-11')) map.addImage('mountain-11', emptyData);
            if (!map.hasImage('mountain-15')) map.addImage('mountain-15', emptyData);
          } catch(e){}
          try {
            if (map.getLayer && map.getLayer('poi-mountain')) {
              map.setLayoutProperty('poi-mountain', 'icon-image', '');
            }
          } catch(e){}
        }

        map.on('styleimagemissing', function(e) {
          const id = e.id;
          if (!map.hasImage(id)) {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = 16;
              canvas.height = 16;
              const ctx = canvas.getContext('2d');
              ctx.clearRect(0, 0, 16, 16);
              map.addImage(id, ctx.getImageData(0, 0, 16, 16));
            } catch(err) {}
          }
        });

        map.on('styledata', function() {
          addMountainFallbacks();
        });
        map.on('load', function() {
          addMountainFallbacks();
        });

        ${
          currentCoords
            ? `
        const userEl = document.createElement('div');
        userEl.innerHTML = '<div class="user-pill"><span>' + ${JSON.stringify(t('home_map_you_are_here'))} + '</span></div>';
        new maplibregl.Marker({ element: userEl })
          .setLngLat([${currentCoords.longitude}, ${currentCoords.latitude}])
          .addTo(map);
        `
            : ''
        }

        window.__markers = {};
        const pins = ${pinsJson};
        pins.forEach(p => {
          const pinEl = document.createElement('div');
          pinEl.style.cursor = 'pointer';
          pinEl.innerHTML = '<div class="pin-dot"></div>';
          pinEl.onclick = function() {
            window.selectHelper(p.id, true);
          };
          const marker = new maplibregl.Marker({ element: pinEl })
            .setLngLat([p.lon, p.lat])
            .addTo(map);

          window.__markers[p.id] = {
            id: p.id,
            name: p.name,
            lat: p.lat,
            lon: p.lon,
            el: pinEl,
            marker: marker
          };
        });

        window.selectHelper = function(id, fly) {
          Object.keys(window.__markers).forEach(k => {
            const item = window.__markers[k];
            if (k === id) {
              item.el.innerHTML = '<div class="pin-pill-selected"><span>' + item.name + '</span></div>';
              if (fly && map) {
                map.flyTo({ center: [item.lon, item.lat], zoom: 15, essential: true });
              }
            } else {
              item.el.innerHTML = '<div class="pin-dot"></div>';
            }
          });
          const msg = JSON.stringify({ type: 'SELECT_HELPER', id: id });
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(msg);
          } else if (window.parent) {
            window.parent.postMessage(msg, '*');
          }
        };

        window.addEventListener('message', function(e) {
          try {
            const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            if (data && data.type === 'SELECT_HELPER' && data.id) {
              window.selectHelper(data.id, true);
            }
          } catch(err) {}
        });

        if (${JSON.stringify(selectedHelperId || '')}) {
          window.selectHelper(${JSON.stringify(selectedHelperId || '')}, false);
        }
      } catch (e) {
        document.getElementById('map').innerHTML = '<div class="map-error-card"><span>' + ${JSON.stringify(t('home_map_error'))} + '</span><button class="map-retry-btn" onclick="window.location.reload()">' + ${JSON.stringify(t('home_map_retry'))} + '</button></div>';
      }
    }
  </script>
</body>
</html>`;
  }, [mapCenter, nearbyHelpers, lang, t]);

  // Lời chào theo thời gian trong ngày (khuya / sáng / chiều / tối)
  const greeting = useMemo(() => {
    const hour = dayjs().hour();
    const name = user?.full_name
      ? user.full_name.split(' ').pop() || user.full_name
      : lang === 'en'
        ? 'there'
        : 'bạn';

    if (hour >= 22 || hour < 5) {
      return {
        title: t('home_greeting_night', { name }),
        subtitle: t('home_greeting_night_sub'),
      };
    } else if (hour >= 5 && hour < 12) {
      return {
        title: t('home_greeting_morning', { name }),
        subtitle: t('home_greeting_morning_sub'),
      };
    } else if (hour >= 12 && hour < 18) {
      return {
        title: t('home_greeting_afternoon', { name }),
        subtitle: t('home_greeting_afternoon_sub'),
      };
    } else {
      return {
        title: t('home_greeting_evening', { name }),
        subtitle: t('home_greeting_evening_sub'),
      };
    }
  }, [user, lang, t]);

  // Tách nhãn vị trí ngắn gọn
  const inferLocationLabel = (
    geo?: {
      city?: string;
      district?: string;
      ward?: string;
      full_address?: string;
    } | null,
  ): string => {
    if (!geo) return 'Chưa rõ vị trí';
    let city = geo.city?.trim();
    let district = geo.district?.trim() || geo.ward?.trim();

    if (!city || !district) {
      if (geo.full_address) {
        const parts = geo.full_address
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        if (parts.length >= 2) {
          if (!city) city = parts[parts.length - 1];
          if (!district) district = parts[parts.length - 2];
        } else if (parts.length === 1) {
          if (!city) city = parts[0];
        }
      }
    }

    if (district && city) return `${district}, ${city}`;
    if (city) return city;
    if (district) return district;
    return 'Chưa rõ vị trí';
  };

  useEffect(() => {
    AsyncStorage.getItem('@homemate_customer_pinned_location')
      .then(saved => {
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            const isOldFakeSaigon =
              !parsed.coords ||
              (Math.abs(parsed.coords.latitude - 10.7769) < 0.015 &&
                Math.abs(parsed.coords.longitude - 106.7009) < 0.015) ||
              (Math.abs(parsed.coords.latitude - 10.7725) < 0.015 &&
                Math.abs(parsed.coords.longitude - 106.6983) < 0.015);

            // Vị trí đã ghim chỉ được tính nếu là do chính khách chủ động chọn thủ công hoặc đã lấy GPS thật
            if (!isOldFakeSaigon && parsed.coords && (parsed.is_manual_pick || parsed.is_gps)) {
              if (parsed.locationName) setCurrentLocationName(parsed.locationName);
              setCurrentCoords(parsed.coords);
              return;
            } else if (isOldFakeSaigon || !parsed.is_manual_pick) {
              // Tọa độ mặc định cũ bị lưu sai: xóa ngay khỏi bộ nhớ lưu trữ
              AsyncStorage.removeItem('@homemate_customer_pinned_location').catch(() => {});
            }
          } catch {}
        }
        // Thử lấy vị trí GPS thật từ thiết bị/trình duyệt
        locationService
          .getCurrentLocationDetails()
          .then(details => {
            if (details && details.coordinates && details.coordinates.length >= 2) {
              const coords = {
                latitude: details.coordinates[1],
                longitude: details.coordinates[0],
              };
              const isOldFakeSaigon =
                (Math.abs(coords.latitude - 10.7769) < 0.015 &&
                  Math.abs(coords.longitude - 106.7009) < 0.015) ||
                (Math.abs(coords.latitude - 10.7725) < 0.015 &&
                  Math.abs(coords.longitude - 106.6983) < 0.015);
              if (!isOldFakeSaigon) {
                const label = inferLocationLabel(details);
                setCurrentLocationName(label);
                setCurrentCoords(coords);
                return;
              }
            }
            setCurrentLocationName('Chưa xác định vị trí');
            setCurrentCoords(null);
          })
          .catch(() => {
            setCurrentLocationName('Chưa xác định vị trí');
            setCurrentCoords(null);
          });
      })
      .catch(() => {
        setCurrentLocationName('Chưa xác định vị trí');
        setCurrentCoords(null);
      });
  }, []);

  // Xử lý nút Chụp ảnh ngay (WOW 2) - hỗ trợ cả app và web
  const handleTakeIssuePhoto = async () => {
    try {
      if (Platform.OS === 'web') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          quality: 0.8,
        });
        if (!result.canceled && result.assets[0]?.uri) {
          router.push({
            pathname: '/(customer)/booking',
            params: { attached_photo: result.assets[0].uri, auto_analyze: '1' },
          });
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
              : 'Cần quyền camera để chụp ảnh sự cố',
        });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        router.push({
          pathname: '/(customer)/booking',
          params: { attached_photo: result.assets[0].uri, auto_analyze: '1' },
        });
      }
    } catch {
      // Fallback mở thư viện ảnh nếu mở camera thất bại
      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          quality: 0.8,
        });
        if (!result.canceled && result.assets[0]?.uri) {
          router.push({
            pathname: '/(customer)/booking',
            params: { attached_photo: result.assets[0].uri, auto_analyze: '1' },
          });
        }
      } catch {
        Toast.show({
          type: 'error',
          text1:
            lang === 'en'
              ? 'Unable to open camera or photo library'
              : 'Không thể mở máy ảnh hoặc thư viện ảnh',
        });
      }
    }
  };

  // Xử lý nút Chọn ảnh sự cố từ thư viện (WOW 2)
  const handlePickIssuePhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Toast.show({
            type: 'error',
            text1: lang === 'en' ? 'Photo library permission required' : 'Cần quyền thư viện ảnh',
          });
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        router.push({
          pathname: '/(customer)/booking',
          params: { attached_photo: result.assets[0].uri, auto_analyze: '1' },
        });
      }
    } catch {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en' ? 'Unable to select photo from library' : 'Không thể chọn ảnh từ thư viện',
      });
    }
  };

  // Sao chép mã voucher
  const handleCopyVoucher = (code: string) => {
    setCopiedVoucher(code);
    const nav = (globalThis as any).navigator;
    if (nav?.clipboard?.writeText) {
      nav.clipboard.writeText(code).catch(() => {});
    }
    Toast.show({
      type: 'success',
      text1: `Đã sao chép mã ${code}!`,
      text2: 'Mã sẽ tự động điền khi bạn tạo đơn dịch vụ.',
    });
    setTimeout(() => setCopiedVoucher(null), 3000);
  };

  // Chọn ngày nhanh cho khối Quick Booking
  const handleSelectQuickDateChip = (chip: 'today' | 'tomorrow' | 'sat' | 'sun') => {
    setQuickDateChip(chip);
    const now = dayjs();
    if (chip === 'today') {
      const todayStr = now.format('YYYY-MM-DD');
      setQuickDate(todayStr);
      const [th, tm] = quickTimeSlot.split(':').map(Number);
      const nowVn = getNowVietnam();
      if (th * 60 + tm <= nowVn.totalMinutes) {
        setQuickTimeSlot(getDefaultFutureTimeSlot(todayStr));
      }
    } else if (chip === 'tomorrow') {
      setQuickDate(now.add(1, 'day').format('YYYY-MM-DD'));
    } else if (chip === 'sat') {
      const nextSat = now.day() <= 6 ? now.day(6) : now.add(1, 'week').day(6);
      setQuickDate(nextSat.format('YYYY-MM-DD'));
    } else if (chip === 'sun') {
      const nextSun = now.day() === 0 ? now : now.day(7);
      setQuickDate(nextSun.format('YYYY-MM-DD'));
    }
  };

  // Chọn loại công việc chip trong Quick Booking
  const handleSelectQuickServiceChip = (chip: 'don_nha' | 'boc_hang' | 'may_lanh' | 'khac') => {
    setQuickServiceChip(chip);
    setQuickDescription('');
    if (chip === 'don_nha') {
      setQuickDealPrice('150000');
    } else if (chip === 'boc_hang') {
      setQuickDealPrice('200000');
    } else if (chip === 'may_lanh') {
      setQuickDealPrice('250000');
    } else {
      setQuickDealPrice('100000');
    }
  };

  // Submit từ khối Quick Booking - map chip sang dịch vụ catalog thật (Item 2)
  const handleQuickSubmit = () => {
    if (!quickDescription.trim()) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Please enter a description for the job'
            : 'Vui lòng nhập mô tả công việc bạn cần',
      });
      return;
    }
    const priceNum = Number(quickDealPrice.replace(/[^0-9]/g, ''));
    if (!priceNum || priceNum < 50000) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Minimum opening deal price is 50,000₫'
            : 'Giá mở đầu deal tối thiểu là 50.000₫',
      });
      return;
    }

    const now = dayjs();
    const isToday = quickDate === now.format('YYYY-MM-DD');
    if (isToday) {
      const [h, m] = quickTimeSlot.split(':').map(Number);
      const slotTime = now.hour(h).minute(m).second(0);
      if (slotTime.isBefore(now)) {
        Toast.show({
          type: 'error',
          text1: lang === 'en' ? 'Invalid start time' : 'Giờ bắt đầu không hợp lệ',
          text2:
            lang === 'en'
              ? 'Cannot select a past time for today. Please select a future time.'
              : 'Không thể chọn giờ trong quá khứ của ngày hôm nay. Vui lòng chọn giờ sau thời điểm hiện tại.',
        });
        return;
      }
    }

    let matchedSvc: any = undefined;
    if (quickServiceChip === 'don_nha') {
      matchedSvc = services?.find((s: any) =>
        ['house_cleaning', 'housekeeping_hourly', 'deep_cleaning'].includes(s.slug),
      );
    } else if (quickServiceChip === 'boc_hang') {
      matchedSvc = services?.find((s: any) => ['moving_help', 'handyman'].includes(s.slug));
    } else if (quickServiceChip === 'may_lanh') {
      matchedSvc = services?.find((s: any) =>
        ['ac_repair', 'electrician', 'handyman', 'deep_cleaning'].includes(s.slug),
      );
    }

    const bookingParams: Record<string, string> = {
      target_price: String(priceNum),
      preferred_date: quickDate,
      preferred_time_start: quickTimeSlot,
      duration_hours: String(quickDuration),
      prefill_description: quickDescription,
      prefill_title: quickDescription.slice(0, 48),
    };

    if (matchedSvc) {
      bookingParams.service_id = matchedSvc._id;
      bookingParams.service_slug = matchedSvc.slug;
    } else {
      bookingParams.custom_service_name =
        quickServiceChip === 'boc_hang'
          ? 'Bốc hàng, vận chuyển'
          : quickServiceChip === 'don_nha'
            ? 'Dọn dẹp nhà cửa'
            : quickServiceChip === 'may_lanh'
              ? 'Vệ sinh máy lạnh'
              : 'Dịch vụ theo yêu cầu';
    }

    router.push({
      pathname: '/(customer)/booking',
      params: bookingParams,
    });
  };

  const activeJobs =
    recentJobs?.filter(
      (j: { status: string }) =>
        !['completed', 'cancelled', 'refunded', 'disputed'].includes(j.status),
    ) ?? [];

  const completedJobs =
    recentJobs?.filter((j: { status: string }) => j.status === 'completed') ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <LocationPicker
        visible={locationPickerOpen}
        title={t('home_pick_location')}
        initial={currentCoords}
        onClose={() => setLocationPickerOpen(false)}
        onConfirm={(coords, geo) => {
          setLocationPickerOpen(false);
          setCurrentCoords(coords);
          const label = geo ? inferLocationLabel(geo) : 'Vị trí đã chọn';
          setCurrentLocationName(label);
          AsyncStorage.setItem(
            '@homemate_customer_pinned_location',
            JSON.stringify({ coords, locationName: label, is_manual_pick: true }),
          ).catch(() => {});
        }}
      />

      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isPullRefreshing}
            onRefresh={handlePullRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        contentContainerStyle={{ paddingBottom: 130 }}
      >
        {/* ── 1. HEADER (Top Bar chuẩn Homepage Redesign Demo - Item 6 Nền Gradient) ─ */}
        <View
          style={{
            position: 'relative',
            paddingHorizontal: 18,
            paddingTop: Math.max(insets.top + 8, 20),
            paddingBottom: 20,
            borderBottomWidth: 1,
            borderBottomColor: '#BBF7D0',
            borderTopWidth: 3,
            borderTopColor: '#22C55E',
            shadowColor: '#16A34A',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 10,
            elevation: 3,
            backgroundColor: '#F0FDF4',
            overflow: 'hidden',
          }}
        >
          {/* Header Gradient Background for App & Web */}
          <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgLinearGradient id="headerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor="#DCFCE7" />
                <Stop offset="65%" stopColor="#F0FDF4" />
                <Stop offset="100%" stopColor="#FFFFFF" />
              </SvgLinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#headerGrad)" />
          </Svg>
          {/* Top row: Location pill on left, Notification & User Avatar on right */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            {/* Location pill */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setLocationPickerOpen(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: currentCoords ? '#F1F5F9' : '#FEF3C7',
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: 20,
                gap: 6,
                maxWidth: '65%',
                borderWidth: currentCoords ? 0 : 1,
                borderColor: '#FDE68A',
              }}
            >
              <MapPin size={15} color={currentCoords ? COLORS.primary : '#D97706'} />
              <Text
                style={{
                  fontSize: fs(13),
                  fontWeight: '700',
                  color: currentCoords ? COLORS.gray[800] : '#B45309',
                }}
                numberOfLines={1}
              >
                {currentCoords
                  ? currentLocationName === 'Chưa xác định vị trí'
                    ? t('home_location_unidentified')
                    : currentLocationName
                  : t('home_no_location_tap')}
              </Text>
            </TouchableOpacity>

            {/* Notification bell + Avatar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                onPress={() => router.push('/notifications')}
                activeOpacity={0.7}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: '#F1F5F9',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                <Bell size={18} color={COLORS.gray[700]} />
                {!!unread && unread > 0 && (
                  <View
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: COLORS.error,
                      borderWidth: 1.5,
                      borderColor: '#fff',
                    }}
                  />
                )}
              </TouchableOpacity>

              {/* Avatar circle */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push('/(customer)/profile')}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: '#DCFCE7',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: '#86EFAC',
                }}
              >
                <Text style={{ fontSize: fs(16), fontWeight: '800', color: '#16A34A' }}>
                  {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'V'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Greeting Text: Chào Vinh, khuya rồi */}
          <Text
            style={{
              fontSize: fs(24),
              fontWeight: '900',
              color: COLORS.gray[900],
              letterSpacing: -0.3,
            }}
          >
            {greeting.title}
          </Text>
          <Text
            style={{
              fontSize: fs(14),
              color: COLORS.gray[500],
              marginTop: 4,
              fontWeight: '500',
            }}
          >
            {greeting.subtitle}
          </Text>

          {/* Interactive Search Bar (Item 8 & Item 5 placeholder fix) */}
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 14,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              marginTop: 16,
              gap: 10,
              minHeight: 48,
              borderWidth: 1.5,
              borderColor: serviceSearchQuery.trim() ? COLORS.primary : '#E2E8F0',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.04,
              shadowRadius: 4,
              elevation: 2,
            }}
          >
            <Search
              size={18}
              color={serviceSearchQuery.trim() ? COLORS.primary : COLORS.gray[400]}
            />
            <TextInput
              style={{
                flex: 1,
                paddingVertical: Platform.OS === 'ios' ? 12 : 10,
                fontSize: fs(13),
                color: COLORS.gray[900],
                fontWeight: '500',
              }}
              numberOfLines={1}
              multiline={false}
              placeholder={t('home_search_placeholder')}
              placeholderTextColor={COLORS.gray[400]}
              value={serviceSearchQuery}
              onChangeText={handleSearchChange}
            />
            {serviceSearchQuery.trim().length > 0 && (
              <TouchableOpacity
                onPress={() => setServiceSearchQuery('')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={{ fontSize: fs(13), fontWeight: '700', color: COLORS.gray[500] }}>
                  ✕
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {sError || jError ? (
          <View
            style={{
              padding: 24,
              margin: 16,
              backgroundColor: '#fff',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#E2E8F0',
            }}
          >
            <ErrorState
              title={lang === 'en' ? 'Unable to load home data' : 'Không thể tải dữ liệu trang chủ'}
              subtitle={
                lang === 'en'
                  ? 'Connection to server failed. Please check your network and retry.'
                  : 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.'
              }
              onRetry={() => {
                refetchServices();
                refetchJobs();
                refetchProfile();
              }}
            />
          </View>
        ) : (
          <>
            {/* ── 2. WOW 1: THỢ ĐANG Ở GẦN BẠN (Live Map + Real Nearby Helpers) ─ */}
            <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
              {/* Section Header with "Trực tiếp" green pulse badge */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: fs(18), fontWeight: '800', color: COLORS.gray[900] }}>
                  {t('home_nearby_helpers_title')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: '#22C55E',
                    }}
                  />
                  <Text style={{ fontSize: fs(12), fontWeight: '800', color: '#16A34A' }}>
                    {t('home_live_badge')}
                  </Text>
                </View>
              </View>

              {/* Interactive Mini Map */}
              <View
                style={{
                  height: 190,
                  borderRadius: 18,
                  overflow: 'hidden',
                  backgroundColor: '#F8FAFC',
                  borderWidth: 1,
                  borderColor: '#CBD5E1',
                  position: 'relative',
                }}
              >
                {currentCoords && mapCenter ? (
                  Platform.OS === 'web' ? (
                    <iframe
                      ref={mapIframeRef}
                      srcDoc={leafletMiniMapHtml}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      title="Goong Mini Map"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  ) : (
                    <WebView
                      ref={mapWebViewRef}
                      originWhitelist={['*']}
                      source={{ html: leafletMiniMapHtml }}
                      scrollEnabled={false}
                      style={{ flex: 1, backgroundColor: '#f8fafc' }}
                      onMessage={event => {
                        try {
                          const data = JSON.parse(event.nativeEvent.data);
                          if (data?.type === 'SELECT_HELPER' && data.id) {
                            setSelectedHelperId(data.id);
                          }
                        } catch {}
                      }}
                    />
                  )
                ) : (
                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 20,
                      backgroundColor: '#F8FAFC',
                      gap: 8,
                    }}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: '#FEF3C7',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <MapPin size={22} color="#D97706" />
                    </View>
                    <Text
                      style={{
                        fontSize: fs(14),
                        fontWeight: '800',
                        color: COLORS.gray[800],
                        textAlign: 'center',
                      }}
                    >
                      {t('home_location_unidentified')}
                    </Text>
                    <Text
                      style={{
                        fontSize: fs(12),
                        color: COLORS.gray[500],
                        textAlign: 'center',
                        lineHeight: Math.round(fs(16)),
                      }}
                    >
                      {t('home_location_unidentified_sub')}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                      <TouchableOpacity
                        onPress={handleRequestLiveLocation}
                        disabled={isLocatingLive}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          backgroundColor: COLORS.primary,
                          paddingVertical: 7,
                          paddingHorizontal: 14,
                          borderRadius: 10,
                        }}
                      >
                        {isLocatingLive ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Navigation size={14} color="#fff" />
                        )}
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: fs(12) }}>
                          {isLocatingLive ? t('home_locating') : t('home_get_location_btn')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setLocationPickerOpen(true)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          backgroundColor: '#fff',
                          borderWidth: 1,
                          borderColor: COLORS.gray[300],
                          paddingVertical: 7,
                          paddingHorizontal: 14,
                          borderRadius: 10,
                        }}
                      >
                        <MapPin size={14} color={COLORS.gray[700]} />
                        <Text
                          style={{ color: COLORS.gray[800], fontWeight: '700', fontSize: fs(12) }}
                        >
                          {t('home_select_manual')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>

              {/* Worker list cards or Clean Empty State */}
              {nearbyHelpers.length === 0 ? (
                <View
                  style={{
                    marginTop: 12,
                    backgroundColor: '#FFFFFF',
                    borderRadius: 16,
                    paddingVertical: 20,
                    paddingHorizontal: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: '#F1F5F9',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <Users size={22} color={COLORS.gray[400]} />
                  </View>
                  <Text
                    style={{
                      fontSize: fs(14),
                      fontWeight: '700',
                      color: COLORS.gray[800],
                      textAlign: 'center',
                    }}
                  >
                    {!currentCoords ? t('home_no_location_helpers') : t('home_no_helpers_online')}
                  </Text>
                  <Text
                    style={{
                      fontSize: fs(12),
                      color: COLORS.gray[500],
                      marginTop: 4,
                      textAlign: 'center',
                    }}
                  >
                    {!currentCoords
                      ? t('home_no_location_helpers_sub')
                      : t('home_no_helpers_online_sub')}
                  </Text>
                </View>
              ) : (
                <View style={{ marginTop: 12, gap: 8 }}>
                  {nearbyHelpers.map(helper => {
                    const isSelected = helper.id === selectedHelperId;

                    return (
                      <TouchableOpacity
                        key={helper.id}
                        activeOpacity={0.8}
                        onPress={() => setSelectedHelperId(helper.id)}
                        style={{
                          backgroundColor: '#FFFFFF',
                          borderRadius: 14,
                          paddingVertical: 12,
                          paddingHorizontal: 14,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderWidth: 1.5,
                          borderColor: isSelected ? COLORS.primary : '#F1F5F9',
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.04,
                          shadowRadius: 3,
                          elevation: 1,
                        }}
                      >
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
                        >
                          <View
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 19,
                              backgroundColor: isSelected ? '#DCFCE7' : '#F1F5F9',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: fs(14),
                                fontWeight: '800',
                                color: isSelected ? COLORS.primary : COLORS.gray[600],
                              }}
                            >
                              {helper.name.charAt(0)}
                            </Text>
                          </View>

                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: fs(15),
                                fontWeight: '800',
                                color: COLORS.gray[900],
                              }}
                              numberOfLines={1}
                            >
                              {helper.name}
                            </Text>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                marginTop: 2,
                              }}
                            >
                              <Text style={{ fontSize: fs(12), color: COLORS.gray[500] }}>
                                {helper.status === 'Đang rảnh' || helper.status === 'Sẵn sàng'
                                  ? lang === 'en'
                                    ? 'Available'
                                    : helper.status
                                  : helper.status}{' '}
                                ·
                              </Text>
                              <Star size={12} color="#F59E0B" fill="#F59E0B" />
                              <Text style={{ fontSize: fs(12), color: COLORS.gray[500] }}>
                                {helper.rating.toFixed(1)} ({helper.completedJobs}{' '}
                                {lang === 'en'
                                  ? helper.completedJobs === 1
                                    ? 'job'
                                    : 'jobs'
                                  : 'việc'}
                                )
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View style={{ alignItems: 'flex-end', gap: 5 }}>
                          <Text
                            style={{ fontSize: fs(13), fontWeight: '800', color: COLORS.primary }}
                          >
                            {helper.distance}
                          </Text>
                          <ScalePressable
                            onPress={() =>
                              router.push({
                                pathname: '/(customer)/booking',
                                params: {
                                  favorite_helper_id: helper.id,
                                  favorite_helper_name: helper.name,
                                },
                              })
                            }
                            style={{
                              backgroundColor: isSelected ? '#15803D' : COLORS.primary,
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 8,
                            }}
                          >
                            <Text style={{ fontSize: fs(11), fontWeight: '800', color: '#fff' }}>
                              {t('home_book_helper_btn')}
                            </Text>
                          </ScalePressable>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* ── 3. WOW 2: THẺ AI QUÉT ẢNH SỰ CỐ (Điểm nhấn nổi bật nhất trang chủ) ─ */}
            <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
              <View
                style={{
                  backgroundColor: '#16A34A',
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingTop: 18,
                  paddingBottom: 20,
                  position: 'relative',
                  overflow: 'hidden',
                  shadowColor: '#16A34A',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.28,
                  shadowRadius: 10,
                  elevation: 4,
                }}
              >
                {/* Vibrant SVG Gradient Background */}
                <Svg
                  height="100%"
                  width="100%"
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                >
                  <Defs>
                    <SvgLinearGradient id="aiCardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <Stop offset="0%" stopColor="#15803D" />
                      <Stop offset="45%" stopColor="#16A34A" />
                      <Stop offset="100%" stopColor="#22C55E" />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" rx={20} fill="url(#aiCardGrad)" />
                </Svg>

                {/* Shimmer light sweep */}
                {!reduceMotion &&
                  (Platform.OS === 'web' ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        top: -60,
                        bottom: -60,
                        width: 70,
                        backgroundColor: 'rgba(255, 255, 255, 0.28)',
                        // @ts-ignore
                        animation: 'aiSweep 3.6s ease-in-out infinite',
                        transform: [{ rotate: '25deg' }],
                      }}
                    />
                  ) : (
                    <Animated.View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        top: -60,
                        bottom: -60,
                        width: 70,
                        backgroundColor: 'rgba(255, 255, 255, 0.28)',
                        transform: [{ translateX: shineAnim }, { rotate: '25deg' }],
                      }}
                    />
                  ))}

                {/* Badge */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    alignSelf: 'flex-start',
                    backgroundColor: 'rgba(255, 255, 255, 0.22)',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 20,
                  }}
                >
                  <Sparkles size={13} color="#FFFFFF" />
                  <Text
                    style={{
                      fontSize: fs(11),
                      fontWeight: '800',
                      color: '#FFFFFF',
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                    }}
                  >
                    {t('home_ai_scan_badge')}
                  </Text>
                </View>

                <Text
                  style={{
                    fontSize: fs(17),
                    fontWeight: '900',
                    color: '#FFFFFF',
                    marginTop: 10,
                    lineHeight: Math.round(fs(23)),
                    flexShrink: 1,
                  }}
                >
                  {t('home_ai_scan_title')}
                </Text>

                <Text
                  style={{
                    fontSize: fs(13),
                    color: '#DCFCE7',
                    marginTop: 6,
                    lineHeight: Math.round(fs(19)),
                    fontWeight: '500',
                    flexShrink: 1,
                  }}
                >
                  {t('home_ai_scan_desc')}
                </Text>

                {/* 3 Steps indicator */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginTop: 12,
                    marginBottom: 16,
                  }}
                >
                  <Text style={{ fontSize: fs(11), fontWeight: '700', color: '#FFFFFF' }}>
                    {t('home_ai_scan_step1')}
                  </Text>
                  <Text style={{ fontSize: fs(10), color: '#86EFAC' }}>•</Text>
                  <Text style={{ fontSize: fs(11), fontWeight: '700', color: '#FFFFFF' }}>
                    {t('home_ai_scan_step2')}
                  </Text>
                  <Text style={{ fontSize: fs(10), color: '#86EFAC' }}>•</Text>
                  <Text style={{ fontSize: fs(11), fontWeight: '700', color: '#FFFFFF' }}>
                    {t('home_ai_scan_step3')}
                  </Text>
                </View>

                {/* Button: Chụp ảnh ngay */}
                <ScalePressable
                  onPress={handleTakeIssuePhoto}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 14,
                    paddingVertical: 13,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.12,
                    shadowRadius: 4,
                    elevation: 2,
                  }}
                >
                  <Camera size={18} color="#16A34A" />
                  <Text style={{ fontSize: fs(14.5), fontWeight: '800', color: '#16A34A' }}>
                    {t('home_ai_scan_btn')}
                  </Text>
                </ScalePressable>

                {/* Sub-link: hoặc chọn ảnh sự cố của bạn */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handlePickIssuePhoto}
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 12,
                    paddingVertical: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: fs(13),
                      fontWeight: '700',
                      color: '#FFFFFF',
                      textDecorationLine: 'underline',
                      letterSpacing: 0.2,
                    }}
                  >
                    {t('home_ai_scan_pick')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── 4. VOUCHER CAROUSEL (Dữ liệu thật từ hệ thống + Tự chạy) ──── */}
            <View style={{ marginTop: 24 }}>
              <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
                <Text
                  style={{
                    fontSize: fs(18),
                    fontWeight: '800',
                    color: COLORS.gray[900],
                  }}
                >
                  {t('home_vouchers_title')}
                </Text>
              </View>

              {vouchers.length === 0 ? (
                <View
                  style={{
                    marginHorizontal: 16,
                    backgroundColor: '#FFFFFF',
                    borderRadius: 16,
                    padding: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                  }}
                >
                  <Tag size={24} color={COLORS.gray[400]} />
                  <Text
                    style={{
                      fontSize: fs(14),
                      fontWeight: '700',
                      color: COLORS.gray[700],
                      marginTop: 6,
                    }}
                  >
                    {t('voucher_empty_title')}
                  </Text>
                  <Text style={{ fontSize: fs(12), color: COLORS.gray[500], marginTop: 2 }}>
                    {t('voucher_empty_sub')}
                  </Text>
                </View>
              ) : (
                <View>
                  <ScrollView
                    ref={voucherScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
                    onScrollBeginDrag={() => {
                      isUserScrollingVouchers.current = true;
                    }}
                    onScrollEndDrag={() => {
                      setTimeout(() => {
                        isUserScrollingVouchers.current = false;
                      }, 3000);
                    }}
                    onMomentumScrollEnd={e => {
                      const offsetX = e.nativeEvent.contentOffset.x;
                      const idx = Math.round(offsetX / voucherCardWidth);
                      setActiveVoucherIdx(Math.max(0, Math.min(idx, vouchers.length - 1)));
                    }}
                    scrollEventThrottle={16}
                  >
                    {vouchers.map(v => {
                      const discountDisplay =
                        v.discount_type === 'percent'
                          ? lang === 'en'
                            ? `${v.discount_value}% OFF`
                            : `Giảm ${v.discount_value}%`
                          : lang === 'en'
                            ? `${Number(v.discount_value).toLocaleString('en-US')}₫ OFF`
                            : `Giảm ${Number(v.discount_value).toLocaleString('vi-VN')}₫`;
                      const isCopied = copiedVoucher === v.code;

                      return (
                        <View
                          key={v.code || v._id}
                          onLayout={e => {
                            const w = e.nativeEvent.layout.width;
                            if (w > 0 && Math.abs(w + 12 - voucherCardWidth) > 2) {
                              setVoucherCardWidth(w + 12);
                            }
                          }}
                          style={{
                            width: 260,
                            backgroundColor: '#FFFFFF',
                            borderRadius: 16,
                            padding: 16,
                            borderWidth: 1,
                            borderColor: '#E2E8F0',
                            justifyContent: 'space-between',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.05,
                            shadowRadius: 3,
                            elevation: 1,
                          }}
                        >
                          <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Sparkles size={12} color="#16A34A" />
                              <Text
                                style={{
                                  fontSize: fs(10),
                                  fontWeight: '800',
                                  color: '#16A34A',
                                  letterSpacing: 0.5,
                                  textTransform: 'uppercase',
                                }}
                              >
                                {t('voucher_special_badge')}
                              </Text>
                            </View>
                            <Text
                              style={{
                                fontSize: fs(22),
                                fontWeight: '900',
                                color: COLORS.gray[900],
                                marginTop: 6,
                              }}
                            >
                              {discountDisplay}
                            </Text>
                            <Text
                              style={{
                                fontSize: fs(12),
                                color: COLORS.gray[600],
                                marginTop: 4,
                                lineHeight: Math.round(fs(16)),
                              }}
                              numberOfLines={2}
                            >
                              {formatVoucherDesc(v)}
                            </Text>
                          </View>

                          {/* Code & Copy button */}
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginTop: 14,
                              paddingTop: 10,
                              borderTopWidth: 1,
                              borderTopColor: '#F1F5F9',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: fs(14),
                                fontWeight: '800',
                                color: COLORS.gray[900],
                              }}
                            >
                              {v.code}
                            </Text>
                            <ScalePressable
                              onPress={() => handleCopyVoucher(v.code)}
                              style={{
                                backgroundColor: isCopied ? '#DCFCE7' : '#F1F5F9',
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 8,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: fs(12),
                                  fontWeight: '700',
                                  color: isCopied ? COLORS.primary : COLORS.gray[700],
                                }}
                              >
                                {isCopied ? t('voucher_copied') : t('voucher_copy')}
                              </Text>
                            </ScalePressable>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>

                  {/* Progress Dots */}
                  {vouchers.length > 1 && (
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'center',
                        gap: 6,
                        marginTop: 12,
                      }}
                    >
                      {vouchers.map((_, i) => (
                        <View
                          key={i}
                          style={{
                            width: i === activeVoucherIdx ? 18 : 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: i === activeVoucherIdx ? COLORS.primary : '#CBD5E1',
                          }}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* ── 5. DỊCH VỤ (3 Cột x 4 Hàng = 12 Items Chuẩn Demo) ──────────── */}
            <View
              onLayout={e => {
                servicesSectionYRef.current = e.nativeEvent.layout.y;
              }}
              style={{ paddingHorizontal: 16, marginTop: 24 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 14,
                }}
              >
                <Text style={{ fontSize: fs(18), fontWeight: '800', color: COLORS.gray[900] }}>
                  {t('home_all_services_title')}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => router.push('/(customer)/booking')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Text style={{ fontSize: fs(13), fontWeight: '700', color: COLORS.primary }}>
                    {t('home_choose_service')} →
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Responsive Multi-Column Grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(() => {
                  const q = removeVietnameseDiacritics(serviceSearchQuery);
                  const list = q
                    ? SERVICES_CATALOG.filter(s => {
                        const normName = removeVietnameseDiacritics(s.name);
                        const normTranslated = removeVietnameseDiacritics(t(s.nameKey));
                        const normSlug = removeVietnameseDiacritics(s.slug.replace(/_/g, ' '));
                        const normSub = removeVietnameseDiacritics(s.subtitle || '');
                        return (
                          normName.includes(q) ||
                          normTranslated.includes(q) ||
                          normSlug.includes(q) ||
                          normSub.includes(q)
                        );
                      })
                    : SERVICES_CATALOG;

                  const containerW = Math.min(windowWidth, 640) - 36; // 18px padding each side
                  const numCols = windowWidth >= 768 ? 4 : 3;
                  const cardGap = 8;
                  const cardW = Math.floor((containerW - (numCols - 1) * cardGap) / numCols);

                  if (list.length === 0) {
                    return (
                      <View style={{ width: '100%', padding: 24, alignItems: 'center' }}>
                        <Text
                          style={{
                            fontSize: fs(14),
                            fontWeight: '700',
                            color: COLORS.gray[700],
                            textAlign: 'center',
                          }}
                        >
                          {t('home_search_empty_title')}
                        </Text>
                        <Text
                          style={{
                            fontSize: fs(12),
                            color: COLORS.gray[500],
                            marginTop: 4,
                            textAlign: 'center',
                          }}
                        >
                          {t('home_search_empty_sub')}
                        </Text>
                      </View>
                    );
                  }

                  return list.map(svc => {
                    const isCustom = svc.isCustom;
                    const matched =
                      services?.find(s => s.slug === svc.slug) ||
                      services?.find(s => s.slug.includes(svc.slug.split('_')[0])) ||
                      services?.find(s =>
                        s.name.toLowerCase().includes(svc.name.toLowerCase().split(' ')[0]),
                      );
                    const fromPrefix = t('price_from_prefix');
                    const displayPrice = matched?.base_price_min
                      ? `${fromPrefix}${matched.base_price_min.toLocaleString('vi-VN')}₫`
                      : svc.isCustom || svc.priceType === 'custom_deal'
                        ? t('price_negotiate')
                        : svc.priceType === 'quote_job'
                          ? t('price_per_task')
                          : svc.priceType === 'quote_trip'
                            ? t('price_per_trip')
                            : svc.baseAmount
                              ? `${fromPrefix}${svc.baseAmount.toLocaleString('vi-VN')}₫${svc.unitKey ? t(svc.unitKey) : ''}`
                              : '';

                    return (
                      <ScalePressable
                        key={svc.id}
                        onPress={() => {
                          if (isCustom) {
                            router.push({
                              pathname: '/(customer)/booking',
                              params: { custom_service_name: t(svc.nameKey) },
                            });
                          } else if (matched) {
                            router.push({
                              pathname: '/(customer)/booking',
                              params: { service_id: matched._id, service_slug: matched.slug },
                            });
                          } else {
                            router.push({
                              pathname: '/(customer)/booking',
                              params: { custom_service_name: t(svc.nameKey) },
                            });
                            Toast.show({
                              type: 'info',
                              text1: `${t('common_service')} "${t(svc.nameKey)}"`,
                              text2: t('home_quick_booking_sub'),
                            });
                          }
                        }}
                        style={{
                          width: cardW,
                          backgroundColor: isCustom ? '#F0FDF4' : '#FFFFFF',
                          borderRadius: 14,
                          paddingVertical: Math.max(10, Math.round(10 * textScale)),
                          paddingHorizontal: 6,
                          alignItems: 'center',
                          borderWidth: 1.5,
                          borderColor: isCustom ? COLORS.primary : '#F1F5F9',
                          position: 'relative',
                          minHeight: Math.max(110, Math.round(110 * textScale)),
                          justifyContent: 'space-between',
                        }}
                      >
                        {/* Badge MỚI cho item 12 */}
                        {svc.badgeKey && (
                          <View
                            style={{
                              position: 'absolute',
                              top: 4,
                              right: 4,
                              backgroundColor: '#DCFCE7',
                              paddingHorizontal: Math.round(5 * textScale),
                              paddingVertical: Math.round(2 * textScale),
                              borderRadius: 6,
                            }}
                          >
                            <Text
                              style={{ fontSize: fs(9), fontWeight: '900', color: COLORS.primary }}
                            >
                              {t(svc.badgeKey)}
                            </Text>
                          </View>
                        )}

                        <View
                          style={{
                            height: 28,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginVertical: 2,
                          }}
                        >
                          {React.createElement(svc.icon, {
                            size: 24,
                            color: isCustom ? COLORS.primary : COLORS.gray[800],
                          })}
                        </View>

                        <Text
                          style={{
                            fontSize: fs(11.5),
                            fontWeight: '800',
                            color: isCustom ? COLORS.primary : COLORS.gray[900],
                            textAlign: 'center',
                            lineHeight: Math.round(fs(15)),
                          }}
                          numberOfLines={2}
                        >
                          {t(svc.nameKey)}
                        </Text>

                        {displayPrice ? (
                          <Text
                            style={{
                              fontSize: fs(10),
                              fontWeight: '700',
                              color: isCustom ? '#15803D' : COLORS.gray[500],
                              textAlign: 'center',
                              marginTop: 4,
                            }}
                            numberOfLines={1}
                          >
                            {displayPrice}
                          </Text>
                        ) : null}
                      </ScalePressable>
                    );
                  });
                })()}
              </View>

              {/* 2 Callout Cards: SOS & AI Assistant */}
              <View style={{ marginTop: 14, gap: 10 }}>
                {/* SOS Callout - Nổi bật khẩn cấp */}
                <ScalePressable
                  onPress={() => router.push('/sos')}
                  style={{
                    backgroundColor: '#DC2626',
                    borderRadius: 16,
                    padding: 15,
                    shadowColor: '#DC2626',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    elevation: 3,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          backgroundColor: 'rgba(255,255,255,0.22)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <AlertTriangle size={15} color="#FFFFFF" />
                      </View>
                      <Text style={{ fontSize: fs(14.5), fontWeight: '900', color: '#FFFFFF' }}>
                        {t('home_sos_callout_title')}
                      </Text>
                    </View>
                    <View
                      style={{
                        backgroundColor: '#FFFFFF',
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 6,
                      }}
                    >
                      <Text style={{ fontSize: fs(10.5), fontWeight: '800', color: '#DC2626' }}>
                        {t('home_sos_callout_urgent')}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{
                      fontSize: fs(12),
                      color: '#FEE2E2',
                      marginTop: 6,
                      lineHeight: Math.round(fs(16)),
                      fontWeight: '500',
                    }}
                  >
                    {t('home_sos_callout_desc')}
                  </Text>
                </ScalePressable>

                {/* AI Callout */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => router.push('/(customer)/booking')}
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: 16,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                  }}
                >
                  <Text style={{ fontSize: fs(14), fontWeight: '800', color: COLORS.gray[900] }}>
                    {t('home_ai_callout_title')}
                  </Text>
                  <Text
                    style={{
                      fontSize: fs(12),
                      color: COLORS.gray[600],
                      marginTop: 2,
                      lineHeight: Math.round(fs(16)),
                    }}
                  >
                    {t('home_ai_callout_desc')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── 6. ĐĂNG VIỆC THEO Ý BẠN (Quick Booking Block Form) ───────────── */}
            <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
              <Text
                style={{
                  fontSize: fs(18),
                  fontWeight: '800',
                  color: COLORS.gray[900],
                  marginBottom: 12,
                }}
              >
                {t('home_quick_booking_title')}
              </Text>

              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 20,
                  padding: 18,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  gap: 16,
                }}
              >
                {/* 1. Bạn cần làm việc gì? */}
                <View>
                  <Text
                    style={{
                      fontSize: fs(14),
                      fontWeight: '700',
                      color: COLORS.gray[800],
                      marginBottom: 8,
                    }}
                  >
                    {t('home_quick_need_work')}
                  </Text>
                  {/* Chips */}
                  <View
                    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}
                  >
                    {[
                      { key: 'don_nha', label: t('home_quick_chip_cleaning') },
                      { key: 'boc_hang', label: t('home_quick_chip_moving') },
                      { key: 'may_lanh', label: t('home_quick_chip_ac') },
                      { key: 'khac', label: t('home_quick_chip_other') },
                    ].map(c => {
                      const isSel = quickServiceChip === c.key;
                      return (
                        <TouchableOpacity
                          key={c.key}
                          onPress={() => handleSelectQuickServiceChip(c.key as any)}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 7,
                            borderRadius: 20,
                            backgroundColor: isSel ? '#DCFCE7' : '#F1F5F9',
                            borderWidth: 1,
                            borderColor: isSel ? COLORS.primary : '#E2E8F0',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: fs(12.5),
                              fontWeight: '700',
                              color: isSel ? COLORS.primary : COLORS.gray[700],
                            }}
                          >
                            {c.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Text input description */}
                  <TextInput
                    value={quickDescription}
                    onChangeText={setQuickDescription}
                    placeholder={t('home_quick_desc_placeholder')}
                    placeholderTextColor={COLORS.gray[400]}
                    multiline
                    numberOfLines={3}
                    style={{
                      backgroundColor: '#F8FAFC',
                      borderRadius: 12,
                      padding: 12,
                      fontSize: fs(14),
                      color: COLORS.gray[900],
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                      minHeight: 70,
                      textAlignVertical: 'top',
                    }}
                  />
                </View>

                {/* 2. Giá bạn muốn trả */}
                <View>
                  <Text
                    style={{
                      fontSize: fs(14),
                      fontWeight: '700',
                      color: COLORS.gray[800],
                      marginBottom: 8,
                    }}
                  >
                    {t('home_quick_price_title')}
                  </Text>
                  <TextInput
                    value={quickDealPrice}
                    onChangeText={setQuickDealPrice}
                    keyboardType="numeric"
                    style={{
                      backgroundColor: '#F8FAFC',
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: fs(16),
                      fontWeight: '800',
                      color: COLORS.gray[900],
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                    }}
                  />
                </View>

                {/* 3. Thời gian làm việc: Ngày & Giờ (Trigger mở Bottom Sheet Item 1) */}
                <View style={{ gap: 10 }}>
                  <Text
                    style={{
                      fontSize: fs(14),
                      fontWeight: '700',
                      color: COLORS.gray[800],
                    }}
                  >
                    {t('home_quick_time_title')}
                  </Text>

                  {/* Ngày làm việc trigger card - Chuẩn Demo .big-field */}
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
                        style={{ fontSize: fs(15), fontWeight: '700', color: COLORS.gray[900] }}
                        numberOfLines={1}
                      >
                        {(() => {
                          const dt = dayjs(quickDate).locale(lang === 'en' ? 'en' : 'vi');
                          const dow = dt.format('dddd');
                          const capitalizedDow = dow.charAt(0).toUpperCase() + dow.slice(1);
                          return `${capitalizedDow}, ${dt.format('DD/MM')}`;
                        })()}
                      </Text>
                      <Text
                        style={{
                          fontSize: fs(11),
                          color: '#64748B',
                          fontWeight: '500',
                          marginTop: 1,
                        }}
                      >
                        {t('home_quick_calendar_hint')}
                      </Text>
                    </View>
                    <ChevronRight size={18} color="#16A34A" />
                  </TouchableOpacity>

                  {/* Quick day shortcut chips */}
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {[
                      { key: 'today', label: t('home_quick_chip_today') },
                      { key: 'tomorrow', label: t('home_quick_chip_tomorrow') },
                      { key: 'sat', label: t('home_quick_chip_sat') },
                      { key: 'sun', label: t('home_quick_chip_sun') },
                    ].map(c => {
                      const isSel = quickDateChip === c.key;
                      return (
                        <TouchableOpacity
                          key={c.key}
                          onPress={() => handleSelectQuickDateChip(c.key as any)}
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
                            {c.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Giờ bắt đầu — Dropdown Type 12 */}
                  <TimeDropdownPicker
                    value={quickTimeSlot}
                    onChange={setQuickTimeSlot}
                    selectedDate={quickDate}
                    label={t('picker_start_time')}
                    showChips={true}
                  />

                  {/* Thời lượng dự kiến — Dropdown Type 12 */}
                  <DurationDropdownPicker
                    valueMinutes={Math.round(quickDuration * 60)}
                    onChangeMinutes={mins => {
                      setQuickDuration(mins / 60);
                      setIsCustomDuration(![60, 120, 180, 240].includes(mins));
                    }}
                  />

                  {/* Lịch dự kiến — Tóm tắt chuẩn Demo */}
                  <ScheduledTimePreview
                    startDate={quickDate}
                    startTime={quickTimeSlot}
                    durationMinutes={Math.round(quickDuration * 60)}
                    price={Number(quickDealPrice) || 200000}
                  />
                </View>

                {/* Button: Đăng việc */}
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={handleQuickSubmit}
                  disabled={isSubmittingQuick}
                  style={{
                    backgroundColor: COLORS.primary,
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: 'center',
                    shadowColor: COLORS.primary,
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.25,
                    shadowRadius: 6,
                    elevation: 3,
                  }}
                >
                  <Text style={{ fontSize: fs(15), fontWeight: '800', color: '#FFFFFF' }}>
                    {t('home_quick_post_btn')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── 7. QUYỀN LỢI & CAM KẾT (3 Thẻ Chuẩn Demo) ──────────────────── */}
            <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
              <Text
                style={{
                  fontSize: fs(18),
                  fontWeight: '800',
                  color: COLORS.gray[900],
                  marginBottom: 12,
                }}
              >
                {t('home_benefits_title')}
              </Text>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                {/* Card 1: Thợ đã xác thực */}
                <View
                  style={{
                    flex: 1,
                    backgroundColor: '#FFFFFF',
                    borderRadius: 16,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ShieldCheck size={22} color={COLORS.primary} />
                  <Text
                    style={{
                      fontSize: fs(12),
                      fontWeight: '800',
                      color: COLORS.gray[900],
                      marginTop: 6,
                      textAlign: 'center',
                    }}
                  >
                    {t('home_benefit_verified')}
                  </Text>
                  <Text
                    style={{
                      fontSize: fs(10),
                      color: COLORS.gray[500],
                      marginTop: 2,
                      textAlign: 'center',
                    }}
                  >
                    {t('home_benefit_verified_sub')}
                  </Text>
                </View>

                {/* Card 2: Bảo hiểm công việc */}
                <View
                  style={{
                    flex: 1,
                    backgroundColor: '#FFFFFF',
                    borderRadius: 16,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CheckCircle2 size={22} color={COLORS.primary} />
                  <Text
                    style={{
                      fontSize: fs(12),
                      fontWeight: '800',
                      color: COLORS.gray[900],
                      marginTop: 6,
                      textAlign: 'center',
                    }}
                  >
                    {t('home_benefit_insurance')}
                  </Text>
                  <Text
                    style={{
                      fontSize: fs(10),
                      color: COLORS.gray[500],
                      marginTop: 2,
                      textAlign: 'center',
                    }}
                  >
                    {t('home_benefit_insurance_sub')}
                  </Text>
                </View>

                {/* Card 3: Giữ tiền bảo đảm */}
                <View
                  style={{
                    flex: 1,
                    backgroundColor: '#FFFFFF',
                    borderRadius: 16,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Lock size={22} color={COLORS.primary} />
                  <Text
                    style={{
                      fontSize: fs(12),
                      fontWeight: '800',
                      color: COLORS.gray[900],
                      marginTop: 6,
                      textAlign: 'center',
                    }}
                  >
                    {t('home_benefit_escrow')}
                  </Text>
                  <Text
                    style={{
                      fontSize: fs(10),
                      color: COLORS.gray[500],
                      marginTop: 2,
                      textAlign: 'center',
                    }}
                  >
                    {t('home_benefit_escrow_sub')}
                  </Text>
                </View>
              </View>
            </View>

            {/* ── 8. VIỆC ĐANG THỰC HIỆN & ĐẶT GẦN ĐÂY ───────────────────────── */}
            {/* Section: Việc đang thực hiện */}
            <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
              <Text
                style={{
                  fontSize: fs(18),
                  fontWeight: '800',
                  color: COLORS.gray[900],
                  marginBottom: 12,
                }}
              >
                {t('home_active_jobs')}
              </Text>

              {activeJobs.length > 0 ? (
                activeJobs.slice(0, 1).map((j: any) => {
                  // 4 nấc tiến trình: Đã nhận việc -> Đang đến -> Đang làm -> Nghiệm thu (Item 11)
                  const step1Done = [
                    'confirmed',
                    'helper_on_the_way',
                    'on_the_way',
                    'helper_arrived',
                    'in_progress',
                    'pending_review',
                    'completed',
                  ].includes(j.status);
                  const step2Done = [
                    'helper_on_the_way',
                    'on_the_way',
                    'helper_arrived',
                    'in_progress',
                    'pending_review',
                    'completed',
                  ].includes(j.status);
                  const step3Done = [
                    'helper_arrived',
                    'in_progress',
                    'pending_review',
                    'completed',
                  ].includes(j.status);
                  const step4Done = ['pending_review', 'completed'].includes(j.status);

                  const timelineSteps = [
                    { label: t('home_timeline_confirmed'), active: step1Done },
                    { label: t('home_timeline_arriving'), active: step2Done },
                    { label: t('home_timeline_working'), active: step3Done },
                    { label: t('home_timeline_review'), active: step4Done },
                  ];

                  let statusBadgeText = t('status_open');
                  let statusBadgeBg = '#FEF3C7';
                  let statusBadgeColor = '#D97706';
                  let statusDesc = t('home_status_finding_desc');

                  if (j.status === 'open' || j.status === 'pending') {
                    statusBadgeText = t('status_open');
                    statusBadgeBg = '#FEF3C7';
                    statusBadgeColor = '#D97706';
                    statusDesc = t('home_status_finding_desc');
                  } else if (j.status === 'receiving_quotes' || j.status === 'bidding') {
                    statusBadgeText = t('status_receiving_quotes');
                    statusBadgeBg = '#E0E7FF';
                    statusBadgeColor = '#4338CA';
                    statusDesc = t('home_status_quotes_desc');
                  } else if (j.status === 'confirmed' || j.status === 'quote_selected') {
                    statusBadgeText = t('status_confirmed');
                    statusBadgeBg = '#DCFCE7';
                    statusBadgeColor = '#15803D';
                    statusDesc = t('home_status_helper_accepted_desc');
                  } else if (j.status === 'helper_on_the_way' || j.status === 'on_the_way') {
                    statusBadgeText = t('status_helper_on_the_way');
                    statusBadgeBg = '#FFEDD5';
                    statusBadgeColor = '#C2410C';
                    statusDesc = t('home_status_helper_coming_desc');
                  } else if (j.status === 'helper_arrived') {
                    statusBadgeText = t('status_helper_arrived');
                    statusBadgeBg = '#E0F2FE';
                    statusBadgeColor = '#0284C7';
                    statusDesc = t('home_status_arrived_desc');
                  } else if (j.status === 'in_progress') {
                    statusBadgeText = t('status_in_progress');
                    statusBadgeBg = '#DBEAFE';
                    statusBadgeColor = '#1D4ED8';
                    statusDesc = t('home_status_in_progress_desc');
                  } else if (j.status === 'pending_review') {
                    statusBadgeText = t('status_pending_review');
                    statusBadgeBg = '#FEF3C7';
                    statusBadgeColor = '#B45309';
                    statusDesc = t('home_status_pending_review_desc');
                  } else if (j.status === 'completed') {
                    statusBadgeText = t('status_completed');
                    statusBadgeBg = '#DCFCE7';
                    statusBadgeColor = '#15803D';
                    statusDesc = t('home_status_done_desc');
                  } else {
                    statusBadgeText = t('home_status_processing');
                    statusBadgeBg = '#F1F5F9';
                    statusBadgeColor = '#475569';
                    statusDesc = t('home_status_processing_desc');
                  }

                  const displayDate = dayjs(j.scheduled_at || j.created_at).format('DD/MM');
                  const displayTime = j.preferred_time_start || dayjs(j.created_at).format('HH:mm');
                  const displayDistrict =
                    j.address?.district || j.address?.city || currentLocationName.split(',')[0];

                  return (
                    <TouchableOpacity
                      key={j._id}
                      activeOpacity={0.88}
                      onPress={() =>
                        router.push({ pathname: '/job-detail/[id]', params: { id: j._id } })
                      }
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 18,
                        padding: 16,
                        borderWidth: 1.5,
                        borderColor: '#E2E8F0',
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: fs(16),
                            fontWeight: '800',
                            color: COLORS.gray[900],
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
                          {j.title}
                        </Text>
                        <View
                          style={{
                            backgroundColor: statusBadgeBg,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 8,
                          }}
                        >
                          <Text
                            style={{ fontSize: fs(11), fontWeight: '800', color: statusBadgeColor }}
                          >
                            {statusBadgeText}
                          </Text>
                        </View>
                      </View>

                      <Text style={{ fontSize: fs(12), color: COLORS.gray[500], marginTop: 4 }}>
                        {displayDate} · {displayTime} · {displayDistrict} — {statusDesc}
                      </Text>

                      {/* Timeline Steps */}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: 14,
                          paddingTop: 12,
                          borderTopWidth: 1,
                          borderTopColor: '#F1F5F9',
                        }}
                      >
                        {timelineSteps.map(st => (
                          <View key={st.label} style={{ alignItems: 'center', gap: 4 }}>
                            <View
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 7,
                                backgroundColor: st.active ? COLORS.primary : '#E2E8F0',
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            />
                            <Text
                              style={{
                                fontSize: fs(10),
                                fontWeight: st.active ? '700' : '500',
                                color: st.active ? COLORS.primary : COLORS.gray[400],
                              }}
                            >
                              {st.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                /* Clean Empty State khi không có việc đang làm (Requirement 2) */
                <View
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 18,
                    padding: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    borderStyle: 'dashed',
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: '#F8FAFC',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <Clock size={22} color={COLORS.gray[400]} />
                  </View>
                  <Text
                    style={{
                      fontSize: fs(14.5),
                      fontWeight: '700',
                      color: COLORS.gray[800],
                      textAlign: 'center',
                    }}
                  >
                    {t('home_active_empty_title')}
                  </Text>
                  <Text
                    style={{
                      fontSize: fs(12),
                      color: COLORS.gray[500],
                      marginTop: 4,
                      textAlign: 'center',
                    }}
                  >
                    {t('home_active_empty_sub')}
                  </Text>
                </View>
              )}
            </View>

            {/* Section: Đặt gần đây - Chỉ hiển thị khi có đơn đã hoàn thành thật (Không dùng mock - Item 4) */}
            {completedJobs.length > 0 &&
              (() => {
                const pastJob = completedJobs[0];
                const pastPrice =
                  pastJob.final_price || pastJob.agreed_price || pastJob.target_price;
                const displayPriceStr = pastPrice ? `${pastPrice.toLocaleString('vi-VN')}₫` : '';
                const completedDateStr = dayjs(
                  pastJob.completed_at || pastJob.updated_at || pastJob.created_at,
                ).format('DD/MM/YYYY');
                return (
                  <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 12,
                      }}
                    >
                      <Text
                        style={{ fontSize: fs(18), fontWeight: '800', color: COLORS.gray[900] }}
                      >
                        {t('home_recent_title')}
                      </Text>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => router.push('/(customer)/jobs')}
                      >
                        <Text
                          style={{ fontSize: fs(13), fontWeight: '700', color: COLORS.primary }}
                        >
                          {t('home_view_history')}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Past job with 1-click [Đặt lại] button */}
                    <View
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 18,
                        padding: 16,
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
                      >
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            backgroundColor: '#DCFCE7',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Home size={22} color={COLORS.primary} />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text
                            style={{ fontSize: fs(15), fontWeight: '800', color: COLORS.gray[900] }}
                            numberOfLines={1}
                          >
                            {pastJob.title}
                          </Text>
                          <Text style={{ fontSize: fs(12), color: COLORS.gray[500], marginTop: 2 }}>
                            {t('status_completed')} · {completedDateStr}
                            {displayPriceStr ? ` · ${displayPriceStr}` : ''}
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          router.push({
                            pathname: '/(customer)/booking',
                            params: {
                              prefill_title: pastJob.title,
                              prefill_description: pastJob.description || '',
                              service_id: pastJob.service_id
                                ? (pastJob.service_id as any)._id || String(pastJob.service_id)
                                : '',
                              target_price: pastPrice ? String(pastPrice) : '',
                            },
                          });
                        }}
                        style={{
                          backgroundColor: '#FFFFFF',
                          borderWidth: 1.5,
                          borderColor: COLORS.primary,
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 12,
                        }}
                      >
                        <Text
                          style={{ fontSize: fs(13), fontWeight: '800', color: COLORS.primary }}
                        >
                          {t('home_rebook_btn')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}
          </>
        )}
      </ScrollView>

      {/* ── BOTTOM SHEET CHỌN NGÀY & GIỜ (ITEM 1) ── */}
      <DateTimePickerBottomSheet
        visible={dateTimePickerOpen}
        initialDate={quickDate}
        initialTime={quickTimeSlot}
        initialTab={bottomSheetInitialTab}
        onClose={() => setDateTimePickerOpen(false)}
        onConfirm={(selectedDate: string, selectedTime: string) => {
          setQuickDate(selectedDate);
          setQuickTimeSlot(selectedTime);
          setQuickDateChip(null);
        }}
      />
    </View>
  );
}
