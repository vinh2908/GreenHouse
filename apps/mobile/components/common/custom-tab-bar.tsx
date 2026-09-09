// apps/mobile/components/common/custom-tab-bar.tsx
import React from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import {
  Home,
  Clock,
  MessageSquare,
  User,
  Plus,
  Briefcase,
  TrendingUp,
} from 'lucide-react-native';
import { COLORS } from '@/components/ui';

interface CustomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
  mode?: 'customer' | 'helper';
}

export function CustomTabBar({ state, descriptors, navigation, mode = 'customer' }: CustomTabBarProps) {
  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {state.routes.map((route: any, index: number) => {
          // Bỏ qua các màn hình ẩn
          const { options } = descriptors[route.key];
          if (options.href === null) return null;

          const isFocused = state.index === index;
          const isCenterButton = (mode === 'customer' && route.name === 'booking');

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          // ── Nút Đăng việc nổi bật ở giữa (Center Action Button) ───────
          if (isCenterButton) {
            return (
              <View key={route.key} style={styles.centerTabContainer}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={onPress}
                  style={styles.centerButton}
                >
                  <View style={styles.centerIconWrapper}>
                    <Plus size={26} color="#FFFFFF" strokeWidth={3} />
                  </View>
                  <Text style={styles.centerLabel}>Đăng việc</Text>
                </TouchableOpacity>
              </View>
            );
          }

          // ── Các tab thông thường ─────────────────────────────────────
          let label = options.title !== undefined ? options.title : route.name;
          if (route.name === 'home') label = 'Trang chủ';
          if (route.name === 'jobs') label = mode === 'helper' ? 'Nhận việc' : 'Hoạt động';
          if (route.name === 'messages') label = 'Tin nhắn';
          if (route.name === 'profile') label = 'Tài khoản';
          if (route.name === 'dashboard') label = 'Tổng quan';
          if (route.name === 'earnings') label = 'Thu nhập';

          const iconColor = isFocused ? COLORS.primary : COLORS.gray[400];
          const iconSize = 22;

          const renderIcon = () => {
            switch (route.name) {
              case 'home':
                return <Home size={iconSize} color={iconColor} strokeWidth={isFocused ? 2.4 : 1.8} />;
              case 'jobs':
                return mode === 'helper' ? (
                  <Briefcase size={iconSize} color={iconColor} strokeWidth={isFocused ? 2.4 : 1.8} />
                ) : (
                  <Clock size={iconSize} color={iconColor} strokeWidth={isFocused ? 2.4 : 1.8} />
                );
              case 'messages':
                return <MessageSquare size={iconSize} color={iconColor} strokeWidth={isFocused ? 2.4 : 1.8} />;
              case 'profile':
                return <User size={iconSize} color={iconColor} strokeWidth={isFocused ? 2.4 : 1.8} />;
              case 'dashboard':
                return <Home size={iconSize} color={iconColor} strokeWidth={isFocused ? 2.4 : 1.8} />;
              case 'earnings':
                return <TrendingUp size={iconSize} color={iconColor} strokeWidth={isFocused ? 2.4 : 1.8} />;
              default:
                return <Home size={iconSize} color={iconColor} />;
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              activeOpacity={0.7}
              onPress={onPress}
              style={styles.tabItem}
            >
              {renderIcon()}
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isFocused ? COLORS.primary : COLORS.gray[500],
                    fontWeight: isFocused ? '800' : '600',
                  },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
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
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    paddingTop: 8,
    height: Platform.OS === 'ios' ? 86 : 68,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 10.5,
    marginTop: 2,
    letterSpacing: -0.2,
  },
  centerTabContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  centerButton: {
    top: -20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  centerLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: 3,
    letterSpacing: -0.2,
  },
});
