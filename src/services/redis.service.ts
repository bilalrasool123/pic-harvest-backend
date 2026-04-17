import Redis from 'ioredis';
import { CrawlJob } from '../types';
import { logger } from '../utils/logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const JOB_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// ──────────────────────────────────────────────
// In-memory fallback (used when Redis is unavailable)
// ──────────────────────────────────────────────

interface MemEntry {
  job: CrawlJob;
  expiresAt: number;
}

const memStore = new Map<string, MemEntry>();

const memBackend = {
  set(key: string, value: string, ttlSeconds: number) {
    memStore.set(key, { job: JSON.parse(value) as CrawlJob, expiresAt: Date.now() + ttlSeconds * 1000 });
  },
  get(key: string): string | null {
    const entry = memStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      memStore.delete(key);
      return null;
    }
    return JSON.stringify(entry.job);
  },
  del(key: string) {
    memStore.delete(key);
  },
};

// ──────────────────────────────────────────────
// Redis client (optional — falls back gracefully)
// ──────────────────────────────────────────────

let redisClient: Redis | null = null;
let usingRedis = false;
let connectionAttempted = false;

function tryGetRedis(): Redis | null {
  if (connectionAttempted) return usingRedis ? redisClient : null;
  connectionAttempted = true;

  try {
    const client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 3000,
      enableOfflineQueue: false,
    });

    client.on('connect', () => {
      usingRedis = true;
      logger.info('Redis connected — using Redis for job storage');
    });

    client.on('error', (err) => {
      if (usingRedis) {
        logger.warn({ err: err.message }, 'Redis error — continuing with in-memory fallback');
        usingRedis = false;
      }
    });

    // Fire-and-forget connect attempt
    client.connect().then(() => {
      usingRedis = true;
    }).catch(() => {
      logger.warn(`Redis unavailable at ${REDIS_URL} — using in-memory job store (jobs will be lost on restart)`);
      usingRedis = false;
    });

    redisClient = client;
    return client;
  } catch {
    logger.warn('Failed to initialise Redis client — using in-memory job store');
    return null;
  }
}

// Initialise on module load
tryGetRedis();

// ──────────────────────────────────────────────
// Unified job store — Redis when available, memory otherwise
// ──────────────────────────────────────────────

async function redisSet(key: string, value: string): Promise<void> {
  if (usingRedis && redisClient) {
    try {
      await redisClient.set(key, value, 'EX', JOB_TTL_SECONDS);
      return;
    } catch {
      // fall through to memory
    }
  }
  memBackend.set(key, value, JOB_TTL_SECONDS);
}

async function redisGet(key: string): Promise<string | null> {
  if (usingRedis && redisClient) {
    try {
      return await redisClient.get(key);
    } catch {
      // fall through to memory
    }
  }
  return memBackend.get(key);
}

async function redisDel(key: string): Promise<void> {
  if (usingRedis && redisClient) {
    try {
      await redisClient.del(key);
      return;
    } catch {
      // fall through to memory
    }
  }
  memBackend.del(key);
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export const redisService = {
  async saveJob(job: CrawlJob): Promise<void> {
    await redisSet(`picharvest:job:${job.id}`, JSON.stringify(job));
  },

  async getJob(jobId: string): Promise<CrawlJob | null> {
    const raw = await redisGet(`picharvest:job:${jobId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CrawlJob;
    } catch {
      return null;
    }
  },

  async updateJob(jobId: string, updates: Partial<CrawlJob>): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) {
      logger.warn(`Tried to update non-existent job: ${jobId}`);
      return;
    }
    const updated: CrawlJob = { ...job, ...updates, updatedAt: Date.now() };
    await redisSet(`picharvest:job:${jobId}`, JSON.stringify(updated));
  },

  async deleteJob(jobId: string): Promise<void> {
    await redisDel(`picharvest:job:${jobId}`);
  },
};
