# Green House — Home Service Marketplace

Nền tảng kết nối khách hàng với người giúp việc tại Việt Nam.
**Model: Vua Thợ** — Customer đăng job → Helpers gửi báo giá → Customer chọn → Hợp đồng số.

---

## Tech Stack

| Layer    | Tech                                   |
| -------- | -------------------------------------- |
| Mobile   | React Native + Expo + TypeScript       |
| Admin    | Next.js + TailwindCSS + Shadcn UI      |
| Backend  | NestJS + TypeScript + REST + WebSocket |
| Database | MongoDB + Redis                        |
| Storage  | MinIO                                  |
| Monorepo | pnpm + Turborepo                       |
| Dev Env  | Docker Compose                         |

---

## Core Flow (Vua Thợ model)

```
CUSTOMER                                    HELPER
────────                                    ──────
Chọn dịch vụ                               Bật ONLINE
Mô tả yêu cầu                              Nhận thông báo job gần mình
Upload ảnh/video                            Xem chi tiết job
[AI gợi ý khoảng giá]                      Gửi báo giá (tiền công + vật tư)
Đăng job (OPEN)            ←───────────────
                           ───────────────→ Job hiện trong feed
Nhận nhiều báo giá
Xem hồ sơ helpers
Chat với helpers                            Chat với customer
Chọn báo giá phù hợp      ───────────────→ Nhận thông báo được chọn
Ký hợp đồng số             ←───────────────  Xác nhận hợp đồng
                                            Di chuyển đến nhà
Theo dõi realtime          ←───────────────  Cập nhật vị trí
                           ←───────────────  Chụp ảnh trước khi làm
                                            Thực hiện công việc
                           ←───────────────  Upload ảnh hoàn thành
Nghiệm thu
Thanh toán                 ───────────────→ Nhận tiền vào ví
Đánh giá Helper                             Đánh giá Customer
```

---

## Job Status Machine

```
DRAFT → OPEN → RECEIVING_QUOTES → QUOTE_SELECTED → CONFIRMED
→ HELPER_ON_THE_WAY → HELPER_ARRIVED → IN_PROGRESS
→ PENDING_REVIEW → COMPLETED
                 ↘ DISPUTED → COMPLETED | REFUNDED
                 ↗
→ CANCELLED → REFUNDED
```

---

## Prerequisites

- Node.js >= 20
- pnpm >= 9 (`npm install -g pnpm`)
- Docker Desktop
- Expo Go app (iOS/Android)

---

## Quick Start

### 1. Cài đặt dependencies

```bash
git clone <repo-url>
cd homemate
cp .env.example apps/api/.env
pnpm install
```

### 2. Khởi động infrastructure (Docker)

```bash
docker compose up -d mongodb redis minio minio-init
```

### 3. Khởi động Backend API

```bash
pnpm dev:api
# → http://localhost:3000/api/v1
# → http://localhost:3000/api/docs (Swagger)
```

### 4. Khởi động Admin Dashboard

```bash
pnpm dev:admin
# → http://localhost:3001
```

### 5. Khởi động Mobile App

```bash
pnpm dev:mobile
# Scan QR bằng Expo Go
```

---

## Services URLs

| Service         | URL                                 |
| --------------- | ----------------------------------- |
| Backend API     | http://localhost:3000/api/v1        |
| API Health      | http://localhost:3000/api/v1/health |
| Swagger Docs    | http://localhost:3000/api/docs      |
| Admin Dashboard | http://localhost:3001               |
| MongoDB         | localhost:27017                     |
| Redis           | localhost:6379                      |
| MinIO API       | http://localhost:9000               |
| MinIO Console   | http://localhost:9001               |

**MinIO:** user `minioadmin` / pass `minioadmin123`
**MongoDB:** user `admin` / pass `password` / db `homemate`

---

## Project Structure

```
homemate/
├── apps/
│   ├── api/                    # NestJS Backend
│   │   └── src/
│   │       ├── modules/        # Feature modules (auth, jobs, quotes...)
│   │       ├── common/         # Guards, Filters, Interceptors, Decorators
│   │       ├── config/         # App, DB, JWT, Redis, MinIO configs
│   │       └── database/
│   │           └── schemas/    # Mongoose schemas
│   ├── admin/                  # Next.js 15 Admin Dashboard
│   └── mobile/                 # React Native (Expo)
│       └── app/
│           ├── (auth)/         # Login, Register, OTP
│           ├── (customer)/     # Customer tabs
│           └── (helper)/       # Helper tabs
├── packages/
│   ├── types/                  # Shared TypeScript types
│   ├── constants/              # Shared constants & socket events
│   └── utils/                  # Shared utilities
├── scripts/
│   └── mongo-init.js           # MongoDB init + seed
└── docker-compose.yml
```

---

## Available Scripts

```bash
pnpm dev          # Start all apps
pnpm dev:api      # Start backend only
pnpm dev:admin    # Start admin only
pnpm dev:mobile   # Start mobile only
pnpm build        # Build all
pnpm lint         # Lint all
pnpm test         # Test all

pnpm docker:up    # docker compose up -d
pnpm docker:down  # docker compose down
pnpm docker:logs  # docker compose logs -f
```

---

## Development Phases

### ✅ Phase 1 — Project Setup & Infrastructure

- Monorepo (pnpm + Turborepo)
- Docker Compose (MongoDB, Redis, MinIO)
- NestJS scaffold + Mongoose schemas
- Next.js Admin scaffold
- Expo Mobile scaffold
- Shared types, constants, utils

### 🔄 Phase 2 — Authentication

- Đăng ký / đăng nhập bằng SĐT
- OTP verification (mock SMS cho dev)
- JWT Access Token + Refresh Token
- Role-based access (Customer, Helper, Admin)
- Đổi active role (Customer ↔ Helper)

### 📋 Phase 3 — User Profiles

- Customer profile + địa chỉ
- Helper profile + skills + khu vực
- Helper KYC (upload CCCD + selfie)
- Admin duyệt Helper

### 🛠 Phase 4 — Services

- Service categories CRUD (Admin)
- Service detail với khoảng giá gợi ý
- Helper đăng ký dịch vụ mình cung cấp

### 📦 Phase 5 — Job & Quote System _(core)_

- Customer tạo Job (mô tả + ảnh + địa chỉ + thời gian)
- Job OPEN → Broadcast đến Helpers gần đó (theo geo)
- Helper gửi Quote (tiền công + vật tư + bảo hành)
- Customer xem danh sách quotes, chat với Helpers
- Customer chọn Quote → Tạo Digital Contract (Hợp đồng số)
- Contract amendment flow (thay đổi cần 2 bên đồng ý)

### 🗺 Phase 6 — Job Feed & Smart Sort

- Helper nhận job feed theo khu vực + service
- Quote ranking cho Customer (rating, completion_rate, khoảng cách, giá)
- Notification khi có job mới gần Helper

### ⚡ Phase 7 — Realtime

- Socket.IO: job status, quote nhận được, location tracking
- Chat (Customer ↔ Helper, trong context của Job)
- Push notifications (FCM)

### 💳 Phase 8 — Payment & Wallet

- Wallet cho Helper (nhận tiền sau khi job hoàn thành)
- Mock payment cho Customer (Phase 8a)
- Rút tiền (Withdrawal) cho Helper
- Lịch sử giao dịch

### 🖥 Phase 9 — Admin Dashboard

- Quản lý Users, Helpers, Jobs, Quotes
- Helper KYC verification workflow
- Dispute resolution
- Báo cáo doanh thu + thống kê

### 🤖 Phase 10 — AI Features

- AI gợi ý khoảng giá từ mô tả + ảnh
- AI phân tích ảnh hiện trạng → ước tính công việc
- AI Booking Assistant (chatbot)
- Feature Flag: bật/tắt từng AI module

---

## Database Collections

| Collection           | Mô tả                               |
| -------------------- | ----------------------------------- |
| `users`              | Tài khoản người dùng (auth)         |
| `customer_profiles`  | Hồ sơ khách hàng                    |
| `helper_profiles`    | Hồ sơ người giúp việc + KYC         |
| `service_categories` | Danh mục dịch vụ                    |
| `services`           | Chi tiết dịch vụ + khoảng giá gợi ý |
| `jobs`               | Yêu cầu công việc (thay Booking)    |
| `quotes`             | Báo giá từ Helpers                  |
| `contracts`          | Hợp đồng số                         |
| `wallets`            | Ví điện tử                          |
| `transactions`       | Lịch sử giao dịch                   |
| `withdrawals`        | Yêu cầu rút tiền                    |
| `reviews`            | Đánh giá                            |
| `conversations`      | Cuộc hội thoại                      |
| `messages`           | Tin nhắn                            |
| `notifications`      | Thông báo                           |
| `promotions`         | Khuyến mãi                          |
| `disputes`           | Khiếu nại                           |
