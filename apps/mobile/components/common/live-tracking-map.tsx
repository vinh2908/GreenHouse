import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS } from '@/components/ui';

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface LiveTrackingMapProps {
  customerLocation: Coordinates;
  helperLocation?: Coordinates | null;
  customerAddress?: string;
  helperName?: string;
  etaMinutes?: number;
  height?: number;
}

export function LiveTrackingMap({
  customerLocation,
  helperLocation,
  customerAddress = 'Vị trí của bạn',
  helperName = 'Thợ HomeMate',
  etaMinutes = 15,
  height = 280,
}: LiveTrackingMapProps) {
  const webViewRef = useRef<WebView>(null);

  // Vị trí mặc định của Thợ nếu đang di chuyển (cách khách khoảng 1.5km)
  const activeHelperCoords: Coordinates = helperLocation || {
    latitude: customerLocation.latitude + 0.011,
    longitude: customerLocation.longitude + 0.008,
  };

  // Cập nhật vị trí Thợ thời gian thực trên bản đồ Leaflet
  useEffect(() => {
    if (webViewRef.current && activeHelperCoords) {
      const script = `
        if (window.updateHelperPosition) {
          window.updateHelperPosition(${activeHelperCoords.latitude}, ${activeHelperCoords.longitude}, ${etaMinutes});
        }
      `;
      webViewRef.current.injectJavaScript(script);
    }
  }, [activeHelperCoords.latitude, activeHelperCoords.longitude, etaMinutes]);

  // Mã nguồn HTML Leaflet + OpenStreetMap 100% Free
  const leafletHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body, #map {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            background-color: #f8f9fa;
          }
          .custom-pin {
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            border: 3px solid #ffffff;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            font-size: 18px;
          }
          .customer-pin {
            background-color: #2563EB;
            width: 38px;
            height: 38px;
          }
          .helper-pin {
            background-color: #FF6B1A;
            width: 42px;
            height: 42px;
            animation: pulse 1.5s infinite;
          }
          @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(255, 107, 26, 0.6); }
            70% { box-shadow: 0 0 0 12px rgba(255, 107, 26, 0); }
            100% { box-shadow: 0 0 0 0 rgba(255, 107, 26, 0); }
          }
          .leaflet-control-attribution {
            display: none !important;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const custLat = ${customerLocation.latitude};
          const custLon = ${customerLocation.longitude};
          const helpLat = ${activeHelperCoords.latitude};
          const helpLon = ${activeHelperCoords.longitude};

          // Khởi tạo bản đồ OpenStreetMap
          const map = L.map('map', {
            zoomControl: false,
            attributionControl: false
          });

          // Layer ngói bản đồ OpenStreetMap 100% Miễn Phí
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          }).addTo(map);

          // Marker Nhà khách hàng
          const custIcon = L.divIcon({
            className: 'custom-pin customer-pin',
            html: '🏠',
            iconSize: [38, 38],
            iconAnchor: [19, 19]
          });
          const custMarker = L.marker([custLat, custLon], { icon: custIcon }).addTo(map);

          // Marker Thợ cứu hộ di chuyển
          const helpIcon = L.divIcon({
            className: 'custom-pin helper-pin',
            html: '🛵',
            iconSize: [42, 42],
            iconAnchor: [21, 21]
          });
          let helpMarker = L.marker([helpLat, helpLon], { icon: helpIcon }).addTo(map);

          // Đường nối lộ trình di chuyển (Màu cam)
          let routeLine = L.polyline([[helpLat, helpLon], [custLat, custLon]], {
            color: '#FF6B1A',
            weight: 4,
            dashArray: '8, 6',
            opacity: 0.9
          }).addTo(map);

          // Căn chỉnh khung hình bao trọn cả 2 vị trí
          const bounds = L.latLngBounds([[custLat, custLon], [helpLat, helpLon]]);
          map.fitBounds(bounds, { padding: [40, 40] });

          // Hàm cập nhật vị trí thời gian thực từ React Native
          window.updateHelperPosition = function(newLat, newLon, eta) {
            if (helpMarker) {
              helpMarker.setLatLng([newLat, newLon]);
            }
            if (routeLine) {
              routeLine.setLatLngs([[newLat, newLon], [custLat, custLon]]);
            }
          };
        </script>
      </body>
    </html>
  `;

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: leafletHtml }}
        style={styles.webView}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        androidLayerType="hardware"
      />

      {/* Floating Status Pill trên bản đồ */}
      <View style={styles.statusPill}>
        <View style={styles.pulseDot} />
        <Text style={styles.statusText}>
          Thợ đang di chuyển • Cách bạn ~1.5km ({etaMinutes} phút)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E2E8F0',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  webView: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F8F9FA',
  },
  statusPill: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  pulseDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#10B981',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
    flex: 1,
    letterSpacing: 0.1,
  },
});
