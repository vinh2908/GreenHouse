import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { Navigation, Layers, ExternalLink } from 'lucide-react-native';

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
  etaMinutes = 12,
  height = 270,
  status = 'open',
  title,
  showNavigationButton = true,
}: LiveTrackingMapProps) {
  const webViewRef = useRef<WebView>(null);
  const iframeRef = useRef<any>(null);
  const [mapType, setMapType] = useState<'streets' | 'satellite'>('streets');

  const isTracking =
    (status === 'confirmed' ||
      status === 'helper_on_the_way' ||
      status === 'helper_arrived' ||
      status === 'in_progress') &&
    !!helperLocation &&
    (helperLocation.latitude !== 0 || helperLocation.longitude !== 0);

  const custLat = customerLocation?.latitude || 10.7725;
  const custLon = customerLocation?.longitude || 106.6983;

  const helpLat = helperLocation?.latitude ?? custLat + 0.009;
  const helpLon = helperLocation?.longitude ?? custLon + 0.007;

  let pillText = title || 'Vị trí điểm hẹn làm việc';
  let pillIcon = '📍';

  if (status === 'helper_on_the_way') {
    pillText = `🛵 Thợ ${helperName} đang di chuyển tới bạn (~${etaMinutes} phút)`;
    pillIcon = '🛵';
  } else if (status === 'helper_arrived') {
    pillText = `📍 Thợ ${helperName} đã có mặt tại điểm hẹn`;
    pillIcon = '📍';
  } else if (status === 'in_progress') {
    pillText = '▶️ Thợ đang tiến hành công việc tại địa chỉ';
    pillIcon = '▶️';
  } else if (status === 'confirmed') {
    pillText = `🛵 Thợ ${helperName} đã nhận đơn - Sẵn sàng di chuyển`;
    pillIcon = '🛵';
  } else if (status === 'open' || status === 'receiving_quotes') {
    pillText = '📡 Đang quét tìm thợ gần vị trí yêu cầu (bán kính 15km)';
    pillIcon = '📡';
  }

  const handleOpenGoogleMaps = () => {
    const dest = `${custLat},${custLon}`;
    const orig = isTracking ? `${helpLat},${helpLon}` : '';

    if (Platform.OS === 'android') {
      const navUrl = `google.navigation:q=${dest}&mode=d`;
      Linking.canOpenURL(navUrl)
        .then(supported => {
          if (supported) return Linking.openURL(navUrl);
          Linking.openURL(
            `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}&travelmode=driving`,
          );
        })
        .catch(() => {
          Linking.openURL(
            `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}&travelmode=driving`,
          );
        });
    } else if (Platform.OS === 'ios') {
      const navUrl = `comgooglemaps://?daddr=${dest}&directionsmode=driving`;
      Linking.canOpenURL(navUrl)
        .then(supported => {
          if (supported) return Linking.openURL(navUrl);
          Linking.openURL(`http://maps.apple.com/?daddr=${dest}&dirflg=d`);
        })
        .catch(() => {
          Linking.openURL(
            `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}&travelmode=driving`,
          );
        });
    } else {
      Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}&travelmode=driving`,
      );
    }
  };

  const toggleLayer = () => {
    const next = mapType === 'streets' ? 'satellite' : 'streets';
    setMapType(next);
    if (Platform.OS === 'web' && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'switchLayer', layer: next }, '*');
    } else if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`if (window.switchLayer) window.switchLayer('${next}');`);
    }
  };

  // Cập nhật vị trí Thợ thời gian thực trên bản đồ Leaflet (Web & Native)
  useEffect(() => {
    if (!helperLocation) return;

    if (Platform.OS === 'web' && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'updateHelperPosition',
          lat: helperLocation.latitude,
          lon: helperLocation.longitude,
          eta: etaMinutes,
        },
        '*',
      );
    } else if (webViewRef.current) {
      const script = `
        if (window.updateHelperPosition) {
          window.updateHelperPosition(${helperLocation.latitude}, ${helperLocation.longitude}, ${etaMinutes});
        }
      `;
      webViewRef.current.injectJavaScript(script);
    }
  }, [helperLocation?.latitude, helperLocation?.longitude, etaMinutes]);

  // Mã nguồn HTML Leaflet + OpenStreetMap + OSRM Routing + Grab Visual Styling
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
            background-color: #f8fafc;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          .custom-pin {
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            border: 3px solid #ffffff;
            box-shadow: 0 4px 14px rgba(0,0,0,0.35);
            font-size: 21px;
            cursor: pointer;
          }
          .customer-pin {
            background-color: #EF4444;
            width: 42px;
            height: 42px;
          }
          .helper-pin {
            background-color: #00B14F;
            width: 46px;
            height: 46px;
            animation: grab-pulse 1.8s infinite;
          }
          .leaflet-marker-icon {
            transition: transform 0.6s linear, top 0.6s linear, left 0.6s linear;
          }
          @keyframes grab-pulse {
            0% { box-shadow: 0 0 0 0 rgba(0, 177, 79, 0.75); }
            70% { box-shadow: 0 0 0 18px rgba(0, 177, 79, 0); }
            100% { box-shadow: 0 0 0 0 rgba(0, 177, 79, 0); }
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
            bottom: 16px;
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
            background: rgba(17, 24, 39, 0.90);
            color: #ffffff;
            padding: 7px 14px;
            border-radius: 12px;
            font-size: 12.5px;
            font-weight: 800;
            backdrop-filter: blur(6px);
            box-shadow: 0 3px 10px rgba(0,0,0,0.25);
            border: 1px solid rgba(255,255,255,0.15);
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
          let curHelpLat = ${helpLat};
          let curHelpLon = ${helpLon};
          const initialType = '${mapType}';

          const map = L.map('map', {
            zoomControl: true,
            attributionControl: false
          });

          // OpenStreetMap detail tiles
          const streetLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          });

          // Esri Satellite Imagery
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

          // Customer Pin (Home / Job address)
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
            "<b>Tọa độ:</b> " + custLat.toFixed(5) + ", " + custLon.toFixed(5)
          );

          let routeLine = null;
          let routeBg = null;
          let helpMarker = null;

          function renderRoute(hLat, hLon, cLat, cLon) {
            const osrmUrl = "https://router.project-osrm.org/route/v1/driving/" +
              hLon + "," + hLat + ";" + cLon + "," + cLat +
              "?overview=full&geometries=geojson";

            fetch(osrmUrl)
              .then(function(res) { return res.json(); })
              .then(function(data) {
                if (data && data.routes && data.routes[0]) {
                  const route = data.routes[0];
                  if (routeBg) map.removeLayer(routeBg);
                  if (routeLine) map.removeLayer(routeLine);

                  // Grab Route Border (Dark Green)
                  routeBg = L.geoJSON(route.geometry, {
                    style: { color: '#00823A', weight: 8, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }
                  }).addTo(map);

                  // Grab Route Core (Signature Grab Green)
                  routeLine = L.geoJSON(route.geometry, {
                    style: { color: '#00B14F', weight: 5, opacity: 1.0, lineCap: 'round', lineJoin: 'round' }
                  }).addTo(map);

                  map.fitBounds(routeLine.getBounds(), { padding: [50, 50], maxZoom: 16 });

                  const km = (route.distance / 1000).toFixed(1);
                  const mins = Math.max(1, Math.round(route.duration / 60));
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
                if (routeBg) map.removeLayer(routeBg);
                if (routeLine) map.removeLayer(routeLine);

                routeLine = L.polyline([[hLat, hLon], [cLat, cLon]], {
                  color: '#00B14F',
                  weight: 5,
                  dashArray: '8, 8',
                  opacity: 0.95
                }).addTo(map);

                const bounds = L.latLngBounds([[cLat, cLon], [hLat, hLon]]);
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
              });
          }

          if (isTracking) {
            // Helper Marker
            const helpIcon = L.divIcon({
              className: 'custom-pin helper-pin',
              html: '🛵',
              iconSize: [46, 46],
              iconAnchor: [23, 23]
            });
            helpMarker = L.marker([curHelpLat, curHelpLon], { icon: helpIcon }).addTo(map);
            helpMarker.bindPopup("<b>${helperName.replace(/"/g, '')}</b><br>🛵 Đang di chuyển theo tuyến đường");

            renderRoute(curHelpLat, curHelpLon, custLat, custLon);
          } else {
            // Scanning radar circle around job address
            L.circle([custLat, custLon], {
              radius: 1200,
              color: '#00B14F',
              fillColor: '#00B14F',
              fillOpacity: 0.12,
              weight: 2,
              dashArray: '5, 5'
            }).addTo(map);

            map.setView([custLat, custLon], 16);
          }

          window.updateHelperPosition = function(newLat, newLon, eta) {
            curHelpLat = newLat;
            curHelpLon = newLon;
            if (helpMarker) {
              helpMarker.setLatLng([newLat, newLon]);
            } else {
              const helpIcon = L.divIcon({
                className: 'custom-pin helper-pin',
                html: '🛵',
                iconSize: [46, 46],
                iconAnchor: [23, 23]
              });
              helpMarker = L.marker([newLat, newLon], { icon: helpIcon }).addTo(map);
            }
            renderRoute(newLat, newLon, custLat, custLon);
          };

          window.addEventListener('message', function(e) {
            if (e.data && e.data.type === 'updateHelperPosition') {
              window.updateHelperPosition(e.data.lat, e.data.lon, e.data.eta);
            } else if (e.data && e.data.type === 'switchLayer') {
              window.switchLayer(e.data.layer);
            }
          });

          function locateUser() {
            map.locate({ setView: true, maxZoom: 17 });
          }
          map.on('locationfound', function(e) {
            L.circleMarker(e.latlng, { radius: 8, color: '#2563EB', fillColor: '#60A5FA', fillOpacity: 0.9 }).addTo(map);
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
            ref={iframeRef}
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
        <TouchableOpacity onPress={toggleLayer} activeOpacity={0.8} style={styles.layerButton}>
          <Layers size={14} color="#1F2937" />
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#1F2937' }}>
            {mapType === 'streets' ? '🛰️ Vệ tinh' : '🗺️ Bản đồ'}
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
            <Navigation size={17} color="#FFFFFF" />
            <Text style={styles.navButtonText}>Chỉ đường Google Maps (Bật dẫn đường & Ngã rẽ)</Text>
            <ExternalLink size={14} color="rgba(255,255,255,0.85)" />
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
    backgroundColor: '#00B14F',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
    flex: 1,
  },
  navButton: {
    flex: 1,
    height: 46,
    backgroundColor: '#00B14F',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    shadowColor: '#00B14F',
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
