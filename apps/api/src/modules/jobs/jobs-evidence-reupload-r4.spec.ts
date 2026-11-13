/**
 * Spec R4: nút "Bổ sung ảnh bằng chứng" + prefill modal re-upload ở bước 7.
 *
 * NGUYÊN NHÂN GỐC live 2026-11-13 13:26 (đơn B 6af59e07bb2b94f98da7e088):
 * đơn kẹt ở pending_review với 0 ảnh. R3 đã thêm nhánh re-upload ở server
 * (completeByHelper, spec jobs-complete-reupload-r3.spec.ts) nhưng KHÔNG có
 * UI nào gọi nó — UI bằng chứng chỉ nằm trong modal hoàn thành, modal chỉ mở
 * từ action 'complete' của luồng in_progress, ở bước 7 không còn action đó.
 *
 * Revert check: ở code cũ (4205d2b) util apps/mobile/utils/evidence-reupload
 * KHÔNG tồn tại nên import dưới đây fail (TS2307) và toàn bộ spec fail —
 * cùng pattern với spec B5b/B5c.
 */
import {
  shouldShowEvidenceReupload,
  prefillReuploadMedia,
} from '../../../../../apps/mobile/utils/evidence-reupload';

describe('R4: evidence re-upload button visibility', () => {
  it('(a) pending_review + thợ được giao → hiện nút (đúng ca đơn B live)', () => {
    expect(shouldShowEvidenceReupload('pending_review', true)).toBe(true);
  });

  it('(b) pending_review + thợ KHÔNG phải người được giao → ẩn', () => {
    expect(shouldShowEvidenceReupload('pending_review', false)).toBe(false);
  });

  it('(c) in_progress / confirmed / completed / disputed + thợ được giao → ẩn', () => {
    for (const status of ['in_progress', 'confirmed', 'completed', 'disputed']) {
      expect(shouldShowEvidenceReupload(status, true)).toBe(false);
    }
  });

  it('(d) status null/undefined/rỗng → ẩn, không crash', () => {
    expect(shouldShowEvidenceReupload(null, true)).toBe(false);
    expect(shouldShowEvidenceReupload(undefined, true)).toBe(false);
    expect(shouldShowEvidenceReupload('', true)).toBe(false);
  });
});

describe('R4: prefill re-upload media (không wipe ảnh cũ)', () => {
  const job = {
    completion_photos: ['https://cdn.example.com/p1.jpg', 'https://cdn.example.com/p2.jpg'],
    completion_videos: ['https://cdn.example.com/v1.mp4'],
    completion_notes: 'Đã dọn sạch bếp.',
  };

  it('(e) prefill giữ nguyên ảnh/video/ghi chú đã lưu', () => {
    expect(prefillReuploadMedia(job)).toEqual({
      photos: ['https://cdn.example.com/p1.jpg', 'https://cdn.example.com/p2.jpg'],
      videos: ['https://cdn.example.com/v1.mp4'],
      notes: 'Đã dọn sạch bếp.',
    });
  });

  it('(f) trả về bản sao mới: mutate kết quả không đổi job gốc', () => {
    const prefilled = prefillReuploadMedia(job);
    expect(prefilled.photos).not.toBe(job.completion_photos);
    expect(prefilled.videos).not.toBe(job.completion_videos);
    prefilled.photos.push('https://cdn.example.com/p3.jpg');
    prefilled.videos.length = 0;
    expect(job.completion_photos).toHaveLength(2);
    expect(job.completion_videos).toHaveLength(1);
  });

  it('(g) job trống / null / undefined → mảng rỗng + ghi chú rỗng', () => {
    expect(prefillReuploadMedia({})).toEqual({ photos: [], videos: [], notes: '' });
    expect(prefillReuploadMedia(null)).toEqual({ photos: [], videos: [], notes: '' });
    expect(prefillReuploadMedia(undefined)).toEqual({ photos: [], videos: [], notes: '' });
    expect(
      prefillReuploadMedia({
        completion_photos: null,
        completion_videos: null,
        completion_notes: null,
      }),
    ).toEqual({ photos: [], videos: [], notes: '' });
  });
});
