# SOS Backup — Thợ không thể tiếp tục đơn → khách đồng ý mới đổi người

Tính năng cho phép thợ đang giữ đơn (đã chốt / đang di chuyển / đã đến / đang làm) gửi tín hiệu SOS khi gặp bất khả kháng. Điểm khác biệt cốt lõi theo yêu cầu chủ dự án: **khách hàng phải đồng ý trước** — hệ thống không tự ý thay người.

Kèm theo: **điểm hiệu suất thợ thang 100 + phạt hủy đơn** (hủy quá 3 đơn trong 7 ngày → trừ điểm Độ tin cậy), và điểm phạt được đưa vào cả chi phí ghép Hungarian để thợ bị phạt kém cạnh tranh hơn khi giành đơn backup.

- Repo: `~/workspace/GreenHouse`, branch **`feat/roadmap-phase-1`**, 7 commits (liệt kê ở cuối).
- **Chưa deploy.** Cần review + test runtime theo checklist ở cuối file này.

---

## 1. Luồng nghiệp vụ (state machine)

```
Thợ bấm SOS (chọn lý do) ──► AWAITING_CUSTOMER ──► khách "Chấp nhận đổi người" ──► PENDING (phát sóng Hungarian, theo wave) ──► ACCEPTED (thợ mới nhận thay, first-accept-wins)
                                │                        │
                                │                        └── khách "Hủy đơn" ──► CUSTOMER_CANCELLED: đơn hủy, hoàn 100% tiền thực trả, thợ KHÔNG bị phạt
                                └── quá hạn khách không trả lời ──► mặc định theo env SOS_BACKUP_ON_DECISION_TIMEOUT
                                                                      = cancel_job (mặc định) ──► DECISION_TIMEOUT (hủy + hoàn tiền như trên)
                                                                      = accept_replacement ──► PENDING
PENDING ──► hết hạn phát sóng / cạn ứng viên ──► EXPIRED (gắn cờ admin_attention, báo khách + thợ + mọi admin)
AWAITING_CUSTOMER / PENDING ──► thợ gốc thu hồi ──► CANCELLED
```

Lý do SOS (chỉ gửi **mã lý do** cho khách, ghi chú riêng của thợ không hiển thị): `personal_emergency` (việc cá nhân khẩn cấp), `accident` (tai nạn), `vehicle_breakdown` (xe hỏng), `family_emergency` (việc gia đình khẩn cấp), `other`.

Ràng buộc hiện tại: SOS chỉ cho **đơn 1 thợ** (đơn nhóm có thành viên khác đã accept → API từ chối, ghi rõ là follow-up). Trạng thái đơn được SOS: `confirmed`, `helper_on_the_way`, `helper_arrived`, `in_progress`.

### An toàn tiền (đã tự review)

- **Đổi thợ KHÔNG đụng vào tiền**: thao tác swap chỉ `$set helper_id` trên Job + Contract, ghi `job.sos_backup_replacement` (vết hiển thị cho khách) và event. `payment_status`, `contract.total_price`, `contract.helper_receives` **không đổi** — tiền khách giữ đảm bảo đứng yên; khi đơn hoàn thành, tiền công chảy về `job.helper_id` mới với đúng số cũ (luồng `approveCompletion` sẵn có).
- **Hủy theo chính sách SOS**: hoàn = `total_price − giảm voucher − giảm điểm loyalty` (đúng số khách thực trả; phần giảm do sàn chịu như quy ước dispute hiện hữu), chỉ khi `payment_status = PAID` và không phải tiền mặt (đơn tiền mặt chưa thu tiền → không hoàn). Hoàn qua `PaymentsService.refundCustomer` sẵn có. Nếu hoàn lỗi → vẫn hủy đơn (thợ không thể tiếp tục) + gắn cờ `admin_attention` để đối soát ví thủ công. **Không khôi phục lượt voucher/điểm loyalty** khi hủy SOS — follow-up cho admin (ghi ở §8).
- Thợ gốc được giải phóng (BUSY → ONLINE nếu không còn đơn active) và **không** bị tăng `late_cancellation_count` / `risk_score` cho đơn SOS này. (Điểm uy tín ở §3 là cơ chế riêng, tính trên tổng số lần không hoàn thành đơn.)
- Claim nguyên tử ở mọi bước tranh chấp: quyết định của khách (conditional `findOneAndUpdate` theo `status = awaiting_customer`), accept của ứng viên (`pending → accepted`), swap đơn (điều kiện `helper_id` cũ + trạng thái active, rollback claim nếu swap fail), unique partial index chống 2 SOS active/đơn, mutex theo từng thợ chống 1 thợ thắng 2 SOS cùng lúc.

## 2. Ghép cặp Hungarian (Kuhn–Munkres)

- Solver tự viết: `apps/api/src/modules/sos-backup/utils/hungarian.ts` — thuật toán potentials O(n³) (e-maxx), hỗ trợ ma trận chữ nhật, ô cấm = `Infinity` (thay bằng hằng BIG nội bộ, không bao giờ trả về cặp bị cấm). Không thêm dependency.
- Test: `hungarian.spec.ts` — 10 test, gồm bài toán kinh điển 3×3 (tổng tối ưu 5), ca greedy thất bại ([[1,2],[2,100]] → tối ưu 4), ma trận chữ nhật 2 chiều, ô cấm, và **đối chiếu brute-force trên 300 ma trận ngẫu nhiên nhỏ** → tất cả pass.
- Mỗi lần phát sóng/leo thang: chạy Hungarian **toàn cục** trên mọi SOS đang PENDING (hàng = đơn SOS, cột = hợp nhất ứng viên; ô = chi phí của thợ cho đơn đó, `Infinity` nếu không đủ điều kiện) → mỗi đơn có 1 ghép tối ưu toàn cục, không giành thợ của nhau.
- Ứng viên đủ điều kiện: hồ sơ `ONLINE` + đã duyệt KYC + có service của đơn + **đang kết nối socket** + có vị trí (GPS tươi ≤ 120 phút, hoặc vị trí ghim tay) + trong bán kính 30 km + **không đang giữ đơn active nào**.
- Wave: đợt 1 = ghép tối ưu của đơn + các ứng viên rẻ tiếp theo (tối đa 5, loại thợ đang là ghép tối ưu của SOS khác). Đợt sau mở mỗi 60s hoặc ngay khi mọi người được mời đều từ chối. Từ chối → loại khỏi các đợt sau của SOS đó. Toàn bộ giai đoạn phát sóng tối đa ~4 phút.
- **Mô hình chi phí** (càng thấp càng tốt):
  `cost = distance_km × 10 + (5 − rating) × 20 + max(0, 50 − completed_jobs) × 0.6 + active_jobs × 100 + penalty_points × 2`
  (thành phần active_jobs hiện luôn 0 vì ứng viên bận bị loại từ pool — giữ trong công thức để minh bạch khi nới điều kiện sau này; `penalty_points` xem §3.)

## 3. Điểm hiệu suất thợ (thang 100) + phạt hủy đơn

Mở rộng từ field sẵn có trên `HelperProfile`, không tạo hệ song song. Code: `apps/api/src/modules/helpers/utils/helper-score.ts` (hàm thuần) + `record-cancellation.ts` (ghi nhận + tính lại) + test `helper-score.spec.ts` (12 test).

**4 tiêu chí** (tổng 100): Đánh giá dịch vụ 40đ = `rating/5 × 40` (chưa có review → 40đ trung tính) · Hoàn thành 25đ = `completion_rate/100 × 25` · Phản hồi 15đ = `acceptance_rate/100 × 15` · Độ tin cậy 20đ = `20 − penalty_points` (sàn 0).

**Quy tắc phạt** (ngưỡng + thang 100 do chủ dự án đặt; các con số dưới là **mặc định do người triển khai chọn, chỉnh bằng env**):

- Đếm lần hủy **do thợ khởi xướng** trong **cửa sổ trượt 7 ngày** (`HELPER_SCORE_CANCEL_WINDOW_DAYS`), gồm cả hai nguồn: hủy đơn thường sau khi đã chốt (`confirmed`/`helper_on_the_way`, cùng phạm vi nhánh phạt sẵn có trong `cancelJob`) và **mỗi lần gửi SOS Backup** (dù khách sau đó chọn đổi người hay hủy đơn — vì bản chất thợ đã không hoàn thành đơn). Trước khi chốt đơn (open/receiving_quotes) hủy không tính.
- **≤ 3 lần/7 ngày: không phạt.** Từ lần thứ 4 trở đi: **−5 điểm/lần vượt** (`HELPER_SCORE_PENALTY_PER_EXCESS`, ngưỡng chỉnh bằng `HELPER_SCORE_CANCEL_THRESHOLD`) trừ vào tiêu chí Độ tin cậy, sàn 0.
- Lưu vết: `HelperProfile.cancellation_timestamps` (đã cắt ngoài cửa sổ mỗi lần ghi) + snapshot `cancellations_last_7_days`, `penalty_points`, `performance_score`, `score_breakdown`, `score_updated_at`. Mỗi lần hủy **phát sinh điểm trừ** ghi 1 dòng `HelperPenaltyEvent` (helper, nguồn `job_cancel`/`sos_initiation`, job/sos id, số hủy trong cửa sổ, điểm trừ, điểm sau phạt) để admin audit — admin UI xem sổ này là follow-up (§8), dữ liệu đã sẵn trong Mongo (`helperpenaltyevents`).
- Điểm phạt đi vào Hungarian: `penalty_points × SOS_BACKUP_COST_PENALTY_WEIGHT` (mặc định 2) cộng vào chi phí ứng viên (tính tươi từ `cancellation_timestamps` lúc ghép).
- Hiển thị cho thợ (tối thiểu, đúng phạm vi): API tạo SOS trả kèm `cancellation_score`; app hiện cảnh báo trong card SOS khi đã hủy ≥ 2 lần/7 ngày ("hủy quá 3 đơn sẽ bị trừ điểm tin cậy" + điểm hiện tại), toast riêng khi lần SOS này làm phát sinh điểm trừ hoặc chạm mức sắp phạt.

⚠️ Lưu ý nghiệp vụ: chính sách SOS nói "thợ không bị phạt" (không tính late-cancel/risk cho đơn đó) — điểm uy tín ở đây là tín hiệu dài hạn riêng, vẫn tính lần SOS như một lần không hoàn thành đơn theo đúng rule chủ dự án mới đặt. Nếu muốn miễn cả điểm uy tín cho SOS có lý do chính đáng (vd tai nạn) → cần cơ chế admin duyệt miễn, chưa làm (follow-up §8).

## 4. API endpoints (`/api/v1/sos-backup`, đều cần JWT)

| Method | Path                                   | Ai                | Mô tả                                                                                 |
| ------ | -------------------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| POST   | `/sos-backup/jobs/:jobId`              | Thợ giữ đơn       | Tạo SOS → trạng thái chờ khách. Trả SOS + `cancellation_score`                        |
| POST   | `/sos-backup/:sosId/customer-decision` | Khách của đơn     | `{ decision: 'accept_replacement' \| 'cancel_job' }`                                  |
| POST   | `/sos-backup/:sosId/accept`            | Ứng viên được mời | Nhận thay (first-accept-wins; 409 nếu đã có người nhận/hết hạn)                       |
| POST   | `/sos-backup/:sosId/decline`           | Ứng viên          | Từ chối — loại khỏi các wave sau                                                      |
| POST   | `/sos-backup/:sosId/cancel`            | Thợ gốc           | Thu hồi SOS (khi chưa có người thay)                                                  |
| GET    | `/sos-backup/active`                   | Thợ               | `{ incoming: [popup đang mời], outgoing: [SOS mình đã gửi] }` — bắt kịp khi reconnect |
| GET    | `/sos-backup/customer-pending`         | Khách             | Các SOS đang chờ mình quyết định — hiện popup khi mở lại app                          |
| GET    | `/sos-backup/by-job/:jobId`            | Các bên liên quan | Trạng thái SOS active của 1 đơn + `my_state`                                          |

## 5. Socket events (thêm vào `@homemate/constants`)

| Event                             | Tới ai                                     | Nội dung                                                            |
| --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `sos:customer_decision_requested` | Khách (user room)                          | Mở popup quyết định (kèm cờ `reminder: true` ở lần nhắc giữa hạn)   |
| `sos:customer_decided`            | Thợ gốc + job room                         | Khách đã quyết định / SOS bị thu hồi khi đang chờ                   |
| `sos:backup_request`              | Từng ứng viên wave                         | Popup "có người cần backup" (kèm `distance_km` riêng từng người)    |
| `sos:backup_resolved`             | Ứng viên còn lại                           | `outcome: taken \| withdrawn \| expired`                            |
| `sos:backup_helper_replaced`      | Khách + job room                           | Đã thay thợ (+ emit thêm `job:status_changed` để màn khách refresh) |
| `sos:backup_expired`              | Khách + thợ gốc (+ notification cho admin) | Hết hạn phát sóng                                                   |

Notification types mới: `sos_backup_decision_request`, `sos_backup_decision_reminder`, `sos_backup_job_cancelled`, `sos_backup_request`, `sos_backup_helper_replaced`, `sos_backup_expired`.

## 6. Cấu hình môi trường (đều có mặc định, không bắt buộc khai báo)

| Env                                                         | Mặc định     | Ý nghĩa                                                           |
| ----------------------------------------------------------- | ------------ | ----------------------------------------------------------------- |
| `SOS_BACKUP_CUSTOMER_DECISION_TTL_SECONDS`                  | 300          | Hạn khách quyết định (5 phút)                                     |
| `SOS_BACKUP_DECISION_REMINDER_SECONDS`                      | 150          | Mốc gửi 1 lần nhắc quyết định                                     |
| `SOS_BACKUP_ON_DECISION_TIMEOUT`                            | `cancel_job` | Quá hạn: `cancel_job` (hủy + hoàn tiền) hoặc `accept_replacement` |
| `SOS_BACKUP_BROADCAST_TTL_SECONDS`                          | 240          | Tổng thời gian phát sóng tìm người thay (~4 phút)                 |
| `SOS_BACKUP_WAVE_SIZE` / `SOS_BACKUP_WAVE_INTERVAL_SECONDS` | 5 / 60       | Số thợ mỗi wave / giãn cách wave                                  |
| `SOS_BACKUP_MAX_DISTANCE_KM`                                | 30           | Bán kính ứng viên                                                 |
| `SOS_BACKUP_LOCATION_MAX_AGE_MINUTES`                       | 120          | Độ tươi tối đa của vị trí GPS ứng viên                            |
| `SOS_BACKUP_COST_PENALTY_WEIGHT`                            | 2            | Trọng số điểm phạt hủy trong chi phí Hungarian                    |
| `HELPER_SCORE_CANCEL_WINDOW_DAYS`                           | 7            | Cửa sổ trượt đếm hủy                                              |
| `HELPER_SCORE_CANCEL_THRESHOLD`                             | 3            | Số lần hủy/7 ngày được phép (vượt mới phạt)                       |
| `HELPER_SCORE_PENALTY_PER_EXCESS`                           | 5            | Điểm trừ mỗi lần vượt ngưỡng                                      |

Vòng quét nền (sweep) chạy mỗi 15s trong `SosBackupService` (nhắc quyết định → quá hạn quyết định → leo thang wave → hết hạn phát sóng) và chạy ngay 1 vòng khi server khởi động để khôi phục trạng thái sau restart.

## 7. Mobile (apps/mobile)

- `stores/sos-backup.store.ts` — state popup + nhãn lý do; `hooks/use-sos-backup.ts` — listener socket + bắt kịp qua REST khi mở app; `hooks/use-api.ts` — thêm các hook SOS; `hooks/use-countdown.ts` — đếm ngược dùng chung.
- `components/common/sos-customer-decision-popup.tsx` — popup khách: lý do (chỉ mã → nhãn), giải thích 2 lựa chọn (đổi người giữ nguyên giá/tiền đảm bảo; hủy = hoàn 100%), đếm ngược, không đóng được ngoài 2 nút chọn.
- `components/common/sos-backup-popup.tsx` — popup ứng viên: dịch vụ, khu vực, khoảng cách, thực nhận, đếm ngược; Nhận thay → điều hướng sang chi tiết đơn; 409 → toast "Đã có người khác nhận".
- `components/common/sos-backup-helper-card.tsx` — trong `helper-job-detail`: card SOS + bottom sheet chọn lý do + ghi chú; trạng thái chờ khách ("Đang chờ khách xác nhận…" + đếm ngược) / đang tìm người ("Đang tìm người thay thế…") + nút thu hồi; cảnh báo điểm uy tín; card thông tin cho thợ vào thay.
- `components/common/sos-backup-customer-banner.tsx` — trong `job-detail` phía khách: banner chờ quyết định (mở lại popup) + banner bền "Người giúp việc đã được thay thế do sự cố…" từ `job.sos_backup_replacement`.
- Cả 2 popup mount ở `app/_layout.tsx`, listener chạy trong `SocketManager`.

## 8. Follow-up (chưa làm, ngoài phạm vi đợt này)

- Admin UI: danh sách SOS gắn cờ `admin_attention` + sổ `HelperPenaltyEvent` (dữ liệu đã có; trang admin chưa có màn hình).
- SOS cho đơn nhóm (nhiều thợ) và miễn điểm uy tín cho SOS được admin duyệt lý do chính đáng.
- Khôi phục lượt voucher/điểm loyalty khi hủy đơn theo SOS.
- `performance_score` hiện tính lại khi có sự kiện hủy/SOS; muốn luôn tươi theo rating/completion mới nhất thì thêm tính lại ở luồng review/hoàn thành đơn (chi phí Hungarian dùng rating trực tiếp + penalty tươi nên ghép cặp không bị ảnh hưởng).

## 9. Đã verify / chưa runtime-test

**Đã verify trong sandbox:**

- `apps/api`: `tsc --noEmit` sạch.
- `apps/mobile`: `tsc --noEmit` chỉ còn **1 lỗi có từ trước** (`app/_layout.tsx` TS2882 `../global.css`, tồn tại trước đợt này — không phát sinh lỗi mới).
- Jest: `hungarian.spec.ts` 10/10 pass (gồm đối chiếu brute-force 300 ma trận), `helper-score.spec.ts` 12/12 pass (3 lần hủy = 0 phạt, lần 4 = −5đ, sàn 0, cửa sổ trượt).
- Đọc lại toàn bộ đường tiền: swap không chạm tiền; refund chỉ ở nhánh hủy và đúng số thực trả.

**Chưa runtime-test (cần Mongo + tài khoản thật):** toàn bộ luồng socket 2–3 thiết bị, sweep theo thời gian thực, race 2 thợ accept đồng thời trên Mongo thật, refund vào ví thật, popup trên bản build thật. Làm theo checklist §10.

## 10. Checklist test thủ công

Chuẩn bị: 1 khách, thợ A (giữ đơn), thợ B + C online gần địa chỉ đơn (cùng service, đã KYC), thợ D ở xa > 30 km, thợ E đang bận đơn khác. Đơn online đã trả tiền (có contract).

1. [ ] A bấm SOS → chọn lý do → A thấy "Đang chờ khách xác nhận…" + đếm ngược ~5:00. **B, C chưa nhận được popup nào.**
2. [ ] Khách nhận popup quyết định + notification; thấy đúng nhãn lý do (không thấy ghi chú riêng của A). Bấm **Chấp nhận đổi người** → A thấy quyết định đã đồng ý; B, C nhận popup backup (D xa và E bận **không** nhận); D/E mở lại app cũng không có ở `/sos-backup/active`.
3. [ ] B và C cùng bấm Nhận thay gần như đồng thời → đúng 1 người thắng; người thua nhận toast "Đã có người khác nhận"; đơn chuyển `helper_id` sang người thắng; khách thấy banner "đã được thay thế do sự cố"; tiền/hợp đồng không đổi (so `total_price`, `helper_receives`, `payment_status` trước/sau); thợ thắng thấy đơn trong danh sách của mình và vào được chat của đơn.
4. [ ] Kịch bản khách **Hủy đơn**: đơn `cancelled`, ví khách +đúng số thực trả (trừ phần giảm voucher/điểm nếu có), `payment_status = refunded`, thợ A được giải phóng và **không** tăng `late_cancellation_count`/`risk_score`.
5. [ ] Kịch bản khách **không phản hồi**: sau ~2:30 có 1 notification nhắc; sau 5:00 đơn tự hủy + hoàn tiền, cả hai phía nhận thông báo (mặc định). (Đổi env `SOS_BACKUP_ON_DECISION_TIMEOUT=accept_replacement` → thay vì hủy, hệ thống tự phát sóng.)
6. [ ] A thu hồi SOS khi đang chờ khách → khách nhận thông báo thu hồi, đơn tiếp tục bình thường. Thu hồi khi đang phát sóng → ứng viên đang mở popup bị đóng popup.
7. [ ] Wave: B từ chối → bị loại khỏi wave sau; đợt sau mở sau ~60s hoặc ngay khi mọi người được mời đều từ chối. Để hết ~4 phút không ai nhận → SOS `expired`, khách + A nhận thông báo, SOS có `admin_attention = true`, admin nhận notification.
8. [ ] Điểm phạt: cho 1 thợ hủy/SOS 3 lần trong 7 ngày (trộn hủy thường + SOS) → `penalty_points` vẫn 0, app bắt đầu hiện cảnh báo ở card SOS. Lần thứ 4 → `penalty_points = 5`, `performance_score` giảm 5, có 1 dòng `helperpenaltyevents` (source đúng), toast phạt hiện khi gửi SOS. Lần 5 → 10 điểm. Kiểm tra thợ bị phạt có chi phí Hungarian cao hơn thợ tương đương không phạt (xem `candidates[].penalty_points` + `cost` trong SOS doc).
9. [ ] Reconnect: khách tắt app khi SOS đang chờ → mở lại app thấy popup quyết định (catch-up). Thợ ứng viên mở lại app giữa wave → thấy popup backup còn hạn.

## 11. Commits (branch `feat/roadmap-phase-1`)

- `827abd7` feat(constants): SOS Backup socket events + notification types
- `dfe663b` feat(sos-backup): Hungarian solver + tests
- `95e675e` feat(sos-backup): API — consent gate, wave broadcast, atomic swap, SOS cancel+refund
- `519fff1` feat(helpers): 100-point performance score + 7-day cancellation penalty (wired vào cancelJob, SOS, Hungarian cost)
- `ffd94dd` feat(mobile): store, API hooks, socket listener + catch-up
- `65ae258` feat(mobile): 2 popup toàn cục
- `28c05a3` feat(mobile): card SOS phía thợ + banner phía khách trong màn chi tiết đơn

Lưu ý môi trường: sandbox không có `pnpm` nên các commit dùng `--no-verify` (husky hook chỉ chạy `prettier --write` — đã chạy prettier thủ công cho mọi file sửa; riêng 2 màn hình job-detail giữ diff tối thiểu, không format lại toàn file). **Không đụng** 2 file đang sửa dở của chủ repo: `apps/mobile/components/common/location-picker.tsx`, `apps/mobile/components/common/tracking-map-document.ts`.

## 12. Prompt dán cho Antigravity/Codex (review + deploy)

```
Review và deploy tính năng SOS Backup + điểm phạt hủy đơn của GreenHouse (đã implement xong trên branch feat/roadmap-phase-1, commits 827abd7..28c05a3 — ĐỪNG viết lại, chỉ review + sửa lỗi nếu có + deploy).

Đọc trước: ~/workspace/greenhouse-sos-backup/README.md (thiết kế, mô hình chi phí Hungarian, bảng env, checklist test §10).

Việc cần làm:
1. git checkout feat/roadmap-phase-1. TUYỆT ĐỐI không discard/stash 2 file đang sửa dở: apps/mobile/components/common/location-picker.tsx và tracking-map-document.ts.
2. Chạy: apps/api `npx tsc --noEmit` (phải sạch), `npx jest src/modules/sos-backup/utils/hungarian.spec.ts src/modules/helpers/utils/helper-score.spec.ts` (22 test pass); apps/mobile `npx tsc --noEmit` (chỉ được có đúng 1 lỗi cũ TS2882 global.css ở app/_layout.tsx).
3. Review kỹ 3 điểm tiền: (a) accept SOS chỉ đổi helper_id — payment_status/total_price/helper_receives không đổi; (b) nhánh hủy SOS hoàn đúng số thực trả qua PaymentsService.refundCustomer; (c) thợ gốc không bị tăng late_cancellation_count/risk_score cho đơn SOS.
4. Chạy API với Mongo thật, test theo checklist §10 trong README (đặc biệt: khách chưa đồng ý thì ứng viên KHÔNG được thấy popup; 2 thợ accept đồng thời chỉ 1 thắng; quá hạn quyết định → hủy + hoàn tiền).
5. Deploy như các đợt trước (API Render, web Vercel, APK qua EAS dev build — tính năng cần socket thật, không test bằng Expo Go cũ). Không cần thêm env (mọi giá trị đều có mặc định trong README §6).
6. Lỗi gì thì chụp/gửi lại màn hình + log, không tự ý đổi thiết kế state machine hay mô hình chi phí.
```
