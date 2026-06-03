const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const brands = [
  { slug: 'blas.cba',        file: 'brand-blas.jpg' },
  { slug: 'psymania.ar',     file: 'brand-psymania.jpg' },
  { slug: 'harvard_bebidas', file: 'brand-harvard.jpg' },
  { slug: 'adixon_cba',      file: 'brand-adixon.jpg' },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  });
}

(async () => {
  const outDir = path.join(__dirname, 'assets', 'instagram');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  for (const brand of brands) {
    const url = `https://www.instagram.com/${brand.slug}/`;
    const dest = path.join(outDir, brand.file);
    console.log(`Scraping ${url}...`);
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      const imgUrl = await page.evaluate(() => {
        const og = document.querySelector('meta[property="og:image"]');
        return og ? og.content : null;
      });

      if (imgUrl) {
        console.log(`  Found og:image: ${imgUrl.substring(0, 80)}...`);
        await download(imgUrl, dest);
        console.log(`  Saved → ${brand.file}`);
      } else {
        console.log(`  No og:image found for ${brand.slug}`);
      }
      await page.close();
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  await browser.close();
  console.log('\nDone!');
})();
