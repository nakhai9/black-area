// Dev helper: node scripts/screenshot.mjs <url> <out.png> [width] [height]
import puppeteer from 'puppeteer-core';

const [url, out, w = '1600', h = '900'] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: Number(w), height: Number(h) });
page.on('console', (m) => console.log(`[console.${m.type()}] ${m.text()} ${m.location()?.url ?? ''}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !document.getElementById('loading'), { timeout: 60000 }).catch(() => console.log('still loading after 60s'));
console.log(`ready in ${Date.now() - t0} ms`);
await new Promise((r) => setTimeout(r, 1500));
console.log('status:', await page.$eval('#status', (e) => e.textContent));
console.log('credits:', await page.$eval('.sb-credits', (e) => e.textContent));
await page.screenshot({ path: out });
await browser.close();
