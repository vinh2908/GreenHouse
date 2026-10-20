# Kịch bản kiểm thử lại Green House — 20/10/2026

## Phạm vi và bằng chứng

Kiểm kê source riêng khách, thợ, admin và màn hình dùng chung bằng `node scripts/qa-inventory.cjs`. Mỗi dòng là vị trí source, không tự coi là một ca UI đã pass. Một nút sinh từ danh sách có thể đại diện nhiều hành động thực tế. Trạng thái NOT_RUN chỉ đổi khi có bằng chứng tương ứng; báo cáo runtime tách khỏi kiểm kê source.

Không thay đổi production. Test API dùng MongoDB tạm riêng; test trình duyệt dùng API local. Không gọi hotline, không gửi email/SMS/push thật, không thanh toán thật.

## Ma trận thực thi

| Nhóm | Kịch bản | Kết quả cần đạt |
|---|---|---|
| AUTH | đăng ký, đăng nhập đúng/sai, OTP, refresh, đổi role, logout, đăng nhập tài khoản B | quyền đúng, phiên và dữ liệu không lẫn |
| CUSTOMER | dịch vụ, địa chỉ, tạo đơn, danh sách, chi tiết, báo giá, chọn thợ, hủy, nghiệm thu, góp ý | dữ liệu lưu thật, nút có phản hồi và xử lý lỗi |
| HELPER | KYC, online/offline, feed, báo giá, di chuyển/đến/bắt đầu/hoàn thành, thu nhập, đánh giá | chỉ thợ hợp lệ thao tác, trạng thái nhất quán |
| ADMIN | login, dashboard, users, KYC, services, jobs, reviews, payments, notifications, analytics, feedback, logout | từng trang hoạt động, API từ chối non-admin |
| REALTIME | personal room, job room, chat room, báo giá, notification, chat, reconnect | đúng người nhận, không rò dữ liệu, popup có điều hướng |
| CONCURRENCY | gửi lặp, chọn hai báo giá, hủy và nhận đồng thời, cộng ví lặp | tối đa một kết quả hợp lệ, không nhân đôi tiền/hợp đồng |
| NEGATIVE | hết hạn, malformed ID, dữ liệu thiếu, tài khoản bị khóa, request trái quyền | trả 4xx có thông báo, không phát sinh bản ghi sai |
| UI | mọi route, mọi handler từ inventory, validation, loading, cancel/back, lỗi mạng | có bằng chứng thực thi riêng cho từng luồng đã chạy |
| APK | export Android, EAS/Gradle, cài APK, quyền GPS/camera/notification, background | chỉ PASS khi thực sự build/cài/chạy được |

## Quy trình mỗi lỗi

Tái hiện → assertion thể hiện lỗi → sửa → chạy regression → kiểm tra phạm vi liên quan. Lưu log trong thư mục này. Không dùng test pass để thay cho kiểm tra thiết bị thật. Các tích hợp cần tài khoản ngoài hoặc thiết bị được đánh dấu BLOCKED và nêu điều kiện cụ thể.
