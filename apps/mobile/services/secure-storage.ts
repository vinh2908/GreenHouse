import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store has no web implementation; when the app runs in a browser
// (expo start --web) fall back to localStorage so login still works.
const isWeb = Platform.OS === 'web';
type WebStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
const webStore = (globalThis as { localStorage?: WebStore }).localStorage;

export async function getItemAsync(key: string): Promise<string | null> {
  if (isWeb) return webStore?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (isWeb) {
    webStore?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (isWeb) {
    webStore?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
