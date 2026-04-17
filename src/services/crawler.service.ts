import { chromium, Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import { CrawlJob, CrawlOptions, CrawlScope, ImageItem } from '../types';
import { extractImages } from './extractor.service';
import { redisService } from './redis.service';
import { getAllLinks, normalizeUrl } from '../utils/url.utils';
import { logger } from '../utils/logger';

const DEFAULTS: Required<CrawlOptions> = {
  maxPages: 20,
  maxDepth: 3,
  timeout: 60_000,
};

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export async function startCrawlJob(
  url: string,
  scope: CrawlScope,
  options: CrawlOptions = {}
): Promise<string> {
  const jobId = uuidv4();
  const mergedOptions: Required<CrawlOptions> = { ...DEFAULTS, ...options };

  const job: CrawlJob = {
    id: jobId,
    url,
    scope,
    options: mergedOptions,
    status: 'pending',
    progress: { pagesVisited: 0, imagesFound: 0, currentPage: '' },
    images: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await redisService.saveJob(job);

  // Fire-and-forget — runs in background
  performCrawl(jobId, url, scope, mergedOptions).catch(async (err) => {
    logger.error({ err, jobId }, 'Crawl job failed unexpectedly');
    await redisService.updateJob(jobId, {
      status: 'error',
      error: (err as Error).message,
    });
  });

  return jobId;
}

// ──────────────────────────────────────────────
// Crawl engine
// ──────────────────────────────────────────────

async function performCrawl(
  jobId: string,
  startUrl: string,
  scope: CrawlScope,
  options: Required<CrawlOptions>
): Promise<void> {
  await redisService.updateJob(jobId, { status: 'running' });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const visited = new Set<string>();
    const imageUrlSet = new Set<string>();
    const allImages: ImageItem[] = [];

    const pageLimit = scope === 'single' ? 1 : options.maxPages;

    type QueueItem = { url: string; depth: number };
    const queue: QueueItem[] = [{ url: startUrl, depth: 0 }];

    while (queue.length > 0 && visited.size < pageLimit) {
      const item = queue.shift()!;
      const normalizedUrl = normalizeUrl(item.url) ?? item.url;

      if (visited.has(normalizedUrl)) continue;
      visited.add(normalizedUrl);

      logger.info({ jobId, url: normalizedUrl, depth: item.depth }, 'Crawling page');

      await redisService.updateJob(jobId, {
        progress: {
          pagesVisited: visited.size,
          imagesFound: allImages.length,
          currentPage: normalizedUrl,
        },
      });

      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1440, height: 900 },
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();

      try {
        // ⚠️ KEY FIX: Use 'load' instead of 'networkidle'.
        // 'networkidle' times out on almost every modern site because of
        // analytics, WebSockets, polling, etc. 'load' fires reliably.
        await page.goto(normalizedUrl, {
          waitUntil: 'load',
          timeout: options.timeout,
        });

        // Give JS-heavy pages a moment to render after load
        await page.waitForTimeout(1500);

        // Auto-scroll to trigger lazy-loaded images
        await autoScroll(page);

        // Wait a bit more after scroll for lazy images to load
        await page.waitForTimeout(1000);

        const pageImages = await extractImages(page, normalizedUrl);

        logger.info(
          { jobId, url: normalizedUrl, found: pageImages.length, total: allImages.length + pageImages.length },
          'Page crawled'
        );

        for (const img of pageImages) {
          if (!imageUrlSet.has(img.url)) {
            imageUrlSet.add(img.url);
            allImages.push(img);
          }
        }

        // BFS: queue links if not single-page mode
        if (scope !== 'single' && item.depth < options.maxDepth) {
          const links = await getAllLinks(page, startUrl);
          for (const link of links) {
            const norm = normalizeUrl(link) ?? link;
            if (!visited.has(norm)) {
              queue.push({ url: norm, depth: item.depth + 1 });
            }
          }
        }
      } catch (pageErr) {
        logger.warn({ err: (pageErr as Error).message, url: normalizedUrl }, 'Page crawl error — skipping');
      } finally {
        await context.close();
      }
    }

    await redisService.updateJob(jobId, {
      status: 'done',
      images: allImages,
      progress: {
        pagesVisited: visited.size,
        imagesFound: allImages.length,
        currentPage: '',
      },
    });

    logger.info({ jobId, pages: visited.size, images: allImages.length }, 'Crawl completed');
  } finally {
    await browser.close();
  }
}

// ──────────────────────────────────────────────
// Auto-scroll to trigger lazy loads
// ──────────────────────────────────────────────

async function autoScroll(page: Page): Promise<void> {
  try {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let scrolled = 0;
        const step = 300;
        const maxScroll = 15_000;
        const timer = setInterval(() => {
          window.scrollBy(0, step);
          scrolled += step;
          if (scrolled >= document.body.scrollHeight || scrolled >= maxScroll) {
            clearInterval(timer);
            // Scroll back to top so images above the fold are captured too
            window.scrollTo(0, 0);
            resolve();
          }
        }, 150);
      });
    });
    await page.waitForTimeout(500);
  } catch {
    // Non-fatal — some pages block scroll events
  }
}
