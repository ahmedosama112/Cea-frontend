/* ============================================================
   بناء فهرس RAG لمشروع CEA — بيشتغل offline بالكامل
   بيقرا ملفات المشروع، يقسّمها لقطع، ويحوّل كل قطعة لمتجه معنى
   عن طريق nomic-embed-text المحلي.

   قراءة فقط — عمره ما بيكتب في أي ملف من ملفات البرنامج.
   المخرج الوحيد: local-ai/rag/index.json
   ============================================================ */

const fs   = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..', '..');
const OUT     = path.join(__dirname, 'index.json');
const API     = process.env.OLLAMA_API_BASE || 'http://127.0.0.1:11434';
const MODEL   = 'nomic-embed-text';

// الملفات اللي هتتفهرس. الوثائق مهمة زي الكود — فيها "ليه" مش "إيه" بس.
const FILES = [
  'app.js',
  'style.css',
  'sw.js',
  'dev-server.js',
  'build-pwa.js',
  'index (17).html',
  'google-sheet/Code.gs',
  'google-sheet/Code-site2.gs',
  'SYSTEM_REFERENCE.md',
  'SESSION-LOG.md',
  'CHANGELOG.md',
  'RECOVERY-PLAN.md',
  'SECURITY_REPORT.md',
  'DEPLOY-NEXT-RELEASE.md',
  'ROADMAP-INVENTORY.md',
  'MIGRATION-RAILWAY-TO-HOSTINGER.md',
  // الـ backend ريبو منفصل، لكنه نص النظام — من غيره أي سؤال عن
  // التوقيعات/الاعتمادات/المسارات بيرجّع وثائق بدل الكود.
  'backend/prisma/schema.prisma',
];

// كل ملفات TypeScript في الـ backend (51 ملف · ~5400 سطر)
function backendFiles() {
  const base = path.join(PROJECT, 'backend', 'src');
  if (!fs.existsSync(base)) return [];
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
      else if (e.name.endsWith('.ts')) {
        out.push(path.relative(PROJECT, p).split(path.sep).join('/'));
      }
    }
  })(base);
  return out.sort();
}

const MAX_LINES = 120;   // أطول قطعة؛ الأطول من كده بينقسم
const OVERLAP   = 10;    // تداخل بين القطع عشان مايتقطعش المعنى

// ---------- التقطيع ----------

function windows(out, a, b) {
  if (b - a <= MAX_LINES) { if (b > a) out.push([a, b]); return; }
  for (let s = a; s < b; s += MAX_LINES - OVERLAP) {
    out.push([s, Math.min(b, s + MAX_LINES)]);
    if (s + MAX_LINES >= b) break;
  }
}

// أنماط القطع لكل نوع ملف
const RE_JS = /^\s*(async\s+)?function\s+[A-Za-z_$]/;
// TypeScript بيستخدم أنماط أكتر: export function، دوال سهمية، كلاسات، ومسارات router
const RE_TS = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+\w|const\s+\w+\s*=\s*(?:async\s*)?[(<]|class\s+\w|router\.(?:get|post|put|patch|delete)\()/;
const RE_PRISMA = /^\s*(model|enum|datasource|generator)\s+\w/;

// نقطع عند كل تعريف على المستوى الأعلى
function chunkCode(lines, re) {
  const starts = [];
  lines.forEach((l, i) => { if (re.test(l)) starts.push(i); });
  const out = [];
  windows(out, 0, starts.length ? starts[0] : lines.length);
  for (let k = 0; k < starts.length; k++) {
    windows(out, starts[k], k + 1 < starts.length ? starts[k + 1] : lines.length);
  }
  return out;
}

// Markdown: نقطع عند العناوين
function chunkMd(lines) {
  const starts = [];
  lines.forEach((l, i) => { if (/^#{1,4}\s/.test(l)) starts.push(i); });
  const out = [];
  windows(out, 0, starts.length ? starts[0] : lines.length);
  for (let k = 0; k < starts.length; k++) {
    windows(out, starts[k], k + 1 < starts.length ? starts[k + 1] : lines.length);
  }
  return out;
}

// CSS / HTML: نوافذ ثابتة
function chunkFlat(lines) {
  const out = [];
  windows(out, 0, lines.length);
  return out;
}

/* عنوان وصفي لكل قطعة.
   من غيره، قطعة كود خام مابتشبهش سؤال بلغة طبيعية فمابتطلعش في النتايج أبدًا.
   العنوان بيدّي القطعة "هوية" الموديل يقدر يطابقها. */
function labelFor(rel, lines, a, ext) {
  const l = lines[a] || '';
  if (ext === '.md') {
    const m = l.match(/^#{1,4}\s+(.*)/);
    return m ? rel + ' — ' + m[1].trim() : rel;
  }
  if (ext === '.prisma') {
    const m = l.match(/^\s*(model|enum|datasource|generator)\s+(\w+)/);
    return m ? rel + ' — ' + m[1] + ' ' + m[2] : rel;
  }
  // كود: اسم الدالة/الكلاس/المسار
  let m = l.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
  if (m) return rel + ' — function ' + m[1];
  m = l.match(/^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/);
  if (m) return rel + ' — ' + m[1];
  m = l.match(/^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/);
  if (m) return rel + ' — class ' + m[1];
  m = l.match(/^\s*router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)/);
  if (m) return rel + ' — ' + m[1].toUpperCase() + ' ' + m[2];
  return rel;
}

function chunkFile(rel) {
  const abs = path.join(PROJECT, rel);
  if (!fs.existsSync(abs)) return [];
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  const ext   = path.extname(rel).toLowerCase();

  let ranges;
  if (ext === '.js' || ext === '.gs')  ranges = chunkCode(lines, RE_JS);
  else if (ext === '.ts')              ranges = chunkCode(lines, RE_TS);
  else if (ext === '.prisma')          ranges = chunkCode(lines, RE_PRISMA);
  else if (ext === '.md')              ranges = chunkMd(lines);
  else                                 ranges = chunkFlat(lines);

  return ranges
    .map(([a, b]) => ({
      file:  rel,
      from:  a + 1,
      to:    b,
      label: labelFor(rel, lines, a, ext),
      text:  lines.slice(a, b).join('\n'),
    }))
    .filter(c => c.text.trim().length > 40);   // نتجاهل القطع الفاضية
}

/* nomic-embed-text مُدرَّب على بادئات مهمة. من غير "search_document:"
   عند الفهرسة و"search_query:" عند السؤال، جودة الاسترجاع بتقل بوضوح.
   دي مش تفصيلة — دي شرط تشغيل الموديل صح. */
const docText = c => 'search_document: ' + c.label + '\n' + c.text;

// ---------- التضمين ----------

async function embed(texts) {
  // الـ API الحديث بياخد دفعة كاملة
  try {
    const r = await fetch(API + '/api/embed', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: MODEL, input: texts }),
    });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j.embeddings) && j.embeddings.length === texts.length) return j.embeddings;
    }
  } catch (_) { /* نجرب القديم */ }

  // الـ API القديم: واحد واحد
  const out = [];
  for (const t of texts) {
    const r = await fetch(API + '/api/embeddings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: MODEL, prompt: t }),
    });
    if (!r.ok) throw new Error('فشل التضمين: ' + r.status + ' ' + await r.text());
    out.push((await r.json()).embedding);
  }
  return out;
}

// نطبّع المتجه عشان التشابه يبقى ضرب نقطي بسيط
function normalize(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map(x => +(x / n).toFixed(5));
}

// ---------- التشغيل ----------

(async () => {
  // نتأكد إن الخادم شغال
  try { await fetch(API + '/api/tags'); }
  catch { console.error('خادم Ollama مش شغال على ' + API + '\nشغّله: E:\\llm\\ollama\\ollama.exe serve'); process.exit(1); }

  const chunks = [];
  for (const rel of FILES) {
    const c = chunkFile(rel);
    if (c.length) console.log(String(c.length).padStart(4) + '  قطعة من  ' + rel);
    else          console.log('   -  متخطّى (مش موجود)  ' + rel);
    chunks.push(...c);
  }

  // الـ backend (ملفات كتير، نلخّص العد بدل ما نطبع 51 سطر)
  const be = backendFiles();
  let beChunks = 0;
  for (const rel of be) { const c = chunkFile(rel); beChunks += c.length; chunks.push(...c); }
  if (be.length) console.log(String(beChunks).padStart(4) + '  قطعة من  backend/src/**/*.ts  (' + be.length + ' ملف)');
  else           console.log('   -  متخطّى: backend/src مش موجود');
  if (!chunks.length) { console.error('مفيش أي قطع - اتأكد من مسار المشروع'); process.exit(1); }

  console.log('\nالإجمالي: ' + chunks.length + ' قطعة. بيحوّلها لمتجهات...\n');

  const BATCH = 16;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const vecs  = await embed(slice.map(docText));
    slice.forEach((c, k) => { c.vec = normalize(vecs[k]); });
    const done = Math.min(i + BATCH, chunks.length);
    process.stdout.write('\r  ' + done + ' / ' + chunks.length +
                         '  (' + Math.round(100 * done / chunks.length) + '%)   ');
  }

  /* بصمة كل ملف وقت الفهرسة. الكود بيتغيّر، والفهرس بيقدم من غير ما حد ياخد باله —
     وساعتها أرقام السطور اللي بيرجّعها بتبقى غلط. الكشف بيحصل عند السؤال. */
  const stamp = {};
  for (const rel of [...FILES, ...be]) {
    const abs = path.join(PROJECT, rel);
    if (fs.existsSync(abs)) {
      const st = fs.statSync(abs);
      stamp[rel] = { size: st.size, mtime: Math.floor(st.mtimeMs) };
    }
  }

  fs.writeFileSync(OUT, JSON.stringify({
    version: 3,          // 3 = + بصمات الملفات لكشف القِدم
    model: MODEL,
    dim:   chunks[0].vec.length,
    files: FILES,
    stamp,
    chunks,
  }));

  const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
  console.log('\n\nتمام. الفهرس: ' + OUT + '  (' + mb + ' MB)');
  console.log('اسأل بـ:  local-ai\\rag.ps1 "سؤالك هنا"');
})().catch(e => { console.error('\nخطأ: ' + e.message); process.exit(1); });
