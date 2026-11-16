// utils/nearby-helper-status.ts — R11 (M2): nhãn trạng thái thợ gần bạn.
//
// Dữ liệu giữ mã trạng thái thô từ API ('online' | 'busy' | 'offline');
// chuỗi hiển thị được map theo ngôn ngữ ở lúc render — không nhúng chuỗi
// tiếng Việt vào dữ liệu rồi render nguyên văn ở chế độ tiếng Anh.
// Các nhãn tiếng Việt cũ ('Đang rảnh' | 'Sẵn sàng' | 'Đang bận' |
// 'Ngoại tuyến') vẫn được map để dữ liệu đã cache cũ không bị rò tiếng Việt.
export function nearbyHelperStatusLabel(status: string, lang: 'vi' | 'en'): string {
  const s = (status ?? '').trim();
  switch (s) {
    case 'online':
    case 'Đang rảnh':
    case 'Sẵn sàng':
      return lang === 'en' ? 'Available' : 'Đang rảnh';
    case 'busy':
    case 'Đang bận':
      return lang === 'en' ? 'Busy' : 'Đang bận';
    case 'offline':
    case 'Ngoại tuyến':
      return lang === 'en' ? 'Offline' : 'Ngoại tuyến';
    default:
      return s;
  }
}
