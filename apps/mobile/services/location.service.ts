import * as Location from 'expo-location';

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
   * Chuyển tọa độ (lat, lon) -> Địa chỉ chi tiết tiếng Việt
   * (Ưu tiên BigDataCloud API hỗ trợ CORS Web, fallback Nominatim & Expo Location)
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<LocationResult | null> {
    // 1. Thử BigDataCloud (CORS-friendly, hoạt động 100% trên trình duyệt Web)
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
          'Quận 1';
        const city = data.city || data.principalSubdivision || 'Hồ Chí Minh';

        const parts = [ward, district, city].filter(Boolean);
        const fullAddress =
          parts.length > 0 ? parts.join(', ') : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

        return {
          full_address: fullAddress,
          ward,
          district,
          city,
          coordinates: [longitude, latitude],
        };
      }
    } catch (err) {
      console.warn('BigDataCloud reverse geocode error:', err);
    }

    // 2. Fallback Nominatim OpenStreetMap
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
        const district = addr.city_district || addr.district || addr.county || 'Quận 1';
        const city = addr.city || addr.state || 'Hồ Chí Minh';
        const fullAddress = street
          ? `${street}, ${ward ? ward + ', ' : ''}${district}, ${city}`
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

    // 3. Fallback bằng Expo reverseGeocodeAsync (khi chạy trên Native App)
    try {
      const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geo) {
        const street = `${geo.name || ''} ${geo.street || ''}`.trim() || 'Vị trí hiện tại';
        const district = geo.district || geo.subregion || 'Quận 1';
        const city = geo.city || geo.region || 'Hồ Chí Minh';
        return {
          full_address: `${street}, ${district}, ${city}`,
          road: street,
          ward: geo.district || '',
          district,
          city,
          coordinates: [longitude, latitude],
        };
      }
    } catch {
      /* ignore */
    }

    return {
      full_address: `Tọa độ: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      district: 'Vị trí hiện tại',
      city: 'Việt Nam',
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
   * Tìm kiếm địa điểm bằng OpenStreetMap Search API (Autocomplete)
   */
  async searchPlaces(query: string): Promise<OsmPlace[]> {
    if (!query || query.trim().length < 2) return [];

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
