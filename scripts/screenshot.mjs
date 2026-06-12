// Screenshot helper for visual QA — drives the installed Chrome via
// puppeteer-core (no bundled browser). Usage:
//   node scripts/screenshot.mjs <url> <out.png> [width] [height] [fullPage]
import puppeteer from 'puppeteer-core';

const [url, out, w = '1440', h = '980', fullPage] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node scripts/screenshot.mjs <url> <out.png> [w] [h] [full]');
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
});
const page = await browser.newPage();
await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200)); // let entrance animations settle
await page.screenshot({ path: out, fullPage: fullPage === 'full' });
await browser.close();
console.log('saved', out);
