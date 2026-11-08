// hooks/use-i18n.ts — Hook dịch + cỡ chữ cho các màn hình đã wire (Feature 20)
import { useCallback, useEffect } from 'react';
import { useSettingsStore, textScaleFor } from '@/stores/settings.store';
import {
  translate,
  translateServiceName,
  translateServiceDescription,
  formatVoucherDescription,
  translateLoyaltyTier,
  formatNotificationTitle,
  formatNotificationBody,
  formatTransactionDescription,
  formatCurrency,
  syncDayjsLocale,
  type I18nKey,
} from '@/services/i18n';

export function useTranslation() {
  const language = useSettingsStore(s => s.language);
  const textSize = useSettingsStore(s => s.textSize);
  const theme = useSettingsStore(s => s.theme);
  const setLanguage = useSettingsStore(s => s.setLanguage);
  const setTextSize = useSettingsStore(s => s.setTextSize);
  const setTheme = useSettingsStore(s => s.setTheme);

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

  const tServiceDesc = useCallback(
    (service: any) => translateServiceDescription(service, language),
    [language],
  );

  const formatVoucherDesc = useCallback(
    (voucher: any) => formatVoucherDescription(voucher, language),
    [language],
  );

  const tLoyaltyTier = useCallback((tier: any) => translateLoyaltyTier(tier, language), [language]);

  const formatNotifTitle = useCallback(
    (title: string | undefined | null, type?: string, data?: any) =>
      formatNotificationTitle(title, language, type, data),
    [language],
  );

  const formatNotifBody = useCallback(
    (body: string | undefined | null, type?: string, data?: any) =>
      formatNotificationBody(body, language, type, data),
    [language],
  );

  const formatTxDesc = useCallback(
    (desc: string | undefined | null) => formatTransactionDescription(desc, language),
    [language],
  );

  const formatMoney = useCallback(
    (amount?: number | null) => formatCurrency(amount, language),
    [language],
  );

  const textScale = textScaleFor(textSize);
  /** Nhân cỡ chữ theo cài đặt: fs(14) → 14 (thường) hoặc 17.5 (lớn). */
  const fs = useCallback((base: number) => Math.round(base * textScale * 10) / 10, [textScale]);

  return {
    t,
    tService,
    tServiceDesc,
    formatVoucherDesc,
    tLoyaltyTier,
    formatNotifTitle,
    formatNotifBody,
    formatTxDesc,
    formatMoney,
    fmt: formatMoney,
    language,
    theme,
    setTheme,
    lang: language,
    setLanguage,
    textSize,
    setTextSize,
    textScale,
    fs,
  };
}

/** Standalone helper tính cỡ chữ theo cài đặt hiện tại: fs(14) → 14 (thường) hoặc 17.5 (lớn). */
export function fs(base: number): number {
  const textSize = useSettingsStore.getState().textSize;
  const scale = textScaleFor(textSize);
  return Math.round(base * scale * 10) / 10;
}
