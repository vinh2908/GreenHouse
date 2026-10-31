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
} from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { useTranslation } from '@/hooks/use-i18n';
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
import { Avatar, COLORS } from '@/components/ui';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';

dayjs.extend(relativeTime);
dayjs.locale('vi');

// ─── Danh mục dịch vụ chuẩn theo Homepage Redesign Demo (12 items) ─────────────
interface ServiceItem {
  id: string;
  name: string;
  price: string;
  emoji: string;
  slug: string;
  isCustom?: boolean;
  badge?: string;
  subtitle?: string;
}

const DEMO_SERVICES: ServiceItem[] = [
  {
    id: '1',
    name: 'Giúp việc theo giờ',
    price: 'Từ 60.000₫/giờ',
    emoji: '🧹',
    slug: 'housekeeping_hourly',
  },
  {
    id: '2',
    name: 'Sửa điện gia dụng',
    price: 'Báo giá theo việc',
    emoji: '⚡',
    slug: 'electrician',
  },
  {
    id: '3',
    name: 'Dọn nhà',
    price: 'Từ 150.000₫/ca',
    emoji: '🏠',
    slug: 'house_cleaning',
  },
  {
    id: '4',
    name: 'Nấu ăn',
    price: 'Từ 120.000₫/bữa',
    emoji: '🍳',
    slug: 'cooking',
  },
  {
    id: '5',
    name: 'Chuyển nhà',
    price: 'Báo giá theo chuyến',
    emoji: '📦',
    slug: 'moving_help',
  },
  {
    id: '6',
    name: 'Chăm trẻ',
    price: 'Từ 55.000₫/giờ',
    emoji: '👶',
    slug: 'child_care',
  },
  {
    id: '7',
    name: 'Sửa ống nước',
    price: 'Báo giá theo việc',
    emoji: '🔧',
    slug: 'plumbing',
  },
  {
    id: '8',
    name: 'Giặt ủi',
    price: 'Từ 20.000₫/kg',
    emoji: '👔',
    slug: 'laundry',
  },
  {
    id: '9',
    name: 'Vệ sinh máy lạnh',
    price: 'Từ 150.000₫/máy',
    emoji: '❄️',
    slug: 'ac_repair',
  },
  {
    id: '10',
    name: 'Chăm người già',
    price: 'Từ 70.000₫/giờ',
    emoji: '👵',
    slug: 'elderly_care',
  },
  {
    id: '11',
    name: 'Bốc hàng, vận chuyển',
    price: 'Deal giá với thợ',
    emoji: '🚛',
    slug: 'handyman',
  },
  {
    id: '12',
    name: 'Dịch vụ khác — tự ghi việc, tự set giá',
    price: 'Deal giá với thợ',
    emoji: '💡',
    slug: 'custom',
    isCustom: true,
    badge: 'MỚI',
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
  const { t, fs } = useTranslation();
  const storedUser = useAuthStore(s => s.user);
  const { data: profile } = useMyProfile();
  const user = profile ?? storedUser;
  const { data: services } = useServices();
  const { data: recentJobs, isLoading: jLoading, refetch } = useMyJobs();
  const { data: unread } = useUnreadCount();
  const createJob = useCreateJob();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const { width: windowWidth } = useWindowDimensions();

  // Vị trí người dùng
  const [currentLocationName, setCurrentLocationName] = useState('Đang định vị...');
  const [currentCoords, setCurrentCoords] = useState<PickerCoords | null>(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [selectedHelperId, setSelectedHelperId] = useState<string>('');

  // API Thợ gần & Vouchers thật
  const { data: nearbyRaw } = useNearbyHelpers(currentCoords);
  const { data: vouchersRaw } = useMyVouchers();

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
  const [quickDescription, setQuickDescription] = useState(
    'Bốc hàng từ kho lên xe tải, chở đến nhà mới rồi dỡ xuống',
  );
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

  // Tìm kiếm dịch vụ tương tác (Item 8)
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');

  // Xác định khu vực hiện tại là Đà Nẵng hay HCM
  const isDaNang = useMemo(() => {
    return (
      currentLocationName.includes('Đà Nẵng') ||
      currentLocationName.includes('Da Nang') ||
      (currentCoords && currentCoords.latitude > 15.5 && currentCoords.latitude < 16.5)
    );
  }, [currentLocationName, currentCoords]);

  // Danh sách thợ gần thật từ API
  const nearbyHelpers: NearbyHelperItem[] = useMemo(() => {
    if (!nearbyRaw || !Array.isArray(nearbyRaw) || nearbyRaw.length === 0) return [];
    return nearbyRaw
      .filter((h: any) => h.location?.coordinates && h.location.coordinates.length >= 2)
      .map((h: any, idx: number) => {
        const coords = h.location.coordinates; // [lng, lat]
        const helperName = h.user_id?.full_name || 'Thợ chuyên nghiệp';
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
        const etaText = `tới trong ~${etaMinutes} phút`;
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
  }, [nearbyRaw, currentCoords]);

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

  // Tọa độ gốc cho mini-map
  const mapCenter = useMemo(() => {
    if (currentCoords && currentCoords.latitude && currentCoords.longitude) {
      return { latitude: currentCoords.latitude, longitude: currentCoords.longitude };
    }
    if (isDaNang) {
      return { latitude: 16.0544, longitude: 108.2022 }; // Đà Nẵng
    }
    return { latitude: 10.7769, longitude: 106.7009 }; // Quận 1, TP.HCM
  }, [currentCoords, isDaNang]);

  // Sinh HTML Leaflet bản đồ mini với ghim hiển thị TÊN THỢ + hiệu ứng pulse trực tiếp
  const leafletMiniMapHtml = useMemo(() => {
    const pinsJson = JSON.stringify(
      nearbyHelpers.map(h => ({
        id: h.id,
        name: h.name, // Hiển thị đầy đủ TÊN THỢ, không cắt ngắn, không hiển thị tên loại dịch vụ
        lat: h.lat,
        lon: h.lon,
        selected: h.id === selectedHelperId,
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
    .pin-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #FFFFFF;
      border: 2px solid #16A34A;
      color: #166534;
      padding: 5px 12px;
      border-radius: 9999px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      font-weight: 800;
      box-shadow: 0 2px 10px rgba(0,0,0,0.18);
      white-space: nowrap;
      cursor: pointer;
      transform: translate(-50%, -50%);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      animation: pin-beat 2.2s ease-in-out infinite;
    }
    .pin-pill.selected {
      background: #16A34A;
      color: #FFFFFF;
      border-color: #FFFFFF;
      transform: translate(-50%, -50%) scale(1.15);
      box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.45);
    }
    @keyframes pin-beat {
      0%, 100% { transform: translate(-50%, -50%) scale(1); }
      50% { transform: translate(-50%, -50%) scale(1.06); box-shadow: 0 4px 14px rgba(22, 163, 74, 0.35); }
    }
    .pin-pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22C55E;
      display: inline-block;
      animation: pulse-ring 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    @keyframes pulse-ring {
      0% { transform: scale(0.9); opacity: 1; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
      70% { transform: scale(1.2); opacity: 0.5; box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
      100% { transform: scale(0.9); opacity: 1; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
    }
    .user-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #0284C7;
      color: #FFFFFF;
      padding: 3px 8px;
      border-radius: 9999px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 10px;
      font-weight: 700;
      border: 2px solid #FFFFFF;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
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
      document.getElementById('map').innerHTML = '<div class="map-error-card"><span>Chưa cấu hình khoá bản đồ Goong.</span></div>';
    } else {
      try {
        const map = new maplibregl.Map({
          container: 'map',
          style: 'https://tiles.goong.io/assets/goong_map_web.json?api_key=' + encodeURIComponent(mapKey),
          center: [${mapCenter.longitude}, ${mapCenter.latitude}],
          zoom: 14,
          interactive: false,
          attributionControl: false
        });

        ${
          currentCoords
            ? `
        const userEl = document.createElement('div');
        userEl.innerHTML = '<div class="user-pill"><span>📍</span><span>Bạn ở đây</span></div>';
        new maplibregl.Marker({ element: userEl })
          .setLngLat([${currentCoords.longitude}, ${currentCoords.latitude}])
          .addTo(map);
        `
            : ''
        }

        const pins = ${pinsJson};
        pins.forEach(p => {
          const pinEl = document.createElement('div');
          pinEl.innerHTML = '<div class="pin-pill ' + (p.selected ? 'selected' : '') + '"><span class="pin-pulse-dot"></span><span class="pin-name">' + p.name + '</span></div>';
          new maplibregl.Marker({ element: pinEl })
            .setLngLat([p.lon, p.lat])
            .addTo(map);
        });
      } catch (e) {
        document.getElementById('map').innerHTML = '<div class="map-error-card"><span>Không tải được bản đồ Goong.</span><button class="map-retry-btn" onclick="window.location.reload()">Thử lại</button></div>';
      }
    }
  </script>
</body>
</html>`;
  }, [mapCenter, selectedHelperId, nearbyHelpers]);

  // Lời chào theo thời gian trong ngày (khuya / sáng / chiều / tối)
  const greeting = useMemo(() => {
    const hour = dayjs().hour();
    const name = user?.full_name ? user.full_name.split(' ').pop() || user.full_name : 'bạn';

    if (hour >= 22 || hour < 5) {
      return {
        title: `Chào ${name}, khuya rồi`,
        subtitle: 'Cần giúp việc gì trong đêm?',
      };
    } else if (hour >= 5 && hour < 12) {
      return {
        title: `Chào ${name}, buổi sáng`,
        subtitle: 'Hôm nay bạn cần hỗ trợ việc gì?',
      };
    } else if (hour >= 12 && hour < 18) {
      return {
        title: `Chào ${name}, buổi chiều`,
        subtitle: 'Chiều nay nhà mình cần việc gì?',
      };
    } else {
      return {
        title: `Chào ${name}, buổi tối`,
        subtitle: 'Tối nay cần hỗ trợ việc gì?',
      };
    }
  }, [user]);

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
            if (parsed.locationName) setCurrentLocationName(parsed.locationName);
            if (parsed.coords) setCurrentCoords(parsed.coords);
            return;
          } catch {}
        }
        locationService
          .getCurrentLocationDetails()
          .then(details => {
            if (details) {
              const label = inferLocationLabel(details);
              setCurrentLocationName(label);
              if (details.coordinates) {
                setCurrentCoords({
                  latitude: details.coordinates[1],
                  longitude: details.coordinates[0],
                });
              }
            } else {
              setCurrentLocationName('Chưa xác định vị trí');
              setCurrentCoords(null);
            }
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
        Toast.show({ type: 'error', text1: 'Cần quyền camera để chụp ảnh sự cố' });
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
        Toast.show({ type: 'error', text1: 'Không thể mở máy ảnh hoặc thư viện ảnh' });
      }
    }
  };

  // Xử lý nút Chọn ảnh sự cố từ thư viện (WOW 2)
  const handlePickIssuePhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Toast.show({ type: 'error', text1: 'Cần quyền thư viện ảnh' });
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
      Toast.show({ type: 'error', text1: 'Không thể chọn ảnh từ thư viện' });
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
    if (chip === 'don_nha') {
      setQuickDescription('Dọn dẹp nhà cửa 2 phòng ngủ, lau sàn, rửa chén bát và lau kính.');
      setQuickDealPrice('150000');
    } else if (chip === 'boc_hang') {
      setQuickDescription('Bốc hàng từ kho lên xe tải, chở đến nhà mới rồi dỡ xuống');
      setQuickDealPrice('200000');
    } else if (chip === 'may_lanh') {
      setQuickDescription('Vệ sinh bảo dưỡng 2 máy lạnh treo tường phòng khách và phòng ngủ');
      setQuickDealPrice('250000');
    } else {
      setQuickDescription('');
      setQuickDealPrice('100000');
    }
  };

  // Submit từ khối Quick Booking - map chip sang dịch vụ catalog thật (Item 2)
  const handleQuickSubmit = () => {
    if (!quickDescription.trim()) {
      Toast.show({ type: 'error', text1: 'Vui lòng nhập mô tả công việc bạn cần' });
      return;
    }
    const priceNum = Number(quickDealPrice.replace(/[^0-9]/g, ''));
    if (!priceNum || priceNum < 50000) {
      Toast.show({ type: 'error', text1: 'Giá mở đầu deal tối thiểu là 50.000₫' });
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
          text1: 'Giờ bắt đầu không hợp lệ',
          text2:
            'Không thể chọn giờ trong quá khứ của ngày hôm nay. Vui lòng chọn giờ sau thời điểm hiện tại.',
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
          if (geo) {
            const label = inferLocationLabel(geo);
            setCurrentLocationName(label);
            AsyncStorage.setItem(
              '@homemate_customer_pinned_location',
              JSON.stringify({ coords, locationName: label }),
            ).catch(() => {});
          }
        }}
      />

      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={jLoading} onRefresh={refetch} colors={[COLORS.primary]} />
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
                  fontSize: 13,
                  fontWeight: '700',
                  color: currentCoords ? COLORS.gray[800] : '#B45309',
                }}
                numberOfLines={1}
              >
                {currentCoords ? currentLocationName : 'Chưa định vị — Bấm lấy vị trí'}
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
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#16A34A' }}>
                  {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'V'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Greeting Text: Chào Vinh, khuya rồi */}
          <Text
            style={{
              fontSize: 24,
              fontWeight: '900',
              color: COLORS.gray[900],
              letterSpacing: -0.3,
            }}
          >
            {greeting.title}
          </Text>
          <Text
            style={{
              fontSize: 14,
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
                fontSize: 13,
                color: COLORS.gray[900],
                fontWeight: '500',
              }}
              numberOfLines={1}
              multiline={false}
              placeholder="Tìm dịch vụ... ví dụ: máy lạnh, dọn nhà, điện"
              placeholderTextColor={COLORS.gray[400]}
              value={serviceSearchQuery}
              onChangeText={setServiceSearchQuery}
            />
            {serviceSearchQuery.trim().length > 0 && (
              <TouchableOpacity
                onPress={() => setServiceSearchQuery('')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[400] }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

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
            <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900] }}>
              Thợ đang ở gần bạn
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
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#16A34A' }}>Trực tiếp</Text>
            </View>
          </View>

          {/* Interactive Mini Map */}
          <View
            style={{
              height: 190,
              borderRadius: 18,
              overflow: 'hidden',
              backgroundColor: '#E2E8F0',
              borderWidth: 1,
              borderColor: '#CBD5E1',
              position: 'relative',
            }}
          >
            {Platform.OS === 'web' ? (
              <iframe
                srcDoc={leafletMiniMapHtml}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Goong Mini Map"
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <WebView
                originWhitelist={['*']}
                source={{ html: leafletMiniMapHtml }}
                scrollEnabled={false}
                style={{ flex: 1, backgroundColor: '#f8fafc' }}
              />
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
                  fontSize: 14,
                  fontWeight: '700',
                  color: COLORS.gray[800],
                  textAlign: 'center',
                }}
              >
                Hiện chưa có thợ online gần bạn
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: COLORS.gray[500],
                  marginTop: 4,
                  textAlign: 'center',
                }}
              >
                Bạn vẫn có thể đăng việc hoặc đặt lịch hẹn, thợ trong khu vực sẽ nhận việc sớm nhất.
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
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
                            fontSize: 14,
                            fontWeight: '800',
                            color: isSelected ? COLORS.primary : COLORS.gray[600],
                          }}
                        >
                          {helper.name.charAt(0)}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text
                          style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}
                          numberOfLines={1}
                        >
                          {helper.name}
                        </Text>
                        <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}>
                          {helper.status} · ⭐ {helper.rating.toFixed(1)} ({helper.completedJobs}{' '}
                          việc)
                        </Text>
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 5 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary }}>
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
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>
                          Đặt thợ →
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
            <Svg height="100%" width="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
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
                  fontSize: 11,
                  fontWeight: '800',
                  color: '#FFFFFF',
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                AI QUÉT ẢNH SỰ CỐ
              </Text>
            </View>

            <Text
              style={{
                fontSize: 17,
                fontWeight: '900',
                color: '#FFFFFF',
                marginTop: 10,
                lineHeight: 23,
                flexShrink: 1,
              }}
            >
              Chụp ảnh sự cố, AI đoán việc
            </Text>

            <Text
              style={{
                fontSize: 13,
                color: '#DCFCE7',
                marginTop: 6,
                lineHeight: 19,
                fontWeight: '500',
                flexShrink: 1,
              }}
            >
              Máy lạnh chảy nước, vòi rò, tường nứt… chỉ cần một tấm ảnh, không cần biết tên dịch
              vụ.
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
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>
                1 · Chụp ảnh
              </Text>
              <Text style={{ fontSize: 10, color: '#86EFAC' }}>•</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>
                2 · AI phân tích
              </Text>
              <Text style={{ fontSize: 10, color: '#86EFAC' }}>•</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>
                3 · Nhận báo giá
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
              <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#16A34A' }}>
                Chụp ảnh ngay
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
                  fontSize: 13,
                  fontWeight: '700',
                  color: '#FFFFFF',
                  textDecorationLine: 'underline',
                  letterSpacing: 0.2,
                }}
              >
                hoặc chọn ảnh sự cố của bạn
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 4. VOUCHER CAROUSEL (Dữ liệu thật từ hệ thống + Tự chạy) ──── */}
        <View style={{ marginTop: 24 }}>
          <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: '800',
                color: COLORS.gray[900],
              }}
            >
              Ưu đãi dành cho bạn
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
                  fontSize: 14,
                  fontWeight: '700',
                  color: COLORS.gray[700],
                  marginTop: 6,
                }}
              >
                Hiện chưa có mã ưu đãi mới
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.gray[400], marginTop: 2 }}>
                Các chương trình khuyến mãi tiếp theo sẽ xuất hiện tại đây
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
                      ? `Giảm ${v.discount_value}%`
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
                              fontSize: 10,
                              fontWeight: '800',
                              color: '#16A34A',
                              letterSpacing: 0.5,
                              textTransform: 'uppercase',
                            }}
                          >
                            ƯU ĐÃI ĐẶC BIỆT
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontSize: 22,
                            fontWeight: '900',
                            color: COLORS.gray[900],
                            marginTop: 6,
                          }}
                        >
                          {discountDisplay}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            color: COLORS.gray[600],
                            marginTop: 4,
                            lineHeight: 16,
                          }}
                          numberOfLines={2}
                        >
                          {v.description ||
                            (v.min_order_amount
                              ? `Đơn tối thiểu ${Number(v.min_order_amount).toLocaleString('vi-VN')}₫`
                              : 'Áp dụng cho mọi dịch vụ')}
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
                        <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.gray[900] }}>
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
                              fontSize: 12,
                              fontWeight: '700',
                              color: isCopied ? COLORS.primary : COLORS.gray[700],
                            }}
                          >
                            {isCopied ? 'Đã chép' : 'Sao chép'}
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
        <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900] }}>
              Dịch vụ
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/(customer)/booking')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.primary }}>
                Đặt dịch vụ khác →
              </Text>
            </TouchableOpacity>
          </View>

          {/* Responsive Multi-Column Grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(() => {
              const q = serviceSearchQuery.trim().toLowerCase();
              const list = q
                ? DEMO_SERVICES.filter(
                    s => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q),
                  )
                : DEMO_SERVICES;

              const containerW = Math.min(windowWidth, 640) - 36; // 18px padding each side
              const numCols = windowWidth >= 768 ? 4 : 3;
              const cardGap = 8;
              const cardW = Math.floor((containerW - (numCols - 1) * cardGap) / numCols);

              if (list.length === 0) {
                return (
                  <View style={{ width: '100%', padding: 20, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: COLORS.gray[500] }}>
                      Không tìm thấy dịch vụ phù hợp với từ khóa "{serviceSearchQuery}".
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
                const displayPrice = matched?.base_price_min
                  ? `Từ ${matched.base_price_min.toLocaleString('vi-VN')}₫`
                  : svc.isCustom
                    ? 'Deal giá với thợ'
                    : '';

                return (
                  <ScalePressable
                    key={svc.id}
                    onPress={() => {
                      if (isCustom) {
                        router.push({
                          pathname: '/(customer)/booking',
                          params: { custom_service_name: 'Dịch vụ theo yêu cầu' },
                        });
                      } else if (matched) {
                        router.push({
                          pathname: '/(customer)/booking',
                          params: { service_id: matched._id, service_slug: matched.slug },
                        });
                      } else {
                        router.push({
                          pathname: '/(customer)/booking',
                          params: { custom_service_name: svc.name },
                        });
                        Toast.show({
                          type: 'info',
                          text1: `Dịch vụ "${svc.name}"`,
                          text2: 'Đang mở theo yêu cầu riêng để bạn tự thỏa thuận giá với thợ',
                        });
                      }
                    }}
                    style={{
                      width: cardW,
                      backgroundColor: isCustom ? '#F0FDF4' : '#FFFFFF',
                      borderRadius: 14,
                      paddingVertical: 12,
                      paddingHorizontal: 6,
                      alignItems: 'center',
                      borderWidth: 1.5,
                      borderColor: isCustom ? COLORS.primary : '#F1F5F9',
                      position: 'relative',
                      minHeight: 110,
                      justifyContent: 'space-between',
                    }}
                  >
                    {/* Badge MỚI cho item 12 */}
                    {svc.badge && (
                      <View
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          backgroundColor: '#DCFCE7',
                          paddingHorizontal: 5,
                          paddingVertical: 2,
                          borderRadius: 6,
                        }}
                      >
                        <Text style={{ fontSize: 9, fontWeight: '900', color: COLORS.primary }}>
                          {svc.badge}
                        </Text>
                      </View>
                    )}

                    <Text style={{ fontSize: 26, marginVertical: 4 }}>{svc.emoji}</Text>

                    <Text
                      style={{
                        fontSize: 11.5,
                        fontWeight: '800',
                        color: isCustom ? COLORS.primary : COLORS.gray[900],
                        textAlign: 'center',
                        lineHeight: 15,
                      }}
                      numberOfLines={2}
                    >
                      {svc.name}
                    </Text>

                    {displayPrice ? (
                      <Text
                        style={{
                          fontSize: 10,
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
                  <Text style={{ fontSize: 14.5, fontWeight: '900', color: '#FFFFFF' }}>
                    SOS — Cần người gấp?
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
                  <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#DC2626' }}>
                    Khẩn cấp
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  fontSize: 12,
                  color: '#FEE2E2',
                  marginTop: 6,
                  lineHeight: 16,
                  fontWeight: '500',
                }}
              >
                Thợ hủy phút chót hoặc việc khẩn trong ngày: phát tín hiệu SOS, thợ gần nhất nhận
                thay ngay trong 3 phút.
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
              <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.gray[900] }}>
                Không biết thuộc dịch vụ nào?
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.gray[600], marginTop: 2, lineHeight: 16 }}>
                Mô tả bằng lời hoặc chụp ảnh ở thẻ AI phía trên — AI gợi ý đúng dịch vụ và ước tính
                giá.
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 6. ĐĂNG VIỆC THEO Ý BẠN (Quick Booking Block Form) ───────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '800',
              color: COLORS.gray[900],
              marginBottom: 12,
            }}
          >
            Đăng việc theo ý bạn
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
                  fontSize: 14,
                  fontWeight: '700',
                  color: COLORS.gray[800],
                  marginBottom: 8,
                }}
              >
                Bạn cần làm việc gì?
              </Text>
              {/* Chips */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {[
                  { key: 'don_nha', label: 'Dọn nhà' },
                  { key: 'boc_hang', label: 'Bốc hàng' },
                  { key: 'may_lanh', label: 'Vệ sinh máy lạnh' },
                  { key: 'khac', label: 'Dịch vụ khác…' },
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
                          fontSize: 12.5,
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
                placeholder="Mô tả công việc của bạn..."
                placeholderTextColor={COLORS.gray[400]}
                multiline
                numberOfLines={3}
                style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 14,
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
                  fontSize: 14,
                  fontWeight: '700',
                  color: COLORS.gray[800],
                  marginBottom: 8,
                }}
              >
                Giá bạn muốn trả (giá mở đầu để deal)
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
                  fontSize: 16,
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
                  fontSize: 14,
                  fontWeight: '700',
                  color: COLORS.gray[800],
                }}
              >
                Thời gian làm việc
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
                    style={{ fontSize: 15, fontWeight: '700', color: COLORS.gray[900] }}
                    numberOfLines={1}
                  >
                    {(() => {
                      const dt = dayjs(quickDate);
                      const dow = dt.format('dddd');
                      const capitalizedDow = dow.charAt(0).toUpperCase() + dow.slice(1);
                      return `${capitalizedDow}, ${dt.format('DD/MM')}`;
                    })()}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '500', marginTop: 1 }}>
                    Bấm để mở lịch tháng trong bottom sheet
                  </Text>
                </View>
                <ChevronRight size={18} color="#16A34A" />
              </TouchableOpacity>

              {/* Quick day shortcut chips */}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[
                  { key: 'today', label: 'Hôm nay' },
                  { key: 'tomorrow', label: 'Ngày mai' },
                  { key: 'sat', label: 'Thứ 7' },
                  { key: 'sun', label: 'Chủ nhật' },
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
                          fontSize: 11.5,
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
                label="Giờ bắt đầu"
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
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>Đăng việc</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 7. QUYỀN LỢI & CAM KẾT (3 Thẻ Chuẩn Demo) ──────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '800',
              color: COLORS.gray[900],
              marginBottom: 12,
            }}
          >
            Quyền lợi & cam kết
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
                  fontSize: 12,
                  fontWeight: '800',
                  color: COLORS.gray[900],
                  marginTop: 6,
                  textAlign: 'center',
                }}
              >
                Thợ đã xác thực
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  color: COLORS.gray[500],
                  marginTop: 2,
                  textAlign: 'center',
                }}
              >
                CCCD & lý lịch rõ ràng
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
                  fontSize: 12,
                  fontWeight: '800',
                  color: COLORS.gray[900],
                  marginTop: 6,
                  textAlign: 'center',
                }}
              >
                Bảo hiểm công việc
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  color: COLORS.gray[500],
                  marginTop: 2,
                  textAlign: 'center',
                }}
              >
                Bồi thường hư hỏng, mất mát
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
                  fontSize: 12,
                  fontWeight: '800',
                  color: COLORS.gray[900],
                  marginTop: 6,
                  textAlign: 'center',
                }}
              >
                Giữ tiền bảo đảm
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  color: COLORS.gray[500],
                  marginTop: 2,
                  textAlign: 'center',
                }}
              >
                Chỉ trả khi bạn nghiệm thu xong
              </Text>
            </View>
          </View>
        </View>

        {/* ── 8. VIỆC ĐANG THỰC HIỆN & ĐẶT GẦN ĐÂY ───────────────────────── */}
        {/* Section: Việc đang thực hiện */}
        <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '800',
              color: COLORS.gray[900],
              marginBottom: 12,
            }}
          >
            Việc đang thực hiện
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
                { label: 'Đã nhận việc', active: step1Done },
                { label: 'Đang đến', active: step2Done },
                { label: 'Đang làm', active: step3Done },
                { label: 'Nghiệm thu', active: step4Done },
              ];

              let statusBadgeText = 'Đang tìm thợ';
              let statusBadgeBg = '#FEF3C7';
              let statusBadgeColor = '#D97706';
              let statusDesc = 'Hệ thống đang điều phối và tìm thợ phù hợp nhất gần bạn.';

              if (j.status === 'open' || j.status === 'pending') {
                statusBadgeText = 'Đang tìm thợ';
                statusBadgeBg = '#FEF3C7';
                statusBadgeColor = '#D97706';
                statusDesc = 'Hệ thống đang điều phối và tìm thợ phù hợp nhất gần bạn.';
              } else if (j.status === 'receiving_quotes' || j.status === 'bidding') {
                statusBadgeText = 'Có báo giá mới';
                statusBadgeBg = '#E0E7FF';
                statusBadgeColor = '#4338CA';
                statusDesc = 'Đã có thợ gửi báo giá, bấm để xem chi tiết và xác nhận thợ.';
              } else if (j.status === 'confirmed' || j.status === 'quote_selected') {
                statusBadgeText = 'Thợ đã nhận';
                statusBadgeBg = '#DCFCE7';
                statusBadgeColor = '#15803D';
                statusDesc = 'Thợ đã nhận việc và đang chuẩn bị dụng cụ đến điểm hẹn.';
              } else if (j.status === 'helper_on_the_way' || j.status === 'on_the_way') {
                statusBadgeText = 'Thợ đang đến';
                statusBadgeBg = '#FFEDD5';
                statusBadgeColor = '#C2410C';
                statusDesc = 'Thợ đang trên đường di chuyển đến địa chỉ của bạn.';
              } else if (j.status === 'helper_arrived') {
                statusBadgeText = 'Đã đến nơi';
                statusBadgeBg = '#E0F2FE';
                statusBadgeColor = '#0284C7';
                statusDesc = 'Thợ đã có mặt tại địa chỉ của bạn và chuẩn bị tiến hành công việc.';
              } else if (j.status === 'in_progress') {
                statusBadgeText = 'Đang làm';
                statusBadgeBg = '#DBEAFE';
                statusBadgeColor = '#1D4ED8';
                statusDesc = 'Thợ đang thực hiện công việc tại địa chỉ của bạn.';
              } else if (j.status === 'pending_review') {
                statusBadgeText = 'Chờ nghiệm thu';
                statusBadgeBg = '#FEF3C7';
                statusBadgeColor = '#B45309';
                statusDesc = 'Thợ đã làm xong, bạn vui lòng kiểm tra và nghiệm thu công việc.';
              } else if (j.status === 'completed') {
                statusBadgeText = 'Đã hoàn thành';
                statusBadgeBg = '#DCFCE7';
                statusBadgeColor = '#15803D';
                statusDesc = 'Công việc đã hoàn thành và thanh toán thành công.';
              } else {
                statusBadgeText = 'Đang xử lý';
                statusBadgeBg = '#F1F5F9';
                statusBadgeColor = '#475569';
                statusDesc = 'Đơn dịch vụ đang được hệ thống xử lý.';
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
                      style={{ fontSize: 16, fontWeight: '800', color: COLORS.gray[900], flex: 1 }}
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
                      <Text style={{ fontSize: 11, fontWeight: '800', color: statusBadgeColor }}>
                        {statusBadgeText}
                      </Text>
                    </View>
                  </View>

                  <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 4 }}>
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
                            fontSize: 10,
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
                  fontSize: 14.5,
                  fontWeight: '700',
                  color: COLORS.gray[800],
                  textAlign: 'center',
                }}
              >
                Bạn chưa có việc đang thực hiện
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: COLORS.gray[400],
                  marginTop: 4,
                  textAlign: 'center',
                }}
              >
                Chọn dịch vụ hoặc đăng việc mới bên trên để thợ nhận việc ngay
              </Text>
            </View>
          )}
        </View>

        {/* Section: Đặt gần đây - Chỉ hiển thị khi có đơn đã hoàn thành thật (Không dùng mock - Item 4) */}
        {completedJobs.length > 0 &&
          (() => {
            const pastJob = completedJobs[0];
            const pastPrice = pastJob.final_price || pastJob.agreed_price || pastJob.target_price;
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
                  <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900] }}>
                    Đặt gần đây
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => router.push('/(customer)/jobs')}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.primary }}>
                      Xem lịch sử →
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
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
                      <Text style={{ fontSize: 22 }}>🏠</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}
                        numberOfLines={1}
                      >
                        {pastJob.title}
                      </Text>
                      <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}>
                        Hoàn thành · {completedDateStr}
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
                    <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary }}>
                      Đặt lại
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
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
