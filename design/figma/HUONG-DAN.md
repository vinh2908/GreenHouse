# Làm file Figma Green House bài bản

Mục tiêu: một file Figma có nền tảng (màu, chữ), thư viện thành phần tách nhỏ, màn hình theo
từng phân hệ, và luồng sự kiện nối được thành prototype.

## Cấu trúc file (mỗi dòng là một Page trong Figma)

| Page | Nội dung | Nguồn để nhập |
|---|---|---|
| 00 Bìa | Tên dự án, phiên bản, ghi chú | tự tạo |
| 01 Nền tảng | Màu, chữ, bo góc, khoảng cách, logo | `http://localhost:5599/01-nen-tang.html` |
| 02 Thành phần | Nguyên tử → phân tử → tổ chức | `http://localhost:5599/02-thanh-phan.html` |
| 03 Luồng sự kiện | 6 luồng theo vai trò, kèm trạng thái hệ thống | `http://localhost:5599/03-luong.html` |
| 04 Luồng xác thực | 7 khung thật: đăng ký → OTP → chọn vai trò → đăng nhập → trang chính | `http://localhost:5599/04-luong-xac-thuc.html` |
| 05 Luồng khách hàng | 12 khung thật theo thứ tự sử dụng | `http://localhost:5599/05-luong-khach-hang.html` |
| 06 Luồng thợ | 7 khung thật | `http://localhost:5599/06-luong-tho.html` |
| 10 Mobile – Xác thực | Chào, đăng nhập, đăng ký, OTP, chọn vai trò | app thật `localhost:8081` |
| 11 Mobile – Khách: Đặt việc | Trang chủ, 5 bước đặt việc, đơn hàng, chi tiết + báo giá | app thật |
| 12 Mobile – Khách: SOS | SOS, theo dõi SOS | app thật |
| 13 Mobile – Khách: Tài khoản | Tài khoản, sửa hồ sơ, chọn địa chỉ, thông báo, trợ giúp | app thật |
| 20 Mobile – Thợ: Nhận việc | Tổng quan, nhận việc, chi tiết đơn, gửi báo giá | app thật |
| 21 Mobile – Thợ: Hồ sơ & KYC | e-KYC (4 trạng thái), sửa hồ sơ, vị trí hoạt động | app thật |
| 22 Mobile – Thợ: Thu nhập | Thu nhập, tài khoản ngân hàng | app thật |
| 30 Admin | 13 trang quản trị | `localhost:3001` |

`localhost:5599` là máy chủ tạm chỉ chạy trong phiên làm việc với Claude. Khi nó tắt, mở thẳng
các file `.html` trong thư mục này (cần bật "Allow access to file URLs" cho extension), hoặc
chạy lại `node design/figma/build.js` để tạo lại 3 trang 01–03.

## Thứ tự làm

1. **Nhập 01 Nền tảng** → chọn từng ô màu, tạo Color Style (hoặc Variable) đặt tên đúng như
   trên trang: `Primary`, `Gray/500`… Làm tương tự với các dòng chữ để có Text Style.
2. **Nhập 02 Thành phần** → với mỗi ô, chọn phần hình (không lấy nhãn tím và ghi chú), bấm
   `Ctrl+Alt+K` để thành Component, đặt tên theo nhãn tím (`Button / Primary`). Các biến thể
   nằm cạnh nhau trong cùng một ô thì chọn hết → **Combine as variants**.
3. **Nhập 03 Luồng sự kiện** → để nguyên làm bản đồ. Mỗi ô là một bước, nhãn đen là trạng thái
   lưu trong hệ thống.
4. **Chụp màn hình thật** theo danh sách bên dưới vào các page 10–30, đặt tên frame
   `Phân hệ / Màn hình / Trạng thái`, ví dụ `Khách / Chi tiết đơn / Có báo giá`.
5. **Thay phần lặp lại bằng Component**: trên mỗi màn hình, thay nút, ô nhập, thanh tab… bằng
   instance từ page 02 để sửa một chỗ là đổi toàn bộ.
6. **Nối prototype** theo page 03: chọn nút trên màn hình → tab Prototype → kéo dây sang màn
   hình kế tiếp. Mỗi luồng ở page 03 tạo một Flow riêng (Flow starting point).

## Nối prototype cho trang 04–06

Dòng chữ tím dưới mỗi khung ghi nút nào dẫn tới khung nào.

1. Sau khi nhập, kéo từng khung điện thoại ra ngoài để nó thành frame cấp cao nhất, đặt tên theo nhãn (`K01 · Trang chủ`…).
2. Tab **Prototype** → chọn nút trên khung nguồn → kéo chấm tròn sang khung đích → **On tap → Navigate to**.
3. Chọn khung `01 · Đăng ký – trống` → **Flow starting point** → đặt tên "Green House".
4. Nối khung `06 · Đăng nhập – đã nhập` sang `K01` (luồng khách) hoặc `T01` (luồng thợ).
5. Bấm ▶ để chạy.

Trang 04–06 lấy ảnh từ `localhost:8081`, nên Metro phải đang chạy lúc chụp. Các khung này chứa tên, số điện thoại và tin nhắn từ dữ liệu thử trong máy bạn.

## Danh sách màn hình cần chụp

### Chuẩn bị (làm một lần)

1. Chạy dự án: `node scripts/devctl.mjs start` (API cổng 3000, admin 3001, mobile 8081).
2. Cài extension Chrome **html.to.design** và plugin **html.to.design** trong Figma.
3. Mobile: mở `http://localhost:8081` bằng Chrome, bấm `Ctrl+Shift+M` (thanh thiết bị của
   DevTools) và đặt kích thước **375 × 812** trước khi chụp.
4. Admin: mở `http://localhost:3001` ở cửa sổ rộng **1440 px**.

### Mỗi màn hình

1. Mở màn hình cần chụp (theo danh sách dưới).
2. Bấm biểu tượng html.to.design trên Chrome → chụp trang hiện tại.
3. Trong Figma: chạy plugin html.to.design → nhập bản vừa chụp → đổi tên frame theo danh sách.

Gợi ý sắp xếp trong Figma: một Page cho "Mobile – Khách", một cho "Mobile – Thợ", một cho
"Admin"; đặt các frame theo đúng thứ tự luồng.

### Mobile – chưa đăng nhập

| Màn hình | Đường dẫn |
|---|---|
| Đăng nhập | `/login` |
| Đăng ký | `/register` |
| Nhập OTP | `/otp` (vào từ Đăng ký) |
| Chọn vai trò | `/select-role` |

### Mobile – Khách hàng (đăng nhập tài khoản khách)

| Màn hình | Đường dẫn |
|---|---|
| Trang chủ | `/home` |
| Đăng yêu cầu dịch vụ (5 bước — chụp từng bước) | `/booking` |
| Quản lý đơn hàng | `/jobs` |
| Chi tiết đơn + danh sách báo giá | bấm một đơn trong `/jobs` |
| Tin nhắn | `/messages` |
| Khung chat | bấm một cuộc trò chuyện |
| Tài khoản | `/profile` |
| Sửa hồ sơ (khách) | `/edit-profile` |
| Chọn địa chỉ trên bản đồ | bấm ô bản đồ trong Sửa hồ sơ |
| Thông báo | `/notifications` |
| Cứu hộ SOS | `/sos` |
| Theo dõi SOS | sau khi gửi một yêu cầu SOS |
| Hồ sơ thợ (khách xem) | bấm tên thợ trong danh sách báo giá |
| Trung tâm trợ giúp | `/help-center` |
| Bảo mật & Bảo hiểm | `/policy-insurance` |

### Mobile – Thợ (đăng xuất, đăng nhập tài khoản thợ)

| Màn hình | Đường dẫn |
|---|---|
| Tổng quan | `/dashboard` |
| Nhận việc | tab "Nhận việc" |
| Chi tiết đơn (thợ) + gửi báo giá | bấm một đơn |
| Thu nhập | `/earnings` |
| Tài khoản thợ | tab "Tài khoản" |
| Sửa hồ sơ (thợ) + vị trí hoạt động | `/edit-profile` |
| e-KYC (form nộp) | `/kyc` — dùng tài khoản thợ chưa xác thực để thấy form |
| e-KYC (đã duyệt / chờ duyệt) | `/kyc` |
| Tài khoản ngân hàng | `/bank-account` |

### Admin (`http://localhost:3001`)

| Màn hình | Đường dẫn |
|---|---|
| Đăng nhập | `/login` |
| Tổng quan Dashboard | `/` |
| Quản lý Người dùng | `/users` |
| Chi tiết người dùng | bấm một người dùng |
| Đối tác Thợ & Giúp việc | `/helpers` |
| Duyệt e-KYC Thợ | `/helpers/kyc` |
| Quản lý Đơn hàng | `/jobs` |
| Chi tiết đơn hàng | bấm một đơn |
| Dịch vụ & Phí | `/services` |
| Thanh toán & Rút tiền | `/payments` |
| Đánh giá & Phản hồi | `/reviews` |
| Thống kê & Báo cáo | `/analytics` |
| Gửi thông báo | `/notifications` |

## Lưu ý

- Bản web khác app thật ở vài chỗ: bản đồ (WebView) và camera/GPS có thể không hiện đúng
  trong trình duyệt. Với các màn hình đó, chụp ảnh từ emulator làm tham chiếu.
- Màn hình có trạng thái (trống / có dữ liệu / lỗi, 5 bước đặt việc, KYC chờ duyệt – đã
  duyệt – bị từ chối) nên chụp mỗi trạng thái một frame.
- `index.html` là 9 màn hình vẽ tay lúc đầu; bản chụp từ app thật chính xác hơn.
- Màu chip trạng thái đơn ở page 02 là đề xuất, cần đối chiếu với app trước khi chốt.
