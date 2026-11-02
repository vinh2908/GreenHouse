// components/common/offline-banner.tsx — Banner chế độ offline (Feature 16)
// Hiện khi mất mạng (đang xem dữ liệu đã lưu) hoặc còn thao tác chờ đồng bộ.
import { View, Text } from 'react-native';
import { useOfflineStore } from '@/stores/offline.store';

export function OfflineBanner() {
  const isOnline = useOfflineStore(s => s.isOnline);
  const pendingCount = useOfflineStore(s => s.pendingCount);

  if (isOnline && pendingCount === 0) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        elevation: 9999,
        backgroundColor: '#FEF3C7',
        borderBottomWidth: 1,
        borderBottomColor: '#FDE68A',
        paddingHorizontal: 16,
        paddingVertical: 7,
        gap: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      }}
    >
      {!isOnline && (
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#92400E' }}>
          📴 Chế độ offline — đang xem dữ liệu đã lưu
        </Text>
      )}
      {pendingCount > 0 && (
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#92400E' }}>
          ⏳ {pendingCount} thao tác đang chờ đồng bộ
        </Text>
      )}
    </View>
  );
}
