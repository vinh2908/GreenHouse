import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
  getGoongApiKey,
  goongReverseGeocode,
  mapGoongGeocodeResult,
  searchPlacesWithGoong,
} from './goong-geocoding';

type BrowserGeolocationPosition = {
  coords: { latitude: number; longitude: number };
};

type BrowserGeolocation = {
  getCurrentPosition: (
    success: (position: BrowserGeolocationPosition) => void,
    error: (reason: unknown) => void,
    options: { enableHighAccuracy: boolean; timeout: number; maximumAge: number },
  ) => void;
};

export interface LocationResult {
  full_address: string;
  road?: string;
  suburb?: string;
  ward?: string;
  district?: string;
  city?: string;
  coordinates: [number, number]; // [longitude, latitude]
}

export interface OsmPlace {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    suburb?: string;
    quarter?: string;
    neighbourhood?: string;
    village?: string;
    commune?: string;
    city_district?: string;
    district?: string;
    borough?: string;
    county?: string;
    city?: string;
    province?: string;
    state?: string;
    country?: string;
  };
}

export function normalizeVietnameseAddress(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/\bBen Thanh\b/gi, 'Bến Thành')
    .replace(/\bHo Chi Minh City\b/gi, 'TP. Hồ Chí Minh')
    .replace(/\bHo Chi Minh\b/gi, 'Hồ Chí Minh')
    .replace(/\bDistrict (\d+)\b/gi, 'Quận $1')
    .replace(/\bDa Nang\b/gi, 'Đà Nẵng')
    .replace(/\bHanoi\b/gi, 'Hà Nội')
    .replace(/\bHai Phong\b/gi, 'Hải Phòng')
    .replace(/\bCan Tho\b/gi, 'Cần Thơ')
    .replace(/\bWard (\d+)\b/gi, 'Phường $1')
    .replace(/\bThanh Khe\b/gi, 'Thanh Khê')
    .replace(/\bHai Chau\b/gi, 'Hải Châu')
    .replace(/\bSon Tra\b/gi, 'Sơn Trà')
    .replace(/\bNgu Hanh Son\b/gi, 'Ngũ Hành Sơn')
    .replace(/\bLien Chieu\b/gi, 'Liên Chiểu')
    .replace(/\bCam Le\b/gi, 'Cẩm Lệ')
    .replace(/\bHoa Vang\b/gi, 'Hòa Vang');
}

/**
 * Tách và map các thành phần địa chỉ Việt Nam (Số nhà, tên đường, phường/xã, quận/huyện, thành phố)
 * Kể cả khi tên phường/quận không theo mẫu chuẩn "Phường X" / "Quận Y" (như Hòa Khê, Thanh Khê, Đà Nẵng)
 */
export function parseVietnameseAddress(
  rawText?: string | null,
  fallback?: Partial<LocationResult>,
): LocationResult {
  const norm = normalizeVietnameseAddress(rawText || fallback?.full_address || '').trim();
  let road = fallback?.road ? normalizeVietnameseAddress(fallback.road).trim() : '';
  let ward = fallback?.ward ? normalizeVietnameseAddress(fallback.ward).trim() : '';
  let district = fallback?.district ? normalizeVietnameseAddress(fallback.district).trim() : '';
  let city = fallback?.city ? normalizeVietnameseAddress(fallback.city).trim() : '';
  const coordinates: [number, number] = fallback?.coordinates || [0, 0];

  if (!norm) {
    return {
      full_address: '',
      road: road || '',
      ward: ward || '',
      district: district || '',
      city: city || '',
      coordinates,
    };
  }

  // 1. Nhận diện các đơn vị hành chính theo tiền tố tiếng Việt nếu có
  if (!city) {
    const matchCity = norm.match(/(?:Thành phố|Tỉnh|TP\.?)\s+([^,]+)/i);
    if (matchCity) city = matchCity[0].trim();
  }
  if (!district) {
    const matchDistrict = norm.match(/(?:Quận|Huyện|Thị xã)\s+([^,]+)/i);
    if (matchDistrict) district = matchDistrict[0].trim();
  }
  if (!ward) {
    const matchWard = norm.match(/(?:Phường|Xã|Thị trấn)\s+([^,]+)/i);
    if (matchWard) ward = matchWard[0].trim();
  }

  // 2. Phân tách token từ phải sang trái khi dữ liệu geocoding không có tiền tố hành chính (VD: "223 Nguyễn Phước Nguyên, Hòa Khê, Thanh Khê, Đà Nẵng")
  const tokens = norm
    .split(',')
    .map(s => s.trim())
    .filter(
      s =>
        s.length > 0 &&
        !/^\d{4,6}$/.test(s) &&
        !/^Việt\s*Nam$/i.test(s) &&
        !/^Vietnam$/i.test(s) &&
        !/^Quận$/i.test(s) &&
        !/^Huyện$/i.test(s),
    );

  // Helper kiểm tra xem token có phải là tên đường / số nhà (chứ KHÔNG phải phường/xã)
  const isRoadToken = (t: string) => {
    if (!t) return false;
    // Chứa kiệt, hẻm, ngõ, đường, số nhà, hoặc số kèm xuyệt (\d+/\d+)
    if (/(?:kiệt|hẻm|ngõ|đường|số\s*\d+|\b\d+\/\d+\b|\b\d+[a-zA-Z]?\b)/i.test(t)) {
      // Ngoại trừ dạng tên hành chính "Phường 1", "Xã 2"
      if (!/^(?:phường|xã|thị trấn)\s+\d+$/i.test(t.trim())) {
        return true;
      }
    }
    return false;
  };

  if (tokens.length >= 1 && !city) {
    city = tokens[tokens.length - 1];
  }
  if (tokens.length >= 2 && !district) {
    district = tokens[tokens.length - 2];
  }

  if (tokens.length >= 4 && !ward) {
    // Trường hợp đủ 4 token: [Road, Ward, District, City]
    const candidateWard = tokens[tokens.length - 3];
    if (!isRoadToken(candidateWard)) {
      ward = candidateWard;
    }
  } else if (tokens.length === 3 && !ward) {
    // Trường hợp 3 token: phân biệt [Road, District, City] (VD: "Kiệt 49/59 Bình Kỹ, Ngũ Hành Sơn, Đà Nẵng")
    // và [Ward, District, City] (VD: "Hòa Khê, Thanh Khê, Đà Nẵng")
    const firstToken = tokens[0];
    if (isRoadToken(firstToken)) {
      road = firstToken;
      ward = '';
    } else if (!/\d/.test(firstToken)) {
      ward = firstToken;
      road = '';
    }
  }

  // Tên đường / số nhà: các token bên trái còn lại
  if (!road || road === norm || road.startsWith('Khu vực')) {
    if (tokens.length >= 4) {
      road = tokens.slice(0, tokens.length - 3).join(', ');
    } else if (tokens.length === 3) {
      if (!ward) {
        road = tokens[0];
      }
    } else if (tokens.length > 0) {
      road = tokens[0];
    }
  }

  // Dọn dẹp tuyệt đối: Phường/Xã không bao giờ chứa kiệt, hẻm, số nhà hoặc trùng road
  if (ward) {
    if (isRoadToken(ward) || (road && ward.toLowerCase() === road.toLowerCase())) {
      ward = '';
    }
  }

  // Dọn dẹp nếu road vô tình chứa cả tên phường/quận ở đuôi
  if (road && ward && road.endsWith(ward)) {
    road = road
      .slice(0, -ward.length)
      .replace(/[,\s]+$/, '')
      .trim();
  }
  if (road && district && road.endsWith(district)) {
    road = road
      .slice(0, -district.length)
      .replace(/[,\s]+$/, '')
      .trim();
  }

  // Chống dữ liệu rác/bịa
  if (
    district === 'Quận' ||
    district === 'Huyện' ||
    district === 'Thị xã' ||
    /^Việt\s*Nam$/i.test(district)
  ) {
    district = '';
  }
  if (/^Việt\s*Nam$/i.test(city) || /^Vietnam$/i.test(city)) {
    city = '';
  }

  // Dựng lại full_address gọn gàng
  const parts = [road, ward, district, city].filter(Boolean);
  const full_address = parts.length > 0 ? parts.join(', ') : norm;

  return {
    full_address,
    road: road || full_address,
    ward,
    district,
    city,
    coordinates,
  };
}

export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Bán kính Trái Đất (km)
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

class LocationService {
  private cachedCoords: { latitude: number; longitude: number } | null = null;

  /** Cập nhật thủ công tọa độ gần nhất (ví dụ khi user ghim vị trí hoặc chọn địa chỉ) */
  setCachedCoordinates(coords: { latitude: number; longitude: number } | null): void {
    this.cachedCoords = coords;
  }

  /** Lấy tọa độ đã lưu gần nhất */
  getCachedCoordinates(): { latitude: number; longitude: number } | null {
    return this.cachedCoords;
  }

  /**
   * Xin quyền GPS và lấy tọa độ hiện tại của thiết bị (hỗ trợ cả Web & Mobile Native)
   */
  async getCurrentCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
    // 1. Nếu đang chạy trên trình duyệt Web (Chrome, Safari, Edge, Mobile Web).
    if (Platform.OS === 'web') {
      const browserNavigator = (
        globalThis as typeof globalThis & { navigator?: { geolocation?: BrowserGeolocation } }
      ).navigator;
      const browserGeolocation = browserNavigator?.geolocation;
      if (browserGeolocation) {
        try {
          const pos = await new Promise<BrowserGeolocationPosition>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('HTML5_GPS_TIMEOUT')), 5000);
            browserGeolocation.getCurrentPosition(
              p => {
                clearTimeout(timer);
                resolve(p);
              },
              e => {
                clearTimeout(timer);
                reject(e);
              },
              {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 30000,
              },
            );
          });
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
          this.cachedCoords = coords;
          return coords;
        } catch (err) {
          console.warn('HTML5 Geolocation error:', err);
        }
      }
      return null;
    }

    // 2. Môi trường Native (Android/iOS APK): Dùng Expo Location
    try {
      const permissionPromise = Location.requestForegroundPermissionsAsync();
      const permTimeoutPromise = new Promise<{ status: string }>(resolve =>
        setTimeout(() => resolve({ status: 'timeout' }), 2500),
      );
      const permRes = await Promise.race([permissionPromise, permTimeoutPromise]).catch(() => null);
      if (permRes && permRes.status !== 'granted') {
        console.warn('Location permission denied or timed out');
      }

      // Thử lấy ngay vị trí gần nhất đã lưu trong hệ điều hành (OPPO/Samsung/Pixel cache ~5ms)
      const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
      if (lastKnown?.coords) {
        const coords = {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
        };
        this.cachedCoords = coords;
        // Nếu vị trí gần nhất dưới 10 phút thì dùng luôn để phản hồi siêu tốc không treo spinner
        const isFresh = lastKnown.timestamp
          ? Date.now() - lastKnown.timestamp < 10 * 60 * 1000
          : false;
        if (isFresh) {
          return coords;
        }
      }

      // Đặt timeout 2.5 giây cho getCurrentPositionAsync trên mobile native tránh treo spinner trên OPPO/Android
      const posPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('GPS_TIMEOUT')), 2500),
      );

      let location = await Promise.race([posPromise, timeoutPromise]).catch(() => lastKnown);
      if (!location) {
        location = lastKnown;
      }

      if (!location) {
        return this.cachedCoords;
      }

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      this.cachedCoords = coords;
      return coords;
    } catch (err) {
      console.warn('Error getting native location:', err);
      return this.cachedCoords;
    }
  }

  /**
   * Chuyển tọa độ (lat, lon) -> Địa chỉ chi tiết tiếng Việt.
   * Nguồn duy nhất: Goong REST API (dữ liệu địa chỉ Việt Nam, có số nhà).
   * Tuyệt đối không fallback sang Photon, Nominatim, BigDataCloud hay OSM.
   * Nguyên tắc: trường nào không tra được thì để '' — không bao giờ bịa giá trị.
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<LocationResult | null> {
    const goongKey = getGoongApiKey();
    if (goongKey) {
      try {
        const goongResult = await goongReverseGeocode(latitude, longitude, goongKey);
        if (goongResult) {
          const mapped = mapGoongGeocodeResult(goongResult, latitude, longitude);
          if (mapped.road || mapped.district || mapped.city) {
            return parseVietnameseAddress(mapped.full_address, mapped);
          }
        }
      } catch (err) {
        console.warn('[Goong Geocode] Lỗi reverse geocode:', err);
      }
    } else {
      console.warn('[Goong Geocode] Thiếu EXPO_PUBLIC_GOONG_API_KEY');
    }

    // Không tra được hoặc lỗi: chỉ còn tọa độ thực tế, không bịa địa chỉ
    return {
      full_address: `Tọa độ: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      road: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      district: '',
      city: '',
      coordinates: [longitude, latitude],
    };
  }

  /**
   * Lấy địa chỉ hiện tại nhanh chóng (Kết hợp GPS + Reverse Geocoding)
   */
  async getCurrentLocationDetails(): Promise<LocationResult | null> {
    const coords = await this.getCurrentCoordinates();
    if (!coords) {
      return null;
    }
    const res = await this.reverseGeocode(coords.latitude, coords.longitude);
    if (!res) return null;
    return parseVietnameseAddress(res.full_address || res.road, res);
  }

  /**
   * Tìm kiếm địa điểm (Autocomplete) chỉ sử dụng Goong Place AutoComplete + Place Detail.
   * Dữ liệu Việt Nam, có số nhà, ngõ/hẻm, tên đường chuẩn xác.
   * Tuyệt đối không fallback sang Photon hay Nominatim.
   *
   * Tự động xếp hạng kết quả theo khoảng cách tới vị trí GPS thực của người dùng.
   */
  async searchPlaces(
    query: string,
    userCoords?: { latitude: number; longitude: number } | null,
  ): Promise<OsmPlace[]> {
    if (!query || query.trim().length < 2) return [];

    let refCoords = userCoords || this.cachedCoords;

    // Nếu chưa có tọa độ tham chiếu: tự động lấy từ vị trí đã lưu hoặc GPS hiện tại
    if (!refCoords) {
      try {
        const saved = await AsyncStorage.getItem('@homemate_customer_pinned_location');
        if (saved) {
          const parsed = JSON.parse(saved);
          const isFake =
            !parsed.coords ||
            (Math.abs(parsed.coords.latitude - 10.7769) < 0.015 &&
              Math.abs(parsed.coords.longitude - 106.7009) < 0.015) ||
            (Math.abs(parsed.coords.latitude - 10.7725) < 0.015 &&
              Math.abs(parsed.coords.longitude - 106.6983) < 0.015);
          if (!isFake && parsed.coords?.latitude && parsed.coords?.longitude) {
            refCoords = parsed.coords;
            this.cachedCoords = parsed.coords;
          }
        }
      } catch {}
    }
    if (!refCoords) {
      const cur = await this.getCurrentCoordinates().catch(() => null);
      if (cur) {
        refCoords = cur;
        this.cachedCoords = cur;
      }
    }

    const goongKey = getGoongApiKey();
    if (!goongKey) {
      console.warn('[Goong Search] Thiếu EXPO_PUBLIC_GOONG_API_KEY');
      return [];
    }

    try {
      const goongPlaces = await searchPlacesWithGoong(query, goongKey, refCoords);
      if (goongPlaces.length > 0) {
        if (refCoords?.latitude && refCoords?.longitude) {
          goongPlaces.sort((a, b) => {
            const distA = calculateDistanceKm(
              refCoords.latitude,
              refCoords.longitude,
              parseFloat(a.lat),
              parseFloat(a.lon),
            );
            const distB = calculateDistanceKm(
              refCoords.latitude,
              refCoords.longitude,
              parseFloat(b.lat),
              parseFloat(b.lon),
            );
            return distA - distB;
          });
        }
        return goongPlaces as OsmPlace[];
      }
    } catch (err) {
      console.warn('[Goong Search] Lỗi tìm kiếm địa điểm:', err);
    }

    return [];
  }
}

export const locationService = new LocationService();
