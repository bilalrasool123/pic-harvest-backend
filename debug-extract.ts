import { chromium } from 'playwright';

const TARGET = 'https://www.e-passtransfer.de/';

async function debug() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  console.log('Navigating to', TARGET);
  try {
    await page.goto(TARGET, { waitUntil: 'load', timeout: 60_000 });
    console.log('Page loaded OK');
  } catch (e) {
    console.error('goto error:', (e as Error).message);
  }

  await page.waitForTimeout(2000);

  const title = await page.title();
  console.log('Page title:', title);

  const imgCount = await page.evaluate(() => document.querySelectorAll('img').length);
  console.log('Total <img> tags:', imgCount);

  const imgSrcs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img')).slice(0, 20).map((i) => ({
      src: (i as HTMLImageElement).src,
      currentSrc: (i as HTMLImageElement).currentSrc,
      naturalW: (i as HTMLImageElement).naturalWidth,
      naturalH: (i as HTMLImageElement).naturalHeight,
    }))
  );
  console.log('\n--- Image srcs (first 20) ---');
  imgSrcs.forEach((img, i) => console.log(`[${i}]`, JSON.stringify(img)));

  const bgImages = await page.evaluate(() => {
    const results: string[] = [];
    document.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const bg = window.getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none' && bg.includes('url(')) results.push(bg);
    });
    return results.slice(0, 10);
  });
  console.log('\n--- CSS backgrounds (first 10) ---');
  bgImages.forEach((b, i) => console.log(`[${i}]`, b));

  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 200));
  console.log('\n--- Body text preview ---\n', bodyText);

  await page.screenshot({ path: 'i:\\Image-Extractor\\debug-screenshot.png', fullPage: false });
  console.log('\nScreenshot saved.');
  await browser.close();
}

debug().catch(console.error);
