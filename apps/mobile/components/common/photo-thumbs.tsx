// components/common/photo-thumbs.tsx — Hiển thị hàng thumbnail ảnh + xem
// full-screen dùng chung: tin nhắn ảnh trong chat, ảnh minh chứng SOS Backup
// (popup quyết định của khách, popup mời thợ ứng viên, banner chi tiết đơn).
import { useState } from 'react';
import { Modal, View, TouchableOpacity, Image, Text } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const [viewing, setViewing] = useState<string | null>(null);
  const list = (urls ?? []).filter(u => typeof u === 'string' && u);
  if (list.length === 0) return null;
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#6B7280' }}>{label}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {list.map(url => (
          <TouchableOpacity key={url} activeOpacity={0.85} onPress={() => setViewing(url)}>
            <Image
              source={{ uri: url }}
              style={{ width: size, height: size, borderRadius: 10 }}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ))}
      </View>
      <ImageViewerModal uri={viewing} visible={!!viewing} onClose={() => setViewing(null)} />
    </View>
  );
}
