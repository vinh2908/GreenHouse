import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { useAuthStore } from '@/stores/auth.store';
import { useOfflineStore } from '@/stores/offline.store';
import apiClient from '@/services/api-client';
import { socketService, SOCKET_EVENTS } from '@/services/socket.service';
import { TrackingPoint, validCoordinate } from '@/services/tracking';

export const useLiveGpsStore = create<{
  point: TrackingPoint | null;
  error: string | null;
}>(() => ({ point: null, error: null }));

// Mounted at the root: changing tabs or opening chat must not stop the journey's GPS.
// Foreground only; browsers/OS may suspend GPS when locked or another app is opened.
export function useLiveGps() {
  const userId = useAuthStore(s => s.user?._id);
  const isHelper = useAuthStore(
    s => s.isAuthenticated && s.user?.roles.some(role => role === 'helper'),
  );
  const pendingOnTheWayJobIds = useOfflineStore(s => s.pendingOnTheWayJobIds);
  const qc = useQueryClient();
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const { data: jobs } = useQuery<{ _id: string }[]>({
    queryKey: ['jobs', 'live-travel', userId],
    enabled: !!isHelper && foreground,
    queryFn: async () =>
      (
        await apiClient.get('/jobs/helper/my', {
          params: { status: 'helper_on_the_way' },
        })
      ).data.data,
    staleTime: 0,
    refetchInterval: 15_000,
  });
  const jobIds = isHelper
    ? Array.from(
        new Set([...(jobs || []).map(job => job._id), ...pendingOnTheWayJobIds].filter(Boolean)),
      )
        .sort()
        .join(',')
    : '';
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state === 'active') qc.invalidateQueries({ queryKey: ['jobs', 'live-travel'] });
    });
    const unsubscribe = socketService.on(SOCKET_EVENTS.JOB_STATUS_CHANGED, () =>
      qc.invalidateQueries({ queryKey: ['jobs', 'live-travel'] }),
    );
    return () => {
      sub.remove();
      unsubscribe();
    };
  }, [qc]);

  useEffect(() => {
    useLiveGpsStore.setState({ point: null, error: null });
    if (!jobIds || !foreground) return;
    let disposed = false;
    let removeWatch: (() => void) | undefined;
    let lastSent = 0;
    let latest: TrackingPoint | null = null;
    const send = () => {
      if (!latest || Date.now() - latest.recorded_at > 30_000) return;
      let sentAny = false;
      for (const id of jobIds.split(',')) {
        if (
          socketService.updateLocation(
            id,
            latest.lat,
            latest.lng,
            latest.recorded_at,
            latest.accuracy,
          )
        ) {
          sentAny = true;
        }
      }
      if (sentAny) {
        lastSent = Date.now();
        useLiveGpsStore.setState({ error: null });
      } else if (!socketService.isConnected) {
        useLiveGpsStore.setState({
          error: 'Mất kết nối máy chủ khi gửi vị trí, đang tự nối lại…',
        });
      }
    };
    const receive = (position: {
      coords: { latitude: number; longitude: number; accuracy: number | null };
      timestamp: number;
    }) => {
      if (disposed) return;
      const { latitude, longitude, accuracy } = position.coords;
      if (
        !Number.isFinite(position.timestamp) ||
        !validCoordinate(latitude, longitude) ||
        (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100)) ||
        Date.now() - position.timestamp > 30_000 ||
        position.timestamp > Date.now() + 10_000
      ) {
        useLiveGpsStore.setState({ error: 'GPS chưa đủ chính xác. Hãy bật vị trí chính xác.' });
        return;
      }
      if (latest && position.timestamp <= latest.recorded_at) return;
      latest = {
        lat: latitude,
        lng: longitude,
        accuracy: accuracy ?? undefined,
        recorded_at: position.timestamp,
      };
      useLiveGpsStore.setState({ point: latest, error: null });
      if (Date.now() - lastSent >= 2000) send();
    };
    const fail = () => {
      if (!disposed)
        useLiveGpsStore.setState({
          error: 'Chưa lấy được GPS. Hãy bật định vị và cấp quyền vị trí chính xác cho ứng dụng.',
        });
    };
    const unsubSocket = socketService.onStatusChange(st => {
      if (disposed) return;
      if (st.status === 'connected') {
        send();
      } else if (st.status === 'disconnected' && st.error) {
        useLiveGpsStore.setState({
          error: 'Mất kết nối máy chủ khi gửi vị trí, đang tự nối lại…',
        });
      }
    });
    void (async () => {
      try {
        if (Platform.OS === 'web') {
          const geo = (globalThis as any).navigator?.geolocation;
          if (!geo) {
            fail();
            return;
          }
          geo.getCurrentPosition(receive, () => undefined, {
            enableHighAccuracy: true,
            maximumAge: 5_000,
            timeout: 10_000,
          });
          const watch = geo.watchPosition(receive, fail, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 15_000,
          });
          removeWatch = () => geo.clearWatch(watch);
        } else {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (disposed) return;
          if (permission.status !== 'granted') {
            fail();
            return;
          }
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
            .then(pos => {
              if (!disposed && pos) receive(pos as any);
            })
            .catch(() => undefined);
          const watcher = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              timeInterval: 2000,
              distanceInterval: 3,
            },
            receive,
            fail,
          );
          removeWatch = () => watcher.remove();
          if (disposed) removeWatch();
        }
      } catch {
        fail();
      }
    })();
    // Re-send only a still-fresh sample, including after a socket reconnect.
    const heartbeat = setInterval(send, 5000);
    return () => {
      disposed = true;
      unsubSocket();
      removeWatch?.();
      clearInterval(heartbeat);
      useLiveGpsStore.setState({ point: null, error: null });
    };
  }, [jobIds, foreground, userId]);
}
