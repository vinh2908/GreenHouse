import * as Location from 'expo-location';
import {
  getGoongApiKey,
  goongReverseGeocode,
  mapGoongGeocodeResult,
  searchPlacesWithGoong,
} from './goong-geocoding';

/**
 * Helper fetch bọc Promise.race + AbortController timeout an toàn.
 * Đảm bảo các request tìm kiếm và geocoding mạng ngoài (Photon, Nominatim, BigDataCloud)
 * luôn settle trong tối đa timeoutMs, giải quyết triệt để lỗi treo socket/DNS trên Android/React Native.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 4000,
): Promise<Response> {
  const controller = new AbortController();
  let timer: any;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        controller.abort();
      } catch {}
      reject(new Error(`Fetch timeout after ${timeoutMs}ms for ${url}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetch(url, {
        ...options,
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

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
        s.length > 0 && !/^\d{4,6}$/.test(s) && !/^Việt\s*Nam$/i.test(s) && !/^Vietnam$/i.test(s),
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

  // Tên đường / số nhà: các token bên trái còn lại
  if (!road || road === norm || road.startsWith('Khu vực')) {
    if (tokens.length >= 4) {
      road = tokens.slice(0, tokens.length - 3).join(', ');
    } else if (tokens.length > 0) {
      road = tokens[0];
    }
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

      // Đặt timeout tối đa 8 giây cho getCurrentPositionAsync trên mobile native tránh treo spinner
      const posPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('GPS_TIMEOUT')), 8000),
      );

      let location = await Promise.race([posPromise, timeoutPromise]).catch(async () => {
        // Fallback sang last known position nếu getCurrentPositionAsync quá 8s hoặc lỗi
        return await Location.getLastKnownPositionAsync().catch(() => null);
      });

      if (!location) {
        location = await Location.getLastKnownPositionAsync().catch(() => null);
      }

      if (!location) {
        return null;
      }

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
          return parseVietnameseAddress(fullAddress, {
            full_address: fullAddress,
            road: road || fullAddress,
            ward,
            district,
            city,
            coordinates: [longitude, latitude],
          });
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
            return parseVietnameseAddress(mapped.full_address, mapped);
          }
        }
      } catch (err) {
        console.warn('Goong reverse geocode error:', err);
      }
    }

    // 3. Thử Photon OpenStreetMap Reverse Geocode (Có CORS, miễn phí, trả về Số nhà + Tên đường chính xác)
    // Chú ý: Photon KHÔNG hỗ trợ lang=vi (trả về 400), dùng mặc định sẽ trả về tên tiếng Việt đầy đủ theo OSM.
    try {
      const photonUrl = `https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}`;
      const res = await fetchWithTimeout(photonUrl, {}, 4000);
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
            return parseVietnameseAddress(fullAddress || p.name, {
              full_address: fullAddress,
              road: road || fullAddress,
              ward,
              district,
              city,
              coordinates: [longitude, latitude],
            });
          }
        }
      }
    } catch (err: any) {
      console.warn(
        `Photon reverse geocode ${err?.name === 'AbortError' ? 'timeout (8s)' : 'error'}:`,
        err?.message || err,
      );
    }

    // 4. Fallback Nominatim OpenStreetMap
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=vi`;
      const res = await fetchWithTimeout(
        url,
        {
          headers: {
            'User-Agent': 'GreenHouse-Mobile/1.0 (contact@greenhouse.app)',
          },
        },
        8000,
      );
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

        return parseVietnameseAddress(data.display_name || fullAddress, {
          full_address: fullAddress,
          road: street,
          ward,
          district,
          city,
          coordinates: [longitude, latitude],
        });
      }
    } catch (err: any) {
      console.warn(
        `OSM Reverse geocoding ${err?.name === 'AbortError' ? 'timeout (8s)' : 'error'}:`,
        err?.message || err,
      );
    }

    // 5. Fallback BigDataCloud (CORS-friendly, trả về phường, quận, thành phố)
    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=vi`;
      const res = await fetchWithTimeout(url, {}, 8000);
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

        return parseVietnameseAddress(fullAddress, {
          full_address: fullAddress,
          road: ward ? `Khu vực ${ward}` : fullAddress,
          ward,
          district,
          city,
          coordinates: [longitude, latitude],
        });
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
    const res = await this.reverseGeocode(coords.latitude, coords.longitude);
    if (!res) return null;
    return parseVietnameseAddress(res.full_address || res.road, res);
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

    // 1. Thử Photon search API (cực nhanh ~300ms, hỗ trợ CORS, KHÔNG dùng lang=vi vì Photon sẽ trả 400)
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8`;
      const res = await fetchWithTimeout(url, {}, 4000);
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
    } catch (err: any) {
      console.warn(
        `Photon search ${err?.message?.includes('timeout') ? 'timeout (4s)' : 'error'}, fallback OSM:`,
        err?.message || err,
      );
    }

    // 2. Fallback Nominatim OpenStreetMap - timeout 3.5s + User-Agent
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=vn&addressdetails=1&limit=6&accept-language=vi`;
      const res = await fetchWithTimeout(
        url,
        {
          headers: {
            'User-Agent': 'GreenHouse-Mobile/1.0 (contact@greenhouse.app)',
          },
        },
        3500,
      );
      if (!res.ok) return [];
      return (await res.json()) as OsmPlace[];
    } catch (err: any) {
      console.warn(
        `OSM Search ${err?.name === 'AbortError' ? 'timeout (8s)' : 'error'}:`,
        err?.message || err,
      );
      return [];
    }
  }
}

export const locationService = new LocationService();
