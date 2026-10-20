import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LiveTrackingMapProps {
  customerLocation: Coordinates;
  helperLocation?: Coordinates | null;
  customerAddress?: string;
  helperName?: string;
  etaMinutes?: number;
  height?: number;
  status?: string;
  title?: string;
}

export function LiveTrackingMap({
  customerLocation,
  helperLocation,
  customerAddress = 'Vị trí làm việc',
  helperName = 'Thợ Green House',
  etaMinutes = 15,
  height = 240,
  status = 'open',
  title,
}: LiveTrackingMapProps) {
  const webViewRef = useRef<WebView>(null);

  const isTracking =
    (status === 'helper_on_the_way' || status === 'helper_arrived') && !!helperLocation;

  const custLat = customerLocation?.latitude || 10.7725;
  const custLon = customerLocation?.longitude || 106.6983;

  const helpLat = helperLocation?.latitude ?? custLat + 0.009;
  const helpLon = helperLocation?.longitude ?? custLon + 0.007;

  let pillText = title || 'Vị trí điểm hẹn làm việc';
  let pillIcon = '📍';

  if (status === 'helper_on_the_way') {
    pillText = `Thợ ${helperName} đang di chuyển (${etaMinutes} phút)`;
    pillIcon = '🚗';
  } else if (status === 'helper_arrived') {
    pillText = `Thợ ${helperName} đã có mặt tại điểm hẹn`;
    pillIcon = '📍';
  } else if (status === 'in_progress') {
    pillText = 'Đang tiến hành công việc tại địa chỉ';
    pillIcon = '▶️';
  } else if (status === 'open' || status === 'receiving_quotes') {
    pillText = 'Vị trí làm việc • Đang kết nối thợ lân cận';
    pillIcon = '📡';
  }

  // Cập nhật vị trí Thợ thời gian thực trên bản đồ Leaflet
  useEffect(() => {
    if (Platform.OS !== 'web' && webViewRef.current && isTracking && helperLocation) {
      const script = `
        if (window.updateHelperPosition) {
          window.updateHelperPosition(${helperLocation.latitude}, ${helperLocation.longitude}, ${etaMinutes});
        }
      `;
      webViewRef.current.injectJavaScript(script);
    }
  }, [helperLocation?.latitude, helperLocation?.longitude, etaMinutes, isTracking]);

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
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-size: 20px;
          }
          .customer-pin {
            background-color: #10B981;
            width: 40px;
            height: 40px;
          }
          .helper-pin {
            background-color: #3B82F6;
            width: 42px;
            height: 42px;
            animation: pulse 1.6s infinite;
          }
          @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
            70% { box-shadow: 0 0 0 14px rgba(59, 130, 246, 0); }
            100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
          }
          .leaflet-control-attribution {
            display: none !important;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const custLat = ${custLat};
          const custLon = ${custLon};
          const isTracking = ${isTracking};
          const helpLat = ${helpLat};
          const helpLon = ${helpLon};

          const map = L.map('map', {
            zoomControl: true,
            attributionControl: false
          });

          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          }).addTo(map);

          // Marker Điểm hẹn của Khách hàng
          const custIcon = L.divIcon({
            className: 'custom-pin customer-pin',
            html: '🏠',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
          });
          const custMarker = L.marker([custLat, custLon], { icon: custIcon }).addTo(map);
          custMarker.bindPopup("<b>Điểm hẹn làm việc</b><br>${customerAddress.replace(/"/g, '')}").openPopup();

          if (isTracking) {
            // Marker Thợ di chuyển
            const helpIcon = L.divIcon({
              className: 'custom-pin helper-pin',
              html: '🛵',
              iconSize: [42, 42],
              iconAnchor: [21, 21]
            });
            let helpMarker = L.marker([helpLat, helpLon], { icon: helpIcon }).addTo(map);
            helpMarker.bindPopup("<b>${helperName.replace(/"/g, '')}</b><br>Đang di chuyển tới bạn");

            // Lộ trình nối liền
            let routeLine = L.polyline([[helpLat, helpLon], [custLat, custLon]], {
              color: '#10B981',
              weight: 5,
              dashArray: '8, 8',
              opacity: 0.9
            }).addTo(map);

            const bounds = L.latLngBounds([[custLat, custLon], [helpLat, helpLon]]);
            map.fitBounds(bounds, { padding: [45, 45] });

            window.updateHelperPosition = function(newLat, newLon, eta) {
              if (helpMarker) helpMarker.setLatLng([newLat, newLon]);
              if (routeLine) routeLine.setLatLngs([[newLat, newLon], [custLat, custLon]]);
            };
          } else {
            // Vòng quét bán kính tìm thợ
            L.circle([custLat, custLon], {
              radius: 1200,
              color: '#10B981',
              fillColor: '#10B981',
              fillOpacity: 0.12,
              weight: 2,
              dashArray: '5, 5'
            }).addTo(map);

            map.setView([custLat, custLon], 15);
          }
        </script>
      </body>
    </html>
  `;

  return (
    <View style={[styles.container, { height }]}>
      {Platform.OS === 'web' ? (
        <iframe
          srcDoc={leafletHtml}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Green House Map"
        />
      ) : (
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
      )}

      {/* Floating Status Pill trên bản đồ */}
      <View style={styles.statusPill}>
        <View style={styles.pulseDot} />
        <Text style={styles.statusText}>
          {pillIcon} {pillText}
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
    top: 12,
    left: 12,
    right: 12,
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
  },
});
