# GreenHouse — Hướng dẫn chạy local cho cả nhóm

> Đặt file này ở root repo với tên `README-SETUP.md`. Đừng ghi đè lên `README.md` hiện tại — file đó đang là tài liệu tính năng SOS Backup.

## 0. Cách dùng file này (đọc trước khi làm)

- **Người làm theo**: đọc từ trên xuống dưới, làm đúng thứ tự từ Bước 1 tới Bước 7 rồi tới mục 10 (bản native Android, bắt buộc), không bỏ bước, không đổi thứ tự.
- **AI làm theo**: thực thi đúng từng lệnh trong file, sau mỗi bước phải kiểm tra mục "Kiểm tra" của bước đó. Nếu kiểm tra không đạt thì dừng lại, báo đúng log lỗi, không tự sửa code nguồn để lách lỗi môi trường.
- **Nguyên tắc vàng: chạy được mà không sửa code**. Toàn bộ cấu hình chỉ nằm trong file `.env` (tạo mới, không commit). Không sửa `app.json`, `package.json`, thư mục `android/`, hay bất kỳ file code nào chỉ để chạy được local. Danh sách "tuyệt đối không làm" ở mục 12.
- Tất cả lệnh dưới đây chạy ở thư mục root repo (`GreenHouse/`), trừ khi ghi rõ thư mục khác.

## 1. Kết quả cuối cùng phải đạt được

Sau khi làm xong Bước 1–7 và mục 10 (bản native Android, bắt buộc), phải mở được cả 4 thứ sau, thiếu 1 cái là chưa xong:

| #   | Cái gì             | Mở ở đâu                                                       | Thấy gì là đạt                                                    |
| --- | ------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | API                | http://localhost:3000/api/v1/health                            | Trả về JSON có `"status":"ok"`                                    |
| 2   | Admin              | http://localhost:3001                                          | Trang đăng nhập Admin                                             |
| 3   | App / Web          | http://localhost:8081 (bấm `w` trong terminal Metro để mở web) | Trang chủ app load được, không trắng trang                        |
| 4   | App native Android | Máy ảo Android Studio hoặc điện thoại Android (mục 10)         | App cài được lên máy, mở được, đăng nhập được (không chỉ xem web) |

Ngoài ra còn có Swagger để xem API: http://localhost:3000/api/docs .

## 1A. Bối cảnh dự án — đọc trước khi sửa code (dành cho người mới và AI)

Phần này giúp người mới và AI hiểu GreenHouse là gì trước khi chạm vào code. Đọc xong phần này thì mới sang mục 2 làm theo các bước chạy.

### GreenHouse là gì

GreenHouse (tên repo là `homemate`) là sàn dịch vụ gia đình: khách hàng đăng việc cần thuê người làm (dọn nhà, sửa điện nước, vệ sinh...), người giúp việc (thợ) báo giá cạnh tranh, khách chọn 1 báo giá, thợ đến làm, khách nghiệm thu rồi tiền mới chảy về thợ. Đây là đồ án tốt nghiệp, nên yêu cầu là app thật, chạy được thật — không dùng dữ liệu mẫu/giả trong giao diện, chỗ nào chưa có dữ liệu thật thì hiện trạng thái trống/đang tải/lỗi rõ ràng, không bịa dữ liệu.

### 3 vai trò, 3 mặt giao diện

| Vai trò                  | Dùng mặt nào                 | Làm gì chính                                                                                      |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Khách hàng (customer)    | App mobile + bản web của app | Đăng việc, xem báo giá, chọn thợ, chat, theo dõi thợ trên bản đồ, nghiệm thu, đánh giá, khiếu nại |
| Người giúp việc (helper) | App mobile + bản web của app | Nhận việc, báo giá, quản lý lịch, ví thu nhập, e-KYC (xác minh danh tính), SOS khi không làm được |
| Quản trị viên (admin)    | Admin Next.js riêng          | Duyệt thợ/KYC, quản lý đơn, thanh toán, voucher, khiếu nại/tranh chấp, thống kê                   |

Một tài khoản có thể mang nhiều vai trò, vai trò đang dùng là `active_role`. Tài khoản test và cách đăng nhập xem mục 11.

### Luồng chính của 1 đơn hàng (hiểu luồng này là hiểu nửa dự án)

```text
Khách đăng việc (wizard 5 bước: dịch vụ → địa chỉ → lịch hẹn → mô tả → xem lại)
→ Đơn ở trạng thái open / receiving_quotes
→ Thợ ở gần báo giá (tối thiểu 50.000₫)
→ Khách chọn 1 báo giá (quote_selected)
→ Khách thanh toán ở bước chốt đơn — tiền được GIỮ ĐẢM BẢO (escrow), chưa chảy về thợ ngay
→ Thợ xác nhận (confirmed) → di chuyển (helper_on_the_way) → đã đến (helper_arrived) → đang làm (in_progress)
→ Thợ upload ảnh hoàn thành → chờ khách nghiệm thu (pending_review)
→ Khách nghiệm thu → completed → tiền giải ngân cho thợ
```

Danh sách trạng thái đầy đủ nằm ở `packages/types/src/booking.types.ts` (`JobStatus` + `JOB_STATUS_TRANSITIONS` — trạng thái nào được chuyển sang trạng thái nào). Đừng tự đặt trạng thái mới, đừng tự đặt nhãn hiển thị mới — nhãn tiếng Việt của từng trạng thái đã có mapping dùng chung trong app, sửa nhãn ở một chỗ mà lệch chỗ khác là lỗi.

### Tiền — phần nhạy cảm nhất, đừng tự ý đổi

- Thanh toán thu ở bước chốt báo giá, tiền giữ đảm bảo, giải ngân sau nghiệm thu. Thợ có ví ký quỹ riêng.
- Voucher và điểm loyalty giảm trực tiếp vào số tiền khách thực trả; khi hủy đơn, hoàn tiền và khôi phục voucher/điểm phải đúng 1 lần (có cờ chống hoàn trùng), không được hoàn thừa/thiếu.
- Tranh chấp (dispute): khách/thợ khiếu nại → admin ra phán quyết → hoàn toàn phần / hoàn một phần / giữ nguyên cho thợ. Logic tiền, voucher, escrow là quyết định của owner — **AI và người mới không tự đổi công thức tiền, tỉ lệ phí, hay quy tắc hoàn tiền khi chưa được owner đồng ý.**

### Các tính năng lớn khác (đọc tên là biết nằm ở module nào)

- **Tìm thợ gần**: API `GET /helpers/nearby` — chỉ thợ đang online, tìm theo vị trí GPS, bán kính.
- **Chat realtime**: Socket.io, chat theo từng đơn, 2 chiều khách ↔ thợ.
- **Theo dõi trực tiếp**: vị trí thợ/khách trên bản đồ theo thời gian thực (socket + tọa độ GPS, route vẽ bằng OSRM).
- **Gọi thoại**: qua Stringee, che số thật của 2 bên. Gọi chỉ là tính năng phụ — thiếu key Stringee thì nút gọi tự ẩn, app vẫn chạy.
- **SOS khách hàng**: khách gặp khẩn cấp bấm SOS (khác với SOS Backup bên dưới).
- **SOS Backup (thợ không làm được đơn)**: chỉ cho đơn 1 thợ. Thợ bấm SOS → khách phải đồng ý mới được đổi người (không tự ý thay người); khách đồng ý thì hệ thống ghép lại bằng thuật toán Hungarian, thợ mới nhận thay theo nguyên tắc ai nhận trước thì thắng; khách chọn hủy thì hoàn 100% số tiền thực trả. Hết hạn khách không trả lời thì mặc định hủy + hoàn tiền. SOS cho đơn nhóm đã bị de-scope (không làm) — đừng tự làm thêm.
- **Đánh giá, bảo hành, bảo hiểm**: khách đánh giá sau đơn, khiếu nại sự cố kèm ảnh, admin xử lý claim bảo hành/bảo hiểm.
- **Lặp lại / hợp đồng tháng**: đặt lịch lặp lại, hợp đồng tháng với thợ cố định.
- **AI**: gợi ý giá khi đăng việc, và phân tích ảnh sự cố (`POST /ai/analyze-photo`). AI là tính năng hỗ trợ, không thay quyết định của người dùng.
- **Thông báo**: mọi thông báo bấm vào phải mở đúng màn hình nó thông báo (deep-link), không được mở trang chủ chung chung.

### Kiến trúc và cấu trúc repo (đọc để biết sửa ở đâu)

```text
GreenHouse/
├── apps/api/              # Backend NestJS + Mongoose (MongoDB), Socket.io
│   └── src/modules/       # Mỗi tính năng 1 module: auth, jobs, payments,
│                          # helpers, customers, chat, calls, sos-backup,
│                          # vouchers, loyalty, recurring, monthly-contracts,
│                          # reviews, claims, notifications, admin, ai, ...
├── apps/mobile/           # App Expo (React Native + Expo Router)
│   ├── app/(customer)/    # Màn hình phía khách
│   ├── app/(helper)/      # Màn hình phía thợ
│   ├── services/          # api-client, socket, goong-geocoding, ...
│   └── android/           # Code native Android đã prebuild (đừng prebuild lại)
├── apps/admin/            # Admin Next.js
│   └── app/(dashboard)/   # analytics, jobs, users, helpers, payments,
│                          # vouchers, claims, reviews, sos, support, ...
└── packages/              # Code dùng chung, KHÔNG được copy-paste lung tung:
    ├── types/             # Type + enum dùng chung (JobStatus, UserRole, ...)
    ├── constants/         # Hằng số, event socket, mapping dùng chung
    └── utils/             # Hàm dùng chung
```

### Quy ước quan trọng:

- **Single source of truth là `packages/`**: type, enum, hằng số, event socket đã có ở đó thì dùng lại, đừng định nghĩa lại ở từng app rồi để 2 nơi lệch nhau.
- **API**: base URL `http://localhost:3000/api/v1` (local) — mọi request đều qua `api-client` của từng app, đừng gọi axios trực tiếp với URL ghi cứng. Auth bằng JWT (access 15 phút, refresh 7 ngày).
- **Dữ liệu**: MongoDB (đơn, user, thợ... và MongoDB GridFS để lưu trữ bền vững ảnh avatar, CCCD, ảnh đơn hàng), Redis (cache/queue). Không dùng MinIO.
- **Bản đồ**: tìm địa chỉ/geocoding dùng Goong (dữ liệu Việt Nam, có số nhà); hiển thị bản đồ dùng Leaflet/OSM, route dùng OSRM. Nếu còn dùng dữ liệu/tile OSM thì phải giữ dòng ghi nguồn OSM (yêu cầu giấy phép) — đừng xóa nó chỉ vì "cho đẹp".
- **Ngôn ngữ và đơn vị**: giao diện tiếng Việt, tiền VND, múi giờ `Asia/Ho_Chi_Minh`, địa chỉ Việt Nam. Code và comment có thể viết tiếng Việt kèm thuật ngữ tiếng Anh chuyên ngành.
- **OTP thật chưa bật**: hệ thống hiện chỉ sinh và lưu OTP, chưa gửi OTP thật — đây là quyết định của owner, đừng tự bật gửi OTP thật.
- **Deploy (chỉ để biết, chạy local không cần)**: API chạy trên Render, web khách và admin chạy trên Vercel, nhánh deploy là `main`, nhánh làm việc mặc định khi clone là `master`. Chạy local thì không cần tài khoản Render/Vercel.

### Khi nhận 1 task mới thì bắt đầu từ đâu

1. Đọc task, xác định nó thuộc vai trò nào (khách / thợ / admin) và luồng nào trong mục "Luồng chính" ở trên.
2. Tìm module tương ứng trong `apps/api/src/modules/` (backend) và màn hình tương ứng trong `apps/mobile/app/` hoặc `apps/admin/app/`.
3. Kiểm tra type/enum đã có trong `packages/types` và `packages/constants` trước khi tạo mới.
4. Sửa xong thì chạy đủ checklist ở mục 1 (API + Admin + Web) trước khi báo xong — sửa backend mà không kiểm tra app, hoặc sửa app mà không kiểm tra web, đều chưa tính là xong.

## 2. Yêu cầu trước khi bắt đầu — kiểm tra đủ rồi mới sang Bước 1

| Công cụ        | Phiên bản yêu cầu                                    | Lệnh kiểm tra                                  | Kết quả phải thấy                                       |
| -------------- | ---------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| Git            | Bất kỳ bản mới nào                                   | `git --version`                                | In ra version, không báo lỗi                            |
| Node.js        | >= 20                                                | `node -v`                                      | v20.x trở lên                                           |
| pnpm           | 10.29.3 (đúng version trong packageManager của repo) | `pnpm -v`                                      | 10.29.3                                                 |
| Docker Desktop | Bản mới nhất, đang chạy                              | `docker --version` và `docker compose version` | In ra version, Docker Desktop đang ở trạng thái Running |
| Trình duyệt    | Chrome / Edge mới nhất                               | —                                              | —                                                       |

Cài pnpm nếu chưa có (chỉ làm 1 lần):

```bash
corepack enable
corepack prepare pnpm@10.29.3 --activate
pnpm -v
```

> **Không dùng npm hay yarn để cài dependencies** — repo dùng pnpm workspace, dùng npm/yarn sẽ lệch lockfile và sinh lỗi khó đoán.

## 3. Bước 1 — Clone code

```bash
git clone https://github.com/vinh2908/GreenHouse.git
cd GreenHouse
git pull
git branch --show-current
```

**Kiểm tra:** lệnh cuối phải in ra `master` (nhánh mặc định của repo). Nếu không thấy `master` thì dừng lại và hỏi owner, đừng tự checkout nhánh khác.

## 4. Bước 2 — Cài dependencies

```bash
pnpm install
```

**Kiểm tra:** lệnh chạy xong không báo lỗi đỏ (error). Cảnh báo vàng (warning) thì bỏ qua được. Không được xóa `pnpm-lock.yaml` để "sửa" lỗi cài.

## 5. Bước 3 — Tạo file .env (bắt buộc, nhưng không commit)

### 5.1. File .env ở root (cho API + Docker)

```bash
cp .env.example .env
```

Mở file `.env` vừa tạo, giữ nguyên mọi giá trị mặc định, chỉ thay 2 dòng JWT bằng 2 chuỗi ngẫu nhiên do chính máy bạn sinh ra (chạy 2 lần, mỗi lần lấy 1 chuỗi, dán vào 1 dòng — đừng copy secret của người khác):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Sau khi điền, 2 dòng đó trông như sau (chuỗi của bạn sẽ khác):

```env
JWT_ACCESS_SECRET=<chuỗi-64-ký-tự-hex-bạn-vừa-sinh>
JWT_REFRESH_SECRET=<chuỗi-64-ký-tự-hex-khác-bạn-vừa-sinh>
```

Các giá trị còn lại để nguyên như trong `.env.example` (đã khớp với Docker ở Bước 4):

```env
MONGODB_URI=mongodb://admin:password@localhost:27017/homemate?authSource=admin
REDIS_URL=redis://:password@localhost:6379
CORS_ORIGINS=http://localhost:3001,http://localhost:8081
```

**Kiểm tra:** file `.env` tồn tại ở root repo. Không commit file này (nó đã nằm trong `.gitignore`), không gửi nội dung `.env` lên group chat.

### 5.2. File .env trong apps/mobile (bắt buộc cho Web và Mobile)

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Mở file `apps/mobile/.env`, điền Goong API Key (được cấp bởi owner nhóm):

```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
EXPO_PUBLIC_GOONG_API_KEY=<key-goong-rest-api-nhóm-cấp>
EXPO_PUBLIC_GOONG_MAP_KEY=<key-goong-map-nhóm-cấp>
```

> **Lưu ý:** `apps/mobile/metro.config.js` kiểm tra bắt buộc biến `EXPO_PUBLIC_GOONG_API_KEY` (độ dài >= 10 ký tự, không bắt đầu bằng eyJ hay {). Nếu thiếu biến này trong `apps/mobile/.env`, Metro bundler sẽ dừng build ngay lập tức. Vì vậy bước tạo file này là **bắt buộc**.

### 5.3. Các biến không bắt buộc khác
- Stringee, Gemini, OpenAI: Nút gọi thoại và tính năng AI chỉ là phụ. Thiếu các biến này hệ thống tự ẩn nút gọi, app vẫn hoạt động bình thường. Không cần đợi xin đủ key để bắt đầu chạy.

## 6. Bước 4 — Bật hạ tầng (MongoDB & Redis) bằng Docker & Seed dữ liệu ban đầu

### 4.1. Bật container
```bash
docker compose up -d mongodb redis
docker compose ps
```

**Kiểm tra:** `docker compose ps` phải thấy `homemate-mongodb` và `homemate-redis` ở trạng thái running (hoặc healthy).
> **Lưu ý:** Hệ thống đã chuyển hoàn toàn sang dùng MongoDB GridFS kết hợp bộ đệm ổ đĩa cho luồng upload file (không còn dùng MinIO hay minio-init, và không cần tạo bucket nữa). Toàn bộ ảnh đại diện, ảnh CCCD, ảnh đơn hàng được lưu trữ bền vững trực tiếp trong MongoDB và vẫn đọc lại được bình thường sau khi API khởi động lại.

Đợi thêm khoảng 10 giây sau khi container chạy để Mongo sẵn sàng nhận kết nối.

### 4.2. Nạp dữ liệu mẫu ban đầu (Seed Database)
Lần đầu tiên clone về, cơ sở dữ liệu MongoDB hoàn toàn trống. Chạy lệnh sau ở root repo để tạo dịch vụ và tài khoản Quản trị viên (Admin):

```bash
pnpm --filter @homemate/api seed
pnpm --filter @homemate/api seed:admin
```

**Kiểm tra:** 
- Lệnh `seed` in ra `Seeded 8 services` và tài khoản mẫu.
- Lệnh `seed:admin` in ra `Admin user created: 0999999999 / admin123`.

## 7. Bước 5 — Chạy API (terminal 1)

Mở terminal 1 ở root repo, chạy:

```bash
pnpm --filter @homemate/api dev
```

**Kiểm tra — phải thấy cả 2:**

1. Trong terminal phải thấy dòng log:
   ```text
   🚀 HomeMate API running on: http://0.0.0.0:3000/api/v1
   ```
2. Mở trình duyệt (hoặc chạy lệnh dưới, trên PowerShell dùng `curl.exe`):
   ```bash
   curl.exe http://localhost:3000/api/v1/health
   ```

Phải trả về JSON chứa `"status":"ok"`. Nếu không thấy 2 dấu hiệu này thì API chưa chạy được — xem mục 13, đừng vội chạy Admin/Mobile.

Giữ nguyên terminal này chạy trong suốt buổi làm việc. Tắt terminal là API tắt theo.

## 8. Bước 6 — Chạy Admin (terminal 2)

Mở terminal 2 ở root repo, chạy:

```bash
pnpm --filter @homemate/admin dev
```

**Kiểm tra:** mở `http://localhost:3001`, phải thấy trang đăng nhập Admin. Admin mặc định đã trỏ về API local (`http://localhost:3000/api/v1`) nên không cần tạo thêm file `.env.local` cho admin, trừ khi API của bạn không chạy ở localhost.

## 9. Bước 7 — Chạy App / Web (terminal 3)

Mở terminal 3 ở root repo, chạy:

```bash
pnpm --filter @homemate/mobile dev
```

**Kiểm tra:** terminal Metro phải hiện mã QR và dòng chờ kết nối. Sau đó:

- **Xem bản Web (không cần điện thoại, khuyến nghị cho cả nhóm lúc đầu)**: trong terminal Metro bấm phím `w`, trình duyệt sẽ mở `http://localhost:8081`. Muốn xem đúng tỉ lệ điện thoại thì trong Chrome bấm `F12` → `Ctrl+Shift+M` → chọn máy iPhone/Pixel (chiều rộng 360–412px).
- **Xem trên điện thoại thật qua Expo Go**: điện thoại và máy dev cùng Wi-Fi, mở app Expo Go quét mã QR trong terminal Metro.
- **Xem bản native trên Android (Android Studio)**: xem mục 10. Đây là bước **BẮT BUỘC cho cả nhóm** — ai cũng phải chạy được bản native, không chỉ xem bản web, vì có những tính năng (gọi thoại, bản đồ, thông báo đẩy...) chỉ test được trên bản native.

**Lưu ý về port:** Web dùng chung Metro port 8081 với app, không phải port thứ 4. Đừng chạy cả `dev` và `web` cùng lúc vì cả hai đều chiếm 8081 — chạy 1 cái rồi bấm `w` là đủ.

## 10. (BẮT BUỘC cho cả nhóm) Chạy bản native trên Android Studio

Bắt buộc cho cả nhóm: ai cũng phải chạy được bản native, không được dừng ở bản web. Ai có điện thoại Android thì dùng điện thoại thật, ai không có thì bắt buộc phải tải máy ảo theo mục 10.2 bên dưới.

Repo đã có sẵn thư mục `apps/mobile/android` (đã prebuild). **Đừng chạy `npx expo prebuild --clean`** — nó tạo lại thư mục android và có thể làm mất cấu hình native riêng của app.

### 10.1. Cài đặt (làm 1 lần)

1. Tải Android Studio từ developer.android.com, cài đặt bình thường.
2. Mở Android Studio → SDK Manager, cài: Android SDK Platform (bản mới nhất), Android SDK Build-Tools, Android SDK Platform-Tools, rồi Accept License.
3. Set biến môi trường, rồi mở lại terminal:
   - `ANDROID_HOME`: Windows là `%LOCALAPPDATA%\Android\Sdk`, macOS là `~/Library/Android/sdk`, Linux là `~/Android/Sdk`.
   - `JAVA_HOME`: trỏ về JDK đi kèm Android Studio (thư mục `jbr` trong thư mục cài Android Studio), đừng dùng JDK 8 cũ — Gradle của repo (Gradle 9.3.1) sẽ build lỗi với JDK cũ.
   - Thêm `platform-tools` vào `PATH` để dùng được lệnh `adb`.

### 10.2. Chuẩn bị thiết bị

- **Máy ảo (bắt buộc nếu không có điện thoại Android)**: Android Studio → Device Manager → Create Device → chọn Pixel → chọn System Image (bản API mới nhất, x86_64) → Finish → bấm ▶ để bật máy ảo, đợi tới màn hình chính rồi mới chạy app. Lưu ý: máy ảo + Metro + API + Admin cùng lúc khá nặng RAM, máy 8GB RAM thì nên dùng điện thoại thật thay vì máy ảo.
- **Điện thoại thật cắm USB**: bật Developer Options → USB Debugging, cắm cáp, bấm Allow trên điện thoại, rồi kiểm tra:
  ```bash
  adb devices
  ```
  Phải thấy 1 thiết bị ở trạng thái `device`, không phải `unauthorized`.

### 10.3. Chạy app native

API + Metro (Bước 5 và 7) phải đang chạy trước, rồi chạy từ root repo:

```bash
pnpm --filter @homemate/mobile android
```

Lệnh này build native lần đầu rồi cài bản dev lên máy, sau đó Metro tự mở app (không cần quét QR). Lần build đầu mất 10–20 phút vì Gradle tải dependencies — **đừng tắt máy / cho máy ngủ giữa chừng**, và đừng tắt terminal Metro trong lúc build.

Lần sau chỉ sửa code JS thì không cần build lại native: bật Metro lên, mở app đã cài sẵn trên máy là nó tự load code mới. Chỉ khi sửa code native (thư mục `android/`, thêm thư viện native) mới cần chạy lại lệnh này.

### 10.4. App native mở lên mà không nối được API

- **Máy ảo**: tạo file `apps/mobile/.env` với dòng:
  ```env
  EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api/v1
  ```
  (địa chỉ đặc biệt để máy ảo Android trỏ về localhost của máy dev), rồi chạy lại Metro.
- **Điện thoại thật cắm USB**: chạy thêm:
  ```bash
  adb reverse tcp:3000 tcp:3000
  adb reverse tcp:8081 tcp:8081
  ```
- **Điện thoại thật qua Wi-Fi**: điện thoại và máy dev cùng Wi-Fi, set trong `apps/mobile/.env`:
  ```env
  EXPO_PUBLIC_API_URL=http://<IP-LAN-của-máy-dev>:3000/api/v1
  ```
  (Windows xem IP bằng `ipconfig`, macOS/Linux bằng `ip addr`). Sau khi sửa `.env` phải khởi động lại Metro. IP này đổi theo Wi-Fi nên chỉ để trong `.env` local, không ghi vào code, không commit.

iOS native chỉ build được trên máy Mac có Xcode (`pnpm --filter @homemate/mobile ios`); máy Windows trong nhóm dùng bản web hoặc Expo Go trên iPhone là đủ để xem giao diện.

## 11. Tài khoản test (chỉ dùng ở local)

- **Admin local**: tài khoản admin mẫu được tạo bằng script seed trong `apps/api/src/seed-admin.ts` (số điện thoại `0999999999`, mật khẩu mặc định `admin123`). Script này chỉ chạy trên DB local của bạn, đừng dùng tài khoản/mật khẩu này ở môi trường production.
- **Tài khoản khách / thợ test**: owner chia sẻ riêng cho từng người, không ghi mật khẩu vào README này và không commit lên repo.

## 11A. Quy tắc "chạy được rồi mới tính" — và không update bậy lên GitHub

Một người chỉ được tính là "setup xong" khi đã chạy được đủ 4 dấu tick ở mục 1 (API + Admin + Web + bản native Android). Chưa đủ 4 tick thì chưa tính, đừng báo "xong rồi" với nhóm.

Chưa chạy được thì tuyệt đối không push lên GitHub:

1. Không push code đang lỗi, code chưa chạy được lên GitHub để "lưu tạm" — muốn lưu tạm thì commit ở local, đừng push.
2. Không push thẳng lên `master` / `main` khi chưa chạy được và chưa được owner duyệt. Làm trên nhánh riêng của mình, push nhánh riêng, báo owner review rồi mới merge.
3. Không push `.env`, key, IP LAN, cấu hình riêng của máy mình lên GitHub (xem mục 12).
4. Không push bậy những thứ không liên quan tới task của mình (file rác, file test cá nhân, cấu hình editor riêng...). Push cái gì thì phải biết rõ cái đó là gì, vì sao phải lên GitHub.
5. Nếu để chạy được mà phải sửa code nguồn (không phải chỉ sửa `.env`), thì đó có thể là lỗi chung của repo — **dừng lại, báo owner trước, đừng tự sửa rồi push bậy lên.** Owner xác nhận rồi mới sửa và push.

Tóm lại: **chạy được đủ 4 tick ở local trước, được owner duyệt sau, rồi mới push lên GitHub.** Thứ tự này không được đảo ngược.

## 12. Những việc TUYỆT ĐỐI KHÔNG làm (cả người và AI đều phải tuân theo)

1. Không commit `.env`, `node_modules`, `dist`, `.next`, `.expo`, key, keystore, mật khẩu, token.
2. Không ghi cứng IP LAN, key, secret vào code — mọi cấu hình đi qua `.env`.
3. Không chạy `docker compose up` trần (không kèm tên service): nó bật cả api:3000 và admin:3001 trong Docker, chiếm mất port rồi `pnpm dev` không bật được nữa. Chỉ chạy đúng lệnh ở Bước 4.
4. Không chạy `npx expo prebuild --clean`, không sửa thư mục `android/` chỉ để "cho chạy được".
5. Không đổi `PORT` trong `.env` thành số khác — API phải ở 3000, Admin ở 3001, Metro ở 8081 thì app mới nối nhau được.
6. Không dùng EAS để build APK khi chạy local (quota EAS có hạn) — chạy local bằng Gradle / lệnh ở mục 10, và giữ máy thức trong lúc build.
7. Không sửa code để lách lỗi môi trường (ví dụ sửa URL API trong code vì chưa set `.env`, sửa version thư viện vì chưa cài đúng Node/pnpm). Lỗi môi trường thì sửa môi trường, không sửa code.

## 13. Lỗi thường gặp — tra bảng này trước khi hỏi nhóm

| Triệu chứng                                       | Nguyên nhân thường gặp nhất                      | Cách xử lý đúng (làm theo thứ tự)                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| API báo lỗi kết nối Mongo / MongoNetworkError     | Chưa chạy Docker hạ tầng, hoặc sai `MONGODB_URI` | Chạy lại Bước 4, kiểm tra `docker compose ps` thấy Mongo running rồi mới chạy lại API                                                       |
| Admin mở lên nhưng không có dữ liệu / gọi API lỗi | API chưa chạy, hoặc Admin trỏ sai API            | API phải đạt kiểm tra ở Bước 5 trước; kiểm tra `NEXT_PUBLIC_API_URL` nếu có set tay                                                         |
| Web/app báo Network Error khi đăng nhập           | App trỏ sai API                                  | Xem mục 10.4: máy ảo dùng `10.0.2.2`, điện thoại USB dùng `adb reverse`, điện thoại Wi-Fi dùng IP LAN trong `.env`, rồi khởi động lại Metro |
| Metro báo lỗi lạ sau khi pull code mới            | Cache Metro cũ                                   | Dừng Metro, xóa thư mục `.expo` trong `apps/mobile`, chạy lại lệnh dev                                                                      |
| Port 3000 / 3001 / 8081 đã bị chiếm               | Còn process cũ chạy ngầm                         | Tắt process cũ (hoặc tắt Docker api/admin nếu lỡ chạy `docker compose up` trần), rồi chạy lại                                               |
| Sửa code mà app không đổi                         | Nhầm nhánh, hoặc Metro/admin chưa load lại       | Kiểm tra `git branch --show-current` phải là `master`, lưu file, xem terminal có báo lỗi biên dịch không                                    |
| Tìm địa chỉ không có số nhà                       | Thiếu key Goong                                  | Thêm `EXPO_PUBLIC_GOONG_API_KEY` vào `apps/mobile/.env` rồi khởi động lại Metro (mục 5.2)                                                   |
| Build Android lỗi về JDK / Gradle                 | Dùng JDK cũ, hoặc chưa set `JAVA_HOME`           | Set `JAVA_HOME` về thư mục `jbr` của Android Studio, mở lại terminal, chạy lại                                                              |

Khi hỏi nhóm, gửi kèm 3 thứ: **lệnh đã chạy, log lỗi đầy đủ, đang kẹt ở Bước mấy** — đừng chỉ báo "chạy không được".

## 14. Dừng và chạy lại

```bash
# Dừng app: bấm Ctrl+C ở từng terminal (API, Admin, Metro)

# Dừng hạ tầng Docker:
docker compose down

# Chạy lại từ đầu: làm lại từ Bước 4 (Docker) → Bước 5 → Bước 6 → Bước 7,
# theo đúng thứ tự đó, không cần làm lại Bước 1–3 nếu code và .env không đổi.
```
