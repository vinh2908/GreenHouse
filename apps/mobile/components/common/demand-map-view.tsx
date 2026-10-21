// components/common/demand-map-view.tsx — Bản đồ nhu cầu (Roadmap Phase 2 — Feature 15)
// Hiển thị MapView (react-native-maps) với vòng tròn "nhiệt" theo số đơn đang mở
// của từng quận. Trên web react-native-maps không chạy → trả null để màn hình
// chỉ hiển thị danh sách (fallback an toàn, không crash).
import { Fragment, useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import type { DemandArea } from '@/hooks/use-api';

export const HCMC_CENTER = { latitude: 10.7725, longitude: 106.6983 };

interface Props {
  areas: DemandArea[];
  focus: DemandArea | null;
  height?: number;
}

export function DemandMapView({ areas, focus, height = 320 }: Props) {
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS === 'web' || !focus || focus.lat == null || focus.lng == null) return;
    mapRef.current?.animateToRegion(
      {
        latitude: focus.lat,
        longitude: focus.lng,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      },
      600,
    );
  }, [focus]);

  if (Platform.OS === 'web') return null;

  // Import động trong thân component: tránh lỗi bundling trên web.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const MapView = require('react-native-maps').default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Marker, Circle } = require('react-native-maps');

  const withCoords = areas.filter(a => a.lat != null && a.lng != null);
  const initial = focus && focus.lat != null && focus.lng != null ? focus : withCoords[0];
  const center = initial
    ? { latitude: initial.lat as number, longitude: initial.lng as number }
    : HCMC_CENTER;
  const maxJobs = Math.max(1, ...withCoords.map(a => a.open_jobs));

  return (
    <View style={{ height, borderRadius: 16, overflow: 'hidden' }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={{
          ...center,
          latitudeDelta: 0.12,
          longitudeDelta: 0.12,
        }}
      >
        {withCoords.map(area => {
          const coordinate = { latitude: area.lat as number, longitude: area.lng as number };
          // Bán kính vòng nhiệt: 600m + tỉ lệ theo số đơn (tối đa ~2.6km)
          const radius = 600 + (area.open_jobs / maxJobs) * 2000;
          return (
            <Fragment key={`${area.district}-${area.city}`}>
              <Circle
                center={coordinate}
                radius={radius}
                fillColor="rgba(34,197,94,0.25)"
                strokeColor="rgba(22,163,74,0.7)"
                strokeWidth={1.5}
              />
              <Marker
                coordinate={coordinate}
                title={`${area.district}, ${area.city}`}
                description={`${area.open_jobs} đơn đang chờ báo giá`}
                pinColor="#16A34A"
              />
            </Fragment>
          );
        })}
      </MapView>
    </View>
  );
}
