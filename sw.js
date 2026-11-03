// CEA — Service Worker (PWA)
// المبدأ: ملفات التطبيق (app shell) تُخزَّن للعمل أوفلاين بالكامل، وطلبات الـ API لا تُخزَّن أبدًا
// (المزامنة مع السيرفر تُدار داخل app.js نفسه بمنطق أوفلاين-أولاً).
// غيّر CACHE_VERSION مع كل نشر جديد ليأخذ المستخدمون آخر نسخة.

const CACHE_VERSION = 'cea-v1';
const APP_SHELL = [
  './',
  './index.html',
  './app.js', './corrections.js', './exit-guard.js',
  './style.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  // مكتبات Excel — تُخزَّن مسبقًا ليعمل التصدير/الاستيراد أوفلاين بالكامل
  './lib/xlsx.full.min.js',
  './lib/exceljs.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// كود التطبيق (HTML/JS/CSS): شبكة أولاً — عشان أي نشر جديد يوصل فورًا وما نفضلش على نسخة قديمة —
// مع الرجوع للكاش لو مفيش نت (أوفلاين). باقي الملفات (أيقونات/مكتبات): كاش أولاً للسرعة.
const CODE_FILES = /\/(index\.html|app\.js|corrections\.js|style\.css)$|\/$/;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // طلبات الـ API (أصل مختلف) والمكتبات الخارجية: شبكة مباشرة، بدون تخزين
  if (url.origin !== self.location.origin) return;

  const isCode = req.mode === 'navigate' || CODE_FILES.test(url.pathname);

  if (isCode) {
    // network-first: أحدث نسخة عند وجود نت، والكاش احتياط أوفلاين
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html'))),
    );
    return;
  }

  // أصول ثابتة (أيقونات/مكتبات): من الكاش أولاً، وتحديث في الخلفية (stale-while-revalidate)
  // ملفات lib/*.js: ما نخزّنش غير رد JS حقيقي (مش صفحة HTML/خطأ) — عشان ما نفضلش نقدّم مكتبة تالفة من الكاش
  const isLibJs = /\/lib\/.+\.js$/.test(url.pathname);
  const cacheable = (res) => {
    if (!res || !res.ok) return false;
    if (!isLibJs) return true;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    return ct.includes('javascript') || ct.includes('ecmascript');
  };
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (cacheable(res)) caches.open(CACHE_VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
