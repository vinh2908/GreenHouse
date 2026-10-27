/**
 * Goong REST API (https://rsapi.goong.io) — lớp geocoding dữ liệu Việt Nam
 * cho location.service.ts.
 *
 * Vì sao có lớp này: cascade cũ (Photon/Nominatim/BigDataCloud) đều dựa trên
 * dữ liệu OpenStreetMap — ở Việt Nam OSM rất thiếu số nhà, nhất là trong hẻm.
 * Goong là nền tảng bản đồ Việt Nam, trả về được street_number cho phần lớn
 * địa chỉ phố chính. Tài liệu: https://docs.goong.io/help/ (đã đối chiếu:
 * base URL rsapi.goong.io, endpoint /Geocode?latlng=..&api_key=.., REST API
 * key giới hạn 30.000 request/tháng, autocomplete dùng session token gộp
 * billing với 1 lần Place Detail).
 *
 * Module này thuần TypeScript (không import expo/react-native) để kiểm tra
 * độc lập bằng script Node: xem ~/workspace/greenhouse-goong/.
 *
 * Hành vi khi KHÔNG có key: getGoongApiKey() trả '' và location.service bỏ
 * qua toàn bộ lớp Goong — cascade hoạt động đúng như trước.
 */

export const GOONG_API_BASE = 'https://rsapi.goong.io';

/** Timeout cho mọi request Goong: chậm quá thì rơi xuống lớp OSM kế tiếp. */
const GOONG_TIMEOUT_MS = 6000;

/**
 * Đọc REST API key của Goong từ env (cùng pattern process.env.EXPO_PUBLIC_*
 * như services/socket.service.ts dùng cho EXPO_PUBLIC_API_URL).
 * Cần key loại "REST API" (không phải Map tiles key) tạo tại goong.io.
 */
export function getGoongApiKey(): string {
  const key = process.env.EXPO_PUBLIC_GOONG_API_KEY || '';
  // Kiểm tra key hợp lệ: Goong REST API key thường là chuỗi alphanumeric ~30 ký tự.
  // Nếu key là chuỗi base64 lỗi/dài bất thường (>100 ký tự) hoặc JSON blob thì bỏ qua.
  if (!key || key.length > 100 || key.startsWith('eyJ') || key.startsWith('{')) {
    return '';
  }
  return key;
}

// ─── Kiểu dữ liệu theo response của Goong (mô phỏng Google Geocoding/Places) ──

export interface GoongAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface GoongGeocodeResult {
  address_components?: GoongAddressComponent[];
  formatted_address?: string;
  geometry?: {
    location?: { lat: number; lng: number };
    location_type?: string;
  };
  place_id?: string;
  name?: string;
  types?: string[];
}

export interface GoongPrediction {
  description?: string;
  place_id?: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
  types?: string[];
}

export interface GoongPlaceDetail {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  address_components?: GoongAddressComponent[];
  geometry?: {
    location?: { lat: number; lng: number };
  };
  types?: string[];
}

/** Các mảnh địa chỉ đã trích từ address_components. '' khi Goong không trả. */
export interface GoongAddressParts {
  houseNumber: string;
  route: string;
  ward: string;
  district: string;
  city: string;
  country: string;
}

/** Khớp cấu trúc LocationResult của location.service.ts (structural typing). */
export interface GoongLocationResult {
  full_address: string;
  road: string;
  ward: string;
  district: string;
  city: string;
  coordinates: [number, number]; // [longitude, latitude]
}

/** Khớp cấu trúc OsmPlace của location.service.ts (structural typing). */
export interface GoongOsmPlace {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address: {
    house_number?: string;
    road?: string;
    suburb?: string;
    city_district?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

// ─── HTTP helper (pattern AbortController như services/offline.service.ts) ────

async function fetchJsonWithTimeout(url: string, timeoutMs = GOONG_TIMEOUT_MS): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Goong request failed: HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** UUID v4 đơn giản cho session token của Place AutoComplete (docs khuyến nghị). */
export function newAutocompleteSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Trích xuất thành phần địa chỉ ────────────────────────────────────────────

function componentByType(components: GoongAddressComponent[] | undefined, types: string[]): string {
  if (!components?.length) return '';
  for (const type of types) {
    const found = components.find(c => c.types?.includes(type));
    if (found?.long_name) return found.long_name;
  }
  return '';
}

/**
 * Map address_components của Goong sang các mảnh địa chỉ app cần.
 * Thứ tự ưu tiên theo quy ước dữ liệu địa chỉ Việt Nam của Goong/Google:
 * - Số nhà: street_number (đây là phần OSM hầu như không có ở VN).
 * - Phường/Xã: sublocality_level_1 (dự phòng: sublocality, ward, neighborhood).
 * - Quận/Huyện: administrative_area_level_2 (dự phòng: locality khi khác tỉnh).
 * - Tỉnh/Thành: administrative_area_level_1 (dự phòng: locality).
 * Không có thì để '' — TUYỆT ĐỐI không bịa giá trị mặc định.
 */
export function extractGoongAddressParts(
  components: GoongAddressComponent[] | undefined,
): GoongAddressParts {
  const city = componentByType(components, ['administrative_area_level_1', 'locality']);
  let district = componentByType(components, ['administrative_area_level_2']);
  if (!district) {
    const locality = componentByType(components, ['locality']);
    if (locality && locality !== city) district = locality;
  }
  return {
    houseNumber: componentByType(components, ['street_number']),
    route: componentByType(components, ['route']),
    ward: componentByType(components, [
      'sublocality_level_1',
      'sublocality',
      'ward',
      'neighborhood',
    ]),
    district,
    city,
    country: componentByType(components, ['country']),
  };
}

// ─── Reverse geocoding: GET /Geocode?latlng=lat,lng ──────────────────────────

export async function goongReverseGeocode(
  latitude: number,
  longitude: number,
  apiKey: string,
): Promise<GoongGeocodeResult | null> {
  const url = `${GOONG_API_BASE}/Geocode?latlng=${latitude},${longitude}&api_key=${encodeURIComponent(apiKey)}`;
  const json = await fetchJsonWithTimeout(url);
  const result = json?.results?.[0];
  return result ?? null;
}

/**
 * Map 1 kết quả reverse-geocode của Goong sang LocationResult của app.
 * road = "số nhà + tên đường" — mục đích chính của việc tích hợp Goong.
 * full_address ưu tiên formatted_address của Goong (đã là chuỗi địa chỉ VN
 * hoàn chỉnh); không có mới tự ghép từ các mảnh (bỏ qua mảnh rỗng).
 * coordinates giữ nguyên điểm người dùng đã ghim (như mọi lớp OSM khác).
 */
export function mapGoongGeocodeResult(
  result: GoongGeocodeResult,
  latitude: number,
  longitude: number,
): GoongLocationResult {
  const parts = extractGoongAddressParts(result.address_components);
  const road =
    [parts.houseNumber, parts.route].filter(Boolean).join(' ').trim() ||
    result.formatted_address?.split(',')[0]?.trim() ||
    '';
  const composed = [road, parts.ward, parts.district, parts.city].filter(Boolean).join(', ');
  return {
    full_address: result.formatted_address || composed,
    road: road || result.formatted_address || '',
    ward: parts.ward,
    district: parts.district,
    city: parts.city,
    coordinates: [longitude, latitude],
  };
}

// ─── Place AutoComplete + Place Detail (cho searchPlaces) ─────────────────────

export async function goongAutocomplete(
  input: string,
  apiKey: string,
  sessionToken: string,
  location?: { latitude: number; longitude: number } | null,
): Promise<GoongPrediction[]> {
  let url =
    `${GOONG_API_BASE}/Place/AutoComplete?api_key=${encodeURIComponent(apiKey)}` +
    `&input=${encodeURIComponent(input)}&sessiontoken=${encodeURIComponent(sessionToken)}`;
  if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
    url += `&location=${location.latitude},${location.longitude}`;
  }
  const json = await fetchJsonWithTimeout(url);
  const predictions: GoongPrediction[] = Array.isArray(json?.predictions) ? json.predictions : [];
  return predictions.filter(p => p?.place_id).slice(0, 8);
}

export async function goongPlaceDetail(
  placeId: string,
  apiKey: string,
  sessionToken: string,
): Promise<GoongPlaceDetail | null> {
  const url =
    `${GOONG_API_BASE}/Place/Detail?api_key=${encodeURIComponent(apiKey)}` +
    `&place_id=${encodeURIComponent(placeId)}&sessiontoken=${encodeURIComponent(sessionToken)}`;
  const json = await fetchJsonWithTimeout(url);
  // Goong trả { result: {...}, status } (kiểu Google Place Details);
  // dự phòng cả dạng results[0] nếu payload khác dự kiến.
  return json?.result ?? json?.results?.[0] ?? null;
}

/**
 * Map Place Detail (+ prediction gốc) sang OsmPlace của app.
 * place_id trong OsmPlace là number (id số của OSM) — Goong dùng id chuỗi
 * nên dùng index trong danh sách kết quả, giống fallback `p.osm_id || idx`
 * của lớp Photon hiện tại.
 */
export function mapGoongPlaceToOsmPlace(
  detail: GoongPlaceDetail,
  prediction: GoongPrediction | undefined,
  index: number,
): GoongOsmPlace | null {
  const loc = detail.geometry?.location;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
    return null;
  }
  const parts = extractGoongAddressParts(detail.address_components);
  return {
    place_id: index,
    display_name: detail.formatted_address || prediction?.description || detail.name || '',
    lat: String(loc.lat),
    lon: String(loc.lng),
    address: {
      house_number: parts.houseNumber || undefined,
      road: parts.route || detail.name || undefined,
      suburb: parts.ward || undefined,
      city_district: parts.district || undefined,
      district: parts.district || undefined,
      city: parts.city || undefined,
      state: parts.city || undefined,
      country: parts.country || undefined,
    },
  };
}

/**
 * Tìm địa điểm bằng Goong: AutoComplete lấy gợi ý → Place Detail lấy tọa độ
 * + thành phần địa chỉ cho từng gợi ý (picker hiện tại cần sẵn lat/lon trong
 * từng kết quả để đặt ghim ngay khi người dùng chạm vào).
 * Trả [] khi không có gợi ý/không resolve được — caller rơi xuống OSM.
 */
export async function searchPlacesWithGoong(
  query: string,
  apiKey: string,
  location?: { latitude: number; longitude: number } | null,
): Promise<GoongOsmPlace[]> {
  const sessionToken = newAutocompleteSessionToken();
  const predictions = await goongAutocomplete(query, apiKey, sessionToken, location);
  if (!predictions.length) return [];
  const details = await Promise.all(
    predictions.map(async (prediction, idx) => {
      try {
        const detail = await goongPlaceDetail(prediction.place_id as string, apiKey, sessionToken);
        return detail ? mapGoongPlaceToOsmPlace(detail, prediction, idx) : null;
      } catch {
        return null;
      }
    }),
  );
  return details.filter((d): d is GoongOsmPlace => d !== null);
}
