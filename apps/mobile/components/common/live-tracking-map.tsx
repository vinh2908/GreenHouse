import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Navigation } from 'lucide-react-native';
import { TRACKING_MAP_HTML, buildTrackingMapHtml } from './tracking-map-document';
import { trackingTitle, validCoordinate } from '@/services/tracking';
import { useTranslation } from '@/hooks/use-i18n';

export interface Coordinates {
  latitude: number;
  longitude: number;
}
export interface RouteMetrics {
  distanceKm: number;
  etaMinutes: number;
}
export interface LiveTrackingMapProps {
  customerLocation: Coordinates;
  helperLocation?: Coordinates | null;
  helperRecordedAt?: number;
  customerAddress?: string;
  helperName?: string;
  height?: number;
  status?: string;
  title?: string;
  viewerRole?: 'customer' | 'helper';
  showNavigationButton?: boolean;
  onRouteMetrics?: (value: RouteMetrics | null) => void;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function LiveTrackingMapComponent({
  customerLocation,
  helperLocation,
  helperRecordedAt,
  height = 300,
  status = 'open',
  title,
  viewerRole = 'customer',
  showNavigationButton = false,
  onRouteMetrics,
}: LiveTrackingMapProps) {
  const { lang } = useTranslation();
  const mapHtml = useMemo(() => buildTrackingMapHtml(lang), [lang]);
  const webviewSource = useMemo(() => ({ html: mapHtml }), [mapHtml]);
  const webViewRef = useRef<WebView>(null);
  const iframeRef = useRef<any>(null);
  const ready = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [gpsError, setGpsError] = useState<{ error: boolean; reason: string } | null>(null);
  const [deviceLocation, setDeviceLocation] = useState<{
    latitude: number;
    longitude: number;
    recordedAt: number;
  } | null>(null);

  // Khi viewer là thợ: tự theo dõi vị trí live của thiết bị mình để hiển thị marker và đường đi ngay lập tức
  // Chống giật: chỉ cập nhật khi vị trí thợ di chuyển thực sự đáng kể (>= 15 mét) hoặc sau mỗi 30 giây
  useEffect(() => {
    if (viewerRole !== 'helper') return;
    let disposed = false;
    let removeSub: (() => void) | undefined;
    let lastDispatched: { lat: number; lng: number; time: number } | null = null;

    const handleNewPosition = (lat: number, lng: number, timestamp?: number) => {
      if (disposed) return;
      if (!validCoordinate(lat, lng)) return;
      setGpsError(null);

      const now = Date.now();
      if (
        !lastDispatched ||
        haversineMeters(lastDispatched.lat, lastDispatched.lng, lat, lng) >= 15 ||
        now - lastDispatched.time >= 30000
      ) {
        lastDispatched = { lat, lng, time: now };
        setDeviceLocation({
          latitude: lat,
          longitude: lng,
          recordedAt: timestamp || now,
        });
      }
    };

    const startLocalWatch = async () => {
      // 1. Web browser
      if (Platform.OS === 'web') {
        const nav = (globalThis as any).navigator?.geolocation;
        if (nav?.watchPosition) {
          const watchId = nav.watchPosition(
            (pos: any) => {
              handleNewPosition(pos?.coords?.latitude, pos?.coords?.longitude, pos?.timestamp);
            },
            (err: any) => {
              if (disposed) return;
              const reason =
                err?.code === 1
                  ? (lang === 'en' ? 'Location permission denied' : 'Quyền vị trí bị từ chối')
                  : err?.code === 3
                    ? (lang === 'en' ? 'GPS timeout' : 'Hết thời gian chờ GPS')
                    : (lang === 'en' ? 'Device GPS error' : 'Lỗi GPS thiết bị');
              setGpsError({ error: true, reason });
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
          );
          removeSub = () => nav.clearWatch(watchId);
          return;
        }
      }

      // 2. Native (Android/iOS APK)
      try {
        const { status: permStatus } = await Location.getForegroundPermissionsAsync();
        if (permStatus !== 'granted') {
          const req = await Location.requestForegroundPermissionsAsync();
          if (req.status !== 'granted') return;
        }

        // Lấy nhanh last known position để marker thợ hiện ra ngay
        Location.getLastKnownPositionAsync()
          .then(last => {
            if (last?.coords && validCoordinate(last.coords.latitude, last.coords.longitude)) {
              handleNewPosition(last.coords.latitude, last.coords.longitude, Date.now());
            }
          })
          .catch(() => {});

        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 15,
            timeInterval: 5000,
          },
          pos => {
            handleNewPosition(pos.coords.latitude, pos.coords.longitude, Date.now());
          },
        );
        removeSub = () => sub.remove();
      } catch (err) {
        console.warn('LiveTrackingMap helper watch error:', err);
      }
    };

    void startLocalWatch();
    return () => {
      disposed = true;
      removeSub?.();
    };
  }, [viewerRole]);

  const callback = useRef(onRouteMetrics);
  callback.current = onRouteMetrics;
  const validDestination = validCoordinate(customerLocation?.latitude, customerLocation?.longitude);

  const lastHelperRef = useRef<{ lat: number; lng: number; recorded_at: number } | null>(null);

  let candidatePos: { lat: number; lng: number; recorded_at: number } | null = null;
  if (viewerRole === 'helper') {
    if (deviceLocation && validCoordinate(deviceLocation.latitude, deviceLocation.longitude)) {
      candidatePos = {
        lat: deviceLocation.latitude,
        lng: deviceLocation.longitude,
        recorded_at: deviceLocation.recordedAt || Date.now(),
      };
    } else if (
      helperLocation &&
      validCoordinate(helperLocation.latitude, helperLocation.longitude)
    ) {
      candidatePos = {
        lat: helperLocation.latitude,
        lng: helperLocation.longitude,
        recorded_at: helperRecordedAt || Date.now(),
      };
    }
  } else {
    if (
      helperLocation &&
      validCoordinate(helperLocation.latitude, helperLocation.longitude) &&
      helperRecordedAt
    ) {
      candidatePos = {
        lat: helperLocation.latitude,
        lng: helperLocation.longitude,
        recorded_at: helperRecordedAt,
      };
    }
  }

  // Lọc chỉ đổi reference khi di chuyển >= 15 mét hoặc sau 30 giây
  if (candidatePos) {
    const prev = lastHelperRef.current;
    if (
      !prev ||
      haversineMeters(prev.lat, prev.lng, candidatePos.lat, candidatePos.lng) >= 15 ||
      candidatePos.recorded_at - prev.recorded_at >= 30000
    ) {
      lastHelperRef.current = candidatePos;
    }
  } else {
    lastHelperRef.current = null;
  }
  const helperPos = lastHelperRef.current;

  const state = {
    channel: 'greenhouse-tracking',
    type: 'state',
    customer: validDestination
      ? { lat: customerLocation.latitude, lng: customerLocation.longitude }
      : null,
    helper: helperPos,
    tracking: status === 'helper_on_the_way',
    gpsError: !!gpsError?.error,
    gpsErrorReason: gpsError?.reason || '',
    goongApiKey: process.env.EXPO_PUBLIC_GOONG_API_KEY || '',
    lang,
  };
  const latest = useRef(state);
  latest.current = state;

  const lastSentPayload = useRef<string>('');
  const send = useCallback(() => {
    if (!ready.current) return;
    const payloadStr = JSON.stringify(latest.current);
    if (payloadStr === lastSentPayload.current) return;
    lastSentPayload.current = payloadStr;

    if (Platform.OS === 'web') {
      iframeRef.current?.contentWindow?.postMessage(latest.current, '*');
    } else {
      webViewRef.current?.injectJavaScript(
        `window.applyTrackingState && window.applyTrackingState(${payloadStr}); true;`,
      );
    }
  }, []);

  const lastReportedMetrics = useRef<{ distanceKm: number; etaMinutes: number } | null>(null);

  const receive = useCallback(
    (data: any) => {
      if (data?.channel !== 'greenhouse-tracking') return;
      if (data.type === 'ready') {
        ready.current = true;
        setLoadError(false);
        send();
      }
      if (data.type === 'retry_gps') {
        setGpsError(null);
        setRetry(r => r + 1);
      }
      if (data.type === 'metrics') {
        const m = data.value;
        if (!m) {
          if (lastReportedMetrics.current !== null) {
            lastReportedMetrics.current = null;
            callback.current?.(null);
          }
          return;
        }
        const prev = lastReportedMetrics.current;
        // Chỉ gọi callback cập nhật số liệu khi khoảng cách đổi >= 0.1km hoặc ETA đổi phút
        if (
          !prev ||
          Math.abs(prev.distanceKm - m.distanceKm) >= 0.1 ||
          prev.etaMinutes !== m.etaMinutes
        ) {
          const rounded = {
            distanceKm: Math.round(m.distanceKm * 10) / 10,
            etaMinutes: Math.round(m.etaMinutes),
          };
          lastReportedMetrics.current = rounded;
          callback.current?.(rounded);
        }
      }
    },
    [send],
  );
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const browser = globalThis as any;
    const listener = (event: any) => {
      if (event.source === iframeRef.current?.contentWindow) receive(event.data);
    };
    browser.addEventListener('message', listener);
    return () => browser.removeEventListener('message', listener);
  }, [receive]);
  useEffect(send, [
    customerLocation?.latitude,
    customerLocation?.longitude,
    helperPos?.lat,
    helperPos?.lng,
    helperPos?.recorded_at,
    viewerRole,
    status,
    send,
  ]);
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!ready.current) setLoadError(true);
    }, 15000);
    return () => clearTimeout(timeout);
  }, [retry]);

  const openNavigation = () => {
    if (!validDestination) return;
    const destination = `${customerLocation.latitude},${customerLocation.longitude}`;
    // Maps obtains the phone's live origin; no synthetic/last-known origin.
    void Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`,
    ).catch(() => setLoadError(true));
  };
  return (
    <View style={{ width: '100%', gap: 8 }}>
      {/* Banner trạng thái đặt TRÊN khung map — Thẻ riêng ngoài map, 1 dòng không cắt chữ */}
      <View style={styles.topStatusCard}>
        <View style={styles.dot} />
        <Text style={styles.statusText} numberOfLines={1}>
          {status === 'helper_on_the_way'
            ? trackingTitle(status, viewerRole, lang)
            : title || trackingTitle(status, viewerRole, lang)}
        </Text>
      </View>

      <View style={[styles.container, { height }]}>
        {Platform.OS === 'web' ? (
          <iframe
            key={`${retry}-${lang}`}
            ref={iframeRef}
            srcDoc={mapHtml}
            onLoad={() => {
              // Recover the initial ready message if it preceded React's listener.
              const frame = iframeRef.current?.contentWindow;
              if (typeof frame?.applyTrackingState === 'function') {
                ready.current = true;
                setLoadError(false);
                send();
              }
            }}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title={lang === 'en' ? 'Helper live tracking map' : 'Bản đồ theo dõi người giúp việc'}
          />
        ) : (
          <WebView
            key={`${retry}-${lang}`}
            ref={webViewRef}
            source={webviewSource}
            originWhitelist={['*']}
            style={{ flex: 1 }}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            bounces={false}
            onLoadStart={() => {
              ready.current = false;
            }}
            onMessage={event => {
              try {
                receive(JSON.parse(event.nativeEvent.data));
              } catch {}
            }}
            onError={() => {
              ready.current = false;
              setLoadError(true);
            }}
            onContentProcessDidTerminate={() => {
              ready.current = false;
              setLoadError(true);
            }}
            onRenderProcessGone={() => {
              ready.current = false;
              setLoadError(true);
            }}
          />
        )}
        {loadError && (
          <TouchableOpacity
            style={styles.error}
            accessibilityRole="button"
            onPress={() => {
              ready.current = false;
              setLoadError(false);
              setRetry(value => value + 1);
            }}
          >
            <Text>{lang === 'en' ? 'Unable to load map. Tap to retry.' : 'Không tải được bản đồ. Chạm để thử lại.'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {showNavigationButton && validDestination && (
        <>
          <TouchableOpacity
            style={styles.navigation}
            onPress={openNavigation}
            accessibilityRole="button"
          >
            <Navigation size={18} color="white" />
            <Text style={styles.navText}>
              {lang === 'en' ? 'Directions via Google Maps' : 'Chỉ đường bằng Google Maps'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.note}>
            {lang === 'en'
              ? 'GPS is shared while Green House is open. When switching to other apps, updates may pause.'
              : 'GPS được chia sẻ khi Green House đang mở. Khi chuyển sang ứng dụng khác, cập nhật có thể tạm dừng.'}
          </Text>
        </>
      )}
    </View>
  );
}

export const LiveTrackingMap = React.memo(LiveTrackingMapComponent);
const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
    position: 'relative',
  },
  topStatusCard: {
    backgroundColor: '#111827ed',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: { color: 'white', fontSize: 13, lineHeight: 18, fontWeight: '700', flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00b14f' },
  error: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 10,
  },
  navigation: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#00b14f',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  navText: { color: 'white', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  note: { fontSize: 12, color: '#64748b', lineHeight: 17 },
});
