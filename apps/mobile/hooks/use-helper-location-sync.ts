import { useEffect } from 'react';
import { AppState } from 'react-native';
import apiClient from '@/services/api-client';
import { locationService } from '@/services/location.service';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

// Sends the phone's GPS position to the server; quotes are ranked by this location.
// The server ignores it when the helper has pinned a working address by hand.
export async function syncHelperLocation(): Promise<void> {
  const coords = await locationService.getCurrentCoordinates();
  if (!coords) return;
  await apiClient
    .patch('/helpers/me/location', {
      coordinates: [coords.longitude, coords.latitude],
      source: 'auto',
    })
    .catch(() => undefined);
}

// Keeps the helper's location current while the helper area is open, whether or not
// they are toggled online: on mount, when the app returns to the foreground, and
// every few minutes.
export function useHelperLocationSync() {
  useEffect(() => {
    syncHelperLocation();
    const interval = setInterval(syncHelperLocation, SYNC_INTERVAL_MS);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') syncHelperLocation();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);
}
