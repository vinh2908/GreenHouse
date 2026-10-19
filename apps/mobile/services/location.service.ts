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
   * (Ưu tiên Expo Native & Photon OSM để lấy chính xác Số nhà & Tên đường, fallback BigDataCloud & Nominatim)
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
        const district = geo.subregion || geo.district || 'Quận 1';
        const city = geo.city || geo.region || 'Hồ Chí Minh';
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

    // 2. Thử Photon OpenStreetMap Reverse Geocode (Có CORS, miễn phí, trả về Số nhà + Tên đường chính xác)
    try {
      const photonUrl = `https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}`;
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
          const district = p.district || p.city_district || 'Quận 1';
          const city = p.city || p.state || 'Hồ Chí Minh';
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

    // 3. Fallback Nominatim OpenStreetMap
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

    // 4. Fallback BigDataCloud (CORS-friendly, trả về phường, quận, thành phố)
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

    return {
      full_address: `Tọa độ: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      road: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
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
   * Tìm kiếm địa điểm bằng Photon + OpenStreetMap Search API (Autocomplete)
   */
  async searchPlaces(query: string): Promise<OsmPlace[]> {
    if (!query || query.trim().length < 2) return [];

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
