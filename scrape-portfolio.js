const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const posts = [
  { url: 'https://www.instagram.com/reel/DUElEUGEfOc/', file: 'portfolio-1.jpg' },
  { url: 'https://www.instagram.com/reel/DIOx-k8RAJd/', file: 'portfolio-2.jpg' },
  { url: 'https://www.instagram.com/p/DIUQRrER12j/',   file: 'portfolio-3.jpg' },
];

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);
    protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
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

  const outDir = path.join(__dirname, 'proyecto-leandro', 'assets', 'instagram');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const post of posts) {
    const page = await context.newPage();
    try {
      console.log(`Scraping: ${post.url}`);
      await page.goto(post.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      const ogImage = await page.$eval('meta[property="og:image"]', el => el.content).catch(() => null);

      if (ogImage) {
        console.log(`  og:image encontrado`);
        const outPath = path.join(outDir, post.file);
        await downloadImage(ogImage, outPath);
        console.log(`  Guardado: ${post.file}`);
      } else {
        console.log(`  No se encontró og:image, tomando screenshot`);
        const outPath = path.join(outDir, post.file);
        await page.screenshot({ path: outPath, fullPage: false });
        console.log(`  Screenshot guardado: ${post.file}`);
      }
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }
    await page.close();
  }

  await browser.close();
  console.log('Listo!');
})();
