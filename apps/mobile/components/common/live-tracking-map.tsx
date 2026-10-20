import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { Navigation, Compass, Layers, ExternalLink } from 'lucide-react-native';

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
  showNavigationButton?: boolean;
}

export function LiveTrackingMap({
  customerLocation,
  helperLocation,
  customerAddress = 'Vị trí làm việc',
  helperName = 'Thợ Green House',
  etaMinutes = 15,
  height = 270,
  status = 'open',
  title,
  showNavigationButton = true,
}: LiveTrackingMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [mapType, setMapType] = useState<'streets' | 'satellite'>('streets');

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
    pillText = 'Vị trí làm việc • Đang quét thợ trong khu vực';
    pillIcon = '📡';
  }

  const handleOpenGoogleMaps = () => {
    const url = isTracking
      ? `https://www.google.com/maps/dir/?api=1&origin=${helpLat},${helpLon}&destination=${custLat},${custLon}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${custLat},${custLon}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://maps.google.com/?q=${custLat},${custLon}`);
    });
  };

  const toggleLayer = () => {
    const next = mapType === 'streets' ? 'satellite' : 'streets';
    setMapType(next);
    if (Platform.OS !== 'web' && webViewRef.current) {
      webViewRef.current.injectJavaScript(`if (window.switchLayer) window.switchLayer('${next}');`);
    }
  };

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

  // Mã nguồn HTML Leaflet + OpenStreetMap + OSRM Routing + Satellite Imagery
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
            background-color: #f1f5f9;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          .custom-pin {
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            border: 3px solid #ffffff;
            box-shadow: 0 4px 14px rgba(0,0,0,0.35);
            font-size: 20px;
          }
          .customer-pin {
            background-color: #10B981;
            width: 42px;
            height: 42px;
          }
          .helper-pin {
            background-color: #2563EB;
            width: 44px;
            height: 44px;
            animation: pulse 1.6s infinite;
          }
          @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); }
            70% { box-shadow: 0 0 0 16px rgba(37, 99, 235, 0); }
            100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
          }
          .leaflet-popup-content-wrapper {
            border-radius: 14px;
            padding: 4px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
          }
          .leaflet-popup-content {
            margin: 10px 14px;
            font-size: 13.5px;
            line-height: 1.45;
            color: #1F2937;
          }
          .leaflet-control-attribution {
            display: none !important;
          }
          .map-locate-btn {
            position: absolute;
            bottom: 20px;
            right: 14px;
            z-index: 1000;
            background: #ffffff;
            border: none;
            width: 40px;
            height: 40px;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 18px;
          }
          .route-info-badge {
            position: absolute;
            bottom: 14px;
            left: 14px;
            z-index: 1000;
            background: rgba(17, 24, 39, 0.88);
            color: #ffffff;
            padding: 6px 12px;
            border-radius: 10px;
            font-size: 12px;
            font-weight: 700;
            backdrop-filter: blur(4px);
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <button class="map-locate-btn" title="Vị trí của tôi" onclick="locateUser()">🎯</button>
        <div id="route-info" class="route-info-badge" style="display:none;"></div>

        <script>
          const custLat = ${custLat};
          const custLon = ${custLon};
          const isTracking = ${isTracking};
          const helpLat = ${helpLat};
          const helpLon = ${helpLon};
          const initialType = '${mapType}';

          const map = L.map('map', {
            zoomControl: true,
            attributionControl: false
          });

          // Layer đường phố OpenStreetMap chi tiết số nhà
          const streetLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          });

          // Layer vệ tinh Esri World Imagery độ phân giải cao
          const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
          });

          if (initialType === 'satellite') {
            satelliteLayer.addTo(map);
          } else {
            streetLayer.addTo(map);
          }

          window.switchLayer = function(type) {
            if (type === 'satellite') {
              map.removeLayer(streetLayer);
              satelliteLayer.addTo(map);
            } else {
              map.removeLayer(satelliteLayer);
              streetLayer.addTo(map);
            }
          };

          // Marker Điểm hẹn Khách hàng
          const custIcon = L.divIcon({
            className: 'custom-pin customer-pin',
            html: '🏠',
            iconSize: [42, 42],
            iconAnchor: [21, 21]
          });
          const custMarker = L.marker([custLat, custLon], { icon: custIcon }).addTo(map);
          custMarker.bindPopup(
            "<b>📍 Điểm hẹn làm việc</b><br>" +
            "<b>Địa chỉ:</b> ${customerAddress.replace(/"/g, '')}<br>" +
            "<b>Tọa độ GPS:</b> " + custLat.toFixed(5) + ", " + custLon.toFixed(5)
          ).openPopup();

          let routeLine = null;
          let helpMarker = null;

          if (isTracking) {
            // Marker Thợ di chuyển
            const helpIcon = L.divIcon({
              className: 'custom-pin helper-pin',
              html: '🛵',
              iconSize: [44, 44],
              iconAnchor: [22, 22]
            });
            helpMarker = L.marker([helpLat, helpLon], { icon: helpIcon }).addTo(map);
            helpMarker.bindPopup("<b>${helperName.replace(/"/g, '')}</b><br>Đang di chuyển tới bạn");

            // Gọi API OSRM tìm đường đi thực tế theo đường phố
            const osrmUrl = "https://router.project-osrm.org/route/v1/driving/" +
              helpLon + "," + helpLat + ";" + custLon + "," + custLat +
              "?overview=full&geometries=geojson";

            fetch(osrmUrl)
              .then(function(res) { return res.json(); })
              .then(function(data) {
                if (data && data.routes && data.routes[0]) {
                  const route = data.routes[0];
                  routeLine = L.geoJSON(route.geometry, {
                    style: { color: '#10B981', weight: 6, opacity: 0.95 }
                  }).addTo(map);

                  map.fitBounds(routeLine.getBounds(), { padding: [45, 45] });

                  const km = (route.distance / 1000).toFixed(1);
                  const mins = Math.round(route.duration / 60);
                  const infoEl = document.getElementById('route-info');
                  if (infoEl) {
                    infoEl.style.display = 'block';
                    infoEl.innerText = "🛣️ Lộ trình: " + km + " km (~" + mins + " phút)";
                  }
                } else {
                  throw new Error("No route");
                }
              })
              .catch(function() {
                // Fallback nét đứt thẳng nếu OSRM timeout
                routeLine = L.polyline([[helpLat, helpLon], [custLat, custLon]], {
                  color: '#10B981',
                  weight: 5,
                  dashArray: '8, 8',
                  opacity: 0.9
                }).addTo(map);
                const bounds = L.latLngBounds([[custLat, custLon], [helpLat, helpLon]]);
                map.fitBounds(bounds, { padding: [45, 45] });
              });

            window.updateHelperPosition = function(newLat, newLon, eta) {
              if (helpMarker) helpMarker.setLatLng([newLat, newLon]);
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

            map.setView([custLat, custLon], 16);
          }

          function locateUser() {
            map.locate({ setView: true, maxZoom: 18 });
          }
          map.on('locationfound', function(e) {
            L.circleMarker(e.latlng, { radius: 7, color: '#3B82F6', fillColor: '#60A5FA', fillOpacity: 0.9 }).addTo(map);
          });
        </script>
      </body>
    </html>
  `;

  return (
    <View style={{ width: '100%', gap: 10 }}>
      {/* Khung bản đồ */}
      <View style={[styles.container, { height }]}>
        {Platform.OS === 'web' ? (
          <iframe
            srcDoc={leafletHtml}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="Green House Interactive Map"
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

        {/* Floating Status Pill trên đầu bản đồ */}
        <View style={styles.statusPill}>
          <View style={styles.pulseDot} />
          <Text style={styles.statusText} numberOfLines={1}>
            {pillIcon} {pillText}
          </Text>
        </View>

        {/* Nút đổi kiểu Vệ tinh / Đường phố */}
        <TouchableOpacity
          onPress={toggleLayer}
          activeOpacity={0.8}
          style={styles.layerButton}
        >
          <Layers size={14} color="#1F2937" />
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#1F2937' }}>
            {mapType === 'streets' ? '🛰️ Vệ tinh' : '🗺️ Đường phố'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Thanh công cụ: Mở Google Maps chỉ đường turn-by-turn */}
      {showNavigationButton && (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <TouchableOpacity
            onPress={handleOpenGoogleMaps}
            activeOpacity={0.85}
            style={styles.navButton}
          >
            <Navigation size={16} color="#FFFFFF" />
            <Text style={styles.navButtonText}>
              Chỉ đường Google Maps (Xem số nhà & Ngã rẽ)
            </Text>
            <ExternalLink size={14} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>
      )}
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
  layerButton: {
    position: 'absolute',
    top: 54,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
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
  navButton: {
    flex: 1,
    height: 44,
    backgroundColor: '#2563EB',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  navButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
});
