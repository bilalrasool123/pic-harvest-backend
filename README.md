# PicHarvest — Backend

Fastify + TypeScript + Playwright + Redis backend for the PicHarvest image extractor.

## Stack

| Technology | Purpose |
|---|---|
| **Fastify** | Fast HTTP framework with schema validation |
| **Playwright** | Headless browser crawling (JS rendering + lazy loading) |
| **Redis (ioredis)** | Persistent crawl job storage (24h TTL) |
| **JSZip** | Server-side ZIP generation |
| **TypeScript** | Type safety |
| **Pino** | Structured logging |

## Prerequisites

- Node.js >= 18
- Redis running locally (or set `REDIS_URL`)
- Playwright browsers installed

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npx playwright install chromium

# 3. Copy env file
cp .env.example .env

# 4. Start development server
npm run dev
```

The server runs at **http://localhost:8080**.

## API Reference

### `POST /api/crawl/start`

Start a crawl job.

**Request body:**
```json
{
  "url": "https://example.com",
  "scope": "single",
  "options": {
    "maxPages": 20,
    "maxDepth": 3,
    "timeout": 30000
  }
}
```

**Response:**
```json
{ "jobId": "uuid-..." }
```

---

### `GET /api/crawl/:jobId`

Poll job status and results.

**Response:**
```json
{
  "id": "uuid",
  "status": "running",
  "progress": {
    "pagesVisited": 3,
    "imagesFound": 47,
    "currentPage": "https://example.com/gallery"
  },
  "images": [...]
}
```

Status values: `pending | running | done | error`

---

### `POST /api/download/zip`

Download selected images as a ZIP archive.

**Request body:**
```json
{
  "images": [
    { "url": "https://cdn.example.com/photo.jpg", "filename": "photo" }
  ]
}
```

**Response:** `application/zip` binary stream

---

### `GET /health`

Health check — returns `{ "status": "ok" }`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with hot-reload (tsx watch) |
| `npm run build` | Compile TypeScript to dist/ |
| `npm start` | Run compiled build |

## Environment Variables

See `.env.example` for all supported variables.

## Deployment

This backend is deployment-ready for:
- **Docker**: Add a `Dockerfile` using `node:20-slim` + Playwright dependencies
- **Railway / Render**: Set env vars and deploy from Git
- **VPS**: Use PM2 with the compiled build
