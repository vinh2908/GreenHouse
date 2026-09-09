import * as Location from 'expo-location';

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
   * Xin quyền GPS và lấy tọa độ hiện tại của thiết bị
   */
  async getCurrentCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
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
      console.warn('Error getting location:', err);
      return null;
    }
  }

  /**
   * Reverse Geocoding bằng OpenStreetMap Nominatim:
   * Chuyển tọa độ (lat, lon) -> Địa chỉ chi tiết tiếng Việt
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<LocationResult | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=vi`;
      
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'HomeMate-App/1.0 (contact@homemate.vn)',
        },
      });

      if (!res.ok) throw new Error('OSM Reverse Geocode failed');
      const data: OsmPlace = await res.json();
      const addr = data.address || {};

      // Phân tích các cấp hành chính Việt Nam từ OpenStreetMap
      const houseNumber = addr.house_number ? `${addr.house_number} ` : '';
      const road = addr.road || '';
      const street = `${houseNumber}${road}`.trim() || data.display_name.split(',')[0];
      const ward = addr.suburb || addr.quarter || addr.neighbourhood || '';
      const district = addr.city_district || addr.district || addr.county || 'Quận 1';
      const city = addr.city || addr.state || 'Hồ Chí Minh';

      const fullAddress = street ? `${street}, ${ward ? ward + ', ' : ''}${district}, ${city}` : data.display_name;

      return {
        full_address: fullAddress,
        road: street,
        ward,
        district,
        city,
        coordinates: [longitude, latitude],
      };
    } catch (err) {
      console.warn('OSM Reverse geocoding error, falling back to Expo Location:', err);
      
      // Fallback bằng Expo reverseGeocodeAsync
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
      } catch { /* ignore fallback error */ }

      return null;
    }
  }

  /**
   * Lấy địa chỉ hiện tại nhanh chóng (Kết hợp GPS + OpenStreetMap)
   */
  async getCurrentLocationDetails(): Promise<LocationResult | null> {
    const coords = await this.getCurrentCoordinates();
    if (!coords) {
      // Fallback vị trí mặc định tại trung tâm Quận 1 nếu không bật GPS
      return {
        full_address: '128 Đường Lê Lợi, Phường Bến Thành',
        ward: 'Phường Bến Thành',
        district: 'Quận 1',
        city: 'Hồ Chí Minh',
        coordinates: [106.6983, 10.7725],
      };
    }

    const result = await this.reverseGeocode(coords.latitude, coords.longitude);
    return result || {
      full_address: 'Quận 1, TP. Hồ Chí Minh',
      district: 'Quận 1',
      city: 'Hồ Chí Minh',
      coordinates: [coords.longitude, coords.latitude],
    };
  }

  /**
   * Tìm kiếm địa điểm bằng OpenStreetMap Search API (Autocomplete)
   */
  async searchPlaces(query: string): Promise<OsmPlace[]> {
    if (!query || query.trim().length < 2) return [];

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=vn&addressdetails=1&limit=6&accept-language=vi`;
      
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'HomeMate-App/1.0 (contact@homemate.vn)',
        },
      });

      if (!res.ok) return [];
      return (await res.json()) as OsmPlace[];
    } catch (err) {
      console.warn('OSM Search error:', err);
      return [];
    }
  }
}

export const locationService = new LocationService();
