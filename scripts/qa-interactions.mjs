// Interaction QA for the web app demo — opens the quick-plan menu, the
// event sheet and a course detail, screenshotting each.
import puppeteer from 'puppeteer-core';

const base = process.argv[2] ?? 'http://localhost:4322';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 2 });
const shot = (name) => page.screenshot({ path: `/tmp/sf-shots/qa-${name}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Quick-plan menu on a free slot
await page.goto(`${base}/app/preview/?view=today`, { waitUntil: 'networkidle0' });
await sleep(1000);
await page.click('.wt-gap:not(.past)');
await sleep(400);
await shot('gap-menu');

// 2. Event sheet
await page.keyboard.press('Escape');
await sleep(300);
await page.click('.head-add');
await sleep(500);
await shot('event-sheet');
await page.keyboard.press('Escape');
await sleep(300);

// 3. Course detail
await page.goto(`${base}/app/preview/?view=courses`, { waitUntil: 'networkidle0' });
await sleep(800);
await page.click('.course-card');
await sleep(700);
await shot('course-detail');

// 4. Course editor
await page.click('.detail-bar .icon-btn:nth-of-type(2)');
await sleep(500);
await shot('course-editor');

await browser.close();
console.log('qa done');
