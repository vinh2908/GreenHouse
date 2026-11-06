import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bell, Tag, Volume2, Shield, Smartphone } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { useTranslation } from '@/hooks/use-i18n';
import { useNotificationSettings, useUpdateNotificationSettings } from '@/hooks/use-api';
import { Card, COLORS, Separator, useThemeColors } from '@/components/ui';

const STORAGE_KEY = '@greenhouse_notification_settings';

interface SettingsState {
  orderUpdates: boolean;
  chatMessages: boolean;
  promotions: boolean;
  vouchers: boolean;
  sound: boolean;
  vibration: boolean;
}

const DEFAULT_SETTINGS: SettingsState = {
  orderUpdates: true,
  chatMessages: true,
  promotions: true,
  vouchers: true,
  sound: true,
  vibration: true,
};

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  const { data: serverSettings } = useNotificationSettings();
  const updateMutation = useUpdateNotificationSettings();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(val => {
        if (val) {
          try {
            setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(val) });
          } catch {}
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (serverSettings) {
      const mapped: SettingsState = {
        orderUpdates: serverSettings.order_updates ?? true,
        chatMessages: serverSettings.chat_messages ?? true,
        promotions: serverSettings.promotions ?? true,
        vouchers: serverSettings.vouchers ?? true,
        sound: serverSettings.sound ?? true,
        vibration: serverSettings.vibration ?? true,
      };
      setSettings(mapped);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mapped)).catch(() => {});
    }
  }, [serverSettings]);

  const toggle = async (key: keyof SettingsState) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}

    const payload = {
      order_updates: updated.orderUpdates,
      chat_messages: updated.chatMessages,
      promotions: updated.promotions,
      vouchers: updated.vouchers,
      sound: updated.sound,
      vibration: updated.vibration,
    };

    updateMutation.mutate(payload, {
      onSuccess: () => {
        Toast.show({
          type: 'success',
          text1: lang === 'en' ? 'Notification settings saved' : 'Đã lưu cài đặt thông báo',
          visibilityTime: 1500,
        });
      },
      onError: (err: any) => {
        Toast.show({
          type: 'error',
          text1: lang === 'en' ? 'Failed to save settings' : 'Lưu cài đặt thông báo thất bại',
          text2:
            err?.response?.data?.message ||
            (lang === 'en'
              ? 'Please check your connection and retry'
              : 'Vui lòng kiểm tra kết nối mạng và thử lại'),
          visibilityTime: 2500,
        });
      },
    });
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(customer)/profile');
  };

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleBack}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            backgroundColor: tc.subtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: fs(18),
            fontWeight: '800',
            color: tc.text,
            marginLeft: 12,
            flex: 1,
          }}
        >
          {lang === 'en' ? 'Notification Settings' : 'Cài đặt thông báo'}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      >
        {/* ── 1. Đơn hàng & Tin nhắn ─────────────────────────────────────── */}
        <View>
          <Text
            style={{
              fontSize: fs(12),
              fontWeight: '700',
              color: tc.textMuted,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {lang === 'en' ? 'Orders & Tasks' : 'Đơn hàng & Công việc'}
          </Text>
          <Card style={{ gap: 0, paddingHorizontal: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 14,
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: fs(15), fontWeight: '700', color: tc.text }}>
                  {lang === 'en' ? 'Order Progress Updates' : 'Cập nhật tiến độ đơn hàng'}
                </Text>
                <Text style={{ fontSize: fs(13), color: tc.textMuted, marginTop: 2 }}>
                  {lang === 'en'
                    ? 'Get notified when helper accepts job, starts moving, arrives, or finishes.'
                    : 'Nhận tin khi thợ nhận việc, bắt đầu di chuyển, đã đến nơi hoặc hoàn thành.'}
                </Text>
              </View>
              <Switch
                value={settings.orderUpdates}
                onValueChange={() => toggle('orderUpdates')}
                trackColor={{ false: COLORS.gray[300], true: COLORS.primary }}
              />
            </View>

            <Separator my={0} />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 14,
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: fs(15), fontWeight: '700', color: tc.text }}>
                  {lang === 'en' ? 'Messages & Chat' : 'Tin nhắn & Trao đổi'}
                </Text>
                <Text style={{ fontSize: fs(13), color: tc.textMuted, marginTop: 2 }}>
                  {lang === 'en'
                    ? 'Direct chat message notifications from customers or helpers.'
                    : 'Thông báo tin nhắn trò chuyện trực tiếp từ khách hàng hoặc thợ.'}
                </Text>
              </View>
              <Switch
                value={settings.chatMessages}
                onValueChange={() => toggle('chatMessages')}
                trackColor={{ false: COLORS.gray[300], true: COLORS.primary }}
              />
            </View>
          </Card>
        </View>

        {/* ── 2. Ưu đãi & Khuyến mãi ────────────────────────────────────── */}
        <View>
          <Text
            style={{
              fontSize: fs(12),
              fontWeight: '700',
              color: tc.textMuted,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {lang === 'en' ? 'Promotions & Vouchers' : 'Khuyến mãi & Mã giảm giá'}
          </Text>
          <Card style={{ gap: 0, paddingHorizontal: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 14,
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: fs(15), fontWeight: '700', color: tc.text }}>
                  {lang === 'en' ? 'New Promotional Deals' : 'Chương trình ưu đãi mới'}
                </Text>
                <Text style={{ fontSize: fs(13), color: tc.textMuted, marginTop: 2 }}>
                  {lang === 'en'
                    ? 'Notifications about periodic service discounts and holiday deals.'
                    : 'Thông báo các chương trình giảm giá dịch vụ định kỳ và mùa lễ.'}
                </Text>
              </View>
              <Switch
                value={settings.promotions}
                onValueChange={() => toggle('promotions')}
                trackColor={{ false: COLORS.gray[300], true: COLORS.primary }}
              />
            </View>

            <Separator my={0} />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 14,
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: fs(15), fontWeight: '700', color: tc.text }}>
                  {lang === 'en' ? 'Expiring Voucher Reminders' : 'Nhắc nhở voucher sắp hết hạn'}
                </Text>
                <Text style={{ fontSize: fs(13), color: tc.textMuted, marginTop: 2 }}>
                  {lang === 'en'
                    ? 'Reminders to use discount vouchers before they expire.'
                    : 'Nhắc sử dụng các voucher giảm giá trước khi hết hạn sử dụng.'}
                </Text>
              </View>
              <Switch
                value={settings.vouchers}
                onValueChange={() => toggle('vouchers')}
                trackColor={{ false: COLORS.gray[300], true: COLORS.primary }}
              />
            </View>
          </Card>
        </View>

        {/* ── 3. Âm thanh & Rung ───────────────────────────────────────── */}
        <View>
          <Text
            style={{
              fontSize: fs(12),
              fontWeight: '700',
              color: tc.textMuted,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {lang === 'en' ? 'System & Alerts' : 'Hệ thống & Âm báo'}
          </Text>
          <Card style={{ gap: 0, paddingHorizontal: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 14,
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: fs(15), fontWeight: '700', color: tc.text }}>
                  {lang === 'en' ? 'Notification Sound' : 'Âm thanh thông báo'}
                </Text>
                <Text style={{ fontSize: fs(13), color: tc.textMuted, marginTop: 2 }}>
                  {lang === 'en'
                    ? 'Play chime when a new notification arrives.'
                    : 'Phát âm thanh chuông khi có thông báo mới đến.'}
                </Text>
              </View>
              <Switch
                value={settings.sound}
                onValueChange={() => toggle('sound')}
                trackColor={{ false: COLORS.gray[300], true: COLORS.primary }}
              />
            </View>

            <Separator my={0} />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 14,
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: fs(15), fontWeight: '700', color: tc.text }}>
                  {lang === 'en' ? 'Device Vibration' : 'Rung thiết bị'}
                </Text>
                <Text style={{ fontSize: fs(13), color: tc.textMuted, marginTop: 2 }}>
                  {lang === 'en'
                    ? 'Gently vibrate device upon incoming messages or emergency SOS jobs.'
                    : 'Rung nhẹ điện thoại khi nhận tín hiệu hoặc đơn cứu hộ khẩn cấp.'}
                </Text>
              </View>
              <Switch
                value={settings.vibration}
                onValueChange={() => toggle('vibration')}
                trackColor={{ false: COLORS.gray[300], true: COLORS.primary }}
              />
            </View>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
