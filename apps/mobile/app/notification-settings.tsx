import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bell, Tag, Volume2, Shield, Smartphone } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { Card, COLORS, Separator } from '@/components/ui';

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
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

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

  const toggle = async (key: keyof SettingsState) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      Toast.show({
        type: 'success',
        text1: 'Đã lưu cài đặt thông báo',
        visibilityTime: 1500,
      });
    } catch {}
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(customer)/profile');
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.gray[50] }}>
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleBack}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: COLORS.gray[100],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 18,
            fontWeight: '800',
            color: COLORS.gray[900],
            marginLeft: 12,
            flex: 1,
          }}
        >
          Cài đặt thông báo
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
              fontSize: 12,
              fontWeight: '700',
              color: COLORS.gray[500],
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Đơn hàng & Công việc
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
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.gray[900] }}>
                  Cập nhật tiến độ đơn hàng
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.gray[500], marginTop: 2 }}>
                  Nhận tin khi thợ nhận việc, bắt đầu di chuyển, đã đến nơi hoặc hoàn thành.
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
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.gray[900] }}>
                  Tin nhắn & Trao đổi
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.gray[500], marginTop: 2 }}>
                  Thông báo tin nhắn trò chuyện trực tiếp từ khách hàng hoặc thợ.
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
              fontSize: 12,
              fontWeight: '700',
              color: COLORS.gray[500],
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Khuyến mãi & Mã giảm giá
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
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.gray[900] }}>
                  Chương trình ưu đãi mới
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.gray[500], marginTop: 2 }}>
                  Thông báo các chương trình giảm giá dịch vụ định kỳ và mùa lễ.
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
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.gray[900] }}>
                  Nhắc nhở voucher sắp hết hạn
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.gray[500], marginTop: 2 }}>
                  Nhắc sử dụng các voucher giảm giá trước khi hết hạn sử dụng.
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
              fontSize: 12,
              fontWeight: '700',
              color: COLORS.gray[500],
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Hệ thống & Âm báo
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
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.gray[900] }}>
                  Âm thanh thông báo
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.gray[500], marginTop: 2 }}>
                  Phát âm thanh chuông khi có thông báo mới đến.
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
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.gray[900] }}>
                  Rung thiết bị
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.gray[500], marginTop: 2 }}>
                  Rung nhẹ điện thoại khi nhận tín hiệu hoặc đơn cứu hộ khẩn cấp.
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
