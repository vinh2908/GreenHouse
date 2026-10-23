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
    suburb?: string;
    quarter?: string;
    neighbourhood?: string;
    city_district?: string;
    district?: string;
    county?: string;
    city?: string;
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

class LocationService {
  /**
   * Xin quyền GPS và lấy tọa độ hiện tại của thiết bị (hỗ trợ cả Web & Mobile Native)
   */
  async getCurrentCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
    // 1. Nếu đang chạy trên trình duyệt Web (Chrome, Safari, Edge, Mobile Web).
    // RN TypeScript không include DOM lib, nên đọc API web qua globalThis có kiểu tường minh.
    const browserNavigator = (
      globalThis as typeof globalThis & { navigator?: { geolocation?: BrowserGeolocation } }
    ).navigator;
    const browserGeolocation = browserNavigator?.geolocation;
    if (browserGeolocation) {
      try {
        const pos = await new Promise<BrowserGeolocationPosition>((resolve, reject) => {
          browserGeolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000,
          });
        });
        return {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
      } catch (err) {
        console.warn('HTML5 Geolocation error, trying Expo Location:', err);
      }
    }

    // 2. Môi trường Native (Android/iOS APK): Dùng Expo Location
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Location permission denied');
        return null;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (err) {
      console.warn('Error getting native location:', err);
      return null;
    }
  }

  /**
   * Chuyển tọa độ (lat, lon) -> Địa chỉ chi tiết tiếng Việt.
   * Thứ tự các lớp: 1) Expo Native (trên máy thật, miễn phí, không cần mạng riêng)
   * 2) Goong — dữ liệu địa chỉ Việt Nam, có số nhà (chỉ khi có
   * EXPO_PUBLIC_GOONG_API_KEY) 3) Photon OSM 4) Nominatim OSM 5) BigDataCloud.
   * Nguyên tắc: lớp nào không tra được Quận/Thành thì để '' — không bao giờ
   * bịa 'Quận 1'/'Hồ Chí Minh' như trước (người dùng Đà Nẵng từng bị gán sai).
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<LocationResult | null> {
    // 1. Thử Expo Location native (trên Android / iOS APK)
    try {
      const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geo && (geo.street || geo.name || geo.district)) {
        const houseNum = geo.name && !geo.name.includes(geo.street || '') ? geo.name : '';
        const streetName = geo.street || '';
        const road = [houseNum, streetName].filter(Boolean).join(' ').trim() || geo.name || '';
        const ward = geo.district || '';
        const district = geo.subregion || geo.district || '';
        const city = geo.city || geo.region || '';
        const fullAddress = [road, ward, district, city].filter(Boolean).join(', ');

        if (road || district) {
          return {
            full_address: fullAddress,
            road: road || fullAddress,
            ward,
            district,
            city,
            coordinates: [longitude, latitude],
          };
        }
      }
    } catch {
      /* ignore native error when on web */
    }

    // 2. Goong — dữ liệu địa chỉ Việt Nam (có số nhà kể cả nhiều tuyến phố mà
    // OSM bỏ trống). Bỏ qua hoàn toàn khi chưa cấu hình EXPO_PUBLIC_GOONG_API_KEY.
    const goongKey = getGoongApiKey();
    if (goongKey) {
      try {
        const goongResult = await goongReverseGeocode(latitude, longitude, goongKey);
        if (goongResult) {
          const mapped = mapGoongGeocodeResult(goongResult, latitude, longitude);
          if (mapped.road || mapped.district) {
            return mapped;
          }
        }
      } catch (err) {
        console.warn('Goong reverse geocode error:', err);
      }
    }

    // 3. Thử Photon OpenStreetMap Reverse Geocode (Có CORS, miễn phí, trả về Số nhà + Tên đường chính xác)
    try {
      const photonUrl = `https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}&lang=vi`;
      const res = await fetch(photonUrl);
      if (res.ok) {
        const json = await res.json();
        const feat = json.features?.[0];
        if (feat && feat.properties) {
          const p = feat.properties;
          const houseNumber = p.housenumber ? `${p.housenumber} ` : '';
          const street = p.street || '';
          const placeName = p.name || '';
          // Nếu có số nhà và tên đường
          let road = `${houseNumber}${street}`.trim();
          if (!road && placeName) {
            road = placeName;
          }
          const ward = p.locality || '';
          const district = p.district || p.city_district || '';
          const city = p.city || p.state || '';
          const fullAddress = [road, ward, district, city].filter(Boolean).join(', ');

          if (road || district) {
            return {
              full_address: fullAddress,
              road: road || fullAddress,
              ward,
              district,
              city,
              coordinates: [longitude, latitude],
            };
          }
        }
      }
    } catch (err) {
      console.warn('Photon reverse geocode error:', err);
    }

    // 4. Fallback Nominatim OpenStreetMap
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=vi`;
      const res = await fetch(url);
      if (res.ok) {
        const data: OsmPlace = await res.json();
        const addr = data.address || {};
        const houseNumber = addr.house_number ? `${addr.house_number} ` : '';
        const road = addr.road || '';
        const street = `${houseNumber}${road}`.trim() || data.display_name?.split(',')[0] || '';
        const ward = addr.suburb || addr.quarter || addr.neighbourhood || '';
        const district = addr.city_district || addr.district || addr.county || '';
        const city = addr.city || addr.state || '';
        const fullAddress = street
          ? [street, ward, district, city].filter(Boolean).join(', ')
          : data.display_name;

        return {
          full_address: fullAddress,
          road: street,
          ward,
          district,
          city,
          coordinates: [longitude, latitude],
        };
      }
    } catch (err) {
      console.warn('OSM Reverse geocoding error:', err);
    }

    // 5. Fallback BigDataCloud (CORS-friendly, trả về phường, quận, thành phố)
    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=vi`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const ward = data.locality || '';
        const adminList = data.localityInfo?.administrative || [];
        const districtObj = adminList.find(
          (a: any) =>
            a.adminLevel === 6 ||
            (a.name &&
              (a.name.includes('Quận') || a.name.includes('Huyện') || a.name.includes('Thị xã'))),
        );
        const district =
          districtObj?.name ||
          data.localityInfo?.informative?.find(
            (a: any) => a.name && (a.name.includes('Quận') || a.name.includes('Huyện')),
          )?.name ||
          '';
        const city = data.city || data.principalSubdivision || '';

        const parts = [ward, district, city].filter(Boolean);
        const fullAddress =
          parts.length > 0 ? parts.join(', ') : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

        return {
          full_address: fullAddress,
          road: ward ? `Khu vực ${ward}` : fullAddress,
          ward,
          district,
          city,
          coordinates: [longitude, latitude],
        };
      }
    } catch (err) {
      console.warn('BigDataCloud reverse geocode error:', err);
    }

    // Không lớp nào tra được: chỉ còn tọa độ là sự thật — district/city để ''
    // để form phía trên cho người dùng tự điền thay vì nhận dữ liệu bịa.
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
    return this.reverseGeocode(coords.latitude, coords.longitude);
  }

  /**
   * Tìm kiếm địa điểm (Autocomplete). Ưu tiên Goong Place AutoComplete +
   * Place Detail khi có EXPO_PUBLIC_GOONG_API_KEY (dữ liệu VN, có số nhà);
   * không có key hoặc Goong không trả kết quả thì dùng Photon + Nominatim
   * như trước. Giữ nguyên chữ ký Promise<OsmPlace[]> cho location-picker
   * và booking dùng không đổi.
   */
  async searchPlaces(query: string): Promise<OsmPlace[]> {
    if (!query || query.trim().length < 2) return [];

    // 0. Goong (chỉ khi có API key)
    const goongKey = getGoongApiKey();
    if (goongKey) {
      try {
        const goongPlaces = await searchPlacesWithGoong(query, goongKey);
        if (goongPlaces.length) {
          return goongPlaces as OsmPlace[];
        }
      } catch (err) {
        console.warn('Goong search error, fallback OSM:', err);
      }
    }

    // 1. Thử Photon search API (nhanh, hỗ trợ CORS trình duyệt)
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lang=vi`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.features?.length) {
          return json.features.map((f: any, idx: number) => {
            const p = f.properties || {};
            const streetName = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
            const full = [streetName, p.locality, p.district, p.city || p.state, p.country]
              .filter(Boolean)
              .join(', ');
            return {
              place_id: p.osm_id || idx,
              display_name: full || p.name || query,
              lat: String(f.geometry.coordinates[1]),
              lon: String(f.geometry.coordinates[0]),
              address: {
                house_number: p.housenumber,
                road: p.street || p.name,
                suburb: p.locality,
                district: p.district,
                city: p.city || p.state,
                country: p.country,
              },
            } as OsmPlace;
          });
        }
      }
    } catch (err) {
      console.warn('Photon search error, fallback OSM:', err);
    }

    // 2. Fallback Nominatim OpenStreetMap
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=vn&addressdetails=1&limit=6&accept-language=vi`;
      const res = await fetch(url);
      if (!res.ok) return [];
      return (await res.json()) as OsmPlace[];
    } catch (err) {
      console.warn('OSM Search error:', err);
      return [];
    }
  }
}

export const locationService = new LocationService();
