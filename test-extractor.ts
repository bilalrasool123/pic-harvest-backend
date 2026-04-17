// Quick test: run the extractor directly against the target URL
import { chromium } from 'playwright';
import { extractImages } from './src/services/extractor.service';

async function main() {
  const url = 'https://www.e-passtransfer.de/';
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  console.log('Navigating...');
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);

  console.log('Extracting images...');
  const images = await extractImages(page, url);

  console.log(`\n✅ Found ${images.length} images:\n`);
  for (const img of images) {
    console.log(`  [${img.format.toUpperCase()}] ${img.url}`);
    if (img.width) console.log(`       ${img.width}×${img.height}`);
  }

  await browser.close();
}

main().catch(console.error);
