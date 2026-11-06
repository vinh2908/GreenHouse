// components/common/photo-thumbs.tsx — Hiển thị hàng thumbnail ảnh + xem
// full-screen dùng chung: tin nhắn ảnh trong chat, ảnh minh chứng SOS Backup
// (popup quyết định của khách, popup mời thợ ứng viên, banner chi tiết đơn).
import { useState } from 'react';
import { Modal, View, TouchableOpacity, Image, Text } from 'react-native';
import { X, ImageOff } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation, fs } from '@/hooks/use-i18n';

/** Modal xem 1 ảnh toàn màn hình (chạm nền hoặc nút ✕ để đóng) */
export function ImageViewerModal({
  uri,
  visible,
  onClose,
}: {
  uri: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.92)',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: '100%', height: '82%' }} resizeMode="contain" />
        ) : null}
        <TouchableOpacity
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{
            position: 'absolute',
            top: Math.max(insets.top + 8, 20),
            right: 16,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={22} color="#fff" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

/** Hàng thumbnail (tùy chọn kèm nhãn phía trên); chạm vào 1 ảnh → xem full-screen */
export function PhotoThumbRow({
  urls,
  size = 64,
  label,
}: {
  urls?: string[] | null;
  size?: number;
  label?: string;
}) {
  const { fs, lang } = useTranslation();
  const [viewing, setViewing] = useState<string | null>(null);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const list = (urls ?? []).filter(u => typeof u === 'string' && u);
  if (list.length === 0) return null;
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text style={{ fontSize: fs(12.5), fontWeight: '700', color: '#6B7280' }}>{label}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {list.map(url => {
          const isFailed = failedUrls[url];
          return (
            <TouchableOpacity
              key={url}
              activeOpacity={0.85}
              onPress={() => !isFailed && setViewing(url)}
            >
              {isFailed ? (
                <View
                  style={{
                    width: size,
                    height: size,
                    borderRadius: 10,
                    backgroundColor: '#F3F4F6',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    padding: 4,
                  }}
                >
                  <ImageOff size={Math.min(size * 0.4, 22)} color="#9CA3AF" />
                  <Text
                    style={{
                      fontSize: fs(9),
                      color: '#9CA3AF',
                      marginTop: 2,
                      textAlign: 'center',
                    }}
                  >
                    {lang === 'en' ? 'Unavailable' : 'Ảnh lỗi'}
                  </Text>
                </View>
              ) : (
                <Image
                  source={{ uri: url }}
                  onError={() => setFailedUrls(prev => ({ ...prev, [url]: true }))}
                  style={{ width: size, height: size, borderRadius: 10 }}
                  resizeMode="cover"
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <ImageViewerModal uri={viewing} visible={!!viewing} onClose={() => setViewing(null)} />
    </View>
  );
}
