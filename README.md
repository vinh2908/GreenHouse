# HomeMate — Home Service Marketplace

Nền tảng kết nối khách hàng với người giúp việc tại Việt Nam.

## Tech Stack

| Layer | Tech |
|-------|------|
| Mobile | React Native + Expo + TypeScript |
| Admin | Next.js + TailwindCSS + Shadcn UI |
| Backend | NestJS + TypeScript + REST + WebSocket |
| Database | MongoDB + Redis |
| Storage | MinIO |
| Monorepo | pnpm + Turborepo |
| Dev Env | Docker Compose |

## Prerequisites

- Node.js >= 20
- pnpm >= 9 (`npm install -g pnpm`)
- Docker Desktop
- Expo Go app (iOS/Android) hoặc Android Emulator / iOS Simulator

## Quick Start

### 1. Clone và cài đặt dependencies

```bash
git clone <repo-url>
cd homemate

# Copy env file
cp .env.example apps/api/.env

# Cài dependencies
pnpm install
```

### 2. Khởi động infrastructure (Docker)

```bash
# Start MongoDB, Redis, MinIO
docker compose up -d mongodb redis minio minio-init

# Kiểm tra logs
docker compose logs -f mongodb
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
# Scan QR code bằng Expo Go
```

### 6. Khởi động tất cả cùng lúc (Docker)

```bash
docker compose up -d
```

## Services URLs

| Service | URL |
|---------|-----|
| Backend API | http://localhost:3000/api/v1 |
| API Docs (Swagger) | http://localhost:3000/api/docs |
| Admin Dashboard | http://localhost:3001 |
| MongoDB | localhost:27017 |
| Redis | localhost:6379 |
| MinIO API | http://localhost:9000 |
| MinIO Console | http://localhost:9001 |

## MinIO Console Credentials
- User: `minioadmin`
- Password: `minioadmin123`

## MongoDB Credentials
- User: `admin`
- Password: `password`
- Database: `homemate`

## Project Structure

```
homemate/
├── apps/
│   ├── api/          # NestJS Backend
│   ├── admin/        # Next.js Admin
│   └── mobile/       # React Native (Expo)
├── packages/
│   ├── types/        # Shared TypeScript types
│   ├── constants/    # Shared constants
│   └── utils/        # Shared utilities
├── scripts/          # Setup scripts
├── docker-compose.yml
└── turbo.json
```

## Development Phases

- [x] **Phase 1** — Project Setup & Infrastructure
- [ ] **Phase 2** — Authentication (JWT + OTP)
- [ ] **Phase 3** — User Profiles (Customer + Helper)
- [ ] **Phase 4** — Services
- [ ] **Phase 5** — Booking System
- [ ] **Phase 6** — Helper Matching Algorithm
- [ ] **Phase 7** — Realtime (Socket.IO)
- [ ] **Phase 8** — Payment & Wallet
- [ ] **Phase 9** — Admin Dashboard
- [ ] **Phase 10** — AI Features

## Available Scripts

```bash
pnpm dev          # Start all apps
pnpm dev:api      # Start backend only
pnpm dev:admin    # Start admin only
pnpm dev:mobile   # Start mobile only
pnpm build        # Build all apps
pnpm lint         # Lint all apps
pnpm test         # Run all tests

pnpm docker:up    # docker compose up -d
pnpm docker:down  # docker compose down
pnpm docker:logs  # docker compose logs -f
```
