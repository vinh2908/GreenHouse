// components/common/display-settings.tsx — Mục "Cài đặt hiển thị / Display" (Feature 20)
// Dùng chung cho profile khách + thợ: chọn ngôn ngữ (Tiếng Việt | English) và
// cỡ chữ (Thường | Lớn), ghi vào settings.store (persist AsyncStorage).
import { View, Text, TouchableOpacity } from 'react-native';
import { Card, COLORS } from '@/components/ui';
import { useTranslation } from '@/hooks/use-i18n';

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: COLORS.gray[100],
        borderRadius: 12,
        padding: 4,
        gap: 4,
      }}
    >
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            activeOpacity={0.8}
            onPress={() => onChange(opt.value)}
            style={{
              flex: 1,
              paddingVertical: 9,
              borderRadius: 9,
              alignItems: 'center',
              backgroundColor: active ? COLORS.primary : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 13.5,
                fontWeight: '800',
                color: active ? '#fff' : COLORS.gray[600],
              }}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function DisplaySettingsSection() {
  const { t, fs, language, setLanguage, textSize, setTextSize } = useTranslation();
  return (
    <View>
      <Text
        style={{
          fontSize: fs(12),
          fontWeight: '700',
          color: COLORS.gray[400],
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {t('settings_section')}
      </Text>
      <Card style={{ gap: 14 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: fs(14), fontWeight: '700', color: COLORS.gray[800] }}>
            {t('settings_language')}
          </Text>
          <Segmented
            value={language}
            onChange={setLanguage}
            options={[
              { value: 'vi', label: t('settings_language_vi') },
              { value: 'en', label: t('settings_language_en') },
            ]}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: fs(14), fontWeight: '700', color: COLORS.gray[800] }}>
            {t('settings_text_size')}
          </Text>
          <Segmented
            value={textSize}
            onChange={setTextSize}
            options={[
              { value: 'normal', label: t('settings_text_normal') },
              { value: 'large', label: t('settings_text_large') },
            ]}
          />
        </View>
      </Card>
    </View>
  );
}
