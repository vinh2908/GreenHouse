export const PRODUCTION_API_URL = 'https://greenhouse-api-chb9.onrender.com/api/v1';

export function isLocalHost(host: string): boolean {
  return /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?|10(?:\.\d{1,3}){3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/i.test(host);
}

// A public deployment must never connect to a developer's localhost/LAN URL,
// even if Expo/Metro cached an EXPO_PUBLIC_* value from a previous QA export.
export function usableEndpoint(url: string | undefined, browserHost?: string, nativeDev = false): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) return false;
    if (!isLocalHost(parsed.hostname)) return true;
    return browserHost ? isLocalHost(browserHost) : nativeDev;
  } catch {
    return false;
  }
}
