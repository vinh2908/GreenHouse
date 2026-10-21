// stores/settings.store.ts — Cài đặt hiển thị (Feature 20: Tiếng Anh + cỡ chữ lớn)
// Persist bằng zustand/middleware persist + AsyncStorage (key 'gh_settings_v1').
// Trạng thái mặc định vi/normal nên app render đúng ngay cả trước khi hydrate xong;
// persist tự ghi lại lựa chọn của user sau mỗi lần đổi.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppLanguage = 'vi' | 'en';
export type TextSize = 'normal' | 'large';

interface SettingsState {
  language: AppLanguage;
  textSize: TextSize;
  setLanguage: (language: AppLanguage) => void;
  setTextSize: (textSize: TextSize) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      language: 'vi',
      textSize: 'normal',
      setLanguage: language => set({ language }),
      setTextSize: textSize => set({ textSize }),
    }),
    {
      name: 'gh_settings_v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/** Hệ số phóng cỡ chữ: 'large' = 1.25×, 'normal' = 1×. */
export const textScaleFor = (textSize: TextSize): number => (textSize === 'large' ? 1.25 : 1);
