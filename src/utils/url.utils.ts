import { URL } from 'url';
import { Page } from 'playwright';

/**
 * Normalize a URL: remove hash, trailing slash, decode.
 */
export function normalizeUrl(raw: string, base?: string): string | null {
  try {
    const u = new URL(raw, base);
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Check if two URLs share the same hostname.
 */
export function isSameDomain(a: string, b: string): boolean {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}

/**
 * Extract all same-domain hrefs from a Playwright page.
 */
export async function getAllLinks(page: Page, baseUrl: string): Promise<string[]> {
  const baseHostname = new URL(baseUrl).hostname;

  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map((a) => (a as HTMLAnchorElement).href)
  );

  const links: string[] = [];
  for (const href of hrefs) {
    const normalized = normalizeUrl(href);
    if (
      normalized &&
      !normalized.startsWith('mailto:') &&
      !normalized.startsWith('tel:') &&
      !normalized.startsWith('javascript:')
    ) {
      try {
        if (new URL(normalized).hostname === baseHostname) {
          links.push(normalized);
        }
      } catch {
        // skip
      }
    }
  }

  return [...new Set(links)];
}
