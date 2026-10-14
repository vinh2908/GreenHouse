import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { MapPin, Search, X } from 'lucide-react-native';
import { COLORS } from '@/components/ui';
import { locationService, LocationResult, OsmPlace } from '@/services/location.service';

export interface PickerCoords {
  latitude: number;
  longitude: number;
}

// Leaflet + OpenStreetMap in a WebView: needs no Google Maps key, so it also renders
// on the emulator and in Expo Go.
const mapHtml = (center: PickerCoords, zoom: number, hasPin: boolean, interactive: boolean) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
      html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #f1f5f9; }
      .pin { font-size: 34px; line-height: 34px; text-align: center; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      const interactive = ${interactive};
      const map = L.map('map', {
        zoomControl: interactive,
        dragging: interactive,
        touchZoom: interactive,
        doubleClickZoom: interactive,
        scrollWheelZoom: interactive,
        boxZoom: interactive,
        keyboard: interactive,
      }).setView([${center.latitude}, ${center.longitude}], ${zoom});
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);

      const icon = L.divIcon({ className: 'pin', html: '📍', iconSize: [34, 34], iconAnchor: [17, 32] });
      let marker = ${hasPin} ? L.marker([${center.latitude}, ${center.longitude}], { icon }).addTo(map) : null;

      window.setPin = function (lat, lng, pan) {
        if (marker) marker.setLatLng([lat, lng]);
        else marker = L.marker([lat, lng], { icon }).addTo(map);
        if (pan) map.setView([lat, lng], Math.max(map.getZoom(), 16));
      };

      if (interactive) {
        map.on('click', function (e) {
          window.setPin(e.latlng.lat, e.latlng.lng, false);
          window.ReactNativeWebView.postMessage(JSON.stringify({ lat: e.latlng.lat, lng: e.latlng.lng }));
        });
      }
    </script>
  </body>
</html>`;

// Same bounds the API enforces: a pin outside Vietnam is a mis-tap, not a real address.
export const isInVietnam = (c: PickerCoords) =>
  c.latitude >= 8 && c.latitude <= 23.5 && c.longitude >= 102 && c.longitude <= 110;

// Roughly the middle of Vietnam, zoomed out, when nothing is pinned yet.
const DEFAULT_CENTER: PickerCoords = { latitude: 16.0, longitude: 107.5 };

/** Static map thumbnail of a pinned location. */
export function LocationPreview({ coords }: { coords: PickerCoords | null }) {
  if (!coords) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          backgroundColor: COLORS.gray[100],
        }}
      >
        <MapPin size={22} color={COLORS.gray[400]} />
        <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>Chưa chọn vị trí</Text>
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }} pointerEvents="none">
      <WebView
        key={`${coords.latitude},${coords.longitude}`}
        originWhitelist={['*']}
        source={{ html: mapHtml(coords, 15, true, false) }}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        androidLayerType="hardware"
        style={{ flex: 1, backgroundColor: COLORS.gray[100] }}
      />
    </View>
  );
}

interface LocationPickerProps {
  visible: boolean;
  title: string;
  initial: PickerCoords | null;
  onClose: () => void;
  /** geo is null when the address lookup failed; the coordinates are still valid. */
  onConfirm: (coords: PickerCoords, geo: LocationResult | null) => void;
}

/** Full-screen map: search an address or tap the map to drop the pin, then confirm. */
export function LocationPicker({
  visible,
  title,
  initial,
  onClose,
  onConfirm,
}: LocationPickerProps) {
  const webRef = useRef<WebView>(null);

  // A stored pin outside Vietnam is ignored: open on the whole country instead of
  // zooming into empty map somewhere abroad.
  const start = initial && isInVietnam(initial) ? initial : null;
  const [picked, setPicked] = useState<PickerCoords | null>(start);
  const [geo, setGeo] = useState<LocationResult | null>(null);
  const [resolving, setResolving] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OsmPlace[]>([]);
  const [searching, setSearching] = useState(false);

  // Built once per opening so typing in the search box does not reload the map.
  const html = useMemo(
    () => mapHtml(start ?? DEFAULT_CENTER, start ? 16 : 6, !!start, true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible],
  );

  const pick = async (coords: PickerCoords) => {
    setPicked(coords);
    setResolving(true);
    const found = await locationService.reverseGeocode(coords.latitude, coords.longitude);
    setGeo(found);
    setResolving(false);
  };

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setResults([]);
    setGeo(null);
    setPicked(start);
    if (start) pick(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Debounced address search (OpenStreetMap Nominatim).
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      setResults(await locationService.searchPlaces(query));
      setSearching(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const selectPlace = (place: OsmPlace) => {
    const coords = { latitude: parseFloat(place.lat), longitude: parseFloat(place.lon) };
    Keyboard.dismiss();
    setResults([]);
    setQuery(place.display_name.split(',').slice(0, 2).join(','));
    webRef.current?.injectJavaScript(
      `window.setPin(${coords.latitude}, ${coords.longitude}, true); true;`,
    );
    pick(coords);
  };

  const outside = !!picked && !isInVietnam(picked);
  const canSave = !!picked && !resolving && !outside;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {/* Header + search */}
        <View
          style={{
            paddingTop: 12,
            paddingHorizontal: 14,
            paddingBottom: 10,
            gap: 10,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.gray[100],
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                backgroundColor: COLORS.gray[100],
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} color={COLORS.gray[700]} />
            </TouchableOpacity>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: COLORS.gray[900] }}>
              {title}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderWidth: 1.5,
              borderColor: COLORS.gray[200],
              borderRadius: 12,
              paddingHorizontal: 12,
              backgroundColor: COLORS.gray[50],
            }}
          >
            <Search size={16} color={COLORS.gray[400]} />
            <TextInput
              style={{ flex: 1, paddingVertical: 10, fontSize: 14.5, color: COLORS.gray[900] }}
              placeholder="Tìm địa chỉ: số nhà, đường, phường, quận..."
              placeholderTextColor={COLORS.gray[400]}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
            />
            {searching && <ActivityIndicator size="small" color={COLORS.primary} />}
          </View>
        </View>

        {/* Map + search results overlay */}
        <View style={{ flex: 1 }}>
          <WebView
            ref={webRef}
            originWhitelist={['*']}
            source={{ html }}
            javaScriptEnabled
            domStorageEnabled
            androidLayerType="hardware"
            onMessage={e => {
              try {
                const { lat, lng } = JSON.parse(e.nativeEvent.data);
                if (typeof lat === 'number' && typeof lng === 'number') {
                  pick({ latitude: lat, longitude: lng });
                }
              } catch {
                // not a pin message
              }
            }}
            style={{ flex: 1 }}
          />
          {results.length > 0 && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                maxHeight: 280,
                backgroundColor: '#fff',
                borderBottomWidth: 1,
                borderBottomColor: COLORS.gray[200],
                elevation: 6,
              }}
            >
              <FlatList
                keyboardShouldPersistTaps="handled"
                data={results}
                keyExtractor={p => String(p.place_id)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => selectPlace(item)}
                    style={{
                      flexDirection: 'row',
                      gap: 8,
                      paddingHorizontal: 14,
                      paddingVertical: 11,
                      borderBottomWidth: 1,
                      borderBottomColor: COLORS.gray[100],
                    }}
                  >
                    <MapPin size={15} color={COLORS.primary} style={{ marginTop: 2 }} />
                    <Text style={{ flex: 1, fontSize: 13.5, color: COLORS.gray[800] }}>
                      {item.display_name}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>

        {/* Selected address + confirm */}
        <View
          style={{
            padding: 14,
            paddingBottom: 16,
            gap: 10,
            borderTopWidth: 1,
            borderTopColor: COLORS.gray[100],
          }}
        >
          <View style={{ flexDirection: 'row', gap: 6, minHeight: 34 }}>
            <MapPin size={15} color={COLORS.primary} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, fontSize: 13, color: COLORS.gray[700] }} numberOfLines={2}>
              {!picked
                ? 'Chạm vào bản đồ hoặc tìm địa chỉ để đặt ghim'
                : outside
                  ? 'Vị trí này nằm ngoài Việt Nam, hãy chọn lại'
                  : resolving
                    ? 'Đang tra địa chỉ...'
                    : (geo?.full_address ??
                      `${picked.latitude.toFixed(5)}, ${picked.longitude.toFixed(5)}`)}
            </Text>
          </View>
          <TouchableOpacity
            disabled={!canSave}
            activeOpacity={0.85}
            onPress={() => picked && canSave && onConfirm(picked, geo)}
            style={{
              paddingVertical: 14,
              borderRadius: 14,
              alignItems: 'center',
              backgroundColor: canSave ? COLORS.primary : COLORS.gray[300],
            }}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Lưu vị trí này</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
