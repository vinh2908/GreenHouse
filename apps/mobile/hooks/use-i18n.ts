// hooks/use-i18n.ts — Hook dịch + cỡ chữ cho các màn hình đã wire (Feature 20)
import { useCallback, useEffect } from 'react';
import { useSettingsStore, textScaleFor } from '@/stores/settings.store';
import { translate, translateServiceName, syncDayjsLocale, type I18nKey } from '@/services/i18n';

export function useTranslation() {
  const language = useSettingsStore(s => s.language);
  const textSize = useSettingsStore(s => s.textSize);
  const setLanguage = useSettingsStore(s => s.setLanguage);
  const setTextSize = useSettingsStore(s => s.setTextSize);

  useEffect(() => {
    syncDayjsLocale(language);
  }, [language]);

  const t = useCallback(
    (key: I18nKey | string, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language],
  );

  const tService = useCallback(
    (service: any) => translateServiceName(service, language),
    [language],
  );

  const textScale = textScaleFor(textSize);
  /** Nhân cỡ chữ theo cài đặt: fs(14) → 14 (thường) hoặc 17.5 (lớn). */
  const fs = useCallback((base: number) => Math.round(base * textScale * 10) / 10, [textScale]);

  return { t, tService, language, lang: language, setLanguage, textSize, setTextSize, textScale, fs };
}
