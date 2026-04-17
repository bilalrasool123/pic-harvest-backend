# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ─── Stage 2: Runtime (with Playwright + Chromium) ───────────────────────────
# Official Playwright image includes Chromium + all OS dependencies pre-installed
FROM mcr.microsoft.com/playwright:v1.44.1-jammy

WORKDIR /app

# Copy package files and install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JS from build stage
COPY --from=builder /app/dist ./dist

# Railway injects PORT at runtime — our app already reads process.env.PORT
EXPOSE 8080

CMD ["node", "dist/index.js"]
