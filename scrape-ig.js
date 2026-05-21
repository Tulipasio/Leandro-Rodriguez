const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const HANDLE = 'bymoredesign';
const OUT_DIR = path.join(__dirname, 'assets', 'instagram');
const RESULTS_FILE = path.join(__dirname, 'ig-data.json');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) { resolve(dest); return; }
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    proto.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', err => {
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

(async () => {
  console.log('Abriendo navegador...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'es-ES',
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  // Capturar foto de perfil desde network
  let profileBuffer = null;
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('t51.82787-19') && !profileBuffer) {
      try {
        const buf = await response.body();
        if (buf.length > 5000) profileBuffer = buf;
      } catch {}
    }
  });

  console.log(`Navegando a instagram.com/${HANDLE}...`);
  await page.goto(`https://www.instagram.com/${HANDLE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Cerrar diálogos si aparecen
  for (const text of ['Not now', 'Ahora no', 'Close']) {
    try {
      const btn = page.getByText(text).first();
      if (await btn.isVisible({ timeout: 1500 })) await btn.click();
    } catch {}
  }

  await page.waitForTimeout(2000);

  const profile = await page.evaluate(() => {
    const getMeta = (prop) => {
      const el = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
      return el ? el.getAttribute('content') : null;
    };
    const title = getMeta('og:title') || document.title || '';
    const desc  = getMeta('og:description') || '';
    const img   = getMeta('og:image') || '';

    const followersMatch = desc.match(/([\d,.]+[KkMm]?)\s*[Ff]ollowers?/i) || desc.match(/([\d,.]+[KkMm]?)\s*[Ss]eguidores?/i);
    const followingMatch = desc.match(/([\d,.]+[KkMm]?)\s*[Ff]ollowing/i)  || desc.match(/([\d,.]+[KkMm]?)\s*[Ss]iguiendo/i);
    const postsMatch     = desc.match(/([\d,.]+[KkMm]?)\s*[Pp]osts?/i)     || desc.match(/([\d,.]+[KkMm]?)\s*[Pp]ublicaciones?/i);
    const bioMatch       = desc.match(/\d+\s*Posts?\s*[-–]\s*(.+)/)         || desc.match(/\d+\s*Publicaciones?\s*[-–]\s*(.+)/);
    const nameMatch      = title.match(/^(.+?)\s*\(@/);

    return {
      name:      nameMatch ? nameMatch[1].trim() : title,
      followers: followersMatch ? followersMatch[1] : null,
      following: followingMatch ? followingMatch[1] : null,
      posts:     postsMatch     ? postsMatch[1]     : null,
      bio:       bioMatch       ? bioMatch[1].trim() : desc,
      profileImg: img,
      rawDesc:   desc,
      rawTitle:  title,
    };
  });

  console.log('Perfil:', JSON.stringify(profile, null, 2));

  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(1200);
  }

  const postImgs = await page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const anchors = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'));
    anchors.forEach(a => {
      a.querySelectorAll('img').forEach(img => {
        const src = img.src || '';
        if (src && !seen.has(src) && src.startsWith('http') && !src.includes('150x150')) {
          seen.add(src);
          results.push({ url: src, alt: img.alt || '', href: a.href });
        }
      });
    });
    if (results.length === 0) {
      Array.from(document.querySelectorAll('img')).forEach(img => {
        const src = img.src || '';
        if (src && src.startsWith('http') && (src.includes('cdninstagram') || src.includes('fbcdn')) && !src.includes('150x150') && !seen.has(src)) {
          seen.add(src);
          results.push({ url: src, alt: img.alt || '', href: '' });
        }
      });
    }
    return results.slice(0, 12);
  });

  console.log(`\nEncontradas ${postImgs.length} imágenes de posts`);

  // Guardar foto de perfil capturada desde network
  if (profileBuffer) {
    const dest = path.join(OUT_DIR, 'profile-scraped.jpg');
    fs.writeFileSync(dest, profileBuffer);
    console.log(`Foto de perfil descargada desde red: ${profileBuffer.length} bytes`);
  } else if (profile.profileImg) {
    try {
      await download(profile.profileImg, path.join(OUT_DIR, 'profile-scraped.jpg'));
      console.log('Foto de perfil descargada desde URL');
    } catch (e) {
      console.log('No se pudo descargar foto de perfil:', e.message);
    }
  }

  const downloadedPosts = [];
  for (let i = 0; i < postImgs.length; i++) {
    const img = postImgs[i];
    const ext = img.url.includes('.png') ? 'png' : 'jpg';
    const dest = path.join(OUT_DIR, `scraped-post-${i + 1}.${ext}`);
    try {
      await download(img.url, dest);
      downloadedPosts.push({ file: `assets/instagram/scraped-post-${i + 1}.${ext}`, alt: img.alt, href: img.href });
      console.log(`  ✓ post-${i + 1}`);
    } catch (e) {
      console.log(`  ✗ post-${i + 1}: ${e.message}`);
    }
  }

  await browser.close();

  const result = { profile, posts: downloadedPosts };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(result, null, 2));

  console.log('\n=== RESULTADO ===');
  console.log(`Perfil: ${profile.name} | ${profile.followers} seguidores | ${profile.posts} posts`);
  console.log(`Posts descargados: ${downloadedPosts.length}`);
})();
