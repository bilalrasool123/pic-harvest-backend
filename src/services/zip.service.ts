import JSZip from 'jszip';
import fetch from 'node-fetch';
import { logger } from '../utils/logger';

interface ZipEntry {
  url: string;
  filename?: string;
}

export async function generateZip(entries: ZipEntry[]): Promise<Buffer> {
  const zip = new JSZip();
  const folder = zip.folder('picharvest-images')!;

  const usedNames = new Set<string>();

  const results = await Promise.allSettled(
    entries.map(async (entry, index) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15_000);

        const response = await fetch(entry.url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; PicHarvest/1.0; +https://picharvest.app)',
            Referer: new URL(entry.url).origin,
          },
          redirect: 'follow',
          signal: controller.signal as any,
        });
        clearTimeout(timer);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${entry.url}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const ext = resolveExtension(entry.url, response.headers.get('content-type'));
        const baseName = entry.filename ?? `image-${String(index + 1).padStart(4, '0')}`;
        const fileName = uniqueName(`${baseName}.${ext}`, usedNames);

        folder.file(fileName, buffer);
        return { fileName, size: buffer.length };
      } catch (err) {
        logger.warn({ url: entry.url, err: (err as Error).message }, 'ZIP: failed to fetch image');
        return null;
      }
    })
  );

  const successful = results.filter(
    (r) => r.status === 'fulfilled' && r.value !== null
  ).length;

  logger.info({ successful, total: entries.length }, 'ZIP generation complete');

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  }) as Promise<Buffer>;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function resolveExtension(url: string, contentType: string | null): string {
  // Try URL path first
  const m = url.split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/);
  if (m) return m[1].toLowerCase();

  // Fall back to Content-Type
  const typeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
    'image/bmp': 'bmp',
    'image/tiff': 'tif',
    'image/x-icon': 'ico',
  };
  if (contentType) {
    for (const [mime, ext] of Object.entries(typeMap)) {
      if (contentType.startsWith(mime)) return ext;
    }
  }

  return 'jpg';
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const [base, ext] = name.includes('.')
    ? [name.slice(0, name.lastIndexOf('.')), name.slice(name.lastIndexOf('.'))]
    : [name, ''];
  let i = 1;
  let candidate = `${base}-${i}${ext}`;
  while (used.has(candidate)) {
    i++;
    candidate = `${base}-${i}${ext}`;
  }
  used.add(candidate);
  return candidate;
}
