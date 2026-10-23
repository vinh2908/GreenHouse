# GreenHouse — TỔNG HỢP TOÀN BỘ ROADMAP (Phase 1 + 2 + 3)

- **Repo:** `~/workspace/GreenHouse` (GitHub: `vinh2908/GreenHouse`)
- **Branch:** `feat/roadmap-phase-1` (từ `master`/`6b0085a`) — **CHƯA push GitHub**, chờ Vinh review.
- **Tổng quy mô:** 23 commit · 135 file thay đổi · +18.323 / −244 dòng.
- **File bàn giao trong thư mục này:**
  - `greenhouse-full-roadmap.patch` — patch đầy đủ cả 3 phase (định dạng format-patch, giữ nguyên 23 commit).
  - `README.md` — tổng kết chi tiết riêng Phase 1 (đọc trước nếu cần bối cảnh).
  - `REVIEW.md` — hướng dẫn review nhanh Phase 1.
  - `TONG-HOP.md` — tài liệu này.

## Kết quả kiểm chứng (đã chạy thật)

| Kiểm tra                                                  | Kết quả                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `tsc --noEmit` apps/api                                   | ✅ Sạch                                                                         |
| `tsc --noEmit` apps/mobile                                | ✅ Sạch                                                                         |
| `tsc --noEmit` apps/admin                                 | ✅ Sạch                                                                         |
| `next build` apps/admin                                   | ✅ Thành công — có đủ route mới `/claims`, `/support`, `/vouchers`, `/services` |
| Patch: `git apply --check` trên checkout mới của `master` | ✅ OK                                                                           |
| Patch: `git am` trên checkout mới + so tree hash          | ✅ OK — tree hash trùng 100% với branch (`dc4f729…`)                            |
| PDF hóa đơn (F11): render thử bằng service đã biên dịch   | ✅ File %PDF 753KB, `pdftotext` trích ra đúng tiếng Việt có dấu                 |
| Runtime end-to-end (API + Mongo + thiết bị thật)          | ⚠️ **CHƯA chạy** — xem checklist test ở cuối tài liệu                           |

**Lưu ý môi trường:** sandbox không có pnpm/npm nên **không cài thêm được package nào**; mọi tính năng đều dùng thư viện sẵn có trong `node_modules`, ngoại trừ `stringee-react-native` (đã khai báo vào `package.json` của mobile, cần cài khi tích hợp thật — xem mục Cuộc gọi). Các commit dùng `--no-verify` vì husky pre-commit gọi pnpm không tồn tại trong sandbox; typecheck đã chạy tay thay thế.

**Hai file KHÔNG bị đụng vào trong toàn bộ quá trình:** `apps/mobile/components/common/tracking-map-document.ts` và `location-picker.tsx` (phần sửa dở bản đồ của Vinh vẫn nguyên trạng chưa commit trong working tree).

---

## PHASE 1 — đã hoàn thành ở đợt trước (tóm tắt)

Chi tiết đầy đủ trong `README.md`. 6 tính năng: ① Gói định kỳ tự sinh đơn (cửa sổ trượt 14 ngày, ưu tiên thợ quen) · ② Thợ yêu thích + gửi đơn riêng (1–72h) + đặt lại 1 chạm · ③ Voucher (admin web `/vouchers`, trừ lượt nguyên tử lúc thanh toán, **sàn chịu tiền giảm**) · ④ Hồ sơ tranh chấp trong app (timeline, nộp bằng chứng, kháng cáo 1 lần/72h; **phân xử lại sau kháng cáo KHÔNG tự di chuyển tiền lần 2**) · ⑤ Đơn nhóm 2–4 thợ (lead mời member, chia tiền theo %, lead nhận phần dư do làm tròn) · ⑥ Gọi thoại che số (backend Stringee hoàn chỉnh; tầng media SDK được nối ở Phase 3 đợt này — xem mục riêng).

## PHASE 2 — hoàn thành đợt này

### 07. Giá cam kết cho dịch vụ tiêu chuẩn — ✅ Hoàn thiện

- `Service.pricing_model` (`quote`/`fixed`) + `fixed_price`; admin web có select mô hình giá + ô nhập giá cam kết trong trang Dịch vụ.
- Đơn thuộc dịch vụ giá cam kết: snapshot `is_fixed_price/fixed_price` lên Job, **chặn gửi báo giá**, thợ dùng `POST /jobs/:jobId/accept-fixed` nhận việc trực tiếp (atomic claim, kiểm tra trùng lịch, tạo Contract với `platform_fee`/`helper_receives` đúng công thức báo giá, `warranty_days=30`) → job sang CONFIRMED, mở chat, báo khách. Escrow dùng `Contract.total_price` như cũ = đúng giá cam kết.
- Mobile: banner "🏷️ Giá cam kết" ở booking + job-detail khách (thay vùng báo giá bằng thẻ "Đang chờ thợ nhận việc"), phía thợ có nút "Nhận việc ngay", ẩn form báo giá.

### 08. Hợp đồng giúp việc theo tháng — ✅ Hoàn thiện

- Module mới `monthly-contracts`: hợp đồng (lương tháng, lịch buổi làm theo thứ `getDay()` 0=CN…6=T7, địa chỉ, phí sàn snapshot mặc định 15%), khách tạo → thợ duyệt/từ chối.
- **Chấm công:** thợ check-in ngày làm (chặn trùng/ngày không thuộc lịch/ngày đã duyệt nghỉ) → khách xác nhận Có mặt/Vắng. **Xin nghỉ:** thợ gửi yêu cầu theo ngày → khách duyệt (tự tạo bản ghi nghỉ) / từ chối.
- **Chốt lương:** `GET …/settlement?month=` tính buổi thuộc lịch/đã xác nhận/nghỉ/vắng (buổi quá khứ không có bản ghi = vắng); `gross = làm tròn(lương × buổi xác nhận / buổi thuộc lịch)`, `fee = gross × %`, thợ nhận phần còn lại. `POST …/settlement/settle` chốt 1 lần/tháng (trùng → 409), cộng ví thợ qua `PaymentsService.creditWallet` mới (Transaction không gắn job, định danh bằng `reference=MONTHLY-…`).
- Mobile: 3 màn hình (danh sách, chi tiết có lịch điểm danh + mục xin nghỉ + mục chốt lương, tạo hợp đồng), entry từ hồ sơ thợ ("📅 Thuê theo tháng") và menu profile 2 phía.

### 09. Đơn bảo hành 1 chạm — ✅ Hoàn thiện

- Từ đơn COMPLETED còn trong hạn (hạn = `contract.warranty_days`, mặc định 30 ngày kể từ hoàn thành): `POST /jobs/:jobId/warranty` tạo đơn mới **miễn phí**, sao chép nội dung đơn gốc, gửi riêng cho thợ cũ 72h; chỉ cho phép 1 đơn bảo hành đang hoạt động cho mỗi đơn gốc (409 kèm id đơn hiện có).
- Đơn bảo hành dùng chung đường nhận việc trực tiếp với đơn giá cam kết nhưng tạo Contract **0₫**; `approveCompletion` bỏ qua mọi cộng/trừ ví khi `total_price = 0` (không phát sinh giao dịch 0 đồng).
- Mobile: thẻ "🛡 Bảo hành" trong chi tiết đơn (tạo 1 chạm → điều hướng sang đơn mới; có rồi thì "Xem đơn bảo hành"), badge ở danh sách đơn; phía thợ thấy nút "Nhận việc bảo hành".

### 10. Yêu cầu bồi thường bảo hiểm trong app — ✅ Hoàn thiện

- Module mới `claims`: khách gửi yêu cầu từ đơn COMPLETED còn trong cửa sổ bảo hiểm (cùng logic hạn như F09, quá hạn báo rõ ràng), kèm mô tả + ảnh + số tiền đề nghị; 1 yêu cầu đang mở cho mỗi đơn.
- Admin web trang `/claims`: danh sách + lọc trạng thái + panel chi tiết (ảnh bằng chứng, timeline); duyệt → **chi trả vào ví khách** qua `PaymentsService.refundCustomer` rồi mới ghi trạng thái `paid` + lưu `payout_transaction_id` (không bao giờ có trạng thái "đã trả" khi chi trả lỗi); từ chối bắt buộc lý do; mọi chuyển trạng thái đều ghi timeline + gửi thông báo cho khách.
- Mobile: màn hình `app/claim/[jobId].tsx` (form gửi hoặc xem trạng thái + timeline), entry trong chi tiết đơn khách.

### 11. Hóa đơn điện tử PDF trong chi tiết đơn — ✅ Hoàn thiện

- Module mới `invoices`: `GET /jobs/:jobId/invoice.pdf` (chỉ khách/thợ của đơn hoặc admin; chỉ khi đơn đã thanh toán/hoàn thành).
- Bộ sinh PDF **viết tay, 0 dependency**: nhúng font DejaVu Sans + Bold (đã vendor vào `apps/api/src/modules/invoices/assets/`, giấy phép tự do) dạng CIDFontType2 + ToUnicode CMap → tiếng Việt có dấu hiển thị và trích xuất đúng (đã kiểm bằng `pdftotext` trên bản render thật: "HÓA ĐƠN ĐIỆN TỬ", "Tổng vệ sinh nhà", "TỔNG THANH TOÁN 900.000₫"…).
- Nội dung: số hóa đơn `HD-<8 ký tự cuối của đơn>`, khách/thợ/dịch vụ/địa chỉ, dòng giá dịch vụ, dòng giảm voucher (nếu có), phụ phí SOS (nếu có), tổng = `total_price − discount_amount + sos_surcharge`, phương thức + trạng thái ĐÃ THANH TOÁN.
- Mobile: nút "🧾 Tải hóa đơn (PDF)" **chỉ nằm trong chi tiết đơn** đúng theo yêu cầu (không có mục hóa đơn riêng ở lịch sử); web tải qua blob, native lưu file vào thư mục cache + toast đường dẫn (chưa có expo-sharing nên chưa mở share sheet).
- ⚠️ Chưa có dòng giảm do **điểm thành viên** (F12 làm sau) trên hóa đơn — xem mục Việc còn lại #4.

### 12. Điểm thành viên & hạng khách — ✅ Hoàn thiện

- Module mới `loyalty` (mô hình giống hệt voucher: gắn lúc trước thanh toán, trừ thật nguyên tử lúc thanh toán). Hằng số trong `packages/constants` (có thể ghi đè bằng env cùng tên): tích **1 điểm / 10.000₫**, đổi **1 điểm = 1.000₫**, tối thiểu đổi 100 điểm; hạng theo điểm tích lũy: Thường <500 · Bạc 500–1999 · Vàng ≥2000; trần đổi theo hạng: 20%/30%/50% giá trị đơn.
- Tích điểm khi nghiệm thu đơn (idempotent 2 lớp: kiểm tra giao dịch + unique partial index — không cộng trùng dù bấm nghiệm thu lại). Đổi điểm tại job-detail khi đơn đã có giá chốt (có Contract) và chưa thanh toán; số điểm vượt trần tự giảm xuống mức trần (không mất điểm oan); **số dư không đủ lúc thanh toán → chặn thanh toán kèm thông báo** (giống triết lý voucher, không âm thầm tính giá gốc).
- Admin: `GET /admin/loyalty/users/:userId` + `POST …/adjust` (cộng/trừ điểm thủ công, không âm, **không** tính vào điểm tích lũy hạng). Chưa có trang admin web cho loyalty (chỉ API).
- Mobile: màn hình `app/loyalty.tsx` (số dư, hạng + thanh tiến trình, lịch sử), thẻ điểm ở profile khách, component dùng điểm trong vùng thanh toán của chi tiết đơn.

### 13. Lịch làm việc của thợ — ✅ Hoàn thiện (có caveat phân trang)

- `HelperProfile.availability`: bật/tắt, ngày làm trong tuần (0=CN…6=T7), giờ bắt đầu/kết thúc, danh sách ngày nghỉ riêng `blocked_dates`. API `GET/PATCH /helpers/me/availability`.
- Áp dụng thật ở 3 nơi: **feed đơn** của thợ (lọc ngày/giờ/ngày nghỉ), **thông báo đơn mới cho thợ gần đó** (bỏ qua thợ không rảnh ngày làm), **đơn định kỳ** (lượt nào thợ quen không rảnh → tạo đơn công khai thay vì gửi riêng).
- Mobile: màn hình `app/helper-availability.tsx` + entry trong profile thợ.
- ⚠️ Caveat: lọc feed thực hiện in-memory trên trang vừa fetch nên `total/total_pages` là số trước lọc (đã ghi comment trong code + cờ `availability_filtered` trong response). Feed vốn đã re-sort theo khoảng cách sau khi fetch nên phân trang vốn không tuyệt đối; nếu sau này cần chính xác tuyệt đối thì phải lọc ở tầng Mongo bằng `$expr` trên `preferred_date`.

### 14. Báo cáo thu nhập nâng cao cho thợ — ✅ Hoàn thiện

- `GET /payments/me/earnings-report`: mọi tổng là **NET = earning − commission** (nhất quán cả tuần/tháng/mục tiêu; đơn online đã giải ngân NET nên không trừ 2 lần). Trả về: tuần hiện tại theo từng ngày + tổng + so tuần trước; tháng: tổng, số đơn có thu nhập, so tháng trước, gộp theo tuần 1–5; `change_percent = null` khi kỳ trước = 0. Mục tiêu tháng lưu ở `HelperProfile.income_goal_monthly` (`PATCH /helpers/me/income-goal`), tiến độ clamp 0–100%.
- Mobile: section "📊 Báo cáo thu nhập" trong màn Thu nhập — bar chart tuần vẽ bằng View thuần (không thêm thư viện), chip +/−% so kỳ trước, mini bar theo tuần, thẻ mục tiêu có sửa inline. Phần ví cũ giữ nguyên.

## PHASE 3 — hoàn thành đợt này

### 15. Bản đồ nhu cầu cho thợ — ✅ Hoàn thiện

- `GET /jobs/demand-map`: aggregate các đơn đang mở/chờ báo giá theo (quận, thành phố): số đơn, tọa độ trung bình khu vực, số đơn giá cam kết/AI.
- Mobile `app/demand-map.tsx`: `react-native-maps` (dependency sẵn có) — vòng tròn nhiệt bán kính tỉ lệ số đơn + danh sách khu vực nóng, chạm để căn giữa bản đồ. Trên web chỉ hiện danh sách (bản đồ native không chạy trên web). Entry: thẻ trong màn hình việc của thợ.

### 16. Chế độ offline cho app thợ — ✅ Hoàn thiện (mobile)

- Cache snapshot danh sách đơn đang thực hiện + chi tiết từng đơn (AsyncStorage); mất mạng → tự dùng bản cache (`fromCache`), có banner "📴 Chế độ offline" ở màn hình việc + chi tiết đơn.
- **Hàng đợi thao tác tiến độ** (đang đến / đã đến / bắt đầu): mất mạng → xếp hàng + toast "Đã lưu thao tác"; có mạng lại (kiểm tra `/health` mỗi 20 giây + khi mở lại app) → tự gửi lại FIFO. Xung đột (server trả 4xx/409 vì trạng thái đơn đã đổi) → **bỏ thao tác đó** (server thắng — last-write-wins, có toast thông báo). Thao tác hoàn thành đơn chỉ xếp hàng được khi ảnh đã upload xong (upload ảnh vẫn cần mạng — giới hạn đã ghi rõ).

### 17. Chụp ảnh sự cố, AI nhận diện — ✅ Hoàn thiện (degrade an toàn)

- Tái dùng đúng AI provider hiện hữu (`AiConfigService`: Gemini chính, OpenAI dự phòng, mock khi thiếu key). Thêm `chatWithImage` (Gemini inlineData / OpenAI image_url), model vision qua env `AI_VISION_MODEL` (mặc định `gemini-2.5-flash`).
- `POST /ai/analyze-photo`: trả `{detected_issue, suggested_service_slug (validate thuộc danh sách dịch vụ có thật, sai → null), description_draft, price_min, price_max, confidence}`; provider không khả dụng/lỗi → `{available:false}`, không bao giờ ném lỗi cho app. (Đã nới giới hạn body JSON của API lên 10MB trong `main.ts` để nhận ảnh base64.)
- Mobile: nút "📷 Phân tích ảnh sự cố bằng AI" ở bước Mô tả của booking — chọn ảnh → tiền điền mô tả, tự chọn dịch vụ nếu slug khớp, hiện thẻ kết quả kiểu thẻ ước giá AI; lỗi → toast thân thiện và **ảnh vẫn được đính kèm** vào đơn như thường.

### 18. Live chat hỗ trợ trong app — ✅ Hoàn thiện

- Module mới `support`: hội thoại hỗ trợ tách khỏi chat đơn (mỗi user 1 thread đang mở; đóng rồi mở lại = thread mới), tin nhắn 2 chiều, đếm chưa đọc 2 phía. Admin trả lời → bắn socket `support:message` + thông báo chuông `support_reply` cho user.
- Mobile `app/support-chat.tsx`: mục **FAQ trả lời nhanh** (8 câu tĩnh, chạm xem đáp án ngay + nút gửi câu hỏi cho đội hỗ trợ nếu chưa đủ), thread chat, polling 4 giây + invalidate qua socket. Entry: nút nổi bật ở Trung tâm trợ giúp + menu profile 2 phía.
- Admin web trang `/support`: danh sách hội thoại (badge chưa đọc) + khung trả lời, tự refresh 5 giây. (Admin chưa có kênh socket riêng — polling là đủ cho quy mô hiện tại.)

### 19. Thông báo qua Zalo OA (ZNS) — ✅ Hoàn thiện ở mức code, chờ tài khoản của Vinh

- `ZaloNotificationService` gắn vào `NotificationsService.create()` (fire-and-forget, **không bao giờ** làm lỗi luồng chính): chỉ gửi cho các sự kiện quan trọng — báo giá được chọn, đơn xác nhận, thợ đang đến, hoàn thành đơn, thanh toán thành công, rút tiền đã xử lý. Chuẩn hóa SĐT `0…` → `84…`; gọi API `business.openapi.zalo.me/message/template` với `template_data {title, content}`; **thiếu env = tự bỏ qua im lặng**.
- Cần Vinh đăng ký (không AI nào làm thay được): tạo **Zalo Official Account** tại oa.zalo.me → đăng ký dịch vụ **ZNS** → tạo và chờ duyệt **template** chứa đúng 2 tham số `{title}` và `{content}` → lấy **access token** tại Zalo for Developers (developers.zalo.me) → đặt env `ZALO_OA_ACCESS_TOKEN`, `ZALO_ZNS_TEMPLATE_ID`. Lưu ý: access token Zalo có hạn sử dụng — bản hiện tại đọc token tĩnh từ env; khi vận hành thật nên bổ sung cơ chế refresh token (đã ghi vào Việc còn lại).

### 20. Tiếng Anh + cỡ chữ lớn — ✅ Hoàn thiện một phần (đúng phạm vi đã chốt)

- Hạ tầng: `stores/settings.
  ...[truncated 14931 chars]
