/**
 * use-background-gps.ts
 *
 * Registers an Expo background location task so the helper's GPS continues
 * to be sent even when the screen is locked or the user switches to another
 * app (e.g. opens Google Maps for navigation).
 *
 * Requirements (native only – ignored on web):
 *   • app.json: isAndroidBackgroundLocationEnabled + isAndroidForegroundServiceEnabled
 *   • Permissions: ACCESS_BACKGROUND_LOCATION + FOREGROUND_SERVICE_LOCATION
 *   • User must grant "Allow all the time" (Android) or "Always" (iOS) location.
 *
 * Usage: call `useBackgroundGps()` from the root SocketManager (after useLiveGps).
 * The task is started only when there is an active helper_on_the_way job; it is
 * stopped automatically when the job list empties or the user logs out.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { useAuthStore } from '@/stores/auth.store';
import { socketService } from '@/services/socket.service';
import { validCoordinate } from '@/services/tracking';
import apiClient from '@/services/api-client';
import { useQuery } from '@tanstack/react-query';

export const BACKGROUND_GPS_TASK = 'gh-background-gps';

// ─── Register the background task once at module load ───────────────────────
// TaskManager.defineTask must be called at the top level (not inside a hook).
if (Platform.OS !== 'web') {
  TaskManager.defineTask(BACKGROUND_GPS_TASK, async ({ data, error }: any) => {
    if (error) {
      console.warn('[BackgroundGPS] task error:', error.message);
      return;
    }
    const locations: Location.LocationObject[] = data?.locations ?? [];
    for (const loc of locations) {
      const { latitude, longitude, accuracy } = loc.coords;
      const recorded_at = loc.timestamp;
      if (
        !validCoordinate(latitude, longitude) ||
        !Number.isFinite(recorded_at) ||
        Date.now() - recorded_at > 30_000
      )
        continue;
      // Emit to all active jobs (stored in module-level set updated by the hook below)
      for (const jobId of activeJobIds) {
        socketService.updateLocation(jobId, latitude, longitude, recorded_at, accuracy ?? undefined);
      }
    }
  });
}

// Module-level set shared between task definition and the hook
const activeJobIds = new Set<string>();

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useBackgroundGps() {
  const userId = useAuthStore(s => s.user?._id);
  const isHelper = useAuthStore(
    s => s.isAuthenticated && s.user?.roles.some(r => r === 'helper'),
  );

  const { data: jobs } = useQuery<{ _id: string }[]>({
    queryKey: ['jobs', 'live-travel', userId],
    enabled: !!isHelper && Platform.OS !== 'web',
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
    ? (jobs ?? [])
        .map(j => j._id)
        .sort()
        .join(',')
    : '';

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Sync module-level set
    activeJobIds.clear();
    for (const id of jobIds.split(',').filter(Boolean)) activeJobIds.add(id);

    if (!jobIds) {
      // No active travel job — stop background task if running
      Location.hasStartedLocationUpdatesAsync(BACKGROUND_GPS_TASK)
        .then(running => {
          if (running) Location.stopLocationUpdatesAsync(BACKGROUND_GPS_TASK);
        })
        .catch(() => {});
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // Request background permission (prompts "Allow all the time" on Android)
        const { status } = await Location.requestBackgroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          console.warn(
            '[BackgroundGPS] background location not granted – foreground GPS still active',
          );
          return;
        }
        const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_GPS_TASK);
        if (cancelled) return;
        if (!running) {
          await Location.startLocationUpdatesAsync(BACKGROUND_GPS_TASK, {
            accuracy: Location.Accuracy.High,
            timeInterval: 3000,
            distanceInterval: 5,
            // Android foreground service notification (required)
            foregroundService: {
              notificationTitle: 'Green House đang chia sẻ hành trình',
              notificationBody: 'Khách hàng có thể theo dõi vị trí của bạn theo thời gian thực.',
              notificationColor: '#00b14f',
            },
            // Pause on significant motion changes (battery saving)
            pausesUpdatesAutomatically: false,
            // Show in background indicator on iOS
            showsBackgroundLocationIndicator: true,
          });
        }
      } catch (err: any) {
        console.warn('[BackgroundGPS] could not start background updates:', err?.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobIds]);

  // Stop task on logout
  useEffect(() => {
    if (Platform.OS === 'web' || isHelper) return;
    activeJobIds.clear();
    Location.hasStartedLocationUpdatesAsync(BACKGROUND_GPS_TASK)
      .then(running => {
        if (running) Location.stopLocationUpdatesAsync(BACKGROUND_GPS_TASK);
      })
      .catch(() => {});
  }, [isHelper]);
}

