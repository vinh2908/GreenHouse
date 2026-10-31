// components/common/demand-map-view.tsx — Bản đồ nhu cầu cho thợ (Goong Vector Map)
// Đồng bộ 100% cho cả Web (iframe) và Native Android/iOS (WebView).
// Không dùng react-native-maps để tránh crash ứng dụng khi thiếu Google Play Services / API key.
import { useMemo } from 'react';
import { Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { DemandArea } from '@/hooks/use-api';
import { COLORS } from '@/components/ui';

export const DANANG_CENTER = { latitude: 16.0544, longitude: 108.2022 };

interface Props {
  areas: DemandArea[];
  focus: DemandArea | null;
  height?: number;
  userCoords?: { latitude: number; longitude: number } | null;
}

const demandMapHtml = (
  center: { latitude: number; longitude: number },
  zoom: number,
  areas: DemandArea[],
  focusedDistrict?: string | null,
  statusText = 'Bản đồ nhu cầu khu vực',
) => {
  const mapKey = process.env.EXPO_PUBLIC_GOONG_MAP_KEY || '';
  const areasJson = JSON.stringify(
    areas
      .filter(a => a.lat != null && a.lng != null)
      .map(a => ({
        district: a.district,
        city: a.city,
        open_jobs: a.open_jobs,
        fixed_price_jobs: a.fixed_price_jobs,
        lat: a.lat,
        lng: a.lng,
        isFocused: focusedDistrict ? a.district === focusedDistrict : false,
      })),
  );

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css" />
    <script src="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js"></script>
    <style>
      html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #f1f5f9; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .goong-attribution {
        position: absolute;
        bottom: 4px;
        right: 6px;
        background: rgba(255,255,255,0.88);
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 10px;
        color: #64748b;
        z-index: 10;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      .goong-attribution a { color: #0284c7; text-decoration: none; font-weight: 700; }
      .demand-pill {
        background: #16a34a;
        color: #ffffff;
        padding: 4px 10px;
        border-radius: 16px;
        font-size: 12px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 5px;
        box-shadow: 0 3px 8px rgba(0,0,0,0.25);
        border: 2px solid #ffffff;
        white-space: nowrap;
        cursor: pointer;
        user-select: none;
      }
      .demand-pill.focused {
        background: #dc2626;
        border-color: #fef08a;
        transform: scale(1.1);
      }
      .status-badge {
        position: absolute;
        top: 10px;
        left: 10px;
        background: rgba(255,255,255,0.92);
        backdrop-filter: blur(4px);
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        color: #1e293b;
        box-shadow: 0 2px 6px rgba(0,0,0,0.08);
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .pulse-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #22c55e;
        animation: pulse 1.8s infinite;
      }
      @keyframes pulse {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
        70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
      }
      .map-error-card {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: #f8fafc;
        color: #64748b;
        font-size: 13px;
        gap: 8px;
        padding: 16px;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <div class="status-badge">
      <span class="pulse-dot"></span>
      <span>${statusText}</span>
    </div>
    <div class="goong-attribution">© <a href="https://goong.io" target="_blank" rel="noopener">Goong Maps</a></div>
    <script>
      const mapKey = '${mapKey}';
      if (!mapKey) {
        document.getElementById('map').innerHTML = '<div class="map-error-card"><span>Chưa cấu hình khoá bản đồ Goong.</span></div>';
      } else {
        try {
          const map = new maplibregl.Map({
            container: 'map',
            style: 'https://tiles.goong.io/assets/goong_map_web.json?api_key=' + encodeURIComponent(mapKey),
            center: [${center.longitude}, ${center.latitude}],
            zoom: ${zoom},
            interactive: true,
            attributionControl: false
          });

          map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

          function addMountainFallbacks() {
            try {
              var canvas = document.createElement('canvas');
              canvas.width = 16;
              canvas.height = 16;
              var ctx = canvas.getContext('2d');
              ctx.clearRect(0, 0, 16, 16);
              var emptyData = ctx.getImageData(0, 0, 16, 16);
              if (!map.hasImage('mountain-11')) map.addImage('mountain-11', emptyData);
              if (!map.hasImage('mountain-15')) map.addImage('mountain-15', emptyData);
            } catch(e){}
            try {
              if (map.getLayer && map.getLayer('poi-mountain')) {
                map.setLayoutProperty('poi-mountain', 'icon-image', '');
              }
            } catch(e){}
          }

          map.on('styleimagemissing', function (e) {
            const id = e.id;
            if (!map.hasImage(id)) {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = 16;
                canvas.height = 16;
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 16, 16);
                map.addImage(id, ctx.getImageData(0, 0, 16, 16));
              } catch(err) {}
            }
          });

          map.on('styledata', function() {
            addMountainFallbacks();
          });

          map.on('load', function () {
            addMountainFallbacks();
            const areas = ${areasJson};
            if (areas && areas.length > 0) {
              const features = areas.map(function (a) {
                return {
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [a.lng, a.lat] },
                  properties: {
                    open_jobs: a.open_jobs,
                    district: a.district
                  }
                };
              });

              map.addSource('demand-heat', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: features }
              });

              map.addLayer({
                id: 'demand-heat-glow',
                type: 'circle',
                source: 'demand-heat',
                paint: {
                  'circle-radius': ['interpolate', ['linear'], ['get', 'open_jobs'], 1, 28, 5, 52, 15, 80],
                  'circle-color': '#22c55e',
                  'circle-opacity': 0.25,
                  'circle-stroke-width': 2,
                  'circle-stroke-color': '#16a34a',
                  'circle-stroke-opacity': 0.8
                }
              });

              areas.forEach(function (a) {
                const el = document.createElement('div');
                el.className = 'demand-pill' + (a.isFocused ? ' focused' : '');
                el.innerHTML = '<span>🔥</span><span>' + a.open_jobs + ' việc · ' + a.district + '</span>';
                new maplibregl.Marker({ element: el })
                  .setLngLat([a.lng, a.lat])
                  .addTo(map);
              });
            }
          });
        } catch (e) {
          document.getElementById('map').innerHTML = '<div class="map-error-card"><span>Không tải được bản đồ Goong.</span></div>';
        }
      }
    </script>
  </body>
</html>`;
};

export function DemandMapView({ areas, focus, height = 300, userCoords }: Props) {
  const withCoords = useMemo(
    () => (areas ?? []).filter(a => a.lat != null && a.lng != null),
    [areas],
  );
  const activeFocus = focus && focus.lat != null && focus.lng != null ? focus : withCoords[0];
  const center = activeFocus
    ? { latitude: activeFocus.lat as number, longitude: activeFocus.lng as number }
    : (userCoords ?? DANANG_CENTER);
  const zoom = activeFocus ? 13 : 12;
  const totalJobs = withCoords.reduce((sum, a) => sum + (a.open_jobs || 0), 0);
  const statusText =
    totalJobs > 0
      ? `${totalJobs} đơn chờ tại ${withCoords.length} khu vực`
      : 'Bản đồ nhu cầu việc quanh bạn';

  const html = useMemo(
    () => demandMapHtml(center, zoom, withCoords, activeFocus?.district, statusText),
    [center.latitude, center.longitude, zoom, withCoords, activeFocus?.district, statusText],
  );

  const mapKey = `${center.latitude},${center.longitude},${zoom},${activeFocus?.district || 'all'}`;

  return (
    <View
      style={{
        height,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: COLORS.gray[100],
      }}
    >
      {Platform.OS === 'web' ? (
        <iframe
          key={mapKey}
          srcDoc={html}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: COLORS.gray[100],
          }}
          title="Bản đồ nhu cầu"
        />
      ) : (
        <WebView
          key={mapKey}
          originWhitelist={['*']}
          source={{ html }}
          scrollEnabled={false}
          javaScriptEnabled
          domStorageEnabled
          androidLayerType="hardware"
          style={{ flex: 1, backgroundColor: COLORS.gray[100] }}
        />
      )}
    </View>
  );
}
