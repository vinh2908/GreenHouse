// B30: Onboarding 4 màn vuốt ngang sau đăng ký lần đầu (sau chọn vai trò).
// "Bỏ qua" / hoàn thành lưu cờ gh_onboarding_seen_v1 vào AsyncStorage rồi
// đưa về trang chính theo vai trò. Chỉ hiện 1 lần sau đăng ký.
import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CalendarCheck, Siren, Wallet, ClipboardCheck, ChevronRight } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { UserRole } from '@homemate/types';
import { useTranslation } from '@/hooks/use-i18n';
import { Button, COLORS, useThemeColors } from '@/components/ui';

export const ONBOARDING_SEEN_KEY = 'gh_onboarding_seen_v1';

const { width } = Dimensions.get('window');

const PAGES = [
  { icon: CalendarCheck, titleKey: 'onboarding_1_title', bodyKey: 'onboarding_1_body' },
  { icon: Siren, titleKey: 'onboarding_2_title', bodyKey: 'onboarding_2_body' },
  { icon: Wallet, titleKey: 'onboarding_3_title', bodyKey: 'onboarding_3_body' },
  { icon: ClipboardCheck, titleKey: 'onboarding_4_title', bodyKey: 'onboarding_4_body' },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const { t, fs } = useTranslation();
  const tc = useThemeColors();
  const { user } = useAuthStore();
  const [page, setPage] = useState(0);
  const listRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const isLast = page === PAGES.length - 1;

  const goHome = async () => {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    router.replace(user?.roles?.includes(UserRole.HELPER) ? '/(helper)/dashboard' : '/(customer)/home');
  };

  const handleNext = () => {
    if (isLast) {
      void goHome();
    } else {
      listRef.current?.scrollToIndex({ index: page + 1, animated: true });
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx !== page && idx >= 0 && idx < PAGES.length) setPage(idx);
  };

  return (
    <View style={{ flex: 1, backgroundColor: tc.surface, paddingTop: Math.max(insets.top, 16) }}>
      {/* Bỏ qua */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20 }}>
        <TouchableOpacity onPress={() => void goHome()} hitSlop={12}>
          <Text style={{ fontSize: fs(14), fontWeight: '700', color: tc.textMuted }}>
            {t('onboarding_skip')}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={PAGES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => {
          const Icon = item.icon;
          return (
            <View
              style={{
                width,
                paddingHorizontal: 32,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 20,
              }}
            >
              <View
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 999,
                  backgroundColor: COLORS.primaryLight,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={56} color={COLORS.primaryDark} />
              </View>
              <Text
                style={{ fontSize: fs(22), fontWeight: '800', color: tc.text, textAlign: 'center' }}
              >
                {t(item.titleKey)}
              </Text>
              <Text
                style={{ fontSize: fs(15), color: tc.textSecondary, lineHeight: 23, textAlign: 'center' }}
              >
                {t(item.bodyKey)}
              </Text>
            </View>
          );
        }}
      />

      {/* Chấm trang + nút */}
      <View
        style={{
          paddingHorizontal: 24,
          paddingBottom: Math.max(insets.bottom, 24),
          gap: 20,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {PAGES.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === page ? 24 : 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: i === page ? COLORS.primary : COLORS.gray[200],
              }}
            />
          ))}
        </View>
        <Button
          title={isLast ? t('onboarding_start') : t('onboarding_next')}
          onPress={handleNext}
          icon={<ChevronRight size={18} color="#fff" />}
        />
      </View>
    </View>
  );
}
