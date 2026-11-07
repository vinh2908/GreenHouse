import { useEffect } from 'react';
import { AppState } from 'react-native';
import apiClient from '@/services/api-client';
import { locationService } from '@/services/location.service';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
let lastSyncedCoords: { lat: number; lng: number } | null = null;
let lastSyncTimestamp = 0;

// Sends the phone's GPS position to the server; quotes are ranked by this location.
// The server ignores it when the helper has pinned a working address by hand.
// Lệnh 3: Giữ khoảng cách ổn định, không patch vị trí liên tục khi đứng yên.
export async function syncHelperLocation(force = false): Promise<void> {
  const now = Date.now();
  if (!force && lastSyncTimestamp > 0 && now - lastSyncTimestamp < 30 * 1000) {
    return;
  }
  const coords = await locationService.getCurrentCoordinates();
  if (!coords) return;

  if (lastSyncedCoords && !force) {
    const dLat = coords.latitude - lastSyncedCoords.lat;
    const dLng = coords.longitude - lastSyncedCoords.lng;
    const approxDistMeters = Math.sqrt(dLat * dLat + dLng * dLng) * 111000;
    // Nếu di chuyển dưới 150m và chưa hết chu kỳ 5 phút thì giữ nguyên toạ độ đã lưu
    if (approxDistMeters < 150 && now - lastSyncTimestamp < SYNC_INTERVAL_MS) {
      return;
    }
  }

  await apiClient
    .patch('/helpers/me/location', {
      coordinates: [coords.longitude, coords.latitude],
      source: 'auto',
    })
    .then(() => {
      lastSyncedCoords = { lat: coords.latitude, lng: coords.longitude };
      lastSyncTimestamp = Date.now();
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
