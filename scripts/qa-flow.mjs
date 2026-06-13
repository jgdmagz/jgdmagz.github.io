import puppeteer from 'puppeteer-core';

const base = process.argv[2] ?? 'http://localhost:4323';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 980, deviceScaleFactor: 2 });
const shot = (n) => page.screenshot({ path: `/tmp/sf-shots/flow-${n}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${base}/app/preview/?view=flow`, { waitUntil: 'networkidle0' });
await sleep(1200);

// Switch to Regular → shows ring + cycle dots + settings
const segs = await page.$$('.flow-head-actions .segment');
await segs[0].click();
await sleep(900);
await shot('regular-idle');

// Start it running → blob speeds up, ring fills, mode locks
await page.click('.flow-start');
await sleep(1600);
await shot('regular-running');

// Endless running with a couple of laps
await page.click('.flow-controls .danger-text'); // end session
await sleep(500);
const segs2 = await page.$$('.flow-head-actions .segment');
await segs2[1].click(); // Endless
await sleep(500);
await page.click('.flow-start');
await sleep(1200);
const lapBtns = await page.$$('.flow-controls .btn-quiet');
for (const b of lapBtns) {
  const txt = await page.evaluate((el) => el.textContent, b);
  if (txt.includes('Lap')) { await b.click(); await sleep(700); await b.click(); break; }
}
await sleep(600);
await shot('endless-running');

await browser.close();
console.log('flow qa done');
