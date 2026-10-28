// apps/mobile/components/common/custom-tab-bar.tsx
import React, { useMemo } from 'react';
import { View, Text, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Home, Clock, MessageSquare, User, Plus, Briefcase, TrendingUp } from 'lucide-react-native';
import { COLORS } from '@/components/ui';
import { useTranslation } from '@/hooks/use-i18n';
import { ScalePressable } from '@/components/common/scale-pressable';

interface CustomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
  mode?: 'customer' | 'helper';
}

// Các route không bao giờ hiện trên tab bar — chỉ mở bằng router.push từ
// màn hình khác (vd Thợ yêu thích mở từ màn Tài khoản).
// Kiểm tra theo TÊN route trước: chắc chắn trên mọi nền tảng, kể cả web nơi
// options.href đôi khi không được resolve đúng lúc render tab bar.
const HIDDEN_TAB_ROUTES: ReadonlySet<string> = new Set(['notifications', 'favorites', 'vouchers']);

export function CustomTabBar({
  state,
  descriptors,
  navigation,
  mode = 'customer',
}: CustomTabBarProps) {
  const router = useRouter();
  const { t, fs } = useTranslation();
  const { width } = useWindowDimensions();

  // Tính toán kích thước co giãn theo bề rộng màn hình (360px, 390px, 412px, desktop)
  const isNarrow = width < 375; // màn hẹp như 360px
  const isTabletOrDesktop = width > 430;

  const dims = useMemo(() => {
    if (isNarrow) {
      return {
        tabFontSize: 9.5,
        iconSize: 20,
        centerIconWrapperSize: 44,
        centerIconInnerSize: 22,
        centerButtonTop: -14,
        letterSpacing: -0.4,
        tabBarHeight: Platform.OS === 'ios' ? 82 : 64,
      };
    }
    if (isTabletOrDesktop) {
      return {
        tabFontSize: 11,
        iconSize: 22,
        centerIconWrapperSize: 52,
        centerIconInnerSize: 26,
        centerButtonTop: -18,
        letterSpacing: -0.2,
        tabBarHeight: Platform.OS === 'ios' ? 86 : 68,
      };
    }
    // Mặc định (375px - 430px, gồm 390px, 412px)
    return {
      tabFontSize: 10,
      iconSize: 21,
      centerIconWrapperSize: 48,
      centerIconInnerSize: 24,
      centerButtonTop: -16,
      letterSpacing: -0.3,
      tabBarHeight: Platform.OS === 'ios' ? 84 : 66,
    };
  }, [isNarrow, isTabletOrDesktop]);

  return (
    <View style={styles.container}>
      <View style={[styles.tabBar, { height: dims.tabBarHeight }]}>
        {state.routes.map((route: any, index: number) => {
          // Bỏ qua các màn hình ẩn — theo tên route trước (chắc chắn trên mọi
          // nền tảng), rồi mới theo options.href === null.
          const { options } = descriptors[route.key];
          if (HIDDEN_TAB_ROUTES.has(route.name) || options.href === null) return null;

          const isFocused = state.index === index;
          const isCenterButton = mode === 'customer' && route.name === 'booking';

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!event.defaultPrevented) {
              if (Platform.OS === 'web') {
                // Tránh điều hướng lặp lại làm hỏng lịch sử / Safari blank tab
                if (isFocused) return;
                // Điều hướng an toàn trong app trên Web: luôn chuyển trang đích xác,
                // không bao giờ mở about:srcdoc hoặc khung trống
                if (route.name === 'home') {
                  router.push('/(customer)/home');
                } else if (route.name === 'jobs') {
                  router.push(mode === 'helper' ? '/(helper)/jobs' : '/(customer)/jobs');
                } else if (route.name === 'booking') {
                  router.push('/(customer)/booking');
                } else if (route.name === 'messages') {
                  router.push(mode === 'helper' ? '/(helper)/messages' : '/(customer)/messages');
                } else if (route.name === 'profile') {
                  router.push(mode === 'helper' ? '/(helper)/profile' : '/(customer)/profile');
                } else if (route.name === 'dashboard') {
                  router.push('/(helper)/dashboard');
                } else if (route.name === 'earnings') {
                  router.push('/(helper)/earnings');
                } else {
                  navigation.navigate(route.name);
                }
              } else {
                if (!isFocused) {
                  navigation.navigate(route.name);
                }
              }
            }
          };

          // ── Nút Đăng việc nổi bật ở giữa (Center Action Button) ───────
          if (isCenterButton) {
            return (
              <View key={route.key} style={styles.centerTabContainer}>
                <ScalePressable
                  activeScale={0.92}
                  onPress={onPress}
                  style={[styles.centerButton, { top: dims.centerButtonTop }]}
                >
                  <View
                    style={[
                      styles.centerIconWrapper,
                      {
                        width: dims.centerIconWrapperSize,
                        height: dims.centerIconWrapperSize,
                        borderRadius: dims.centerIconWrapperSize / 2,
                      },
                    ]}
                  >
                    <Plus size={dims.centerIconInnerSize} color="#FFFFFF" strokeWidth={3} />
                  </View>
                  <Text
                    style={[
                      styles.centerLabel,
                      {
                        fontSize: fs(dims.tabFontSize),
                        letterSpacing: dims.letterSpacing,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {t('tab_booking')}
                  </Text>
                </ScalePressable>
              </View>
            );
          }

          // ── Các tab thông thường ─────────────────────────────────────
          let label = options.title !== undefined ? options.title : route.name;
          if (route.name === 'home') label = t('tab_home');
          if (route.name === 'jobs')
            label = mode === 'helper' ? t('tab_helper_jobs') : t('tab_activity');
          if (route.name === 'messages') label = t('tab_messages');
          if (route.name === 'profile') label = t('tab_account');
          if (route.name === 'dashboard') label = t('tab_overview');
          if (route.name === 'earnings') label = t('tab_earnings');

          const iconColor = isFocused ? COLORS.primary : COLORS.gray[400];
          const iconSize = dims.iconSize;

          const renderIcon = () => {
            switch (route.name) {
              case 'home':
                return (
                  <Home size={iconSize} color={iconColor} strokeWidth={isFocused ? 2.4 : 1.8} />
                );
              case 'jobs':
                return mode === 'helper' ? (
                  <Briefcase
                    size={iconSize}
                    color={iconColor}
                    strokeWidth={isFocused ? 2.4 : 1.8}
                  />
                ) : (
                  <Clock size={iconSize} color={iconColor} strokeWidth={isFocused ? 2.4 : 1.8} />
                );
              case 'messages':
                return (
                  <MessageSquare
                    size={iconSize}
                    color={iconColor}
                    strokeWidth={isFocused ? 2.4 : 1.8}
                  />
                );
              case 'profile':
                return (
                  <User size={iconSize} color={iconColor} strokeWidth={isFocused ? 2.4 : 1.8} />
                );
              case 'dashboard':
                return (
                  <Home size={iconSize} color={iconColor} strokeWidth={isFocused ? 2.4 : 1.8} />
                );
              case 'earnings':
                return (
                  <TrendingUp
                    size={iconSize}
                    color={iconColor}
                    strokeWidth={isFocused ? 2.4 : 1.8}
                  />
                );
              default:
                return <Home size={iconSize} color={iconColor} />;
            }
          };

          return (
            <ScalePressable
              key={route.key}
              activeScale={0.93}
              onPress={onPress}
              style={styles.tabItem}
            >
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                {renderIcon()}
                {isFocused && (
                  <View
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: COLORS.primary,
                      marginTop: 2,
                      marginBottom: -6,
                    }}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  {
                    fontSize: fs(dims.tabFontSize),
                    letterSpacing: dims.letterSpacing,
                    color: isFocused ? COLORS.primary : COLORS.gray[500],
                    fontWeight: isFocused ? '800' : '600',
                  },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </ScalePressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
    zIndex: 999,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 6,
    paddingHorizontal: 4,
    maxWidth: 640,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
  centerTabContainer: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  centerButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerIconWrapper: {
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3.5,
    borderColor: '#FFFFFF',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
  },
  centerLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: 2,
    textAlign: 'center',
  },
});
