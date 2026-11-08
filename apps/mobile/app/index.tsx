import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Animated,
  Dimensions,
  StyleSheet,
  StatusBar,
  Easing,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkles, ShieldCheck, Zap } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { useTranslation, fs } from '@/hooks/use-i18n';
import apiClient from '@/services/api-client';

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
  console.warn('[Startup] 5. SplashScreen (app/index.tsx) render');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lang } = useTranslation();
  const hasNavigated = useRef(false);
  const [authStuck, setAuthStuck] = useState(false);
  const stuckTimerRef = useRef<any>(null);

  const armStuckTimer = () => {
    if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    stuckTimerRef.current = setTimeout(() => {
      if (!hasNavigated.current && useAuthStore.getState().isLoading) {
        setAuthStuck(true);
      }
    }, 5000);
  };

  // ── Animations ─────────────────────────────────────────────────────────────
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const textSlideAnim = useRef(new Animated.Value(30)).current;
  const badgeFadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    console.warn('[Startup] 6. SplashScreen (app/index.tsx) useEffect mounted');
    // 0. Đánh thức server API ngầm ngay khi mở app (tránh cold-start trên Render)
    apiClient.get('/health').catch(() => {});

    // Auth is restored by the root layout, including when opening a deep link.

    // 2. Chạy chuỗi hoạt họa sống động (Choreographed Animations)
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(textSlideAnim, {
        toValue: 0,
        duration: 800,
        delay: 150,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(badgeFadeAnim, {
        toValue: 1,
        duration: 700,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // 3. Tự động chuyển trang sau khi hết thời gian splash (1.8s) và auth đã hydrate xong
    const navigateNext = () => {
      if (hasNavigated.current) return;

      const state = useAuthStore.getState();
      if (state.isLoading) {
        // M-30: Đợi auth hydrate xong từ SecureStore (isLoading === false), không dùng timeout cưỡng bức
        const unsub = useAuthStore.subscribe(curr => {
          if (!curr.isLoading && !hasNavigated.current) {
            hasNavigated.current = true;
            unsub();
            if (curr.isAuthenticated && curr.user?.active_role === 'helper') {
              router.replace('/(helper)/dashboard');
            } else {
              router.replace('/(customer)/home');
            }
          }
        });
        return;
      }

      hasNavigated.current = true;
      if (state.isAuthenticated && state.user?.active_role === 'helper') {
        router.replace('/(helper)/dashboard');
      } else {
        router.replace('/(customer)/home');
      }
    };

    const timer = setTimeout(navigateNext, 1800);
    armStuckTimer();

    return () => {
      clearTimeout(timer);
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#16A34A" translucent />

      {/* ── Background Decorative Shapes ─────────────────────────────── */}
      <Animated.View style={[styles.bgCircle1, { opacity: opacityAnim }]} />
      <Animated.View style={[styles.bgCircle2, { opacity: opacityAnim }]} />
      <Animated.View style={[styles.bgCircle3, { opacity: opacityAnim }]} />

      {/* ── Center Brand Logo & Typography ───────────────────────────── */}
      <View style={styles.centerContent}>
        <Animated.View
          style={[
            styles.logoContainer,
            {
              transform: [{ scale: scaleAnim }, { scale: pulseAnim }],
            },
          ]}
        >
          <View style={styles.outerGlow}>
            <View style={styles.logoBadge}>
              <Image
                source={require('../assets/images/logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: opacityAnim,
              transform: [{ translateY: textSlideAnim }],
            },
          ]}
        >
          <View style={styles.brandRow}>
            <Text style={styles.brandPrimary}>GREEN</Text>
            <Text style={styles.brandWhite}>HOUSE</Text>
          </View>

          <Text style={styles.slogan}>
            {lang === 'en'
              ? 'Home Services & 24/7 Professional Helpers'
              : 'Dịch vụ gia đình & Thợ chuyên nghiệp 24/7'}
          </Text>
        </Animated.View>

        {/* ── Feature Highlights Badges ──────────────────────────────── */}
        <Animated.View style={[styles.badgeRow, { opacity: badgeFadeAnim }]}>
          <View style={styles.featureBadge}>
            <ShieldCheck size={14} color="#FFF" />
            <Text style={styles.featureText}>
              {lang === 'en' ? '100% e-KYC' : 'Thợ e-KYC 100%'}
            </Text>
          </View>
          <View style={styles.featureBadge}>
            <Zap size={14} color="#FFF" />
            <Text style={styles.featureText}>
              {lang === 'en' ? '15m SOS Rescue' : 'Cứu hộ SOS 15p'}
            </Text>
          </View>
          <View style={styles.featureBadge}>
            <Sparkles size={14} color="#FFF" />
            <Text style={styles.featureText}>{lang === 'en' ? 'AI Assistant' : 'Trợ lý AI'}</Text>
          </View>
        </Animated.View>
      </View>

      {/* ── Footer Loading Indicator & Copyright ─────────────────────── */}
      <Animated.View
        style={[
          styles.footer,
          {
            opacity: opacityAnim,
            bottom: Math.max(height * 0.05, insets.bottom + 16),
          },
        ]}
      >
        <View style={styles.dotsContainer}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={[styles.dot, { opacity: 0.6 }]} />
          <View style={[styles.dot, { opacity: 0.3 }]} />
        </View>

        <Text style={styles.footerText}>
          {lang === 'en'
            ? 'GREEN HOUSE ECOSYSTEM • VERSION 1.0.0'
            : 'GREEN HOUSE ECOSYSTEM • PHIÊN BẢN 1.0.0'}
        </Text>
      </Animated.View>

      {authStuck && (
        <View
          style={{
            position: 'absolute',
            bottom: Math.max(height * 0.12, insets.bottom + 60),
            left: 24,
            right: 24,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderRadius: 16,
            padding: 16,
            alignItems: 'center',
            gap: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 10,
            elevation: 10,
            zIndex: 10000,
          }}
        >
          <Text
            style={{
              fontSize: fs(13.5),
              fontWeight: '700',
              color: '#1F2937',
              textAlign: 'center',
              lineHeight: 19,
            }}
          >
            {lang === 'en'
              ? 'Connecting to server is taking longer than usual...'
              : 'Đang kết nối đến máy chủ, vui lòng đợi hoặc thử lại...'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                setAuthStuck(false);
                armStuckTimer();
                void useAuthStore.getState().loadStoredAuth();
              }}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 9,
                borderRadius: 10,
                backgroundColor: '#16A34A',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fs(13) }}>
                {lang === 'en' ? 'Retry' : 'Thử lại'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                hasNavigated.current = true;
                router.replace('/(customer)/home');
              }}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 9,
                borderRadius: 10,
                backgroundColor: '#F3F4F6',
              }}
            >
              <Text style={{ color: '#374151', fontWeight: '700', fontSize: fs(13) }}>
                {lang === 'en' ? 'Continue as Guest' : 'Tiếp tục vào app'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: '100%',
    ...(Platform.OS === 'web'
      ? {
          position: 'fixed' as any,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          minHeight: '100dvh' as any,
          zIndex: 9999,
        }
      : {}),
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  bgCircle1: {
    position: 'absolute',
    top: -height * 0.1,
    right: -width * 0.2,
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: (width * 0.9) / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  bgCircle2: {
    position: 'absolute',
    bottom: -height * 0.15,
    left: -width * 0.25,
    width: width * 1.1,
    height: width * 1.1,
    borderRadius: (width * 1.1) / 2,
    backgroundColor: 'rgba(22, 163, 74, 0.45)',
  },
  bgCircle3: {
    position: 'absolute',
    top: height * 0.35,
    left: -width * 0.1,
    width: width * 0.4,
    height: width * 0.4,
    borderRadius: (width * 0.4) / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  outerGlow: {
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  logoBadge: {
    width: 96,
    height: 96,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  logoImage: {
    width: 84,
    height: 84,
  },
  textContainer: {
    alignItems: 'center',
    gap: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  brandPrimary: {
    fontSize: fs(34),
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  brandWhite: {
    fontSize: fs(34),
    fontWeight: '900',
    color: '#DCFCE7',
    letterSpacing: 1.5,
  },
  slogan: {
    fontSize: fs(14.5),
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.92)',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 28,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  featureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  featureText: {
    fontSize: fs(11.5),
    fontWeight: '700',
    color: '#FFFFFF',
  },
  footer: {
    position: 'absolute',
    bottom: height * 0.05,
    alignItems: 'center',
    gap: 12,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  dotActive: {
    width: 22,
    backgroundColor: '#FFFFFF',
  },
  footerText: {
    fontSize: fs(11),
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 1.2,
  },
});
