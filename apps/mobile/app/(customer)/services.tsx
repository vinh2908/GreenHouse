import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ChevronLeft,
  Search,
  Sparkles,
  Zap,
  Home,
  UtensilsCrossed,
  Package,
  PawPrint,
  Wrench,
  Shirt,
  Wind,
  HeartHandshake,
  Truck,
  Lightbulb,
  X,
} from 'lucide-react-native';
import { ScalePressable } from '@/components/common/scale-pressable';
import { useTranslation } from '@/hooks/use-i18n';
import { useServices } from '@/hooks/use-api';
import { formatCurrency, I18nKey } from '@/services/i18n';
import { removeVietnameseDiacritics } from '@/utils/search';
import { buildServicePrefill } from '@/utils/service-prefill';
import { COLORS, useThemeColors } from '@/components/ui';

export interface ServiceItem {
  id: string;
  name: string;
  nameKey: I18nKey;
  priceType: 'fixed_from' | 'custom_deal' | 'quote_job' | 'quote_trip';
  unitKey?: I18nKey;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  slug: string;
  isCustom?: boolean;
  badgeKey?: I18nKey;
  subtitle?: string;
  subtitleKey?: I18nKey;
  pastelBg: string;
  pastelColor: string;
}

export const SERVICES_CATALOG: ServiceItem[] = [
  {
    id: '1',
    name: 'Giúp việc theo giờ',
    nameKey: 'svc_housekeeping_hourly',
    priceType: 'fixed_from',
    unitKey: 'price_per_hour',
    icon: Sparkles,
    slug: 'housekeeping_hourly',
    pastelBg: '#ECFDF5',
    pastelColor: '#047857',
  },
  {
    id: '2',
    name: 'Tổng vệ sinh nhà cửa',
    nameKey: 'svc_deep_cleaning',
    priceType: 'fixed_from',
    unitKey: 'price_per_shift',
    icon: Home,
    slug: 'deep_cleaning',
    pastelBg: '#F0FDFA',
    pastelColor: '#0F766E',
  },
  {
    id: '3',
    name: 'Nấu ăn gia đình',
    nameKey: 'svc_cooking',
    priceType: 'fixed_from',
    unitKey: 'price_per_meal',
    icon: UtensilsCrossed,
    slug: 'cooking',
    pastelBg: '#FFF7ED',
    pastelColor: '#C2410C',
  },
  {
    id: '4',
    name: 'Giặt ủi quần áo',
    nameKey: 'svc_laundry',
    priceType: 'fixed_from',
    unitKey: 'price_per_kg',
    icon: Shirt,
    slug: 'laundry',
    pastelBg: '#F0FDF4',
    pastelColor: '#15803D',
  },
  {
    id: '5',
    name: 'Chăm sóc người già & Trẻ nhỏ',
    nameKey: 'svc_caregiving',
    priceType: 'fixed_from',
    unitKey: 'price_per_hour',
    icon: HeartHandshake,
    slug: 'caregiving',
    pastelBg: '#FDF2F8',
    pastelColor: '#BE185D',
  },
  {
    id: '6',
    name: 'Chăm sóc thú cưng',
    nameKey: 'svc_pet_care',
    priceType: 'fixed_from',
    unitKey: 'price_per_hour',
    icon: PawPrint,
    slug: 'pet_care',
    pastelBg: '#FFF1F2',
    pastelColor: '#BE123C',
  },
  {
    id: '7',
    name: 'Sửa điện gia dụng',
    nameKey: 'svc_electrician',
    priceType: 'quote_job',
    icon: Zap,
    slug: 'electrician',
    pastelBg: '#FFFBEB',
    pastelColor: '#B45309',
  },
  {
    id: '8',
    name: 'Sửa ống nước',
    nameKey: 'svc_plumbing',
    priceType: 'quote_job',
    icon: Wrench,
    slug: 'plumber',
    pastelBg: '#EFF6FF',
    pastelColor: '#1D4ED8',
  },
  {
    id: '9',
    name: 'Vệ sinh máy lạnh',
    nameKey: 'svc_ac_repair',
    priceType: 'fixed_from',
    unitKey: 'price_per_unit',
    icon: Wind,
    slug: 'ac_repair',
    pastelBg: '#F0F9FF',
    pastelColor: '#0369A1',
  },
  {
    id: '10',
    name: 'Chuyển nhà',
    nameKey: 'svc_moving_help',
    priceType: 'quote_trip',
    icon: Package,
    slug: 'moving_help',
    pastelBg: '#F5F3FF',
    pastelColor: '#6D28D9',
  },
  {
    id: '11',
    name: 'Bốc hàng, vận chuyển',
    nameKey: 'svc_handyman',
    priceType: 'custom_deal',
    icon: Truck,
    slug: 'handyman',
    pastelBg: '#FAF5FF',
    pastelColor: '#7E22CE',
  },
  {
    id: '12',
    name: 'Dịch vụ khác — tự ghi việc, tự set giá',
    nameKey: 'svc_custom',
    priceType: 'custom_deal',
    icon: Lightbulb,
    slug: 'custom',
    isCustom: true,
    badgeKey: 'badge_new',
    subtitleKey: 'svc_custom_sub',
    subtitle: 'Việc gì cũng đăng được',
    pastelBg: '#ECFDF5',
    pastelColor: '#059669',
  },
];

type CategoryKey = 'all' | 'cleaning' | 'repair' | 'care' | 'transport';

interface CategoryFilter {
  key: CategoryKey;
  labelKey: I18nKey;
  slugs: string[];
}

const CATEGORIES: CategoryFilter[] = [
  {
    key: 'all',
    labelKey: 'cat_all',
    slugs: SERVICES_CATALOG.map(s => s.slug),
  },
  {
    key: 'cleaning',
    labelKey: 'cat_cleaning',
    slugs: ['housekeeping_hourly', 'deep_cleaning', 'cooking', 'laundry', 'custom'],
  },
  {
    key: 'repair',
    labelKey: 'cat_repair',
    slugs: ['electrician', 'plumber', 'ac_repair', 'custom'],
  },
  {
    key: 'care',
    labelKey: 'cat_care',
    slugs: ['caregiving', 'pet_care', 'custom'],
  },
  {
    key: 'transport',
    labelKey: 'cat_transport',
    slugs: ['moving_help', 'handyman', 'custom'],
  },
];

export default function AllServicesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { t, lang } = useTranslation();
  const tc = useThemeColors();
  const { q } = useLocalSearchParams<{ q?: string }>();

  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all');
  const [searchQuery, setSearchQuery] = useState(q || '');

  useEffect(() => {
    if (typeof q === 'string') {
      setSearchQuery(q);
      setSelectedCategory('all');
    }
  }, [q]);

  const { data: services } = useServices();

  const filteredServices = useMemo(() => {
    const activeCat = CATEGORIES.find(c => c.key === selectedCategory) || CATEGORIES[0];
    let list = SERVICES_CATALOG.filter(s => activeCat.slugs.includes(s.slug));

    const cleanQuery = removeVietnameseDiacritics(searchQuery.trim());
    if (cleanQuery) {
      list = SERVICES_CATALOG.filter(s => {
        const normName = removeVietnameseDiacritics(s.name);
        const normTranslated = removeVietnameseDiacritics(t(s.nameKey));
        const normSlug = removeVietnameseDiacritics(s.slug.replace(/_/g, ' '));
        const normSub = removeVietnameseDiacritics(s.subtitle || '');
        return (
          normName.includes(cleanQuery) ||
          normTranslated.includes(cleanQuery) ||
          normSlug.includes(cleanQuery) ||
          normSub.includes(cleanQuery)
        );
      });
    }

    return list;
  }, [selectedCategory, searchQuery, t]);

  // Responsive 2-column calculation
  const containerPadding = 16;
  const cardGap = 12;
  const contentWidth = Math.min(windowWidth, 680) - containerPadding * 2;
  const cardWidth = Math.floor((contentWidth - cardGap) / 2);

  const handleSelectService = (svc: ServiceItem) => {
    const isCustom = svc.isCustom;
    const matched = services?.find(s => s.slug === svc.slug);
    const displayName = t(svc.nameKey) || svc.name;

    if (isCustom) {
      const prefill = buildServicePrefill({ slug: 'custom', name: displayName, lang });
      router.push({
        pathname: '/(customer)/booking',
        params: {
          custom_service_name: displayName,
          prefill_title: prefill.title,
          prefill_description: prefill.description,
        },
      });
    } else if (matched) {
      const prefill = buildServicePrefill({
        slug: matched.slug,
        name: matched.name || displayName,
        apiDescription: matched.description,
        lang,
      });
      router.push({
        pathname: '/(customer)/booking',
        params: {
          service_id: matched._id,
          service_slug: matched.slug,
          prefill_title: prefill.title,
          prefill_description: prefill.description,
        },
      });
    } else {
      const prefill = buildServicePrefill({
        slug: svc.slug,
        customServiceName: displayName,
        lang,
      });
      router.push({
        pathname: '/(customer)/booking',
        params: {
          custom_service_name: displayName,
          prefill_title: prefill.title,
          prefill_description: prefill.description,
        },
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      {/* ── Top Header Bar ── */}
      <View
        style={{
          paddingTop: Math.max(insets.top + 8, 20),
          paddingBottom: 14,
          paddingHorizontal: 16,
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.back()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: tc.subtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={20} color={tc.text} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 15.5, fontWeight: '700', color: tc.text }}>
              {lang === 'en' ? 'All Services' : 'Tất cả dịch vụ'}
            </Text>
            <View
              style={{
                backgroundColor: tc.isDark ? '#064E3B' : '#ECFDF5',
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: tc.isDark ? '#34D399' : '#059669',
                }}
              >
                {filteredServices.length}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: containerPadding,
          paddingTop: 16,
          paddingBottom: Math.max(insets.bottom + 40, 60),
          maxWidth: 680,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        {/* ── Search Input ── */}
        <View
          style={{
            backgroundColor: tc.subtle,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: tc.border,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            height: 44,
            marginBottom: 14,
          }}
        >
          <Search size={17} color={tc.textMuted} />
          <TextInput
            style={{
              flex: 1,
              marginLeft: 8,
              fontSize: 13,
              color: tc.text,
              paddingVertical: Platform.OS === 'ios' ? 10 : 8,
            }}
            placeholder={
              lang === 'en'
                ? 'Search cleaning, electrician, cooking...'
                : 'Tìm dịch vụ dọn nhà, sửa điện, nấu ăn...'
            }
            placeholderTextColor={tc.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Category Filter Pills ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
        >
          {CATEGORIES.map(cat => {
            const isSelected = selectedCategory === cat.key && !searchQuery.trim();
            return (
              <TouchableOpacity
                key={cat.key}
                activeOpacity={0.8}
                onPress={() => {
                  setSelectedCategory(cat.key);
                  if (searchQuery.trim()) setSearchQuery('');
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 9999,
                  backgroundColor: isSelected ? '#059669' : tc.subtle,
                  borderWidth: 1,
                  borderColor: isSelected ? '#059669' : tc.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: isSelected ? '700' : '500',
                    color: isSelected ? '#FFFFFF' : tc.textSecondary,
                  }}
                >
                  {t(cat.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Services Grid (2 Columns) ── */}
        {filteredServices.length === 0 ? (
          <View
            style={{
              backgroundColor: tc.surface,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: tc.border,
              padding: 24,
              alignItems: 'center',
              marginTop: 10,
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: tc.subtle,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Search size={24} color={tc.textMuted} />
            </View>
            <Text
              style={{
                fontSize: 14.5,
                fontWeight: '700',
                color: tc.text,
                textAlign: 'center',
              }}
            >
              {lang === 'en' ? 'No matching services found' : 'Không tìm thấy dịch vụ phù hợp'}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: '#64748B',
                textAlign: 'center',
                marginTop: 6,
                marginBottom: 16,
              }}
            >
              {lang === 'en'
                ? 'Try another search term or choose "Custom Service" to post any request.'
                : 'Thử tìm từ khóa khác hoặc chọn "Dịch vụ khác" để tự đăng việc theo ý bạn.'}
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                const customSvc = SERVICES_CATALOG.find(s => s.isCustom);
                if (customSvc) handleSelectService(customSvc);
              }}
              style={{
                backgroundColor: '#059669',
                paddingVertical: 10,
                paddingHorizontal: 18,
                borderRadius: 9999,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                {lang === 'en' ? 'Select Custom Service' : 'Chọn Dịch vụ khác'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: cardGap,
              justifyContent: 'space-between',
            }}
          >
            {filteredServices.map(svc => {
              const isCustom = svc.isCustom;
              const matched = services?.find(s => s.slug === svc.slug);
              const fromPrefix = t('price_from_prefix');

              const displayPrice = matched?.base_price_min
                ? `${fromPrefix}${formatCurrency(matched.base_price_min, lang)}₫`
                : svc.isCustom || svc.priceType === 'custom_deal'
                  ? t('price_negotiate')
                  : svc.priceType === 'quote_job'
                    ? t('price_per_task')
                    : svc.priceType === 'quote_trip'
                      ? t('price_per_trip')
                      : t('price_negotiate');

              return (
                <ScalePressable
                  key={svc.id}
                  onPress={() => handleSelectService(svc)}
                  style={{
                    width: cardWidth,
                    minHeight: 126,
                    backgroundColor: isCustom
                      ? tc.isDark
                        ? '#064E3B44'
                        : '#ECFDF5'
                      : tc.surface,
                    borderRadius: 20,
                    borderWidth: 1.5,
                    borderColor: isCustom ? (tc.isDark ? '#059669' : '#86EFAC') : tc.border,
                    padding: 14,
                    justifyContent: 'space-between',
                    position: 'relative',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.03,
                    shadowRadius: 6,
                    elevation: 1,
                  }}
                >
                  {/* Badge Mới cho Dịch vụ khác */}
                  {isCustom && (
                    <View
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        backgroundColor: tc.isDark ? '#064E3B' : '#DCFCE7',
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: tc.isDark ? '#059669' : '#86EFAC',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 9.5,
                          fontWeight: '800',
                          color: tc.isDark ? '#34D399' : '#059669',
                        }}
                      >
                        {t('badge_new')}
                      </Text>
                    </View>
                  )}

                  {/* Icon pastel container */}
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      backgroundColor: tc.isDark ? `${svc.pastelColor}22` : svc.pastelBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {React.createElement(svc.icon, {
                      size: 22,
                      color: svc.pastelColor,
                    })}
                  </View>

                  {/* Name and Price */}
                  <View style={{ marginTop: 8 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: tc.text,
                        lineHeight: 17,
                      }}
                      numberOfLines={2}
                    >
                      {t(svc.nameKey)}
                    </Text>

                    <Text
                      style={{
                        fontSize: 11.5,
                        fontWeight: '600',
                        color: isCustom ? (tc.isDark ? '#34D399' : '#059669') : tc.textMuted,
                        marginTop: 4,
                      }}
                      numberOfLines={1}
                    >
                      {displayPrice}
                    </Text>
                  </View>
                </ScalePressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
