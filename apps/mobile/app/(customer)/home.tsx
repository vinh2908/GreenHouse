import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  formatDate,
  formatDateKey,
  formatDateKeyWithWeekday,
  formatTime,
  vnDateKey,
  vnNow,
} from '@/utils/date-format';
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
  Modal,
  ActivityIndicator,
} from 'react-native';
import { ScalePressable } from '@/components/common/scale-pressable';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
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
  Briefcase,
  LayoutGrid,
  Maximize2,
  X,
  Lightbulb,
  Star,
} from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { useTranslation } from '@/hooks/use-i18n';
import { I18nKey, formatCurrency } from '@/services/i18n';
import {
  useServices,
  useMyJobs,
  useUnreadCount,
  useMyProfile,
  useCreateJob,
  useNearbyHelpers,
  useMyVouchers,
  useRebroadcastJob,
} from '@/hooks/use-api';
import { locationService } from '@/services/location.service';
import { useMatchingSuggestionSocket } from '@/hooks/use-socket';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocationPicker, PickerCoords } from '@/components/common/location-picker';
import { OverdueJobBanner } from '@/components/common/overdue-job-banner';
import { isOverdueUnassigned } from '@/utils/job-overdue';
import { VerificationBanner } from '@/components/common/verification-banner';
import { Avatar, COLORS, ErrorState, Skeleton, useThemeColors } from '@/components/ui';
import { removeVietnameseDiacritics } from '@/utils/search';
import { nearbyHelperStatusLabel } from '@/utils/nearby-helper-status';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import 'dayjs/locale/en';

dayjs.extend(relativeTime);

import { SERVICES_CATALOG, ServiceItem } from './services';
import { buildServicePrefill } from '@/utils/service-prefill';
export { SERVICES_CATALOG, ServiceItem };
// ─── Thợ đang ở gần (Dữ liệu thật từ API) ──────────────────────────────────
interface NearbyHelperItem {
  id: string;
  name: string;
  shortName: string;
  phone?: string;
  avatar?: string;
  rating: number;
  totalReviews: number;
  completedJobs: number;
  distKm: number;
  distance: string;
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
  const tc = useThemeColors();
  const storedUser = useAuthStore(s => s.user);
  const isAuth = useAuthStore(s => s.isAuthenticated);
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
  const [currentLocationName, setCurrentLocationName] = useState('');
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
    const onLocationFailure = () => {
      setCurrentCoords(null);
      setCurrentLocationName('');
      Toast.show({
        type: 'info',
        text1: lang === 'en' ? 'Unable to retrieve location' : 'Không lấy được vị trí',
        text2:
          lang === 'en'
            ? 'Please check location permissions or select an area manually'
            : 'Vui lòng kiểm tra quyền vị trí hoặc chọn khu vực',
      });
      setLocationPickerOpen(true);
    };

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
        onLocationFailure();
      }
    } catch {
      onLocationFailure();
    } finally {
      setIsLocatingLive(false);
    }
  };

  // API Thợ gần & Vouchers thật
  const {
    data: nearbyRaw,
    refetch: refetchNearby,
    isLoading: nearbyLoading,
    isError: nearbyError,
    isRefetching: nearbyRefetching,
  } = useNearbyHelpers(currentCoords);
  // B116: có thợ mới phù hợp → cập nhật danh sách thợ gần đây ngay
  useMatchingSuggestionSocket();
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

  // Active Jobs Sheet & Full Map Modal states (R19)
  const [activeJobsSheetOpen, setActiveJobsSheetOpen] = useState(false);
  const [isFullMapOpen, setIsFullMapOpen] = useState(false);
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
        // Trạng thái thật từ API: findNearby chỉ trả thợ ONLINE (đang nhận việc).
        // Không hardcode "Đang rảnh" cho mọi thợ. Giữ MÃ trạng thái thô trong
        // dữ liệu; nhãn hiển thị map theo ngôn ngữ ở lúc render (R11/M2 —
        // nearbyHelperStatusLabel), tránh rò tiếng Việt ở chế độ tiếng Anh.
        const status = typeof h.status === 'string' ? h.status : '';
        return {
          id: String(h._id || idx),
          name: helperName,
          shortName,
          phone: h.user_id?.phone,
          avatar: h.user_id?.avatar,
          // Rating thật: 0 = chưa có đánh giá, không mặc định 5.0.
          rating: typeof h.rating === 'number' && h.rating > 0 ? h.rating : 0,
          totalReviews: h.total_reviews || 0,
          completedJobs: h.completed_jobs || 0,
          distKm,
          distance: distText,
          lat: coords[1],
          lon: coords[0],
          status,
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

  // Tọa độ gốc cho mini-map: chỉ trả về khi có vị trí thật, không mặc định Sài Gòn hay Đà Nẵng
  const mapCenter = useMemo(() => {
    if (currentCoords && currentCoords.latitude && currentCoords.longitude) {
      return { latitude: currentCoords.latitude, longitude: currentCoords.longitude };
    }
    return null;
  }, [currentCoords]);

  // Chuỗi ghim ổn định theo giá trị: refetch nearby tạo mảng mới nhưng cùng
  // nội dung thì HTML map không sinh lại, WebView/iframe không reload mất
  // thao tác kéo/zoom của khách (S13).
  const nearbyPinsJson = useMemo(
    () =>
      JSON.stringify(
        nearbyHelpers.map(h => ({
          id: h.id,
          name: h.name, // Hiển thị đầy đủ TÊN THỢ khi chọn
          lat: h.lat,
          lon: h.lon,
        })),
      ),
    [nearbyHelpers],
  );

  // Sinh HTML Goong bản đồ mini với ghim gọn, tương tác kéo/zoom/chọn thợ không reload
  // R11 (L11): tên biến cũ gây hiểu lầm — HTML này dùng MapLibre + Goong,
  // không phải Leaflet. Đổi tên cho đúng bản đồ đang dùng.
  const goongMiniMapHtml = useMemo(() => {
    if (!mapCenter) return '';
    const pinsJson = nearbyPinsJson;

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
  }, [mapCenter, nearbyPinsJson, selectedHelperId, lang, t]);

  // Lời chào theo thời gian trong ngày (khuya / sáng / chiều / tối)
  const greeting = useMemo(() => {
    const hour = vnNow().hour();
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
    if (!geo) return t('home_location_unclear');
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
    return t('home_location_unclear');
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
            setCurrentLocationName('');
            setCurrentCoords(null);
          })
          .catch(() => {
            setCurrentLocationName('');
            setCurrentCoords(null);
          });
      })
      .catch(() => {
        setCurrentLocationName('');
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
      text1: lang === 'en' ? `Voucher code ${code} copied!` : `Đã sao chép mã ${code}!`,
      text2:
        lang === 'en'
          ? 'Code will be applied automatically when booking.'
          : 'Mã sẽ tự động điền khi bạn tạo đơn dịch vụ.',
    });
    setTimeout(() => setCopiedVoucher(null), 3000);
  };

  const activeJobs =
    recentJobs?.filter(
      (j: { status: string }) =>
        !['completed', 'cancelled', 'refunded', 'disputed', 'expired', 'draft'].includes(j.status),
    ) ?? [];

  // R7 item 3: đơn quá giờ hẹn chưa có thợ đầu tiên (nếu có) — banner ở home.
  const overdueJob = activeJobs.find((j: any) => isOverdueUnassigned(j));
  const rebroadcastJob = useRebroadcastJob();
  const [rebroadcastingId, setRebroadcastingId] = useState<string | null>(null);

  const handleHomeRebroadcast = async (jobId: string) => {
    if (rebroadcastJob.isPending) return;
    setRebroadcastingId(jobId);
    try {
      await rebroadcastJob.mutateAsync(jobId);
      Toast.show({ type: 'success', text1: t('overdue_rebroadcast_sent') });
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      Toast.show({
        type: 'error',
        text1: typeof msg === 'string' && msg ? msg : t('overdue_rebroadcast_cooldown'),
      });
    } finally {
      setRebroadcastingId(null);
    }
  };

  const completedJobs =
    recentJobs?.filter((j: { status: string }) => j.status === 'completed') ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
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
        contentContainerStyle={{
          paddingBottom: 130,
          maxWidth: 680,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        {/* P0-7: banner xác minh email khi tài khoản chưa xác minh */}
        <VerificationBanner />

        {/* ── 1. HEADER (Top Bar - Mint Gradient #E7FBF1 -> #F2FBF6 -> #F6F8F7) ─ */}
        <View
          style={{
            position: 'relative',
            paddingHorizontal: 16,
            paddingTop: Math.max(insets.top + 8, 20),
            paddingBottom: 20,
            borderBottomWidth: 1,
            borderBottomColor: tc.border,
            backgroundColor: tc.background,
            overflow: 'hidden',
          }}
        >
          {/* Header Gradient Background */}
          <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgLinearGradient id="headerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor={tc.isDark ? '#064E3B' : '#E7FBF1'} />
                <Stop offset="50%" stopColor={tc.isDark ? '#0F172A' : '#F2FBF6'} />
                <Stop offset="100%" stopColor={tc.isDark ? tc.background : '#F6F8F7'} />
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
                backgroundColor: tc.surface,
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: 9999,
                gap: 6,
                maxWidth: '65%',
                borderWidth: 1,
                borderColor: tc.border,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 2,
                elevation: 1,
              }}
            >
              <MapPin size={14} color={tc.isDark ? '#34D399' : '#047857'} />
              <Text
                style={{
                  fontSize: fs(12.5),
                  fontWeight: '700',
                  color: tc.text,
                }}
                numberOfLines={1}
              >
                {currentCoords
                  ? !currentLocationName || currentLocationName === 'Chưa xác định vị trí'
                    ? lang === 'en'
                      ? 'No location'
                      : 'Chưa định vị'
                    : currentLocationName
                  : lang === 'en'
                    ? 'No location'
                    : 'Chưa định vị'}
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
                  backgroundColor: tc.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: tc.border,
                  position: 'relative',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.04,
                  shadowRadius: 2,
                  elevation: 1,
                }}
              >
                <Bell size={18} color={tc.textSecondary} />
                {!!unread && unread > 0 && (
                  <View
                    style={{
                      position: 'absolute',
                      top: 7,
                      right: 7,
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: '#EF4444',
                      borderWidth: 1.5,
                      borderColor: tc.surface,
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
                  backgroundColor: tc.isDark ? '#064E3B' : '#ECFDF5',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: tc.isDark ? '#059669' : '#A7F3D0',
                }}
              >
                <Text
                  style={{
                    fontSize: fs(15),
                    fontWeight: '800',
                    color: tc.isDark ? '#34D399' : '#047857',
                  }}
                >
                  {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'V'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Greeting: Chào <tên>, buổi sáng/chiều/tối/khuya rồi */}
          <Text
            style={{
              fontSize: fs(21),
              fontWeight: '700',
              color: tc.text,
              letterSpacing: -0.2,
            }}
          >
            {greeting.title}
          </Text>
          <Text
            style={{
              fontSize: fs(12.5),
              color: tc.textMuted,
              marginTop: 4,
              fontWeight: '500',
            }}
          >
            {lang === 'en'
              ? 'What do you need help with today?'
              : 'Hôm nay bạn cần hỗ trợ việc gì?'}
          </Text>

          {/* Search bar */}
          <View
            style={{
              backgroundColor: tc.surface,
              borderRadius: 20,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 14,
              paddingRight: 6,
              marginTop: 16,
              height: 48,
              borderWidth: 1,
              borderColor: tc.border,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.04,
              shadowRadius: 4,
              elevation: 2,
            }}
          >
            <Search size={18} color={tc.textMuted} />
            <TextInput
              style={{
                flex: 1,
                paddingVertical: Platform.OS === 'ios' ? 12 : 10,
                fontSize: fs(13),
                color: tc.text,
                fontWeight: '500',
                paddingHorizontal: 8,
              }}
              numberOfLines={1}
              multiline={false}
              placeholder={
                lang === 'en'
                  ? 'Find electricians, cleaners, AC repair...'
                  : 'Tìm thợ sửa điện, dọn nhà, máy lạnh...'
              }
              placeholderTextColor="#94A3B8"
              value={serviceSearchQuery}
              onChangeText={setServiceSearchQuery}
              onSubmitEditing={() => {
                if (serviceSearchQuery.trim()) {
                  router.push({
                    pathname: '/(customer)/services',
                    params: { q: serviceSearchQuery.trim() },
                  });
                } else {
                  router.push('/(customer)/services');
                }
              }}
              returnKeyType="search"
            />
            {serviceSearchQuery.trim().length > 0 && (
              <TouchableOpacity
                onPress={() => setServiceSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ marginRight: 6 }}
              >
                <X size={15} color="#94A3B8" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleTakeIssuePhoto}
              style={{
                backgroundColor: '#ECFDF5',
                width: 36,
                height: 36,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Camera size={17} color="#059669" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 2. ĐƠN ĐANG THỰC HIỆN (Ẩn hoàn toàn khi không có đơn) ─ */}
        {activeJobs.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
            {/* Banner đơn quá giờ nếu có */}
            {overdueJob && (
              <View style={{ marginBottom: 12 }}>
                <OverdueJobBanner
                  timeLabel={`${overdueJob.preferred_time_start ?? ''} · ${overdueJob.preferred_date ? formatDate(overdueJob.preferred_date, lang) : ''}`}
                  onReschedule={() =>
                    router.push({
                      pathname: '/job-detail/[id]',
                      params: { id: overdueJob._id, focus: 'edit' },
                    })
                  }
                  onRebroadcast={() => handleHomeRebroadcast(overdueJob._id)}
                  onCancel={() =>
                    router.push({ pathname: '/job-detail/[id]', params: { id: overdueJob._id } })
                  }
                  rebroadcasting={rebroadcastingId === overdueJob._id}
                />
              </View>
            )}

            {(() => {
              const j = activeJobs[0];
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
                { label: t('home_timeline_confirmed') || 'Đã nhận việc', active: step1Done },
                { label: t('home_timeline_arriving') || 'Đang đến', active: step2Done },
                { label: t('home_timeline_working') || 'Đang làm', active: step3Done },
                { label: t('home_timeline_review') || 'Nghiệm thu', active: step4Done },
              ];

              let statusBadgeText = t('status_open');
              if (j.status === 'open' || j.status === 'pending') {
                statusBadgeText = t('status_open');
              } else if (j.status === 'receiving_quotes' || j.status === 'bidding') {
                statusBadgeText = t('status_receiving_quotes');
              } else if (j.status === 'quote_selected') {
                statusBadgeText =
                  lang === 'en' ? 'Waiting Helper Confirmation' : 'Chờ thợ xác nhận';
              } else if (j.status === 'confirmed') {
                statusBadgeText = t('status_confirmed');
              } else if (j.status === 'helper_on_the_way' || j.status === 'on_the_way') {
                statusBadgeText = t('status_helper_on_the_way');
              } else if (j.status === 'helper_arrived') {
                statusBadgeText = t('status_helper_arrived');
              } else if (j.status === 'in_progress') {
                statusBadgeText = t('status_in_progress');
              } else if (j.status === 'pending_review') {
                statusBadgeText = t('status_pending_review');
              } else if (j.status === 'completed') {
                statusBadgeText = t('status_completed');
              } else {
                statusBadgeText = t('home_status_processing');
              }

              const rawJobDate = j.preferred_date || j.scheduled_at;
              const displayDate = rawJobDate ? formatDate(rawJobDate, lang) : '—';
              const displayTime =
                j.preferred_time_start ||
                (j.scheduled_at ? formatTime(dayjs(j.scheduled_at)) : '—');
              const displayDistrict =
                j.address?.district ||
                j.address?.city ||
                (lang === 'en' ? 'Location TBD' : 'Chưa rõ địa điểm');

              return (
                <TouchableOpacity
                  key={j._id}
                  activeOpacity={0.88}
                  onPress={() =>
                    router.push({ pathname: '/job-detail/[id]', params: { id: j._id } })
                  }
                  style={{
                    backgroundColor: tc.surface,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: tc.border,
                    borderLeftWidth: 3.5,
                    borderLeftColor: '#10B981',
                    padding: 14,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.04,
                    shadowRadius: 6,
                    elevation: 2,
                  }}
                >
                  {/* Top row: service name + status chip + link Xem tất cả */}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Text
                        style={{
                          fontSize: fs(14),
                          fontWeight: '600',
                          color: tc.text,
                          flexShrink: 1,
                        }}
                        numberOfLines={1}
                      >
                        {j.title}
                      </Text>
                      <View
                        style={{
                          backgroundColor: tc.isDark ? '#064E3B' : '#ECFDF5',
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: fs(10.5),
                            fontWeight: '700',
                            color: tc.isDark ? '#34D399' : '#047857',
                          }}
                        >
                          {statusBadgeText}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setActiveJobsSheetOpen(true)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text
                        style={{
                          fontSize: fs(11.5),
                          fontWeight: '700',
                          color: tc.isDark ? '#34D399' : '#059669',
                        }}
                      >
                        {`${lang === 'en' ? 'View all' : 'Xem tất cả'} (${activeJobs.length})`}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Meta: ngày · giờ · quận */}
                  <Text style={{ fontSize: fs(11.5), color: tc.textMuted, marginTop: 4 }}>
                    {displayDate} · {displayTime} · {displayDistrict}
                  </Text>

                  {/* 4-step Progress Bar */}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 12,
                      paddingTop: 10,
                      borderTopWidth: 1,
                      borderTopColor: tc.border,
                    }}
                  >
                    {timelineSteps.map(st => (
                      <View key={st.label} style={{ alignItems: 'center', gap: 4, flex: 1 }}>
                        <View
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 7,
                            backgroundColor: st.active ? '#10B981' : tc.subtle,
                            borderWidth: 2,
                            borderColor: tc.surface,
                          }}
                        />
                        <Text
                          style={{
                            fontSize: fs(10),
                            fontWeight: st.active ? '700' : '500',
                            color: st.active
                              ? tc.isDark
                                ? '#34D399'
                                : '#047857'
                              : tc.textMuted,
                            textAlign: 'center',
                          }}
                          numberOfLines={1}
                        >
                          {st.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })()}
          </View>
        )}

        {/* ── 3. DỊCH VỤ (7 Dịch vụ + 1 Ô "Tất cả" [+5 Badge]) ───────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          {/* Header row: Dịch vụ + Xem 12 dịch vụ */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: fs(15.5), fontWeight: '700', color: tc.text }}>
              {t('home_all_services_title') || 'Dịch vụ'}
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/(customer)/services')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
            >
              <Text
                style={{
                  fontSize: fs(12.5),
                  fontWeight: '700',
                  color: tc.isDark ? '#34D399' : '#059669',
                }}
              >
                {lang === 'en' ? 'View all 12 services' : 'Xem 12 dịch vụ'}
              </Text>
              <ChevronRight size={14} color={tc.isDark ? '#34D399' : '#059669'} />
            </TouchableOpacity>
          </View>

          {/* 4-Column Grid Card */}
          <View
            style={{
              backgroundColor: tc.surface,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: tc.border,
              padding: 14,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.03,
              shadowRadius: 6,
              elevation: 1,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                rowGap: 14,
              }}
            >
              {/* 7 Services */}
              {[
                {
                  slug: 'housekeeping_hourly',
                  name: 'Giúp việc',
                  nameKey: 'svc_housekeeping_hourly',
                  icon: Sparkles,
                  bg: '#ECFDF5',
                  color: '#047857',
                },
                {
                  slug: 'deep_cleaning',
                  name: 'Dọn nhà',
                  nameKey: 'svc_house_cleaning',
                  icon: Home,
                  bg: '#F0FDFA',
                  color: '#0F766E',
                },
                {
                  slug: 'electrician',
                  name: 'Sửa điện',
                  nameKey: 'svc_electrician',
                  icon: Zap,
                  bg: '#FFFBEB',
                  color: '#B45309',
                },
                {
                  slug: 'ac_repair',
                  name: 'Máy lạnh',
                  nameKey: 'svc_ac_repair',
                  icon: Wind,
                  bg: '#F0F9FF',
                  color: '#0369A1',
                },
                {
                  slug: 'plumber',
                  name: 'Ống nước',
                  nameKey: 'svc_plumbing',
                  icon: Wrench,
                  bg: '#EFF6FF',
                  color: '#1D4ED8',
                },
                {
                  slug: 'cooking',
                  name: 'Nấu ăn',
                  nameKey: 'svc_cooking',
                  icon: UtensilsCrossed,
                  bg: '#FFF7ED',
                  color: '#C2410C',
                },
                {
                  slug: 'handyman',
                  name: 'Bốc hàng',
                  nameKey: 'svc_handyman',
                  icon: Truck,
                  bg: '#F5F3FF',
                  color: '#6D28D9',
                },
              ].map(item => {
                const matched = services?.find(
                  s =>
                    s.slug === item.slug ||
                    (item.slug === 'plumber' && s.slug === 'plumbing') ||
                    (item.slug === 'deep_cleaning' && s.slug === 'house_cleaning'),
                );
                return (
                  <ScalePressable
                    key={item.slug}
                    onPress={() => {
                      const displayName = t(item.nameKey as any) || item.name;
                      if (matched) {
                        const prefill = buildServicePrefill({
                          slug: matched.slug,
                          name: matched.name || displayName,
                          apiDescription: matched.description,
                          lang,
                        });
                        router.push({
                          pathname: '/(customer)/booking',
                          params: {
                            service_id: matched._id,
                            service_slug: matched.slug,
                            prefill_title: prefill.title,
                            prefill_description: prefill.description,
                          },
                        });
                      } else {
                        const prefill = buildServicePrefill({
                          slug: item.slug,
                          customServiceName: displayName,
                          lang,
                        });
                        router.push({
                          pathname: '/(customer)/booking',
                          params: {
                            custom_service_name: displayName,
                            prefill_title: prefill.title,
                            prefill_description: prefill.description,
                          },
                        });
                      }
                    }}
                    style={{
                      width: '23%',
                      alignItems: 'center',
                    }}
                  >
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 16,
                        backgroundColor: tc.isDark ? `${item.color}22` : item.bg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 6,
                      }}
                    >
                      {React.createElement(item.icon, {
                        size: 22,
                        color: item.color,
                      })}
                    </View>
                    <Text
                      style={{
                        fontSize: fs(11.5),
                        fontWeight: '600',
                        color: tc.text,
                        textAlign: 'center',
                        lineHeight: 15,
                      }}
                      numberOfLines={1}
                    >
                      {t(item.nameKey as any) || item.name}
                    </Text>
                  </ScalePressable>
                );
              })}

              {/* Ô thứ 8: Tất cả */}
              <ScalePressable
                onPress={() => router.push('/(customer)/services')}
                style={{
                  width: '23%',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    backgroundColor: tc.subtle,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 6,
                    position: 'relative',
                  }}
                >
                  <LayoutGrid size={22} color={tc.textSecondary} />
                  {/* Badge +5 */}
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      backgroundColor: tc.isDark ? '#064E3B' : '#ECFDF5',
                      borderWidth: 1,
                      borderColor: tc.isDark ? '#059669' : '#86EFAC',
                      borderRadius: 8,
                      paddingHorizontal: 4,
                      paddingVertical: 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 9.5,
                        fontWeight: '800',
                        color: tc.isDark ? '#34D399' : '#059669',
                      }}
                    >
                      +5
                    </Text>
                  </View>
                </View>
                <Text
                  style={{
                    fontSize: fs(11.5),
                    fontWeight: '600',
                    color: tc.text,
                    textAlign: 'center',
                    lineHeight: 15,
                  }}
                  numberOfLines={1}
                >
                  {lang === 'en' ? 'All' : 'Tất cả'}
                </Text>
              </ScalePressable>
            </View>
          </View>
        </View>

        {/* ── 4. AI QUÉT ẢNH SỰ CỐ + SOS ──────────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          {/* Vibrant AI Scanner Card */}
          <View
            style={{
              backgroundColor: '#16A34A',
              borderRadius: 14,
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
                borderRadius: 14,
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
                backgroundColor: tc.surface,
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

          {/* SOS Callout */}
          <View style={{ marginTop: 12 }}>
            <ScalePressable
              onPress={() => router.push('/sos')}
              style={{
                backgroundColor: '#DC2626',
                borderRadius: 14,
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
                      borderRadius: 14,
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
                    backgroundColor: tc.surface,
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: fs(10), fontWeight: '900', color: '#DC2626' }}>
                    {t('home_sos_callout_urgent')}
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  fontSize: fs(12),
                  color: '#FEE2E2',
                  marginTop: 6,
                  lineHeight: Math.round(fs(17)),
                }}
              >
                {t('home_sos_callout_desc')}
              </Text>
            </ScalePressable>
          </View>
        </View>

        {/* ── 5. THỢ ĐANG Ở GẦN BẠN (Item 6) ──────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          {/* Section Header: Tiêu đề + nút Xem bản đồ */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: fs(15.5), fontWeight: '700', color: tc.text }}>
              {lang === 'en' ? 'Nearby Helpers' : 'Thợ ở gần bạn'}
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setIsFullMapOpen(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: '#10B981',
                }}
              />
              <Text
                style={{
                  fontSize: fs(12.5),
                  fontWeight: '700',
                  color: tc.isDark ? '#34D399' : '#059669',
                }}
              >
                {lang === 'en' ? 'View Map' : 'Xem bản đồ'}
              </Text>
              <Maximize2 size={13} color={tc.isDark ? '#34D399' : '#059669'} />
            </TouchableOpacity>
          </View>

          {/* Interactive Mini Map */}
          <View
            style={{
              height: 158,
              borderRadius: 20,
              overflow: 'hidden',
              backgroundColor: tc.surface,
              borderWidth: 1,
              borderColor: tc.border,
              position: 'relative',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.03,
              shadowRadius: 6,
              elevation: 1,
            }}
          >
            {currentCoords && mapCenter ? (
              <>
                {Platform.OS === 'web' ? (
                  <iframe
                    ref={mapIframeRef}
                    srcDoc={goongMiniMapHtml}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title="Goong Mini Map"
                    sandbox="allow-scripts allow-same-origin"
                  />
                ) : (
                  <WebView
                    ref={mapWebViewRef}
                    originWhitelist={['*']}
                    source={{ html: goongMiniMapHtml }}
                    scrollEnabled={false}
                    style={{ flex: 1, backgroundColor: tc.surface }}
                    onMessage={event => {
                      try {
                        const data = JSON.parse(event.nativeEvent.data);
                        if (data?.type === 'SELECT_HELPER' && data.id) {
                          setSelectedHelperId(data.id);
                        }
                      } catch {}
                    }}
                  />
                )}
                {/* Pill button: Xem toàn bản đồ ở góc dưới-phải */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setIsFullMapOpen(true)}
                  style={{
                    position: 'absolute',
                    bottom: 10,
                    right: 10,
                    backgroundColor: 'rgba(15, 23, 42, 0.90)',
                    borderRadius: 9999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <MapPin size={12} color="#FFFFFF" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>
                    {lang === 'en' ? 'Full Map' : 'Xem toàn bản đồ'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 20,
                  backgroundColor: tc.surface,
                  gap: 8,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    backgroundColor: tc.isDark ? '#451A03' : '#FEF3C7',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MapPin size={20} color="#D97706" />
                </View>
                <Text
                  style={{
                    fontSize: fs(13.5),
                    fontWeight: '700',
                    color: tc.text,
                    textAlign: 'center',
                  }}
                >
                  {t('home_location_unidentified')}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                  <TouchableOpacity
                    onPress={handleRequestLiveLocation}
                    disabled={isLocatingLive}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: '#059669',
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 9999,
                    }}
                  >
                    {isLocatingLive ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Navigation size={12} color="#fff" />
                    )}
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: fs(11) }}>
                      {isLocatingLive ? t('home_locating') : t('home_get_location_btn')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setLocationPickerOpen(true)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: tc.subtle,
                      borderWidth: 1,
                      borderColor: tc.border,
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 9999,
                    }}
                  >
                    <MapPin size={12} color={tc.textSecondary} />
                    <Text style={{ color: tc.textSecondary, fontWeight: '700', fontSize: fs(11) }}>
                      {t('home_select_manual')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Horizontal scroll of helper cards (~212px wide each) */}
          {nearbyLoading ? (
            <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
              {[1, 2].map(i => (
                <Skeleton key={i} width={212} height={120} radius={16} />
              ))}
            </View>
          ) : nearbyError ? (
            <View style={{ marginTop: 12 }}>
              <ErrorState
                title={
                  lang === 'en' ? 'Unable to load nearby helpers' : 'Không thể tải thợ gần bạn'
                }
                subtitle={
                  lang === 'en'
                    ? 'Please check your connection and retry.'
                    : 'Vui lòng kiểm tra kết nối mạng và thử lại.'
                }
                onRetry={() => refetchNearby()}
              />
            </View>
          ) : nearbyHelpers.length === 0 ? (
            <View
              style={{
                marginTop: 12,
                backgroundColor: tc.surface,
                borderRadius: 16,
                paddingVertical: 18,
                paddingHorizontal: 16,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: tc.border,
              }}
            >
              <Users size={22} color={tc.textMuted} />
              <Text
                style={{
                  fontSize: fs(13),
                  fontWeight: '600',
                  color: tc.textMuted,
                  marginTop: 6,
                  textAlign: 'center',
                }}
              >
                {!currentCoords ? t('home_no_location_helpers') : t('home_no_helpers_online')}
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingVertical: 12 }}
            >
              {nearbyHelpers.map(helper => {
                const isSelected = helper.id === selectedHelperId;
                return (
                  <TouchableOpacity
                    key={helper.id}
                    activeOpacity={0.85}
                    onPress={() => {
                      setSelectedHelperId(helper.id);
                      router.push({
                        pathname: '/helper-profile/[id]',
                        params: { id: helper.id },
                      });
                    }}
                    style={{
                      width: 212,
                      backgroundColor: tc.surface,
                      borderRadius: 16,
                      padding: 14,
                      borderWidth: 1.5,
                      borderColor: isSelected ? '#10B981' : tc.border,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.03,
                      shadowRadius: 4,
                      elevation: 1,
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: tc.isDark ? '#0C4A6E' : '#E0F2FE',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: fs(14),
                            fontWeight: '800',
                            color: tc.isDark ? '#38BDF8' : '#0369A1',
                          }}
                        >
                          {helper.name.charAt(0)}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: fs(13.5),
                            fontWeight: '700',
                            color: tc.text,
                          }}
                          numberOfLines={1}
                        >
                          {helper.name}
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 3,
                            marginTop: 2,
                          }}
                        >
                          {helper.rating > 0 ? (
                            <>
                              <Star size={11} color="#F59E0B" fill="#F59E0B" />
                              <Text style={{ fontSize: fs(11), color: '#64748B' }}>
                                {helper.rating.toFixed(1)} ({helper.completedJobs})
                              </Text>
                            </>
                          ) : (
                            <Text style={{ fontSize: fs(11), color: '#64748B' }}>
                              {helper.completedJobs > 0
                                ? t('home_jobs_count', { count: helper.completedJobs })
                                : t('home_new_helper')}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>

                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 12,
                        paddingTop: 8,
                        borderTopWidth: 1,
                        borderTopColor: tc.border,
                      }}
                    >
                      <Text style={{ fontSize: fs(11.5), fontWeight: '600', color: tc.textMuted }}>
                        {helper.distance}
                      </Text>

                      <TouchableOpacity
                        activeOpacity={0.8}
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
                          backgroundColor: '#059669',
                          paddingHorizontal: 12,
                          paddingVertical: 5,
                          borderRadius: 9999,
                        }}
                      >
                        <Text style={{ fontSize: fs(11), fontWeight: '700', color: '#FFFFFF' }}>
                          {lang === 'en' ? 'Book' : 'Đặt ngay'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* ── 6. VOUCHER CAROUSEL ─────────────────────────────────────────── */}
        {/* ── 4. VOUCHER CAROUSEL (Dữ liệu thật từ hệ thống + Tự chạy) ──── */}
        <View style={{ marginTop: 24 }}>
          <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
            <Text
              style={{
                fontSize: fs(18),
                fontWeight: '800',
                color: tc.text,
              }}
            >
              {t('home_vouchers_title')}
            </Text>
          </View>

          {vouchers.length === 0 ? (
            <View
              style={{
                marginHorizontal: 16,
                backgroundColor: tc.surface,
                borderRadius: 14,
                padding: 20,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: tc.border,
              }}
            >
              <Tag size={24} color={tc.textMuted} />
              <Text
                style={{
                  fontSize: fs(14),
                  fontWeight: '700',
                  color: tc.textSecondary,
                  marginTop: 6,
                }}
              >
                {t('voucher_empty_title')}
              </Text>
              <Text style={{ fontSize: fs(12), color: tc.textMuted, marginTop: 2 }}>
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
                        ? `${formatCurrency(v.discount_value, 'en')}₫ OFF`
                        : `Giảm ${formatCurrency(v.discount_value, 'vi')}₫`;
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
                        backgroundColor: tc.surface,
                        borderRadius: 14,
                        padding: 16,
                        borderWidth: 1,
                        borderColor: tc.border,
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
                            color: tc.text,
                            marginTop: 6,
                          }}
                        >
                          {discountDisplay}
                        </Text>
                        <Text
                          style={{
                            fontSize: fs(12),
                            color: tc.textSecondary,
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
                          borderTopColor: tc.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: fs(14),
                            fontWeight: '800',
                            color: tc.text,
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
                        borderRadius: 8,
                        backgroundColor: i === activeVoucherIdx ? COLORS.primary : '#CBD5E1',
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── 7. QUYỀN LỢI & CAM KẾT ──────────────────────────────────────── */}
        {/* ── 7. QUYỀN LỢI & CAM KẾT (3 Thẻ Chuẩn Demo) ──────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
          <Text
            style={{
              fontSize: fs(18),
              fontWeight: '800',
              color: tc.text,
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
                backgroundColor: tc.surface,
                borderRadius: 14,
                padding: 12,
                borderWidth: 1,
                borderColor: tc.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldCheck size={22} color={COLORS.primary} />
              <Text
                style={{
                  fontSize: fs(12),
                  fontWeight: '800',
                  color: tc.text,
                  marginTop: 6,
                  textAlign: 'center',
                }}
              >
                {t('home_benefit_verified')}
              </Text>
              <Text
                style={{
                  fontSize: fs(10),
                  color: tc.textMuted,
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
                backgroundColor: tc.surface,
                borderRadius: 14,
                padding: 12,
                borderWidth: 1,
                borderColor: tc.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle2 size={22} color={COLORS.primary} />
              <Text
                style={{
                  fontSize: fs(12),
                  fontWeight: '800',
                  color: tc.text,
                  marginTop: 6,
                  textAlign: 'center',
                }}
              >
                {t('home_benefit_insurance')}
              </Text>
              <Text
                style={{
                  fontSize: fs(10),
                  color: tc.textMuted,
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
                backgroundColor: tc.surface,
                borderRadius: 14,
                padding: 12,
                borderWidth: 1,
                borderColor: tc.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Lock size={22} color={COLORS.primary} />
              <Text
                style={{
                  fontSize: fs(12),
                  fontWeight: '800',
                  color: tc.text,
                  marginTop: 6,
                  textAlign: 'center',
                }}
              >
                {t('home_benefit_escrow')}
              </Text>
              <Text
                style={{
                  fontSize: fs(10),
                  color: tc.textMuted,
                  marginTop: 2,
                  textAlign: 'center',
                }}
              >
                {t('home_benefit_escrow_sub')}
              </Text>
            </View>
          </View>
        </View>

        {/* ── 8. ĐẶT GẦN ĐÂY (Chỉ hiển thị khi có đơn đã hoàn thành thật) ─ */}
        {/* Section: Đặt gần đây - Chỉ hiển thị khi có đơn đã hoàn thành thật (Không dùng mock - Item 4) */}
        {completedJobs.length > 0 &&
          (() => {
            const pastJob = completedJobs[0];
            const pastPrice = pastJob.final_price || pastJob.agreed_price || pastJob.target_price;
            const displayPriceStr = pastPrice ? `${formatCurrency(pastPrice, lang)}₫` : '';
            const completedDateStr = formatDate(
              dayjs(pastJob.completed_at || pastJob.updated_at || pastJob.created_at),
              lang,
            );
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
                  <Text style={{ fontSize: fs(18), fontWeight: '800', color: tc.text }}>
                    {t('home_recent_title')}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => router.push('/(customer)/jobs')}
                  >
                    <Text style={{ fontSize: fs(13), fontWeight: '700', color: COLORS.primary }}>
                      {t('home_view_history')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Past job with 1-click [Đặt lại] button */}
                <View
                  style={{
                    backgroundColor: tc.surface,
                    borderRadius: 14,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: tc.border,
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
                        borderRadius: 14,
                        backgroundColor: tc.isDark ? '#064E3B' : '#DCFCE7',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Home size={22} color={COLORS.primary} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ fontSize: fs(15), fontWeight: '800', color: tc.text }}
                        numberOfLines={1}
                      >
                        {pastJob.title}
                      </Text>
                      <Text style={{ fontSize: fs(12), color: tc.textMuted, marginTop: 2 }}>
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
                      backgroundColor: tc.surface,
                      borderWidth: 1.5,
                      borderColor: COLORS.primary,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 14,
                    }}
                  >
                    <Text style={{ fontSize: fs(13), fontWeight: '800', color: COLORS.primary }}>
                      {t('home_rebook_btn')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
      </ScrollView>

      {/* ── Bong bóng nổi: Đơn đang làm (Item 7) ── */}
      {activeJobs.length > 0 &&
        (() => {
          const bubbleRight =
            windowWidth > 780 ? Math.max(16, Math.floor((windowWidth - 680) / 2) - 64) : 16;
          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveJobsSheetOpen(true)}
              style={{
                position: 'absolute',
                bottom:
                  Platform.OS === 'web'
                    ? (`calc(84px + env(safe-area-inset-bottom, 0px))` as any)
                    : Math.max(88, insets.bottom + 72),
                right: bubbleRight,
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: tc.isDark ? '#1E293B' : '#0F172A',
                borderWidth: 3,
                borderColor: tc.surface,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
                elevation: 6,
                zIndex: 1000,
              }}
            >
              <Briefcase size={19} color="#34D399" />
              <View
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  backgroundColor: '#10B981',
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: tc.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>
                  {activeJobs.length}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })()}

      {/* ── Sheet danh sách đơn đang làm (Item 7) ── */}
      <Modal
        visible={activeJobsSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveJobsSheetOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setActiveJobsSheetOpen(false)} />
          <View
            style={{
              backgroundColor: tc.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 18,
              paddingTop: 18,
              paddingBottom: Math.max(insets.bottom + 16, 24),
              maxHeight: '80%',
            }}
          >
            {/* Drag handle */}
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: tc.border,
                alignSelf: 'center',
                marginBottom: 14,
              }}
            />

            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 14,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: tc.text }}>
                  {lang === 'en' ? 'Active Orders' : 'Đơn đang thực hiện'}
                </Text>
                <Text style={{ fontSize: 12, color: tc.textMuted, marginTop: 2 }}>
                  {activeJobs.length}{' '}
                  {lang === 'en'
                    ? 'orders in progress · Tap each order to view progress'
                    : 'đơn đang xử lý · Bấm vào từng đơn để theo dõi'}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setActiveJobsSheetOpen(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: tc.subtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} color={tc.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Job cards list */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {activeJobs.map((j: any) => {
                let statusBadgeText = t('status_open');
                let helperStatusText = lang === 'en' ? 'Finding helper' : 'Đang tìm thợ';
                if (j.status === 'open' || j.status === 'pending') {
                  statusBadgeText = t('status_open');
                  helperStatusText = lang === 'en' ? 'Finding helper' : 'Đang tìm thợ';
                } else if (j.status === 'receiving_quotes' || j.status === 'bidding') {
                  statusBadgeText = t('status_receiving_quotes');
                  helperStatusText = lang === 'en' ? 'Receiving quotes' : 'Đang nhận báo giá';
                } else if (j.status === 'quote_selected') {
                  statusBadgeText =
                    lang === 'en' ? 'Waiting Helper Confirmation' : 'Chờ thợ xác nhận';
                  helperStatusText =
                    lang === 'en' ? 'Waiting confirmation' : 'Chờ thợ xác nhận';
                } else if (j.status === 'confirmed') {
                  statusBadgeText = t('status_confirmed');
                  helperStatusText = lang === 'en' ? 'Accepted' : 'Đã nhận đơn';
                } else if (j.status === 'helper_on_the_way' || j.status === 'on_the_way') {
                  statusBadgeText = t('status_helper_on_the_way');
                  helperStatusText = lang === 'en' ? 'On the way' : 'Đang đến';
                } else if (j.status === 'helper_arrived') {
                  statusBadgeText = t('status_helper_arrived');
                  helperStatusText = lang === 'en' ? 'Arrived' : 'Đã đến nơi';
                } else if (j.status === 'in_progress') {
                  statusBadgeText = t('status_in_progress');
                  helperStatusText = lang === 'en' ? 'Working' : 'Đang làm';
                } else if (j.status === 'pending_review') {
                  statusBadgeText = t('status_pending_review');
                  helperStatusText = lang === 'en' ? 'Awaiting review' : 'Chờ nghiệm thu';
                } else if (j.status === 'completed') {
                  statusBadgeText = t('status_completed');
                  helperStatusText = lang === 'en' ? 'Completed' : 'Hoàn thành';
                } else {
                  statusBadgeText = t('home_status_processing');
                  helperStatusText = lang === 'en' ? 'In progress' : 'Đang xử lý';
                }

                const rawJobDate = j.preferred_date || j.scheduled_at;
                const displayDate = rawJobDate ? formatDate(rawJobDate, lang) : '—';
                const displayTime =
                  j.preferred_time_start ||
                  (j.scheduled_at ? formatTime(dayjs(j.scheduled_at)) : '—');
                const displayDistrict =
                  j.address?.district ||
                  j.address?.city ||
                  (lang === 'en' ? 'Location TBD' : 'Chưa rõ địa điểm');
                const helperInfo =
                  typeof j.helper_id === 'object' && j.helper_id
                    ? j.helper_id
                    : typeof j.assigned_helper === 'object' && j.assigned_helper
                      ? j.assigned_helper
                      : null;
                const helperName = helperInfo?.full_name || helperInfo?.name;

                return (
                  <TouchableOpacity
                    key={j._id}
                    activeOpacity={0.8}
                    onPress={() => {
                      setActiveJobsSheetOpen(false);
                      router.push({ pathname: '/job-detail/[id]', params: { id: j._id } });
                    }}
                    style={{
                      backgroundColor: tc.subtle,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: tc.border,
                      borderLeftWidth: 3.5,
                      borderLeftColor: '#10B981',
                      padding: 14,
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
                        style={{ fontSize: 14, fontWeight: '700', color: tc.text, flex: 1 }}
                        numberOfLines={1}
                      >
                        {j.title}
                      </Text>
                      <View
                        style={{
                          backgroundColor: tc.isDark ? '#064E3B' : '#ECFDF5',
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10.5,
                            fontWeight: '700',
                            color: tc.isDark ? '#34D399' : '#047857',
                          }}
                        >
                          {statusBadgeText}
                        </Text>
                      </View>
                    </View>

                    <Text style={{ fontSize: 11.5, color: tc.textMuted, marginTop: 4 }}>
                      {displayDate} · {displayTime} · {displayDistrict}
                    </Text>

                    {/* Helper info if present */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginTop: 10,
                        paddingTop: 8,
                        borderTopWidth: 1,
                        borderTopColor: tc.border,
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: tc.isDark ? '#064E3B' : '#DCFCE7',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '800',
                              color: tc.isDark ? '#34D399' : '#16A34A',
                            }}
                          >
                            {helperName ? helperName.charAt(0) : 'T'}
                          </Text>
                        </View>
                        <View>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: tc.text }}>
                            {helperName ||
                              (lang === 'en' ? 'Finding helper...' : 'Đang tìm thợ...')}
                          </Text>
                          {helperInfo?.rating ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                              <Star size={10} color="#F59E0B" fill="#F59E0B" />
                              <Text style={{ fontSize: 10, color: '#64748B' }}>
                                {helperInfo.rating.toFixed(1)}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>

                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#059669' }}>
                        {helperStatusText}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Modal Xem bản đồ lớn (Item 6) ── */}
      <Modal
        visible={isFullMapOpen}
        animationType="slide"
        onRequestClose={() => setIsFullMapOpen(false)}
      >
        <View
          style={[
            { flex: 1, backgroundColor: tc.background },
            Platform.OS === 'web' ? ({ zIndex: 9990 } as any) : undefined,
          ]}
        >
          {/* Top Header */}
          <View
            style={{
              paddingTop: Math.max(insets.top + 8, 20),
              paddingBottom: 14,
              paddingHorizontal: 16,
              backgroundColor: tc.surface,
              borderBottomWidth: 1,
              borderBottomColor: tc.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setIsFullMapOpen(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: tc.subtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChevronLeft size={20} color={tc.text} />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: '700', color: tc.text }}>
                {lang === 'en' ? 'Map of Nearby Helpers' : 'Bản đồ thợ gần bạn'}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setIsFullMapOpen(false)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: tc.subtle,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} color={tc.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Map View */}
          <View style={{ flex: 1 }}>
            {currentCoords && mapCenter ? (
              Platform.OS === 'web' ? (
                <iframe
                  srcDoc={goongMiniMapHtml}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title="Goong Full Map"
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : (
                <WebView
                  originWhitelist={['*']}
                  source={{ html: goongMiniMapHtml }}
                  style={{ flex: 1 }}
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
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}
              >
                <Users size={32} color="#94A3B8" />
                <Text
                  style={{
                    fontSize: fs(14.5),
                    fontWeight: '600',
                    color: '#64748B',
                    textAlign: 'center',
                    marginTop: 12,
                    marginBottom: 16,
                  }}
                >
                  {t('home_location_unidentified')}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={handleRequestLiveLocation}
                    disabled={isLocatingLive}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: '#059669',
                      paddingVertical: 9,
                      paddingHorizontal: 16,
                      borderRadius: 9999,
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
                      backgroundColor: tc.surface,
                      borderWidth: 1,
                      borderColor: tc.border,
                      paddingVertical: 9,
                      paddingHorizontal: 16,
                      borderRadius: 9999,
                    }}
                  >
                    <MapPin size={14} color={tc.textSecondary} />
                    <Text style={{ color: tc.textSecondary, fontWeight: '700', fontSize: fs(12) }}>
                      {t('home_select_manual')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Helper List or Empty State below map (Item 14) */}
          {currentCoords && mapCenter && (
            <View
              style={{
                backgroundColor: tc.surface,
                borderTopWidth: 1,
                borderTopColor: tc.border,
                paddingVertical: 12,
                paddingHorizontal: 16,
                maxHeight: 220,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <Text style={{ fontSize: fs(14), fontWeight: '700', color: tc.text }}>
                  {lang === 'en' ? 'Nearby Helpers' : 'Thợ ở gần bạn'}{' '}
                  {nearbyHelpers.length > 0 && `(${nearbyHelpers.length})`}
                </Text>
              </View>

              {nearbyHelpers.length === 0 ? (
                <View
                  style={{
                    paddingVertical: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Users size={22} color={tc.textMuted} />
                  <Text
                    style={{
                      fontSize: fs(13),
                      fontWeight: '600',
                      color: tc.textMuted,
                      marginTop: 6,
                      textAlign: 'center',
                    }}
                  >
                    {t('home_no_helpers_online')}
                  </Text>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
                >
                  {nearbyHelpers.map(helper => {
                    const isSelected = helper.id === selectedHelperId;
                    return (
                      <TouchableOpacity
                        key={helper.id}
                        activeOpacity={0.85}
                        onPress={() => {
                          setSelectedHelperId(helper.id);
                          setIsFullMapOpen(false);
                          router.push({
                            pathname: '/helper-profile/[id]',
                            params: { id: helper.id },
                          });
                        }}
                        style={{
                          width: 212,
                          backgroundColor: tc.subtle,
                          borderRadius: 16,
                          padding: 12,
                          borderWidth: 1.5,
                          borderColor: isSelected ? '#10B981' : tc.border,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.03,
                          shadowRadius: 4,
                          elevation: 1,
                          justifyContent: 'space-between',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 19,
                              backgroundColor: tc.isDark ? '#0C4A6E' : '#E0F2FE',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: fs(14),
                                fontWeight: '800',
                                color: tc.isDark ? '#38BDF8' : '#0369A1',
                              }}
                            >
                              {helper.name.charAt(0)}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: fs(13),
                                fontWeight: '700',
                                color: tc.text,
                              }}
                              numberOfLines={1}
                            >
                              {helper.name}
                            </Text>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 3,
                                marginTop: 2,
                              }}
                            >
                              {helper.rating > 0 ? (
                                <>
                                  <Star size={11} color="#F59E0B" fill="#F59E0B" />
                                  <Text style={{ fontSize: fs(11), color: tc.textMuted }}>
                                    {helper.rating.toFixed(1)} ({helper.completedJobs})
                                  </Text>
                                </>
                              ) : (
                                <Text style={{ fontSize: fs(11), color: tc.textMuted }}>
                                  {helper.completedJobs > 0
                                    ? t('home_jobs_count', { count: helper.completedJobs })
                                    : t('home_new_helper')}
                                </Text>
                              )}
                            </View>
                          </View>
                        </View>

                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: 10,
                            paddingTop: 8,
                            borderTopWidth: 1,
                            borderTopColor: tc.border,
                          }}
                        >
                          <Text style={{ fontSize: fs(11), fontWeight: '600', color: tc.textMuted }}>
                            {helper.distance}
                          </Text>
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => {
                              setIsFullMapOpen(false);
                              router.push({
                                pathname: '/(customer)/booking',
                                params: {
                                  favorite_helper_id: helper.id,
                                  favorite_helper_name: helper.name,
                                },
                              });
                            }}
                            style={{
                              backgroundColor: '#059669',
                              paddingHorizontal: 12,
                              paddingVertical: 5,
                              borderRadius: 9999,
                            }}
                          >
                            <Text style={{ fontSize: fs(11), fontWeight: '700', color: '#FFFFFF' }}>
                              {lang === 'en' ? 'Book' : 'Đặt ngay'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      </Modal>

      {/* ── Modal Chọn vị trí (Render sau cùng để luôn hiển thị phía trên các modal khác) ── */}
      <LocationPicker
        visible={locationPickerOpen}
        title={t('home_pick_location')}
        initial={currentCoords}
        onClose={() => setLocationPickerOpen(false)}
        onConfirm={(coords, geo) => {
          setLocationPickerOpen(false);
          setCurrentCoords(coords);
          const label = geo ? inferLocationLabel(geo) : t('home_selected_location');
          setCurrentLocationName(label);
          AsyncStorage.setItem(
            '@homemate_customer_pinned_location',
            JSON.stringify({ coords, locationName: label, is_manual_pick: true }),
          ).catch(() => {});
        }}
      />
    </View>
  );
}
