import { Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import { ImageItem } from '../types';
import { logger } from '../utils/logger';

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|svg|avif|ico|bmp|tiff?|heic)(\?[^"']*)?$/i;

const DATA_SRC_ATTRS = ['data-src', 'data-lazy-src', 'data-lazy', 'data-original', 'data-url', 'data-image'];

export async function extractImages(page: Page, sourcePageUrl: string): Promise<ImageItem[]> {
  const urlSet = new Set<string>();
  const results: ImageItem[] = [];

  const base = sourcePageUrl;

  // Resolve potentially-relative URL to absolute
  const resolve = (raw: string): string | null => {
    if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return null;
    try {
      return new URL(raw, base).href;
    } catch {
      return null;
    }
  };

  const addImage = (
    raw: string | null | undefined,
    alt?: string,
    width?: number,
    height?: number,
  ) => {
    if (!raw) return;
    const url = resolve(raw);
    if (!url || urlSet.has(url)) return;
    urlSet.add(url);
    results.push({
      id: uuidv4(),
      url,
      sourcePageUrl,
      format: parseFormat(url),
      width: width && width > 0 ? width : undefined,
      height: height && height > 0 ? height : undefined,
      alt: alt || undefined,
    });
  };

  try {
    // ── 1. <img> tags ─────────────────────────────────────────────────────────
    const imgData = await page.$$eval('img', (elements) =>
      elements.map((el) => {
        const img = el as HTMLImageElement;
        return {
          src: img.src || '',
          currentSrc: img.currentSrc || '',
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          alt: img.alt || '',
          srcset: img.getAttribute('srcset') || '',
          dataSrc: img.getAttribute('data-src') || '',
          dataLazySrc: img.getAttribute('data-lazy-src') || '',
          dataLazy: img.getAttribute('data-lazy') || '',
          dataOriginal: img.getAttribute('data-original') || '',
          dataUrl: img.getAttribute('data-url') || '',
          dataImage: img.getAttribute('data-image') || '',
        };
      })
    );

    for (const img of imgData) {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (img.currentSrc) addImage(img.currentSrc, img.alt, w, h);
      if (img.src && img.src !== img.currentSrc) addImage(img.src, img.alt, w, h);
      if (img.dataSrc) addImage(img.dataSrc, img.alt);
      if (img.dataLazySrc) addImage(img.dataLazySrc, img.alt);
      if (img.dataLazy) addImage(img.dataLazy, img.alt);
      if (img.dataOriginal) addImage(img.dataOriginal, img.alt);
      if (img.dataUrl) addImage(img.dataUrl, img.alt);
      if (img.dataImage) addImage(img.dataImage, img.alt);

      // Parse srcset
      if (img.srcset) {
        for (const part of img.srcset.split(',')) {
          const src = part.trim().split(/\s+/)[0];
          if (src) addImage(src, img.alt);
        }
      }
    }

    logger.debug({ sourcePageUrl, afterImgTags: results.length }, 'After <img> tags');

    // ── 2. <picture><source> srcset ──────────────────────────────────────────
    const sourceSrcsets = await page.$$eval('picture source', (elements) =>
      elements.map((el) => ({
        srcset: el.getAttribute('srcset') || '',
        dataSrcset: el.getAttribute('data-srcset') || '',
      }))
    );

    for (const s of sourceSrcsets) {
      for (const attr of [s.srcset, s.dataSrcset]) {
        if (!attr) continue;
        for (const part of attr.split(',')) {
          const src = part.trim().split(/\s+/)[0];
          if (src) addImage(src);
        }
      }
    }

    // ── 3. data-srcset on any element ────────────────────────────────────────
    const dataSrcsets = await page.$$eval('[data-srcset]', (els) =>
      els.map((el) => el.getAttribute('data-srcset') || '')
    );
    for (const srcset of dataSrcsets) {
      for (const part of srcset.split(',')) {
        const src = part.trim().split(/\s+/)[0];
        if (src) addImage(src);
      }
    }

    // ── 4. data-* attrs on non-img elements (lazy-load containers) ───────────
    for (const attr of DATA_SRC_ATTRS) {
      const srcs = await page.$$eval(`[${attr}]:not(img)`, (els, a) =>
        els.map((el) => el.getAttribute(a) || ''), attr
      );
      for (const src of srcs) {
        if (src) addImage(src);
      }
    }

    // ── 5. CSS background-image ──────────────────────────────────────────────
    const bgUrls = await page.evaluate(() => {
      const found: string[] = [];
      document.querySelectorAll<HTMLElement>('*').forEach((el) => {
        const bg = window.getComputedStyle(el).backgroundImage;
        if (!bg || bg === 'none') return;
        const matches = bg.match(/url\(["']?([^"')]+)["']?\)/g);
        if (!matches) return;
        for (const m of matches) {
          const url = m.replace(/^url\(["']?/, '').replace(/["']?\)$/, '').trim();
          if (url) found.push(url);
        }
      });
      return found;
    });

    for (const src of bgUrls) {
      addImage(src);
    }

    logger.debug({ sourcePageUrl, total: results.length }, 'After all extraction sources');

  } catch (err) {
    logger.error({ err: (err as Error).message, sourcePageUrl }, 'extractImages threw an error');
  }

  // Only keep URLs that look like actual image files
  // For <img> tags we trust the browser; for others we check extension/pattern
  const filtered = results.filter((img) => isImageUrl(img.url));

  logger.info(
    { sourcePageUrl, raw: results.length, returned: filtered.length },
    'Images extracted'
  );

  return filtered;
}

// ─────────────────────────────────────────────────────────────────────────────

function isImageUrl(url: string): boolean {
  // Has a known image extension
  if (IMAGE_EXT_RE.test(url)) return true;

  // Looks like a CDN/image-service URL (extensionless but image-serving pattern)
  if (/[?&](format|fmt|type|f)=(jpe?g|png|webp|gif|avif|svg)/i.test(url)) return true;
  if (/\/(photos?|images?|img|media|assets?|uploads?|thumbs?|thumbnails?|pictures?|gallery|photos)\b/i.test(url)) return true;
  if (/\b(cloudinary|imgix|imagekit|fastly|cdn|akamai|shopify)\b/i.test(url)) return true;

  return false;
}

function parseFormat(url: string): string {
  const extMatch = url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i);
  if (extMatch) return extMatch[1].toLowerCase().replace('jpeg', 'jpg');

  if (/format=webp/i.test(url)) return 'webp';
  if (/format=(jpe?g|jpg)/i.test(url)) return 'jpg';
  if (/format=png/i.test(url)) return 'png';
  if (/format=gif/i.test(url)) return 'gif';

  return 'unknown';
}
