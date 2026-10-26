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
} from 'react-native';
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
} from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { useTranslation } from '@/hooks/use-i18n';
import { useServices, useMyJobs, useUnreadCount, useMyProfile, useCreateJob } from '@/hooks/use-api';
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
  { id: '1', name: 'Giúp việc theo giờ', price: 'Từ 60.000₫/giờ', emoji: '🧹', slug: 'housekeeping_hourly' },
  { id: '2', name: 'Sửa điện gia dụng', price: 'Báo giá theo việc', emoji: '⚡', slug: 'handyman' },
  { id: '3', name: 'Dọn nhà', price: 'Từ 150.000₫/ca', emoji: '🏠', slug: 'house_cleaning' },
  { id: '4', name: 'Nấu ăn', price: 'Từ 120.000₫/bữa', emoji: '🍳', slug: 'cooking' },
  { id: '5', name: 'Chuyển nhà', price: 'Báo giá theo chuyến', emoji: '📦', slug: 'moving_help' },
  { id: '6', name: 'Chăm trẻ', price: 'Từ 55.000₫/giờ', emoji: '👶', slug: 'family_care' },
  { id: '7', name: 'Sửa ống nước', price: 'Báo giá theo việc', emoji: '🔧', slug: 'handyman' },
  { id: '8', name: 'Giặt ủi', price: 'Từ 20.000₫/kg', emoji: '👔', slug: 'laundry' },
  { id: '9', name: 'Vệ sinh máy lạnh', price: 'Từ 250.000₫/máy', emoji: '❄️', slug: 'deep_cleaning' },
  { id: '10', name: 'Chăm người già', price: 'Từ 70.000₫/giờ', emoji: '👵', slug: 'family_care' },
  { id: '11', name: 'Bốc hàng, vận chuyển', price: 'Deal giá với thợ', emoji: '🚛', slug: 'moving_help' },
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

// ─── Danh sách thợ đang ở gần (Fallback Demo Workers) ───────────────────────────
interface NearbyHelper {
  id: string;
  name: string;
  areaHcm: string;
  areaDaNang: string;
  distance: string;
  eta: string;
  latOffset: number;
  lonOffset: number;
}

const NEARBY_HELPERS: NearbyHelper[] = [
  {
    id: '1',
    name: 'Nguyễn Văn An',
    areaHcm: 'Khu Bến Nghé',
    areaDaNang: 'Khu Hòa Khê',
    distance: '0,4 km',
    eta: 'tới trong ~5 phút',
    latOffset: 0.0028,
    lonOffset: -0.0022,
  },
  {
    id: '2',
    name: 'Trần Minh Tuấn',
    areaHcm: 'Khu Tân Định',
    areaDaNang: 'Khu Thạc Gián',
    distance: '0,9 km',
    eta: 'tới trong ~9 phút',
    latOffset: -0.0035,
    lonOffset: 0.0032,
  },
  {
    id: '3',
    name: 'Lê Hoàng Nam',
    areaHcm: 'Khu Đa Kao',
    areaDaNang: 'Khu Hải Châu',
    distance: '1,3 km',
    eta: 'tới trong ~13 phút',
    latOffset: 0.0048,
    lonOffset: 0.0051,
  },
  {
    id: '4',
    name: 'Phạm Quốc Huy',
    areaHcm: 'Khu Cầu Kho',
    areaDaNang: 'Khu An Khê',
    distance: '1,7 km',
    eta: 'tới trong ~17 phút',
    latOffset: -0.0055,
    lonOffset: -0.0042,
  },
];

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

  // Vị trí người dùng
  const [currentLocationName, setCurrentLocationName] = useState('Đang định vị...');
  const [currentCoords, setCurrentCoords] = useState<PickerCoords | null>(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [selectedHelperId, setSelectedHelperId] = useState<string>('1');

  // Khối Quick Booking Block ("Đăng việc theo ý bạn")
  const [quickServiceChip, setQuickServiceChip] = useState<'don_nha' | 'boc_hang' | 'may_lanh' | 'khac'>('boc_hang');
  const [quickDescription, setQuickDescription] = useState(
    'Bốc hàng từ kho lên xe tải, chở đến nhà mới rồi dỡ xuống',
  );
  const [quickDealPrice, setQuickDealPrice] = useState('200000');
  const [quickDateChip, setQuickDateChip] = useState<'today' | 'tomorrow' | 'sat' | 'sun'>('tomorrow');
  const [quickDate, setQuickDate] = useState(dayjs().add(1, 'day').format('YYYY-MM-DD'));
  const [quickTimeSlot, setQuickTimeSlot] = useState('19:00');
  const [quickDuration, setQuickDuration] = useState(2);
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);

  // Vouchers state
  const [copiedVoucher, setCopiedVoucher] = useState<string | null>(null);

  // Xác định khu vực hiện tại là Đà Nẵng hay HCM
  const isDaNang = useMemo(() => {
    return (
      currentLocationName.includes('Đà Nẵng') ||
      currentLocationName.includes('Da Nang') ||
      (currentCoords && currentCoords.latitude > 15.5 && currentCoords.latitude < 16.5)
    );
  }, [currentLocationName, currentCoords]);

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

  // Sinh HTML Leaflet bản đồ mini có 4 marker số 1, 2, 3, 4
  const leafletMiniMapHtml = useMemo(() => {
    const pinsJson = JSON.stringify(
      NEARBY_HELPERS.map(h => ({
        id: h.id,
        name: h.name,
        lat: mapCenter.latitude + h.latOffset,
        lon: mapCenter.longitude + h.lonOffset,
        selected: h.id === selectedHelperId,
      })),
    );

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #map { width: 100%; height: 100%; background: #f8fafc; }
    .pin-badge {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #FFFFFF;
      border: 2px solid #16A34A;
      color: #16A34A;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.18);
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .pin-badge.selected {
      background: #16A34A;
      color: #FFFFFF;
      transform: scale(1.22);
      border-color: #FFFFFF;
      box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.45);
    }
    .leaflet-control-attribution { display: none !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const center = [${mapCenter.latitude}, ${mapCenter.longitude}];
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      boxZoom: false,
      keyboard: false
    }).setView(center, 14);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    const pins = ${pinsJson};
    pins.forEach(p => {
      const icon = L.divIcon({
        className: 'custom-pin-container',
        html: '<div class="pin-badge ' + (p.selected ? 'selected' : '') + '">' + p.id + '</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      L.marker([p.lat, p.lon], { icon }).addTo(map);
    });
  </script>
</body>
</html>`;
  }, [mapCenter, selectedHelperId]);

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
    if (!geo) return 'Quận 1, Hồ Chí Minh';
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
    return 'Quận 1, Hồ Chí Minh';
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
              setCurrentLocationName('Quận 1, Hồ Chí Minh');
            }
          })
          .catch(() => {
            setCurrentLocationName('Quận 1, Hồ Chí Minh');
          });
      })
      .catch(() => {
        setCurrentLocationName('Quận 1, Hồ Chí Minh');
      });
  }, []);

  // Xử lý nút Chụp ảnh ngay (WOW 2)
  const handleTakeIssuePhoto = async () => {
    try {
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
          params: { attached_photo: result.assets[0].uri },
        });
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể mở máy ảnh' });
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
        allowsMultipleSelection: false,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        router.push({
          pathname: '/(customer)/booking',
          params: { attached_photo: result.assets[0].uri },
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
      setQuickDate(now.format('YYYY-MM-DD'));
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

  // Tính giờ kết thúc dự kiến
  const expectedEndTime = useMemo(() => {
    try {
      const startDateTime = dayjs(`${quickDate} ${quickTimeSlot}`);
      const endDateTime = startDateTime.add(quickDuration, 'hour');
      const isNextDay = endDateTime.date() !== startDateTime.date();
      return `${endDateTime.format('HH:mm')}${isNextDay ? ' (ngày hôm sau)' : ''}`;
    } catch {
      return '21:00';
    }
  }, [quickDate, quickTimeSlot, quickDuration]);

  // Submit từ khối Quick Booking
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

    router.push({
      pathname: '/(customer)/booking',
      params: {
        custom_service_name:
          quickServiceChip === 'boc_hang'
            ? 'Bốc hàng, vận chuyển'
            : quickServiceChip === 'don_nha'
              ? 'Dọn dẹp nhà cửa'
              : quickServiceChip === 'may_lanh'
                ? 'Vệ sinh máy lạnh'
                : 'Dịch vụ theo yêu cầu',
        target_price: String(priceNum),
        preferred_date: quickDate,
        preferred_time_start: quickTimeSlot,
        duration_hours: String(quickDuration),
        prefill_description: quickDescription,
        prefill_title: quickDescription.slice(0, 48),
      },
    });
  };

  const activeJobs =
    recentJobs?.filter((j: { status: string }) => !['completed', 'cancelled'].includes(j.status)) ?? [];

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
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {/* ── 1. HEADER (Top Bar chuẩn Homepage Redesign Demo) ─────────────── */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 18,
            paddingTop: Math.max(insets.top + 8, 20),
            paddingBottom: 18,
            borderBottomWidth: 1,
            borderBottomColor: '#F1F5F9',
          }}
        >
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
                backgroundColor: '#F1F5F9',
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: 20,
                gap: 6,
                maxWidth: '65%',
              }}
            >
              <MapPin size={15} color={COLORS.primary} />
              <Text
                style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[800] }}
                numberOfLines={1}
              >
                {currentLocationName}
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

          {/* Search bar */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push('/(customer)/booking')}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 14,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginTop: 16,
              gap: 10,
              borderWidth: 1.5,
              borderColor: '#E2E8F0',
            }}
          >
            <Search size={18} color={COLORS.gray[400]} />
            <Text style={{ flex: 1, color: COLORS.gray[400], fontSize: fs(14), fontWeight: '500' }}>
              Tìm dịch vụ... ví dụ: máy lạnh, dọn nhà
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── 2. WOW 1: THỢ ĐANG Ở GẦN BẠN (Live Map + Numbered Helper Cards) ─ */}
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
                  backgroundColor: '#DC2626',
                }}
              />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#DC2626' }}>
                Trực tiếp
              </Text>
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
                title="Leaflet Mini Map"
              />
            ) : (
              <WebView
                originWhitelist={['*']}
                source={{ html: leafletMiniMapHtml }}
                scrollEnabled={false}
                style={{ flex: 1, backgroundColor: '#f8fafc' }}
              />
            )}
            {/* Legal notice overlay at bottom right */}
            <View
              style={{
                position: 'absolute',
                bottom: 4,
                right: 8,
                backgroundColor: 'rgba(255,255,255,0.7)',
                paddingHorizontal: 4,
                paddingVertical: 1,
                borderRadius: 4,
              }}
            >
              <Text style={{ fontSize: 9, color: COLORS.gray[500] }}>
                Map data legal notices © OpenStreetMap
              </Text>
            </View>
          </View>

          {/* Worker list cards (1 -> 4) */}
          <View style={{ marginTop: 12, gap: 8 }}>
            {NEARBY_HELPERS.map(helper => {
              const isSelected = helper.id === selectedHelperId;
              const areaText = isDaNang ? helper.areaDaNang : helper.areaHcm;

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
                    {/* Numbered badge */}
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: isSelected ? COLORS.primary : '#F1F5F9',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '800',
                          color: isSelected ? '#FFFFFF' : COLORS.gray[600],
                        }}
                      >
                        {helper.id}
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
                        Đang rảnh · {areaText}
                      </Text>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary }}>
                      {helper.distance}
                    </Text>
                    <Text style={{ fontSize: 11, color: COLORS.gray[400], marginTop: 2 }}>
                      {helper.eta}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── 3. WOW 2: THẺ AI QUÉT ẢNH SỰ CỐ (Chụp ảnh đoán việc & báo giá) ─ */}
        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <View
            style={{
              backgroundColor: '#F0FDF4',
              borderRadius: 20,
              padding: 18,
              borderWidth: 1.5,
              borderColor: '#86EFAC',
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '800',
                color: COLORS.primary,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              AI QUÉT ẢNH SỰ CỐ
            </Text>

            <Text
              style={{
                fontSize: 17,
                fontWeight: '800',
                color: COLORS.gray[900],
                marginTop: 6,
                lineHeight: 22,
              }}
            >
              Chụp ảnh sự cố, AI đoán việc & báo giá ngay
            </Text>

            <Text
              style={{
                fontSize: 12.5,
                color: COLORS.gray[600],
                marginTop: 4,
                lineHeight: 18,
              }}
            >
              Máy lạnh chảy nước, vòi rò, tường nứt… chỉ cần một tấm ảnh, không cần biết tên dịch vụ.
            </Text>

            {/* 3 Steps indicator */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginTop: 12,
                marginBottom: 14,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.gray[500] }}>
                1 · Chụp ảnh
              </Text>
              <Text style={{ fontSize: 11, color: COLORS.gray[300] }}>•</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.gray[500] }}>
                2 · AI phân tích
              </Text>
              <Text style={{ fontSize: 11, color: COLORS.gray[300] }}>•</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.gray[500] }}>
                3 · Nhận báo giá
              </Text>
            </View>

            {/* Button: Chụp ảnh ngay */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleTakeIssuePhoto}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 14,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderWidth: 1.5,
                borderColor: COLORS.primary,
                shadowColor: COLORS.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <Camera size={18} color={COLORS.primary} />
              <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.primary }}>
                Chụp ảnh ngay
              </Text>
            </TouchableOpacity>

            {/* Sub-link: hoặc chọn ảnh sự cố của bạn */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handlePickIssuePhoto}
              style={{ alignItems: 'center', marginTop: 10 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.gray[500] }}>
                hoặc chọn ảnh sự cố của bạn
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 4. VOUCHER CAROUSEL (Ưu đãi dành cho bạn) ──────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '800',
              color: COLORS.gray[900],
              marginBottom: 12,
            }}
          >
            Ưu đãi dành cho bạn
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {/* Voucher 1: GH10 */}
              <View
                style={{
                  width: 250,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  justifyContent: 'space-between',
                }}
              >
                <View>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '800',
                      color: COLORS.gray[400],
                      letterSpacing: 0.5,
                    }}
                  >
                    KHÁCH HÀNG THÂN THIẾT
                  </Text>
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: '900',
                      color: COLORS.gray[900],
                      marginTop: 4,
                    }}
                  >
                    10%
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: COLORS.gray[500],
                      marginTop: 4,
                      lineHeight: 16,
                    }}
                  >
                    Áp dụng cho đơn đầu tiên trong tháng. Hạn dùng 31/10/2026.
                  </Text>
                </View>

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
                    GH10
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => handleCopyVoucher('GH10')}
                    style={{
                      backgroundColor: copiedVoucher === 'GH10' ? '#DCFCE7' : '#F1F5F9',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: copiedVoucher === 'GH10' ? COLORS.primary : COLORS.gray[700],
                      }}
                    >
                      {copiedVoucher === 'GH10' ? 'Đã chép' : 'Sao chép'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Voucher 2: FREESHIP */}
              <View
                style={{
                  width: 250,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  justifyContent: 'space-between',
                }}
              >
                <View>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '800',
                      color: COLORS.gray[400],
                      letterSpacing: 0.5,
                    }}
                  >
                    DI CHUYỂN
                  </Text>
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: '900',
                      color: COLORS.gray[900],
                      marginTop: 4,
                    }}
                  >
                    0₫ phí đi lại
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: COLORS.gray[500],
                      marginTop: 4,
                      lineHeight: 16,
                    }}
                  >
                    Miễn phí di chuyển trong bán kính 5 km quanh {currentLocationName.split(',')[0]}.
                  </Text>
                </View>

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
                    FREESHIP
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => handleCopyVoucher('FREESHIP')}
                    style={{
                      backgroundColor: copiedVoucher === 'FREESHIP' ? '#DCFCE7' : '#F1F5F9',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: copiedVoucher === 'FREESHIP' ? COLORS.primary : COLORS.gray[700],
                      }}
                    >
                      {copiedVoucher === 'FREESHIP' ? 'Đã chép' : 'Sao chép'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
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

          {/* 3-Column Grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DEMO_SERVICES.map(svc => {
              const isCustom = svc.isCustom;

              return (
                <TouchableOpacity
                  key={svc.id}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (isCustom) {
                      router.push({
                        pathname: '/(customer)/booking',
                        params: { custom_service_name: 'Dịch vụ theo yêu cầu' },
                      });
                    } else {
                      const matched = services?.find(s => s.slug === svc.slug);
                      router.push({
                        pathname: '/(customer)/booking',
                        params: { service_id: matched?._id ?? '', service_slug: svc.slug },
                      });
                    }
                  }}
                  style={{
                    width: '31.5%',
                    backgroundColor: isCustom ? '#F0FDF4' : '#FFFFFF',
                    borderRadius: 14,
                    paddingVertical: 12,
                    paddingHorizontal: 8,
                    alignItems: 'center',
                    borderWidth: 1.5,
                    borderColor: isCustom ? COLORS.primary : '#F1F5F9',
                    position: 'relative',
                    minHeight: 105,
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
                      lineHeight: 14,
                    }}
                    numberOfLines={2}
                  >
                    {svc.name}
                  </Text>

                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '600',
                      color: isCustom ? '#15803D' : COLORS.gray[500],
                      textAlign: 'center',
                      marginTop: 4,
                    }}
                    numberOfLines={1}
                  >
                    {svc.price}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 2 Callout Cards: SOS & AI Assistant */}
          <View style={{ marginTop: 14, gap: 10 }}>
            {/* SOS Callout */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/sos')}
              style={{
                backgroundColor: '#FEF2F2',
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: '#FECACA',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#B91C1C' }}>
                SOS — cần người gấp?
              </Text>
              <Text style={{ fontSize: 12, color: '#7F1D1D', marginTop: 2, lineHeight: 16 }}>
                Thợ hủy phút chót hoặc việc khẩn trong ngày: phát tín hiệu SOS, thợ gần nhất nhận thay ngay.
              </Text>
            </TouchableOpacity>

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
                Mô tả bằng lời hoặc chụp ảnh ở thẻ AI phía trên — AI gợi ý đúng dịch vụ và ước tính giá.
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
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[800], marginBottom: 8 }}>
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
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[800], marginBottom: 8 }}>
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

            {/* 3. Ngày làm */}
            <View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Calendar size={16} color={COLORS.primary} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[800] }}>
                    {dayjs(quickDate).format('dddd, DD/MM/YYYY')}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>
                  Chọn ngày
                </Text>
              </View>

              {/* Day chips */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
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
                        paddingVertical: 8,
                        borderRadius: 10,
                        backgroundColor: isSel ? '#DCFCE7' : '#F1F5F9',
                        borderWidth: 1,
                        borderColor: isSel ? COLORS.primary : '#E2E8F0',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
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
            </View>

            {/* 4. Giờ bắt đầu */}
            <View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Clock size={16} color={COLORS.primary} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[800] }}>
                    {quickTimeSlot}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>
                  Chọn giờ
                </Text>
              </View>

              {/* 2 Rows of Time chips */}
              <View style={{ gap: 8 }}>
                {/* Row 1 */}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['07:00', '08:00', '09:00', '12:00', '14:00', '17:00'].map(t => {
                    const isSel = quickTimeSlot === t;
                    const isNew = t === '12:00';
                    return (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setQuickTimeSlot(t)}
                        style={{
                          flex: 1,
                          paddingVertical: 7,
                          borderRadius: 8,
                          backgroundColor: isSel ? '#DCFCE7' : '#F1F5F9',
                          borderWidth: 1,
                          borderColor: isSel ? COLORS.primary : '#E2E8F0',
                          alignItems: 'center',
                          position: 'relative',
                        }}
                      >
                        {isNew && (
                          <View
                            style={{
                              position: 'absolute',
                              top: -6,
                              right: -2,
                              backgroundColor: '#DCFCE7',
                              paddingHorizontal: 3,
                              borderRadius: 4,
                            }}
                          >
                            <Text style={{ fontSize: 8, fontWeight: '900', color: COLORS.primary }}>
                              MỚI
                            </Text>
                          </View>
                        )}
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color: isSel ? COLORS.primary : COLORS.gray[700],
                          }}
                        >
                          {t}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Row 2 */}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['18:00', '19:00', '20:00', '21:00', '22:00'].map(t => {
                    const isSel = quickTimeSlot === t;
                    const isNight = t === '22:00';
                    return (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setQuickTimeSlot(t)}
                        style={{
                          flex: 1,
                          paddingVertical: 7,
                          borderRadius: 8,
                          backgroundColor: isSel ? '#DCFCE7' : '#F1F5F9',
                          borderWidth: 1,
                          borderColor: isSel ? COLORS.primary : '#E2E8F0',
                          alignItems: 'center',
                          position: 'relative',
                        }}
                      >
                        {isNight && (
                          <View
                            style={{
                              position: 'absolute',
                              top: -6,
                              right: -2,
                              backgroundColor: '#FEF2F2',
                              paddingHorizontal: 3,
                              borderRadius: 4,
                            }}
                          >
                            <Text style={{ fontSize: 8, fontWeight: '900', color: COLORS.error }}>
                              ĐÊM
                            </Text>
                          </View>
                        )}
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color: isSel ? COLORS.primary : COLORS.gray[700],
                          }}
                        >
                          {t}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* 5. Thời lượng dự kiến */}
            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[800], marginBottom: 8 }}>
                Thời lượng dự kiến
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[
                  { dur: 1, label: '1 giờ' },
                  { dur: 2, label: '2 giờ' },
                  { dur: 3, label: '3 giờ' },
                  { dur: 4, label: '4 giờ' },
                  { dur: 5, label: 'Tùy chọn…' },
                ].map(d => {
                  const isSel = quickDuration === d.dur;
                  return (
                    <TouchableOpacity
                      key={d.label}
                      onPress={() => setQuickDuration(d.dur)}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 10,
                        backgroundColor: isSel ? '#DCFCE7' : '#F1F5F9',
                        borderWidth: 1,
                        borderColor: isSel ? COLORS.primary : '#E2E8F0',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11.5,
                          fontWeight: '700',
                          color: isSel ? COLORS.primary : COLORS.gray[700],
                        }}
                      >
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Dynamic Expected Schedule Preview Line */}
            <View
              style={{
                backgroundColor: '#F8FAFC',
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: '#E2E8F0',
              }}
            >
              <Text style={{ fontSize: 13, color: COLORS.gray[700], lineHeight: 18 }}>
                Lịch dự kiến:{' '}
                <Text style={{ fontWeight: '800', color: COLORS.primary }}>
                  {dayjs(quickDate).format('dddd, DD/MM')}, {quickTimeSlot} – {expectedEndTime}
                </Text>{' '}
                · thời lượng {quickDuration} giờ. Giá mở đầu để deal:{' '}
                <Text style={{ fontWeight: '800', color: COLORS.primary }}>
                  {new Intl.NumberFormat('vi-VN').format(Number(quickDealPrice) || 200000)}₫
                </Text>
                .
              </Text>
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
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>
                Đăng việc
              </Text>
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
            activeJobs.slice(0, 1).map((j: any) => (
              <TouchableOpacity
                key={j._id}
                activeOpacity={0.88}
                onPress={() => router.push({ pathname: '/job-detail/[id]', params: { id: j._id } })}
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
                  <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.gray[900], flex: 1 }}>
                    {j.title}
                  </Text>
                  <View
                    style={{
                      backgroundColor: '#FFEDD5',
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#C2410C' }}>
                      {j.status === 'in_progress'
                        ? 'Đang làm'
                        : j.status === 'confirmed'
                          ? 'Thợ đang đến'
                          : 'Đã nhận việc'}
                    </Text>
                  </View>
                </View>

                <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 4 }}>
                  Hôm nay · {j.preferred_time_start || '19:00'} · {j.address?.district || 'Quận 1'} · Thợ đã nhận đơn đang trên đường — theo dõi vị trí thợ trên bản đồ ở đầu trang.
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
                  {['Đã nhận việc', 'Đang đến', 'Đang làm', 'Nghiệm thu'].map((st, idx) => {
                    const isDone = idx <= 1;
                    return (
                      <View key={st} style={{ alignItems: 'center', gap: 4 }}>
                        <View
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 7,
                            backgroundColor: isDone ? COLORS.primary : '#E2E8F0',
                            borderWidth: 2,
                            borderColor: '#FFFFFF',
                          }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: isDone ? '700' : '500',
                            color: isDone ? COLORS.primary : COLORS.gray[400],
                          }}
                        >
                          {st}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </TouchableOpacity>
            ))
          ) : (
            /* Fallback Demo Active Job matching Demo PDF Page 8 */
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push('/(customer)/jobs')}
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
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.gray[900] }}>
                  Vệ sinh máy lạnh — 2 máy
                </Text>
                <View
                  style={{
                    backgroundColor: '#FFEDD5',
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#C2410C' }}>
                    Thợ đang đến
                  </Text>
                </View>
              </View>

              <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 4 }}>
                Hôm nay · 19:00 · {currentLocationName.split(',')[0]} · Thợ đã nhận đơn đang trên đường — theo dõi vị trí thợ trên bản đồ ở đầu trang.
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
                {[
                  { label: 'Đã nhận việc', active: true },
                  { label: 'Đang đến', active: true },
                  { label: 'Đang làm', active: false },
                  { label: 'Nghiệm thu', active: false },
                ].map(step => (
                  <View key={step.label} style={{ alignItems: 'center', gap: 4 }}>
                    <View
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: step.active ? COLORS.primary : '#CBD5E1',
                        borderWidth: 2,
                        borderColor: '#FFFFFF',
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: step.active ? '700' : '500',
                        color: step.active ? COLORS.primary : COLORS.gray[400],
                      }}
                    >
                      {step.label}
                    </Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Section: Đặt gần đây */}
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
                  {completedJobs[0]?.title || 'Dọn nhà 2 phòng ngủ'}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}>
                  Hoàn thành · tuần trước · 390.000₫
                </Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                const pastJob = completedJobs[0];
                router.push({
                  pathname: '/(customer)/booking',
                  params: {
                    prefill_title: pastJob?.title || 'Dọn nhà 2 phòng ngủ',
                    prefill_description: pastJob?.description || 'Dọn dẹp tổng thể 2 phòng ngủ, quét dọn và chùi sàn.',
                    service_id: pastJob?.service_id ? (pastJob.service_id as any)._id || String(pastJob.service_id) : '',
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
      </ScrollView>
    </View>
  );
}
