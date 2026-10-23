# TỔNG HỢP BÀN GIAO — SOS Backup + toàn bộ tính năng GreenHouse (cập nhật 22/10/2026)

Gói này gồm tính năng mới **SOS Backup** (7 commit) cộng với toàn bộ gói roadmap 20 tính năng đã bàn giao trước đó (23 commit). Có 2 file patch — chọn ĐÚNG MỘT theo trạng thái repo ở máy bạn:

| File                                     | Khi nào dùng                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `greenhouse-all-features.patch` (~2,0MB) | Repo máy bạn đang ở master gốc, **chưa áp patch roadmap** lần nào → áp 1 file này là có tất cả (roadmap + SOS Backup). |
| `greenhouse-sos-backup.patch` (~170KB)   | Đã áp `greenhouse-full-roadmap.patch` rồi → chỉ cần áp thêm file này để có SOS Backup.                                 |

Cả hai đã được kiểm chứng `git apply --check` trên bản master sạch (và kiểm chứng áp nối tiếp roadmap → SOS). Patch có nhúng file nhị phân (font PDF hóa đơn) nên **phải dùng `git apply`, không dùng `git am` từng commit**.

⚠️ Trước khi áp: repo có 2 file đang sửa dở chưa commit — `apps/mobile/components/common/tracking-map-document.ts` và `location-picker.tsx`. **Không được stash/discard/checkout đè 2 file này.** Chạy `git apply --check` trước; nếu xung đột chỉ ở 2 file đó thì báo lại cho chủ repo, đừng tự xử lý.

## SOS Backup — tóm tắt những gì đã có (chi tiết đầy đủ trong README.md cùng thư mục)

- Thợ không tiếp tục được đơn → gửi SOS kèm lý do → trạng thái **chờ khách quyết định** (chưa phát sóng tìm người thay).
- Khách chọn **Đổi người**: mới chạy thuật toán **Hungarian** (tự viết, O(n³)) chọn thợ tối ưu trong pool thợ online + đã KYC + đúng dịch vụ + vị trí tươi + ≤30km; phát sóng theo wave (~4 phút); **ai nhận trước thắng** bằng claim nguyên tử; đổi thợ chỉ thay `helper_id` — giá đơn và tiền Escrow **không đổi**.
- Khách chọn **Hủy đơn**: hủy theo chính sách SOS, hoàn **100% số tiền thực trả** (sau giảm voucher/điểm) qua đường refund sẵn có; thợ gốc được giải phóng, không bị ghi lỗi hủy muộn. Khách không trả lời sau 5 phút (nhắc 1 lần) → mặc định hủy + hoàn tiền (đổi được qua env `SOS_BACKUP_ON_DECISION_TIMEOUT`).
- **Điểm thợ thang 100** (Đánh giá 40 / Hoàn thành 25 / Phản hồi 15 / Tin cậy 20): hủy do thợ khởi xướng (kể cả gửi SOS) đếm trong cửa sổ trượt 7 ngày; **quá 3 lần → −5 điểm/lần** vào tiêu chí Tin cậy; điểm phạt đi vào chi phí Hungarian và có log `HelperPenaltyEvent` để admin audit.
- Đã kiểm chứng ở mức code: API `tsc` sạch; Jest **22/22 pass** (Hungarian đối chiếu brute-force 300 ma trận ngẫu nhiên; test ngưỡng phạt). **Chưa runtime-test** (cần Mongo + tài khoản thật).
- Giới hạn đã biết: SOS mới cho đơn 1 thợ (đơn nhóm chưa hỗ trợ); chưa có UI admin xem SOS bị gắn cờ + sổ điểm phạt (dữ liệu đã ghi sẵn).

## Checklist test ưu tiên sau khi áp (runtime, trên máy bạn)

1. **Luồng đồng ý của khách**: thợ A gửi SOS → khách thấy popup → chọn Đổi người → thợ B (online, đúng dịch vụ) thấy popup backup → nhận → đơn chuyển sang B, khách thấy banner đổi thợ, tiền giữ nguyên.
2. **Nhánh hủy**: khách chọn Hủy → ví khách được hoàn đúng số thực trả, đơn đóng, thợ A không tăng bộ đếm hủy muộn.
3. **Race nhận đơn**: 2 thợ cùng bấm Nhận một SOS → chỉ 1 người thành công, người kia thấy "Đã có người khác nhận".
4. **Khách không trả lời**: để quá 5 phút → đơn tự hủy + hoàn tiền, cả hai phía nhận thông báo.
5. **Điểm phạt**: một thợ hủy/SOS lần thứ 4 trong 7 ngày → điểm Tin cậy −5, có dòng log phạt, chi phí Hungarian của thợ đó tăng tương ứng.
6. **Tiền của gói roadmap** (nếu áp bản gộp): voucher, chia tiền đơn nhóm, hợp đồng tháng, bồi thường bảo hiểm, tranh chấp — theo checklist trong `greenhouse-phase1/TONG-HOP.md`.

## Việc chỉ chủ repo làm được (AI nào cũng không làm thay)

- Key Stringee: key cũ từng lộ ảnh chụp — xóa trong console Stringee, tạo key mới, dán vào env trên Render + `.env` local. **Không gửi key qua chat.**
- Zalo OA: đăng ký OA + duyệt mẫu ZNS mới chạy thông báo Zalo (không có vẫn chạy bình thường, tự bỏ qua).
- Build dev/EAS để test cuộc gọi Stringee (không chạy trên Expo Go).

---

## Prompt dán cho Antigravity / Codex

```
Bạn đang làm việc trong repo GreenHouse (D:\GREENHOUSE, monorepo: apps/mobile Expo, apps/api NestJS, apps/admin Next.js).

NHIỆM VỤ: áp gói patch tính năng, review, sửa lỗi nếu có, test runtime và chuẩn bị deploy.

BƯỚC 0 — AN TOÀN:
- Chạy git status trước. Có 2 file đang sửa dở chưa commit (apps/mobile/components/common/tracking-map-document.ts và location-picker.tsx) — TUYỆT ĐỐI không stash, discard, checkout hay commit hộ 2 file này.
- Trong thư mục gốc repo có 2 file patch. Chọn ĐÚNG MỘT:
  + Nếu repo chưa từng áp patch roadmap: dùng greenhouse-all-features.patch.
  + Nếu đã áp greenhouse-full-roadmap.patch: dùng greenhouse-sos-backup.patch.
- Chạy git apply --check <file đã chọn> trước. Nếu lỗi xung đột ở file không thuộc 2 file trên, dừng và báo lại, không tự ý sửa tay để ép áp.

BƯỚC 1 — ÁP + BIÊN DỊCH:
- git apply <file đã chọn>.
- Cài dependencies nếu thiếu (pnpm install), sau đó typecheck cả 3 app (api + mobile: tsc --noEmit; admin: next build). Sửa mọi lỗi type phát sinh từ patch.
- Chạy test của API (jest) — kỳ vọng 22/22 pass, đặc biệt bộ test Hungarian và helper-score.

BƯỚC 2 — REVIEW TẬP TRUNG VÀO SOS BACKUP (đọc greenhouse-sos-backup/README.md để nắm thiết kế):
- Cổng đồng ý của khách: SOS không được phát sóng tìm backup trước khi khách chọn "Đổi người".
- Nhánh hủy SOS: hoàn đúng số tiền THỰC TRẢ (total_price trừ voucher trừ điểm loyalty) qua refundCustomer sẵn có; thợ gốc không bị tăng late_cancellation_count/risk_score.
- Đổi người: chỉ thay helper_id trên Job + Contract; không được ghi payment_status/total_price/helper_receives.
- Claim nhận backup phải nguyên tử (first-accept-wins): 2 thợ nhận cùng lúc chỉ 1 người thành công.
- Điểm phạt hủy: cửa sổ trượt 7 ngày, >3 lần trừ −5/lần vào tiêu chí Tin cậy (thang 100), có ghi HelperPenaltyEvent.

BƯỚC 3 — TEST RUNTIME theo checklist trong greenhouse-sos-backup/TONG-HOP-SOS.md (6 mục ưu tiên, đặc biệt race nhận đơn và nhánh hoàn tiền). Báo cáo từng mục đạt/không đạt.

BƯỚC 4 — DEPLOY (chỉ khi các bước trên đạt): deploy API lên Render, build web khách/admin lên Vercel như cấu hình hiện có, build APK dev qua EAS để test trên máy thật (SOS popup đa thiết bị, cuộc gọi Stringee cần dev build, không dùng Expo Go).

Báo cáo sau mỗi bước: đã làm gì, kết quả, lỗi gặp phải. Không tự ý đổi thiết kế tính năng; chỗ nào chưa rõ thì dừng và hỏi.
```
