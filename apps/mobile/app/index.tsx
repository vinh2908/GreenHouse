import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Dimensions, StyleSheet, StatusBar, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { Sparkles, ShieldCheck, Zap } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { COLORS } from '@/components/ui';

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
  const router = useRouter();
  const { loadStoredAuth } = useAuthStore();
  const hasNavigated = useRef(false);

  // ── Animations ─────────────────────────────────────────────────────────────
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const textSlideAnim = useRef(new Animated.Value(30)).current;
  const badgeFadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 1. Nạp Auth Token ngầm từ SecureStore
    loadStoredAuth().catch(() => {});

    // 2. Chạy chuỗi hoạt họa sống động (Choreographed Animations)
    Animated.parallel([
      // Scale & Spring Logo Icon
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      // Fade In Background elements
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      // Slide Up Brand Name & Slogan
      Animated.timing(textSlideAnim, {
        toValue: 0,
        duration: 800,
        delay: 150,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      // Fade in Feature Badges
      Animated.timing(badgeFadeAnim, {
        toValue: 1,
        duration: 700,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Loop Pulse Effect cho logo
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

    // 3. Tự động chuyển trang sau khi hết thời gian splash (1.8s)
    const navigateNext = () => {
      if (hasNavigated.current) return;
      hasNavigated.current = true;

      const state = useAuthStore.getState();
      if (!state.isAuthenticated) {
        router.replace('/(auth)/login');
      } else if (state.user?.active_role === 'helper') {
        router.replace('/(helper)/dashboard');
      } else {
        router.replace('/(customer)/home');
      }
    };

    const timer = setTimeout(navigateNext, 1800);

    return () => {
      clearTimeout(timer);
    };
  }, [loadStoredAuth, router]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#16A34A" translucent />

      {/* ── Background Decorative Shapes ─────────────────────────────── */}
      <Animated.View style={[styles.bgCircle1, { opacity: opacityAnim }]} />
      <Animated.View style={[styles.bgCircle2, { opacity: opacityAnim }]} />
      <Animated.View style={[styles.bgCircle3, { opacity: opacityAnim }]} />

      {/* ── Center Brand Logo & Typography ───────────────────────────── */}
      <View style={styles.centerContent}>
        {/* Animated Glowing Logo Icon */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              transform: [{ scale: scaleAnim }, { scale: pulseAnim }],
            },
          ]}
        >
          {/* Outer Ring Glow */}
          <View style={styles.outerGlow}>
            {/* Inner Brand Emblem */}
            <View style={styles.logoBadge}>
              <Text style={styles.logoEmoji}>🛠️</Text>
            </View>
          </View>
        </Animated.View>

        {/* Brand Name & Slogan with Slide Up Animation */}
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

          <Text style={styles.slogan}>Dịch vụ gia đình & Thợ chuyên nghiệp 24/7</Text>
        </Animated.View>

        {/* ── Feature Highlights Badges ──────────────────────────────── */}
        <Animated.View style={[styles.badgeRow, { opacity: badgeFadeAnim }]}>
          <View style={styles.featureBadge}>
            <ShieldCheck size={14} color="#FFF" />
            <Text style={styles.featureText}>Thợ e-KYC 100%</Text>
          </View>
          <View style={styles.featureBadge}>
            <Zap size={14} color="#FFF" />
            <Text style={styles.featureText}>Cứu hộ SOS 15p</Text>
          </View>
          <View style={styles.featureBadge}>
            <Sparkles size={14} color="#FFF" />
            <Text style={styles.featureText}>Trợ lý AI</Text>
          </View>
        </Animated.View>
      </View>

      {/* ── Footer Loading Indicator & Copyright ─────────────────────── */}
      <Animated.View style={[styles.footer, { opacity: opacityAnim }]}>
        {/* Modern 3-Dots Pulse Indicator */}
        <View style={styles.dotsContainer}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={[styles.dot, { opacity: 0.6 }]} />
          <View style={[styles.dot, { opacity: 0.3 }]} />
        </View>

        <Text style={styles.footerText}>GREEN HOUSE ECOSYSTEM • PHIÊN BẢN 1.0.0</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#22C55E', // Green House Fresh Green
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
    borderRadius: 36,
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
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  logoEmoji: {
    fontSize: 50,
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
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  brandWhite: {
    fontSize: 34,
    fontWeight: '900',
    color: '#DCFCE7',
    letterSpacing: 1.5,
  },
  slogan: {
    fontSize: 14.5,
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  featureText: {
    fontSize: 11.5,
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
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  dotActive: {
    width: 22,
    backgroundColor: '#FFFFFF',
  },
  footerText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 1.2,
  },
});
