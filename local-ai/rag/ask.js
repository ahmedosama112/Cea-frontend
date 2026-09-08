/* ============================================================
   البحث في فهرس RAG — واختياريًا يخلّي الموديل المحلي يجاوب

   الاستخدام:
     node ask.js "فين الكود اللي بيحسب متوسط المقاول؟"
     node ask.js --answer "ليه المزامنة بتطلب /api/records؟"
     node ask.js --k 8 "توقيعات المديرين"

   قراءة فقط. بيكتب في scratch/_rag.md بس (سياق جاهز تديه لـ aider).
   ============================================================ */

const fs   = require('fs');
const path = require('path');

const IDX     = path.join(__dirname, 'index.json');
const SCRATCH = path.join(__dirname, '..', 'scratch');
const API     = process.env.OLLAMA_API_BASE || 'http://127.0.0.1:11434';
const CHAT    = 'qwen2.5-coder:7b';

// ---------- قراءة الأوامر ----------
const argv = process.argv.slice(2);
let k = 5, answer = false;
const words = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--answer' || argv[i] === '-a') answer = true;
  else if (argv[i] === '--k') k = parseInt(argv[++i], 10) || 5;
  else words.push(argv[i]);
}
const query = words.join(' ').trim();

if (!query) { console.error('اكتب سؤالك:  node ask.js "السؤال"'); process.exit(1); }
if (!fs.existsSync(IDX)) { console.error('مفيش فهرس. ابنيه الأول:  local-ai\\rag.ps1 -Build'); process.exit(1); }

const index = JSON.parse(fs.readFileSync(IDX, 'utf8'));
if ((index.version || 1) < 2) {
  console.error('الفهرس قديم (بلا عناوين/بادئات) — النتايج هتبقى ضعيفة.');
  console.error('أعد بناءه:  local-ai\\rag.ps1 -Build');
  process.exit(1);
}

/* كشف القِدم: لو ملف اتغير بعد الفهرسة، أرقام السطور اللي هترجع هتبقى غلط.
   ده بيحصل فعلاً — الكود بيتعدّل والفهرس بيفضل زي ما هو. */
if (index.stamp) {
  const PROJECT = path.resolve(__dirname, '..', '..');
  const stale = [];
  for (const [rel, s] of Object.entries(index.stamp)) {
    const abs = path.join(PROJECT, rel);
    if (!fs.existsSync(abs)) { stale.push(rel + ' (اتمسح)'); continue; }
    const st = fs.statSync(abs);
    if (st.size !== s.size || Math.floor(st.mtimeMs) !== s.mtime) stale.push(rel);
  }
  if (stale.length) {
    console.error('\n!  ' + stale.length + ' ملف اتغير بعد آخر فهرسة — أرقام السطور ممكن تبقى غلط:');
    stale.slice(0, 6).forEach(f => console.error('     ' + f));
    if (stale.length > 6) console.error('     ... و' + (stale.length - 6) + ' غيرهم');
    console.error('   حدّث الفهرس:  local-ai\\rag.ps1 -Build\n');
  }
}

/* بحث هجين: المتجهات بتمسك المعنى، والكلمات بتمسك الأسماء الحرفية.
   لوحدها المتجهات بتفشل في "فين الدالة اسمها كذا"، ولوحدها الكلمات
   بتفشل في "الكود اللي بيعمل كذا". الاتنين مع بعض بيغطوا الحالتين. */
const splitWords = s => s.toLowerCase().split(/[^\p{L}\p{N}_$]+/u).filter(w => w.length >= 3);
let qWords = splitWords(query);

function kwScore(c) {
  if (!qWords.length) return 0;
  const hay = (c.label + '\n' + c.text).toLowerCase();
  let hit = 0;
  for (const w of qWords) if (hay.includes(w)) hit++;
  return hit / qWords.length;
}

// ---------- تضمين السؤال ----------
async function embedOne(text) {
  try {
    const r = await fetch(API + '/api/embed', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: index.model, input: [text] }),
    });
    if (r.ok) { const j = await r.json(); if (j.embeddings) return j.embeddings[0]; }
  } catch (_) { /* fallback */ }
  const r = await fetch(API + '/api/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: index.model, prompt: text }),
  });
  if (!r.ok) throw new Error('فشل التضمين: ' + r.status);
  return (await r.json()).embedding;
}

function normalize(v) {
  let n = 0; for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map(x => x / n);
}

(async () => {
  try { await fetch(API + '/api/tags'); }
  catch { console.error('خادم Ollama مش شغال على ' + API); process.exit(1); }

  /* nomic-embed-text موديل إنجليزي: سؤال عربي عن كود إنجليزي بيفشل تمامًا.
     قِيس فعليًا على الفهرس ده — نفس السؤال عن signStamp.ts:
        بالإنجليزي -> ترتيب 1 من 1109
        بالعربي    -> ترتيب 216 من 1109
     فبنترجم السؤال محليًا وندوّر بالاتنين، وناخد الأعلى لكل قطعة:
     العربي بيمسك الوثائق العربية، والإنجليزي بيمسك الكود. */
  const hasArabic = /[؀-ۿ]/.test(query);
  let queryEn = null;

  if (hasArabic) {
    process.stdout.write('بيترجم السؤال للبحث في الكود... ');
    try {
      const r = await fetch(API + '/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5-coder:3b',   // الصغير كفاية للترجمة وأسرع
          prompt: 'Translate this Arabic software question into short English technical keywords. ' +
                  'Output ONLY the keywords, no explanation.\n\n' + query + '\n\nKeywords:',
          stream: false,
          options: { num_ctx: 2048, temperature: 0 },
        }),
      });
      if (r.ok) {
        queryEn = ((await r.json()).response || '').trim().split('\n')[0].slice(0, 200);
        console.log('"' + queryEn + '"');
        // الكلمات الإنجليزية كمان تدخل التطابق الحرفي — أسماء الدوال بتتلقط منها
        qWords = qWords.concat(splitWords(queryEn));
      } else { console.log('(فشلت - هكمّل بالعربي بس)'); }
    } catch { console.log('(فشلت - هكمّل بالعربي بس)'); }
  }

  // البادئة دي شرط في nomic-embed-text — من غيرها الاسترجاع بيضعف
  const qv  = normalize(await embedOne('search_query: ' + query));
  const qv2 = queryEn ? normalize(await embedOne('search_query: ' + queryEn)) : null;

  // تشابه جيب التمام = ضرب نقطي (المتجهات كلها مطبّعة)، + وزن الكلمات
  const scored = index.chunks.map(c => {
    let v = 0;
    for (let i = 0; i < qv.length; i++) v += qv[i] * c.vec[i];
    if (qv2) {
      let v2 = 0;
      for (let i = 0; i < qv2.length; i++) v2 += qv2[i] * c.vec[i];
      if (v2 > v) v = v2;          // الأعلى من اللغتين
    }
    const kw = kwScore(c);
    return { c, v, kw, s: 0.65 * v + 0.35 * kw };
  }).sort((a, b) => b.s - a.s).slice(0, k);

  // ---------- العرض ----------
  console.log('\nالسؤال: ' + query + '\n');
  console.log('أقرب ' + scored.length + ' قطعة:\n');
  scored.forEach(({ c, v, kw, s }, i) => {
    console.log('  ' + (i + 1) + '. ' + c.label);
    console.log('     ' + c.file + ':' + c.from + '-' + c.to +
                '   [مجموع ' + s.toFixed(3) + ' · معنى ' + v.toFixed(3) +
                ' · كلمات ' + kw.toFixed(2) + ']');
  });

  // ---------- ملف السياق لـ aider ----------
  if (!fs.existsSync(SCRATCH)) fs.mkdirSync(SCRATCH, { recursive: true });
  const ctxFile = path.join(SCRATCH, '_rag.md');
  const ctx = scored.map(({ c }) =>
    '### ' + c.label + '  (' + c.file + ' سطور ' + c.from + '-' + c.to + ')\n```\n' + c.text + '\n```'
  ).join('\n\n');
  fs.writeFileSync(ctxFile, '# سياق مسترجع لسؤال: ' + query + '\n\n' + ctx + '\n');

  const tok = Math.round(ctx.length / 3.2);
  console.log('\nالسياق اتكتب في: local-ai\\scratch\\_rag.md  (~' + tok + ' توكن)');

  if (!answer) {
    console.log('عشان الموديل يجاوب من السياق ده:  أضف --answer');
    return;
  }

  // ---------- الإجابة من الموديل المحلي ----------
  if (tok > 6000) {
    console.log('\n!  السياق كبير (~' + tok + ' توكن) — جرّب --k أقل.');
  }
  console.log('\n--- إجابة الموديل المحلي (' + CHAT + ') ---\n');

  const prompt =
    'أنت مساعد على مشروع CEA: تطبيق PWA بـ vanilla JS، بلا frameworks.\n' +
    'جاوب من المقاطع دي بس. لو الإجابة مش فيها، قول "مش موجود في السياق".\n' +
    'اذكر اسم الملف ورقم السطر في إجابتك.\n\n' +
    ctx + '\n\nالسؤال: ' + query + '\n\nالإجابة:';

  const r = await fetch(API + '/api/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHAT, prompt, stream: true,
      options: { num_ctx: 8192, temperature: 0.2 },
    }),
  });
  if (!r.ok) throw new Error('فشل التوليد: ' + r.status + ' ' + await r.text());

  // بث الرد كلمة كلمة عشان متستناش الرد كامل
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        if (j.response) process.stdout.write(j.response);
        if (j.done) {
          const secs = (j.total_duration || 0) / 1e9;
          const toks = j.eval_count || 0;
          console.log('\n\n--- ' + toks + ' كلمة في ' + secs.toFixed(1) + ' ثانية' +
                      (secs > 0 ? '  (' + (toks / secs).toFixed(1) + ' كلمة/ث)' : '') + ' ---');
        }
      } catch (_) { /* سطر ناقص */ }
    }
  }
})().catch(e => { console.error('\nخطأ: ' + e.message); process.exit(1); });
