// سيرفر تطوير للواجهة مع Live Reload:
// يخدم ملفات المشروع (index.html / app.js / style.css) ويعيد تحميل المتصفح تلقائيًا
// بمجرد حفظ أي تعديل — للتطوير المحلي فقط، ليس للنشر.
//
// التشغيل:  node dev-server.js   →  http://localhost:5173

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 5173;
const ENTRY = 'index (17).html';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

// عملاء SSE (المتصفحات المفتوحة) — نبعت لهم إشارة إعادة تحميل عند أي تغيير
const clients = new Set();
const RELOAD_SNIPPET = `
<script>
(function(){
  try{
    var es=new EventSource('/__reload');
    es.onmessage=function(e){ if(e.data==='reload') location.reload(); };
  }catch(e){}
})();
</script>`;

http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch (e) { res.writeHead(400); return res.end('bad request'); }
  if (urlPath.includes('\0')) { res.writeHead(400); return res.end('bad request'); }

  // قناة تشخيص: حفظ ملف مبني في المتصفح على القرص لفحصه (تطوير محلي فقط)
  if (urlPath === '/__save' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const out = path.join(ROOT, 'debug-out.xlsx');
      fs.writeFileSync(out, Buffer.concat(chunks));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: out, bytes: Buffer.concat(chunks).length }));
    });
    return;
  }

  if (urlPath === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('data: connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  const rel = urlPath === '/' ? ENTRY : urlPath.replace(/^[/\\]+/, '');
  const filePath = path.resolve(ROOT, rel);
  const rootRelative = path.relative(ROOT, filePath);
  if (rootRelative.startsWith('..' + path.sep) || path.isAbsolute(rootRelative)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  const normalizedPath = '/' + rootRelative.split(path.sep).join('/');

  // (L9) ملفات حساسة ممنوع السيرفر المحلي يقدّمها حتى بالغلط (env/باك اب/سورس السيرفر)
  if (/^\/(backend|backups|google-sheet|\.claude|\.wrangler|\.git)(\/|$)/i.test(normalizedPath) || /(^|\/)\.env(?:\.|$)/i.test(normalizedPath) || /\.(bak|sql|tgz)$/i.test(normalizedPath) || /CEA_backup|db-backup|dump/i.test(normalizedPath)) {
    res.writeHead(403); return res.end('forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (ext === '.html') {
      // حقن سكربت إعادة التحميل قبل نهاية الصفحة (في الذاكرة فقط — الملف الأصلي لا يتغير)
      const html = data.toString('utf8').replace(/<\/body>/i, RELOAD_SNIPPET + '</body>');
      res.end(html);
    } else {
      res.end(data);
    }
  });
// (L9) الاستماع على 127.0.0.1 فقط — مش على كل واجهات الشبكة (كان أي جهاز على نفس الشبكة يوصله)
}).listen(PORT, '127.0.0.1', () => console.log(`CEA dev server → http://localhost:${PORT}  (live reload on)`));

// مراقبة ملفات الواجهة — أي حفظ يبعت reload لكل المتصفحات المفتوحة
let debounce = null;
const WATCH = [ENTRY, 'app.js', 'style.css'];
for (const f of WATCH) {
  fs.watchFile(path.join(ROOT, f), { interval: 400 }, () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      for (const c of clients) c.write('data: reload\n\n');
      console.log(`[reload] ${f} changed → ${clients.size} client(s)`);
    }, 150);
  });
}
