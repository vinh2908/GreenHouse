# Sửa bản đồ theo dõi người giúp việc

Ngày báo cáo: 21/10/2026. Source: `D:\GREENHOUSE`.

## Nguyên nhân đã xác định

1. Màn hình khách, thợ và component bản đồ tự tạo tọa độ thợ khi chưa có GPS. Tọa độ được cộng/trừ từ điểm hẹn, nên không phải vị trí người giúp việc.
2. HTML của iframe/WebView chứa tọa độ và được tạo lại khi dữ liệu thay đổi. Cập nhật GPS có thể tải lại bản đồ; mỗi lần lấy tuyến đường lại tự đổi vùng nhìn.
3. Hook nhận GPS chưa lọc theo mã đơn, chưa kiểm tra thời điểm ghi nhận và dùng kiểm tra truthy khiến tọa độ bằng 0 bị loại.
4. GPS chỉ được gửi khi màn hình chi tiết của thợ đang mở; lấy vị trí từng lần có thể dùng kết quả cache. Socket chưa lưu mẫu GPS để trả lại khi khách mở muộn hoặc kết nối lại.
5. Khôi phục đăng nhập đặt ở màn hình khởi động. Mở trực tiếp chi tiết đơn có thể không khởi tạo phiên socket.
6. Đổi chữ trong địa chỉ vẫn giữ ghim cũ. Khi thiếu ghim, code tự dùng tọa độ mặc định ở TP.HCM.
7. Màn hình SOS gọi `useSafeAreaInsets` sau nhánh return khi tải dữ liệu, vi phạm thứ tự gọi hook.
8. Thanh trạng thái lặp biểu tượng/tên thợ, bị cắt một dòng; ETA có giá trị cố định.

## Đã sửa

- Bỏ toàn bộ vị trí thợ giả và tọa độ điểm hẹn mặc định trong luồng này.
- Lưu GPS mới nhất theo đơn ở API; chỉ thợ được phân công và đang di chuyển mới được gửi. Kiểm tra miền tọa độ, độ chính xác và thời gian; cập nhật nguyên tử để loại gói cũ/đến sai thứ tự.
- Nhận lại mẫu GPS khi vào phòng socket/kết nối lại. Client lọc đúng đơn, đúng thợ, loại gói trùng/cũ. Nhiều hook dùng chung phòng socket không làm mất đăng ký của nhau.
- Dùng GPS chính xác cao, theo dõi ở cấp ứng dụng khi có đơn đang di chuyển. Đổi tab/mở màn hình khác trong ứng dụng không dừng theo dõi.
- Không xếp hàng GPS khi mất mạng để tránh phát lại hành trình cũ.
- Giữ HTML/source bản đồ cố định; cập nhật qua postMessage/injectJavaScript. Giữ vùng nhìn, mức zoom và lớp bản đồ khi nhận GPS.
- Nội suy xe máy theo các đoạn tuyến đường giữa hai mẫu GPS, radar xanh. Không tự chạy xe khi không nhận GPS mới; không ép vị trí lên đường nếu điểm ghép cách GPS quá xa.
- Tính khoảng cách còn lại và ETA từ tuyến đường, cập nhật theo GPS; giới hạn tần suất yêu cầu tuyến và bỏ kết quả cũ. Khi dịch vụ tuyến lỗi, vẫn giữ GPS thật nhưng không bịa ETA.
- GPS quá 30 giây: báo chưa cập nhật, dừng radar/animation, ẩn ETA. Quá 120 giây: bỏ marker cũ và chờ GPS mới.
- Khôi phục phiên ở root layout; sửa thứ tự hook của SOS.
- Khi sửa địa chỉ, yêu cầu xác nhận ghim mới bằng bản đồ hoặc GPS; backend từ chối tọa độ thiếu/sai.
- Thanh trạng thái không cắt một dòng, dùng đúng:
  - Thợ: **Đang di chuyển đến nhà khách hàng**
  - Khách: **Người giúp việc đang di chuyển đến bạn**

## Bằng chứng kiểm thử

| Nhóm                             | Kết quả / phạm vi                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jest API                         | 17 ca: Socket.IO thật, MongoDB thử riêng; đúng người/đơn, gói cũ, tọa độ sai, mở muộn, kết nối lại, kết thúc di chuyển; thêm kiểm tra cập nhật điểm hẹn                                     |
| Dữ liệu, client socket, renderer | 36 kiểm tra: lọc GPS, phòng socket, không phát lại GPS offline, nội suy qua khúc cua, ETA/khoảng cách, giữ zoom, GPS cũ, lỗi tuyến; Chromium kích thước Android và mô phỏng cầu nối WebView |
| Giao diện React xuất từ ứng dụng | 6 kiểm tra đạt: khách/thợ/SOS, cập nhật không reload, mở lại đơn, tiếp tục GPS sau khi đổi tab; GPS trình duyệt và Socket.IO thật; REST, tuyến đường và nền bản đồ dùng dữ liệu thử         |
| TypeScript                       | Mobile và API đều đạt (`tsc --noEmit`)                                                                                                                                                      |
| Android                          | Xuất bundle bằng Expo; đây không phải APK đã cài/chạy trên thiết bị                                                                                                                         |

Log tại `reports/qa-map-socket-tests.log`, `qa-map-renderer-tests.log`,
`qa-map-ui-tests.log`, `qa-map-mobile-types.log`, `qa-map-api-types.log`,
`qa-map-android-export.log`, `qa-map-web-export.log`.

Ảnh giao diện thử: `reports/qa-map-customer.png`, `reports/qa-map-helper.png`.
Nền bản đồ trong ảnh thử được chặn có chủ đích để kiểm thử không phụ thuộc tải tile.

## Giới hạn và triển khai

- Đã sửa source; **chưa triển khai API/Vercel, chưa phát hành APK**. Website/bản APK đang cài chưa tự nhận các sửa đổi này.
- Cần triển khai API và mobile cùng đợt: bản tin GPS mới có `recorded_at`; client cũ không có trường này sẽ bị API mới từ chối.
- Chưa xác nhận trên điện thoại Android thật, quyền vị trí chính xác, tiết kiệm pin, mất mạng ngoài đường hoặc GPS trong nhà.
- Hiện theo dõi **foreground**. Khi khóa màn hình/chuyển sang Google Maps, hệ điều hành hoặc trình duyệt có thể dừng GPS. Giao diện đã nói rõ và xử lý GPS cũ. Muốn theo dõi nền trên APK cần bổ sung native background task/foreground service, xin quyền phù hợp và kiểm thử thiết bị riêng.
- ETA là ước tính theo tuyến OSRM, **không phải thời gian có dữ liệu giao thông trực tiếp**. Dịch vụ định tuyến/nền bản đồ công khai chưa có cam kết độ sẵn sàng cho ứng dụng này.
- Đây là báo cáo cho luồng bản đồ/GPS và sửa địa chỉ liên quan, không phải xác nhận toàn bộ chức năng khách/thợ/admin đã qua kiểm thử.

Tài liệu đối chiếu: [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/),
[Leaflet](https://leafletjs.com/reference.html),
[OSRM API](https://project-osrm.org/docs/v5.24.0/api/).

## Chạy lại

Từ thư mục gốc:

```powershell
node scripts/test-live-tracking.cjs
node scripts/test-live-tracking-ui.cjs
pnpm --filter @homemate/mobile exec tsc --noEmit
pnpm --filter @homemate/api exec tsc --noEmit
$env:MONGOMS_SYSTEM_BINARY='D:\GREENHOUSE\reports\qa-2026-10-20\tools\mongod.exe'
pnpm --filter @homemate/api exec jest --config test/jest-e2e.json --runInBand live-tracking
```

Kiểm thử UI cần bản web xuất riêng ở `apps/mobile/dist-qa/map-web`, socket URL
`http://127.0.0.1:3199`, API URL `http://127.0.0.1:3199/api/v1`. Script khởi động
server thử trên localhost và đóng lại khi kết thúc. Nếu Metro cache giữ API URL cũ,
script chỉ trả dữ liệu fixture cho request đó, không gửi tài khoản thử tới production.
