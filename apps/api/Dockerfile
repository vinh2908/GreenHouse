FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/constants/package.json ./packages/constants/
COPY packages/utils/package.json ./packages/utils/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

# Development stage
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
WORKDIR /app/apps/api
CMD ["pnpm", "run", "dev"]

# Build stage
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
WORKDIR /app/apps/api
RUN pnpm run build

# Production stage
FROM node:20-alpine AS production
RUN npm install -g pnpm
WORKDIR /app
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./
COPY --from=deps /app/apps/api/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main"]
