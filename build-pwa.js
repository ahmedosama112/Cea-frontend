// يبني نسخة النشر للـ PWA في pwa-dist/ من ملفات المشروع كما هي (بدون تعديل الأصل):
// - index (17).html  →  index.html
// - app.js, style.css, sw.js, manifest.webmanifest, icons/
// - يزود رقم إصدار الكاش في sw.js تلقائيًا مع كل بناء (عشان المستخدمين ياخدوا آخر نسخة)
// التشغيل: node build-pwa.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'pwa-dist');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });

const copy = (from, to) => fs.copyFileSync(path.join(ROOT, from), path.join(OUT, to || from));

copy('index (17).html', 'index.html');
copy('app.js');
copy('style.css');
copy('manifest.webmanifest');
for (const f of fs.readdirSync(path.join(ROOT, 'icons'))) copy(path.join('icons', f));

// إصدار كاش فريد لكل بناء
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').replace(/const CACHE_VERSION = '[^']*'/, `const CACHE_VERSION = 'cea-${stamp}'`);
fs.writeFileSync(path.join(OUT, 'sw.js'), sw);

// ملفات المكتبات (Excel) — لو موجودة في lib/ تُنسخ، وإلا التصدير هيحمّلها من CDN عند الحاجة (شوف app.js)
if (fs.existsSync(path.join(ROOT, 'lib'))) {
  fs.mkdirSync(path.join(OUT, 'lib'), { recursive: true });
  for (const f of ['xlsx.full.min.js', 'exceljs.min.js']) {
    if (fs.existsSync(path.join(ROOT, 'lib', f))) copy(path.join('lib', f));
  }
}

// Cloudflare Pages: هيدرز أمان + منع كاش المتصفح لـ sw.js
// (M1) CSP: شبكة الأمان ضد XSS — حتى لو كود ضار اتحقن، connect-src بيمنعه يبعت التوكنات لأي سيرفر غريب.
// 'unsafe-inline' في script-src مطلوب حاليًا (مئات onclick المضمّنة في الواجهة) — يتشال لو الواجهة اتحولت لـ event listeners.
const CSP = [
  "default-src 'self'",
  "connect-src 'self' https://cea-backend-production-5cbe.up.railway.app",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  // 'unsafe-eval' مطلوب لمكتبة ExcelJS 4.3 (بتعمل eval عند التحميل — regenerator-runtime): من غيره التصدير المعتمد
  // وإرسال الكشف بيفشلوا بـ "ExcelJS is not defined" (حصل فعليًا بعد نشر 3 سبتمبر 2026). يتشال لو المكتبة اتبدلت بنسخة بدون eval.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');
fs.writeFileSync(path.join(OUT, '_headers'),
`/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: ${CSP}
/sw.js
  Cache-Control: no-cache
`);

console.log(`pwa-dist/ built (cache version cea-${stamp})`);
console.log(fs.readdirSync(OUT).join(', '));
