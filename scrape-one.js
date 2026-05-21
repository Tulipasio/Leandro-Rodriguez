const { chromium } = require('playwright');
const https = require('https');
const fs = require('fs');
const path = require('path');

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return downloadImage(res.headers.location, filepath).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => { fs.unlink(filepath, () => {}); reject(err); });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  await page.goto('https://www.instagram.com/reel/DUElEUGEfOc/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  const ogImage = await page.$eval('meta[property="og:image"]', el => el.content).catch(() => null);
  if (ogImage) {
    const outPath = path.join(__dirname, 'proyecto-leandro', 'assets', 'instagram', 'portfolio-1.jpg');
    await downloadImage(ogImage, outPath);
    console.log('OK: portfolio-1.jpg guardado');
  } else {
    console.log('ERROR: no og:image encontrado');
  }
  await browser.close();
})();
