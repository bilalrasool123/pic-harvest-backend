# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
# Docker image version MUST match the playwright npm package version exactly.
# Current pinned version: 1.49.1
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JS from build stage
COPY --from=builder /app/dist ./dist

# Railway injects PORT dynamically — app reads process.env.PORT
EXPOSE 8080

CMD ["node", "dist/index.js"]
