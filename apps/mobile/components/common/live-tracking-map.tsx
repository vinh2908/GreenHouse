import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Navigation, Layers } from 'lucide-react-native';
import { TRACKING_MAP_HTML } from './tracking-map-document';
import { trackingTitle, validCoordinate } from '@/services/tracking';

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
const WEBVIEW_SOURCE = { html: TRACKING_MAP_HTML };

export function LiveTrackingMap({
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
  const webViewRef = useRef<WebView>(null);
  const iframeRef = useRef<any>(null);
  const ready = useRef(false);
  const [layer, setLayer] = useState<'streets' | 'satellite'>('streets');
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [deviceLocation, setDeviceLocation] = useState<{
    latitude: number;
    longitude: number;
    recordedAt: number;
  } | null>(null);

  // Khi viewer là thợ: tự theo dõi vị trí live của thiết bị mình để hiển thị marker và đường đi ngay lập tức
  useEffect(() => {
    if (viewerRole !== 'helper') return;
    let disposed = false;
    let removeSub: (() => void) | undefined;

    const startLocalWatch = async () => {
      // 1. Web browser
      if (Platform.OS === 'web') {
        const nav = (globalThis as any).navigator?.geolocation;
        if (nav?.watchPosition) {
          const watchId = nav.watchPosition(
            (pos: any) => {
              if (disposed) return;
              if (validCoordinate(pos?.coords?.latitude, pos?.coords?.longitude)) {
                setDeviceLocation({
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                  recordedAt: pos.timestamp || Date.now(),
                });
              }
            },
            () => {},
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
            if (
              !disposed &&
              last?.coords &&
              validCoordinate(last.coords.latitude, last.coords.longitude)
            ) {
              setDeviceLocation({
                latitude: last.coords.latitude,
                longitude: last.coords.longitude,
                recordedAt: Date.now(),
              });
            }
          })
          .catch(() => {});

        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 5,
            timeInterval: 4000,
          },
          pos => {
            if (disposed) return;
            if (validCoordinate(pos?.coords?.latitude, pos?.coords?.longitude)) {
              setDeviceLocation({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                recordedAt: Date.now(),
              });
            }
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

  let helperPos = null;
  if (viewerRole === 'helper') {
    // Màn thợ: hiển thị vị trí live của chính thiết bị thợ kèm marker, không chờ feed GPS từ server
    if (deviceLocation && validCoordinate(deviceLocation.latitude, deviceLocation.longitude)) {
      helperPos = {
        lat: deviceLocation.latitude,
        lng: deviceLocation.longitude,
        recorded_at: Date.now(),
      };
    } else if (
      helperLocation &&
      validCoordinate(helperLocation.latitude, helperLocation.longitude)
    ) {
      helperPos = {
        lat: helperLocation.latitude,
        lng: helperLocation.longitude,
        recorded_at: helperRecordedAt || Date.now(),
      };
    }
  } else {
    // Màn khách: giữ nguyên chờ feed GPS từ server
    if (
      helperLocation &&
      validCoordinate(helperLocation.latitude, helperLocation.longitude) &&
      helperRecordedAt
    ) {
      helperPos = {
        lat: helperLocation.latitude,
        lng: helperLocation.longitude,
        recorded_at: helperRecordedAt,
      };
    }
  }

  const state = {
    channel: 'greenhouse-tracking',
    type: 'state',
    customer: validDestination
      ? { lat: customerLocation.latitude, lng: customerLocation.longitude }
      : null,
    helper: helperPos,
    tracking: status === 'helper_on_the_way',
    layer,
  };
  const latest = useRef(state);
  latest.current = state;
  const send = useCallback(() => {
    if (!ready.current) return;
    if (Platform.OS === 'web') {
      iframeRef.current?.contentWindow?.postMessage(latest.current, '*');
    } else {
      webViewRef.current?.injectJavaScript(
        `window.applyTrackingState && window.applyTrackingState(${JSON.stringify(latest.current)}); true;`,
      );
    }
  }, []);
  const receive = useCallback(
    (data: any) => {
      if (data?.channel !== 'greenhouse-tracking') return;
      if (data.type === 'ready') {
        ready.current = true;
        setLoadError(false);
        send();
      }
      if (data.type === 'metrics') callback.current?.(data.value);
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
    helperLocation?.latitude,
    helperLocation?.longitude,
    helperRecordedAt,
    deviceLocation?.latitude,
    deviceLocation?.longitude,
    viewerRole,
    status,
    layer,
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
    <View style={{ width: '100%', gap: 10 }}>
      <View style={[styles.container, { height }]}>
        {Platform.OS === 'web' ? (
          <iframe
            key={retry}
            ref={iframeRef}
            srcDoc={TRACKING_MAP_HTML}
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
            title="Bản đồ theo dõi người giúp việc"
          />
        ) : (
          <WebView
            key={retry}
            ref={webViewRef}
            source={WEBVIEW_SOURCE}
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
        <View style={styles.statusPill} pointerEvents="none">
          <View style={styles.dot} />
          <Text style={styles.statusText}>
            {status === 'helper_on_the_way'
              ? trackingTitle(status, viewerRole)
              : title || trackingTitle(status, viewerRole)}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Đổi lớp bản đồ"
          onPress={() => setLayer(value => (value === 'streets' ? 'satellite' : 'streets'))}
          style={styles.layerButton}
        >
          <Layers size={14} color="#1f2937" />
          <Text>{layer === 'streets' ? 'Vệ tinh' : 'Bản đồ'}</Text>
        </TouchableOpacity>
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
            <Text>Không tải được bản đồ. Chạm để thử lại.</Text>
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
            <Text style={styles.navText}>Chỉ đường bằng Google Maps</Text>
          </TouchableOpacity>
          <Text style={styles.note}>
            GPS được chia sẻ khi Green House đang mở. Khi chuyển sang ứng dụng khác, cập nhật có thể
            tạm dừng.
          </Text>
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { width: '100%', borderRadius: 20, overflow: 'hidden', backgroundColor: '#e2e8f0' },
  statusPill: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    backgroundColor: '#111827ed',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: { color: 'white', fontSize: 13, lineHeight: 19, fontWeight: '700', flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00b14f' },
  layerButton: {
    position: 'absolute',
    top: 78,
    right: 10,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
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
