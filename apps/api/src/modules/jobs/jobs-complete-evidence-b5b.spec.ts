/**
 * Spec B5b: cổng "đủ ảnh nghiệm thu" chặn gửi nghiệm thu khi chưa có ảnh.
 *
 * NGUYÊN NHÂN GỐC live 2026-11-13 (đơn B 6af59e07bb2b94f98da7e088): thợ gửi
 * nghiệm thu KHÔNG ảnh, KHÔNG video vì app cho phép — handleCompleteSubmission
 * mở Alert "evidence_no_media" với nút "Tiếp tục gửi" (evidence_submit_anyway)
 * gọi completeJob với mảng rỗng, server (completeByHelper) cũng nhận mảng
 * rỗng. Sau đó cổng B57 ở approveCompletion yêu cầu ≥1 ảnh nên khách bấm
 * nghiệm thu là lỗi — đơn kẹt vĩnh viễn ở bước 7 "Chờ nghiệm thu".
 *
 * Cổng này (checkCompletionEvidence, apps/mobile/utils/completion-evidence.ts)
 * chỉ đếm ẢNH vì B57 cũng chỉ đếm completion_photos: chỉ có video mà không
 * có ảnh vẫn bị chặn, gửi nghiệm thu chỉ-video sẽ kẹt y hệt.
 *
 * Revert check: ở code cũ (ce3e227) util này KHÔNG tồn tại nên import dưới
 * đây fail và toàn bộ spec fail — đã kiểm chứng bằng worktree ở ce3e227
 * (xem log ~/workspace/.tmp/review-live-r3-gates/b-spec.log).
 */
import { checkCompletionEvidence } from '../../../../../apps/mobile/utils/completion-evidence';

describe('B5b: completion requires at least 1 photo', () => {
  it('(a) 0 ảnh + 0 video → blocked, photo required (đúng ca đơn B live)', () => {
    expect(checkCompletionEvidence({ photos: [], videos: [] })).toEqual({
      allowed: false,
      reason: 'photo-required',
    });
  });

  it('(b) 0 ảnh + 2 video → vẫn blocked: video không thay thế được ảnh (B57 chỉ đếm ảnh)', () => {
    expect(
      checkCompletionEvidence({
        photos: [],
        videos: ['https://cdn.example.com/video1.mp4', 'https://cdn.example.com/video2.mp4'],
      }),
    ).toEqual({ allowed: false, reason: 'photo-required' });
  });

  it('(c) 1 ảnh + 0 video → allowed', () => {
    expect(
      checkCompletionEvidence({ photos: ['https://cdn.example.com/photo1.jpg'], videos: [] }),
    ).toEqual({ allowed: true });
  });

  it('(d) nhiều ảnh + video → allowed', () => {
    expect(
      checkCompletionEvidence({
        photos: ['https://cdn.example.com/photo1.jpg', 'https://cdn.example.com/photo2.jpg'],
        videos: ['https://cdn.example.com/video1.mp4'],
      }),
    ).toEqual({ allowed: true });
  });

  it('(e) input null/undefined hoặc photos null → blocked, photo required', () => {
    expect(checkCompletionEvidence(null)).toEqual({ allowed: false, reason: 'photo-required' });
    expect(checkCompletionEvidence(undefined)).toEqual({
      allowed: false,
      reason: 'photo-required',
    });
    expect(
      checkCompletionEvidence({ photos: null, videos: ['https://cdn.example.com/v.mp4'] }),
    ).toEqual({
      allowed: false,
      reason: 'photo-required',
    });
  });
});
