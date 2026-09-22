// ── HTML escaping helpers ──
// أي نص جاي من المستخدم (اسم مقاول / مكان / ملاحظة) لازم يتعمله esc() قبل ما يتحط في innerHTML
// عشان علامات زي < أو " متكسرش الشكل أو تنفّذ كود بالغلط.
function esc(v){
  return String(v==null?'':v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// لتمرير نص كوسيط داخل onclick="fn('...')" بأمان تام
// encodeURIComponent مش بتشفّر ' ( ) * ! ~ — و' بتكسر السترنج وتسمح بحقن كود. نشفّرهم يدويًا.
function jsArg(v){ return "decodeURIComponent('"+encodeURIComponent(String(v==null?'':v)).replace(/['()*!~]/g,c=>'%'+c.charCodeAt(0).toString(16))+"')"; }

// ── Modern UTF-8 Base64 Helpers (Full Arabic & Emoji support) ──
function bytesToBase64(uint8Arr) {
  let binary = '';
  const len = uint8Arr.byteLength;
  const chunkSize = 0x8000; // 32KB chunks
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, uint8Arr.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function utf8ToBase64(str) {
  const encoder = new TextEncoder();
  return bytesToBase64(encoder.encode(str));
}

function base64ToUtf8(b64) {
  const bytes = base64ToBytes(b64);
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(bytes);
}

// === Lazy library loader (extracted from inline bundles: xlsx.full.min.js + exceljs.min.js) ===
// هذا الجزء بيقلل حجم الملف الأساسي جداً؛ المكتبتين بيتم تحميلهم فقط لما فعلياً يتحمل تصدير/استيراد إكسل
// ملاحظة مهمة: onload بيتنفذ حتى لو الملف اللي وصل مش JS سليم (نسخة مقطوعة/تالفة في كاش الـ service worker،
// أو صفحة HTML بدل الملف) — ساعتها المكتبة "اتحملت" بس الـ global (ExcelJS/XLSX) مش موجود.
// فبنتحقق من الـ global بعد التحميل، ولو مش موجود بنشيل الوسم ونجرب المصدر اللي بعده.
const _lazyScriptPromises={};
function _loadScriptOnce(src, globalName){
  if(_lazyScriptPromises[src]) return _lazyScriptPromises[src];
  _lazyScriptPromises[src]=new Promise((resolve, reject)=>{
    const s=document.createElement('script');
    s.src=src;
    s.dataset.lazylib=src;
    s.onload=()=>{
      if(!globalName || window[globalName]) { resolve(); return; }
      s.remove(); delete _lazyScriptPromises[src];
      reject(new Error('المكتبة اتحملت لكن تالفة: '+src));
    };
    s.onerror=()=>{ s.remove(); delete _lazyScriptPromises[src]; reject(new Error('فشل تحميل المكتبة: '+src)); };
    document.head.appendChild(s);
  });
  return _lazyScriptPromises[src];
}
// الترتيب: المحلية (lib/) → نفس المحلية بمعامل عشوائي (بيتخطى كاش الـ service worker لو النسخة المخزنة تالفة) → CDN
function _loadLib(localSrc, cdnSrc, globalName){
  return _loadScriptOnce(localSrc, globalName)
    .catch(()=>_loadScriptOnce(localSrc+'?r='+Date.now(), globalName))
    .catch(()=>_loadScriptOnce(cdnSrc, globalName))
    .catch(e=>{
      const msg='⚠ تعذر تحميل مكتبة الإكسيل ('+globalName+') — جرّب تحديث الصفحة أو تأكد من النت. '+e.message;
      try{ showToast(msg, true); }catch(_){}
      throw new Error(msg);
    });
}
let _xlsxLoadPromise=null;
function ensureXLSX(){
  if(window.XLSX) return Promise.resolve();
  if(!_xlsxLoadPromise) _xlsxLoadPromise=_loadLib('lib/xlsx.full.min.js','https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','XLSX').catch(e=>{ _xlsxLoadPromise=null; throw e; });
  return _xlsxLoadPromise;
}
let _exceljsLoadPromise=null;
function ensureExcelJS(){
  if(window.ExcelJS) return Promise.resolve();
  if(!_exceljsLoadPromise) _exceljsLoadPromise=_loadLib('lib/exceljs.min.js','https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js','ExcelJS').catch(e=>{ _exceljsLoadPromise=null; throw e; });
  return _exceljsLoadPromise;
}

// (تنظيف أمني) القوائم الافتراضية بأسماء حقيقية اتشالت — كانت غير مستخدمة ومكشوفة في JS العام؛
// المقاولون والأماكن بيتزرعوا لكل حساب من لوحة الأدمن

// ============ PIN PROTECTION SYSTEM ============
// يحمي عمليات: إضافة/تعديل الأماكن، وإضافة/تعديل/حفظ توقيع المهندس
async function sha256Hex(str){
  try{
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch(e){
    let h=0; for(let i=0;i<str.length;i++){ h=(h<<5)-h+str.charCodeAt(i); h|=0; }
    return 'fb_'+Math.abs(h).toString(16);
  }
}
function getPinHash(){ return localStorage.getItem('cea_pin_hash'); }
function setPinHash(hash){ localStorage.setItem('cea_pin_hash', hash); }
function hasPinSet(){ return !!getPinHash(); }

function ensurePinModal(){
  if(document.getElementById('pin-modal-overlay')) return;
  const div=document.createElement('div');
  div.id='pin-modal-overlay';
  div.innerHTML =
    '<div id="pin-modal-box">'
    +'<div id="pin-modal-title" style="font-weight:900;font-size:16px;margin-bottom:10px"></div>'
    +'<div id="pin-modal-msg" style="font-size:12px;color:var(--muted);margin-bottom:12px"></div>'
    +'<input id="pin-input-1" type="password" inputmode="numeric" maxlength="8" placeholder="PIN" autocomplete="off">'
    +'<input id="pin-input-2" type="password" inputmode="numeric" maxlength="8" placeholder="تأكيد PIN" autocomplete="off" style="display:none">'
    +'<div id="pin-modal-error" style="color:var(--red);font-size:12px;min-height:16px;margin-bottom:8px"></div>'
    +'<div class="btns">'
    +'<button id="pin-modal-cancel">إلغاء</button>'
    +'<button id="pin-modal-ok">تأكيد</button>'
    +'</div></div>';
  document.body.appendChild(div);
  div.addEventListener('keydown', function(e){
    if(e.key==='Enter'){ const okBtn=document.getElementById('pin-modal-ok'); if(okBtn) okBtn.click(); }
  });
}

let _pinResolve=null;
function closePinModal(){
  const ov=document.getElementById('pin-modal-overlay');
  if(ov) ov.style.display='none';
}
function pinModalCancel(){
  closePinModal();
  if(_pinResolve){ _pinResolve(false); _pinResolve=null; }
}
function pinModalConfirm(mode){
  const err=document.getElementById('pin-modal-error');
  const v1=document.getElementById('pin-input-1').value.trim();
  if(mode==='setup'){
    const v2=document.getElementById('pin-input-2').value.trim();
    if(v1.length<4){ err.textContent='الرمز يجب ألا يقل عن 4 خانات'; return; }
    if(v1!==v2){ err.textContent='الرمزان غير متطابقين'; return; }
    sha256Hex(v1).then(h=>{
      setPinHash(h);
      pushPinHashToCloud(h);
      closePinModal();
      showToast('✅ تم إنشاء رمز PIN');
      if(_pinResolve){ _pinResolve(true); _pinResolve=null; }
    });
  } else {
    if(!v1){ err.textContent='أدخل الرمز'; return; }
    sha256Hex(v1).then(h=>{
      if(h===getPinHash()){
        closePinModal();
        if(_pinResolve){ _pinResolve(true); _pinResolve=null; }
      } else {
        err.textContent='رمز غير صحيح';
      }
    });
  }
}
function openPinModal(mode, title, msg){
  ensurePinModal();
  const ov=document.getElementById('pin-modal-overlay');
  document.getElementById('pin-modal-title').textContent=title;
  document.getElementById('pin-modal-msg').textContent=msg||'';
  document.getElementById('pin-modal-error').textContent='';
  const i1=document.getElementById('pin-input-1'); i1.value='';
  const i2=document.getElementById('pin-input-2'); i2.value='';
  i2.style.display = (mode==='setup') ? 'block' : 'none';
  document.getElementById('pin-modal-ok').onclick=()=>pinModalConfirm(mode);
  document.getElementById('pin-modal-cancel').onclick=pinModalCancel;
  ov.style.display='flex';
  setTimeout(()=>i1.focus(),50);
  return new Promise(resolve=>{ _pinResolve=resolve; });
}
// الدالة الرئيسية لحماية العمليات الحساسة برمز PIN
async function requirePin(){
  if(!hasPinSet()){
    return await openPinModal('setup','إنشاء رمز PIN','هذه أول مرة — أنشئ رمز PIN لحماية عمليات الأماكن والتوقيع (4 خانات على الأقل)');
  }
  return await openPinModal('verify','أدخل رمز PIN','لتأكيد هذه العملية، أدخل رمز PIN الخاص بك');
}
// تغيير رمز PIN — يشترط إدخال الرمز القديم أولاً
async function changePin(){
  if(!hasPinSet()){
    showToast('⚠ لا يوجد رمز PIN بعد — سيتم إنشاؤه الآن', true);
    await requirePin();
    return;
  }
  const okOld = await openPinModal('verify','تغيير رمز PIN','أدخل الرمز الحالي أولاً للتحقق');
  if(!okOld) return;
  const okNew = await openPinModal('setup','رمز PIN الجديد','أدخل الرمز الجديد وأكّده');
  if(okNew) showToast('✅ تم تغيير رمز PIN بنجاح');
}

const DEFAULT_INSPECTORS = ['م. عمرو زكريا'];
const DEFAULT_ITEMS = [
  {cat:'عزل',name:'عزل بيتومين 4مم للأسطح'},
  {cat:'بياض داخلي',name:'بياض سلالم ومداخل'},
  {cat:'بياض داخلي',name:'بياض حوائط وأسقف الوحدات'},
  {cat:'بياض داخلي',name:'بياض تخشين البدروم والجراجات'},
  {cat:'بياض خارجي',name:'بياض تخشين واجهات خارجية'},
  {cat:'بياض خارجي',name:'بياض حوائط المناور'},
  {cat:'بياض خارجي',name:'عراميس طولية للواجهات'},
  {cat:'دهانات داخلية',name:'دهان أسقف وحوائط سلالم وطرقات'},
  {cat:'دهانات داخلية',name:'دهان زخرفي حوائط البدروم'},
  {cat:'دهانات داخلية',name:'دهان بيتومين أسقف البدروم'},
  {cat:'دهانات خارجية',name:'دهان واجهات خارجية'},
  {cat:'دهانات خارجية',name:'دهان زخرفي المناور'},
  {cat:'سيراميك',name:'سيراميك بلاتينو 60×60 أرضيات'},
  {cat:'رخام',name:'درج جرانيت رمادي سلم رئيسي'},
  {cat:'رخام',name:'درج رخام صيني منيا سلم هروب'},
  {cat:'رخام',name:'درج جرانيت خارجي للمداخل'},
  {cat:'رخام',name:'ترابيع جرانيت رمادي مدخل وبسطات'},
  {cat:'رخام',name:'ترابيع رخام صيني بسطات هروب'},
  {cat:'رخام',name:'ترابيع جرانيت أسود داغش مدخل'},
  {cat:'بلاط',name:'بلاط موزايكو غرف الخدمات'},
  {cat:'بلاط',name:'بلاط موزايكو أسطح'},
  {cat:'جبس',name:'أسقف معلقة جبسية المدخل الرئيسي'},
  {cat:'تكسيات',name:'تكسية جرانيت رمادي حوائط مدخل'},
  {cat:'تكسيات',name:'تكسية حجر طبيعي حوائط مدخل'},
  {cat:'تكسيات',name:'تكسية حجر مايكا واجهات'},
  {cat:'تكسيات',name:'بازلت أسود أسفل المبنى'},
  {cat:'أعمال معدنية',name:'كوبسته سلم رئيسي'},
  {cat:'أعمال معدنية',name:'كوبسته سلم هروب'},
  {cat:'أعمال معدنية',name:'هاندريل واجهات ارتفاعات متعددة'},
  {cat:'أعمال معدنية',name:'سلم حديد بحري سطح الخدمات'},
  {cat:'فتحات',name:'باب سيكوريت ماكينة إيطالي مدخل'},
  {cat:'فتحات',name:'تركيب أبواب مصفحة الوحدات'},
  {cat:'متنوعة',name:'Cement Board حول فتحات زجاجية'},
  {cat:'متنوعة',name:'تجاليد HDF بديل خشب مدخل'},
  {cat:'متنوعة',name:'مرايا حوائط مدخل رئيسي'},
  {cat:'متنوعة',name:'حوامل تكييف حد أقصى 3 حصان'},
  {cat:'متنوعة',name:'زوايا بلاستيك حماية أعمدة'},
  {cat:'كهرباء',name:'كابلات ألومنيوم تغذية لوحات خدمة'},
  {cat:'كهرباء',name:'كابلات ألومنيوم تغذية المصعد'},
  {cat:'كهرباء',name:'كابلات نحاس تغذية الشقق 10مم²'},
  {cat:'كهرباء',name:'كابلات نحاس تغذية الشقق 16مم²'},
  {cat:'كهرباء',name:'كابلات تغذية لوحة تحكم طلمبات'},
  {cat:'كهرباء',name:'كابلات تغذية لوحة منور القمامة'},
  {cat:'كهرباء',name:'كابل تأريض 70مم² بين اللوحات'},
  {cat:'كهرباء',name:'كابل تأريض 16مم² أنظمة خفيف'},
  {cat:'كهرباء',name:'صواعد مواسير كابلات القوى'},
  {cat:'كهرباء',name:'حامل كابلات 400×100مم'},
  {cat:'كهرباء',name:'حامل كابلات 200×100مم'},
  {cat:'كهرباء',name:'ترانك تيار خفيف 200×100مم'},
  {cat:'كهرباء',name:'لوحة خدمة 27 SER-DB'},
  {cat:'كهرباء',name:'لوحة خدمة 28 SER-DB'},
  {cat:'كهرباء',name:'صندوق عداد كهرباء كل وحدة'},
  {cat:'كهرباء',name:'صندوق صاعد كهرباء'},
  {cat:'كهرباء',name:'بريزة 10 أمبير عادية'},
  {cat:'كهرباء',name:'بريزة 10 أمبير مقاومة للجو'},
  {cat:'كهرباء',name:'بريزة قوى 16 أمبير للكاميرات'},
  {cat:'كهرباء',name:'بريزة قوى 16 أمبير RACK IT'},
  {cat:'كهرباء',name:'بريزة قوى 16 أمبير FACP'},
  {cat:'كهرباء',name:'بريزة قوى 16 أمبير INTERCOM'},
  {cat:'كهرباء',name:'بريزة قوى 16 أمبير MATV'},
  {cat:'كهرباء',name:'مفتاح فصل حمل طلمبات مياه'},
  {cat:'كهرباء',name:'مفتاح فصل حمل منظومة نفايات'},
  {cat:'كهرباء',name:'مفتاح فصل حمل المصاعد'},
  {cat:'كهرباء',name:'مفتاح إنارة سكة واحدة'},
  {cat:'كهرباء',name:'مفتاح إنارة ثنائي لقمة واحدة'},
  {cat:'كهرباء',name:'مخرج إنارة الشقق بمواسير فارغة'},
  {cat:'كهرباء',name:'مخرج إنارة السلالم والطرقات'},
  {cat:'كهرباء',name:'مخرج بريزة عادية خدمات'},
  {cat:'كهرباء',name:'مخرج تغذية كاميرات مراقبة'},
  {cat:'كهرباء',name:'مخرج كاميرا مراقبة ثابتة'},
  {cat:'كهرباء',name:'صواعد مواسير شبكة الدش والانتركم'},
  {cat:'كهرباء',name:'صواعد مواسير شبكة الداتا'},
  {cat:'كهرباء',name:'نظام تأريض لوحات جهد منخفض'},
  {cat:'كهرباء',name:'سبوت لايت LED 4 وات دائري'},
  {cat:'كهرباء',name:'تراك لايت LED 8 وات'},
  {cat:'كهرباء',name:'بروفايل LED بيوت النور'},
  {cat:'كهرباء',name:'شريط LED غير مباشر بيوت النور'},
  {cat:'صحي',name:'مواسير بولي بروبلين تغذية 25مم'},
  {cat:'صحي',name:'مواسير بولي بروبلين تغذية 32مم'},
  {cat:'صحي',name:'مواسير بولي بروبلين تغذية 63مم'},
  {cat:'صحي',name:'مواسير بولي بروبلين تغذية 75مم'},
  {cat:'صحي',name:'مواسير UPVC مدفونة تغذية 75مم'},
  {cat:'صحي',name:'توصيلات تغذية مياه مطبخ'},
  {cat:'صحي',name:'توصيلات تغذية مياه حمام'},
  {cat:'صحي',name:'مواسير صرف مدفونة 110مم'},
  {cat:'صحي',name:'مواسير صرف مدفونة 160مم'},
  {cat:'صحي',name:'توصيلات صرف سيفون حمام 75مم'},
  {cat:'صحي',name:'توصيلات صرف تواليت 110مم'},
  {cat:'صحي',name:'توصيلات صرف مطبخ 75مم'},
  {cat:'صحي',name:'مواسير صرف معلقة 110مم'},
  {cat:'صحي',name:'مواسير صرف معلقة 75مم'},
  {cat:'صحي',name:'مواسير صرف معلقة 50مم'},
  {cat:'صحي',name:'جاليتراب بلاستيك 30×30سم'},
  {cat:'صحي',name:'جرجوري صرف أمطار 110مم'},
  {cat:'صحي',name:'جرجوري صرف أمطار 75مم'},
  {cat:'صحي',name:'سيفون أرضية صرف بدروم 75مم'},
  {cat:'صحي',name:'غطاء زهر صرف أرضية جراج'},
  {cat:'صحي',name:'حنفية غسيل بدروم وسطح'},
];

// ---- Dark Mode ----
const DARK_MODE_ICONS = {
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>',
  sun:  '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>'
};
// زرار الوضع الداكن بقى مفتاح تبديل (switch) في الإعدادات — نحدّث حالته المرئية
function setDarkModeIcon(isDark){
  const icon = document.getElementById('dark-mode-icon');
  if(icon) icon.innerHTML = isDark ? DARK_MODE_ICONS.sun : DARK_MODE_ICONS.moon;
  const btn = document.getElementById('dark-mode-btn');
  if(btn) btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
}
function toggleDarkMode(){
  const isDark = document.body.classList.toggle('dark-mode');
  document.documentElement.classList.toggle('dark-boot', isDark);
  localStorage.setItem('cea_dark_mode', isDark ? '1' : '0');
  setDarkModeIcon(isDark);
  const meta=document.querySelector('meta[name="theme-color"]'); if(meta) meta.content = isDark ? '#0B1526' : '#173058';
}
(function initDarkMode(){
  if(localStorage.getItem('cea_dark_mode')==='1'){
    document.body.classList.add('dark-mode');
    setDarkModeIcon(true);
  }
})();

let records     = JSON.parse(localStorage.getItem('saraki_records')     || '[]');
// هل كل السجلات التاريخية محمّلة على الجهاز ده، ولا لسه فيه أقدم متبقي على السحابة؟
let recordsFullyLoaded   = JSON.parse((localStorage.getItem('cea_records_fully_loaded') !== null ? localStorage.getItem('cea_records_fully_loaded') : 'true'));
let recordsOldestLoaded  = localStorage.getItem('cea_records_oldest_loaded') || null; // أقدم تاريخ متحمّل (YYYY-MM-DD)
function saveRecordsLoadState(){
  localStorage.setItem('cea_records_fully_loaded', JSON.stringify(recordsFullyLoaded));
  if(recordsOldestLoaded) localStorage.setItem('cea_records_oldest_loaded', recordsOldestLoaded);
  else localStorage.removeItem('cea_records_oldest_loaded');
}
let irRecords   = JSON.parse(localStorage.getItem('saraki_ir')          || '[]');
// سركي المعدات (إيجار معدات شهري 20→19) — سطر لكل يوم تشغيل، وحدة `equipment`
let equipmentRecords = JSON.parse(localStorage.getItem('cea_equipment') || '[]');
let eqEditingId = null;
let todos       = JSON.parse(localStorage.getItem('saraki_todos')       || '[]');
let contractors = JSON.parse(localStorage.getItem('saraki_contractors') || 'null') || [];
let places      = JSON.parse(localStorage.getItem('saraki_places')      || 'null') || [];
// ملاحظات الأماكن {اسم المكان: الملاحظة} — بتظهر للمهندس كأيقونة ❕ جنب اختيار المكان في تسجيل السركي
let placeNotes  = JSON.parse(localStorage.getItem('cea_place_notes')    || '{}');
function savePlaceNotes(){ try{ localStorage.setItem('cea_place_notes', JSON.stringify(placeNotes)); }catch(e){} }
// مشروع كل مكان {اسم المكان: رقم الموقع 1/2} — الأماكن بتتجمّع تحته في الإعدادات، واسمه بيتكتب في راس كشف السركي
let placeSites = JSON.parse(localStorage.getItem('cea_place_sites') || '{}');
function savePlaceSites(){ try{ localStorage.setItem('cea_place_sites', JSON.stringify(placeSites)); }catch(e){} }
// كاش آخر طلبات إيجار معتمدة (لبادج "متطابق" في تاب السركي، اللي بيشتغل أوفلاين كمان)
let _rrApprovedCache=[]; try{ _rrApprovedCache=JSON.parse(localStorage.getItem('cea_rr_approved_cache')||'[]'); }catch(e){}
let inspectors  = JSON.parse(localStorage.getItem('saraki_inspectors')  || 'null') || [];
let items       = JSON.parse(localStorage.getItem('saraki_items')       || 'null') || [];
let editingId   = null;
let irEditingId = null;
let todoEditingId = null;
let sortField = '';
let sortDir   = 'asc';

function saveAll() {
  try{
    localStorage.setItem('saraki_records',     JSON.stringify(records));
    localStorage.setItem('saraki_ir',          JSON.stringify(irRecords));
    localStorage.setItem('cea_equipment',      JSON.stringify(equipmentRecords));
    localStorage.setItem('saraki_todos',       JSON.stringify(todos));
    localStorage.setItem('saraki_contractors', JSON.stringify(contractors));
    localStorage.setItem('saraki_places',      JSON.stringify(places));
    localStorage.setItem('saraki_inspectors',  JSON.stringify(inspectors));
    localStorage.setItem('saraki_items',       JSON.stringify(items));
    localStorage.setItem('cea_daily',          JSON.stringify(dailyRecords));
    localStorage.setItem('cea_exec',           JSON.stringify(execRecords));
    scheduleSync(); // مزامنة تلقائية مع السيرفر بعد كل حفظ (debounced — مش بتعطل الواجهة)
    // الرئيسية بتعكس آخر الأرقام لو كانت هي المعروضة
    if(typeof renderHome==='function' && document.getElementById('tab-home')?.classList.contains('active')) renderHome();
    return true;
  }catch(e){
    // غالبًا QuotaExceededError — الذاكرة المحلية اتملت (صور التقارير اليومية هي السبب الأشهر)
    console.error('saveAll failed', e);
    showToast('⚠ الذاكرة المحلية اتملت — البيانات ما اتحفظتش! امسح صور تقارير قديمة أو اعمل نسخة احتياطية', true);
    return false;
  }
}

function fmt(n) { return Number(n||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function showToast(msg,isError=false) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.className='toast'+(isError?' error':''); t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}

const opt = v => `<option value="${esc(v)}">${esc(v)}</option>`;
// لو فيه مقاولين عمالة: بيتجمّعوا في optgroup لوحدهم عشان يتفرزوا بسهولة عن باقي المقاولين
const contractorOpts = () => {
  if(!contractors.some(c=>c.isLabor)) return contractors.map(c=>opt(c.name)).join('');
  const labor=contractors.filter(c=>c.isLabor), rest=contractors.filter(c=>!c.isLabor);
  return `<optgroup label="👷 مقاولين العمالة">${labor.map(c=>opt(c.name)).join('')}</optgroup>`
    + `<optgroup label="🏗 باقي المقاولين">${rest.map(c=>opt(c.name)).join('')}</optgroup>`;
};
// لو فيه أماكن متربطة بمشاريع: الخيارات بتتجمّع تحت اسم المشروع — اختيار المكان بيوضّح مشروعه
const placeOpts      = () => {
  if(_projects.length<=1) return places.map(opt).join('');
  return _projects.map(p=>p.id).map(g=>{
    const ps=places.filter(p=>placeProjectId(p)===g);
    if(!ps.length) return '';
    return `<optgroup label="🏗 ${esc(siteName(g))}">${ps.map(opt).join('')}</optgroup>`;
  }).join('');
};
// قوايم شاشة الكشف بس: زيها زي اللي فوق + خيار "اضافة الكل" جوه كل مجموعة.
// مقاولين العمالة ليهم زرارهم الخاص لأنهم لازم يتبعتوا في كشف لوحدهم (الحارس في sendExport).
const exportContractorOpts = () => {
  if(!contractors.some(c=>c.isLabor)) return contractorOpts();
  const labor=contractors.filter(c=>c.isLabor), rest=contractors.filter(c=>!c.isLabor);
  return `<optgroup label="👷 مقاولين العمالة"><option value="__ALL_LABOR__">➕ اضافة جميع مقاولين العمالة</option>${labor.map(c=>opt(c.name)).join('')}</optgroup>`
    + `<optgroup label="🏗 باقي المقاولين">${rest.map(c=>opt(c.name)).join('')}</optgroup>`;
};
// الأماكن: "اضافة الكل" بتبقى لكل مشروع على حدة لما يكون فيه أكتر من مشروع —
// الكشف الواحد مايقدرش يجمع أماكن من مشروعين (الحارس في buildExport)، فإضافة الكل عبر
// المشاريع كانت بتوقّع الإرسال. بمشروع واحد بس بتفضل زي ما هي (__ALL__).
const exportPlaceOpts = () => {
  if(_projects.length<=1) return placeOpts();
  return _projects.map(p=>p.id).map(g=>{
    const ps=places.filter(p=>placeProjectId(p)===g);
    if(!ps.length) return '';
    return `<optgroup label="🏗 ${esc(siteName(g))}">`
      + `<option value="__ALL_P${g}__">➕ اضافة جميع أماكن ${esc(siteName(g))}</option>`
      + ps.map(opt).join('') + `</optgroup>`;
  }).join('');
};
function itemsOptGroups(){
  const cats=[...new Set(items.map(i=>i.cat))];
  return cats.map(cat=>`<optgroup label="${esc(cat)}">${items.filter(i=>i.cat===cat).map(i=>opt(i.name)).join('')}</optgroup>`).join('');
}
// يعيد بناء قائمة select مع الحفاظ على القيمة المختارة
function fillSelect(id, firstOption, optionsHtml){
  const s=document.getElementById(id); if(!s) return;
  const v=s.value; s.innerHTML=firstOption+optionsHtml; s.value=v;
  // القايمة اتملت من جديد — نعيد تطبيق فلتر البحث لو المستخدم كاتب فيه حاجة
  if(s.dataset.searchInput) filterSelectOptions(s.dataset.searchInput, id);
}
// فلترة خيارات قايمة منسدلة حسب نص البحث (بحث جزئي، بيتجاهل التشكيل والهمزات)
function normSearch(s){
  return String(s||'').trim().toLowerCase()
    .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
    .replace(/[ً-ْ]/g,'').replace(/\s+/g,' ');
}
function filterSelectOptions(inputId, selectId){
  const inp=document.getElementById(inputId), sel=document.getElementById(selectId);
  if(!inp||!sel) return;
  sel.dataset.searchInput=inputId;
  const q=normSearch(inp.value);
  let shown=0;
  Array.from(sel.options).forEach(o=>{
    // الخيارات الخاصة (فاضي / اضافة الكل) تفضل ظاهرة دايمًا
    const special = o.value==='' || o.value.startsWith('__ALL');
    const match = !q || special || normSearch(o.textContent).includes(q);
    o.hidden = !match;
    if(match && !special) shown++;
    // لو المختار حاليًا اتخفى، نفضّي الاختيار عشان المستخدم ما يفتكرش إنه لسه مختار
    if(o.selected && o.hidden) sel.value='';
  });
  // داخل optgroup: نخفي المجموعة كلها لو كل عناصرها مخفية
  Array.from(sel.querySelectorAll('optgroup')).forEach(g=>{
    g.hidden = !Array.from(g.children).some(o=>!o.hidden);
  });
  const hint=document.getElementById(inputId+'-empty');
  if(hint) hint.style.display = (q && shown===0) ? 'block' : 'none';
}
function populateDropdowns() {
  fillSelect('f-contractor','<option value="">-- اختر المقاول --</option>',contractorOpts());
  ['f-place','ir-place','todo-place','eq-place'].forEach(id=>fillSelect(id,'<option value="">-- اختر المكان --</option>',placeOpts()));
  fillSelect('eq-contractor','<option value="">-- اختر المقاول / المورد --</option>',contractorOpts());
  fillSelect('eq-deduct-on-select','<option value="">-- اختر مقاول --</option>',contractorOpts());
  fillSelect('search-place','<option value="">📍 كل الأماكن</option>',placeOpts());
  fillSelect('search-contractor-filter','<option value="">👷 كل المقاولين</option>',contractorOpts());
  fillSelect('f-deduct-on-select','<option value="">-- اختر مقاول --</option>',contractorOpts());
  { const laborNames=contractors.filter(c=>c.isLabor).map(c=>c.name);
    const allLabel = laborNames.length ? `➕ اضافة جميع المقاولين (ماعدا: ${laborNames.join('، ')})` : '➕ اضافة جميع المقاولين';
    fillSelect('export-contractor-select','<option value="">-- اضف مقاول --</option><option value="__ALL__">'+esc(allLabel)+'</option>',exportContractorOpts()); }
  // بأكتر من مشروع: "اضافة جميع الأماكن" العامة بتتشال وبتتحط واحدة في أول كل مشروع
  { const allPlaces = _projects.length<=1 ? '<option value="__ALL__">➕ اضافة جميع الأماكن</option>' : '';
    fillSelect('export-place-select','<option value="">-- اضف مكان --</option>'+allPlaces,exportPlaceOpts()); }
  fillSelect('ir-inspector','<option value="">-- اختر الاستشاري --</option>',inspectors.map(opt).join(''));
  fillSelect('ir-item','<option value="">-- اختر البند --</option>',itemsOptGroups());
  // قوائم "اختار من مقاولينك/أماكنك" في إدارة الحسابات — كانت بتتملّي مرة واحدة بس وقت اختيار
  // المهندس (adminFillPickers جوّه adminSelectUser)، فلو الأدمن راح الإعدادات وضاف مقاول ورجع
  // مكانش بيلاقيه غير بعد ريفريش للصفحة. (باج اتبلّغ 15 سبتمبر 2026)
  // وكمان قيم الخيارات دي أرقام ترتيب في المصفوفة (contractors[i])، فلو القايمة قديمة بعد حذف
  // (removeContractor بيعمل splice) الرقم ممكن يوصّل لمقاول غلط — التحديث هنا بيمنع ده كمان.
  adminFillPickers();
  updatePlaceNoteIcon();
}

// ── ملاحظة المكان في فورم تسجيل السركي: أيقونة ❕ جنب الاختيار، بالضغط عليها يظهر/يختفي بوكس الملاحظة ──
function updatePlaceNoteIcon(){
  const sel=document.getElementById('f-place'), btn=document.getElementById('f-place-note-btn'), box=document.getElementById('f-place-note-box');
  if(!sel||!btn||!box) return;
  const note=placeNotes[sel.value]||'';
  btn.style.display = note ? '' : 'none';
  if(!note){ box.style.display='none'; return; }
  box.textContent='❕ '+note;
  // لو البوكس كان مفتوح على مكان تاني — حدّث نصه وسيبه مفتوح
}
function togglePlaceNoteBox(){
  const box=document.getElementById('f-place-note-box');
  if(box) box.style.display = box.style.display==='none' ? '' : 'none';
}

let editingContractorIdx = null;

// ── الإعدادات: كل كارت بيبقى مطوي زي أقسام إدارة الحسابات ──
// بيتعمل مرة واحدة لكل كارت (data-set-key علامة الاكتمال) — محتوى الكارت بيتلف في .set-body
// بنقل العناصر نفسها مش بإعادة كتابة HTML، فكل الـids والمراجع الموجودة بتفضل شغّالة.
// الكروت المخفية بـdisplay:none (فورمات التعديل اللي الجافاسكربت بيفتحها) بتتساب زي ما هي.
function setOpenState(){ try{ return JSON.parse(localStorage.getItem('cea_set_open')||'{}'); }catch(e){ return {}; } }
function toggleSetCard(head){
  const card=head.closest('.card'); if(!card) return;
  card.classList.toggle('set-closed');
  const st=setOpenState(); st[card.dataset.setKey]=!card.classList.contains('set-closed');
  try{ localStorage.setItem('cea_set_open', JSON.stringify(st)); }catch(e){}
}
function enhanceSettingsAccordion(){
  const panel=document.getElementById('tab-settings'); if(!panel) return;
  const st=setOpenState();
  panel.querySelectorAll(':scope > .card').forEach((card,i)=>{
    if(card.dataset.setKey) return;
    const head=card.firstElementChild;
    if(!head || !head.classList.contains('card-title')) return;
    if((card.getAttribute('style')||'').replace(/\s/g,'').includes('display:none')) return;
    const key=card.dataset.feature || card.id || ('i'+i);
    card.dataset.setKey=key;
    const body=document.createElement('div');
    body.className='set-body';
    while(head.nextSibling) body.appendChild(head.nextSibling);
    card.appendChild(body);
    head.classList.add('set-head');
    head.insertAdjacentHTML('beforeend','<span class="set-chev">▾</span>');
    head.addEventListener('click', function(){ toggleSetCard(this); });
    if(st[key]!==true) card.classList.add('set-closed');
  });
}

function renderSettings() {
  enhanceSettingsAccordion();
  document.querySelectorAll('.admin-only').forEach(el=>{ el.style.display = isAdmin() ? '' : 'none'; });
  const rateTypeLabel = {ساعة:'ساعة',يومية:'يومية',مقطوعية:'مقطوعية'};
  const emptyP = txt => `<p class="hint" style="padding:8px 0;margin:0">${txt}</p>`;
  // بحث في القوائم (الاسم/التخصص للمقاولين، الاسم/الملاحظة للأماكن) — الفهرس i يفضل فهرس المصفوفة الأصلية عشان التعديل/الحذف
  const cq=(document.getElementById('contractors-search')?.value||'').trim().toLowerCase();
  const pq=(document.getElementById('places-search')?.value||'').trim().toLowerCase();
  const cList=contractors.map((c,i)=>({c,i})).filter(({c})=>!cq || String(c.name||'').toLowerCase().includes(cq) || String(c.spec||'').toLowerCase().includes(cq));
  const pList=places.map((p,i)=>({p,i})).filter(({p})=>!pq
    || String(p).toLowerCase().includes(pq)
    || String(placeNotes[p]||'').toLowerCase().includes(pq)
    || String(siteName(placeProjectId(p))).toLowerCase().includes(pq));
  document.getElementById('contractors-list').innerHTML = contractors.length
    ? (cList.length ? cList.map(({c,i})=>`
      <div class="setting-item">
        <div style="flex:1;min-width:0">
          <div class="setting-name">${esc(c.name)}${c.isLabor?' <span title="مقاول عمالة">👷</span>':''}</div>
          <div class="setting-sub">${esc(c.spec)}${c.rate?` · ${Number(c.rate).toLocaleString('ar-EG')} ج.م / ${esc(c.rateType||'يومية')}`:''}</div>
        </div>
        ${isAdmin()?`<div class="setting-actions">
          <button class="btn-sm-edit" onclick="startEditContractor(${i})">تعديل</button>
          <button class="btn-sm-del"  onclick="removeContractor(${i})">حذف</button>
        </div>`:''}
      </div>`).join('') : emptyP('مفيش مقاول مطابق للبحث'))
    : emptyP('لا يوجد مقاولين');

  const placeItemHtml=({p,i})=>`<div class="setting-item">
        <div style="flex:1;min-width:0">
          <div class="setting-name">${esc(p)}</div>
          ${placeNotes[p]?`<div class="setting-sub">❕ ${esc(placeNotes[p])}</div>`:''}
        </div>
        ${isAdmin()?`<div class="setting-actions">
          <button class="btn-sm-edit" onclick="startEditPlace(${i})">تعديل</button>
          <button class="btn-sm-del" onclick="removePlace(${i})">حذف</button>
        </div>`:''}
      </div>`;
  document.getElementById('places-list').innerHTML = places.length
    ? (pList.length ? _projects.map(p=>p.id).map(g=>{
        const rows=pList.filter(({p})=>placeProjectId(p)===g);
        if(!rows.length) return '';
        const heading=`🏗 ${esc(siteName(g))}`;
        return `<div class="subhead" style="margin-top:8px">${heading}</div>` + rows.map(placeItemHtml).join('');
      }).join('') : emptyP('مفيش مكان مطابق للبحث'))
    : emptyP('لا يوجد أماكن');
  if(document.getElementById('new-place-site')) document.getElementById('new-place-site').innerHTML=placeSiteOptions(document.getElementById('new-place-site').value);
  if(document.getElementById('ep-site')) document.getElementById('ep-site').innerHTML=placeSiteOptions(document.getElementById('ep-site').value);
  document.getElementById('inspectors-list').innerHTML = inspectors.length
    ? inspectors.map((ins,i)=>`<div class="setting-item"><div class="setting-name">${esc(ins)}</div><button class="btn-sm-del" onclick="removeInspector(${i})">حذف</button></div>`).join('')
    : emptyP('لا يوجد استشاريين');
  document.getElementById('items-list').innerHTML = items.length
    ? items.map((it,i)=>{
        const stages = it.stages||[];
        const stagesHtml = stages.length>0
          ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${stages.map(s=>`<span class="stage-chip">${esc(s.name)} ${s.pct}%</span>`).join('')}</div>`
          : '<div style="font-size:10px;color:var(--muted);margin-top:3px">لا توجد مراحل</div>';
        return `<div class="setting-item" style="flex-direction:column;align-items:flex-start;gap:4px">
          <div style="display:flex;justify-content:space-between;width:100%;align-items:center;gap:8px">
            <div style="min-width:0"><div class="setting-name" style="font-size:12px">${esc(it.name)}</div><div class="setting-sub">${esc(it.cat)}</div></div>
            <div class="setting-actions">
              <button class="btn-sm-edit" onclick="startEditItem(${i})">تعديل</button>
              <button class="btn-sm-del" onclick="removeItem(${i})">حذف</button>
            </div>
          </div>
          ${stagesHtml}
        </div>`;
      }).join('')
    : emptyP('لا يوجد بنود');
}

function startEditContractor(i) {
  editingContractorIdx = i;
  const c = contractors[i];
  document.getElementById('ec-name').value      = c.name;
  document.getElementById('ec-spec').value      = c.spec;
  document.getElementById('ec-rate').value      = c.rate || '';
  document.getElementById('ec-rate-type').value = c.rateType || 'يومية';
  document.getElementById('ec-is-labor').checked = !!c.isLabor;
  document.getElementById('edit-contractor-form').style.display = 'block';
  document.getElementById('edit-contractor-form').scrollIntoView({behavior:'smooth'});
}
function saveEditContractor() {
  const i = editingContractorIdx;
  if(i === null) return;
  const name = document.getElementById('ec-name').value.trim();
  const spec = document.getElementById('ec-spec').value.trim();
  const rate = document.getElementById('ec-rate').value.trim();
  const rateType = document.getElementById('ec-rate-type').value;
  const isLabor = document.getElementById('ec-is-labor').checked;
  if(!name){showToast('⚠ أدخل إسم المقاول',true);return;}
  contractors[i] = {name, spec, rate, rateType, isLabor};
  saveAll(); populateDropdowns(); renderSettings();
  cancelEditContractor();
  showToast('✅ تم تعديل بيانات المقاول');
}
function cancelEditContractor() {
  editingContractorIdx = null;
  document.getElementById('edit-contractor-form').style.display = 'none';
  document.getElementById('ec-name').value = '';
  document.getElementById('ec-spec').value = '';
  document.getElementById('ec-rate').value = '';
  document.getElementById('ec-is-labor').checked = false;
}

function addContractor() {
  const n = document.getElementById('new-contractor-name').value.trim();
  const s = document.getElementById('new-contractor-spec').value.trim();
  const r = document.getElementById('new-contractor-rate').value.trim();
  const rt = document.getElementById('new-contractor-rate-type').value;
  const isLabor = document.getElementById('new-contractor-is-labor').checked;
  if(!n){showToast('⚠ أدخل إسم المقاول',true);return;}
  if(contractors.find(c=>c.name===n)){showToast('⚠ موجود مسبقاً',true);return;}
  contractors.push({name:n, spec:s||'—', rate:r, rateType:rt, isLabor});
  saveAll(); populateDropdowns(); renderSettings(); pushContractorsToCloud();
  document.getElementById('new-contractor-name').value='';
  document.getElementById('new-contractor-spec').value='';
  document.getElementById('new-contractor-rate').value='';
  document.getElementById('new-contractor-is-labor').checked=false;
  showToast('✅ تم إضافة المقاول');
}
function removeContractor(i){if(!confirm(`حذف "${contractors[i].name}"؟`))return;contractors.splice(i,1);saveAll();populateDropdowns();renderSettings();pushContractorsToCloud();showToast('🗑 تم الحذف');}
async function addPlace(){
  const ok = await requirePin();
  if(!ok) return;
  const p=document.getElementById('new-place').value.trim();if(!p){showToast('⚠ أدخل إسم المكان',true);return;}if(places.includes(p)){showToast('⚠ موجود مسبقاً',true);return;}
  const note=(document.getElementById('new-place-note')?.value||'').trim();
  const site=Number(document.getElementById('new-place-site')?.value)||DEFAULT_PROJECT_ID;
  places.push(p);
  if(note) placeNotes[p]=note; savePlaceNotes();
  placeSites[p]=site; savePlaceSites();
  saveAll();populateDropdowns();renderSettings();pushPlacesToCloud();
  document.getElementById('new-place').value=''; if(document.getElementById('new-place-note')) document.getElementById('new-place-note').value=''; if(document.getElementById('new-place-site')) document.getElementById('new-place-site').value='';
  showToast('✅ تم إضافة المكان');
}
async function removePlace(i){
  const ok = await requirePin();
  if(!ok) return;
  if(!confirm(`حذف "${places[i]}"؟`))return;delete placeNotes[places[i]];savePlaceNotes();delete placeSites[places[i]];savePlaceSites();places.splice(i,1);saveAll();populateDropdowns();renderSettings();pushPlacesToCloud();showToast('🗑 تم الحذف');
}
async function editPlace(i, newName){
  const ok = await requirePin();
  if(!ok) return;
  newName = (newName||'').trim();
  if(!newName){ showToast('⚠ أدخل إسم المكان', true); return; }
  if(places.includes(newName)){ showToast('⚠ موجود مسبقاً', true); return; }
  if(placeNotes[places[i]]!==undefined){ placeNotes[newName]=placeNotes[places[i]]; delete placeNotes[places[i]]; savePlaceNotes(); }
  if(placeSites[places[i]]!==undefined){ placeSites[newName]=placeSites[places[i]]; delete placeSites[places[i]]; savePlaceSites(); }
  places[i] = newName;
  saveAll(); populateDropdowns(); renderSettings(); pushPlacesToCloud();
  showToast('✅ تم تعديل المكان');
}
// تعديل مكان (الاسم + الملاحظة) بفورم زي المقاولين — أدمن + PIN زي باقي عمليات الأماكن
let editingPlaceIdx=null;
async function startEditPlace(i){
  const ok = await requirePin();
  if(!ok) return;
  editingPlaceIdx=i;
  document.getElementById('ep-name').value=places[i];
  document.getElementById('ep-note').value=placeNotes[places[i]]||'';
  if(document.getElementById('ep-site')) document.getElementById('ep-site').value=String(placeProjectId(places[i]));
  const f=document.getElementById('edit-place-form');
  f.style.display='block'; f.scrollIntoView({behavior:'smooth'});
}
function cancelEditPlace(){
  editingPlaceIdx=null;
  document.getElementById('edit-place-form').style.display='none';
}
function saveEditPlace(){
  const i=editingPlaceIdx; if(i===null) return;
  const oldName=places[i];
  const newName=document.getElementById('ep-name').value.trim();
  const note=document.getElementById('ep-note').value.trim();
  const site=Number(document.getElementById('ep-site')?.value)||DEFAULT_PROJECT_ID;
  if(!newName){ showToast('⚠ أدخل إسم المكان', true); return; }
  if(newName!==oldName && places.includes(newName)){ showToast('⚠ موجود مسبقاً', true); return; }
  delete placeNotes[oldName];
  if(note) placeNotes[newName]=note; else delete placeNotes[newName];
  delete placeSites[oldName];
  placeSites[newName]=site;
  places[i]=newName;
  savePlaceNotes(); savePlaceSites(); saveAll(); populateDropdowns(); renderSettings(); updatePlaceNoteIcon(); pushPlacesToCloud();
  cancelEditPlace();
  showToast('✅ تم تعديل المكان');
}
function addInspector(){const n=document.getElementById('new-inspector').value.trim();if(!n){showToast('⚠ أدخل إسم الاستشاري',true);return;}if(inspectors.includes(n)){showToast('⚠ موجود مسبقاً',true);return;}inspectors.push(n);saveAll();populateDropdowns();renderSettings();document.getElementById('new-inspector').value='';showToast('✅ تم إضافة الاستشاري');}
function removeInspector(i){if(!confirm(`حذف "${inspectors[i]}"؟`))return;inspectors.splice(i,1);saveAll();populateDropdowns();renderSettings();showToast('🗑 تم الحذف');}
// ---- Item Stages (temp while adding new item) ----
let newItemStages = [];

function addStageToNew(){
  const name = document.getElementById('new-stage-name').value.trim();
  const pct  = parseInt(document.getElementById('new-stage-pct').value) || 0;
  if(!name){showToast('⚠ أدخل إسم المرحلة',true);return;}
  if(pct<=0||pct>100){showToast('⚠ أدخل نسبة صحيحة 1-100',true);return;}
  newItemStages.push({name, pct});
  document.getElementById('new-stage-name').value='';
  document.getElementById('new-stage-pct').value='';
  renderNewItemStages();
}
function removeNewStage(i){
  newItemStages.splice(i,1);
  renderNewItemStages();
}
function renderNewItemStages(){
  const list = document.getElementById('new-item-stages-list');
  const total = document.getElementById('new-item-stages-total');
  if(!list) return;
  list.innerHTML = newItemStages.map((s,i)=>`
    <div class="stage-row">
      <span class="n">${esc(s.name)}</span>
      <span class="p">${s.pct}%</span>
      <button onclick="removeNewStage(${i})">✕</button>
    </div>`).join('');
  const sum = newItemStages.reduce((a,s)=>a+s.pct,0);
  if(total) total.textContent = newItemStages.length>0 ? `مجموع النسب: ${sum}%${sum!==100?' ⚠ (المجموع لازم 100%)':' ✅'}` : '';
}

function addItem(){
  const c=document.getElementById('new-item-cat').value.trim();
  const n=document.getElementById('new-item-name').value.trim();
  if(!n){showToast('⚠ أدخل إسم البند',true);return;}
  const sum = newItemStages.reduce((a,s)=>a+s.pct,0);
  if(newItemStages.length>0 && sum!==100){showToast('⚠ مجموع النسب لازم يكون 100%',true);return;}
  items.push({cat:c||'عام', name:n, stages:[...newItemStages]});
  newItemStages=[];
  renderNewItemStages();
  saveAll();populateDropdowns();renderSettings();initSiteTab();
  document.getElementById('new-item-cat').value='';
  document.getElementById('new-item-name').value='';
  showToast('✅ تم إضافة البند');
}
function removeItem(i){if(!confirm(`حذف "${items[i].name}"؟`))return;items.splice(i,1);saveAll();populateDropdowns();renderSettings();initSiteTab();showToast('🗑 تم الحذف');}

// ---- Edit Item ----
let editingItemIdx=null;
let editItemStages=[];

function startEditItem(i){
  editingItemIdx=i;
  const it=items[i];
  document.getElementById('ei-cat').value=it.cat||'';
  document.getElementById('ei-name').value=it.name||'';
  editItemStages=[...(it.stages||[]).map(s=>({name:s.name,pct:s.pct}))];
  renderEditItemStages();
  const form=document.getElementById('edit-item-form');
  form.style.display='block';
  form.scrollIntoView({behavior:'smooth'});
}
function addStageToEdit(){
  const name=document.getElementById('ei-stage-name').value.trim();
  const pct=parseInt(document.getElementById('ei-stage-pct').value)||0;
  if(!name){showToast('⚠ أدخل إسم المرحلة',true);return;}
  if(pct<=0||pct>100){showToast('⚠ أدخل نسبة 1-100',true);return;}
  editItemStages.push({name,pct});
  document.getElementById('ei-stage-name').value='';
  document.getElementById('ei-stage-pct').value='';
  renderEditItemStages();
}
function removeEditStage(i){
  editItemStages.splice(i,1);
  renderEditItemStages();
}
function renderEditItemStages(){
  const list=document.getElementById('ei-stages-list');
  const total=document.getElementById('ei-stages-total');
  if(!list)return;
  list.innerHTML=editItemStages.map((s,i)=>`
    <div class="stage-row">
      <span class="n">${esc(s.name)}</span>
      <span class="p">${s.pct}%</span>
      <button onclick="removeEditStage(${i})">✕</button>
    </div>`).join('');
  const sum=editItemStages.reduce((a,s)=>a+s.pct,0);
  if(total) total.textContent=editItemStages.length>0?`مجموع النسب: ${sum}%${sum!==100?' ⚠ (لازم 100%)':' ✅'}`:'';
}
function saveEditItem(){
  if(editingItemIdx===null)return;
  const c=document.getElementById('ei-cat').value.trim();
  const n=document.getElementById('ei-name').value.trim();
  if(!n){showToast('⚠ أدخل إسم البند',true);return;}
  const sum=editItemStages.reduce((a,s)=>a+s.pct,0);
  if(editItemStages.length>0&&sum!==100){showToast('⚠ مجموع النسب لازم 100%',true);return;}
  items[editingItemIdx]={cat:c||'عام',name:n,stages:[...editItemStages]};
  saveAll();populateDropdowns();renderSettings();initSiteTab();
  cancelEditItem();
  showToast('✅ تم تعديل البند');
}
function cancelEditItem(){
  editingItemIdx=null;
  editItemStages=[];
  document.getElementById('edit-item-form').style.display='none';
  document.getElementById('ei-cat').value='';
  document.getElementById('ei-name').value='';
}

// ---- Import Items from Excel ----
async function exportItemsExcel(){
  await ensureXLSX();
  if(!items.length){showToast('⚠ لا يوجد بنود',true);return;}
  const rows=[['الفئة','إسم البند','مرحلة 1','نسبة 1 %','مرحلة 2','نسبة 2 %','مرحلة 3','نسبة 3 %','مرحلة 4','نسبة 4 %','مرحلة 5','نسبة 5 %']];
  items.forEach(it=>{
    const row=[it.cat||'عام', it.name||''];
    const stages=it.stages||[];
    for(let i=0;i<5;i++){
      row.push(stages[i]?stages[i].name:'');
      row.push(stages[i]?stages[i].pct:'');
    }
    rows.push(row);
  });
  const ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[14,22,18,8,18,8,18,8,18,8,18,8].map(w=>({wch:w}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'البنود');
  const fileName='items_'+todayYMD()+'.xlsx';
  if(window.isCapacitor){
    try{
      const wbout=XLSX.write(wb,{bookType:'xlsx',type:'array'});
      const uint8 = new Uint8Array(wbout);
      const b64 = bytesToBase64(uint8);
      window.Capacitor.Plugins.Filesystem.writeFile({path:fileName,data:b64,directory:'CACHE',recursive:true})
        .then(()=>window.Capacitor.Plugins.Filesystem.getUri({path:fileName,directory:'CACHE'}))
        .then(u=>window.Capacitor.Plugins.Share.share({title:fileName,url:u.uri}))
        .then(()=>showToast('📥 تم تصدير البنود'))
        .catch(e=>showToast('⚠ خطأ: '+e.message,true));
    }catch(e){showToast('⚠ خطأ: '+e.message,true);}
  } else {
    XLSX.writeFile(wb,fileName);
    showToast('📥 تم تصدير البنود');
  }
}
async function importItemsExcel(){
  await ensureXLSX();
  const fileInput=document.getElementById('import-items-file');
  const file=fileInput.files[0];
  if(!file){showToast('⚠ اختر ملف Excel أولاً',true);return;}
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      if(rows.length<2){showToast('⚠ الملف فارغ',true);return;}
      // Expected columns: الفئة | إسم البند | المراحل (name:pct,name:pct,...)
      // OR: الفئة | إسم البند | اسم المرحلة 1 | نسبة 1 | اسم المرحلة 2 | نسبة 2 ...
      let imported=0;
      for(let i=1;i<rows.length;i++){
        const row=rows[i];
        const cat=(row[0]||'').toString().trim();
        const name=(row[1]||'').toString().trim();
        if(!name) continue;
        // Parse stages from col 2 onwards: pairs (name, pct)
        const stages=[];
        for(let j=2;j+1<row.length;j+=2){
          const sname=(row[j]||'').toString().trim();
          const spct=parseFloat(row[j+1])||0;
          if(sname&&spct>0) stages.push({name:sname,pct:spct});
        }
        // Check if item already exists
        const exists=items.find(it=>it.name===name&&it.cat===(cat||'عام'));
        if(!exists){
          items.push({cat:cat||'عام',name,stages});
          imported++;
        }
      }
      saveAll();populateDropdowns();renderSettings();initSiteTab();
      fileInput.value='';
      showToast(`✅ تم استيراد ${imported} بند`);
    }catch(err){showToast('⚠ خطأ في قراءة الملف',true);}
  };
  reader.readAsArrayBuffer(file);
}

// ---- Deduct Chips ----
let deductChips=[];
let exportContractorChips=[];
function toggleChipsOpen(id){ const w=document.getElementById(id); if(!w) return; if(w.dataset.open) delete w.dataset.open; else w.dataset.open='1'; if(id==='export-contractor-chips') renderExportContractorChips(); else renderExportPlaceChips(); }
function renderExportContractorChips(){
  const wrap=document.getElementById('export-contractor-chips');
  if(!wrap)return;
  const list=exportContractorChips;
  // أكتر من 4 → مطوية في سطر ملخص؛ المستخدم يفتحها لو عايز يشوف/يشيل واحد
  const many=list.length>4;
  if(many && !wrap.dataset.open){
    wrap.innerHTML='<button type="button" class="chip chip-summary" onclick="toggleChipsOpen(\'export-contractor-chips\')">✓ '+list.length+' مقاول محددين · عرض ▾</button>';
    return;
  }
  wrap.innerHTML=(many?'<button type="button" class="chip chip-summary" onclick="toggleChipsOpen(\'export-contractor-chips\')">✓ '+list.length+' مقاول · إخفاء ▴</button>':'')
    + list.map(n=>`<span class="chip">${esc(n)}<button type="button" onclick="removeExportContractorChip(${jsArg(n)})" aria-label="حذف">✕</button></span>`).join('');
}
function addExportContractorChip(){
  const sel=document.getElementById('export-contractor-select');
  if(!sel||!sel.value)return;
  const name=sel.value;
  if(name==='__ALL__' || name==='__ALL_LABOR__'){
    // مقاولين العمالة مستبعدين من "إضافة الكل" — بيتبعتوا في كشف لوحدهم (وليهم زرارهم)
    const wantLabor = name==='__ALL_LABOR__';
    contractors.forEach(c=>{ if(!!c.isLabor===wantLabor && !exportContractorChips.includes(c.name)) exportContractorChips.push(c.name); });
    renderExportContractorChips();
    sel.value='';
    renderRecords();
    reviewMascot();
    return;
  }
  if(!exportContractorChips.includes(name)){exportContractorChips.push(name);renderExportContractorChips();}
  sel.value='';
  renderRecords();
  reviewMascot();
}
function removeExportContractorChip(name){
  exportContractorChips=exportContractorChips.filter(n=>n!==name);
  renderExportContractorChips();
  renderRecords();
}
function clearExportContractorChips(){
  if(!exportContractorChips.length)return;
  exportContractorChips=[];
  renderExportContractorChips();
  renderRecords();
}
let exportPlaceChips=[];
function renderExportPlaceChips(){
  const wrap=document.getElementById('export-place-chips');
  if(!wrap)return;
  const list=exportPlaceChips;
  // أكتر من 4 → مطوية في سطر ملخص؛ المستخدم يفتحها لو عايز يشوف/يشيل واحد
  const many=list.length>4;
  if(many && !wrap.dataset.open){
    wrap.innerHTML='<button type="button" class="chip chip-summary" onclick="toggleChipsOpen(\'export-place-chips\')">✓ '+list.length+' مكان محددين · عرض ▾</button>';
    return;
  }
  wrap.innerHTML=(many?'<button type="button" class="chip chip-summary" onclick="toggleChipsOpen(\'export-place-chips\')">✓ '+list.length+' مكان · إخفاء ▴</button>':'')
    + list.map(n=>`<span class="chip">${esc(n)}<button type="button" onclick="removeExportPlaceChip(${jsArg(n)})" aria-label="حذف">✕</button></span>`).join('');
}
function addExportPlaceChip(){
  const sel=document.getElementById('export-place-select');
  if(!sel||!sel.value)return;
  const name=sel.value;
  const allProj = name.match(/^__ALL_P(\d+)__$/);
  if(name==='__ALL__' || allProj){
    // أماكن مشروع واحد بس لو الزرار بتاع مشروع — الكشف مايجمعش أماكن من مشروعين
    const pick = allProj ? places.filter(p=>placeProjectId(p)===Number(allProj[1])) : places;
    pick.forEach(p=>{ if(!exportPlaceChips.includes(p)) exportPlaceChips.push(p); });
    renderExportPlaceChips();
    sel.value='';
    renderRecords();
    reviewMascot();
    return;
  }
  if(!exportPlaceChips.includes(name)){exportPlaceChips.push(name);renderExportPlaceChips();}
  sel.value='';
  renderRecords();
  reviewMascot();
}
function removeExportPlaceChip(name){
  exportPlaceChips=exportPlaceChips.filter(n=>n!==name);
  renderExportPlaceChips();
  renderRecords();
}
function clearExportPlaceChips(){
  if(!exportPlaceChips.length)return;
  exportPlaceChips=[];
  renderExportPlaceChips();
  renderRecords();
}
function getDeductOn(){ return [...deductChips]; }
function renderDeductChips(){
  const wrap=document.getElementById('f-deduct-chips');
  if(!wrap)return;
  wrap.innerHTML=deductChips.map(n=>`<span class="chip danger">${esc(n)}<button type="button" onclick="removeDeductChip(${jsArg(n)})" aria-label="حذف">✕</button></span>`).join('');
  document.getElementById('f-deduct-note-wrap').style.display=deductChips.length>0?'block':'none';
  if(deductChips.length===0){const dn=document.getElementById('f-deduct-note');if(dn)dn.value='';}
}
function addDeductChip(){
  const sel=document.getElementById('f-deduct-on-select');
  if(!sel||!sel.value)return;
  const name=sel.value;
  if(!deductChips.includes(name)){deductChips.push(name);renderDeductChips();discountMascot(name);}
  sel.value='';
}
function removeDeductChip(name){
  deductChips=deductChips.filter(n=>n!==name);
  renderDeductChips();
}
function setDeductChips(arr){
  deductChips=Array.isArray(arr)?[...arr]:(arr?[arr]:[]);
  renderDeductChips();
}
function toggleDeductNote(){
  document.getElementById('f-deduct-note-wrap').style.display=deductChips.length>0?'block':'none';
}

function fillSpec() {
  const n = document.getElementById('f-contractor').value;
  const c = contractors.find(x=>x.name===n);
  document.getElementById('f-spec').value = c ? c.spec : '';
  const priceEl = document.getElementById('f-price');
  if(c && c.rate) {
    priceEl.value = c.rate;
    if(c.rateType && document.getElementById('f-qty-type')) {
      document.getElementById('f-qty-type').value = c.rateType;
    }
    calcTotal();
  } else {
    // مقاول مالوش سعر محفوظ: لازم نفضّي سعر المقاول اللي قبله — من غير كده السعر القديم بيفضل
    // في الخانة، والتحقق (if(!qty||!price)) بيعدّيه لأنه مش صفر، فسطر بسعر غلط بيتحفظ في صمت
    const had = priceEl.value !== '';
    priceEl.value = '';
    // مقاول ممكن يكون متسجّل بنوع كمية من غير سعر — نحترم نوعه المحفوظ ومانفرضش "يومية"
    const qt = document.getElementById('f-qty-type'); if(qt) qt.value = (c && c.rateType) ? c.rateType : 'يومية';
    calcTotal();
    if(n && had) showToast('ℹ️ المقاول ده مالوش سعر محفوظ — اكتب السعر');
  }
}

async function importExcel() {
  await ensureXLSX();
  const file = document.getElementById('import-file').files[0];
  if(!file){showToast('⚠ اختر ملف Excel أولاً',true);return;}
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array', cellDates:false});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
      if(rows.length < 2){showToast('⚠ الملف فاضي أو مش صح',true);return;}
      // رقم من خلية ممكن تكون نص فيه فواصل آلاف (12,000) أو أرقام عربية (١٢٠٠٠)
      const num = v => { if(typeof v==='number') return v; const s=String(v||'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[،,\s]/g,''); const n=parseFloat(s); return isNaN(n)?NaN:n; };
      // تاريخ من خلية: نص YYYY-MM-DD أو m/d/yyyy أو رقم Excel serial أو Date
      const toDateStr = v => {
        if(v instanceof Date) return toYMD(v);
        if(typeof v==='number' && v>20000 && v<80000){ const d=new Date(Math.round((v-25569)*86400*1000)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`; }
        let s=String(v||'').trim();
        const md=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if(md){ const y=md[3].length===2?'20'+md[3]:md[3]; s=`${y}-${md[1].padStart(2,'0')}-${md[2].padStart(2,'0')}`; }
        return s;
      };

      // ── نتعرف على الأعمدة بالاسم (عشان أي ترتيب أعمدة يشتغل، سواء ملف قديم أو جديد) ──
      const header = rows[0].map(h=>String(h||'').trim());
      const findCol = (...names)=>{ for(const n of names){ const i=header.findIndex(h=>h===n||h.includes(n)); if(i!==-1) return i; } return -1; };
      const col = {
        day:        findCol('اليوم'),
        date:       findCol('التاريخ'),
        contractor: findCol('إسم المقاول','اسم المقاول','المقاول'),
        spec:       findCol('تخصص','التخصص'),
        qty:        findCol('العدد','مقط/يومية','الكمية'),
        qtyType:    findCol('النوع'),
        price:      findCol('السعر'),
        discount:   findCol('الخصم'),          // "الخصم" بالظبط قبل "بالخصم على"
        total:      findCol('الإجمالي'),
        place:      findCol('مكان الأعمال','المكان'),
        notes:      findCol('بيان الأعمال','البيان'),
        deductOn:   findCol('بالخصم على'),
        deductNote: findCol('ملاحظة الخصم'),
      };
      // "الخصم" ممكن يطابق "بالخصم على" أو "ملاحظة الخصم" بالغلط → نتأكد إنه عمود مختلف
      if(col.discount!==-1 && (col.discount===col.deductOn || col.discount===col.deductNote)){
        col.discount = header.findIndex(h=>h==='الخصم');
      }
      // لو الملف من غير رؤوس مفهومة → نرجع للترتيب القديم الافتراضي
      const legacy = col.contractor===-1;
      const get = (row,key,fallbackIdx)=>{ const i = legacy ? fallbackIdx : col[key]; return (i===-1||i==null) ? '' : row[i]; };

      let imported = 0, skipped = 0;
      const baseId = Date.now();
      rows.slice(1).forEach(row => {
        const contractor = String(get(row,'contractor',2)||'').trim();
        if(!contractor){skipped++;return;}
        const date       = toDateStr(get(row,'date',1));
        const day        = String(get(row,'day',0)||'').trim() || dayNameOf(date);
        const spec       = String(get(row,'spec',3)||'').trim();
        const qty        = num(get(row,'qty',4))||0;
        const qtyType    = String(get(row,'qtyType',-1)||'').trim()||'يومية';
        const price      = num(get(row,'price',5))||0;
        const discount   = num(get(row,'discount',6))||0;
        const totalRaw   = num(get(row,'total',7));
        const total      = isNaN(totalRaw) ? (qty*price-discount) : totalRaw;
        const place      = String(get(row,'place',8)||'').trim();
        const notes      = String(get(row,'notes',9)||'').trim();
        const deductOnS  = String(get(row,'deductOn',-1)||'').trim();
        const deductOn   = deductOnS ? deductOnS.split(/\s*[،,]\s*/).filter(Boolean) : [];
        const deductNote = String(get(row,'deductNote',-1)||'').trim();
        // تجاهل السجل لو موجود بالظبط (نفس التاريخ + المقاول + المكان + الإجمالي + البيان)
        const dup = records.some(r=>r.date===date&&r.contractor===contractor&&r.place===place&&Number(r.total)===Number(total)&&(r.notes||'')===notes);
        if(dup){skipped++;return;}
        records.push({id:baseId+imported, day, date, contractor, spec, qty, qtyType, price, discount, total, place, notes, deductOn, deductNote});
        imported++;
      });
      saveAll(); renderRecords(); renderSummary();
      document.getElementById('import-file').value='';
      showToast(`✅ تم استيراد ${imported} سجل${skipped?' (تجاهل '+skipped+' مكرر/فاضي)':''}`);
    } catch(err) {
      console.error(err);
      showToast('⚠ خطأ في قراءة الملف — تأكد إنه Excel صحيح',true);
    }
  };
  reader.readAsArrayBuffer(file);
}
const AR_DAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
// توحيد كتابة "الاثنين/الإثنين" و"الأحد/الاحد" عشان المقارنة تنجح مهما كانت الهمزة
const normDay = s => String(s||'').replace(/[إأآ]/g,'ا').trim();
function todayYMD(){ return toYMD(new Date()); }
function dayNameOf(dateVal){
  if(!dateVal) return '';
  const [y,m,d] = String(dateVal).split('-').map(Number); // Parse as local date to avoid UTC offset bug
  if(!y||!m||!d) return '';
  return AR_DAYS[new Date(y, m-1, d).getDay()];
}
function autoSetDay(dateVal, selId='f-day'){
  const dayName = dayNameOf(dateVal); if(!dayName) return;
  const sel = document.getElementById(selId);
  for(let i=0;i<sel.options.length;i++){
    if(normDay(sel.options[i].value) === normDay(dayName)){ sel.selectedIndex=i; return; }
  }
}
// الاتجاه العكسي: اختيار اليوم → أقرب تاريخ بنفس اليوم في الماضي أو النهاردة
// (السراكي بتسجّل شغل اتعمل، فمنطقي نرجع لورا مش لقدام. لو عايز أسبوع أقدم اختار التاريخ من التقويم واليوم هيتظبط لوحده)
function dateForDayName(dayName){
  const target = AR_DAYS.findIndex(d=>normDay(d)===normDay(dayName));
  if(target===-1) return '';
  const base = new Date(); base.setHours(0,0,0,0);
  const diff = (base.getDay() - target + 7) % 7;   // كام يوم لورا لحد اليوم المطلوب (0 لو النهاردة)
  base.setDate(base.getDate() - diff);
  return toYMD(base);
}
function autoSetDateFromDay(dayName, dateInputId='f-date'){
  const d = dateForDayName(dayName); if(!d) return;
  const inp = document.getElementById(dateInputId);
  if(inp) inp.value = d;
}
function calcTotal(qId='f-qty',pId='f-price',dId='f-discount',tId='f-total'){const q=parseFloat(document.getElementById(qId).value)||0,p=parseFloat(document.getElementById(pId).value)||0,d=dId?(parseFloat(document.getElementById(dId).value)||0):0,t=q*p-d;document.getElementById(tId).value=t>=0?fmt(t)+' ج.م':'---';}
function rrCalcTotal(){ calcTotal('rr-qty','rr-price',null,'rr-total'); }

// ── إسقاط طلب إيجار معتمد في فورم السركي ──
// من غير كده المهندس بيكتب نفس بيانات الطلب اللي بعت بيه أصلاً تاني بإيده — والسيرفر
// بيربط طلب واحد بسطر سركي واحد بس، فالإسقاط هنا بيوفّر الكتابة ويمنع الفروق البسيطة.
let _rrPickList=[];          // الطلبات المعتمدة غير المستخدَمة
let _rrPickedId=null;        // الطلب المختار للسجل اللي بيتكتب دلوقتي
async function rrRefreshPickButton(){
  const wrap=document.getElementById('f-rr-pick-wrap');
  if(!wrap) return;
  if(!navigator.onLine || !getAccessToken() || !moduleEnabled('rent_requests')){ wrap.style.display='none'; return; }
  try{
    // نداء واحد بيخدم الاتنين: القايمة للاختيار (غير المستخدَم) والكاش للبادج (الكل).
    // usedByRecordId جاي من السيرفر، فالفلترة هنا نفس نتيجة unused=1 بالظبط بنص الطلبات.
    const approved=await api('GET','/api/rent-requests/approved');
    const all=approved.data||[];
    // usedByRecordId بييجي من السيرفر، لكن المزامنة مؤجَّلة 3 ثواني (وممكن الجهاز يبقى أوفلاين
    // خالص) — فالطلب اللي اتسجّل من شوية لسه بيبان "غير مستخدَم" في رد السيرفر. نستبعد كمان
    // أي طلب مربوط بسجل محلي، وإلا المهندس يقدر يسقّطه تاني في الفترة دي.
    const localUsed=new Set(records.filter(r=>r.rentRequestId!=null).map(r=>String(r.rentRequestId)));
    _rrPickList=all.filter(r=>!r.usedByRecordId && !localUsed.has(String(r.id)));
    wrap.style.display=_rrPickList.length?'':'none';
    _rrApprovedCache=all.map(r=>({
      id:r.id, requestNo:r.requestNo, qty:r.qty, qtyType:r.qtyType, price:r.price,
      date:r.date, contractor:r.contractorName, place:r.placeName
    }));
    try{ localStorage.setItem('cea_rr_approved_cache', JSON.stringify(_rrApprovedCache)); }catch(e){}
    renderRecords();
  }catch(e){ wrap.style.display='none'; }
}
function rrOpenPicker(){
  let ov=document.getElementById('rr-pick-overlay');
  if(!ov){ ov=document.createElement('div'); ov.id='rr-pick-overlay'; ov.className='modal-overlay'; document.body.appendChild(ov); }
  const rows=_rrPickList.map(r=>`<div class="home-row" style="cursor:pointer" onclick="rrPickApply(${jsArg(r.id)})">
      <div style="min-width:0"><div class="n">${esc(r.requestNo)} · ${RR_RESOURCE_LABEL[r.resourceType]||esc(r.resourceType)}</div>
      <div class="s">👷 ${esc(r.contractorName)} · 📍 ${esc(r.placeName)} · 📅 ${esc(r.date)} (${esc(r.day)})<br>${esc(r.qty)} ${esc(r.qtyType)} × ${fmt(r.price)}<br>📝 ${esc(r.statementOfWork)}</div></div>
    </div>`).join('');
  ov.innerHTML=`
    <div class="modal-box" role="dialog" aria-modal="true">
      <div class="modal-head">📥 اختر طلب إيجار معتمد</div>
      <div class="modal-body">
        <div class="list-scroll" style="max-height:400px">
          ${rows||'<div class="home-empty">لا يوجد طلبات إيجار معتمدة غير مستخدَمة</div>'}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-inline" onclick="rrClosePicker()">إلغاء</button>
      </div>
    </div>`;
  ov.style.display='flex';
  document.body.classList.add('modal-open');
}
function rrClosePicker(){
  const ov=document.getElementById('rr-pick-overlay'); if(ov) ov.style.display='none';
  document.body.classList.remove('modal-open');
}
function rrPickApply(id){
  const r=_rrPickList.find(x=>String(x.id)===String(id)); if(!r) return;
  document.getElementById('f-date').value=r.date; autoSetDay(r.date);
  document.getElementById('f-qty').value=r.qty;
  if(document.getElementById('f-qty-type')) document.getElementById('f-qty-type').value=r.qtyType;
  const missing=[];
  const cSel=document.getElementById('f-contractor');
  if(cSel){
    const hasContractor=[...cSel.options].some(o=>o.value===r.contractorName);
    if(hasContractor){ cSel.value=r.contractorName; fillSpec(); } else missing.push('المقاول "'+r.contractorName+'"');
  }
  const pSel=document.getElementById('f-place');
  if(pSel){
    const hasPlace=[...pSel.options].some(o=>o.value===r.placeName);
    if(hasPlace) pSel.value=r.placeName; else missing.push('المكان "'+r.placeName+'"');
  }
  document.getElementById('f-price').value=r.price;
  calcTotal();
  document.getElementById('f-notes').value=r.statementOfWork;
  _rrPickedId=r.id;
  rrClosePicker();
  // توست واحد بس: التاني كان بيبلع تحذير النقص، وهو الأهم للمهندس
  if(missing.length) showToast('⚠ طلب '+r.requestNo+' اترسّم، بس '+missing.join(' و')+' مش موجود في قوايمك — اختاره يدويًا', true);
  else showToast('📥 اترسّم طلب '+r.requestNo);
  window.scrollTo({top:0,behavior:'smooth'});
}
// ── لمسة مرحة لما المهندس يحط خصم على مقاول ──
// الشخصية دي عرض بس (display-only)، بتلمسش أي بيانات ولا حسابات — لو حصل فيها أي خطأ لازم
// السركي يفضل يتسجّل عادي، فكل حاجة هنا لازم تبقى جوّه try/catch.
let _mascotTimer = null;
// صورة المقاول الزعلان — data URI جوّه الملف عشان تشتغل أوفلاين من غير تعديل في sw.js
const MASCOT_SRC = 'data:image/png;base64,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';
const MASCOT_LINE = 'بتخصم عليا ليه يا هندسة؟ 🥺';
function mascotLineFor(discount, name){
  // الاسم بيخلي النكتة شخصية — بس لو طويل بيكسر الفقاعة، فبنقصّه
  const who = String(name||'').trim();
  return (who && who.length<=18) ? '(' + who + ') ' + MASCOT_LINE : MASCOT_LINE;
}
function mascotEnsureCSS(){
  if(document.getElementById('mascot-css')) return;
  const st = document.createElement('style');
  st.id = 'mascot-css';
  st.textContent = `
/* الشخصية z-index:0 والخانة z-index:1 بخلفية صلبة — كده الجسم بيتخفي ورا الخانة
   ويبان الراس بس طالع من وراها. لو اتعكسوا بتبقى قدام الخانة وده مش المطلوب.
   المرساة top + translateY(-100%) مقصودة: أسفل الصورة بيقف عند أسفل الـselect مهما زادت
   الشيبس تحته — لو ربطناها بـbottom كانت بتنزل مع كل شيب ويبان طرف الجسم مقصوص. */
#mascot-box{position:absolute;top:var(--mascot-anchor,68px);bottom:auto;right:6px;left:auto;
  z-index:0;pointer-events:none;display:flex;align-items:flex-end;gap:6px;
  transform:translateY(-100%);
  animation:mascot-rise .4s cubic-bezier(.34,1.4,.64,1);}
#mascot-box img{width:var(--mascot-w,96px);height:auto;display:block;pointer-events:none}
#mascot-box .mascot-bubble{pointer-events:auto;cursor:pointer;max-width:180px;font-size:13px;
  font-weight:700;line-height:1.35;background:var(--gold-bg);color:var(--gold-fg);
  border:1px solid var(--gold);border-radius:14px;padding:7px 10px;position:relative;margin-bottom:58px}
#mascot-box .mascot-bubble::after{content:'';position:absolute;bottom:-8px;right:18px;
  border:8px solid transparent;border-top-color:var(--gold-bg)}
#f-deduct-field{position:relative}
#f-deduct-field > label,#f-deduct-field > select,#f-deduct-field > .chips{position:relative;z-index:1}
#f-deduct-field > select{background:var(--input,#fff)}
@keyframes mascot-rise{from{transform:translateY(-100%) translateY(45%);opacity:0}to{transform:translateY(-100%) translateY(0);opacity:1}}
@media (prefers-reduced-motion: reduce){#mascot-box{animation:none}}
`;
  document.head.appendChild(st);
}
function mascotHide(){
  try{
    if(_mascotTimer){ clearTimeout(_mascotTimer); _mascotTimer=null; }
    const box = document.getElementById('mascot-box');
    if(box) box.remove();
  }catch(e){}
}
function mascotShow(text){
  try{
    mascotEnsureCSS();
    // خانة "بالخصم على" (اسم المقاول) مش خانة الفلوس — الشخصية هي المقاول اللي اتخصم عليه
    const wrap = document.getElementById('f-deduct-field');
    if(!wrap) return;
    let box = document.getElementById('mascot-box');
    if(!box){
      box = document.createElement('div');
      box.id = 'mascot-box';
      box.innerHTML = `<div class="mascot-bubble" onclick="mascotHide()"></div>
<img class="mascot-img" src="${MASCOT_SRC}" alt="" aria-hidden="true">`;
      wrap.appendChild(box);
    }
    const bubble = box.querySelector('.mascot-bubble');
    if(bubble) bubble.textContent = text;
    if(_mascotTimer) clearTimeout(_mascotTimer);
    _mascotTimer = setTimeout(mascotHide, 4000);
  }catch(e){}
}
function mascotReset(){
  mascotHide();
}
// بتتنادى من addDeductChip لما المهندس يختار مقاول في "بالخصم على".
// الزناد هنا مش في خانة الفلوس: الشخصية بتمثّل المقاول اللي اتخصم عليه، فاختياره هو اللحظة.
function discountMascot(name){
  try{
    // بتظهر مع كل إضافة مقاول — لو المهندس مسح الاسم وضافه تاني أو ضاف غيره، تطلع من جديد
    const v = parseFloat(document.getElementById('f-discount').value) || 0;
    mascotShow(mascotLineFor(v, name));
  }catch(e){}
}

// ── تذكرة مراجعة السراكي: المهندس بالخوذة ──
// بتظهر مرة واحدة في كل تشغيل للتطبيق، بعد أول إضافة مقاول أو مكان من الإعدادات.
// display-only زي الشخصية الأولى: كله جوّه try/catch وماتلمسش أي بيانات.
// صورة المهندس بالخوذة — data URI جوّه الملف زي المقاول، عشان تشتغل أوفلاين
const MASCOT_ENG_SRC = 'data:image/png;base64,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';
let _engMascotShown = false;   // مرة واحدة كل تشغيل — بترجع تشتغل بعد ما التطبيق يتقفل ويتفتح
let _engMascotTimer = null;
// اسم المهندس جوّه اسم ملف الكشف (22 سبتمبر 2026) — قبل كده الاسم مكانش في اسم الملف خالص،
// فملفين لنفس المقاول في نفس الأسبوع كان ليهم نفس الاسم بالحرف، والبحث عن صف الكشف في جوجل شيت
// (اسم مهندس + اسم ملف) كان بيلخبط بينهم. بنشيل الحروف اللي بتلخبط أسماء الملفات في Drive.
function subFileEngName(){
  try{
    const n=(localStorage.getItem('cea_user_name')||'').trim() || String(getCurrentUserEmail()||'').split('@')[0];
    return n.replace(/[\\\/\?\*\[\]:]/g,' ').replace(/\s+/g,' ').trim() || 'مهندس';
  }catch(e){ return 'مهندس'; }
}
function engMascotWho(){
  try{
    const n = (localStorage.getItem('cea_user_name')||'').trim();
    return n ? 'م. ' + n : 'يا بشمهندس';
  }catch(e){ return 'يا بشمهندس'; }
}
function engMascotEnsureCSS(){
  if(document.getElementById('eng-mascot-css')) return;
  const st = document.createElement('style');
  st.id = 'eng-mascot-css';
  st.textContent = `
/* طبقة في نص الشاشة — الخلفية شفافة ومابتمنعش اللمس، الكارت بس اللي بيستقبل اللمس */
/* بدون كارت ولا خلفية: الشخصية نفسها واقفة جوّه قايمة السجلات وبتشاور عليها.
   بتتحط أخت لـ#records-list مش جوّاه — renderRecords بيمسح innerHTML بتاعه كل مرة. */
#eng-mascot{position:absolute;z-index:60;pointer-events:none;
  left:var(--eng-left,10px);right:auto;top:0;direction:ltr;   /* ltr عشان الصورة تفضل شمال والفقاعة يمين */
  display:flex;align-items:flex-start;gap:6px;
  animation:eng-pop .35s cubic-bezier(.34,1.4,.64,1)}
/* الصورة متقلوبة عشان يشاور ناحية محتوى السجل (يمين في الـRTL) */
#eng-mascot img{width:var(--eng-w,74px);height:auto;display:block;flex:0 0 auto;
  transform:scaleX(-1);filter:drop-shadow(0 4px 10px rgba(0,0,0,.22))}
#eng-mascot .eng-bubble{direction:rtl;pointer-events:auto;cursor:pointer;align-self:center;max-width:190px;
  font-weight:700;font-size:12.5px;line-height:1.4;background:var(--gold-bg);color:var(--gold-fg);
  border:1px solid var(--gold);border-radius:14px;padding:7px 10px;position:relative}
#eng-mascot .eng-bubble::after{content:'';position:absolute;top:50%;margin-top:-7px;left:-14px;
  border:7px solid transparent;border-right-color:var(--gold-bg)}
#eng-mascot .eng-hint{display:block;margin-top:3px;font-weight:600;font-size:11px;opacity:.65}
@keyframes eng-pop{from{transform:translateY(8px) scale(.9);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
@media (prefers-reduced-motion: reduce){#eng-mascot{animation:none}}
`;
  document.head.appendChild(st);
}
function engMascotHide(){
  try{
    if(_engMascotTimer){ clearTimeout(_engMascotTimer); _engMascotTimer=null; }
    const el = document.getElementById('eng-mascot');
    if(el) el.remove();
  }catch(e){}
}
function engMascotGo(){
  try{ engMascotHide(); switchTab('records'); }catch(e){}
}
// بتتنادى من خانتَي "مقاولين/أماكن" اللي جوّه صفحة السراكي — بتظهر لما الاتنين يتحددوا
// (المكان آخر واحد عادةً، وهو تحت في الصفحة، فالمهندس بيكون نازل وشايفها)
function reviewMascot(){
  try{
    if(_engMascotShown) return;
    // لازم مقاول **و** مكان الاتنين — عشان المهندس يكون نزل لتحت للأماكن ويبقى شايف الشخصية.
    // مابنعلّمش _engMascotShown قبل الشرط ده، عشان تفضل تشتغل لما الزوج يكتمل.
    if(!exportContractorChips.length || !exportPlaceChips.length) return;
    _engMascotShown = true;
    engMascotEnsureCSS();
    engMascotHide();
    // مافيش switchTab — الزناد بقى من خانتَي "مقاولين/أماكن" اللي جوّه صفحة السراكي نفسها
    const list = document.getElementById('records-list');
    const host = list && list.parentElement;
    if(!host) { _engMascotShown = false; return; }
    if(getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const el = document.createElement('div');
    el.id = 'eng-mascot';
    el.onclick = engMascotHide;
    el.innerHTML = `<img src="${MASCOT_ENG_SRC}" alt="" aria-hidden="true">
<div class="eng-bubble">${esc(engMascotWho())} متنساش مراجعة السراكي 👷
  <span class="eng-hint">المس للإخفاء</span></div>`;
    host.appendChild(el);
    // القايمة نفسها مش وعاء صالح (innerHTML بيتمسح)، فبنحسب موضعها جوّه الپانل ونحط الشخصية فوقيها
    el.style.top = Math.max(0, list.offsetTop + 26) + 'px';
    _engMascotTimer = setTimeout(engMascotHide, 6000);
  }catch(e){}
}
// ── تذكرة المعتمدين: كشوف مستنية مراجعتك ──
// بتظهر لمدير معتمد أول ما يفتح التطبيق ولقيناه عنده كشوف دوره فيها.
// صورة المهندس بالكليب بورد — data URI جوّه الملف زي الباقي، عشان تشتغل أوفلاين
const MASCOT_APR_SRC = 'data:image/png;base64,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';
const APPROVER_GRADES = ['team leader','construction manager','project manager'];
let _aprMascotShown = false;   // مرة واحدة كل تشغيل
let _aprMascotTimer = null;
function aprMascotIsApprover(){
  try{
    if(isAdmin()) return true;
    return APPROVER_GRADES.indexOf(localStorage.getItem('cea_user_grade')||'') >= 0;
  }catch(e){ return false; }
}
// جمع عربي صحيح: كشف / كشفين / ٣-١٠ كشوف / ١١+ كشف
function aprMascotCountText(n){
  const ar = Number(n).toLocaleString('ar-EG');
  if(n===1) return 'كشف واحد مستني مراجعتك';
  if(n===2) return 'كشفين مستنيين مراجعتك';
  if(n<=10) return ar+' كشوف مستنية مراجعتك';
  return ar+' كشف مستني مراجعتك';
}
function aprMascotEnsureCSS(){
  if(document.getElementById('apr-mascot-css')) return;
  const st = document.createElement('style');
  st.id = 'apr-mascot-css';
  st.textContent = `
/* نفس مبدأ شخصية السراكي: من غير كارت، الشخصية والفقاعة بس، جوّه الصفحة الرئيسية */
#apr-mascot{position:absolute;left:var(--apr-left,10px);right:auto;top:var(--apr-top,8px);
  z-index:60;pointer-events:none;direction:ltr;display:flex;align-items:flex-start;gap:6px;
  animation:eng-pop .35s cubic-bezier(.34,1.4,.64,1)}
#apr-mascot img{width:var(--apr-w,74px);height:auto;display:block;flex:0 0 auto;
  transform:scaleX(-1);filter:drop-shadow(0 4px 10px rgba(0,0,0,.22))}
#apr-mascot .apr-bubble{direction:rtl;pointer-events:auto;cursor:pointer;align-self:center;max-width:190px;
  font-weight:700;font-size:12.5px;line-height:1.4;background:var(--gold-bg);color:var(--gold-fg);
  border:1px solid var(--gold);border-radius:14px;padding:7px 10px;position:relative}
#apr-mascot .apr-bubble::after{content:'';position:absolute;top:50%;margin-top:-7px;left:-14px;
  border:7px solid transparent;border-right-color:var(--gold-bg)}
#apr-mascot .apr-hint{display:block;margin-top:3px;font-weight:600;font-size:11px;opacity:.65}
@media (prefers-reduced-motion: reduce){#apr-mascot{animation:none}}
`;
  document.head.appendChild(st);
}
function aprMascotHide(){
  try{
    if(_aprMascotTimer){ clearTimeout(_aprMascotTimer); _aprMascotTimer=null; }
    const el = document.getElementById('apr-mascot');
    if(el) el.remove();
  }catch(e){}
}
function aprMascotGo(){
  try{ aprMascotHide(); switchTab('approvals'); }catch(e){}
}
function aprMascotShow(n){
  try{
    aprMascotEnsureCSS();
    aprMascotHide();
    const host = document.getElementById('tab-home');
    if(!host) return;
    if(getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const el = document.createElement('div');
    el.id = 'apr-mascot';
    el.innerHTML = `<img src="${MASCOT_APR_SRC}" alt="" aria-hidden="true">
<div class="apr-bubble" onclick="aprMascotGo()">${esc(engMascotWho())} عندك ${esc(aprMascotCountText(n))}
  <span class="apr-hint">المس للانتقال للاعتمادات</span></div>`;
    host.appendChild(el);
    _aprMascotTimer = setTimeout(aprMascotHide, 7000);
  }catch(e){}
}
// طلب واحد زيادة وقت الإقلاع، وللمعتمدين بس. بيفشل بصمت (أوفلاين/توكن منتهي) والتطبيق مايتأثرش.
async function aprMascotBoot(){
  try{
    if(_aprMascotShown) return;
    if(!navigator.onLine || !getAccessToken()) return;
    if(!aprMascotIsApprover()) return;
    _aprMascotShown = true;
    const q = await api('GET','/api/approvals/queue');
    const mine = (q.data||[]).filter(r => r.reviewState==='IN_REVIEW' && r.canAct);
    if(!mine.length) return;
    aprMascotShow(mine.length);
  }catch(e){}
}
// بنستنى الجلسة تجهز (التوكن بيتحمّل بعد بوابة الدخول) — محاولات قصيرة وبعدين بنسيب الموضوع
document.addEventListener('DOMContentLoaded', ()=>{
  let tries = 12;
  const tick = ()=>{
    if(_aprMascotShown) return;
    if(getAccessToken()){ aprMascotBoot(); return; }
    if(--tries > 0) setTimeout(tick, 800);
  };
  setTimeout(tick, 1500);
});

function saveRecord(){
  const day=document.getElementById('f-day').value.trim(),date=document.getElementById('f-date').value.trim(),contractor=document.getElementById('f-contractor').value.trim(),spec=document.getElementById('f-spec').value.trim(),qty=parseFloat(document.getElementById('f-qty').value)||0,price=parseFloat(document.getElementById('f-price').value)||0,discount=parseFloat(document.getElementById('f-discount').value)||0,total=qty*price-discount,place=document.getElementById('f-place').value.trim(),notes=document.getElementById('f-notes').value.trim();
  const qtyType = (document.getElementById('f-qty-type') ? document.getElementById('f-qty-type').value : 'يومية');
  const deductOn   = getDeductOn(); // array of selected contractor names
  const deductNote = (document.getElementById('f-deduct-note') ? document.getElementById('f-deduct-note').value.trim() : '');
  if(!day){showToast('⚠ اختر اليوم',true);return;}if(!contractor){showToast('⚠ اختر المقاول',true);return;}if(!place){showToast('⚠ اختر مكان الأعمال',true);return;}if(!qty||!price){showToast('⚠ أدخل العدد والسعر',true);return;}
  const isNew = editingId===null;
  if(!isNew){const idx=records.findIndex(r=>r.id===editingId);if(idx!==-1)records[idx]={...records[idx],day,date,contractor,spec,qty,qtyType,price,discount,total,place,notes,deductOn,deductNote,rentRequestId:_rrPickedId};}
  else{records.push({id:Date.now(),day,date,contractor,spec,qty,qtyType,price,discount,total,place,notes,deductOn,deductNote,rentRequestId:_rrPickedId});}
  // الحفظ فشل (الذاكرة اتملت): النموذج بيفضل زي ما هو عشان البيانات متضيعش — لكن لازم كمان
  // نشيل السجل من الذاكرة، وإلا دوسة "تسجيل" تانية بتعمل نسخة تانية بـid جديد، والمزامنة
  // بترفع من الذاكرة فالمكرر بيوصل السيرفر والكشف المعتمد. ورسالة النجاح مابتظهرش إلا بعد حفظ فعلي.
  if(!saveAll()){ if(isNew) records.pop(); return; }
  if(!isNew){editingId=null;document.getElementById('edit-banner').classList.remove('show');document.getElementById('save-btn').textContent='✅ تسجيل البيانات';showToast('✏️ تم التعديل بنجاح!');}
  else showToast('✅ تم التسجيل بنجاح!');
  _rrPickedId=null; rrRefreshPickButton(); mascotReset();
  renderRecords();renderSummary();clearForm(false);
}
function editRecord(id){const r=records.find(x=>x.id===id);if(!r)return;editingId=id;switchTab('form');_rrPickedId=r.rentRequestId??null;document.getElementById('f-date').value=r.date;autoSetDay(r.date);if(!document.getElementById('f-day').value)document.getElementById('f-day').value=r.day;document.getElementById('f-qty').value=r.qty;if(document.getElementById('f-qty-type')) document.getElementById('f-qty-type').value=r.qtyType||'يومية';document.getElementById('f-price').value=r.price;document.getElementById('f-discount').value=r.discount;document.getElementById('f-notes').value=r.notes;document.getElementById('f-place').value=r.place;document.getElementById('f-contractor').value=r.contractor;document.getElementById('f-spec').value=r.spec;calcTotal();
  setDeductChips(r.deductOn||[]);
  if(r.deductNote) document.getElementById('f-deduct-note').value=r.deductNote;
  updatePlaceNoteIcon();
  document.getElementById('edit-banner').classList.add('show');document.getElementById('save-btn').textContent='💾 حفظ التعديل';window.scrollTo({top:0,behavior:'smooth'});}
function cancelEdit(){editingId=null;document.getElementById('edit-banner').classList.remove('show');document.getElementById('save-btn').textContent='✅ تسجيل البيانات';clearForm(false);}
function clearForm(ask=true){if(ask&&!confirm('هل تريد مسح النموذج؟'))return;['f-day','f-spec','f-qty','f-price','f-notes','f-place','f-total'].forEach(id=>document.getElementById(id).value='');document.getElementById('f-discount').value='0';if(document.getElementById('f-qty-type')) document.getElementById('f-qty-type').value='يومية';document.getElementById('f-date').value=todayYMD();autoSetDay(todayYMD());const cs=document.getElementById('f-contractor');if(cs)cs.selectedIndex=0;setDeductChips([]);const ds=document.getElementById('f-deduct-on-select');if(ds)ds.selectedIndex=0;_rrPickedId=null;mascotReset();}
function deleteRecord(id){if(!confirm('حذف هذا السجل؟'))return;records=records.filter(r=>r.id!==id);saveAll();renderRecords();renderSummary();showToast('🗑 تم الحذف');}
// done = مستبعَد من شيت الإكسيل المعتمد (اسم الحقل تاريخي؛ معناه الحالي: استبعاد من التصدير)
function toggleDone(id){const idx=records.findIndex(r=>r.id===id);if(idx===-1)return;records[idx].done=!records[idx].done;saveAll();renderRecords();showToast(records[idx].done?'🚫 مش هيتسجل في الإكسيل المعتمد':'↩️ رجع للإكسيل المعتمد');}

function saveIR(){
  const date=document.getElementById('ir-date').value,item=document.getElementById('ir-item').value,place=document.getElementById('ir-place').value,inspector=document.getElementById('ir-inspector').value,status=document.getElementById('ir-status').value,notes=document.getElementById('ir-notes').value.trim();
  if(!item){showToast('⚠ اختر البند',true);return;}if(!place){showToast('⚠ اختر المكان',true);return;}if(!status){showToast('⚠ اختر الحالة',true);return;}
  const isNewIr = irEditingId===null;
  if(!isNewIr){const idx=irRecords.findIndex(r=>r.id===irEditingId);if(idx!==-1)irRecords[idx]={...irRecords[idx],date,item,place,inspector,status,notes};}
  else{irRecords.push({id:Date.now(),date,item,place,inspector,status,notes});}
  // الحفظ فشل → شيل الجديد من الذاكرة وسيب النموذج مليان (كان بيتفضّى والبيانات تضيع)
  if(!saveAll()){ if(isNewIr) irRecords.pop(); renderIR(); return; }
  if(!isNewIr){irEditingId=null;document.getElementById('ir-edit-banner').classList.remove('show');document.getElementById('ir-save-btn').textContent='✅ تسجيل IR';showToast('✏️ تم تعديل IR');}
  else showToast('✅ تم تسجيل IR بنجاح!');
  renderIR();renderSummary();clearIRForm();
}
function clearIRForm(){document.getElementById('ir-item').value='';document.getElementById('ir-place').value='';document.getElementById('ir-inspector').value='';document.getElementById('ir-status').value='';document.getElementById('ir-notes').value='';document.getElementById('ir-date').value=todayYMD();}
function editIR(id){const r=irRecords.find(x=>x.id===id);if(!r)return;irEditingId=id;document.getElementById('ir-date').value=r.date;document.getElementById('ir-item').value=r.item;document.getElementById('ir-place').value=r.place;document.getElementById('ir-inspector').value=r.inspector;document.getElementById('ir-status').value=r.status;document.getElementById('ir-notes').value=r.notes;document.getElementById('ir-edit-banner').classList.add('show');document.getElementById('ir-save-btn').textContent='💾 حفظ تعديل IR';window.scrollTo({top:0,behavior:'smooth'});}
function cancelIrEdit(){irEditingId=null;document.getElementById('ir-edit-banner').classList.remove('show');document.getElementById('ir-save-btn').textContent='✅ تسجيل IR';clearIRForm();}
function deleteIR(id){if(!confirm('حذف هذا السجل؟'))return;irRecords=irRecords.filter(r=>r.id!==id);saveAll();renderIR();renderSummary();showToast('🗑 تم الحذف');}


function setSort(field) {
  if(sortField === field) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortField = field;
    sortDir = 'asc';
  }
  ['date','contractor','place','total'].forEach(f => {
    const btn = document.getElementById('sort-'+f);
    if(!btn) return;
    btn.className = 'sort-btn' + (sortField===f ? ' active ' + sortDir : '');
  });
  renderRecords();
}

// قيم الفلاتر الحالية في تبويب السراكي (مصدر واحد للحقيقة للعرض والتصدير)
function getRecordFilters(){
  const val=id=>{const el=document.getElementById(id);return el?(el.value||'').trim():'';};
  return { nq:val('search-name').toLowerCase(), pq:val('search-place'), dq:val('search-day'), cq:val('search-contractor-filter') };
}
// نفس الفلاتر + نفس الترتيب اللي على الشاشة — بتستخدمها renderRecords و exportExcel
function getFilteredRecords(){
  const {nq,pq,dq,cq}=getRecordFilters();
  let f=[...records].reverse();
  if(nq)f=f.filter(r=>(r.contractor||'').toLowerCase().includes(nq));
  if(pq)f=f.filter(r=>r.place===pq);
  if(dq)f=f.filter(r=>r.date===dq);
  else if(!showAll) {
    // Filter by current week offset (Wed→Tue)
    const {start, end} = getWeekBounds(weekOffset);
    const s = toYMD(start), e = toYMD(end);
    f = f.filter(r => r.date >= s && r.date <= e);
  }
  if(cq)f=f.filter(r=>r.contractor===cq);
  if(exportContractorChips.length) f=f.filter(r=>exportContractorChips.includes(r.contractor));
  if(exportPlaceChips.length)      f=f.filter(r=>exportPlaceChips.includes(r.place));
  if(sortField){
    f.sort((a,b)=>{
      let va=a[sortField]||'', vb=b[sortField]||'';
      if(sortField==='total'){va=Number(va)||0;vb=Number(vb)||0;return sortDir==='asc'?va-vb:vb-va;}
      return sortDir==='asc'?String(va).localeCompare(String(vb),'ar'):String(vb).localeCompare(String(va),'ar');
    });
  } else if(exportContractorChips.length){
    // رتّب السجل حسب ترتيب اختيار المقاولين (كل مقاول مجموعة لوحده بالترتيب اللي اتحدد بيه)
    f.sort((a,b)=>exportContractorChips.indexOf(a.contractor)-exportContractorChips.indexOf(b.contractor));
  }
  return f;
}
const deductList = r => Array.isArray(r.deductOn)?r.deductOn:(r.deductOn?[r.deductOn]:[]);
// وصف النطاق الحالي (للأسماء وعناوين الملفات): المقاولين المختارين + الأسبوع أو "الكل"
function scopeLabel(sep='_'){
  const who = exportContractorChips.length===1 ? exportContractorChips[0]
            : exportContractorChips.length>1  ? `${exportContractorChips.length}${sep}مقاولين` : '';
  let when;
  if(showAll) when='كل_السجلات'.replace('_',sep);
  else { const {start,end}=getWeekBounds(weekOffset); when=`${toYMD(start)}${sep}${toYMD(end)}`; }
  return [who,when].filter(Boolean).join(sep);
}

function renderRecords(){
  const list=document.getElementById('records-list');
  const f=getFilteredRecords();
  document.getElementById('rec-count').textContent=f.length+' سجل';
  if(!f.length){list.innerHTML=records.length?`<div class="empty-state"><div class="icon">🔍</div><p>لا يوجد نتائج بالفلتر ده</p></div>`:`<div class="empty-state"><div class="icon">📋</div><p>لا يوجد سجلات بعد</p></div>`;return;}
  list.innerHTML=f.map(r=>{
    const da=deductList(r);
    // بادج "متطابق": مراجعة قبل الإرسال فقط — بتختفي أول ما السطر يتبعت للمعتمد (submittedAt)
    const rrM = (!r.submittedAt) ? rrMatchFor(r) : null;
    const rrOk = rrM && Number(rrM.qty)===Number(r.qty) && Number(rrM.price)===Number(r.price);
    const rrBadge = rrM ? (rrOk
      ? `<span class="badge" style="background:var(--ok-bg);color:var(--ok-fg)">✅ مطابق ${esc(rrM.requestNo)}</span>`
      : `<span class="badge" style="background:var(--warn-bg);color:var(--warn-fg)">⚠ مطابق ${esc(rrM.requestNo)} — الكمية/السعر مختلفين</span>`) : '';
    return `<div class="record-card ${r.done?'excluded-card':''}">
      <div class="record-head">
        <div class="record-title"><div class="record-name">${esc(r.contractor)}</div><div class="record-spec">${esc(r.spec)}</div></div>
        <div class="record-side"><div class="record-total">${fmt(r.total)}<small>ج.م</small></div></div>
        <div class="record-actions">
          <button class="icon-btn edit" onclick="editRecord(${r.id})" title="تعديل">✏️</button>
          <button class="icon-btn del"  onclick="deleteRecord(${r.id})" title="حذف">✕</button>
        </div>
      </div>
      <div class="record-meta">
        <span class="badge">📅 ${esc(r.day)} ${esc(r.date)}</span>
        ${r.place?`<span class="badge">📍 ${esc(r.place)}</span>`:''}
        <span class="badge">⚒ ${esc(r.qty)} ${esc(r.qtyType||'')} × ${fmt(r.price)}</span>
        ${r.discount>0?`<span class="badge badge-warn">خصم ${fmt(r.discount)}</span>`:''}
        ${rrBadge}
      </div>
      ${(r.syncError&&isAdmin())?`<div class="record-notes" style="background:var(--danger-bg);color:var(--danger-fg);font-weight:800">⚠ السجل ده ما اترفعش للسيرفر — ${esc(r.syncError)}. عدّله بالقلم ✏️ وهيترفع لوحده.</div>`:''}
      ${r.notes?`<div class="record-notes">📝 ${esc(r.notes)}</div>`:''}
      ${da.length?`<div class="deduct-box"><b>🔴 بالخصم على: ${esc(da.join(' ، '))}</b>${r.deductNote?`<br><span class="note">📌 ${esc(r.deductNote)}</span>`:''}</div>`:''}
      <div class="done-toggle exclude-toggle ${r.done?'on':''}" onclick="toggleDone(${r.id})"><div class="box">${r.done?'✗':''}</div><span>${r.done?'مش هيتسجل في شيت الإكسيل المعتمد':'عايز تحذف السجل من شيت الإكسيل المعتمد؟'}</span></div>
    </div>`;
  }).join('');
}

function renderIR(){
  const list=document.getElementById('ir-list');
  const q=(document.getElementById('ir-search').value||'').trim().toLowerCase();
  const sq=(document.getElementById('ir-filter-status').value||'').trim();
  let f=[...irRecords].reverse();
  if(q)f=f.filter(r=>(r.item||'').toLowerCase().includes(q)||(r.place||'').toLowerCase().includes(q)||(r.inspector||'').toLowerCase().includes(q)||(r.notes||'').toLowerCase().includes(q));
  if(sq)f=f.filter(r=>r.status===sq);
  document.getElementById('ir-count').textContent=f.length+' سجل';
  if(!f.length){list.innerHTML=irRecords.length?`<div class="empty-state"><div class="icon">🔍</div><p>لا يوجد نتائج</p></div>`:`<div class="empty-state"><div class="icon">📋</div><p>لا يوجد سجلات IR بعد</p></div>`;return;}
  const statusLabel={A:'A — مستلم بدون ملاحظات ✅',B:'B — مستلم مع ملاحظات ⚠️',C:'C — استلام بعد الملاحظات 🔄'};
  list.innerHTML=f.map(r=>{
    const st=String(r.status||'').toUpperCase(), stl=st.toLowerCase();
    return `<div class="record-card ir-card">
      <div class="record-head">
        <div class="record-title"><div class="record-name" style="font-size:13px">${esc(r.item)}</div><div class="record-spec">${esc(r.place)}${r.inspector?' · '+esc(r.inspector):''}</div></div>
        <div class="record-side"><span class="ir-status ir-${stl}">${esc(st)}</span></div>
        <div class="record-actions">
          <button class="icon-btn edit" onclick="editIR(${r.id})" title="تعديل">✏️</button>
          <button class="icon-btn del"  onclick="deleteIR(${r.id})" title="حذف">✕</button>
        </div>
      </div>
      <div class="record-meta"><span class="badge">📅 ${esc(r.date)}</span><span class="badge badge-${stl}">${statusLabel[st]||''}</span></div>
      ${r.notes?`<div class="record-notes">📝 ${esc(r.notes)}</div>`:''}
    </div>`;
  }).join('');
}

function renderSummary(){
  const total=records.reduce((s,r)=>s+r.total,0),discount=records.reduce((s,r)=>s+r.discount,0),gross=records.reduce((s,r)=>s+(r.qty*r.price),0);
  document.getElementById('s-count').textContent=records.length;
  document.getElementById('s-total').textContent=fmt(total);
  document.getElementById('s-discount').textContent=fmt(discount);
  document.getElementById('s-gross').textContent=fmt(gross);
  document.getElementById('s-ir-a').textContent=irRecords.filter(r=>r.status==='A').length;
  document.getElementById('s-ir-b').textContent=irRecords.filter(r=>r.status==='B').length;
  document.getElementById('s-ir-c').textContent=irRecords.filter(r=>r.status==='C').length;
  document.getElementById('s-ir-total').textContent=irRecords.length;
  const byC={};records.forEach(r=>{if(!byC[r.contractor])byC[r.contractor]={total:0,count:0,spec:r.spec};byC[r.contractor].total+=r.total;byC[r.contractor].count++;});
  const el=document.getElementById('contractor-summary');
  if(!Object.keys(byC).length){el.innerHTML='<p style="color:var(--muted);text-align:center;padding:16px;font-size:12px">لا يوجد بيانات بعد</p>';return;}
  el.innerHTML=Object.entries(byC).sort((a,b)=>b[1].total-a[1].total).map(([name,info])=>`<div class="contractor-row"><div style="min-width:0"><div class="n">${esc(name)}</div><div class="s">${esc(info.spec)} · ${info.count} سجل</div></div><div class="v">${fmt(info.total)} ج.م</div></div>`).join('');
}

// ── الوحدات المفعّلة للحساب (يحددها الأدمن من "إدارة الحسابات") ──
// الافتراضي قبل أول مزامنة = الأساسيات؛ بتتحدث من السيرفر مع كل مزامنة
const ALL_MODULES=['records','submissions','ir','site_daily','site_exec','todo','summary','inventory','approvals','equipment','analytics','rent_requests','rent_approvals','labor_analytics'];
const MODULE_LABELS={records:'السراكي (تسجيل + قائمة)', submissions:'التسليمات (إرسال الكشوف للاعتماد)', ir:'طلبات الفحص (IR)', site_daily:'التقرير اليومي', site_exec:'الموقف التنفيذي', todo:'المهام', summary:'الملخص', inventory:'المخازن (مخزون + طلبات صرف وشراء)', approvals:'اعتمادات المديرين (مراجعة واعتماد الكشوف)', equipment:'سراكي معدات (شهري) — إيجار معدات 20→19', analytics:'تحليلات المشروع (أماكن + مقاولين — للمديرين)', rent_requests:'طلبات الإيجار (طلب معدات/عمالة + اعتماد مدير المشروع)', rent_approvals:'اعتماد طلبات الإيجار (مراجعة واعتماد طلبات المعدات والعمالة)', labor_analytics:'تحليل العمالة (يوميات مقاولين العمالة قبل/بعد الاعتماد — كل المهندسين)'};
// أي شاشة (tab) تابعة لأنهي وحدة — الشاشات غير المذكورة (home/settings/admin) دايمًا متاحة
const TAB_MODULE={form:'records', records:'records', submissions:'submissions', ir:'ir', site:['site_daily','site_exec'], todo:'todo', summary:'summary', inventory:'inventory', approvals:'approvals', equipment:'equipment', analytics:'analytics', rent_requests:'rent_requests', rent_approvals:'rent_approvals', labor:'labor_analytics'};
let enabledModules=JSON.parse(localStorage.getItem('cea_enabled_modules')||'null')||['records','submissions','todo','summary'];
function setEnabledModules(list){
  enabledModules=Array.isArray(list)?list.filter(m=>ALL_MODULES.includes(m)):[];
  localStorage.setItem('cea_enabled_modules', JSON.stringify(enabledModules));
  applyModuleVisibility();
}
function moduleEnabled(m){ return enabledModules.includes(m); }

// ── الكروت (أجزاء داخل الشاشات) — نفس القائمة في backend/src/utils/modules.ts ──
const ALL_FEATURES=[
  {key:'home_stats',        label:'بطاقات الأرقام (اليوم/الأسبوع/المهام/الإنجاز)', group:'الرئيسية'},
  {key:'home_recent',       label:'آخر السجلات',                group:'الرئيسية'},
  {key:'home_todos',        label:'مهام اليوم',                 group:'الرئيسية'},
  {key:'records_export',    label:'تصدير Excel معتمد',          group:'السراكي'},
  {key:'records_search',    label:'فلتر البحث',                 group:'السراكي'},
  {key:'records_sort',      label:'فلتر الترتيب',               group:'السراكي'},
  {key:'records_export_chips', label:'مقاولين وأماكن محددين للتصدير المعتمد', group:'السراكي'},
  {key:'records_statement', label:'بيان أعمال المقاول (PDF غير رسمي)', group:'السراكي'},
  // الاعتمادات — زرار Google Form لكل موقع (الاسم بيتحدث تلقائيًا من أسماء المواقع)
  {key:'gform_site1',       label:'زرار Google Form — الموقع الأول', group:'الاعتمادات'},
  {key:'gform_site2',       label:'زرار Google Form — الموقع الثاني', group:'الاعتمادات'},
  // سراكي المعدات — كارت "إعدادات السركي الشهري" في تاب الإعدادات (المقاول الثابت + الموقع): بيظهر لمن عنده وحدة المعدات، والأدمن يقدر يخفيه
  {key:'equipment_settings', label:'إعدادات السركي الشهري في تاب الإعدادات (المقاول الثابت + الموقع)', group:'سراكي المعدات'},
  {key:'set_appearance',    label:'المظهر (الوضع الداكن)',       group:'الإعدادات'},
  {key:'set_contractors',   label:'إدارة المقاولين',            group:'الإعدادات'},
  {key:'set_places',        label:'إدارة أماكن الأعمال',        group:'الإعدادات'},
  {key:'set_inspectors',    label:'إدارة الاستشاريين',          group:'الإعدادات'},
  {key:'set_items',         label:'إدارة بنود المقايسة',        group:'الإعدادات'},
  {key:'set_items_import',  label:'استيراد بنود من Excel',      group:'الإعدادات'},
  {key:'set_records_import',label:'استرداد السجلات من Excel',   group:'الإعدادات'},
  {key:'set_backup',        label:'النسخة الاحتياطية',          group:'الإعدادات'},
  {key:'set_account',       label:'الحساب',                     group:'الإعدادات'},
  {key:'set_pin',           label:'حماية PIN',                  group:'الإعدادات'},
  {key:'set_sync',          label:'مزامنة السجلات',             group:'الإعدادات'},
  {key:'set_signature',     label:'توقيع المهندس',              group:'الإعدادات'},
  {key:'set_danger',        label:'منطقة الخطر (حذف/تهيئة)',    group:'الإعدادات'},
];
const FEATURE_KEYS=ALL_FEATURES.map(f=>f.key);
const DEFAULT_FEATURES=FEATURE_KEYS.filter(k=>!['set_danger','set_records_import','set_items_import','gform_site2'].includes(k));
// قوايم قديمة متحفوظة بالمفتاح الموحّد 'records_filters' (قبل فصله لبحث/ترتيب/تصدير معتمد) — بنترجمها للمفاتيح الجديدة
function migrateFeatureList(list){
  if(!Array.isArray(list)||!list.includes('records_filters')) return list;
  return list.filter(k=>k!=='records_filters').concat(['records_search','records_sort','records_export_chips']);
}
let enabledFeatures=migrateFeatureList(JSON.parse(localStorage.getItem('cea_enabled_features')||'null'))||(localStorage.getItem('cea_user_role')==='ADMIN'?FEATURE_KEYS:DEFAULT_FEATURES);
function setEnabledFeatures(list){
  list=migrateFeatureList(list);
  enabledFeatures=Array.isArray(list)?list.filter(k=>FEATURE_KEYS.includes(k)):[];
  localStorage.setItem('cea_enabled_features', JSON.stringify(enabledFeatures));
  applyModuleVisibility();
}
function featureEnabled(k){ return enabledFeatures.includes(k); }
function tabEnabled(tab){
  const m=TAB_MODULE[tab]; if(!m) return true;
  return Array.isArray(m) ? m.some(moduleEnabled) : moduleEnabled(m);
}
// إخفاء/إظهار عناصر الواجهة حسب الوحدات: القائمة الجانبية، الشريط السفلي، بطاقات الرئيسية، تبويبات "الموقف"
function applyModuleVisibility(){
  applyFormButtons(); // زرار الفورم بيتبع فيتشرز gform_site1/2
  document.querySelectorAll('.drawer-item[data-tab], .bb-item[data-tab]').forEach(el=>{
    const t=el.dataset.tab; if(t==='more') return;
    // عناصر الأدمن (إدارة الحسابات): للأدمن فقط — من غير الشرط ده اللوب كانت بتظهرها لأي مستخدم
    if(el.classList.contains('admin-only')){ el.style.display = isAdmin() ? '' : 'none'; return; }
    el.style.display = tabEnabled(t) ? '' : 'none';
  });
  document.querySelectorAll('[data-module]').forEach(el=>{
    const mods=el.dataset.module.split(',');
    el.style.display = mods.some(moduleEnabled) ? '' : 'none';
  });
  // الكروت: لو العنصر عليه وحدة كمان، لازم الاتنين يكونوا مفعّلين
  document.querySelectorAll('[data-feature]').forEach(el=>{
    const modOk = !el.dataset.module || el.dataset.module.split(',').some(moduleEnabled);
    el.style.display = (modOk && featureEnabled(el.dataset.feature)) ? '' : 'none';
  });
  // تبويبات "الموقف": لو واحدة بس مفعّلة، نخفي شريط التبويبات ونفتحها مباشرة
  const dailyOn=moduleEnabled('site_daily'), execOn=moduleEnabled('site_exec');
  // ⚠ مقصورة على تاب الموقع: شاشات تانية (طلبات الإيجار) بتستخدم نفس كلاس .stab بقيم data-stab مختلفة،
  // والاستعلام العام كان بيخفي زرايرها لأنها مش daily/exec.
  const stabs=document.querySelectorAll('#tab-site .stab[data-stab]');
  stabs.forEach(b=>{ const k=b.dataset.stab; b.style.display = ((k==='daily'&&dailyOn)||(k==='exec'&&execOn)) ? '' : 'none'; });
  // لو الشاشة الحالية اتقفلت — ارجع للرئيسية
  const cur=document.querySelector('.panel.active');
  if(cur){ const t=cur.id.replace('tab-',''); if(!tabEnabled(t)) switchTab('home'); }
}

// عناوين الشاشات (تظهر في الهيدر) — الترتيب نفسه في القائمة الجانبية
const TAB_TITLES = { home:'الرئيسية', form:'تسجيل سركي', records:'السراكي', submissions:'التسليمات', ir:'طلبات الفحص (IR)', site:'الموقف التنفيذي', todo:'المهام', summary:'الملخص', inventory:'المخازن', approvals:'اعتمادات المديرين', equipment:'سراكي معدات (شهري)', analytics:'تحليلات المشروع', rent_requests:'طلبات الإيجار', rent_approvals:'اعتماد طلبات الإيجار', labor:'تحليل العمالة', settings:'الإعدادات', notify:'التنبيهات', admin:'إدارة الحسابات' };
// الشاشات اللي ليها زرار في الشريط السفلي؛ الباقي بيفعّل زرار "المزيد"
const BOTTOM_TABS = new Set(['home','form','records']);

function switchTab(name){
  closeDrawer();
  document.querySelectorAll('.bb-item').forEach(t=>{
    const key=t.dataset.tab;
    t.classList.toggle('active', key===name || (key==='more' && !BOTTOM_TABS.has(name)));
  });
  document.querySelectorAll('.drawer-item').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  const panel=document.getElementById('tab-'+name); if(panel) panel.classList.add('active');
  const title=document.getElementById('header-title'); if(title) title.textContent=TAB_TITLES[name]||'CEA';
  if(name==='home'){renderHome(); loadWindows();}
  // تاب السراكي والاعتمادات محتاجين حالة المواعيد عشان يقفلوا الأزرار
  if(name==='records'||name==='approvals') loadWindows();
  if(name==='form'||name==='records') rrRefreshPickButton(); // بتنده renderRecords بنفسها بعد تحديث كاش البادج
  if(name==='submissions'&&typeof renderMySubmissions==='function')renderMySubmissions();
  if(name==='inventory')renderInventory();
  if(name==='approvals')renderApprovals();
  if(name==='analytics')renderAnalytics();
  if(name==='labor')renderLaborTab();
  if(name==='equipment'){populateDropdowns();renderEquipment();}
  if(name==='rent_requests'){populateDropdowns();renderRentRequests();}
  if(name==='rent_approvals'){renderRentApprovals();}
  if(name==='notify')renderNotifyAdmin();
  if(name==='admin'){renderAdmin(); if(typeof renderAdminSubmissions==='function') renderAdminSubmissions();}
  if(name==='settings'){renderSettings(); renderEqSettings(); eqLoadSiteNames();}
  if(name==='todo'){populateDropdowns();renderTodo();}
  if(name==='summary')renderSummary();
  window.scrollTo({top:0,behavior:'instant'});
}

// ── القائمة الجانبية ──
function openDrawer(){
  document.body.classList.add('drawer-open');
  document.querySelectorAll('.admin-only').forEach(el=>{ el.style.display = isAdmin() ? '' : 'none'; });
  applyModuleVisibility();
  const d=document.getElementById('drawer'); if(d) d.setAttribute('aria-hidden','false');
  const b=document.getElementById('menu-btn'); if(b) b.setAttribute('aria-expanded','true');
  const email=getCurrentUserEmail()||'';
  const em=document.getElementById('drawer-email'); if(em) em.textContent=email||'غير مسجّل';
  const rl=document.getElementById('drawer-role'); if(rl){ const t=localStorage.getItem('cea_user_title')||''; rl.textContent = t ? (t + (isAdmin()?' · مدير نظام':'')) : (isAdmin() ? 'مدير النظام' : 'مستخدم'); }
  const av=document.getElementById('drawer-avatar'); if(av) av.textContent=(email[0]||'م').toUpperCase();
  const sy=document.getElementById('drawer-sync'); const st=document.getElementById('sync-status');
  if(sy) sy.textContent = (st&&st.textContent) ? st.textContent : (navigator.onLine ? 'متصل بالخادم' : 'أوفلاين — الشغل محفوظ محليًا');
}
function closeDrawer(){
  document.body.classList.remove('drawer-open');
  const d=document.getElementById('drawer'); if(d) d.setAttribute('aria-hidden','true');
  const b=document.getElementById('menu-btn'); if(b) b.setAttribute('aria-expanded','false');
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDrawer(); });

// ── إدارة الحسابات (أدمن فقط) ──
let _adminUsers=[], _adminSelected=null;
const cbRow=(cls,key,label,checked)=>`<label class="pref-row" style="min-height:42px;padding:5px 4px;cursor:pointer"><span class="pref-title" style="font-size:13px;font-weight:700">${esc(label)}</span><input type="checkbox" class="${cls}" value="${key}" ${checked?'checked':''} style="width:20px;height:20px;accent-color:var(--gold)"></label>`;
// الوحدات (شاشات كاملة) + القوائم (مجمّعة حسب الشاشة) — أقسام مطوية مختصرة، تتفتح بالضغط على العنوان
const PERM_GROUP_TITLES={ 'الرئيسية':'🃏 الصفحة الرئيسية', 'السراكي':'🃏 قائمة السراكي', 'الاعتمادات':'🃏 قائمة الاعتمادات', 'الإعدادات':'🃏 قائمة الإعدادات' };
function permSection(title, count, total, rows){
  return '<details style="border:1px solid rgba(128,128,128,.28);border-radius:10px;margin-top:8px;overflow:hidden">'
    + '<summary style="cursor:pointer;padding:10px 12px;font-weight:800;font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:8px">'
    + '<span>'+title+'</span><span style="font-size:11px;font-weight:700;opacity:.65">'+count+' / '+total+' ▾</span></summary>'
    + '<div style="padding:0 10px 8px">'+rows+'</div></details>';
}
function adminModuleCheckboxes(containerId, selectedModules, selectedFeatures){
  const el=document.getElementById(containerId); if(!el) return;
  const feats = migrateFeatureList(selectedFeatures) || DEFAULT_FEATURES;
  const modOn=ALL_MODULES.filter(m=>selectedModules.includes(m)).length;
  let html = permSection('🧩 القوائم الرئيسية', modOn, ALL_MODULES.length,
    ALL_MODULES.map(m=>cbRow('mod-cb', m, MODULE_LABELS[m], selectedModules.includes(m))).join(''));
  const groups=[...new Set(ALL_FEATURES.map(f=>f.group))];
  for(const g of groups){
    const gf=ALL_FEATURES.filter(f=>f.group===g);
    const gOn=gf.filter(f=>feats.includes(f.key)).length;
    html += permSection(esc(PERM_GROUP_TITLES[g]||('🃏 قائمة '+g)), gOn, gf.length,
      gf.map(f=>cbRow('feat-cb', f.key, f.label, feats.includes(f.key))).join(''));
  }
  el.innerHTML = html;
}
function adminReadModules(containerId){
  return [...document.querySelectorAll('#'+containerId+' .mod-cb:checked')].map(cb=>cb.value);
}
function adminReadFeatures(containerId){
  return [...document.querySelectorAll('#'+containerId+' .feat-cb:checked')].map(cb=>cb.value);
}
// مؤشر نشاط الحساب: 🟢 خلال 5 دقايق · 🟡 النهاردة · 🔴 أقدم/أبدًا — مبني على آخر تواصل مع السيرفر
function presenceDot(iso){
  if(!iso) return '<span title="لم يتصل بعد" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#C62828;vertical-align:middle;margin-right:4px"></span>';
  const mins=(Date.now()-new Date(iso).getTime())/60000;
  const color= mins<=5 ? '#2E7D32' : (mins<=24*60 ? '#F9A825' : '#C62828');
  return '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+color+';vertical-align:middle;margin-right:4px;box-shadow:0 0 0 2px var(--card)"></span>';
}
function presenceText(iso){
  if(!iso) return 'لم يتصل بعد';
  const mins=Math.floor((Date.now()-new Date(iso).getTime())/60000);
  if(mins<1) return '🟢 نشط الآن';
  if(mins<=5) return '🟢 نشط منذ '+mins+' د';
  if(mins<60) return 'آخر ظهور منذ '+mins+' د';
  const h=Math.floor(mins/60); if(h<24) return 'آخر ظهور منذ '+h+' س';
  const d=Math.floor(h/24); return 'آخر ظهور منذ '+d+' يوم';
}
// المشاريع (1 و2 القديمين + أي مشروع أضافه الأدمن) — بتتقري من السيرفر، ومتخزنة محليًا عشان الأوفلاين
function loadProjectsCache(){
  try{ const v=JSON.parse(localStorage.getItem('cea_projects')||'null'); if(Array.isArray(v)&&v.length) return v; }catch(e){}
  return [{id:1,name:'كومباوند جريني'},{id:2,name:'أزاليا'}];
}
let _projects=loadProjectsCache();
function saveProjectsCache(){ try{ localStorage.setItem('cea_projects', JSON.stringify(_projects)); }catch(e){} }
// أسماء المواقع 1/2 (توافقي مع كود قديم بيستخدم _siteNames) — مشتقة من _projects
let _siteNames={ '1':'كومباوند جريني', '2':'أزاليا' };
function syncSiteNamesFromProjects(){
  const p1=_projects.find(p=>Number(p.id)===1), p2=_projects.find(p=>Number(p.id)===2);
  _siteNames={ '1':(p1&&p1.name)||_siteNames['1'], '2':(p2&&p2.name)||_siteNames['2'] };
}
syncSiteNamesFromProjects();
function siteName(s){
  const p=_projects.find(x=>String(x.id)===String(s||1));
  return p ? p.name : ('مشروع '+s);
}
// تحميل قائمة المشاريع من السيرفر — بيتنادى عند تسجيل الدخول وبعد أي تعديل من الأدمن (إضافة/تسمية)
async function loadProjects(){
  try{
    const r=await api('GET','/api/config');
    if(Array.isArray(r.data.projects) && r.data.projects.length){
      _projects=r.data.projects.map(p=>({id:Number(p.id), name:p.name}));
      saveProjectsCache();
    }
  }catch(e){ /* نكمل بالقايمة المتخزنة محليًا */ }
  syncSiteNamesFromProjects();
  applySiteNames();
}
// المشروع الافتراضي — أي مكان من غير مشروع محدد (placeSites[name] undefined/null) بيتعامل معاه كمشروع 1
const DEFAULT_PROJECT_ID=1;
function placeProjectId(name){ return Number(placeSites[name])||DEFAULT_PROJECT_ID; }
// خيارات دروب داون "مشروع المكان" — بتتحدث تلقائيًا لما المشاريع تتغيّر (siteName بيقرا من _projects)
function placeSiteOptions(selected){
  const sel=String(selected||DEFAULT_PROJECT_ID);
  return _projects.map(p=>`<option value="${p.id}"${sel===String(p.id)?' selected':''}>🏗 ${esc(p.name)}</option>`).join('');
}
function applySiteNames(){
  // أسماء فيتشرز زرار الفورم في قائمة "الوحدات الظاهرة له" بتتبع أسماء المواقع
  ALL_FEATURES.forEach(f=>{
    if(f.key==='gform_site1') f.label='زرار Google Form — '+_siteNames['1'];
    if(f.key==='gform_site2') f.label='زرار Google Form — '+_siteNames['2'];
  });
  // تحديث نصوص كل دروب داون "الموقع" + خانات تعديل الأسماء
  [['admin-user-site',''],['admin-new-site','']].forEach(([id])=>{
    const sel=document.getElementById(id); if(!sel) return;
    [...sel.options].forEach(o=>{ o.textContent='🏗️ '+siteName(o.value); });
  });
  const i1=document.getElementById('site1-name-input'), i2=document.getElementById('site2-name-input');
  if(i1&&document.activeElement!==i1) i1.value=_siteNames['1'];
  if(i2&&document.activeElement!==i2) i2.value=_siteNames['2'];
  applyFormButtons();
}
// زرار Google Form — خانات "قائمة الاعتمادات" (gform_site1/gform_site2) هي الحكم الوحيد:
// معلّمة = ظاهر، مش معلّمة = مخفي. (حساب قديم اتحفظ قبل إضافة المفاتيح: لما الأدمن يفتحه،
// خانة فورم موقعه بتتعلّم تلقائيًا — فأول حفظ بيثبت الوضع الصحيح.) الأدمن بيشوف الزرارين دايمًا.
function applyFormButtons(){
  const admin=isAdmin();
  // زرارا الفورم في تاب السراكي وفي تاب سراكي المعدات — نفس الفيتشرز gform_site1/2
  [['gform-btn-1','gform-btn-2'],['eq-gform-btn-1','eq-gform-btn-2']].forEach(([id1,id2])=>{
    const b1=document.getElementById(id1), b2=document.getElementById(id2);
    if(!b1||!b2) return;
    b1.style.display=(admin||featureEnabled('gform_site1'))?'':'none';
    b2.style.display=(admin||featureEnabled('gform_site2'))?'':'none';
    if(admin){ b1.textContent='📤 Google Form — '+siteName(1); b2.textContent='📤 Google Form — '+siteName(2); }
  });
}
applyFormButtons(); // عند فتح التطبيق (حتى أوفلاين) — من آخر موقع متخزن للمستخدم
async function loadSiteNames(){
  try{
    const r=await api('GET','/api/admin/config');
    _siteNames={ '1':r.data.site1Name||_siteNames['1'], '2':r.data.site2Name||_siteNames['2'] };
    if(Array.isArray(r.data.projects) && r.data.projects.length){ _projects=r.data.projects.map(p=>({id:Number(p.id), name:p.name})); saveProjectsCache(); }
  }catch(e){ /* نكمل بالأسماء الافتراضية */ }
  applySiteNames();
}
async function adminSaveSiteNames(){
  const site1Name=document.getElementById('site1-name-input').value.trim();
  const site2Name=document.getElementById('site2-name-input').value.trim();
  if(!site1Name||!site2Name){ showToast('⚠ اكتب اسم الموقعين', true); return; }
  try{
    const r=await api('PATCH','/api/admin/config',{site1Name, site2Name});
    _siteNames={ '1':r.data.site1Name, '2':r.data.site2Name };
    if(Array.isArray(r.data.projects)){ _projects=r.data.projects.map(p=>({id:Number(p.id), name:p.name})); saveProjectsCache(); }
    applySiteNames();
    showToast('✅ اتحفظت الأسماء');
    renderAdmin();
  }catch(e){ showToast('⚠ '+e.message, true); }
}
// ── كارت "🏗 المشاريع" في إدارة الحسابات: عرض/إضافة/إعادة تسمية ──
function adminRenderProjects(){
  const box=document.getElementById('admin-projects-list'); if(!box) return;
  box.innerHTML=_projects.map(p=>`<div class="setting-item">
      <div class="setting-name" style="flex:1">${esc(p.name)}</div>
      <button class="btn-sm-edit" onclick="adminRenameProject(${p.id})">✏️ إعادة تسمية</button>
    </div>`).join('') || '<div class="home-empty">لا يوجد مشاريع</div>';
}
async function adminAddProject(){
  const inp=document.getElementById('admin-new-project-name'); if(!inp) return;
  const name=inp.value.trim();
  if(!name){ showToast('⚠ اكتب اسم المشروع', true); return; }
  try{
    await api('POST','/api/admin/projects',{name});
    inp.value='';
    await loadProjects();
    adminRenderProjects();
    applySiteNames();
    renderSettings();
    showToast('✅ اتضاف مشروع '+name);
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function adminRenameProject(id){
  const cur=_projects.find(p=>Number(p.id)===Number(id));
  const name=prompt('اسم المشروع الجديد:', cur?cur.name:'');
  if(name===null) return;
  const trimmed=name.trim();
  if(!trimmed){ showToast('⚠ اكتب اسم صحيح', true); return; }
  try{
    await api('PATCH','/api/admin/projects/'+id,{name:trimmed});
    await loadProjects();
    adminRenderProjects();
    applySiteNames();
    renderSettings();
    showToast('✅ اتغيّر اسم المشروع');
  }catch(e){ showToast('⚠ '+e.message, true); }
}
/* أكورديون تاب إدارة الحسابات: بيفتكر أنهي أقسام فتحتها على الجهاز عشان
   ما تفتحهمش تاني كل مرة. بيتنادى مرة واحدة بعد ما الصفحة تتحمّل. */
function accRestore(){
  document.querySelectorAll('#tab-admin details.acc[data-acc]').forEach(d=>{
    const k='cea_acc_'+d.dataset.acc;
    try{ const v=localStorage.getItem(k); if(v!==null) d.open=(v==='1'); }catch(e){}
    d.addEventListener('toggle', ()=>{ try{ localStorage.setItem(k, d.open?'1':'0'); }catch(e){} });
  });
}
document.addEventListener('DOMContentLoaded', accRestore);
/* فتح قسم معيّن برمجيًا (مثلًا لما يتفتح حساب من قائمة الحسابات) */
function accOpen(key){ const d=document.querySelector('#tab-admin details.acc[data-acc="'+key+'"]'); if(d && !d.open) d.open=true; return d; }
async function renderAdmin(){
  if(!isAdmin()) { switchTab('home'); return; }
  await loadSiteNames(); // الأول — عشان أسماء المواقع تظهر صح في labels الفيتشرز والدروب داون
  adminRenderProjects();
  loadAprLevelsAdmin();
  renderWindowsAdmin();
  renderActivityTable();
  loadBackupStatus();
  adminModuleCheckboxes('admin-create-modules', ['records','submissions','todo','summary'], DEFAULT_FEATURES);
  const list=document.getElementById('admin-users-list');
  try{
    _adminUsers=(await api('GET','/api/admin/users')).data;
    list.innerHTML = _adminUsers.map(u=>`
      <div class="setting-item">
        <div style="flex:1;min-width:0">
          <div class="setting-name" style="text-align:right">${u.displayName?esc(u.displayName)+' <span style="font-weight:600;color:var(--muted);direction:ltr;unicode-bidi:embed">'+esc(u.email)+'</span>':'<span style="direction:ltr;unicode-bidi:embed">'+esc(u.email)+'</span>'} ${presenceDot(u.lastSeenAt)}</div>
          <div class="setting-sub">${esc(u.title||(u.role==='ADMIN'?'مدير النظام':'مستخدم'))}${u.role==='ADMIN'&&u.title?' · مدير نظام':''}${u.project?' · '+(u.project==='تجاري'?'🏪':'🏠')+' '+esc(u.project):''} · 🏗️ ${esc(siteName(u.site))} · ${presenceText(u.lastSeenAt)}</div>
          <div class="setting-sub" style="margin-top:3px">${adminSyncLine(u)}</div>
        </div>
        <button class="btn-sm-edit" onclick="adminOpenUser('${u.id}')">${u.email===getCurrentUserEmail()?'حسابي':'إدارة'}</button>
      </div>`).join('') || '<div class="home-empty">لا يوجد حسابات</div>';
  }catch(e){ list.innerHTML='<div class="home-empty">⚠ تعذر تحميل الحسابات — تأكد من الاتصال</div>'; }
}
// سطر السراكي في كارت الحساب: عدد السراكي على السيرفر + حالة المزامنة اللي بلّغها جهاز المهندس
// (السجلات المتزامنة = اللي على الجهاز ناقص اللي لسه بمعرّف محلي — من آخر إبلاغ بعد مزامنة)
function adminSyncLine(u){
  const server = Number(u.recordsCount||0);
  let sync = '<span class="text-muted">السجلات المتزامنة: — (الجهاز لسه ما بلّغش)</span>';
  if(u.syncReportedAt){
    const local = Number(u.syncLocalRecords||0), un = Number(u.syncUnsynced||0);
    const at = new Date(u.syncReportedAt).toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'});
    sync = un>0
      ? '<span style="color:var(--danger-fg);font-weight:700">السجلات المتزامنة: '+(local-un)+' من '+local+' — ⚠ '+un+' لسه ما اترفعش</span> <span class="text-muted">('+esc(at)+') — السبب في "📜 سجل النشاط" جوّه كارت الحساب (سطر "خطأ في طلب 400")</span>'
      : '<span style="color:var(--ok-fg);font-weight:700">السجلات المتزامنة: '+local+' من '+local+' ✅</span> <span class="text-muted">('+esc(at)+')</span>';
  }
  return '📊 عدد السراكي: <b>'+server+'</b> · '+sync;
}
async function adminOpenUser(id){
  _adminSelected=_adminUsers.find(u=>String(u.id)===String(id)); if(!_adminSelected) return;
  document.getElementById('admin-user-title').textContent='⚙️ '+_adminSelected.email;
  document.getElementById('admin-user-card').style.display='block';
  document.getElementById('admin-user-jobtitle').value=_adminSelected.title||'';
  document.getElementById('admin-user-name').value=_adminSelected.displayName||'';
  document.getElementById('admin-user-role').value=_adminSelected.role||'ENGINEER';
  document.getElementById('admin-user-project').value=_adminSelected.project||'سكني';
  document.getElementById('admin-user-site').value=String(_adminSelected.site||1);
  adminFillGradeAndApprovers();
  adminLoadUserSubs();
  adminLoadActivity();
  adminDeleteCancel();
  // حذف/تغيير صلاحية حسابي أنا مش متاح من هنا
  const isMe=_adminSelected.email===getCurrentUserEmail();
  document.getElementById('admin-delete-step0').style.display=isMe?'none':'';
  document.querySelector('#admin-user-role').disabled=isMe;
  try{
    const [st, pl]=await Promise.all([api('GET',`/api/admin/users/${id}/settings`), api('GET',`/api/admin/users/${id}/places`)]);
    // حساب قديم اتحفظ قبل إضافة مفاتيح زرار الفورم؟ نعلّم خانة فورم موقعه (ده الظاهر له فعليًا)
    let userFeats=st.data.enabledFeatures||DEFAULT_FEATURES;
    if(Array.isArray(userFeats)&&!userFeats.some(k=>k==='gform_site1'||k==='gform_site2')){
      userFeats=userFeats.concat(['gform_site'+(Number(_adminSelected.site)===2?2:1)]);
    }
    adminModuleCheckboxes('admin-user-modules', st.data.enabledModules||[], userFeats);
    adminRenderPlaces(pl.data);
    adminLoadUserProjects();
    adminRenderSignature(st.data);
    adminLoadContractors();
    adminFillPickers();
  }catch(e){ showToast('⚠ تعذر تحميل بيانات الحساب', true); }
  document.getElementById('admin-user-card').scrollIntoView({behavior:'smooth'});
}
function adminCloseUser(){ _adminSelected=null; document.getElementById('admin-user-card').style.display='none'; }
let _adminPlaces=[];
function adminRenderPlaces(list){
  _adminPlaces=list;
  const el=document.getElementById('admin-user-places');
  el.innerHTML = list.length ? list.map(p=>`<div class="setting-item">
      <div style="flex:1;min-width:0">
        <div class="setting-name">${esc(p.name)}</div>
        ${p.note?`<div class="setting-sub">❕ ${esc(p.note)}</div>`:''}
        <div class="setting-sub">🏗 ${esc(siteName(p.site||DEFAULT_PROJECT_ID))}</div>
      </div>
      <div class="setting-actions">
        <button class="btn-sm-edit" onclick="adminEditPlaceNote('${p.id}')">${p.note?'✏️ الملاحظة':'❕ ملاحظة'}</button>
        <button class="btn-sm-edit" onclick="adminEditPlaceSite('${p.id}')">🏗 المشروع</button>
        <button class="btn-sm-del" onclick="adminRemovePlace('${p.id}')">حذف</button>
      </div>
    </div>`).join('') : '<div class="home-empty">لا يوجد أماكن — أضف من الخانة بالأسفل</div>';
  const sel=document.getElementById('admin-new-place-site');
  if(sel) sel.innerHTML=placeSiteOptions('');
}
// تعديل مشروع مكان عند مهندس معيّن — بيسأل رقم الموقع (1/2) أو فاضي لإلغاء التحديد
async function adminEditPlaceSite(placeId){
  if(!_adminSelected) return;
  const p=_adminPlaces.find(x=>String(x.id)===String(placeId)); if(!p) return;
  const list=_projects.map(pr=>pr.id+': '+pr.name).join('\n');
  const ans=prompt('مشروع "'+p.name+'": اكتب رقم المشروع (id) من القايمة، أو سيبها فاضية = '+siteName(DEFAULT_PROJECT_ID)+':\n'+list, p.site?String(p.site):'');
  if(ans===null) return;
  const site=ans.trim()?Number(ans.trim()):DEFAULT_PROJECT_ID;
  if(!Number.isInteger(site) || !_projects.some(pr=>pr.id===site)){ showToast('⚠ رقم مشروع غير معروف', true); return; }
  try{
    await api('PUT',`/api/admin/users/${_adminSelected.id}/places/${placeId}`,{name:p.name, note:p.note||'', site});
    adminRenderPlaces((await api('GET',`/api/admin/users/${_adminSelected.id}/places`)).data);
    showToast('✅ تم تحديث المشروع');
  }catch(e){ showToast('⚠ '+e.message, true); }
}
// تعديل ملاحظة مكان عند مهندس معيّن — بتظهر له كأيقونة ❕ جنب اختيار المكان في تسجيل السركي
async function adminEditPlaceNote(placeId){
  if(!_adminSelected) return;
  const p=_adminPlaces.find(x=>String(x.id)===String(placeId)); if(!p) return;
  const note=prompt('ملاحظة المكان "'+p.name+'" (سيبها فاضية لمسح الملاحظة):', p.note||'');
  if(note===null) return;
  try{
    await api('PUT',`/api/admin/users/${_adminSelected.id}/places/${placeId}`,{name:p.name, note:note.trim()});
    adminRenderPlaces((await api('GET',`/api/admin/users/${_adminSelected.id}/places`)).data);
    showToast(note.trim()?'✅ اتحفظت الملاحظة — هتوصله في أول مزامنة':'🗑 اتمسحت الملاحظة');
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function adminSaveModules(){
  if(!_adminSelected) return;
  try{
    await api('PUT',`/api/admin/users/${_adminSelected.id}/settings`,{enabledModules:adminReadModules('admin-user-modules'), enabledFeatures:adminReadFeatures('admin-user-modules')});
    if(_adminSelected.email===getCurrentUserEmail()){ setEnabledModules(adminReadModules('admin-user-modules')); setEnabledFeatures(adminReadFeatures('admin-user-modules')); showToast('✅ تم الحفظ وتطبيقه على حسابك'); }
    else showToast('✅ تم الحفظ — هيتطبق عند المهندس في أول مزامنة');
  }catch(e){ showToast('⚠ فشل الحفظ: '+e.message, true); }
}
async function adminAddPlace(){
  if(!_adminSelected) return;
  const inp=document.getElementById('admin-new-place'); const name=inp.value.trim();
  if(!name){ showToast('⚠ أدخل إسم المكان', true); return; }
  const noteInp=document.getElementById('admin-new-place-note'); const note=(noteInp?.value||'').trim();
  const siteInp=document.getElementById('admin-new-place-site'); const site=Number(siteInp?.value)||DEFAULT_PROJECT_ID;
  try{
    await api('POST',`/api/admin/users/${_adminSelected.id}/places`,{name, note, site});
    inp.value=''; if(noteInp) noteInp.value=''; if(siteInp) siteInp.value='';
    adminRenderPlaces((await api('GET',`/api/admin/users/${_adminSelected.id}/places`)).data);
    showToast('✅ تم إضافة المكان');
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function adminRemovePlace(placeId){
  if(!_adminSelected) return;
  try{
    await api('DELETE',`/api/admin/users/${_adminSelected.id}/places/${placeId}`);
    adminRenderPlaces((await api('GET',`/api/admin/users/${_adminSelected.id}/places`)).data);
    showToast('🗑 تم الحذف');
  }catch(e){ showToast('⚠ '+e.message, true); }
}
// ── مقاولو المهندس (يزرعهم الأدمن — المهندس يقرأهم فقط زي الأماكن) ──
async function adminLoadContractors(){
  if(!_adminSelected) return;
  const el=document.getElementById('admin-user-contractors'); if(!el) return;
  try{
    const list=(await api('GET',`/api/admin/users/${_adminSelected.id}/contractors`)).data;
    el.innerHTML = list.length ? list.map(c=>`<div class="setting-item"><div style="flex:1;min-width:0"><div class="setting-name">${esc(c.name)}</div><div class="setting-sub">${esc(c.spec||'—')}${c.rate!=null?' · '+Number(c.rate).toLocaleString('ar-EG')+' ج.م / '+esc(c.rateType||'يومية'):''}</div></div><button class="btn-sm-del" onclick="adminRemoveContractor('${c.id}')">حذف</button></div>`).join('') : '<div class="home-empty">لا يوجد مقاولون — أضف أو انسخ مقاوليك</div>';
  }catch(e){ el.innerHTML='<div class="home-empty">⚠ تعذر التحميل</div>'; }
}
async function adminAddContractor(){
  if(!_adminSelected) return;
  const name=document.getElementById('admin-c-name').value.trim();
  const spec=document.getElementById('admin-c-spec').value.trim();
  const rate=document.getElementById('admin-c-rate').value.trim();
  const rateType=document.getElementById('admin-c-rate-type').value;
  if(!name){ showToast('⚠ أدخل إسم المقاول', true); return; }
  try{
    await api('POST',`/api/admin/users/${_adminSelected.id}/contractors`,{name, spec:spec||'—', rate:rate?Number(rate):null, rateType});
    ['admin-c-name','admin-c-spec','admin-c-rate'].forEach(id=>document.getElementById(id).value='');
    adminLoadContractors();
    showToast('✅ تم إضافة المقاول لحساب '+_adminSelected.email);
  }catch(e){ showToast('⚠ '+(e.code==='CONFLICT'?'المقاول موجود بالفعل في حسابه':e.message), true); }
}
async function adminRemoveContractor(id){
  if(!_adminSelected) return;
  try{ await api('DELETE',`/api/admin/users/${_adminSelected.id}/contractors/${id}`); adminLoadContractors(); showToast('🗑 تم الحذف'); }
  catch(e){ showToast('⚠ '+e.message, true); }
}
// نسخ كل أماكني (بملاحظاتها) لحساب مهندس دفعة واحدة — نفس فكرة نسخ المقاولين
async function adminCopyMyPlaces(){
  if(!_adminSelected) return;
  if(!places.length){ showToast('⚠ مفيش أماكن في حسابك عشان تنسخها', true); return; }
  const btn=document.getElementById('admin-copy-places-btn');
  if(btn){ btn.disabled=true; btn.textContent='⏳ جاري النسخ...'; }
  try{
    const r=(await api('POST',`/api/admin/users/${_adminSelected.id}/places/copy-mine`)).data;
    adminRenderPlaces((await api('GET',`/api/admin/users/${_adminSelected.id}/places`)).data);
    showToast(r.added ? `✅ اتضاف ${r.added} مكان${r.skipped?' (و'+r.skipped+' كانوا موجودين)':''}` : 'ℹ كل أماكنك موجودة عنده بالفعل');
  }catch(e){ showToast('⚠ فشل النسخ: '+e.message, true); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='📋 انسخ كل أماكني لحسابه دفعة واحدة'; } }
}
async function adminCopyMyContractors(){
  if(!_adminSelected) return;
  if(!contractors.length){ showToast('⚠ مفيش مقاولين في حسابك عشان تنسخهم', true); return; }
  const btn=document.getElementById('admin-copy-contractors-btn');
  if(btn){ btn.disabled=true; btn.textContent='⏳ جاري النسخ...'; }
  try{
    const r=(await api('POST',`/api/admin/users/${_adminSelected.id}/contractors/copy-mine`)).data;
    await adminLoadContractors();
    showToast(r.added ? `✅ اتضاف ${r.added} مقاول${r.skipped?' (و'+r.skipped+' كانوا موجودين)':''}` : 'ℹ كل مقاولينك موجودين عنده بالفعل');
  }catch(e){ showToast('⚠ فشل النسخ: '+e.message, true); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='📋 انسخ كل مقاوليّ لحسابه دفعة واحدة'; } }
}
// اختيار مقاول/مكان من عندي (من اللي على جهازي) وإضافته للمهندس
function adminFillPickers(){
  const cp=document.getElementById('admin-contractor-pick');
  if(cp){ cp.innerHTML='<option value="">-- اختار مقاول من عندك --</option>'+contractors.map((c,i)=>`<option value="${i}">${esc(c.name)} — ${esc(c.spec||'—')}</option>`).join(''); }
  const pp=document.getElementById('admin-place-pick');
  if(pp){ pp.innerHTML='<option value="">-- اختار مكان من عندك --</option>'+places.map((p,i)=>`<option value="${i}">${esc(p)}</option>`).join(''); }
}
async function adminPickContractor(){
  if(!_adminSelected) return;
  const sel=document.getElementById('admin-contractor-pick'); const c=contractors[Number(sel.value)];
  if(!sel.value || !c){ showToast('⚠ اختار مقاول من القائمة', true); return; }
  try{
    await api('POST',`/api/admin/users/${_adminSelected.id}/contractors`,{name:c.name, spec:c.spec||'—', rate:(c.rate!==''&&c.rate!=null)?Number(c.rate):null, rateType:c.rateType||'يومية'});
    sel.value=''; adminLoadContractors(); showToast('✅ تم إضافة '+c.name+' لحسابه');
  }catch(e){ showToast('⚠ '+(e.code==='CONFLICT'?c.name+' موجود عنده بالفعل':e.message), true); }
}
async function adminPickPlace(){
  if(!_adminSelected) return;
  const sel=document.getElementById('admin-place-pick'); const p=places[Number(sel.value)];
  if(!sel.value || !p){ showToast('⚠ اختار مكان من القائمة', true); return; }
  try{
    await api('POST',`/api/admin/users/${_adminSelected.id}/places`,{name:p, note:placeNotes[p]||'', site:placeProjectId(p)});
    sel.value=''; adminRenderPlaces((await api('GET',`/api/admin/users/${_adminSelected.id}/places`)).data); showToast('✅ تم إضافة '+p+' لحسابه');
  }catch(e){ showToast('⚠ '+(e.code==='CONFLICT'&&!/مشروع/.test(e.message||'')?p+' موجود عنده بالفعل':e.message), true); }
}

// ── توقيع المهندس (يزرعه الأدمن) ──
// رفع صورة كملف ثم ربطها بإعدادات المهندس — السيرفر بيسمح للمهندس يقرأ الملف المربوط بحسابه فقط
async function adminRenderSignature(settings){
  const el=document.getElementById('admin-sig-preview'); if(!el) return;
  if(!settings || !settings.signatureFileId){ el.innerHTML='لا يوجد توقيع — كشوفه المعتمدة هتطلع بدون توقيع'; return; }
  try{
    const res=await fetch(API_URL+'/api/files/'+settings.signatureFileId+'/content',{headers:{'Authorization':'Bearer '+getAccessToken()}});
    if(!res.ok) throw new Error();
    const url=URL.createObjectURL(await res.blob());
    el.innerHTML='<img src="'+url+'" alt="التوقيع" style="max-height:70px;max-width:100%;background:#fff;border:1px solid var(--border);border-radius:8px;padding:4px">';
  }catch(e){ el.textContent='✅ فيه توقيع مربوط (تعذر عرض المعاينة)'; }
}
async function adminUploadSignatureBlob(blob, name){
  const fd=new FormData(); fd.append('file', blob, name||'signature.png');
  const res=await fetch(API_URL+'/api/files',{method:'POST',headers:{'Authorization':'Bearer '+getAccessToken()},body:fd});
  if(!res.ok) throw new Error('فشل رفع الصورة');
  return Number((await res.json()).data.id);
}
async function adminUseMySignature(){
  if(!_adminSelected) return;
  if(!engineerSignature){ showToast('⚠ مفيش توقيع على حسابك — ارفعه الأول من الإعدادات → توقيع المهندس', true); return; }
  try{
    const blob=await (await fetch(engineerSignature)).blob();
    const fileId=await adminUploadSignatureBlob(blob,'signature.png');
    const st=await api('PUT',`/api/admin/users/${_adminSelected.id}/settings`,{signatureFileId:fileId});
    adminRenderSignature(st.data);
    showToast('✅ تم ربط توقيعك بحساب '+_adminSelected.email);
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function adminUploadSignature(input){
  if(!_adminSelected || !input.files || !input.files[0]) return;
  const file=input.files[0]; input.value='';
  try{
    // نفس ضغط صور التقرير اليومي لو كبيرة (لو الدالة موجودة)، وإلا نرفع كما هي
    let blob=file;
    if(typeof compressImageFile==='function'){ try{ const dataUrl=await compressImageFile(file); blob=await (await fetch(dataUrl)).blob(); }catch(e){} }
    const fileId=await adminUploadSignatureBlob(blob, file.name||'signature.png');
    const st=await api('PUT',`/api/admin/users/${_adminSelected.id}/settings`,{signatureFileId:fileId});
    adminRenderSignature(st.data);
    showToast('✅ تم رفع التوقيع لحساب '+_adminSelected.email);
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function adminClearSignature(){
  if(!_adminSelected) return;
  try{
    const st=await api('PUT',`/api/admin/users/${_adminSelected.id}/settings`,{signatureFileId:null});
    adminRenderSignature(st.data);
    showToast('🗑 تمت الإزالة');
  }catch(e){ showToast('⚠ '+e.message, true); }
}

// ── المسمى الوظيفي والصلاحية ──
// اسم الشخص للعرض: الاسم بالعربي (displayName) → اللقب → أول الإيميل
function personName(u){ if(!u) return ''; return u.displayName || u.title || String(u.email||'').split('@')[0]; }
async function adminSaveName(){
  if(!_adminSelected) return;
  const displayName=document.getElementById('admin-user-name').value.trim();
  try{
    const r=await api('PATCH',`/api/admin/users/${_adminSelected.id}`,{displayName:displayName||null});
    _adminSelected.displayName=r.data.displayName;
    showToast(displayName?'✅ تم حفظ الاسم: '+displayName:'✅ اتشال الاسم — هيظهر أول الإيميل');
    renderAdmin();
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function adminSaveTitle(){
  if(!_adminSelected) return;
  const title=document.getElementById('admin-user-jobtitle').value.trim();
  try{
    const r=await api('PATCH',`/api/admin/users/${_adminSelected.id}`,{title:title||null});
    _adminSelected.title=r.data.title;
    showToast('✅ تم حفظ المسمى');
    renderAdmin();
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function adminSaveProject(){
  if(!_adminSelected) return;
  const project=document.getElementById('admin-user-project').value;
  try{
    const r=await api('PATCH',`/api/admin/users/${_adminSelected.id}`,{project});
    _adminSelected.project=r.data.project;
    showToast('✅ اتحفظ — كشوفه الجاية هتتبعت كمشروع '+project);
  }catch(e){ showToast('⚠ '+e.message, true); }
}
// الدرجات وسلسلة الاعتماد — تُحمّل مرة في renderAdmin وتُستخدم في كارت الحساب
// الدرجة بتحدد المستويات المطلوبة (المصفوفة)، وكل مستوى بيتسند له شخص بعينه لكل حساب على حدة.
let _aprMeta={grades:[],levels:[],matrix:{},approvers:[],solePmId:null};
const GRADE_LABELS={
  'junior':'مهندس — junior',
  'senior':'مهندس أول — senior',
  'team leader':'مدير فريق — team leader',
  'construction manager':'مدير تنفيذ — construction manager',
  'project manager':'مدير مشروع — project manager',
  'viewer':'مشاهد'
};
const APR_LEVEL_UI={
  'team leader':{field:'approverTlId', label:'مدير الفريق'},
  'construction manager':{field:'approverCmId', label:'مدير التنفيذ'},
  'project manager':{field:'approverPmId', label:'مدير المشروع'}
};
function gradeLabel(g){ return GRADE_LABELS[g]||g||'—'; }
async function loadAprLevelsAdmin(){
  try{ _aprMeta=(await api('GET','/api/admin/approval-levels')).data; }catch(e){ _aprMeta={grades:[],levels:[],matrix:{},approvers:[],solePmId:null}; }
  renderAprMatrix();
}
// مصفوفة "مين يعتمد لمين" — قابلة للتعديل: لكل درجة تختار المستويات اللي كشوفها بتعدّي عليها.
// الترتيب بيتفرض في السيرفر بترتيب السلم مهما كان ترتيب الاختيار.
let _aprMatrixDraft=null, _aprInReview=0;
function renderAprMatrix(){
  const box=document.getElementById('apr-matrix'); if(!box) return;
  // مشاهد مايبعتش كشوف أصلًا — مالوش صف في مصفوفة "مين يعتمد لمين"
  const grades=(_aprMeta.grades||[]).filter(g=>g!=='viewer'), levels=_aprMeta.levels||APPROVING_LEVELS_FALLBACK;
  if(!_aprMatrixDraft) _aprMatrixDraft=JSON.parse(JSON.stringify(_aprMeta.matrix||{}));
  box.innerHTML=grades.map(g=>{
    const chain=_aprMatrixDraft[g]||[];
    const boxes=levels.map(l=>{
      const on=chain.indexOf(l)>=0;
      const lbl=APR_LEVEL_UI[l]?APR_LEVEL_UI[l].label:l;
      // درجة ما تعتمدش لنفسها ولا لأعلى منها — الخيار بيتقفل بدل ما يبوّظ السلسلة
      const selfOrLower=levels.indexOf(l)<=levels.indexOf(g);
      const dis=selfOrLower?' disabled title="'+esc(lbl)+' مش فوق درجة '+esc(gradeLabel(g))+'"':'';
      return '<label class="apr-mx-chk'+(on?' on':'')+(selfOrLower?' off':'')+'">'
        +'<input type="checkbox"'+(on?' checked':'')+dis+' onchange="aprMatrixToggle(\''+g+'\',\''+l+'\',this.checked)"> '+esc(lbl)+'</label>';
    }).join('');
    return '<div class="apr-mx-row"><b>'+esc(gradeLabel(g))+'</b><span class="apr-mx-boxes">'+boxes
      +(chain.length?'':' <i style="color:var(--muted)">محدش بيعتمد له — الكشف بيروح جوجل شيت فورًا</i>')+'</span></div>';
  }).join('');
  const btn=document.getElementById('apr-matrix-save');
  if(btn) btn.style.display = JSON.stringify(_aprMatrixDraft)===JSON.stringify(_aprMeta.matrix||{}) ? 'none' : '';
}
const APPROVING_LEVELS_FALLBACK=['team leader','construction manager','project manager'];
function aprMatrixToggle(grade, level, on){
  if(!_aprMatrixDraft[grade]) _aprMatrixDraft[grade]=[];
  const arr=_aprMatrixDraft[grade].filter(x=>x!==level);
  if(on) arr.push(level);
  // نحافظ على ترتيب السلم محليًا كمان عشان العرض يطابق اللي هيتحفظ
  _aprMatrixDraft[grade]=(_aprMeta.levels||APPROVING_LEVELS_FALLBACK).filter(l=>arr.indexOf(l)>=0);
  renderAprMatrix();
}
function aprMatrixReset(){ _aprMatrixDraft=null; renderAprMatrix(); }
async function aprMatrixSave(){
  try{
    const info=(await api('GET','/api/admin/approval-matrix')).data;
    _aprInReview=info.inReview||0;
  }catch(e){ _aprInReview=0; }
  let msg='حفظ سلسلة الاعتماد الجديدة؟';
  if(_aprInReview) msg+='\n\n⚠ فيه '+_aprInReview+' كشف قيد المراجعة دلوقتي. أي كشف واقف عند مستوى هتشيله هيفضل معلّق لحد ما تحرّكه انت من تاب الاعتمادات (مش هيتبعت لجوجل شيت من غير اعتماد).';
  if(!confirm(msg)) return;
  try{
    const r=await api('PUT','/api/admin/approval-matrix',{matrix:_aprMatrixDraft});
    _aprMeta.matrix=r.data; _aprMatrixDraft=null;
    renderAprMatrix();
    if(_adminSelected) adminFillGradeAndApprovers();
    showToast('✅ اتحفظت سلسلة الاعتماد');
  }catch(e){ showToast('⚠ '+e.message, true); }
}
// كارت الحساب: دروب داون الدرجة + دروب داون معتمد لكل مستوى مطلوب لدرجته
function adminFillGradeAndApprovers(){
  const u=_adminSelected; if(!u) return;
  const sel=document.getElementById('admin-user-grade');
  if(sel){
    sel.innerHTML=(_aprMeta.grades||[]).map(g=>`<option value="${esc(g)}">${esc(gradeLabel(g))}</option>`).join('');
    sel.value=u.grade||'junior';
  }
  const chain=(_aprMeta.matrix||{})[u.grade||'junior']||[];
  const hint=document.getElementById('admin-grade-hint');
  if(hint) hint.innerHTML = chain.length
    ? ('سلسلة اعتماد كشوفه: <b>'+chain.map(l=>esc(APR_LEVEL_UI[l]?APR_LEVEL_UI[l].label:l)).join(' ← ')+'</b>')
    : 'محدش بيعتمد لكشوفه — بتروح جوجل شيت فورًا.';
  const box=document.getElementById('admin-user-approvers'); if(!box) return;
  if(!chain.length){ box.innerHTML='<p class="hint" style="margin:0">مفيش مستويات اعتماد لدرجته.</p>'; return; }
  box.innerHTML=chain.map(l=>{
    const ui=APR_LEVEL_UI[l]; const cur=u[ui.field]?String(u[ui.field]):'';
    const opts=(_aprMeta.approvers||[]).filter(a=>a.grade===l&&String(a.id)!==String(u.id))
      .map(a=>`<option value="${esc(String(a.id))}"${String(a.id)===cur?' selected':''}>${esc(personName(a))} — ${esc(a.email)}</option>`).join('');
    // مدير المشروع الوحيد في النظام بيتحدد تلقائيًا من غير إسناد صريح
    const auto = l==='project manager' && !cur && _aprMeta.solePmId;
    const empty = auto ? '<option value="">(تلقائي — مدير المشروع الوحيد)</option>' : '<option value="">— مش محدد (المستوى ده هيتخطى) —</option>';
    const warn = (!cur && !auto) ? '<div class="apr-miss">⚠ مالوش '+esc(ui.label)+' — المستوى ده هيتخطى في سلسلته</div>' : '';
    return '<div class="add-row" style="margin-top:4px"><span class="hint" style="white-space:nowrap;min-width:74px">'+esc(ui.label)+':</span>'
      +'<select id="apr-sel-'+ui.field+'">'+empty+(opts||'')+'</select>'
      +'<button class="btn btn-navy btn-inline" onclick="adminSaveApprover(\''+ui.field+'\')">💾</button></div>'+warn;
  }).join('');
}
async function adminSaveGrade(){
  if(!_adminSelected) return;
  const grade=document.getElementById('admin-user-grade').value;
  try{
    const r=await api('PATCH',`/api/admin/users/${_adminSelected.id}`,{grade});
    Object.assign(_adminSelected, {grade:r.data.grade, approverTlId:r.data.approverTlId, approverCmId:r.data.approverCmId, approverPmId:r.data.approverPmId});
    await loadAprLevelsAdmin(); // الدرجة اتغيرت → قوائم المعتمدين المتاحة اتغيرت كمان
    adminFillGradeAndApprovers();
    adminRenderUserProjects(); // السلسلة (تبع الدرجة) بتتغيّر كمان تحت كل مشروع محمّل
    showToast('✅ اتحفظت الدرجة: '+gradeLabel(grade));
  }catch(e){ showToast('⚠ '+e.message, true); }
}
// ── المشاريع المحمّلة على حساب مهندس (بمعتمديها الخاصين) — بديل معتمدي الحساب الافتراضيين لكشوف مشروع معيّن ──
let _adminUserProjects=[];
async function adminLoadUserProjects(){
  if(!_adminSelected) return;
  try{ _adminUserProjects=(await api('GET',`/api/admin/users/${_adminSelected.id}/projects`)).data; }
  catch(e){ _adminUserProjects=[]; }
  adminRenderUserProjects();
}
function adminRenderUserProjects(){
  const u=_adminSelected; if(!u) return;
  const box=document.getElementById('admin-user-projects');
  const addSel=document.getElementById('admin-add-user-project');
  if(!box||!addSel) return;
  const chain=(_aprMeta.matrix||{})[u.grade||'junior']||[];
  box.innerHTML = _adminUserProjects.length ? _adminUserProjects.map(up=>{
    const rows = chain.length ? chain.map(l=>{
      const ui=APR_LEVEL_UI[l]; const cur=up[ui.field]?String(up[ui.field]):'';
      const opts=(_aprMeta.approvers||[]).filter(a=>a.grade===l&&String(a.id)!==String(u.id))
        .map(a=>`<option value="${esc(String(a.id))}"${String(a.id)===cur?' selected':''}>${esc(personName(a))} — ${esc(a.email)}</option>`).join('');
      const auto = l==='project manager' && !cur && _aprMeta.solePmId;
      const empty = auto ? '<option value="">(تلقائي — مدير المشروع الوحيد)</option>' : '<option value="">— مش محدد (المستوى ده هيتخطى) —</option>';
      return '<div class="add-row" style="margin-top:4px"><span class="hint" style="white-space:nowrap;min-width:74px">'+esc(ui.label)+':</span>'
        +'<select id="up-sel-'+up.projectId+'-'+ui.field+'">'+empty+(opts||'')+'</select>'
        +'<button class="btn btn-navy btn-inline" onclick="adminSaveUserProjectApprover('+up.projectId+',\''+ui.field+'\')">💾</button></div>';
    }).join('') : '<p class="hint" style="margin:4px 0">مفيش مستويات اعتماد لدرجة الحساب.</p>';
    return `<div class="setting-item" style="flex-direction:column;align-items:stretch;gap:4px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="setting-name">🏗 ${esc(up.name)}</div>
          <button class="btn-sm-del" onclick="adminRemoveUserProject(${up.projectId})">إزالة</button>
        </div>
        ${rows}
      </div>`;
  }).join('') : '<div class="home-empty">مفيش مشاريع محمّلة على الحساب</div>';
  const loaded=new Set(_adminUserProjects.map(up=>Number(up.projectId)));
  const avail=_projects.filter(p=>!loaded.has(Number(p.id)));
  addSel.innerHTML = avail.length ? avail.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('') : '<option value="">— كل المشاريع محمّلة —</option>';
}
async function adminLoadUserProject(){
  if(!_adminSelected) return;
  const sel=document.getElementById('admin-add-user-project');
  const projectId=sel&&sel.value?Number(sel.value):null;
  if(!projectId){ showToast('⚠ اختار مشروع', true); return; }
  try{
    await api('PUT',`/api/admin/users/${_adminSelected.id}/projects/${projectId}`,{});
    await adminLoadUserProjects();
    showToast('✅ اتحمّل المشروع على الحساب');
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function adminSaveUserProjectApprover(projectId, field){
  if(!_adminSelected) return;
  const sel=document.getElementById('up-sel-'+projectId+'-'+field);
  const v=sel?sel.value:'';
  try{
    await api('PUT',`/api/admin/users/${_adminSelected.id}/projects/${projectId}`,{[field]: v||null});
    await adminLoadUserProjects();
    showToast(v?'✅ اتحفظ المعتمد':'✅ اتشال الإسناد — المستوى هيتخطى');
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function adminRemoveUserProject(projectId){
  if(!_adminSelected) return;
  if(!confirm('تشيل المشروع ده من الحساب؟ كشوف أماكنه هترجع للمعتمدين الافتراضيين.')) return;
  try{
    await api('DELETE',`/api/admin/users/${_adminSelected.id}/projects/${projectId}`);
    await adminLoadUserProjects();
    showToast('✅ اتشال المشروع من الحساب');
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function adminSaveApprover(field){
  if(!_adminSelected) return;
  const v=document.getElementById('apr-sel-'+field).value;
  try{
    const r=await api('PATCH',`/api/admin/users/${_adminSelected.id}`,{[field]: v||null});
    Object.assign(_adminSelected, {approverTlId:r.data.approverTlId, approverCmId:r.data.approverCmId, approverPmId:r.data.approverPmId});
    adminFillGradeAndApprovers();
    showToast(v?'✅ اتحفظ المعتمد':'✅ اتشال الإسناد — المستوى هيتخطى');
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function adminSaveSite(){
  if(!_adminSelected) return;
  const site=Number(document.getElementById('admin-user-site').value)||1;
  try{
    const r=await api('PATCH',`/api/admin/users/${_adminSelected.id}`,{site});
    _adminSelected.site=r.data.site;
    showToast('✅ اتحفظ — كشوفه الجاية هتروح لشيت '+siteName(site));
    renderAdmin();
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function adminSaveRole(){
  if(!_adminSelected) return;
  const role=document.getElementById('admin-user-role').value;
  if(role===_adminSelected.role){ showToast('ℹ الصلاحية زي ما هي'); return; }
  try{
    const r=await api('PATCH',`/api/admin/users/${_adminSelected.id}`,{role});
    _adminSelected.role=r.data.role;
    showToast(role==='ADMIN' ? '✅ بقى مدير نظام — هيتسجّل خروجه ويدخل تاني بالصلاحية الجديدة' : '✅ بقى مستخدم عادي');
    renderAdmin();
  }catch(e){ showToast('⚠ '+e.message, true); }
}

// ── حذف الحساب نهائيًا — تأكيد مرتين جوه التطبيق (confirm() بيتكتم في PWA) ──
function adminDeleteCancel(){
  ['admin-delete-step1','admin-delete-step2'].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  const s0=document.getElementById('admin-delete-step0'); if(s0 && _adminSelected && _adminSelected.email!==getCurrentUserEmail()) s0.style.display='';
  const inp=document.getElementById('admin-delete-confirm-email'); if(inp) inp.value='';
}
async function adminDeleteStep1(){
  if(!_adminSelected) return;
  document.getElementById('admin-delete-step0').style.display='none';
  const box=document.getElementById('admin-delete-step1'); box.style.display='block';
  const sum=document.getElementById('admin-delete-summary'); sum.textContent='⏳ جاري حساب البيانات...';
  try{
    const d=(await api('GET',`/api/admin/users/${_adminSelected.id}/summary`)).data;
    sum.innerHTML='الحساب: <b style="direction:ltr;unicode-bidi:embed">'+esc(_adminSelected.email)+'</b><br>'
      +'📋 '+d.records+' سجل سراكي · 👷 '+d.contractors+' مقاول · 📍 '+d.places+' مكان · ✅ '+d.todos+' مهمة<br>'
      +'🔍 '+d.irRecords+' IR · 🏗 '+d.execRecords+' موقف تنفيذي · 📷 '+d.dailyRecords+' تقرير يومي · 🖼 '+d.files+' ملف';
  }catch(e){ sum.textContent='⚠ تعذر حساب البيانات — '+e.message; }
  box.scrollIntoView({behavior:'smooth',block:'center'});
}
function adminDeleteStep2(){
  document.getElementById('admin-delete-step1').style.display='none';
  const box=document.getElementById('admin-delete-step2'); box.style.display='block';
  setTimeout(()=>document.getElementById('admin-delete-confirm-email').focus(),100);
  box.scrollIntoView({behavior:'smooth',block:'center'});
}
async function adminDeleteFinal(){
  if(!_adminSelected) return;
  const typed=document.getElementById('admin-delete-confirm-email').value.trim().toLowerCase();
  if(typed!==_adminSelected.email.toLowerCase()){ showToast('⚠ الإيميل مش مطابق — ما اتحذفش حاجة', true); return; }
  try{
    const r=await api('DELETE',`/api/admin/users/${_adminSelected.id}`,{confirmEmail:typed});
    showToast('🗑 تم حذف '+r.data.deleted+' وكل بياناته نهائيًا');
    adminCloseUser();
    renderAdmin();
  }catch(e){ showToast('⚠ '+e.message, true); }
}

async function adminResetPassword(){
  if(!_adminSelected) return;
  const inp=document.getElementById('admin-new-pass'); const pw=inp.value;
  if(pw.length<8){ showToast('⚠ كلمة المرور 8 أحرف على الأقل', true); return; }

  try{
    await api('POST',`/api/admin/users/${_adminSelected.id}/reset-password`,{newPassword:pw});
    inp.value='';
    showToast('✅ تم — سلّم كلمة المرور الجديدة للمهندس');
  }catch(e){ showToast('⚠ '+e.message, true); }
}
function adminCopyCreated(){
  const email=document.getElementById('admin-created-email').textContent;
  const pass=document.getElementById('admin-created-pass').textContent;
  copyTextToClipboard('تطبيق CEA\nالإيميل: '+email+'\nكلمة المرور: '+pass+'\nالرابط: https://cea-app.pages.dev');
}
async function adminCreateUser(){
  const email=document.getElementById('admin-new-email').value.trim().toLowerCase();
  const password=document.getElementById('admin-new-password').value;
  // رسائل خطأ محددة عشان يبقى واضح إيه الناقص بالظبط
  if(!email){ showToast('⚠ اكتب الإيميل', true); return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ showToast('⚠ صيغة الإيميل غلط — مثال: name@gmail.com', true); return; }
  if(password.length<8){ showToast('⚠ كلمة المرور لازم 8 أحرف على الأقل (دلوقتي '+password.length+')', true); return; }
  const mods=adminReadModules('admin-create-modules');
  if(!mods.length && !confirm('مفيش أي وحدة متعلّمة — المهندس مش هيشوف غير الإعدادات. تكمل؟')) return;
  try{
    const role=document.getElementById('admin-new-role')?.value||'ENGINEER';
    const title=document.getElementById('admin-new-title')?.value.trim()||'';
    const site=Number(document.getElementById('admin-new-site')?.value)||1;
    const project=document.getElementById('admin-new-project')?.value||'سكني';
    await api('POST','/api/admin/users',{email, password, role, title, site, project, enabledModules:mods, enabledFeatures:adminReadFeatures('admin-create-modules')});
    if(document.getElementById('admin-new-title')) document.getElementById('admin-new-title').value='';
    document.getElementById('admin-new-email').value=''; document.getElementById('admin-new-password').value='';
    // اعرض البيانات في صندوق واضح مع زرار نسخ (كلمة المرور مش بتتخزن — دي الفرصة الوحيدة لقراءتها)
    document.getElementById('admin-created-email').textContent=email;
    document.getElementById('admin-created-pass').textContent=password;
    const box=document.getElementById('admin-created-box'); box.style.display='block';
    showToast('✅ تم إنشاء الحساب');
    await renderAdmin();
    box.scrollIntoView({behavior:'smooth', block:'center'});
  }catch(e){
    const msg = e.code==='CONFLICT' ? 'الإيميل ده مسجّل بالفعل — اختار إيميل تاني' : (e.code==='FORBIDDEN' ? 'إنشاء الحسابات للأدمن فقط' : e.message);
    showToast('⚠ '+msg, true);
  }
}

// ── الرئيسية: نظرة اليوم (كل الأرقام من البيانات المحلية) ──
function renderHome(){
  const today=todayYMD();
  const greetEl=document.getElementById('home-greeting');
  if(greetEl){
    const h=new Date().getHours();
    const g = h<12 ? 'صباح الخير' : (h<17 ? 'نهارك سعيد' : 'مساء الخير');
    // بدون اسم من الإيميل (شكله تقني) — يا بشمهندس تكفي وتناسب الكل
    greetEl.textContent = g + ' يا بشمهندس 👋';
  }
  const dateEl=document.getElementById('home-date');
  if(dateEl){
    const d=new Date();
    dateEl.textContent = d.toLocaleDateString('ar-EG',{weekday:'long', day:'numeric', month:'long', year:'numeric'});
  }

  // سراكي اليوم + الأسبوع
  const todayRecs=records.filter(r=>r.date===today);
  const todayTotal=todayRecs.reduce((s,r)=>s+(Number(r.total)||0),0);
  const wb=getWeekBoundsForDate(today);
  const wStart=toYMD(wb.start), wEnd=toYMD(wb.end); // أسبوع العمل الأربعاء→الثلاثاء (نفس منطق شاشة السراكي)
  const weekRecs=records.filter(r=>r.date>=wStart && r.date<=wEnd);
  const weekTotal=weekRecs.reduce((s,r)=>s+(Number(r.total)||0),0);
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  // أرقام العدّادات بدون كسور (الكسور بس للمبالغ)
  const fmtInt = n => Number(n||0).toLocaleString('ar-EG',{maximumFractionDigits:0});
  set('hs-today-count', fmtInt(todayRecs.length));
  set('hs-today-total', fmtInt(todayTotal)+' ج.م');
  set('hs-week-total', fmtInt(weekTotal));
  set('hs-week-count', fmtInt(weekRecs.length)+' سجل · ج.م');

  // المهام
  const open=todos.filter(t=>!t.done);
  const late=open.filter(t=>t.date && t.date<today);
  set('hs-late', late.length.toLocaleString('ar-EG'));
  set('hs-todo-open', open.length.toLocaleString('ar-EG')+' مفتوحة');
  const lateCard=document.getElementById('hs-late-card'); if(lateCard) lateCard.classList.toggle('warn', late.length>0);

  // إنجاز الموقع (متوسط نسب الموقف التنفيذي)
  if(execRecords.length){
    const avg=execRecords.reduce((s,e)=>s+(Number(e.pct)||0),0)/execRecords.length;
    set('hs-exec', Math.round(avg).toLocaleString('ar-EG')+'%');
    set('hs-exec-sub', execRecords.length.toLocaleString('ar-EG')+' بند متابَع');
  } else { set('hs-exec','—'); set('hs-exec-sub','لا يوجد بيانات'); }

  // آخر 5 سجلات (بالتاريخ ثم بالـ id)
  const recent=[...records].sort((a,b)=> (b.date||'').localeCompare(a.date||'') || (Number(b.id)-Number(a.id))).slice(0,5);
  const recEl=document.getElementById('home-recent');
  if(recEl){
    recEl.innerHTML = recent.length
      ? recent.map(r=>`<div class="home-row"><div style="min-width:0"><div class="n">${esc(r.contractor)}</div><div class="s">${esc(r.date)} · ${esc(r.place||'—')}${r.spec?' · '+esc(r.spec):''}</div></div><div class="v">${fmt(r.total)} ج.م</div></div>`).join('')
      : '<div class="home-empty">لا توجد سجلات بعد — ابدأ بتسجيل أول سراكي</div>';
  }

  // مهام اليوم (المستحقة اليوم + المتأخرة)
  const todayTodos=open.filter(t=>t.date && t.date<=today).sort((a,b)=>(a.date||'').localeCompare(b.date||'')).slice(0,5);
  const tdEl=document.getElementById('home-todos');
  if(tdEl){
    tdEl.innerHTML = todayTodos.length
      ? todayTodos.map(t=>`<div class="home-row${t.date<today?' late':''}"><div style="min-width:0"><div class="n">${esc(t.notes)}</div><div class="s">${t.date<today?'⚠ متأخرة منذ ':''}${esc(t.date)}${t.place?' · '+esc(t.place):''}</div></div><div class="v" style="font-size:11px">${esc(t.priority||'')}</div></div>`).join('')
      : '<div class="home-empty">لا توجد مهام مستحقة اليوم 👌</div>';
  }

  // حالة المزامنة
  const syncEl=document.getElementById('home-sync');
  if(syncEl){
    const st=document.getElementById('sync-status');
    syncEl.textContent = !navigator.onLine ? '⚠ أوفلاين — شغلك محفوظ محليًا وهيتزامن تلقائيًا'
      : (st&&st.textContent ? st.textContent : '☁️ متصل بالخادم');
  }
}

async function exportExcel(){
  await ensureXLSX();
  const {pq,dq,cq}=getRecordFilters();
  const exp=getFilteredRecords();
  if(!exp.length){showToast('⚠ لا يوجد بيانات بالفلتر ده',true);return;}
  // ملحوظة: نفس الأعمدة دي هي اللي بيتعرف عليها زرار "استرداد السجلات من Excel" بالاسم
  const h=['اليوم','التاريخ','إسم المقاول','تخصص المقاول','العدد','النوع','السعر','الخصم','الإجمالي','مكان الأعمال','بيان الأعمال','بالخصم على','ملاحظة الخصم'];
  const rows=exp.map(r=>[r.day,r.date,r.contractor,r.spec,Number(r.qty)||0,r.qtyType||'يومية',Number(r.price)||0,Number(r.discount)||0,Number(r.total)||0,r.place,r.notes,deductList(r).join(' ، '),r.deductNote||'']);
  const totalAll=exp.reduce((s,r)=>s+(Number(r.total)||0),0);
  rows.push([],['','','','','','','','الإجمالي الكلي',totalAll]);
  const ws=XLSX.utils.aoa_to_sheet([h,...rows]);
  ws['!cols']=[10,12,24,20,8,10,12,10,14,20,40,22,30].map(w=>({wch:w}));
  ws['!views']=[{rightToLeft:true}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'سجل العمال');
  const label=cq||pq||dq||scopeLabel();
  const fileName=`سراكي_عمال_${label}_${todayYMD()}.xlsx`;
  if(window.isCapacitor){
    try{
      const wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'});
      const uint8 = new Uint8Array(wbout);
      const b64 = bytesToBase64(uint8);
      window.Capacitor.Plugins.Filesystem.writeFile({
        path: fileName, data: b64, directory: 'CACHE', recursive: true
      }).then(()=>window.Capacitor.Plugins.Filesystem.getUri({path:fileName,directory:'CACHE'}))
        .then(u=>window.Capacitor.Plugins.Share.share({title:fileName,url:u.uri}))
        .then(()=>showToast(`📥 تم تنزيل ${exp.length} سجل!`))
        .catch(e=>showToast('⚠ خطأ في الحفظ: '+e.message,true));
    }catch(e){showToast('⚠ خطأ: '+e.message,true);}
  } else {
    XLSX.writeFile(wb, fileName);
    showToast(`📥 تم تنزيل ${exp.length} سجل!`);
  }
}
/* ═══════════ بيان أعمال المقاول (غير رسمي) — 9 سبتمبر 2026 ═══════════
   ده مش كشف اعتماد — مفيش خانات توقيع ولا اعتماد،
   وبيشتغل على مدى تواريخ حر (من → إلى) مش أسبوع واحد، عشان المقاول يعرف عمل شغل بكام
   في فترة معينة ومن مكان معين. الإخراج: صفحة HTML بـCSS طباعة،
   والمستخدم يختار "حفظ كـ PDF" — مفيش مكتبة PDF، فالعربي بيطلع سليم. */
function stmtVal(id){ const el=document.getElementById(id); return el?(el.value||'').trim():''; }
/* سجلات البيان: مدى التواريخ الخاص بالبيان + فلاتر المكان/المقاول اللي على الشاشة.
   ⚠ مش بنستخدم getFilteredRecords() لأنها بتفرض أسبوع الشاشة أو يوم واحد — وده عكس فكرة "فترة". */
function stmtRecords(){
  const {nq,pq,cq}=getRecordFilters();
  const from=stmtVal('stmt-from'), to=stmtVal('stmt-to');
  let f=records.filter(r=>{
    if(from && r.date<from) return false;
    if(to   && r.date>to)   return false;
    if(nq && !(r.contractor||'').toLowerCase().includes(nq)) return false;
    if(pq && r.place!==pq) return false;
    if(cq && r.contractor!==cq) return false;
    if(exportContractorChips.length && !exportContractorChips.includes(r.contractor)) return false;
    if(exportPlaceChips.length && !exportPlaceChips.includes(r.place)) return false;
    return true;
  });
  // مقاول ورا مقاول، وكل مقاول بالتاريخ من الأقدم للأحدث
  f.sort((a,b)=> String(a.contractor||'').localeCompare(String(b.contractor||''),'ar') || String(a.date).localeCompare(String(b.date)));
  return f;
}
function stmtMoney(n){ return Number(n||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function exportWorkStatement(){
  const exp=stmtRecords();
  if(!exp.length){ showToast('⚠ مفيش سجلات في الفترة والفلاتر دي',true); return; }
  const from=stmtVal('stmt-from'), to=stmtVal('stmt-to');
  const {pq}=getRecordFilters();

  // أعمدة اختيارية: بتظهر بس لو فيها بيانات فعلًا — عشان الورقة ما تتزحمش بأعمدة فاضية
  const onePlace = pq || (exportPlaceChips.length===1 ? exportPlaceChips[0] : (new Set(exp.map(r=>r.place||'')).size===1 ? (exp[0].place||'') : ''));
  const showPlace = !onePlace;
  const showDisc  = exp.some(r=>Number(r.discount)>0);
  const showNotes = exp.some(r=>(r.notes||'').trim());

  const byContractor=new Map();
  exp.forEach(r=>{ const k=r.contractor||'—'; if(!byContractor.has(k)) byContractor.set(k,[]); byContractor.get(k).push(r); });

  const heads=['#','التاريخ','اليوم','البيان']
    .concat(showPlace?['المكان']:[])
    .concat(['العدد','السعر'])
    .concat(showDisc?['خصم']:[])
    .concat(['الإجمالي'])
    .concat(showNotes?['ملاحظات']:[]);
  const colCount=heads.length;

  let grand=0;
  const sections=[...byContractor.entries()].map(([name,rows])=>{
    let sub=0;
    const body=rows.map((r,i)=>{
      sub+=Number(r.total)||0;
      return '<tr>'
        +'<td class="c">'+(i+1)+'</td>'
        +'<td class="c">'+esc(r.date)+'</td>'
        +'<td class="c">'+esc(r.day||'')+'</td>'
        +'<td>'+esc(r.spec||'—')+'</td>'
        +(showPlace?'<td>'+esc(r.place||'')+'</td>':'')
        +'<td class="c">'+esc(String(r.qty||0))+' '+esc(r.qtyType||'')+'</td>'
        +'<td class="n">'+stmtMoney(r.price)+'</td>'
        +(showDisc?'<td class="n red">'+(Number(r.discount)>0?stmtMoney(r.discount):'—')+'</td>':'')
        +'<td class="n bold green">'+stmtMoney(r.total)+'</td>'
        +(showNotes?'<td>'+esc(r.notes||'')+'</td>':'')
        +'</tr>';
    }).join('');
    grand+=sub;
    return '<div class="grp">'
      + '<div class="grp-h">👷 '+esc(name)+' <small>'+rows.length+' سجل</small></div>'
      + '<table><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead>'
      + '<tbody>'+body+'</tbody>'
      + '<tfoot><tr><td colspan="'+(colCount-1)+'">إجمالي أعمال '+esc(name)+'</td><td class="n">'+stmtMoney(sub)+' ج.م</td></tr></tfoot>'
      + '</table></div>';
  }).join('');

  const periodTxt = (from||to)
    ? ('من '+esc(from||'البداية')+' إلى '+esc(to||'النهاية'))
    : 'كل السجلات المسجّلة';
  const today=new Date().toLocaleDateString('ar-EG');
  const html='<!DOCTYPE html>\n<html lang="ar" dir="rtl"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>بيان أعمال — '+esc([...byContractor.keys()].join(' · ').slice(0,60))+'</title><style>'
    + "@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');"
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + "body{font-family:'Cairo',sans-serif;direction:rtl;background:#fff;color:#1A2640;padding:10px}"
    + '.head{border-top:3px solid #1F3864;border-bottom:3px solid #C9A84C;background:#EBF1FB;padding:10px 14px;margin-bottom:10px}'
    + '.head h1{font-size:17px;color:#1F3864}'
    + '.head .sub{font-size:10px;color:#8A6D1D;font-weight:700;margin-top:2px}'
    + '.head .meta{margin-top:6px;display:flex;gap:16px;flex-wrap:wrap;font-size:11px}'
    + '.head .meta b{color:#1F3864}'
    + '.grp{margin-bottom:14px}'
    + '.grp-h{background:#1F3864;color:#fff;font-weight:900;font-size:12px;padding:6px 10px;border-radius:6px 6px 0 0}'
    + '.grp-h small{font-weight:600;opacity:.75;font-size:10px}'
    + 'table{width:100%;border-collapse:collapse;font-size:10px}'
    + 'thead tr{background:#2F5496;color:#fff}'
    + 'thead th{padding:5px 4px;border:1px solid #2F5496;font-size:10px}'
    + 'tbody tr:nth-child(even){background:#F5F8FF}'
    + 'tbody td{padding:5px 4px;border:1px solid #D5E1F0;line-height:1.4;word-break:break-word}'
    + 'td.c{text-align:center}td.n{text-align:left;direction:ltr}'
    + '.bold{font-weight:900}.green{color:#1B5E20}.red{color:#C62828}'
    + 'tfoot tr{background:#EBF1FB}'
    + 'tfoot td{padding:6px;font-weight:900;font-size:11px;border:1px solid #C5D3E8;text-align:left;direction:ltr}'
    + 'tfoot td:first-child{text-align:right;direction:rtl}'
    + '.grand{margin-top:6px;background:#1B5E20;color:#fff;padding:9px 14px;border-radius:8px;display:flex;justify-content:space-between;font-weight:900;font-size:13px}'
    + '.note{margin-top:10px;font-size:10px;color:#6B7A99;border-right:3px solid #C9A84C;padding:4px 8px}'
    + '.foot{margin-top:10px;text-align:center;font-size:9px;color:#aaa;border-top:2px solid #C9A84C;padding-top:6px}'
    + '.print-btn{position:fixed;bottom:16px;left:16px;background:#1F3864;color:#fff;border:none;border-radius:8px;'
    + "padding:10px 16px;font-family:'Cairo',sans-serif;font-weight:900;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25)}"
    // الطباعة: A4 طولي مع السماح بتعدد الصفحات — البيان ممكن يكون شهر كامل.
    // صف العناوين بيتكرر في كل صفحة، والصف الواحد ما ينقسمش بين صفحتين.
    + '@media print{@page{size:A4 portrait;margin:8mm}'
    + 'html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0}'
    + 'thead{display:table-header-group}tfoot{display:table-row-group}'
    + 'tr{page-break-inside:avoid}.grp{page-break-inside:auto}'
    + '.print-btn{display:none}}'
    + '</style></head><body>'
    + '<div class="head"><h1>📋 بيان أعمال</h1>'
    + '<div class="sub">غير رسمي — للاطلاع فقط، مش بديل عن كشف السركي المعتمد</div>'
    + '<div class="meta">'
    + '<div><b>الفترة:</b> '+periodTxt+'</div>'
    + (onePlace?'<div><b>المكان:</b> '+esc(onePlace)+'</div>':'')
    + '<div><b>عدد السجلات:</b> '+exp.length+'</div>'
    + '<div><b>تاريخ الطباعة:</b> '+esc(today)+'</div>'
    + '</div></div>'
    + sections
    + (byContractor.size>1 ? '<div class="grand"><span>الإجمالي العام ('+byContractor.size+' مقاولين)</span><span style="direction:ltr">'+stmtMoney(grand)+' ج.م</span></div>' : '')
    + '<div class="note">البيان ده اتولّد من سجلات التطبيق في التاريخ الموضّح. أي تعديل على السجلات بعد كده مش هيظهر فيه — اطبع نسخة جديدة.</div>'
    + '<div class="foot">Civil Engineer Assistant (CEA) — by Eng / Ahmed Osama — '+esc(today)+'</div>'
    + '<button class="print-btn" onclick="window.print()">🖨 اطبع / احفظ PDF</button>'
    + '</body></html>';

  const who=[...byContractor.keys()].join('_').slice(0,40);
  const fileName=('CEA_بيان_أعمال_'+who+'_'+todayYMD()+'.html').replace(/[^a-zA-Z0-9؀-ۿ_.-]/g,'_');
  stmtDeliver(html, fileName, exp.length);
}
/* التسليم: أندرويد = ملف في الكاش + share sheet · المتصفح = تاب جديد (وتنزيل لو المنبثق متمنوع) */
function stmtDeliver(html, fileName, count){
  if(window.isCapacitor){
    const b64=utf8ToBase64(html);
    window.Capacitor.Plugins.Filesystem.writeFile({path:fileName,data:b64,directory:'CACHE',recursive:true})
      .then(()=>window.Capacitor.Plugins.Filesystem.getUri({path:fileName,directory:'CACHE'}))
      .then(u=>window.Capacitor.Plugins.Share.share({title:'بيان أعمال — CEA',text:count+' سجل',url:u.uri,dialogTitle:'افتح أو احفظ الـ PDF'}))
      .then(()=>showToast('🖨 '+count+' سجل — اختار "طباعة" أو "حفظ PDF"'))
      .catch(e=>showToast('⚠ خطأ: '+e.message,true));
    return;
  }
  const win=window.open('','_blank');
  if(win){ win.document.write(html); win.document.close(); showToast('🖨 '+count+' سجل — اضغط "اطبع / احفظ PDF"'); return; }
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=fileName; a.click();
  URL.revokeObjectURL(url);
  showToast('⬇️ اتنزّل الملف — افتحه واطبعه كـ PDF');
}
// (9 سبتمبر 2026) اتشالت `exportPDF()` — كانت كود ميت من يوم ما اتشال زرارها من الـ HTML.
// بديلها للطباعة دلوقتي: exportWorkStatement() (بيان أعمال المقاول) — والكشف الرسمي بيتبني في السيرفر ويطلع PDF من جوجل شيت.
function getWeekBoundsForDate(dateVal){
  const d = (dateVal instanceof Date) ? new Date(dateVal) : new Date(dateVal+'T00:00:00');
  d.setHours(0,0,0,0);
  const dow = d.getDay();
  const daysSinceWed = (dow+7-3)%7;
  const wed = new Date(d); wed.setDate(d.getDate()-daysSinceWed);
  const tue = new Date(wed); tue.setDate(wed.getDate()+6);
  return {start:wed, end:tue};
}

function buildApprovedSheet(workbook, contractorName, exp, weekBounds, sigImgId, placeLabel=null){
  const c = contractors.find(x=>x.name===contractorName);
  const {start} = weekBounds;
  const wkStart = toYMD(weekBounds.start), wkEnd = toYMD(weekBounds.end);

  const sheetTitleBase = placeLabel ? `${contractorName||'مقاول'} - ${placeLabel}` : (contractorName||'مقاول');
  let safeName = sheetTitleBase.replace(/[\\\/\?\*\[\]:]/g,'').slice(0,31) || 'مقاول';
  let finalName = safeName, dupIdx = 1;
  while(workbook.getWorksheet(finalName)){ dupIdx++; finalName = (safeName.slice(0,28)+'_'+dupIdx); }

  // الورقة نفسها يمين→شمال (الأعمدة تبدأ من اليمين زي ما بيتقرأ الشيت)
  const ws = workbook.addWorksheet(finalName, {
    pageSetup:{paperSize:9, orientation:'landscape', fitToPage:true},
    views:[{rightToLeft:true}]
  });

  ws.columns = [
    {width:12}, {width:10},
    {width:12},{width:6},{width:6},{width:6},{width:6},
    {width:12},
    {width:14},
    {width:9},
    {width:14},
    {width:12},
    {width:11},
  ];

  const thin = {style:'thin', color:{argb:'FF999999'}};
  const allBorders = {top:thin,left:thin,right:thin,bottom:thin};
  // readingOrder:'rtl' = النص المختلط (عربي + أرقام إنجليزية) يتقرأ يمين→شمال دايمًا
  // بدل ما Excel يحدد الاتجاه من أول حرف (رقم = شمال→يمين = ترتيب الكلمات يتلخبط)
  const centerWrap = {vertical:'middle', horizontal:'center', wrapText:true, readingOrder:'rtl'};
  const navy = 'FF1F3864', gold = 'FFC9A84C';

  function styleRange(r1,c1,r2,c2, opts){
    for(let r=r1;r<=r2;r++) for(let cc=c1;cc<=c2;cc++){
      const cell = ws.getCell(r,cc);
      cell.border = allBorders;
      cell.alignment = centerWrap;
      if(opts && opts.font) cell.font = opts.font;
      if(opts && opts.fill) cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:opts.fill}};
    }
  }

  ws.mergeCells(1,1,1,13);
  ws.getCell(1,1).value = 'شركة هوم جيت للمقاولات ش م م';
  styleRange(1,1,1,13,{font:{bold:true,size:14,color:{argb:'FFFFFFFF'},name:'Arial'}, fill:navy});
  ws.getRow(1).height = 24;

  const siteIds=[...new Set(exp.map(r=>placeProjectId(r.place)))];
  const projectLabel = siteIds.map(s=>siteName(s)).join(' ، ');

  ws.mergeCells(2,1,2,13);
  ws.getCell(2,1).value = `${projectLabel}  —  سجل سركي معدات وعمالة أسبوعي`;
  styleRange(2,1,2,13,{font:{bold:true,size:11,color:{argb:navy},name:'Arial'}, fill:gold});
  ws.getRow(2).height = 20;

  // ‏ (علامة اتجاه عربي غير مرئية) بعد النقطتين: من غيرها الخلية بتتقرأ LTR فالنقطتين بتظهر في الجهة الغلط (Excel/جوجل شيت/PDF)
  ws.mergeCells(3,11,3,13); ws.getCell(3,13).value = 'إسم العامل :‏';
  ws.mergeCells(3,8,3,10);  ws.getCell(3,10).value = c ? c.name : contractorName;
  ws.mergeCells(3,5,3,7);   ws.getCell(3,7).value = 'المهنة :‏';
  ws.mergeCells(3,1,3,4);   ws.getCell(3,4).value = c ? (c.spec||'') : '';
  styleRange(3,1,3,13,{font:{size:10,name:'Arial'}});
  [13,7].forEach(cc=>{ws.getCell(3,cc).font={bold:true,size:10,name:'Arial',color:{argb:navy}};});

  const currentPlace = placeLabel || [...new Set(exp.map(r=>r.place).filter(Boolean))].join(' ، ');
  ws.mergeCells(4,11,4,13); ws.getCell(4,13).value = 'الموقع :‏';
  ws.mergeCells(4,8,4,10);  ws.getCell(4,10).value = currentPlace;
  ws.mergeCells(4,5,4,7);   ws.getCell(4,7).value = 'المشروع :‏';
  ws.mergeCells(4,1,4,4);   ws.getCell(4,1).value = projectLabel;
  styleRange(4,1,4,13,{font:{size:10,name:'Arial'}});
  [13,7].forEach(cc=>{ws.getCell(4,cc).font={bold:true,size:10,name:'Arial',color:{argb:navy}};});

  ws.mergeCells(5,9,5,13); ws.getCell(5,13).value = 'نوع المعدة وقيمتها / قيمة اليومية :‏';
  ws.mergeCells(5,6,5,8);  ws.getCell(5,8).value = c && c.rate ? `${Number(c.rate).toLocaleString('ar-EG')} ج.م / ${c.rateType||'يومية'}` : '';
  ws.getCell(5,4).value = 'من :‏';
  ws.getCell(5,3).value = wkStart;
  ws.getCell(5,2).value = 'إلى :‏';
  ws.getCell(5,1).value = wkEnd;
  styleRange(5,1,5,13,{font:{size:10,name:'Arial'}});
  ws.getCell(5,13).font = {bold:true,size:10,name:'Arial',color:{argb:navy}};
  ws.getCell(5,4).font  = {bold:true,size:10,name:'Arial',color:{argb:navy}};
  ws.getCell(5,2).font  = {bold:true,size:10,name:'Arial',color:{argb:navy}};
  ws.getCell(5,1).alignment = {vertical:'middle', horizontal:'center', wrapText:false, readingOrder:'rtl'};
  ws.getCell(5,3).alignment = {vertical:'middle', horizontal:'center', wrapText:false, readingOrder:'rtl'};
  ws.getRow(5).height = 20;

  const headerRow = 7;
  const headers = [
    [13,13,'اليوم'],[12,12,'التاريخ'],[11,11,'عدد الساعات / المقطوعية'],
    [10,10,'إضافي'],[9,9,'قيمة الساعة / المقطوعية'],[8,8,'إجمالي'],
    [3,7,'بيان الأعمال'],[2,2,'بالخصم على'],[1,1,'التوقيع']
  ];
  headers.forEach(([c1,c2,label])=>{
    if(c1!==c2) ws.mergeCells(headerRow,c1,headerRow,c2);
    ws.getCell(headerRow,c1).value = label;
  });
  styleRange(headerRow,1,headerRow,13,{font:{bold:true,size:10,color:{argb:'FFFFFFFF'},name:'Arial'}, fill:navy});
  ws.getRow(headerRow).height = 22;

  const dayNames = ['الأربعاء','الخميس','الجمعة','السبت','الأحد','الاثنين','الثلاثاء'];
  let total = 0;
  const firstDataRow = headerRow+1;
  const filledRows = [];
  for(let i=0;i<7;i++){
    const row = firstDataRow+i;
    const d = new Date(start); d.setDate(start.getDate()+i);
    const ymd = toYMD(d);
    const dayRecs = exp.filter(r=>r.date===ymd);
    ws.getCell(row,13).value = dayNames[i];
    ws.getCell(row,12).value = ymd;
    ws.mergeCells(row,3,row,7);
    if(dayRecs.length){
      const sumTotal = dayRecs.reduce((s,r)=>s+(Number(r.total)||0),0);
      const deductOnNames = [...new Set(dayRecs.flatMap(r=>Array.isArray(r.deductOn)?r.deductOn:(r.deductOn?[r.deductOn]:[])))];
      const deductNotesTxt = [...new Set(dayRecs.map(r=>r.deductNote).filter(Boolean))].join(' / ');
      const notesTxt = dayRecs.map(r=>r.notes).filter(Boolean).join(' / ');

      // RLM (علامة يمين→شمال) في أول كل سطر: النص اللي بيبدأ برقم إنجليزي ("3 يومية")
      // يفضل يتقرأ من اليمين حتى في برامج ما بتحترمش readingOrder (معاينة الموبايل / Google Sheets)
      const RLM = '‏';
      if(dayRecs.length === 1){
        const r0 = dayRecs[0];
        ws.getCell(row,11).value = `${RLM}${r0.qty} ${r0.qtyType || 'يومية'}`;
        ws.getCell(row,9).value  = Number(r0.price) || 0;
      } else {
        // لو فيه أكتر من سجل لنفس المقاول في نفس اليوم
        // خانة العدد تتكتب تحت بعض (مثال: 1 يومية
        ws.getCell(row,11).value = dayRecs.map(r => `${RLM}${r.qty} ${r.qtyType || 'يومية'}`).join('\n');
        // خانة المبلغ تتكتب تحت بعض (مثال: 1 يومية @ 230
        ws.getCell(row,9).value  = dayRecs.map(r => `${RLM}${r.qty} ${r.qtyType || 'يومية'} @ ${Number(r.price) || 0}`).join('\n');
      }

      ws.getCell(row,8).value  = sumTotal;
      ws.getCell(row,3).value  = notesTxt;
      ws.getCell(row,2).value  = [deductOnNames.join(' ، '), deductNotesTxt].filter(Boolean).join('\n');
      total += sumTotal;
      filledRows.push(row);
    }
    styleRange(row,1,row,13,{font:{size:10,name:'Arial'}});
    ws.getRow(row).height = 30;
  }

  const totalRow = firstDataRow+7;
  ws.mergeCells(totalRow,9,totalRow,13);
  ws.getCell(totalRow,13).value = 'الإجمالي';
  ws.getCell(totalRow,8).value = total;
  styleRange(totalRow,1,totalRow,13,{font:{bold:true,size:11,color:{argb:'FFFFFFFF'},name:'Arial'}, fill:navy});
  ws.getRow(totalRow).height = 22;

  const sigRow = totalRow+1, sigCapRow = totalRow+2;
  ws.mergeCells(sigRow,10,sigRow,13);
  ws.mergeCells(sigRow,7,sigRow,9);
  ws.mergeCells(sigRow,1,sigRow,5);
  styleRange(sigRow,1,sigRow,13,{font:{size:10,name:'Arial'}});
  ws.getRow(sigRow).height = 55;

  // بلوكات التوقيع (سبتمبر 2026): A = مدير المشروع · G = مدير التنفيذ · J = مدير الفريق (كان "توقيع العامل").
  // التوقيعات بتتختم في السيرفر من حساب كل معتمد لحظة اكتمال السلسلة (signStamp.ts) — وبيتعرّف على
  // البلوك من نص العنوان ده نفسه، فلو اتغيّر ترتيب البلوكات هنا السيرفر بيتبعه تلقائيًا.
  ws.mergeCells(sigCapRow,10,sigCapRow,13); ws.getCell(sigCapRow,13).value = 'توقيع مدير الفريق';
  ws.mergeCells(sigCapRow,7,sigCapRow,9);   ws.getCell(sigCapRow,7).value = 'توقيع مدير التنفيذ';
  ws.mergeCells(sigCapRow,1,sigCapRow,5);   ws.getCell(sigCapRow,5).value = 'توقيع مدير المشروع';
  styleRange(sigCapRow,1,sigCapRow,13,{font:{bold:true,size:9,color:{argb:navy},name:'Arial'}});

  if(sigImgId!==null){
    filledRows.forEach(row=>{
      // twoCellAnchor (tl+br) بدل oneCellAnchor (tl+ext):
      // ExcelJS بيكتب أبعاد الصورة الداخلية صفر، وExcel الصارم بيحترم الصفر فتختفي الصورة
      // (بينما Google Sheets متسامح وبيعرضها) — المرساة بنقطتين بتحدد الحجم من الخليتين نفسهم
      // twoCellAnchor داخل نفس الخلية (حجم ثابت محتوى داخل الحدود) — الحالة الأصلية.
      // ملاحظة: التحجيم-مع-الخلية + التمركز + الاحتواء مع بعض غير ممكن موثوقًا في شيت RTL.
      ws.addImage(sigImgId, {
        tl: {col:0.06, row:(row-1)+0.08},
        br: {col:0.94, row:(row-1)+0.92},
        editAs: 'oneCell'
      });
    });
  }

  return total;
}

// يبني ملف الكشف المعتمد (نفس المنطق لزراري التنزيل والإرسال) ويرجّع الملف + ملخص بياناته
// ── مقاولون بيتقدّموا في أول المصنّف ──
// (12 سبتمبر 2026) طلب الـDC: سراكي العمالة دي بتتجمّع في الآخر فبتضيع منه وهو بيراجع.
// الأسماء هنا بتتقارن بعد تطبيع المسافات والألف/الياء، فاختلاف كتابة بسيط مايكسرش المطابقة.
// (19 سبتمبر 2026) اتحولت من مصفوفة ثابتة لمشتقة من علامة isLabor على المقاول — عدّلها من إدارة المقاولين مش هنا.
function sheetFirstContractors(){ return contractors.filter(c=>c.isLabor).map(c=>c.name); }
function normContractorName(s){
  return String(s||'').replace(/\s+/g,' ').trim()
    .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه');
}
// مقاول عمالة (يتبعت في كشف لوحده) — العلامة isLabor بتتجاب من قايمة المقاولين نفسها
function isLaborContractor(name){
  const n=normContractorName(name);
  return contractors.some(c=>c.isLabor && normContractorName(c.name)===n);
}
function sortContractorsForSheet(names){
  const pri = sheetFirstContractors().map(normContractorName);
  const rank = n => { const i = pri.indexOf(normContractorName(n)); return i === -1 ? pri.length : i; };
  // فرز ثابت: المقدَّمون بترتيب المصفوفة، والباقي بترتيبه الأصلي زي ما كان
  return names.map((n,i)=>({n,i})).sort((a,b)=> (rank(a.n)-rank(b.n)) || (a.i-b.i)).map(x=>x.n);
}

async function buildApprovedWorkbook(exp, weekBounds, pq){
  try{
    // استبعاد السجلات اللي المهندس علّم عليها "مش هيتسجل في الإكسيل المعتمد" (r.done)
    exp = exp.filter(r=>!r.done);
    if(!exp.length){ showToast('⚠ كل السجلات مستبعَدة من الإكسيل المعتمد',true); return null; }
    const expSiteIds=[...new Set(exp.map(r=>placeProjectId(r.place)))];
    if(expSiteIds.length>1){ showToast('⚠ الكشف فيه أماكن من مشروعين مختلفين — اعمل كشف لكل مشروع لوحده', true); return null; }
    const workbook = new ExcelJS.Workbook();

    // توقيع واحد مشترك لكل الشيتات (أصغر في الحجم) — الملف بيطلع XML سليم كده.
    let sigImgId = null;
    if(engineerSignature){
      const match = engineerSignature.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
      if(match){
        const ext = match[1]==='jpg' ? 'jpeg' : match[1];
        sigImgId = workbook.addImage({base64: match[2], extension: ext});
      }
    }

    const contractorNames = sortContractorsForSheet([...new Set(exp.map(r=>r.contractor))]);
    let sheetsCount = 0;
    if(exportPlaceChips.length){
      // نسخة منفصلة لكل مقاول × كل مكان محدد
      contractorNames.forEach(name=>{
        exportPlaceChips.forEach(place=>{
          const recs = exp.filter(r=>r.contractor===name && r.place===place);
          if(recs.length){ buildApprovedSheet(workbook, name, recs, weekBounds, sigImgId, place); sheetsCount++; }
        });
      });
    } else {
      contractorNames.forEach(name=>{
        const recs = exp.filter(r=>r.contractor===name);
        buildApprovedSheet(workbook, name, recs, weekBounds, sigImgId);
        sheetsCount++;
      });
    }

    if(!sheetsCount){showToast('⚠ لا يوجد بيانات تطابق المقاولين والأماكن المحددة',true);return null;}

    const buffer = await workbook.xlsx.writeBuffer();
    const wkStart = toYMD(weekBounds.start), wkEnd = toYMD(weekBounds.end);
    const placesLabel = exportPlaceChips.length
      ? (exportPlaceChips.length===1 ? exportPlaceChips[0] : `${exportPlaceChips.length}_أماكن`)
      : (pq||'');
    const label = contractorNames.length===1
      ? `${contractorNames[0]}${placesLabel?'_'+placesLabel:''}`
      : `${contractorNames.length}_مقاولين${placesLabel?'_'+placesLabel:''}`;
    const fileName = `سركي_عمالة_${subFileEngName()}${label?'_'+label:''}_${wkStart}_${wkEnd}.xlsx`;
    const total = exp.reduce((a,r)=>a+(Number(r.total)||0),0);
    return {buffer, fileName, sheetsCount, contractorNames, wkStart, wkEnd, total, recordsCount: exp.length, placesLabel, buildLabel: label, workbook, projectId: expSiteIds[0]||DEFAULT_PROJECT_ID};

  }catch(e){ showToast('⚠ خطأ في بناء الكشف: '+e.message,true); return null; }
}

// قسم "مقاولين/أماكن للتصدير المعتمد" (الذهبي) خاصية قابلة للتعطيل لكل حساب (records_export_chips).
// لو مقفول عند المستخدم، مش هيشوفه أصلًا — فبناخد اختياره من فلتر المقاول/المكان العلوي (select دقيق) بداله،
// عشان زرار التصدير/الإرسال ما يطلبش منه حاجة مش ظاهرة له.
function syncExportChipsFromTopFilter(){
  if(featureEnabled('records_export_chips')) return;
  const {pq,cq}=getRecordFilters();
  exportContractorChips = cq ? [cq] : [];
  exportPlaceChips = pq ? [pq] : [];
}
function exportSelectionHint(){
  return featureEnabled('records_export_chips')
    ? '⚠ إختار مقاول ومكان من قائمة الفلاتر الذهبي أعلى الصفحة'
    : '⚠ إختار مقاول ومكان من فلتر "👷 كل المقاولين" و"📍 كل الأماكن" أعلى الصفحة الأول';
}

// ورقة الكشف المعتمد أسبوع واحد بالظبط (7 صفوف من بداية الأسبوع) — فالسجلات لازم تتقصّ على نفس الأسبوع.
// من غير كده (مع "كل السجلات" مفتوحة مثلًا): السطور برّه الأسبوع بتقع من الملف في صمت، بينما الإجمالي
// وعدد السجلات اللي بيتبعتوا مع الكشف بيفضلوا شاملينها → كشف رسمي بإجمالي مش مطابق لسطوره.
function clampExportToWeek(exp, weekBounds){
  const s=toYMD(weekBounds.start), en=toYMD(weekBounds.end);
  const inWeek=exp.filter(r=>r.date>=s && r.date<=en);
  return {inWeek, dropped: exp.length-inWeek.length, s, en};
}
// الحساب كله (مرساة الأسبوع + القصّ) لازم يتم على اللي هيتصدّر فعلًا — يعني من غير السجلات المعلّم
// عليها 🚫 (بيتشالوا جوّه buildApprovedWorkbook). من غير كده: سجل مستبعَد قديم بيخطف مرساة الأسبوع
// فالقصّ يرمي كل السجلات الحقيقية، والعدّاد بيحذّر من سجلات المهندس مستبعدها بإيده أصلًا.
function exportableRecords(exp){ return exp.filter(r=>!r.done); }

async function exportApprovedExcel(){
  const {nq,pq,dq,cq}=getRecordFilters();
  syncExportChipsFromTopFilter();

  // التحقق: لازم يتحدد مقاول أو مكان من قوائم التصدير المعتمد المخصصة
  if(!exportContractorChips.length && !exportPlaceChips.length){
    showToast(exportSelectionHint(), true);
    return;
  }
  // لو المستخدم محدد فلتر من الفلاتر العلوية بدون تحديد المقاولين في التصدير المعتمد
  if((nq || pq || cq) && !exportContractorChips.length){
    showToast(exportSelectionHint(), true);
    return;
  }

  await ensureExcelJS();

  let exp=[...records];
  if(dq) exp=exp.filter(r=>r.date===dq);
  else if(!showAll){
    const {start,end}=getWeekBounds(weekOffset);
    const s=toYMD(start), en=toYMD(end);
    exp=exp.filter(r=>r.date>=s && r.date<=en);
  }
  // التصفية حصريًا بالمقاولين والأماكن المحددة للتصدير المعتمد
  if(exportContractorChips.length) exp=exp.filter(r=>exportContractorChips.includes(r.contractor));
  if(exportPlaceChips.length)      exp=exp.filter(r=>exportPlaceChips.includes(r.place));

  if(!exp.length){showToast('⚠ لا يوجد بيانات بالفلتر ده',true);return;}
  exp.sort((a,b)=>a.date.localeCompare(b.date));

  // أسبوع الجدول: لو فيه تاريخ محدد ناخد أسبوعه، غير كده الأسبوع المعروض،
  // أو لو "كل السجلات" مفعّلة ناخد أسبوع أقدم سجل **هيتصدّر فعلًا** في النتائج
  exp = exportableRecords(exp);
  if(!exp.length){showToast('⚠ كل السجلات دي معلّم عليها 🚫 (مستبعَدة من الإكسيل المعتمد)',true);return;}
  let weekBounds;
  if(dq) weekBounds = getWeekBoundsForDate(dq);
  else if(!showAll) weekBounds = getWeekBounds(weekOffset);
  else weekBounds = getWeekBoundsForDate(exp[0].date);

  const wk = clampExportToWeek(exp, weekBounds);
  // التحذير كان توست بيتمسح بعد جزء من الثانية بتوست "تم التنزيل" (عنصر توست واحد في الصفحة)،
  // يعني المهندس كان بينزّل كشف ناقص أيام وهو فاكره كامل. نفس أسلوب الإرسال: يوقف ويسأل.
  if(wk.dropped && !confirm('الكشف بياخد أسبوع واحد بس ('+wk.s+' → '+wk.en+').\n\nفيه '+wk.dropped+' سجل برّه الأسبوع ده مش هيتحطّوا في الملف — نزّلهم في كشف تاني لأسبوعهم.\n\nتنزّل بالأسبوع ده؟')) return;
  exp = wk.inWeek;

  const built = await buildApprovedWorkbook(exp, weekBounds, pq);
  if(!built) return;
  const {buffer, fileName, sheetsCount} = built;
  try{
    if(window.isCapacitor){
      const uint8 = new Uint8Array(buffer);
      const b64out = bytesToBase64(uint8);
      window.Capacitor.Plugins.Filesystem.writeFile({
        path: fileName, data: b64out, directory: 'CACHE', recursive: true
      }).then(()=>window.Capacitor.Plugins.Filesystem.getUri({path:fileName,directory:'CACHE'}))
        .then(u=>window.Capacitor.Plugins.Share.share({title:fileName,url:u.uri}))
        .then(()=>showToast(`📄 تم تنزيل النسخة المعتمدة! (${sheetsCount} شيت)`))
        .catch(e=>showToast('⚠ خطأ في الحفظ: '+e.message,true));
    } else {
      const blob = new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
      showToast(`📄 تم تنزيل النسخة المعتمدة! (${sheetsCount} شيت)`);
    }
  }catch(e){
    showToast('⚠ خطأ: '+e.message,true);
  }
}



// ── عرض ورقة Excel كجدول HTML (معاينة الكشف قبل الإرسال — بدون تنزيل) ──
function argbToCss(argb){ if(!argb) return null; const h=String(argb); return '#'+(h.length===8?h.slice(2):h); }
function renderSheetHtml(ws, workbook){
  const rowCount=ws.rowCount, colCount=Math.max(ws.columnCount, 13);
  // خريطة الدمج: master → {rowspan,colspan}, covered → skip
  const master={}, covered=new Set();
  const merges = ws.model && ws.model.merges ? ws.model.merges : [];
  merges.forEach(ref=>{
    const m=ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/); if(!m) return;
    const c1=colLetterToNum(m[1]), r1=+m[2], c2=colLetterToNum(m[3]), r2=+m[4];
    master[r1+':'+c1]={rs:r2-r1+1, cs:c2-c1+1};
    for(let r=r1;r<=r2;r++) for(let c=c1;c<=c2;c++){ if(r!==r1||c!==c1) covered.add(r+':'+c); }
  });
  // صور التوقيع: الصف/العمود اللي فيه صورة. صورة مرساتها جوّه خلية مدموجة (توقيعات المديرين في الصف 16
  // بتتوسّط جوّه البلوك فمرساتها مش أول خلية فيه) بتتنسب للخلية الرئيسية للدمج — وإلا ما كانتش بتترسم
  const imgRows=new Map();
  const mergeMaster={}; Object.keys(master).forEach(k=>{ const [r1,c1]=k.split(':').map(Number); const m=master[k]; for(let r=r1;r<r1+m.rs;r++) for(let c=c1;c<c1+m.cs;c++) mergeMaster[r+':'+c]=k; });
  try{
    (ws.getImages ? ws.getImages() : []).forEach(im=>{
      const r=Math.floor(im.range.tl.nativeRow)+1, c=Math.floor(im.range.tl.nativeCol)+1;
      const key=mergeMaster[r+':'+c]||(r+':'+c);
      const media=workbook.getImage ? workbook.getImage(im.imageId) : null;
      if(media && media.base64) imgRows.set(key, 'data:image/'+(media.extension||'png')+';base64,'+media.base64);
      else if(media && media.buffer){ imgRows.set(key, 'data:image/'+(media.extension||'png')+';base64,'+bytesToBase64(new Uint8Array(media.buffer))); }
    });
  }catch(e){}
  const widths=[]; for(let c=1;c<=colCount;c++){ const col=ws.getColumn(c); widths.push(Math.round((col.width||9)*7.2)); }
  // ترتيب الأعمدة يسار→يمين (العمود A على الشمال): الكشف مبني بحيث "اليوم" في آخر عمود (M) والتوقيع في أول عمود (A)،
  // وعناوين البيانات (إسم العامل/المهنة) على يمين قيمها — فبالترتيب ده الصفحة بتتقرأ عربي طبيعي من اليمين للشمال،
  // وده نفس شكل الشيت/الـ PDF النهائي في جوجل (السكربت بيلغي علم RTL بتاع الملف لنفس السبب — FORCE_CONVERTED_SHEET_RTL=false).
  // النص جوه كل خلية بيفضل عربي (unicode-bidi تلقائي) — بس الأعمدة نفسها ما تتعكسش.
  let html='<table class="xl-preview" dir="ltr"><colgroup>'+widths.map(w=>'<col style="width:'+w+'px">').join('')+'</colgroup>';
  for(let r=1;r<=rowCount;r++){
    const row=ws.getRow(r); const h=row.height?Math.round(row.height*1.33):22;
    html+='<tr style="height:'+h+'px">';
    for(let c=1;c<=colCount;c++){
      if(covered.has(r+':'+c)) continue;
      const cell=row.getCell(c); const m=master[r+':'+c]||{rs:1,cs:1};
      const st=[]; const f=cell.fill, fo=cell.font, al=cell.alignment, bd=cell.border;
      if(f && f.type==='pattern' && f.fgColor && f.fgColor.argb){ const bg=argbToCss(f.fgColor.argb); if(bg && bg.toLowerCase()!=='#ffffff' && bg.toLowerCase()!=='#000000') st.push('background:'+bg); else if(bg && bg.toLowerCase()==='#ffffff') st.push('background:#fff'); }
      if(fo){ if(fo.bold) st.push('font-weight:700'); if(fo.size) st.push('font-size:'+Math.round(fo.size*1.15)+'px'); if(fo.color&&fo.color.argb) st.push('color:'+argbToCss(fo.color.argb)); }
      if(al){ if(al.horizontal) st.push('text-align:'+al.horizontal); if(al.vertical) st.push('vertical-align:'+al.vertical); if(al.wrapText) st.push('white-space:pre-wrap'); }
      const hasBorder = bd && (bd.top||bd.left||bd.right||bd.bottom);
      if(hasBorder) st.push('border:1px solid #999');
      let v=cell.value;
      if(v && typeof v==='object'){ if(v.richText) v=v.richText.map(t=>t.text).join(''); else if(v.result!==undefined) v=v.result; else if(v.text) v=v.text; else v=String(v); }
      let content = (v===null||v===undefined) ? '' : esc(String(v)).replace(/\n/g,'<br>');
      // توقيع المهندس في صف البيانات صغير؛ توقيعات المديرين في البلوكات المدموجة أكبر (بنسبة الصورة، جوّه الخلية)
      const img=imgRows.get(r+':'+c); if(img) content='<img src="'+img+'" alt="توقيع" style="'+(m.cs>1?'max-height:36px;max-width:60%;':'height:22px;max-width:70px;')+'object-fit:contain;vertical-align:middle">'+content;
      html+='<td'+(m.rs>1?' rowspan="'+m.rs+'"':'')+(m.cs>1?' colspan="'+m.cs+'"':'')+' style="'+st.join(';')+'">'+content+'</td>';
    }
    html+='</tr>';
  }
  return html+'</table>';
}
function colLetterToNum(l){ let n=0; for(const ch of l) n=n*26+(ch.charCodeAt(0)-64); return n; }

// ── إرسال الكشف للاعتماد (بديل: تنزيل + Google Form) ──
// نفس الفلاتر والتحقق بتوع التنزيل المعتمد، لكن بدل ما ينزّل على الموبايل: مراجعة جوه التطبيق → موافقة → رفع للسيرفر
let _pendingSubmission=null;
// إعادة إرسال كشف مرفوض: يوجّه المهندس يعدّل السركي ويعيد الإرسال كنسخة جديدة على نفس الكشف
let _resendTargetId=null;
function resendSubmission(id, kind){
  _resendTargetId=id;
  if(kind==='equipment'){ switchTab('equipment'); showToast('✍️ عدّل أيام التشغيل واضغط "مراجعة وإرسال الكشف الشهري" — هيتبعت كنسخة جديدة (rev++)', false); return; }
  switchTab('records');
  showToast('✍️ عدّل السركي، اختار المقاول في الفلتر الذهبي، واضغط "مراجعة وإرسال الكشف" — هيتبعت كنسخة جديدة (rev++)', false);
}
async function submitApprovedForReview(){
  const {nq,pq,dq,cq}=getRecordFilters();
  syncExportChipsFromTopFilter();
  // الكشف لازم يتبعت بمقاول ومكان محددين الاتنين — مفيش كشف بمقاول لوحده من غير مكان (ولا العكس)
  if(!exportContractorChips.length || !exportPlaceChips.length){ showToast('⚠ لازم تختار مقاول ومكان من القايمة الدهبي — الكشف مايتبعتش بمقاول لوحده', true); return; }
  // مقاولين العمالة (👷) لازم يتبعتوا في كشف لوحدهم — لو اتخلطوا مع باقي المقاولين في نفس الكشف نوقف الإرسال
  { const laborSel = exportContractorChips.filter(isLaborContractor);
    const restSel  = exportContractorChips.filter(n=>!isLaborContractor(n));
    if(laborSel.length && restSel.length){
      showToast('⚠ مقاولين العمالة ('+laborSel.join('، ')+') لازم يتبعتوا في كشف لوحدهم — شيل باقي المقاولين أو ابعتهم في كشف تاني', true);
      return;
    }
  }
  await ensureExcelJS();
  let exp=[...records];
  if(dq) exp=exp.filter(r=>r.date===dq);
  else if(!showAll){ const {start,end}=getWeekBounds(weekOffset); const s=toYMD(start), en=toYMD(end); exp=exp.filter(r=>r.date>=s && r.date<=en); }
  if(exportContractorChips.length) exp=exp.filter(r=>exportContractorChips.includes(r.contractor));
  if(exportPlaceChips.length)      exp=exp.filter(r=>exportPlaceChips.includes(r.place));
  if(!exp.length){showToast('⚠ لا يوجد بيانات بالفلتر ده',true);return;}
  exp.sort((a,b)=>a.date.localeCompare(b.date));
  exp = exportableRecords(exp); // المرساة والقصّ على اللي هيتصدّر فعلًا (بدون المعلّم عليها 🚫)
  if(!exp.length){showToast('⚠ كل السجلات دي معلّم عليها 🚫 (مستبعَدة من الإكسيل المعتمد)',true);return;}
  let weekBounds;
  if(dq) weekBounds = getWeekBoundsForDate(dq);
  else if(!showAll) weekBounds = getWeekBounds(weekOffset);
  else weekBounds = getWeekBoundsForDate(exp[0].date);
  // كشف رسمي بيمشي على 3 مديرين — السطر اللي برّه أسبوع الورقة ما ينفعش يقع في صمت،
  // ولا ينفع يتحسب في الإجمالي/العدد اللي بيتبعتوا مع الكشف. لازم المهندس يعرف ويوافق.
  const wk = clampExportToWeek(exp, weekBounds);
  if(wk.dropped && !confirm('الكشف بياخد أسبوع واحد بس ('+wk.s+' → '+wk.en+').\n\nفيه '+wk.dropped+' سجل برّه الأسبوع ده — مش هيتبعتوا ولا هيتحسبوا في الإجمالي. ابعتهم في كشف تاني لأسبوعهم.\n\nتكمل الإرسال بالأسبوع ده؟')) return;
  exp = wk.inWeek;
  const built = await buildApprovedWorkbook(exp, weekBounds, pq);
  if(!built) return;
  const expSent = exp; // اتقصّت على الأسبوع وبدون المستبعَد — المعاينة والعدّ زي الملف بالظبط
  _pendingSubmission = {built, exp:expSent};
  openSubmitReview(built, expSent);
}
function openSubmitReview(b, exp){
  let ov=document.getElementById('submit-review-overlay');
  if(!ov){ ov=document.createElement('div'); ov.id='submit-review-overlay'; ov.className='modal-overlay'; document.body.appendChild(ov); }
  const byDay={}; exp.forEach(r=>{ (byDay[r.date]=byDay[r.date]||[]).push(r); });
  const days=Object.keys(byDay).sort();
  const title=localStorage.getItem('cea_user_title')||'';
  const ctrLabel = b.contractorNames.length===1 ? b.contractorNames[0] : b.contractorNames.length+' مقاولين ('+b.contractorNames.join('، ')+')';
  ov.innerHTML = `
    <div class="modal-box wide" role="dialog" aria-modal="true">
      <div class="modal-head">📤 مراجعة الكشف قبل الإرسال</div>
      <div class="modal-body">
        <div class="hint-box" style="margin-bottom:10px">
          <div><strong>المهندس:</strong> ${esc(localStorage.getItem('cea_user_name')||getCurrentUserEmail()||'')}${title?' — '+esc(title):''}</div>
          <div><strong>المقاول:</strong> ${esc(ctrLabel)}</div>
          ${b.placesLabel?'<div><strong>المكان:</strong> '+esc(b.placesLabel)+'</div>':''}
          ${b.projectId?'<div><strong>المشروع:</strong> '+esc(siteName(b.projectId))+'</div>':''}
          <div><strong>الأسبوع:</strong> من ${esc(b.wkStart)} إلى ${esc(b.wkEnd)}</div>
          <div><strong>عدد السجلات:</strong> ${b.recordsCount} · <strong>الإجمالي:</strong> ${fmt(b.total)} ج.م</div>
          <div><strong>الملف:</strong> <span style="direction:ltr;unicode-bidi:embed">${esc(b.fileName)}</span> (${b.sheetsCount} شيت)</div>
        </div>
        <div class="subhead" style="margin-top:0;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <span>📄 الكشف كما هيتبعت (${b.sheetsCount} شيت)</span>
          <span class="xl-tools">
            <button type="button" class="xl-tool" onclick="sheetZoom(-0.15)" aria-label="تصغير">➖</button>
            <button type="button" class="xl-tool" id="xl-zoom-label" onclick="sheetZoomReset()">100%</button>
            <button type="button" class="xl-tool" onclick="sheetZoom(0.15)" aria-label="تكبير">➕</button>
            <button type="button" class="xl-tool" onclick="toggleSheetFull()" aria-label="ملء الشاشة">⛶</button>
          </span>
        </div>
        <div class="xl-wrap"><div id="xl-zoom">${b.workbook.worksheets.map((ws,i)=>'<div class="xl-sheet-title">'+esc(ws.name)+'</div>'+renderSheetHtml(ws, b.workbook)).join('')}</div></div>
        <details class="mt8"><summary class="hint" style="cursor:pointer">تفاصيل الأيام (ملخص)</summary>
        <div class="list-scroll" style="max-height:220px">
          ${days.map(d=>{ const rs=byDay[d]; const t=rs.reduce((a,r)=>a+(Number(r.total)||0),0);
            return '<div class="home-row"><div style="min-width:0"><div class="n">'+esc(d)+' — '+esc(dayNameOf(d))+'</div><div class="s">'+rs.map(r=>esc(r.contractor)+' · '+esc(String(r.qty))+' '+esc(r.qtyType||'يومية')+' @ '+fmt(r.price)+(r.discount?' − خصم '+fmt(r.discount):'')).join('<br>')+'</div></div><div class="v">'+fmt(t)+' ج.م</div></div>'; }).join('')}
        </div></details>
        <div class="subhead">ملاحظة للمعتمد (اختياري)</div>
        <input type="text" id="submit-note" placeholder="مثال: شامل الخصم المتفق عليه" maxlength="500">
        <p class="hint" style="margin-top:8px">بالضغط على "موافق — إرسال" بتأكد إن البيانات دي صحيحة وهتتبعت للاعتماد. مفيش ملف هيتنزل على جهازك.</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-inline" onclick="closeSubmitReview()">تعديل / إلغاء</button>
        <button class="btn btn-gold btn-inline" id="submit-confirm-btn" onclick="confirmSubmitApproved()">✅ موافق — إرسال للاعتماد</button>
      </div>
    </div>`;
  ov.style.display='flex';
  document.body.classList.add('modal-open');
  _sheetZoom=1; sheetZoom(0);
}
// ── زوم معاينة الشيت (أزرار — لأن pinch الموبايل مقفول بإعداد viewport بتاع التطبيق) ──
let _sheetZoom=1;
function sheetZoom(delta){
  _sheetZoom=Math.min(2, Math.max(0.4, Math.round((_sheetZoom+delta)*100)/100));
  const el=document.getElementById('xl-zoom'); if(el) el.style.zoom=_sheetZoom;
  const lbl=document.getElementById('xl-zoom-label'); if(lbl) lbl.textContent=Math.round(_sheetZoom*100)+'%';
}
function sheetZoomReset(){ _sheetZoom=1; sheetZoom(0); }
function toggleSheetFull(){
  const box=document.querySelector('#submit-review-overlay .modal-box');
  if(box) box.classList.toggle('fullscreen');
}
function closeSubmitReview(){ const ov=document.getElementById('submit-review-overlay'); if(ov){ ov.style.display='none'; const box=ov.querySelector('.modal-box'); if(box) box.classList.remove('fullscreen'); } document.body.classList.remove('modal-open'); _pendingSubmission=null; }
async function confirmSubmitApproved(){
  if(!_pendingSubmission) return;
  if(!navigator.onLine){ showToast('⚠ الإرسال محتاج نت — نزّل النسخة المعتمدة دلوقتي وابعتها لما النت يرجع', true); return; }
  const btn=document.getElementById('submit-confirm-btn'); if(btn){ btn.disabled=true; btn.textContent='⏳ جاري الإرسال...'; }
  const {built:b, exp} = _pendingSubmission;
  try{
    const fd=new FormData();
    fd.append('file', new Blob([b.buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), b.fileName);
    // الأسماء المتجمّعة محدودة بـ 1000 حرف في السيرفر (كشف بـ 11 مقاولًا فشل يوم 8 سبتمبر لما الحد كان 190) — نقص هنا كمان احتياطًا
    fd.append('contractorName', (b.contractorNames.length===1 ? b.contractorNames[0] : b.contractorNames.join('، ')).slice(0,1000));
    fd.append('placeName', (b.placesLabel||'').slice(0,1000));
    fd.append('weekStart', b.wkStart); fd.append('weekEnd', b.wkEnd);
    fd.append('total', String(b.total)); fd.append('recordsCount', String(b.recordsCount));
    fd.append('engineerNote', (document.getElementById('submit-note')?.value||'').trim());
    if(b.kind) fd.append('kind', b.kind); // equipment = كشف معدات (placeName = المعدة، total = الساعات)
    if(b.projectId) fd.append('projectId', String(b.projectId)); // مشروع أماكن الكشف — بيحدد معتمدي المشروع لو محمّل على المهندس
    // لو ده إعادة إرسال لكشف مرفوض → يروح على /resend بنسخة جديدة بدل ما يعمل كشف جديد
    const url = _resendTargetId ? (API_URL+'/api/submissions/'+_resendTargetId+'/resend') : (API_URL+'/api/submissions');
    const res=await fetch(url,{method:'POST',headers:{'Authorization':'Bearer '+getAccessToken()},body:fd});
    const j=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.message||('HTTP '+res.status));
    const wasResend=!!_resendTargetId; _resendTargetId=null;
    closeSubmitReview();
    showToast(wasResend?'✅ اتبعت النسخة الجديدة للمراجعة من أول المستوى':'✅ تم إرسال الكشف للاعتماد — تابع حالته من "تسليماتي"');
    // بادج "متطابق" أداة مراجعة قبل الإرسال بس — بمجرد ما الكشف يوصل المعتمد بطل لزومها
    const sentIds=new Set((exp||[]).map(x=>String(x.id)));
    records.forEach(r=>{ if(sentIds.has(String(r.id))) r.submittedAt=Date.now(); });
    saveAll(); renderRecords();
    if(typeof renderMySubmissions==='function') renderMySubmissions();
  }catch(e){
    showToast('⚠ فشل الإرسال: '+e.message, true);
    if(btn){ btn.disabled=false; btn.textContent='✅ موافق — إرسال للاعتماد'; }
  }
}


/* ═══════════ سركي المعدات (وحدة equipment) — إيجار معدات شهري ═══════════
   الشهر من يوم 20 ليوم 19 اللي بعده. سطر لكل يوم تشغيل (ممكن أكتر من سطر في نفس اليوم).
   مفيش فلوس — كشف تشغيل (ساعات). الكشف الشهري: ملف Excel واحد، ورقة لكل 5 أيام تقويمية
   بنفس هوية الكشف الأسبوعي وبنفس أماكن بلوكات التوقيع (الصف 16/17) عشان يعدّي على اعتمادات المديرين وختم التوقيعات. */
let eqMonthOffset = 0;
let eqShowAll = false; // "كل الشهور": القائمة بتعرض كل السجلات — الكشف بيفضل على الشهر المعروض في المتصفح
// بالخصم على (شيبس) — نفس فكرة السركي الأسبوعي
let eqDeductChips=[];
function eqRenderDeductChips(){
  const wrap=document.getElementById('eq-deduct-chips'); if(!wrap) return;
  wrap.innerHTML=eqDeductChips.map(n=>'<span class="chip">'+esc(n)+' <button type="button" onclick="eqRemoveDeductChip('+jsArg(n)+')" title="إزالة">✕</button></span>').join('');
  const nw=document.getElementById('eq-deduct-note-wrap'); if(nw) nw.style.display = eqDeductChips.length ? '' : 'none';
}
function eqAddDeductChip(){ const sel=document.getElementById('eq-deduct-on-select'); if(!sel||!sel.value) return; if(!eqDeductChips.includes(sel.value)) eqDeductChips.push(sel.value); sel.value=''; eqRenderDeductChips(); }
function eqRemoveDeductChip(n){ eqDeductChips=eqDeductChips.filter(x=>x!==n); eqRenderDeductChips(); }
function eqSetDeductChips(arr){ eqDeductChips=Array.isArray(arr)?[...arr]:[]; eqRenderDeductChips(); }
function syncEqShowAllUI(){
  const btn=document.getElementById('eq-show-all-btn'), nav=document.getElementById('eq-month-nav');
  if(btn){ btn.classList.toggle('on', eqShowAll); btn.textContent = eqShowAll ? '✅ كل الشهور' : '📋 كل الشهور'; }
  if(nav) nav.classList.toggle('all-mode', eqShowAll);
}
function toggleEqShowAll(){ eqShowAll=!eqShowAll; syncEqShowAllUI(); renderEquipment(); }
const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
// حدود "شهر المعدات": من 20 الشهر لـ 19 اللي بعده. اليوم < 20 → إحنا لسه في شهر بدأ الشهر اللي فات
function getEqMonthBounds(offset){
  const today=new Date(); today.setHours(0,0,0,0);
  let y=today.getFullYear(), m=today.getMonth();
  if(today.getDate()<20) m-=1;
  const start=new Date(y, m+offset, 20), end=new Date(y, m+offset+1, 19);
  return {start, end};
}
function getEqMonthBoundsForDate(ymd){
  const [y,m,d]=String(ymd).split('-').map(Number);
  const mm = d>=20 ? m-1 : m-2;
  return {start:new Date(y, mm, 20), end:new Date(y, mm+1, 19)};
}
function eqMonthLabel(b){
  const s=b.start, e=b.end;
  return `20 ${AR_MONTHS[s.getMonth()]}${s.getFullYear()!==e.getFullYear()?' '+s.getFullYear():''}  ←  19 ${AR_MONTHS[e.getMonth()]} ${e.getFullYear()}`;
}
// ── إعدادات السركي الشهري (محلية على الجهاز — بيانات عرض/تسهيل، مش بيانات سجلات) ──
// المقاول الثابت (cea_eq_contractor): بيتملى ويتقفل في الفورم مع معدته (تخصصه) — مش كل يوم يختار نفس المقاول.
// الموقع في راس الكشف (cea_eq_site): من أسماء الموقعين في app_config + مواقع مضافة على الجهاز (cea_eq_sites)؛ الافتراضي موقع الحساب.
function eqFixedContractor(){ const v=localStorage.getItem('cea_eq_contractor')||''; return contractors.some(c=>c.name===v) ? v : ''; }
function eqApplyFixedContractor(){
  const sel=document.getElementById('eq-contractor'), lock=document.getElementById('eq-contractor-lock'), search=document.getElementById('eq-contractor-search');
  if(!sel) return;
  const fixed=eqFixedContractor();
  if(fixed){ sel.value=fixed; eqFillEquipment(); }
  sel.disabled=!!fixed;
  if(lock) lock.style.display = fixed ? '' : 'none';
  if(search) search.style.display = fixed ? 'none' : '';
}
function eqSaveFixedContractor(){
  const v=document.getElementById('eq-fixed-contractor').value;
  if(v) localStorage.setItem('cea_eq_contractor', v); else localStorage.removeItem('cea_eq_contractor');
  eqApplyFixedContractor();
  showToast(v ? '✅ المقاول الثابت: '+v+' — اتملى واتقفل في الفورم' : '✅ اتشال المقاول الثابت — هتختاره مع كل يوم');
}
function eqCustomSites(){ try{ return JSON.parse(localStorage.getItem('cea_eq_sites')||'[]').filter(Boolean); }catch(e){ return []; } }
function eqSiteOptions(){ return [...new Set([siteName(1), siteName(2), ...eqCustomSites()].filter(Boolean))]; }
function eqCurrentSite(){
  const saved=localStorage.getItem('cea_eq_site')||'';
  if(saved && eqSiteOptions().includes(saved)) return saved;
  return siteName(localStorage.getItem('cea_user_site')||1);
}
let _eqSiteNamesLoaded=false;
async function eqLoadSiteNames(){
  if(_eqSiteNamesLoaded || !navigator.onLine || !getAccessToken()) return;
  try{ const r=await api('GET','/api/config'); _siteNames={ '1':r.data.site1Name||_siteNames['1'], '2':r.data.site2Name||_siteNames['2'] }; _eqSiteNamesLoaded=true; renderEqSettings(); }catch(e){}
}
function renderEqSettings(){
  const fc=document.getElementById('eq-fixed-contractor');
  if(fc){ const cur=eqFixedContractor(); fc.innerHTML='<option value="">— بدون (اختار كل مرة) —</option>'+contractors.map(c=>'<option value="'+esc(c.name)+'"'+(c.name===cur?' selected':'')+'>'+esc(c.name)+(c.spec&&c.spec!=='—'?' — '+esc(c.spec):'')+'</option>').join(''); }
  eqApplyFixedContractor();
  const sel=document.getElementById('eq-site'); if(!sel) return;
  const cur=eqCurrentSite(), custom=eqCustomSites();
  sel.innerHTML=eqSiteOptions().map(n=>'<option value="'+esc(n)+'"'+(n===cur?' selected':'')+'>'+esc(n)+'</option>').join('');
  const chips=document.getElementById('eq-site-chips');
  if(chips) chips.innerHTML=custom.map(n=>'<span class="chip">'+esc(n)+' <button type="button" title="حذف" onclick="eqRemoveSite('+jsArg(n)+')">✕</button></span>').join('');
}
function eqSaveSite(){ const v=document.getElementById('eq-site').value; localStorage.setItem('cea_eq_site', v); showToast('✅ الموقع في راس الكشف: '+v); }
function eqAddSite(){
  const inp=document.getElementById('eq-site-new'); const v=(inp.value||'').trim(); if(!v){ showToast('⚠ اكتب اسم الموقع', true); return; }
  if(eqSiteOptions().includes(v)){ showToast('⚠ الموقع ده موجود', true); return; }
  localStorage.setItem('cea_eq_sites', JSON.stringify([...eqCustomSites(), v]));
  localStorage.setItem('cea_eq_site', v); inp.value='';
  renderEqSettings(); showToast('✅ اتضاف واتحدد: '+v);
}
function eqRemoveSite(n){
  localStorage.setItem('cea_eq_sites', JSON.stringify(eqCustomSites().filter(x=>x!==n)));
  if(localStorage.getItem('cea_eq_site')===n) localStorage.removeItem('cea_eq_site');
  renderEqSettings();
}
function fmtMinutes(m){ m=Math.max(0, Math.round(Number(m)||0)); return Math.floor(m/60)+':'+String(m%60).padStart(2,'0'); }
function eqMinutes(from, to){
  if(!/^\d{2}:\d{2}$/.test(from||'') || !/^\d{2}:\d{2}$/.test(to||'')) return 0;
  const [fh,fm]=from.split(':').map(Number), [th,tm]=to.split(':').map(Number);
  let d=th*60+tm-(fh*60+fm); if(d<0) d+=24*60; // عدّى نص الليل
  return d;
}
function eqCalcDuration(){
  const m=eqMinutes(document.getElementById('eq-from').value, document.getElementById('eq-to').value);
  const el=document.getElementById('eq-duration'); if(el) el.value = m ? fmtMinutes(m)+' ساعة' : '—';
}
// المعدة = تخصص المقاول في قائمة المقاولين (زي fillSpec في فورم السركي) — قراءة فقط
function eqFillEquipment(){
  const n=document.getElementById('eq-contractor').value;
  const c=contractors.find(x=>x.name===n);
  const spec=(c && c.spec && c.spec!=='—') ? c.spec : '';
  document.getElementById('eq-equipment').value=spec;
}
function eqSetDay(ymd){ const el=document.getElementById('eq-day'); if(el) el.value=dayNameOf(ymd)||''; }
function renderEqMonthNav(){
  const b=getEqMonthBounds(eqMonthOffset);
  const lbl=document.getElementById('eq-month-label'), rng=document.getElementById('eq-month-range');
  if(lbl) lbl.textContent = eqMonthOffset===0 ? '📅 الشهر الحالي' : eqMonthOffset===-1 ? '📅 الشهر الماضي' : eqMonthOffset<0 ? `📅 قبل ${Math.abs(eqMonthOffset)} شهور` : `📅 بعد ${eqMonthOffset} شهور`;
  if(rng) rng.textContent = eqMonthLabel(b);
}
function shiftEqMonth(dir){ eqShowAll=false; syncEqShowAllUI(); eqMonthOffset+=dir; renderEqMonthNav(); renderEquipment(); }
function resetEqMonth(){ eqShowAll=false; syncEqShowAllUI(); eqMonthOffset=0; renderEqMonthNav(); renderEquipment(); }

function saveEquipment(){
  const date=document.getElementById('eq-date').value, contractor=document.getElementById('eq-contractor').value.trim(),
        equipment=document.getElementById('eq-equipment').value.trim(), place=document.getElementById('eq-place').value.trim(),
        timeFrom=document.getElementById('eq-from').value, timeTo=document.getElementById('eq-to').value,
        works=document.getElementById('eq-works').value.trim(), notes=document.getElementById('eq-notes').value.trim(),
        deductOn=[...eqDeductChips], deductNote=eqDeductChips.length ? document.getElementById('eq-deduct-note').value.trim() : '';
  if(!date){showToast('⚠ اختر التاريخ',true);return;}
  if(!contractor){showToast('⚠ اختر المقاول / المورد',true);return;}
  if(!equipment){showToast('⚠ المقاول ده مالوش تخصص (نوع المعدة) — حدده من إدارة المقاولين في الإعدادات',true);return;}
  if(!place){showToast('⚠ اختر المكان',true);return;}
  if(!timeFrom||!timeTo){showToast('⚠ حدد الوقت من وإلى',true);return;}
  const day=dayNameOf(date), minutes=eqMinutes(timeFrom,timeTo);
  const data={date,day,contractor,equipment,place,timeFrom,timeTo,minutes,works,notes,deductOn,deductNote};
  const isNewEq = eqEditingId===null;
  if(!isNewEq){
    const idx=equipmentRecords.findIndex(r=>r.id===eqEditingId);
    if(idx!==-1) equipmentRecords[idx]={...equipmentRecords[idx],...data};
  } else {
    equipmentRecords.push({id:Date.now(), ...data});
  }
  // زي السركي بالظبط: الحفظ فشل → شيل السجل من الذاكرة عشان الدوسة الجاية ما تعملش نسخة تانية
  if(!saveAll()){ if(isNewEq) equipmentRecords.pop(); return; }
  showToast(isNewEq ? '✅ تم تسجيل يوم التشغيل' : '✅ تم حفظ التعديل');
  cancelEqEdit();
  // الشهر المعروض يتبع تاريخ اليوم اللي اتسجل — عشان المعاينة تتحدث فورًا
  const b=getEqMonthBoundsForDate(date), cur=getEqMonthBounds(0);
  eqMonthOffset = (b.start.getFullYear()-cur.start.getFullYear())*12 + (b.start.getMonth()-cur.start.getMonth());
  renderEqMonthNav(); renderEquipment();
}
function clearEqForm(keepHeader){
  if(!keepHeader){ document.getElementById('eq-contractor').value=''; document.getElementById('eq-equipment').value=''; }
  document.getElementById('eq-date').value=todayYMD(); eqSetDay(todayYMD());
  document.getElementById('eq-place').value=''; document.getElementById('eq-from').value=''; document.getElementById('eq-to').value='';
  document.getElementById('eq-works').value=''; document.getElementById('eq-notes').value=''; eqCalcDuration();
  eqSetDeductChips([]); document.getElementById('eq-deduct-note').value='';
  eqApplyFixedContractor();
}
function editEquipment(id){
  const r=equipmentRecords.find(x=>x.id===id); if(!r) return;
  eqEditingId=id;
  document.getElementById('eq-date').value=r.date; eqSetDay(r.date);
  document.getElementById('eq-contractor').value=r.contractor; document.getElementById('eq-equipment').value=r.equipment;
  document.getElementById('eq-place').value=r.place; document.getElementById('eq-from').value=r.timeFrom; document.getElementById('eq-to').value=r.timeTo;
  document.getElementById('eq-works').value=r.works||''; document.getElementById('eq-notes').value=r.notes||''; eqCalcDuration();
  eqSetDeductChips(r.deductOn||[]); document.getElementById('eq-deduct-note').value=r.deductNote||'';
  document.getElementById('eq-edit-banner').classList.add('show'); document.getElementById('eq-save-btn').textContent='💾 حفظ التعديل';
  window.scrollTo({top:0,behavior:'smooth'});
}
function cancelEqEdit(){
  eqEditingId=null; document.getElementById('eq-edit-banner').classList.remove('show'); document.getElementById('eq-save-btn').textContent='✅ تسجيل يوم التشغيل';
  clearEqForm(true);
}
function deleteEquipment(id){ if(!confirm('حذف يوم التشغيل ده؟')) return; equipmentRecords=equipmentRecords.filter(r=>r.id!==id); saveAll(); renderEquipment(); showToast('🗑 تم الحذف'); }
// تكرار آخر يوم اتسجل (نفس المعدة/المقاول/المكان/الوقت) بتاريخ النهاردة — الأيام بتتشابه كتير
function eqRepeatLast(){
  const last=[...equipmentRecords].sort((a,b)=>(b.date+String(b.id)).localeCompare(a.date+String(a.id)))[0];
  if(!last){ showToast('⚠ مفيش يوم سابق يتكرر', true); return; }
  eqEditingId=null; document.getElementById('eq-edit-banner').classList.remove('show'); document.getElementById('eq-save-btn').textContent='✅ تسجيل يوم التشغيل';
  document.getElementById('eq-contractor').value=last.contractor; eqFillEquipment(); if(!document.getElementById('eq-equipment').value) document.getElementById('eq-equipment').value=last.equipment;
  document.getElementById('eq-place').value=last.place; document.getElementById('eq-from').value=last.timeFrom; document.getElementById('eq-to').value=last.timeTo;
  document.getElementById('eq-works').value=last.works||''; document.getElementById('eq-notes').value='';
  eqSetDeductChips(last.deductOn||[]); document.getElementById('eq-deduct-note').value=last.deductNote||'';
  document.getElementById('eq-date').value=todayYMD(); eqSetDay(todayYMD()); eqCalcDuration();
  showToast('🔁 اتنسخ آخر يوم — راجع التاريخ والوقت واضغط تسجيل');
}
// السجلات في الشهر المعروض (وبالمعدة المختارة لو فيه فلتر)
// سجلات الشهر المعروض (للكشف دايمًا)، أو كل السجلات لو "كل الشهور" مفعّل (للقائمة بس)
function eqMonthRecords(forSheet){
  const {start,end}=getEqMonthBounds(eqMonthOffset); const s=toYMD(start), e=toYMD(end);
  const all = eqShowAll && !forSheet;
  return equipmentRecords.filter(r=> all || (r.date>=s && r.date<=e)).sort((a,b)=>a.date.localeCompare(b.date)||String(a.timeFrom).localeCompare(String(b.timeFrom)));
}
function eqSheetsCount(b){ const days=Math.round((b.end-b.start)/86400000)+1; return Math.ceil(days/5); }
function renderEquipment(){
  const list=document.getElementById('eq-list'); if(!list) return;
  renderEqMonthNav(); renderEqSettings(); eqLoadSiteNames();
  syncEqShowAllUI();
  const b=getEqMonthBounds(eqMonthOffset);
  const rows=eqMonthRecords();
  const days=new Set(rows.map(r=>r.date)).size, mins=rows.reduce((a,r)=>a+(Number(r.minutes)||0),0);
  const totalDays=Math.round((b.end-b.start)/86400000)+1;
  const eqCount=new Set(rows.map(r=>r.equipment)).size;
  const sum=document.getElementById('eq-summary');
  if(sum) sum.innerHTML = eqShowAll
    ? `<div><b>${days}</b><small>يوم تشغيل (كل الشهور)</small></div><div><b>${fmtMinutes(mins)}</b><small>إجمالي الساعات</small></div><div><b>${eqCount}</b><small>معدة</small></div>`
    : `<div><b>${days} / ${totalDays}</b><small>يوم تشغيل</small></div><div><b>${fmtMinutes(mins)}</b><small>إجمالي الساعات</small></div><div><b>${eqSheetsCount(b)*Math.max(1,eqCount)}</b><small>ورقات (5 أيام${eqCount>1?' × '+eqCount+' معدة':''})</small></div>`;
  const cnt=document.getElementById('eq-count'); if(cnt) cnt.textContent=rows.length+' سطر';
  if(!rows.length){ list.innerHTML=`<div class="empty-state"><div class="icon">🚜</div><p>${equipmentRecords.length?'مفيش تشغيل مسجّل في الشهر ده':'لسه مفيش أيام تشغيل — سجّل أول يوم من الفورم فوق'}</p></div>`; return; }
  list.innerHTML=[...rows].reverse().map(r=>`<div class="record-card eq-card">
      <div class="record-head">
        <div class="record-title"><div class="record-name" style="font-size:13px">${esc(r.day)} ${esc(r.date)} · ${esc(r.place)}</div><div class="record-spec">🚜 ${esc(r.equipment)} · 👷 ${esc(r.contractor)}</div></div>
        <div class="record-side"><span class="badge" style="background:var(--ok-bg);color:var(--ok-fg)">⏱ ${fmtMinutes(r.minutes)} س</span></div>
        <div class="record-actions">
          <button class="icon-btn edit" onclick="editEquipment(${r.id})" title="تعديل">✏️</button>
          <button class="icon-btn del"  onclick="deleteEquipment(${r.id})" title="حذف">✕</button>
        </div>
      </div>
      <div class="record-meta"><span class="badge">⏰ ${esc(r.timeFrom)} → ${esc(r.timeTo)}</span>${r.works?'<span class="badge">🧱 '+esc(r.works)+'</span>':''}</div>
      ${(r.deductOn&&r.deductOn.length)?`<div class="record-notes">💸 بالخصم على: ${esc(r.deductOn.join('، '))}${r.deductNote?' — '+esc(r.deductNote):''}</div>`:''}
      ${r.notes?`<div class="record-notes">📝 ${esc(r.notes)}</div>`:''}
    </div>`).join('');
}

// ── الكشف الشهري (Excel) — ورقة لكل 5 أيام تقويمية من 20 لـ 19 ──
// نفس شبكة الأعمدة الـ 13 بتاعة الكشف الأسبوعي عشان بلوكات التوقيع تقع في نفس الأعمدة (A..E / G..I / J..M)
// وفي الصف 16 وعناوينها في 17 — signStamp.ts في السيرفر بيختم عليها من غير أي تعديل.
function buildEquipmentSheet(workbook, exp, bounds, pageIdx, pagesTotal, dayStart, dayEnd, sigImgId, equipmentName, contractorName, monthMinutes, monthDays, siteLabel){
  const ws = workbook.addWorksheet((pageIdx+1)+'- '+String(equipmentName||'معدة').replace(/[\\\/\?\*\[\]:]/g,'').slice(0,26), {
    pageSetup:{paperSize:9, orientation:'landscape', fitToPage:true}, views:[{rightToLeft:true}] });
  ws.columns=[{width:14},{width:13},{width:8},{width:8},{width:8},{width:8},{width:9},{width:8},{width:8},{width:13},{width:8},{width:12},{width:10}];
  const thin={style:'thin', color:{argb:'FF999999'}}, allBorders={top:thin,left:thin,right:thin,bottom:thin};
  const centerWrap={vertical:'middle', horizontal:'center', wrapText:true, readingOrder:'rtl'};
  const navy='FF1F3864', gold='FFC9A84C';
  function styleRange(r1,c1,r2,c2,opts){ for(let r=r1;r<=r2;r++) for(let cc=c1;cc<=c2;cc++){ const cell=ws.getCell(r,cc); cell.border=allBorders; cell.alignment=centerWrap; if(opts&&opts.font) cell.font=opts.font; if(opts&&opts.fill) cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:opts.fill}}; } }
  const lbl={bold:true,size:10,name:'Arial',color:{argb:navy}};

  ws.mergeCells(1,1,1,13); ws.getCell(1,1).value='شركة هوم جيت للمقاولات ش م م';
  styleRange(1,1,1,13,{font:{bold:true,size:14,color:{argb:'FFFFFFFF'},name:'Arial'}, fill:navy}); ws.getRow(1).height=24;
  ws.mergeCells(2,1,2,13); ws.getCell(2,1).value=`${siteLabel||'كومبوند جريني افينيو'}  —  سركي / إيجار معدات (${equipmentName||''})`;
  styleRange(2,1,2,13,{font:{bold:true,size:11,color:{argb:navy},name:'Arial'}, fill:gold}); ws.getRow(2).height=20;

  ws.mergeCells(3,11,3,13); ws.getCell(3,13).value='إسم المقاول :‏';
  ws.mergeCells(3,8,3,10);  ws.getCell(3,10).value=contractorName||'';
  ws.mergeCells(3,5,3,7);   ws.getCell(3,7).value='المعدة :‏';
  ws.mergeCells(3,1,3,4);   ws.getCell(3,4).value=equipmentName||'';
  styleRange(3,1,3,13,{font:{size:10,name:'Arial'}}); [13,7].forEach(cc=>{ws.getCell(3,cc).font=lbl;});

  // الموقع من إعدادات السركي الشهري (مش قائمة أماكن الأعمال — الشهر فيه أماكن كتير، وكل يوم مكانه في الجدول)
  ws.mergeCells(4,11,4,13); ws.getCell(4,13).value='الموقع :‏';
  ws.mergeCells(4,8,4,10);  ws.getCell(4,10).value=siteLabel||'';
  ws.mergeCells(4,5,4,7);   ws.getCell(4,7).value='المشروع :‏';
  ws.mergeCells(4,1,4,4);   ws.getCell(4,1).value=siteLabel||'كومبوند جريني افينيو';
  styleRange(4,1,4,13,{font:{size:10,name:'Arial'}}); [13,7].forEach(cc=>{ws.getCell(4,cc).font=lbl;});

  ws.mergeCells(5,11,5,13); ws.getCell(5,13).value='الفترة من :‏';
  ws.mergeCells(5,9,5,10);  ws.getCell(5,10).value=toYMD(dayStart);
  ws.getCell(5,8).value='إلى :‏';
  ws.mergeCells(5,6,5,7);   ws.getCell(5,7).value=toYMD(dayEnd);
  ws.mergeCells(5,1,5,5);   ws.getCell(5,5).value=`ورقة ${pageIdx+1} من ${pagesTotal}  —  شهر ${toYMD(bounds.start)} ← ${toYMD(bounds.end)}`;
  styleRange(5,1,5,13,{font:{size:10,name:'Arial'}}); [13,8].forEach(cc=>{ws.getCell(5,cc).font=lbl;});
  [10,7].forEach(cc=>{ ws.getCell(5,cc).alignment={vertical:'middle',horizontal:'center',wrapText:false,readingOrder:'rtl'}; });
  ws.getRow(5).height=20;

  const headerRow=7;
  [[13,13,'التاريخ'],[12,12,'اليوم'],[10,11,'المكان'],[8,9,'الوقت (من – إلى)'],[7,7,'المدة'],[3,6,'بيان الأعمال'],[2,2,'بالخصم على'],[1,1,'ملاحظات']].forEach(([c1,c2,label])=>{
    if(c1!==c2) ws.mergeCells(headerRow,c1,headerRow,c2); ws.getCell(headerRow,c1).value=label; });
  styleRange(headerRow,1,headerRow,13,{font:{bold:true,size:10,color:{argb:'FFFFFFFF'},name:'Arial'}, fill:navy}); ws.getRow(headerRow).height=22;

  let pageMinutes=0;
  for(let i=0;i<5;i++){
    const row=headerRow+1+i;
    const d=new Date(dayStart); d.setDate(dayStart.getDate()+i);
    ws.mergeCells(row,10,row,11); ws.mergeCells(row,8,row,9); ws.mergeCells(row,3,row,6);
    if(d<=dayEnd){
      const ymd=toYMD(d), recs=exp.filter(r=>r.date===ymd);
      ws.getCell(row,13).value=ymd; ws.getCell(row,12).value=dayNameOf(ymd);
      if(recs.length){
        const RLM='\u200F';
        ws.getCell(row,10).value=[...new Set(recs.map(r=>r.place))].join('\n');
        ws.getCell(row,8).value=recs.map(r=>RLM+r.timeFrom+' – '+r.timeTo).join('\n');
        const m=recs.reduce((a,r)=>a+(Number(r.minutes)||0),0); pageMinutes+=m;
        ws.getCell(row,7).value=RLM+fmtMinutes(m);
        ws.getCell(row,3).value=recs.map(r=>r.works).filter(Boolean).join(' / ');
        const dOn=[...new Set(recs.flatMap(r=>Array.isArray(r.deductOn)?r.deductOn:[]))], dNotes=[...new Set(recs.map(r=>r.deductNote).filter(Boolean))].join(' / ');
        ws.getCell(row,2).value=[dOn.join(' ، '), dNotes].filter(Boolean).join('\n');
        ws.getCell(row,1).value=recs.map(r=>r.notes).filter(Boolean).join(' / ');
      }
    }
    styleRange(row,1,row,13,{font:{size:10,name:'Arial'}}); ws.getRow(row).height=30;
  }
  const totalRow=headerRow+6; // 13
  ws.mergeCells(totalRow,8,totalRow,13); ws.getCell(totalRow,13).value='إجمالي ساعات الورقة';
  ws.getCell(totalRow,7).value='\u200F'+fmtMinutes(pageMinutes);
  ws.mergeCells(totalRow,1,totalRow,6); ws.getCell(totalRow,6).value=`إجمالي الشهر: ${fmtMinutes(monthMinutes)} ساعة (${monthDays} يوم تشغيل)`;
  styleRange(totalRow,1,totalRow,13,{font:{bold:true,size:11,color:{argb:'FFFFFFFF'},name:'Arial'}, fill:navy}); ws.getRow(totalRow).height=22;
  ws.getRow(14).height=8; ws.getRow(15).height=8;

  // بلوكات التوقيع (الصف 16 + عناوين 17): J..M = المشرف المسئول (توقيع المهندس من التطبيق) · G..I = مهندس التنفيذ · A..E = مدير المشروع
  const sigRow=16, sigCapRow=17;
  ws.mergeCells(sigRow,10,sigRow,13); ws.mergeCells(sigRow,7,sigRow,9); ws.mergeCells(sigRow,1,sigRow,5);
  styleRange(sigRow,1,sigRow,13,{font:{size:10,name:'Arial'}}); ws.getRow(sigRow).height=55;
  ws.mergeCells(sigCapRow,10,sigCapRow,13); ws.getCell(sigCapRow,13).value='توقيع المشرف المسئول';
  ws.mergeCells(sigCapRow,7,sigCapRow,9);   ws.getCell(sigCapRow,7).value='توقيع مهندس التنفيذ';
  ws.mergeCells(sigCapRow,1,sigCapRow,5);   ws.getCell(sigCapRow,5).value='توقيع مدير المشروع';
  styleRange(sigCapRow,1,sigCapRow,13,{font:{bold:true,size:9,color:{argb:navy},name:'Arial'}});
  if(sigImgId!==null){
    // مرساة بنقطتين جوّه بلوك J..M (أعمدة 9..12 صفرية) — نفس درس الكشف الأسبوعي (المرساة بنقطة واحدة بتختفي في Excel الصارم)
    ws.addImage(sigImgId, { tl:{col:9.15, row:(sigRow-1)+0.08}, br:{col:12.85, row:(sigRow-1)+0.92}, editAs:'oneCell' });
  }
  return pageMinutes;
}
// ملف واحد للشهر: لكل معدة في الشهر مجموعة ورقات (ورقة لكل 5 أيام) ورا بعض — زي كشف المقاولين المتعددين الأسبوعي
async function buildEquipmentWorkbook(exp, bounds){
  try{
    const workbook=new ExcelJS.Workbook();
    let sigImgId=null;
    if(engineerSignature){ const m=engineerSignature.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/); if(m) sigImgId=workbook.addImage({base64:m[2], extension:m[1]==='jpg'?'jpeg':m[1]}); }
    const siteLabel=eqCurrentSite();
    const pages=eqSheetsCount(bounds);
    const equipmentNames=[...new Set(exp.map(r=>r.equipment).filter(Boolean))].sort();
    const contractorNames=[...new Set(exp.map(r=>r.contractor).filter(Boolean))];
    let sheetsCount=0;
    equipmentNames.forEach(eqName=>{
      const grp=exp.filter(r=>r.equipment===eqName);
      const contractorName=[...new Set(grp.map(r=>r.contractor).filter(Boolean))].join('، ');
      const monthMinutes=grp.reduce((a,r)=>a+(Number(r.minutes)||0),0), monthDays=new Set(grp.map(r=>r.date)).size;
      for(let p=0;p<pages;p++){
        const ds=new Date(bounds.start); ds.setDate(bounds.start.getDate()+p*5);
        const de=new Date(ds); de.setDate(ds.getDate()+4); if(de>bounds.end) de.setTime(bounds.end.getTime());
        buildEquipmentSheet(workbook, grp, bounds, p, pages, ds, de, sigImgId, eqName, contractorName, monthMinutes, monthDays, siteLabel);
        sheetsCount++;
      }
    });
    const buffer=await workbook.xlsx.writeBuffer();
    const wkStart=toYMD(bounds.start), wkEnd=toYMD(bounds.end);
    const monthMinutes=exp.reduce((a,r)=>a+(Number(r.minutes)||0),0), monthDays=new Set(exp.map(r=>r.date)).size;
    const label = equipmentNames.length===1 ? equipmentNames[0] : equipmentNames.length+' معدات';
    const safe=String(label||'معدة').replace(/[\\\/\?\*\[\]:]/g,'').trim();
    const fileName=`سركي_معدات_${subFileEngName()}_${safe}_${wkStart}_${wkEnd}.xlsx`;
    return { buffer, fileName, sheetsCount, contractorNames:[contractorNames.join('، ')], wkStart, wkEnd,
      total: Math.round(monthMinutes/60*100)/100, recordsCount: monthDays, placesLabel: equipmentNames.join('، '), buildLabel: safe, workbook, kind:'equipment', monthMinutes, monthDays, siteLabel, equipmentNames };
  }catch(e){ showToast('⚠ خطأ في بناء الكشف: '+e.message,true); return null; }
}
// الكشف = الشهر المعروض في المتصفح (حتى لو "كل الشهور" مفعّل للقائمة) — كل معدات الشهر في ملف واحد
async function prepareEquipmentSheet(){
  await ensureExcelJS();
  const bounds=getEqMonthBounds(eqMonthOffset);
  const rows=eqMonthRecords(true);
  if(!rows.length){ showToast('⚠ مفيش أيام تشغيل مسجّلة في الشهر ده ('+eqMonthLabel(bounds)+')', true); return null; }
  const built=await buildEquipmentWorkbook(rows, bounds);
  return built ? {built, rows} : null;
}
async function exportEquipmentExcel(){
  const p=await prepareEquipmentSheet(); if(!p) return;
  const blob=new Blob([p.built.buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=p.built.fileName; a.click(); URL.revokeObjectURL(url);
  showToast('📄 اتنزل الكشف الشهري ('+p.built.sheetsCount+' ورقة)');
}
async function previewEquipmentSheet(){ const p=await prepareEquipmentSheet(); if(!p) return; _pendingSubmission=null; openEquipmentReview(p.built, p.rows, false); }
async function submitEquipmentForReview(){
  const p=await prepareEquipmentSheet(); if(!p) return;
  _pendingSubmission={built:p.built, exp:p.rows};
  openEquipmentReview(p.built, p.rows, true);
}
// نفس مودال مراجعة الكشف الأسبوعي (نفس محرك المعاينة والزوم) — بيانات المعدات بدل الفلوس
function openEquipmentReview(b, exp, canSend){
  let ov=document.getElementById('submit-review-overlay');
  if(!ov){ ov=document.createElement('div'); ov.id='submit-review-overlay'; ov.className='modal-overlay'; document.body.appendChild(ov); }
  const title=localStorage.getItem('cea_user_title')||'';
  ov.innerHTML=`
    <div class="modal-box wide" role="dialog" aria-modal="true">
      <div class="modal-head">${canSend?'📤 مراجعة الكشف الشهري قبل الإرسال':'👁 معاينة الكشف الشهري'}</div>
      <div class="modal-body">
        <div class="hint-box" style="margin-bottom:10px">
          <div><strong>المهندس:</strong> ${esc(localStorage.getItem('cea_user_name')||getCurrentUserEmail()||'')}${title?' — '+esc(title):''}</div>
          <div><strong>المعدة:</strong> ${esc(b.placesLabel||'')} · <strong>المقاول:</strong> ${esc(b.contractorNames.join('، '))}</div>
          <div><strong>الشهر:</strong> من ${esc(b.wkStart)} إلى ${esc(b.wkEnd)} · <strong>الموقع:</strong> ${esc(b.siteLabel||'')}</div>
          <div><strong>أيام التشغيل:</strong> ${b.monthDays} · <strong>إجمالي الساعات:</strong> ${fmtMinutes(b.monthMinutes)}</div>
          <div><strong>الملف:</strong> <span style="direction:ltr;unicode-bidi:embed">${esc(b.fileName)}</span> (${b.sheetsCount} ورقة — كل ورقة 5 أيام${(b.equipmentNames||[]).length>1?'، لكل معدة':''})</div>
        </div>
        <div class="subhead" style="margin-top:0;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <span>📄 الكشف كما ${canSend?'هيتبعت':'هيطلع'} (${b.sheetsCount} ورقة)</span>
          <span class="xl-tools">
            <button type="button" class="xl-tool" onclick="sheetZoom(-0.15)" aria-label="تصغير">➖</button>
            <button type="button" class="xl-tool" id="xl-zoom-label" onclick="sheetZoomReset()">100%</button>
            <button type="button" class="xl-tool" onclick="sheetZoom(0.15)" aria-label="تكبير">➕</button>
            <button type="button" class="xl-tool" onclick="toggleSheetFull()" aria-label="ملء الشاشة">⛶</button>
          </span>
        </div>
        <div class="xl-wrap"><div id="xl-zoom">${b.workbook.worksheets.map(ws=>'<div class="xl-sheet-title">'+esc(ws.name)+'</div>'+renderSheetHtml(ws, b.workbook)).join('')}</div></div>
        ${canSend?`<div class="subhead">ملاحظة للمعتمد (اختياري)</div>
        <input type="text" id="submit-note" placeholder="مثال: المعدة وقفت يومين عطل" maxlength="500">
        <p class="hint" style="margin-top:8px">بالضغط على "موافق — إرسال" الكشف هيدخل سلسلة اعتمادات المديرين زي السركي الأسبوعي، وبعد اكتمالها يوصل جوجل شيت موقّعًا.</p>`:''}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-inline" onclick="closeSubmitReview()">${canSend?'تعديل / إلغاء':'إغلاق'}</button>
        ${canSend?'<button class="btn btn-gold btn-inline" id="submit-confirm-btn" onclick="confirmSubmitApproved()">✅ موافق — إرسال للاعتماد</button>':''}
      </div>
    </div>`;
  ov.style.display='flex'; document.body.classList.add('modal-open');
  _sheetZoom=1; sheetZoom(0);
}
document.addEventListener('DOMContentLoaded', ()=>{ if(document.getElementById('eq-date')){ clearEqForm(); renderEqMonthNav(); } });

// ── تسليماتي (المهندس) ──
// خط سير الاعتماد في جوجل شيت (بيظهر لو التسليم متربط بصف في الشيت)
// زرار "إعادة الإرسال للشيت" يظهر بس لو الكشف بقاله أكتر من 3 دقايق SENT من غير صف — الدفع الأول بياخد لدقيقتين
// (كان بيظهر فورًا فصاحب المشروع ضغطه والدفع الأول لسه شغال؛ السيرفر بقى يمنع التكرار برضو)
function subSentLongAgo(s){
  const t=new Date(s.updatedAt||s.createdAt||0).getTime();
  return !t || (Date.now()-t) > 3*60*1000;
}
function sheetTimeline(s){
  if(!s.gsheetRow){
    // الربط شغّال بس التسليم ده لسه ما وصلش (الرفع في الخلفية بياخد لدقيقة) — أو الربط مش مفعّل أصلًا
    return s.googleSyncEnabled ? '<div class="s" style="font-size:11px;color:var(--muted);margin-top:3px">⏳ جاري الإرسال لشيت الاعتماد... (التحويل في جوجل بياخد لدقيقتين — اضغط "تحديث" بعد شوية)</div>' : '';
  }
  const sh=s.sheet;
  const st=sh&&sh.status?sh.status:'';
  let icon='📋', color='var(--info-fg)';
  if(st.includes('معتمد بالكامل')){ icon='🎉'; color='var(--ok-fg)'; }
  else if(st.includes('مرفوض')){ icon='⛔'; color='var(--danger-fg)'; }
  else if(st.includes('معتمد مدير')){ icon='✍️'; color='var(--warn-fg)'; }
  const steps=[];
  steps.push('✅ وصل شيت الاعتماد');
  if(sh){
    // الشيت (بعد تحديث سبتمبر 2026): خانة D = اعتماد DC (توقيعين + PDF)، F = الاعتماد الإداري (بيتملي تلقائيًا من التطبيق)، G = سلسلة الاعتماد
    if(sh.pmApproval) steps.push('✅ الاعتماد الإداري: '+esc(sh.pmApproval));
    steps.push((sh.execApproval?('✅ DC: '+esc(sh.execApproval)):'⏳ بانتظار DC (التوقيع والـ PDF)'));
    // ملاحظة DC مبقتش هنا — طلعت بلوك بارز فوق (dcNotesBox) لأنها أهم حاجة للمهندس وكانت ضايعة جوّه القايمة
    if(sh.pmNotes) steps.push('🖋 سلسلة الاعتماد: '+esc(sh.pmNotes));
  }
  return '<div class="s" style="font-size:11px;margin-top:4px;padding:6px 8px;background:var(--input);border-radius:8px;line-height:1.8">'
    + '<span style="font-weight:800;color:'+color+'">'+icon+' '+(st?esc(st):'قيد الاعتماد')+'</span><br>'
    + steps.join('<br>') + '</div>';
}
/* ═══════════ مواعيد الإرسال والاعتماد (9 سبتمبر 2026) ═══════════
   الأدمن بيحدد نافذة أسبوعية لكل عملية (مثال: الإرسال من التلات 8ص للأربع 5م).
   ⚠ القفل الحقيقي في السيرفر (requireWindow) — اللي هنا إخفاء وتوضيح بس:
   المستخدم يشوف الميعاد والعدّاد بدل ما يضغط ويتفاجئ برفض.

   ساعة الجهاز مش مصدر موثوق (ممكن تكون غلط أو يغيّرها عمدًا)، فبنحسب فرقها عن
   وقت السيرفر مرة واحدة (_winSkew) ونعوّضه في العدّاد. القرار نفسه من السيرفر دايمًا. */
let _winStates=null, _winSkew=0, _winTimer=null, _winLoading=false;

function winNow(){ return Date.now()+_winSkew; }
function winState(kind){ return _winStates ? _winStates[kind] : null; }
/* مفتوح؟ لو لسه ما جبناش الحالة بنقول "مفتوح" — ما نقفلش على المستخدم بسبب بطء تحميل،
   والسيرفر هو اللي هيرفض فعلًا لو مقفول. */
function winOpen(kind){ const s=winState(kind); return !s || s.open; }

async function loadWindows(){
  if(_winLoading || !getAccessToken() || !navigator.onLine) return;
  _winLoading=true;
  try{
    const r=await api('GET','/api/windows');
    _winStates=r.data;
    if(r.serverNow) _winSkew=new Date(r.serverNow).getTime()-Date.now();
    renderWindowCards();
    applyWindowLocks();
  }catch(e){ /* الشبكة وقعت — نسيب آخر حالة معروفة */ }
  finally{ _winLoading=false; }
}

/* فرق زمني بالعربي: "يومين و3 ساعات" · "5 ساعات و12 دقيقة" · "00:04:31" لما يقرّب */
function winCountdown(ms){
  if(ms<0) ms=0;
  const s=Math.floor(ms/1000), d=Math.floor(s/86400), h=Math.floor(s%86400/3600), m=Math.floor(s%3600/60), ss=s%60;
  if(d>0) return d+' يوم و '+h+' ساعة';
  if(h>0) return h+' ساعة و '+m+' دقيقة';
  return String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0');
}
function winCardHtml(st){
  if(!st || !st.enabled) return '';
  const left = st.nextChangeAt ? (new Date(st.nextChangeAt).getTime()-winNow()) : 0;
  const cls = st.open ? (left<60*60*1000 ? 'win-soon' : 'win-open') : 'win-shut';
  const icon= st.open ? (st.overrideOpen?'🔓':'🟢') : '🔒';
  const head= st.open
    ? (st.overrideOpen ? st.label+' مفتوح استثنائيًا' : st.label+' مفتوح دلوقتي')
    : st.label+' مقفول';
  return '<div class="win-card '+cls+'" data-win="'+st.kind+'">'
    + '<div class="win-head"><span>'+icon+' '+esc(head)+'</span><span class="win-sub">'+esc(st.nextChangeLabel||'')+'</span></div>'
    + '<div class="win-time" data-at="'+esc(st.nextChangeAt||'')+'">'+(st.nextChangeAt?winCountdown(left):'—')+'</div>'
    + '<div class="win-foot">'+esc(winScheduleText(st))+'</div>'
    + '</div>';
}
const WIN_DAYS=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
function winScheduleText(st){
  if(!st.windows || !st.windows.length) return '';
  return st.windows.map(w=>'من '+WIN_DAYS[w.from.day]+' '+w.from.time+' إلى '+WIN_DAYS[w.to.day]+' '+w.to.time).join(' · ');
}
/* الكارت بيظهر للي الوحدة مفعّلة له بس: الإرسال لأصحاب وحدة التسليمات، والاعتماد لأصحاب وحدة الاعتمادات */
function renderWindowCards(){
  const box=document.getElementById('win-cards'); if(!box) return;
  if(!_winStates){ box.innerHTML=''; return; }
  let html='';
  if(moduleEnabled('submissions')) html+=winCardHtml(_winStates.submit);
  if(moduleEnabled('approvals'))   html+=winCardHtml(_winStates.approve);
  box.innerHTML=html;
  if(html && !_winTimer) _winTimer=setInterval(winTick,1000);
  if(!html && _winTimer){ clearInterval(_winTimer); _winTimer=null; }
}
/* العدّاد بيتحدّث محليًا كل ثانية؛ ولما يوصل صفر بنسأل السيرفر تاني عن الحالة الجديدة */
function winTick(){
  const els=document.querySelectorAll('#win-cards .win-time[data-at]');
  if(!els.length) return;
  let flipped=false;
  els.forEach(el=>{
    const at=el.dataset.at; if(!at) return;
    const left=new Date(at).getTime()-winNow();
    el.textContent=winCountdown(left);
    if(left<=0) flipped=true;
    const card=el.closest('.win-card');
    if(card && card.classList.contains('win-open') && left<60*60*1000){ card.classList.remove('win-open'); card.classList.add('win-soon'); }
  });
  if(flipped) loadWindows();
}

/* قفل الأزرار: زرار الإرسال في تاب السراكي، وأزرار القرار في تاب الاعتمادات.
   بنحط سبب واضح مكان الزرار بدل ما نخفيه — المستخدم يعرف بيفتح امتى. */
function applyWindowLocks(){
  const sub=document.getElementById('submit-review-btn');
  if(sub){
    const st=winState('submit'), locked=st&&st.enabled&&!st.open&&!isAdmin();
    sub.disabled=!!locked;
    sub.classList.toggle('is-locked', !!locked);
    if(locked) sub.textContent='🔒 '+st.nextChangeLabel;
    else sub.textContent='📤 مراجعة وإرسال الكشف للاعتماد';
    const hint=document.getElementById('submit-window-hint');
    if(hint) hint.innerHTML = locked ? '⏰ '+esc(st.reason)+' — تقدر تسجّل سراكي عادي، الإرسال بس هو اللي مقفول.' : '';
  }
  if(typeof aprBuildTable==='function' && _aprRows && _aprRows.length) aprBuildTable();
}
/* ── إدارة المواعيد (الأدمن) ──
   نافذة واحدة لكل عملية في الواجهة. التخزين في السيرفر مصفوفة، فلو احتجنا نافذتين
   في الأسبوع بعدين نزوّد صف هنا من غير ما نلمس الباك اند ولا شكل التخزين. */
let _winAdmin=null;
async function renderWindowsAdmin(){
  const box=document.getElementById('windows-admin'); if(!box) return;
  if(!navigator.onLine){ box.innerHTML='<div class="home-empty">بيانات حية — محتاج اتصال بالنت</div>'; return; }
  try{
    const r=await api('GET','/api/windows');
    _winAdmin=r.data;
    if(r.serverNow) _winSkew=new Date(r.serverNow).getTime()-Date.now();
    box.innerHTML=['submit','approve'].map(winAdminBlock).join('');
  }catch(e){ box.innerHTML='<div class="home-empty">⚠ '+esc(e.message||'تعذر التحميل')+'</div>'; }
}
function winDayOptions(sel){
  return WIN_DAYS.map((d,i)=>'<option value="'+i+'"'+(i===sel?' selected':'')+'>'+d+'</option>').join('');
}
function winAdminBlock(kind){
  const st=_winAdmin[kind], w=(st.windows&&st.windows[0])||{from:{day:2,time:'08:00'},to:{day:3,time:'17:00'}};
  const status = st.enabled
    ? (st.open
        ? '<div class="win-status" style="background:var(--ok-bg);color:var(--ok-fg)">🟢 مفتوح دلوقتي'+(st.overrideOpen?' (فتح استثنائي)':'')+' — '+esc(st.nextChangeLabel)+'</div>'
        : '<div class="win-status" style="background:var(--danger-bg);color:var(--danger-fg)">🔒 مقفول — '+esc(st.nextChangeLabel)+'</div>')
    : '<div class="win-status" style="background:var(--input);color:var(--muted)">⚪ متعطّل — مفتوح على طول (زي ما كان قبل الميزة)</div>';
  return '<div class="subhead" style="margin-top:10px">'+(kind==='submit'?'📤 إرسال السراكي':'🖋️ الاعتماد')+'</div>'
    + status
    + '<label class="win-row" style="cursor:pointer"><input type="checkbox" id="win-'+kind+'-on"'+(st.enabled?' checked':'')+' style="width:auto;flex:0 0 auto"> <span class="lbl">فعّل الميعاد لهذه العملية</span></label>'
    + '<div class="win-row"><span class="lbl">من</span>'
      + '<select id="win-'+kind+'-fd">'+winDayOptions(w.from.day)+'</select>'
      + '<input type="time" id="win-'+kind+'-ft" value="'+esc(w.from.time)+'"></div>'
    + '<div class="win-row"><span class="lbl">إلى</span>'
      + '<select id="win-'+kind+'-td">'+winDayOptions(w.to.day)+'</select>'
      + '<input type="time" id="win-'+kind+'-tt" value="'+esc(w.to.time)+'"></div>'
    + '<div class="win-row">'
      + '<button class="btn btn-navy btn-inline" onclick="winSave(\''+kind+'\')">💾 حفظ</button>'
      + '<button class="btn btn-gold btn-inline" onclick="winOpenFor(\''+kind+'\',60)">🔓 افتح ساعة</button>'
      + '<button class="btn btn-gold btn-inline" onclick="winOpenFor(\''+kind+'\',24*60)">🔓 افتح 24 ساعة</button>'
      + (st.openUntil ? '<button class="btn btn-danger btn-inline" onclick="winOpenFor(\''+kind+'\',0)">✕ ألغِ الفتح الاستثنائي</button>' : '')
    + '</div>';
}
function winReadForm(kind){
  const v=id=>{const e=document.getElementById(id);return e?e.value:'';};
  return {
    enabled: !!document.getElementById('win-'+kind+'-on')?.checked,
    windows: [{
      from:{ day:Number(v('win-'+kind+'-fd')), time:v('win-'+kind+'-ft')||'08:00' },
      to:  { day:Number(v('win-'+kind+'-td')), time:v('win-'+kind+'-tt')||'17:00' },
    }],
    openUntil: _winAdmin[kind].openUntil || null,
  };
}
async function winSave(kind){
  try{
    const r=await api('PATCH','/api/admin/windows',{[kind]:winReadForm(kind)});
    _winAdmin=r.data; _winStates=r.data;
    showToast('✅ اتحفظ الميعاد');
    renderWindowsAdmin(); renderWindowCards(); applyWindowLocks();
  }catch(e){ showToast('⚠ '+e.message, true); }
}
/* فتح استثنائي: بيغيّر openUntil بس — المواعيد الأساسية زي ما هي. minutes=0 معناها إلغاء. */
async function winOpenFor(kind, minutes){
  try{
    const cfg=winReadForm(kind);
    cfg.openUntil = minutes>0 ? new Date(winNow()+minutes*60000).toISOString() : null;
    const r=await api('PATCH','/api/admin/windows',{[kind]:cfg});
    _winAdmin=r.data; _winStates=r.data;
    showToast(minutes>0 ? '🔓 اتفتح لحد '+new Date(cfg.openUntil).toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'}) : '✕ اتلغى الفتح الاستثنائي');
    renderWindowsAdmin(); renderWindowCards(); applyWindowLocks();
  }catch(e){ showToast('⚠ '+e.message, true); }
}
/* ═══════════ اعتمادات المديرين (وحدة approvals — أونلاين فقط) ═══════════
   سلسلة مراجعة داخل التطبيق قبل ما الكشف ينزل جوجل شيت. */
let _aprLevels=[], _aprMyLevel=null, _aprRows=[], _aprViewer=false, _aprMyId='', _aprPreviewWb=null;
const APR_TIPS={
  APPROVED:['اعتماد','معتمد بدون ملاحظات — الكشف يفتح للمعتمد اللي بعده في السلسلة.'],
  APPROVED_NOTES:['اعتماد بملاحظات','معتمد مع ملاحظة — بيكمل للمعتمد اللي بعده برضو. الملاحظة بتتسجل، مش بترجع للمهندس.'],
  REJECTED:['رفض بملاحظات','الكشف بيرجع للمهندس، يعمل الملاحظات ويعيد إرساله كنسخة جديدة.']
};
// (19 سبتمبر 2026) الطابور بيعرض الكشوف اللي خلصت آخر 7 أيام — "📜 عرض الأقدم" بيزوّد أسبوع مع كل ضغطة.
// بيفضل ثابت مع التحديث التلقائي كل 20 ث، وبيرجع أسبوع واحد مع أي ريفرش للتطبيق
let _aprWeeks=1;
async function aprShowOlder(){
  if(_aprWeeks>=52){ showToast('⚠ ده أقصى حد — سنة كاملة', true); return; }
  _aprWeeks++;
  showToast('⏳ بيتحمّل أسبوع كمان...');
  await renderApprovals();
}
async function renderApprovals(){
  const box=document.getElementById('apr-table'); if(!box) return;
  if(!getAccessToken()||!navigator.onLine){ box.innerHTML='<div class="home-empty">اعتمادات المديرين بيانات حية — محتاج اتصال بالنت</div>'; return; }
  try{
    const [lv, q]=await Promise.all([api('GET','/api/approvals/levels'), api('GET','/api/approvals/queue?weeks='+_aprWeeks)]);
    _aprLevels=lv.data; _aprRows=q.data; _aprMyLevel=q.myLevel; _aprViewer=!!q.viewer; _aprMyId=String(q.myId||'');
    const oh=document.getElementById('apr-older-hint');
    if(oh && q.since) oh.textContent='الكشوف اللي خلصت معروضة من '+new Date(q.since).toLocaleDateString('ar-EG',{day:'numeric',month:'long'})+' — واللي في المراجعة كلها دايمًا';
    aprApplyViewerTitles();
    const roleEl=document.getElementById('apr-myrole');
    const isApprover=_aprLevels.indexOf(_aprMyLevel)>=0;
    if(roleEl) roleEl.innerHTML = isApprover
      ? ('دورك: <b style="color:var(--gold-text)">'+esc(_aprMyLevel)+'</b> — بتشوف كل الكشوف، وبتعتمد اللي دورك فيه بس (المسند لك)')
      : (isAdmin()?'أدمن — تقدر تعتمد أي مستوى وتشوف كل الكشوف'
        : (_aprMyLevel==='viewer'?'👁 مشاهدة — بتشوف كل الكشوف وملفاتها، ومفيش قرارات'
          :'👁 مشاهدة فقط — بتشوف كل الكشوف وحالتها وملاحظاتها، وتفتح ملفات كشوفك إنت بس، من غير أي إجراء'));
    aprBuildTable();
  }catch(e){ box.innerHTML='<div class="home-empty">⚠ '+esc(e.message||'تعذر التحميل')+'</div>'; return; }
  // شريط الإحصاءات فوق الجدول — فشله ما بيوقفش عرض الجدول نفسه
  try{
    const st=(await api('GET','/api/approvals/stats')).data;
    aprRenderStats(st);
  }catch(e){ /* الشريط اختياري — سكوت */ }
}
function aprRenderStats(st){
  const el=document.getElementById('apr-stats'); if(!el) return;
  const isApprover=_aprLevels.indexOf(_aprMyLevel)>=0;
  const chips=[
    '<span class="apr-chip">⏳ في المراجعة <b>'+esc(String(st.pending))+'</b></span>',
  ];
  if(isApprover && (st.myTurn>0)) chips.push('<span class="apr-chip apr-chip-mine">🎯 دورك <b>'+esc(String(st.myTurn))+'</b></span>');
  chips.push('<span class="apr-chip">✅ تم الاعتماد النهارده <b>'+esc(String(st.approvedToday))+'</b></span>');
  chips.push('<span class="apr-chip">↩️ رجع النهارده <b>'+esc(String(st.returnedToday))+'</b></span>');
  if(st.staleOver24h>0) chips.push('<span class="apr-chip apr-chip-warn">🐢 مستني من أكتر من يوم <b>'+esc(String(st.staleOver24h))+'</b></span>');
  el.innerHTML=chips.join('');
}
// (8 سبتمبر 2026) المشاهد لازم يبان قدامه إن التاب للمتابعة بس — بنزوّد "(مشاهدة فقط)" على عنوان التاب
// في القائمة الجانبية وفي كارت الشاشة وفي شريط العنوان. بيتنادى بعد ما الطابور يرجّع الفلاج من السيرفر.
function aprApplyViewerTitles(){
  const label='اعتمادات المديرين'+(_aprViewer?' (مشاهدة فقط)':'');
  TAB_TITLES.approvals=label;
  const drawer=document.querySelector('.drawer-item[data-tab="approvals"] span:not(.ico)');
  if(drawer) drawer.textContent=label;
  const card=document.querySelector('#tab-approvals .card-title .t');
  if(card) card.textContent='📋 '+label;
  const tab=document.getElementById('tab-approvals'), head=document.getElementById('header-title');
  if(head && tab && tab.classList.contains('active')) head.textContent=label;
}
// تحديث تلقائي للطابور: كل 20 ثانية والتاب مفتوح وظاهر (وكمان أول ما ترجع للتطبيق) — عشان لما معتمد يخلص،
// اللي بعده يشوف دوره من غير ريفرش. بيتخطى التحديث لو فيه قرار مفتوح أو معاينة ملف عشان ما يقطعش شغلك.
// زرار "🔄 تحديث" في تاب الاعتمادات: إعادة تحميل التطبيق كله (بطلب صاحب المشروع) — بيرجع على نفس التاب
function aprHardRefresh(){
  showToast('⏳ جاري تحديث التطبيق...');
  try{ sessionStorage.setItem('cea_reopen_tab','approvals'); }catch(e){}
  setTimeout(()=>location.reload(), 150);
}
// بعد إعادة التحميل من زرار التحديث: نرجع لتاب الاعتمادات تلقائيًا
document.addEventListener('DOMContentLoaded', ()=>{
  let t=null; try{ t=sessionStorage.getItem('cea_reopen_tab'); sessionStorage.removeItem('cea_reopen_tab'); }catch(e){}
  if(t==='approvals'){ const tryOpen=(n)=>{ if(getAccessToken() && document.getElementById('tab-approvals')){ switchTab('approvals'); } else if(n>0) setTimeout(()=>tryOpen(n-1), 400); }; setTimeout(()=>tryOpen(10), 600); }
});
// تكبير/تصغير جدول الاعتمادات — زوم حر. بيتحفظ على الجهاز.
// (8 سبتمبر 2026 — قرار صاحب المشروع) كان محبوس بين 50% و130% وبالأزرار بس، والتمرير أفقي بس.
// دلوقتي: من 25% لـ 300% · بإصبعين (pinch) · Ctrl/⌘ + عجلة الماوس · سحب بالماوس أو الإصبع في كل الاتجاهات.
// بنفضل على CSS zoom (مش transform): الجدول بيتصغّر فعليًا فمساحة التمرير والعمود المثبّت بيفضلوا مظبوطين.
const APR_ZOOM_MIN=0.25, APR_ZOOM_MAX=3;
let _aprTblZoom=1;
// الزوم وإيماءاته للموبايل فقط (≤899px) — على الكمبيوتر الجدول بحجمه الطبيعي دايمًا (قرار صاحب المشروع 8 سبتمبر)
function aprMobile(){ return window.matchMedia('(max-width:899px)').matches; }
function aprTableApplyZoom(){
  const box=document.getElementById('apr-table'); if(box) box.style.zoom=String(aprMobile() ? _aprTblZoom : 1);
  const lb=document.getElementById('apr-zoom-label'); if(lb) lb.textContent=Math.round(_aprTblZoom*100)+'%';
}
// z = النسبة الجديدة · focal = نقطة التركيز {x,y} بالنسبة لبرواز التمرير (وسط الإصبعين أو مؤشر الماوس)
// بنظبط التمرير بعد الزوم عشان النقطة دي تفضل تحت الإصبع بدل ما الجدول ينط
function aprTableSetZoom(z, focal){
  const sc=document.getElementById('apr-scroll');
  const prev=_aprTblZoom;
  _aprTblZoom=Math.min(APR_ZOOM_MAX, Math.max(APR_ZOOM_MIN, Math.round(z*100)/100));
  if(_aprTblZoom===prev) return;
  aprTableApplyZoom();
  try{ localStorage.setItem('cea_apr_zoom', String(_aprTblZoom)); }catch(e){}
  if(sc && focal){
    const ratio=_aprTblZoom/prev;
    // RTL: كروم بيخلي scrollLeft سالب (مقاس من يمين المحتوى) — بنشتغل بالقيمة المطلقة ونرجّع الإشارة
    const neg=sc.scrollLeft<0;
    const sx=Math.abs(sc.scrollLeft);
    sc.scrollLeft=(neg?-1:1)*Math.max(0,(sx+focal.x)*ratio-focal.x);
    sc.scrollTop=Math.max(0,(sc.scrollTop+focal.y)*ratio-focal.y);
  }
}
// الأزرار بتضرب/تقسم على 1.25 (مش زيادة ثابتة): من 100% لـ 300% بـ 5 ضغطات بدل 20، والتصغير بيفضل ناعم
function aprTableZoom(dir){ aprTableSetZoom(dir>0 ? _aprTblZoom*1.25 : _aprTblZoom/1.25, aprTableCenterFocal()); }
function aprTableZoomReset(){ _aprTblZoom=1; try{ localStorage.removeItem('cea_apr_zoom'); }catch(e){} aprTableApplyZoom(); }
// أزرار ➖/➕ مالهاش نقطة تركيز — بنكبّر حوالين نص البرواز
function aprTableCenterFocal(){
  const sc=document.getElementById('apr-scroll'); if(!sc) return null;
  return { x:sc.clientWidth/2, y:sc.clientHeight/2 };
}
function aprFocalAt(sc, clientX, clientY){
  const b=sc.getBoundingClientRect();
  // في RTL بنقيس من الحافة اللي التمرير مقاس منها (اليمين) عشان الحساب يطابق scrollLeft السالب
  const x = sc.scrollLeft<0 ? (b.right-clientX) : (clientX-b.left);
  return { x, y: clientY-b.top };
}
// ربط إيماءات الزوم/السحب على برواز الجدول — مرة واحدة
function aprBindZoomGestures(){
  const sc=document.getElementById('apr-scroll'); if(!sc || sc._aprGestures) return; sc._aprGestures=1;
  const dist=t=>Math.hypot(t[0].clientX-t[1].clientX, t[0].clientY-t[1].clientY);
  const mid=t=>aprFocalAt(sc, (t[0].clientX+t[1].clientX)/2, (t[0].clientY+t[1].clientY)/2);
  let pinch=null;
  sc.addEventListener('touchstart', e=>{ if(e.touches.length===2) pinch={ d:dist(e.touches), z:_aprTblZoom }; }, {passive:true});
  sc.addEventListener('touchmove', e=>{
    if(!pinch || e.touches.length!==2) return;
    e.preventDefault(); // من غير كده المتصفح بيزوّم الصفحة كلها بدل الجدول
    const d=dist(e.touches);
    if(d>0 && pinch.d>0) aprTableSetZoom(pinch.z*(d/pinch.d), mid(e.touches));
  }, {passive:false});
  sc.addEventListener('touchend', e=>{ if(e.touches.length<2) pinch=null; }, {passive:true});
  sc.addEventListener('touchcancel', ()=>{ pinch=null; }, {passive:true});
  // Ctrl/⌘ + عجلة الماوس (نفس إيماءة الزوم المعتادة على الكمبيوتر) — العجلة لوحدها بتفضل تمرير عادي
  sc.addEventListener('wheel', e=>{
    if(!aprMobile() || (!e.ctrlKey && !e.metaKey)) return;
    e.preventDefault();
    aprTableSetZoom(_aprTblZoom*(e.deltaY<0?1.12:1/1.12), aprFocalAt(sc, e.clientX, e.clientY));
  }, {passive:false});
  // سحب بالماوس في كل الاتجاهات (الإصبع بيسحب بشكل طبيعي أصلًا) — الأزرار جوه الجدول بتفضل شغالة
  let drag=null;
  sc.addEventListener('mousedown', e=>{
    if(!aprMobile() || e.button!==0 || (e.target.closest && e.target.closest('button,a,input,textarea,select'))) return;
    drag={ x:e.clientX, y:e.clientY, sl:sc.scrollLeft, st:sc.scrollTop }; sc.classList.add('grabbing');
  });
  window.addEventListener('mousemove', e=>{
    if(!drag) return;
    e.preventDefault();
    sc.scrollLeft=drag.sl-(e.clientX-drag.x);
    sc.scrollTop=drag.st-(e.clientY-drag.y);
  });
  window.addEventListener('mouseup', ()=>{ if(drag){ drag=null; sc.classList.remove('grabbing'); } });
}
document.addEventListener('DOMContentLoaded', ()=>{
  try{ const z=parseFloat(localStorage.getItem('cea_apr_zoom')||''); if(z>=APR_ZOOM_MIN && z<=APR_ZOOM_MAX) _aprTblZoom=z; }catch(e){}
  aprTableApplyZoom();
  aprBindZoomGestures();
  window.addEventListener('resize', aprTableApplyZoom); // تدوير الشاشة/تغيير العرض: الزوم يتطبق أو يتشال حسب الحجم
});
function aprTabLive(){
  const tab=document.getElementById('tab-approvals');
  return !!(tab && tab.classList.contains('active') && !document.hidden && navigator.onLine && getAccessToken());
}
function aprAutoRefresh(){
  if(!aprTabLive() || _aprPending) return;
  const pv=document.getElementById('apr-preview-ov'); if(pv && pv.style.display && pv.style.display!=='none') return;
  const m=document.getElementById('apr-modal'); if(m && m.style.display==='flex') return;
  const cm=document.getElementById('apr-comments-ov'); if(cm && cm.style.display==='flex') return;
  renderApprovals();
}
// ── مودال التعليقات — نفس نمط modal-overlay/modal-box، بيتحدّث محليًا بعد كل إجراء من غير ما يتقفل ──
let _aprCommentsId=null;
function aprOpenComments(id){
  _aprCommentsId=String(id);
  let ov=document.getElementById('apr-comments-ov');
  if(!ov){
    ov=document.createElement('div'); ov.id='apr-comments-ov'; ov.className='modal-overlay';
    ov.innerHTML='<div class="modal-box" id="apr-comments-box">'
      +'<div class="modal-head"><span id="apr-comments-title">💬 التعليقات</span><button class="modal-x" onclick="aprCloseComments()">✕</button></div>'
      +'<div class="modal-body" id="apr-comments-list"></div>'
      +'<div class="apr-cmt-input"><textarea id="apr-comments-text" rows="2" maxlength="500" placeholder="اكتب تعليق..."></textarea>'
      +'<button class="apr-fbtn" onclick="aprSendComment()">إرسال</button></div>'
      +'</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', e=>{ if(e.target===ov) aprCloseComments(); });
  }
  ov.style.display='flex'; document.body.classList.add('modal-open');
  const r=_aprRows.find(x=>String(x.id)===String(id));
  aprRefreshCommentsModal(id, r ? r.comments : []);
}
function aprCloseComments(){
  const ov=document.getElementById('apr-comments-ov'); if(ov) ov.style.display='none';
  document.body.classList.remove('modal-open'); _aprCommentsId=null;
}
function aprRefreshCommentsModal(id, comments){
  if(_aprCommentsId!==String(id)) return;
  const list=document.getElementById('apr-comments-list'); if(!list) return;
  const items=(comments||[]).filter(c=>c.kind==='comment');
  const canDel=c=>isAdmin() || String(c.user?.id||'')===_aprMyId;
  list.innerHTML = items.length ? items.map(c=>{
    const when=c.createdAt ? new Date(c.createdAt).toLocaleString('ar-EG',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
    return '<div class="apr-cmt-row">'
      +'<div class="apr-cmt-head"><b>'+esc(personName(c.user)||'—')+'</b><small>'+esc(when)+'</small>'
      +(canDel(c)?'<button class="apr-cmt-del" title="مسح" onclick="aprDeleteComment(\''+c.id+'\')">🗑</button>':'')
      +'</div><div class="apr-cmt-body">'+esc(c.body)+'</div></div>';
  }).join('') : '<div class="home-empty">مفيش تعليقات لسه</div>';
}
async function aprSendComment(){
  const id=_aprCommentsId; if(!id) return;
  const ta=document.getElementById('apr-comments-text'); const body=(ta.value||'').trim();
  if(!body) return;
  try{
    const res=await api('POST','/api/approvals/'+id+'/comments', { body });
    ta.value='';
    aprApplyFreshComments(id, res.data);
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function aprDeleteComment(commentId){
  const id=_aprCommentsId; if(!id) return;
  if(!confirm('مسح التعليق ده؟')) return;
  try{
    const res=await api('DELETE','/api/approvals/'+id+'/comments/'+commentId);
    aprApplyFreshComments(id, res.data);
  }catch(e){ showToast('⚠ '+e.message, true); }
}
setInterval(aprAutoRefresh, 20*1000);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) aprAutoRefresh(); });
function aprLevelCell(r, level){
  // القرار المسجل على المستوى ده في النسخة الحالية
  const rv=(r.reviews||[]).filter(x=>x.level===level && x.revision===r.revision);
  const last=rv[rv.length-1];
  if(last){
    // مين اعتمد وإمتى — بيتعرض هنا برّه الشيت (قرار 8 سبتمبر: الشيت نفسه يفضل نضيف بالتوقيع بس)
    const who=personName(last.byUser);
    const when=last.createdAt ? new Date(last.createdAt).toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit'}) : '';
    const by = who ? '<br><small class="apr-by">بواسطة '+esc(who)+(when?' · '+esc(when):'')+'</small>' : '';
    if(last.decision==='REJECTED') return '<span class="apr-pill apr-rej">❌ مرفوض</span>'+by;
    if(last.decision==='APPROVED_NOTES') return '<span class="apr-pill apr-notes" title="'+esc(last.note||'')+'">📝 معتمد بملاحظات</span>'+by;
    return '<span class="apr-pill apr-ok">✅ معتمد</span>'+by;
  }
  // اسم المعتمد المسند للمستوى ده (بيرجع من السيرفر مع كل كشف) — بيتعرض تحت "دورك/منتظر" وتحت المقفول
  const assigned=(r.approverNames&&r.approverNames[level]) ? '<br><small class="apr-by">عند: '+esc(r.approverNames[level])+'</small>' : '';
  if(r.reviewState==='IN_REVIEW' && r.currentLevel===level) return '<span class="apr-pill apr-wait">⏳ '+(r.canAct?'دورك':'منتظر')+'</span>'+assigned;
  // مستوى مش في سلسلة صاحب الكشف أصلًا (درجته مش محتاجاه، أو مفيش معتمد مسند له)
  const chain=Array.isArray(r.chain)?r.chain:_aprLevels;
  if(chain.indexOf(level)===-1) return '<span class="apr-pill apr-lock" title="مش مطلوب في سلسلة المهندس ده">·</span>';
  // مستوى لسه ما وصلوش
  const li=chain.indexOf(level), ci=chain.indexOf(r.currentLevel);
  if(r.reviewState==='IN_REVIEW' && ci>=0 && li>ci) return '<span class="apr-pill apr-lock">🔒 مقفول</span>'+assigned;
  return '<span class="apr-pill apr-lock">—</span>';
}
// زرار الأدمن "إخفاء من الجدول": بيخفي الصف من طابور الاعتمادات بس — الكشف وسجل المراجعات و"تسليماتي" والشيت زي ما هم.
// بيظهر للأدمن فقط وعلى الكشوف اللي خلصت أو اترفضت (اللي في المراجعة لازم يفضل ظاهر)
function aprHideBtn(r){
  if(!isAdmin()) return '';
  return '<button class="apr-fbtn apr-hide" title="إخفاء الصف من الجدول فقط — الكشف وسجله ما بيتمسحوش" onclick="aprHide(\''+r.id+'\')">🧹 إخفاء</button>';
}
async function aprHide(id){
  if(!confirm('إخفاء الصف ده من جدول الاعتمادات؟\n\nده تنظيف للعرض فقط: الكشف وسجل الاعتمادات و"تسليماتي" عند المهندس وجوجل شيت كلهم بيفضلوا زي ما هم.')) return;
  try{
    await api('POST','/api/approvals/'+id+'/hide');
    showToast('🧹 اتخفى من الجدول');
    renderApprovals();
  }catch(e){ showToast('⚠ '+e.message, true); }
}
// ملاحظات المعتمدين على النسخة الحالية — بتتكتب كاملة في خانة "الإجراء / الحالة"
// (8 سبتمبر 2026 — قرار صاحب المشروع): كانت بتظهر في tooltip بس، فالمهندس/المدير كان بيشوف "رجع للمهندس من team leader"
// من غير السبب. دلوقتي الكومنت نفسه مكتوب وظاهر تحت الحالة (رفض · اعتماد بملاحظات · سطر مشطوب).
function aprNotesBlock(r){
  const cur=Number(r.revision||0);
  const out=[];
  (r.reviews||[]).forEach(x=>{
    if(Number(x.revision)!==cur || !x.note) return;
    if(x.decision!=='REJECTED' && x.decision!=='APPROVED_NOTES') return;
    const who=personName(x.byUser);
    out.push('<div class="apr-note'+(x.decision==='REJECTED'?' apr-note-rej':'')+'">'
      +(x.decision==='REJECTED'?'❌':'📝')+' <b>'+esc(x.level)+'</b>'+(who?' · '+esc(who):'')+': '+esc(x.note)+'</div>');
  });
  (r.rowRejections||[]).forEach(x=>{
    if(Number(x.revision)!==cur) return;
    out.push('<div class="apr-note apr-note-rej">✕ سطر مشطوب: '+esc(x.label||'')+' · '+esc(x.level||'')+(x.note?': '+esc(x.note):'')+'</div>');
  });
  return out.length ? '<div class="apr-notes-box">'+out.join('')+'</div>' : '';
}
function aprStatusCell(r){
  return aprStatusPill(r)+aprNotesBlock(r)+aprSocialStrip(r);
}
// ريأكشن + كومنت — شريط مصغّر جوه خانة "الإجراء/الحالة"، متاح للجميع (حتى المشاهد)
const APR_REACT_EMOJIS=['👍','❤️','🔥','👏','⚠️','😂'];
function aprSocialStrip(r){
  const comments=Array.isArray(r.comments)?r.comments:[];
  const reactions=comments.filter(c=>c.kind==='reaction');
  const btns=APR_REACT_EMOJIS.map(em=>{
    const withEm=reactions.filter(c=>c.body===em);
    if(!withEm.length) return '';
    const mine=withEm.some(c=>String(c.user?.id||'')===_aprMyId);
    const names=withEm.map(c=>personName(c.user)).filter(Boolean).join('، ');
    return '<button type="button" class="apr-react'+(mine?' active':'')+'" title="'+esc(names)+'" onclick="event.stopPropagation();aprReact(\''+r.id+'\',\''+em+'\')">'+em+' '+withEm.length+'</button>';
  }).join('');
  const addBtn='<button type="button" class="apr-react apr-react-add" title="ضيف ريأكشن" onclick="event.stopPropagation();aprReactPicker(this,\''+r.id+'\')">➕</button>';
  const commentsCount=comments.filter(c=>c.kind==='comment').length;
  const cmtBtn='<button type="button" class="apr-fbtn apr-cmt-btn" onclick="event.stopPropagation();aprOpenComments(\''+r.id+'\')">💬 '+commentsCount+'</button>';
  return '<div class="apr-social">'+btns+addBtn+cmtBtn+'</div>';
}
function aprReactPicker(btn, id){
  document.querySelectorAll('.apr-react-menu').forEach(m=>m.remove());
  const menu=document.createElement('div'); menu.className='apr-react-menu';
  menu.innerHTML=APR_REACT_EMOJIS.map(em=>'<button type="button" onclick="event.stopPropagation();aprReact(\''+id+'\',\''+em+'\');document.querySelectorAll(\'.apr-react-menu\').forEach(m=>m.remove());">'+em+'</button>').join('');
  document.body.appendChild(menu);
  const b=btn.getBoundingClientRect();
  menu.style.top=(window.scrollY+b.bottom+4)+'px';
  menu.style.left=(window.scrollX+b.left)+'px';
  setTimeout(()=>{ document.addEventListener('click', function h(e){ if(!menu.contains(e.target)){ menu.remove(); document.removeEventListener('click', h); } }); }, 0);
}
async function aprReact(id, emoji){
  try{
    const res=await api('POST','/api/approvals/'+id+'/react', { emoji });
    aprApplyFreshComments(id, res.data);
  }catch(e){ showToast('⚠ '+e.message, true); }
}
// بيحدّث r.comments لصف بعينه محليًا من غير renderApprovals كامل — يحافظ على حالة الجدول/الزوم/التمرير
function aprApplyFreshComments(id, comments){
  const r=_aprRows.find(x=>String(x.id)===String(id));
  if(r){ r.comments=comments; aprBuildTable(); }
  aprRefreshCommentsModal(id, comments);
}
function aprStatusPill(r){
  if(r.reviewState==='RETURNED'){
    const rej=(r.reviews||[]).filter(x=>x.decision==='REJECTED').pop();
    return '<span class="apr-pill apr-rej">❌ رجع للمهندس'+(rej?' من '+esc(rej.level):'')+'</span>'+aprHideBtn(r);
  }
  if(r.reviewState==='SENT') return '<span class="apr-pill apr-ok">✅ اتبعت لمراجعة الـ DC</span>'+aprHideBtn(r);
  // برّه ميعاد الاعتماد: بنوري الميعاد مكان الأزرار (والسيرفر رافض برضو). الأدمن مستثنى.
  if(r.canAct && !winOpen('approve') && !isAdmin()){
    const st=winState('approve');
    return '<span class="apr-pill apr-lock" title="'+esc(st?st.reason:'')+'">🔒 '+esc(st?st.nextChangeLabel:'مقفول')+'</span>'+aprHideBtn(r);
  }
  if(r.canAct) return '<div class="apr-acts">'
    + '<button class="apr-a apr-a-ok" onclick="aprAsk(\''+r.id+'\',\'APPROVED\')">✅ اعتماد <span class="apr-info" onclick="event.stopPropagation();aprTip(\'APPROVED\')">!</span></button>'
    + '<button class="apr-a apr-a-notes" onclick="aprAsk(\''+r.id+'\',\'APPROVED_NOTES\')">📝 معتمد بملاحظات <span class="apr-info" onclick="event.stopPropagation();aprTip(\'APPROVED_NOTES\')">!</span></button>'
    + '<button class="apr-a apr-a-rej" onclick="aprAsk(\''+r.id+'\',\'REJECTED\')">❌ رفض <span class="apr-info" onclick="event.stopPropagation();aprTip(\'REJECTED\')">!</span></button>'
    + '</div>';
  return '<span class="apr-pill apr-lock">مع '+esc(r.currentLevel||'—')+'</span>';
}
// حدود الأسبوع في تاب الاعتمادات (قرار صاحب المشروع 15 سبتمبر 2026):
// الأسبوع يبدأ **الثلاثاء 8:00 صباحًا** وينتهي الثلاثاء اللي بعده 7:59 صباحًا.
// (كان الأربعاء 00:00 وقت أول تنفيذ — اتغيّر لأن قفل التسليم بيحصل الثلاثاء الصبح.)
// الحساب بتوقيت الجهاز المحلي — نفس التوقيت اللي بيتعرض في عمود التاريخ.
const APR_WEEK_DAY = 2;   // الثلاثاء (الأحد=0)
const APR_WEEK_HOUR = 8;  // 8 صباحًا
// الحيلة: نزيح الوقت 8 ساعات لورا، فالحدّ يبقى منتصف ليل ونقدر نقرّب لليوم بسهولة.
function aprWeekStart(d){
  const shifted=new Date(d.getTime()-APR_WEEK_HOUR*3600*1000);
  const x=new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
  x.setDate(x.getDate()-((x.getDay()-APR_WEEK_DAY+7)%7)); // ارجع لأقرب ثلاثاء سابق أو نفس اليوم
  x.setHours(APR_WEEK_HOUR,0,0,0);                        // الثلاثاء 8:00 ص = بداية الأسبوع
  return x;
}
function aprWeekKey(d){ const x=aprWeekStart(d); return x.getFullYear()+'-'+(x.getMonth()+1)+'-'+x.getDate(); }
function aprWeekLabel(d){
  const s=aprWeekStart(d), e=new Date(s); e.setDate(e.getDate()+7);
  const f=x=>x.toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit'});
  return '🗓 أسبوع من الثلاثاء '+f(s)+' ٨ص إلى الثلاثاء '+f(e)+' ٨ص';
}
function aprBuildTable(){
  const box=document.getElementById('apr-table'); if(!box) return;
  const active=_aprRows.filter(r=>r.reviewState==='IN_REVIEW');
  if(!_aprRows.length){ box.innerHTML='<div class="home-empty">لا توجد كشوف في المراجعة</div>'; return; }
  const heads=['التاريخ والوقت','المهندس','الملف',..._aprLevels,'النسخة','الإجراء / الحالة'];
  const cols=heads.length;
  let html='<table class="apr-table"><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>';
  // الطابور بيوصل الأحدث فوق (createdAt desc) — بنحط فاصل ملوّن كل ما ننزل لأسبوع أقدم
  let _prevWk=null;
  html+=_aprRows.map(r=>{
    const when=new Date(r.createdAt);
    const wk=aprWeekKey(when);
    const sep=(_prevWk!==null && wk!==_prevWk) ? '<tr class="apr-week-sep"><td colspan="'+cols+'">'+esc(aprWeekLabel(when))+'</td></tr>' : '';
    _prevWk=wk;
    const mine=r.canAct?' class="mine"':'';
    return sep+'<tr'+mine+'>'
      +'<td class="apr-when">'+when.toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit',year:'numeric'})+'<br>'+when.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})+'</td>'
      +'<td class="apr-eng">'+esc(personName(r.user))+'<small>'+esc(r.user?.title||'مهندس')+'</small>'+(r.kind==='equipment'?'<small style="color:var(--gold-text)">🚜 كشف معدات</small>':'')+(r.projectName?'<small>🏗 '+esc(r.projectName)+'</small>':'')+'</td>'
      +'<td>'+(_aprViewer && _aprMyLevel!=='viewer' && String(r.user?.id||r.userId||'')!==_aprMyId ? '<span class="apr-pill apr-lock" title="المشاهد يفتح ملفات كشوفه هو بس">—</span>' : '<button class="apr-fbtn" onclick="aprReview(\''+r.id+'\')">👁 '+(_aprViewer?'مشاهدة':'مراجعة')+'</button>')+(_aprViewer?'':'<button class="apr-fbtn" onclick="downloadSubmission(\''+r.id+'\',\''+esc(r.file?.fileName||'sheet.xlsx')+'\',\'/api/approvals\')">⬇ تحميل</button>')+'</td>'
      +_aprLevels.map(l=>'<td>'+aprLevelCell(r,l)+'</td>').join('')
      +'<td><span class="apr-rev">rev '+String(r.revision).padStart(2,'0')+'</span>'+(((r.rowRejections||[]).filter(x=>Number(x.revision)===Number(r.revision||0)).length)?'<br><span class="apr-pill apr-rej" title="سطور مشطوبة">✕ '+(r.rowRejections||[]).filter(x=>Number(x.revision)===Number(r.revision||0)).length+'</span>':'')+(((r.rowEdits||[]).filter(x=>Number(x.revision)===Number(r.revision||0)).length)?'<br><span class="apr-pill apr-wait" title="سطور معدّلة">✏️ '+(r.rowEdits||[]).filter(x=>Number(x.revision)===Number(r.revision||0)).length+'</span>':'')+'</td>'
      +'<td>'+aprStatusCell(r)+'</td>'
      +'</tr>';
  }).join('');
  html+='</tbody></table>';
  // نحافظ على موضع التمرير الأفقي: إعادة الرسم (بعد قرار أو تحديث تلقائي) كانت بترجّع الجدول لأوله
  // فعمود "الإجراء" (أقصى الشمال) بيختفي وكأن الأزرار راحت — خصوصًا على الموبايل
  const sc=box.closest('.apr-scroll')||box; const keepX=sc.scrollLeft, keepY=sc.scrollTop;
  box.innerHTML=html;
  if(keepX) sc.scrollLeft=keepX;
  if(keepY) sc.scrollTop=keepY;
}
// مراجعة = معاينة الملف جوه التطبيق (جدول) من غير تحميل — نفس محرك معاينة الكشوف
async function aprReview(id){
  const r=_aprRows.find(x=>String(x.id)===String(id));
  const name=personName(r?.user)||'الكشف';
  showToast('⏳ جاري فتح الملف للمراجعة...');
  try{
    await ensureExcelJS();
    // مسار الاعتمادات (مش /submissions): المعتمد مش صاحب الملف وغالبًا مالوش وحدة التسليمات
    const res=await fetch(API_URL+'/api/approvals/'+id+'/file',{headers:{'Authorization':'Bearer '+getAccessToken()}});
    if(!res.ok) throw new Error('تعذر فتح الملف');
    const buf=await res.arrayBuffer();
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws=wb.worksheets[0];
    if(!ws) throw new Error('الملف فاضي');
    aprOpenPreview('👁 '+(_aprViewer?'مشاهدة':'مراجعة')+' كشف '+name, wb, r);
  }catch(e){ showToast('⚠ '+(e.message||'تعذر فتح الملف'), true); }
}
// نفس شكل معاينة المهندس (openSubmitReview) بالظبط — كارت معلومات + زوم + الكشف المنسّق + أزرار القرار
function aprOpenPreview(title, wb, r){
  let ov=document.getElementById('apr-preview-ov');
  if(!ov){ ov=document.createElement('div'); ov.id='apr-preview-ov'; ov.className='modal-overlay'; document.body.appendChild(ov); }
  _aprPreviewWb=wb;
  // شطب سطر (رفض جزئي): السطور المشطوبة في النسخة الحالية + قائمة سطور كل ورقة بأزرار ✕ للمعتمد اللي دوره
  const struck=(r.rowRejections||[]).filter(x=>Number(x.revision)===Number(r.revision||0));
  const isStruck=(si,row)=>struck.find(x=>Number(x.sheetIndex)===si && Number(x.row)===row);
  const canStrike = !!(r && r.canAct && r.reviewState==='IN_REVIEW');
  // تعديل سطر (مدير المشروع بس): سطور اتعدّلت في النسخة الحالية + زرار ✏️ لمن دوره
  const edits=(r.rowEdits||[]).filter(x=>Number(x.revision)===Number(r.revision||0));
  const editOf=(si,row)=>edits.find(x=>Number(x.sheetIndex)===si && Number(x.row)===row);
  const canEdit=!!(r && r.canEdit && r.reviewState==='IN_REVIEW');
  const sheetsHtml=wb.worksheets.map((ws,si)=>{
    const rows=aprDataRows(ws, r.kind);
    const list = rows.length ? '<div class="apr-rows">'+rows.map(x=>{
      const s=isStruck(si,x.row);
      const ed=!s && editOf(si,x.row);
      // الوقوف على السطر في القايمة (أو الضغط عليه) بيلوّن نفس السطر في الجدول وينزل لحد عنده — عشان مفيش لخبطة
      return '<div class="apr-row'+(s?' struck':'')+'" onmouseenter="aprRowFocus('+si+','+x.row+',false)" onmouseleave="aprRowBlur()" onclick="aprRowClick(event,'+si+','+x.row+')"><span>'+esc(x.label)+'</span>'
        + (s ? '<small>❌ مشطوب — '+esc(s.level)+(s.note?': '+esc(s.note):'')+'</small>'
             : ''+(ed?'<small>✏️ معدّل — '+esc(ed.level)+': '+esc(ed.note)+'</small>':'')
               +(canEdit ? '<button type="button" class="apr-fbtn apr-edit" onclick="aprRowEdit(\''+r.id+'\','+si+','+x.row+','+jsArg(x.label)+')">✏️ تعديل</button>' : '')
               +(canStrike ? '<button type="button" class="apr-fbtn apr-strike" onclick="aprRowReject(\''+r.id+'\','+si+','+x.row+','+jsArg(x.label)+')">✕ شطب السطر</button>' : ''))
        + '</div>'; }).join('')+'</div>' : '';
    return '<div class="xl-sheet-title">'+esc(ws.name)+'</div>'+renderSheetHtml(ws, wb)+list;
  }).join('');
  const acts = (r && r.canAct)
    ? '<button class="btn btn-inline" style="background:linear-gradient(135deg,#1B5E20,#2E7D32);color:#fff" onclick="aprClosePreview();aprAsk(\''+r.id+'\',\'APPROVED\')">✅ اعتماد</button>'
      +'<button class="btn btn-gold btn-inline" onclick="aprClosePreview();aprAsk(\''+r.id+'\',\'APPROVED_NOTES\')">📝 معتمد بملاحظات</button>'
      +'<button class="btn btn-danger btn-inline" onclick="aprClosePreview();aprAsk(\''+r.id+'\',\'REJECTED\')">❌ رفض</button>'
      +'<button class="btn btn-ghost btn-inline" onclick="aprClosePreview()">إغلاق</button>'
    : '<span class="hint" style="flex:1">مش دورك في الاعتماد على الكشف ده دلوقتي — للاطلاع فقط</span><button class="btn btn-ghost btn-inline" onclick="aprClosePreview()">إغلاق</button>';
  ov.innerHTML=`
    <div class="modal-box wide" role="dialog" aria-modal="true">
      <div class="modal-head">${esc(title)}</div>
      <div class="modal-body">
        <div class="hint-box" style="margin-bottom:10px">
          <div><strong>المهندس:</strong> ${esc(personName(r.user))}${r.user?.displayName?' <span style="color:var(--muted);direction:ltr;unicode-bidi:embed">'+esc(r.user.email||'')+'</span>':''}${r.user?.title?' — '+esc(r.user.title):''}</div>
          <div><strong>المقاول:</strong> ${esc(r.contractorName||'')}</div>
          ${r.placeName?'<div><strong>المكان:</strong> '+esc(r.placeName)+(r.projectName?' — 🏗 '+esc(r.projectName):'')+'</div>':''}
          <div><strong>الأسبوع:</strong> من ${esc(r.weekStart)} إلى ${esc(r.weekEnd)}</div>
          <div><strong>عدد السجلات:</strong> ${r.recordsCount} · <strong>الإجمالي:</strong> ${fmt(r.total)} ج.م · <strong>النسخة:</strong> rev ${String(r.revision).padStart(2,'0')}</div>
          <div><strong>الملف:</strong> <span style="direction:ltr;unicode-bidi:embed">${esc(r.file?.fileName||'')}</span> (${wb.worksheets.length} شيت)</div>
        </div>
        <div class="subhead" style="margin-top:0;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <span>${r.reviewState==='SENT' ? '🖋️ الكشف بعد اكتمال الاعتمادات والتوقيعات — نفس النسخة اللي وصلت جوجل شيت' : (r.reviews||[]).some(x=>x.revision===r.revision&&x.decision!=='REJECTED') ? '🖋️ الكشف بتوقيعات اللي اعتمدوا لحد دلوقتي' : '📄 الكشف كما بعته المهندس'} (${wb.worksheets.length} شيت)</span>
          <span class="xl-tools">
            <button type="button" class="xl-tool" onclick="aprZoom(-0.15)">➖</button>
            <button type="button" class="xl-tool" id="apr-xl-zoom-label" onclick="aprZoomReset()">100%</button>
            <button type="button" class="xl-tool" onclick="aprZoom(0.15)">➕</button>
            <button type="button" class="xl-tool" onclick="aprFull()">⛶</button>
          </span>
        </div>
        <div class="xl-wrap"><div id="apr-xl-zoom">${sheetsHtml}</div></div>
      </div>
      <div class="modal-actions">${acts}</div>
    </div>`;
  ov.style.display='flex'; document.body.classList.add('modal-open');
  ov.onclick=e=>{ if(e.target===ov) aprClosePreview(); };
  // تمييز السطور المشطوبة في الجدول نفسه (الملف جاي من السيرفر بالخط الأحمر، وده تأكيد بصري في المعاينة)
  const tables=ov.querySelectorAll('#apr-xl-zoom table.xl-preview');
  struck.forEach(x=>{ const t=tables[Number(x.sheetIndex)]; const tr=t && t.rows[Number(x.row)-1]; if(tr) tr.classList.add('xl-struck'); });
  edits.forEach(x=>{ const t=tables[Number(x.sheetIndex)]; const tr=t && t.rows[Number(x.row)-1]; if(tr) tr.classList.add('xl-edited'); });
  _aprZoom=1; aprZoom(0);
}
// سطور البيانات في ورقة (نفس تخطيط buildApprovedSheet/buildEquipmentSheet): التاريخ عمود 13 + إجمالي (عمالة عمود 8 / معدات المدة عمود 7)
function aprDataRows(ws, kind){
  const eq = kind==='equipment';
  const cv=(r,c)=>{ let v=ws.getCell(r,c).value; if(v&&typeof v==='object'){ v = v.richText ? v.richText.map(t=>t.text).join('') : (v.result!==undefined ? v.result : (v.text||'')); } return v==null?'':String(v); };
  // وصف السطر لازم يحدد السجل بالظبط: الملف فيه ورقة لكل مقاول (ومكان) — فبناخد المقاول والمكان من راس نفس الورقة
  // (عمالة: المقاول صف 3 عمود 10، الموقع صف 4 عمود 10 · معدات: المقاول صف 3 عمود 10، المعدة صف 3 عمود 4)
  const contractor=cv(3,10), where= eq ? cv(3,4) : cv(4,10);
  const who=[contractor, where].filter(Boolean).join(' · ');
  const out=[];
  for(let r=8; r<=(eq?12:14); r++){
    const d=cv(r,13), val=cv(r, eq?7:8);
    if(!d || !val) continue;
    const place = eq ? cv(r,10) : ''; // المعدات: المكان في السطر نفسه
    out.push({ row:r, label: (cv(r,12)+' '+d+(who?' — '+who:'')+(place?' · '+place:'')+' — '+(eq ? val.replace(/\u200F/g,'')+' ساعة' : fmt(Number(val)||0)+' ج.م')).slice(0,190) });
  }
  return out;
}
// تمييز سطر في جدول المعاينة (أزرق) — من قايمة السطور، وقبل فتح نافذة التعديل/الشطب
function aprRowTr(sheetIndex, row){
  const t=document.querySelectorAll('#apr-xl-zoom table.xl-preview')[sheetIndex];
  return t ? t.rows[row-1] : null;
}
function aprRowClick(ev, sheetIndex, row){ if(ev.target.closest('button')) return; aprRowFocus(sheetIndex, row, true); }
function aprRowBlur(){ document.querySelectorAll('#apr-xl-zoom tr.xl-target').forEach(tr=>tr.classList.remove('xl-target')); }
function aprRowFocus(sheetIndex, row, scroll){
  aprRowBlur();
  const tr=aprRowTr(sheetIndex, row); if(!tr) return;
  tr.classList.add('xl-target');
  if(scroll) tr.scrollIntoView({behavior:'smooth', block:'center'});
}
// نسخة من السطر نفسه (بعناوين الأعمدة) بتظهر فوق نافذة التعديل/الشطب — المعاينة بتتقفل فبناخدها قبل القفل
function aprRowSnippet(sheetIndex, row){
  const t=document.querySelectorAll('#apr-xl-zoom table.xl-preview')[sheetIndex];
  const tr=t && t.rows[row-1], head=t && t.rows[6];
  if(!tr) return '';
  const clone=tr.cloneNode(true); clone.classList.remove('xl-struck','xl-edited'); clone.classList.add('xl-target');
  return '<div class="apr-snip-title">📍 السطر المختار:</div><div class="xl-wrap apr-snip"><table class="xl-preview">'+(head?head.outerHTML:'')+clone.outerHTML+'</table></div>';
}
function aprRowReject(id, sheetIndex, row, label){
  const snip=aprRowSnippet(sheetIndex, row);
  aprClosePreview(); // نافذة القرار (#apr-modal) بتتغطى بمعاينة الملف لو فضلت مفتوحة — بنقفلها ونعيد فتحها بعد الحفظ
  _aprPending={id, decision:'ROW_REJECT', sheetIndex, row, label};
  aprOpenModal('#C62828','✕ شطب سطر من الكشف', 'السطر: '+label+'\n\nالسطر هيتشطب بالأحمر ويتشال من إجمالي الورقة، والكشف يكمّل اعتماده بدونه. المهندس هيشوف السبب. مفيش إلغاء للشطب بعد الحفظ. لو شطبت كل السطور الكشف كله يترفض ويرجع للمهندس.', '✕ شطب', '#C62828', true);
  if(snip) document.getElementById('apr-modal-body').insertAdjacentHTML('afterbegin', snip);
}
// ── تعديل سطر (مدير المشروع بس): العدد/السعر/البيان/الخصم على — بديل الشطب، بسبب إلزامي ──
let _aprEditPrefill=null;
function aprRowEdit(id, sheetIndex, row, label){
  const ws=_aprPreviewWb && _aprPreviewWb.worksheets[sheetIndex];
  if(!ws){ showToast('⚠ تعذر قراءة السطر', true); return; }
  const cv=(r,c)=>{ let v=ws.getCell(r,c).value; if(v&&typeof v==='object'){ v = v.richText ? v.richText.map(t=>t.text).join('') : (v.result!==undefined ? v.result : (v.text||'')); } return v==null?'':String(v); };
  const qtyText=cv(row,11);
  const multi=qtyText.includes('\n');
  const firstLine=(multi?qtyText.split('\n')[0]:qtyText).replace(/‏/g,'').trim();
  const m=firstLine.match(/^([\d.]+)\s*(.*)$/);
  const qty=m?Number(m[1]):null;
  const qtyType=(m&&m[2].trim())||'يومية';
  const priceRaw=ws.getCell(row,9).value;
  const price=typeof priceRaw==='number'?priceRaw:null;
  // خانة الملاحظات جاية من السيرفر وممكن يكون فيها سطور تعديل/رفض سابقة اتضافت للعرض — بنشيلها عشان نبدأ من البيان الحقيقي
  const notes=cv(row,3).split('\n').filter(l=>!/^✏️ معدّل|^❌ مرفوض/.test(l.trim())).join('\n');
  const deduct=cv(row,2);
  const snip=aprRowSnippet(sheetIndex, row);
  aprClosePreview();
  _aprEditPrefill={qty, price, notes, deduct};
  let ov=document.getElementById('apr-edit-ov');
  if(!ov){ ov=document.createElement('div'); ov.id='apr-edit-ov'; ov.className='modal-overlay'; document.body.appendChild(ov); }
  const total0=(qty!=null && price!=null) ? Math.round(qty*price*100)/100 : 0;
  ov.innerHTML=`
    <div class="modal-box" role="dialog" aria-modal="true">
      <div class="modal-head">✏️ تعديل سطر — ${esc(label)}</div>
      <div class="modal-body">
        ${snip}
        ${multi ? '<div class="hint-box">السطر فيه أكتر من سجل — العدد والسعر مش قابلين للتعديل</div>' : `
        <div class="field"><label>العدد (${esc(qtyType)})</label><input type="number" id="are-qty" step="0.25" value="${qty!=null?qty:''}"></div>
        <div class="field"><label>سعر الوحدة</label><input type="number" id="are-price" step="0.01" value="${price!=null?price:''}"></div>
        <div class="field"><label>الإجمالي الجديد</label><div id="are-total" style="font-weight:800">${fmt(total0)} ج.م</div></div>
        `}
        <div class="field"><label>بيان الأعمال</label><textarea id="are-notes" rows="2">${esc(notes)}</textarea></div>
        <div class="field"><label>بالخصم على</label><input type="text" id="are-deduct" value="${esc(deduct)}"></div>
        <div class="field"><label>سبب التعديل (إلزامي)</label><textarea id="are-note" rows="2" placeholder="اكتب سبب التعديل..."></textarea></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-gold btn-inline" id="apr-edit-save" onclick="aprRowEditSave(${jsArg(id)},${sheetIndex},${row},${jsArg(label)})">💾 حفظ التعديل</button>
        <button class="btn btn-ghost btn-inline" onclick="aprRowEditCancel(${jsArg(id)})">إلغاء</button>
      </div>
    </div>`;
  ov.style.display='flex'; document.body.classList.add('modal-open');
  ov.onclick=e=>{ if(e.target===ov) aprRowEditCancel(id); };
  if(!multi){
    const upd=()=>{ const q=Number(document.getElementById('are-qty').value)||0; const p=Number(document.getElementById('are-price').value)||0; document.getElementById('are-total').textContent=fmt(Math.round(q*p*100)/100)+' ج.م'; };
    document.getElementById('are-qty').oninput=upd;
    document.getElementById('are-price').oninput=upd;
  }
}
function aprCloseEditModal(){ const ov=document.getElementById('apr-edit-ov'); if(ov) ov.style.display='none'; document.body.classList.remove('modal-open'); _aprEditPrefill=null; }
function aprRowEditCancel(id){ aprCloseEditModal(); aprReview(id); }
async function aprRowEditSave(id, sheetIndex, row, label){
  const note=document.getElementById('are-note').value.trim();
  if(!note){ showToast('⚠ اكتب سبب التعديل', true); return; }
  const pre=_aprEditPrefill||{};
  const body={sheetIndex, row, label, note};
  const qtyEl=document.getElementById('are-qty'), priceEl=document.getElementById('are-price');
  if(qtyEl){ const q=Number(qtyEl.value); if(qtyEl.value!=='' && q!==pre.qty) body.qty=q; }
  if(priceEl){ const p=Number(priceEl.value); if(priceEl.value!=='' && p!==pre.price) body.price=p; }
  const notes=document.getElementById('are-notes').value;
  if(notes!==(pre.notes||'')) body.notes=notes;
  const deduct=document.getElementById('are-deduct').value;
  if(deduct!==(pre.deduct||'')) body.deduct=deduct;
  if(body.qty===undefined && body.price===undefined && body.notes===undefined && body.deduct===undefined){
    showToast('⚠ مفيش تغيير', true); return;
  }
  const btn=document.getElementById('apr-edit-save'); if(btn){ btn.disabled=true; btn.textContent='⏳ جاري الحفظ...'; }
  try{
    await api('POST','/api/approvals/'+id+'/rows/edit', body);
    aprCloseEditModal();
    showToast('✏️ اتعدّل السطر');
    await renderApprovals();
    aprReview(id);
  }catch(e){
    if(btn){ btn.disabled=false; btn.textContent='💾 حفظ التعديل'; }
    showToast('⚠ '+(e.message||'تعذر حفظ التعديل'), true);
  }
}
let _aprZoom=1;
function aprZoom(d){ _aprZoom=Math.min(2,Math.max(0.4,Math.round((_aprZoom+d)*100)/100)); const el=document.getElementById('apr-xl-zoom'); if(el) el.style.zoom=_aprZoom; const l=document.getElementById('apr-xl-zoom-label'); if(l) l.textContent=Math.round(_aprZoom*100)+'%'; }
function aprZoomReset(){ _aprZoom=1; aprZoom(0); }
function aprFull(){ const box=document.querySelector('#apr-preview-ov .modal-box'); if(box) box.classList.toggle('fullscreen'); }
function aprClosePreview(){ const ov=document.getElementById('apr-preview-ov'); if(ov){ ov.style.display='none'; const box=ov.querySelector('.modal-box'); if(box) box.classList.remove('fullscreen'); } document.body.classList.remove('modal-open'); }
function aprTip(k){
  const t=APR_TIPS[k];
  aprOpenModal('#173058', t[0]+' — يعني إيه؟', t[1], null, false);
}
let _aprPending=null;
function aprAsk(id, decision){
  const r=_aprRows.find(x=>String(x.id)===String(id)); if(!r) return;
  _aprPending={id, decision};
  // "آخر معتمد" و"معلّق" بيتحسبوا في السيرفر لكل كشف على حدة (سلسلة صاحب الكشف مش سلسلة عامة)
  const chain=Array.isArray(r.chain)?r.chain:[];
  const isStuck=!!r.isStuck; // المستوى الحالي خرج من سلسلة صاحب الكشف — الأدمن بس يقدر يحرّكه
  const isLast=!!r.isLast;
  if(decision==='APPROVED'){
    if(isStuck) aprOpenModal('#8A6D1D','⚠ الكشف واقف عند مستوى خرج من سلسلته','المستوى "'+(r.currentLevel||'')+'" مابقاش في سلسلة اعتماد المهندس ده (درجته أو المعتمدين المسندين له اتغيّروا). الاعتماد هيحرّك الكشف '+(chain.length?('لأول مستوى في سلسلته الحالية ("'+esc(chain[0])+'").'):'ويبعته لجوجل شيت لأنه مفيش معتمدين مسندين له.'),'💾 تحريك الكشف','var(--gold)', false, '#1A2640');
    else if(isLast) aprOpenModal('#1B5E20','✅ إرسال للاعتماد والتوقيع؟','ده آخر اعتماد. الكشف هيتبعت لجوجل شيت للتوقيع النهائي والـ PDF. تأكيد؟','💾 إرسال للتوقيع','#2E7D32');
    else aprOpenModal('#1B5E20','✅ تأكيد الاعتماد؟','الكشف هيتعتمد ويفتح للمعتمد اللي بعده في السلسلة.','💾 اعتماد','#2E7D32');
  }
  if(decision==='APPROVED_NOTES') aprOpenModal('#8A6D1D','📝 اعتماد بملاحظات','اكتب ملاحظتك — الكشف هيكمل للي بعده مع تسجيل الملاحظة:','💾 حفظ الاعتماد بملاحظات','var(--gold)', true, '#1A2640');
  if(decision==='REJECTED') aprOpenModal('#C62828','❌ رفض بملاحظات'+(_aprMyLevel?' (من '+_aprMyLevel+')':''),'هيتم رفض الملف، والمهندس هيشوف "تم الرفض بسبب ملاحظتك" ويعيد إرساله. اكتب سبب الرفض:','🗑 تأكيد الرفض','#C62828', true);
}
function aprOpenModal(bar, title, body, okLabel, okBg, withNote, okColor){
  const b=document.getElementById('apr-modal-box');
  b.style.borderTop='6px solid '+bar;
  const hd=document.getElementById('apr-modal-head'); hd.textContent=title;
  document.getElementById('apr-modal-body').textContent=body;
  const note=document.getElementById('apr-note'); note.style.display=withNote?'block':'none'; note.value='';
  const ok=document.getElementById('apr-modal-ok');
  // مهم: بعد قرار ناجح الزرار كان بيفضل disabled (من "جاري الحفظ") فالنافذة التالية تفتح بزرار باهت مش بيضغط — ده كان سبب "لازم أعمل ريفريش"
  ok.disabled=false;
  if(okLabel){ ok.style.display=''; ok.textContent=okLabel; ok.style.background=okBg||bar; ok.style.color=okColor||'#fff'; ok.style.border='none'; ok.onclick=aprConfirm; }
  else ok.style.display='none';
  document.getElementById('apr-modal').style.display='flex'; document.body.classList.add('modal-open');
}
function aprCloseModal(){ document.getElementById('apr-modal').style.display='none'; document.body.classList.remove('modal-open'); _aprPending=null; const ok=document.getElementById('apr-modal-ok'); if(ok) ok.disabled=false; }
async function aprConfirm(){
  if(!_aprPending) return;
  const {id, decision}=_aprPending;
  const note=document.getElementById('apr-note').value.trim();
  if(decision!=='APPROVED' && !note){ showToast('⚠ اكتب الملاحظة', true); return; }
  const ok=document.getElementById('apr-modal-ok'); ok.disabled=true; ok.textContent='⏳ جاري الحفظ...';
  try{
    if(decision==='ROW_REJECT'){
      const {sheetIndex,row,label}=_aprPending;
      const r=await api('POST','/api/approvals/'+id+'/rows/reject',{sheetIndex,row,label,note});
      aprCloseModal();
      if(r.fullyRejected){ aprClosePreview(); showToast('❌ كل السطور اتشطبت — الكشف اترفض ورجع للمهندس'); await renderApprovals(); return; }
      showToast('✕ اتشطب السطر — الكشف يكمّل بدونه');
      await renderApprovals();
      aprReview(id); // إعادة فتح المعاينة بالملف المشطوب
      return;
    }
    await api('POST','/api/approvals/'+id+'/decide',{decision, note});
    aprCloseModal();
    showToast(decision==='REJECTED'?'❌ اترفض ورجع للمهندس':(decision==='APPROVED_NOTES'?'📝 تم الإعتماد بملاحظات':'✅ تم الإعتماد'));
    renderApprovals();
  }catch(e){ ok.disabled=false; showToast('⚠ '+e.message, true); }
}

/* ═══════════ المخازن (وحدة inventory — أونلاين فقط) ═══════════
   المخزون بيانات مشتركة بين الجميع: القراءة والكتابة من السيرفر مباشرة (مفيش نسخة محلية/مزامنة)،
   والخصم بيحصل على القاعدة بشرط كفاية الكمية — عشان الرقم يبقى واحد صحيح عند الكل في نفس اللحظة. */
let _invItems=[], _invUnits=[], _invCats=[], _invLines=[], _invEditId=null, _invCatFilter='';
// التنقل بين أقسام المخازن (تبويبات فرعية بدل السكرول الطويل)
function invSwitchTab(name){
  ['stock','request','issues','purchases'].forEach(k=>{
    const sec=document.getElementById('inv-sec-'+k); if(sec) sec.style.display = k===name?'':'none';
    const btn=document.getElementById('inv-stab-'+k); if(btn) btn.classList.toggle('active', k===name);
  });
  if(name==='issues') renderInvIssues();
  if(name==='purchases') renderInvPurchases();
}
const INV_ISSUE_STATUS={
  SUBMITTED:{t:'⏳ بانتظار الاعتماد',c:'var(--warn-fg)',bg:'var(--warn-bg)'},
  APPROVED:{t:'👍 معتمد — بانتظار الصرف',c:'var(--navy-text)',bg:'var(--info-bg)'},
  FULFILLED:{t:'✅ تم الصرف',c:'var(--ok-fg)',bg:'var(--ok-bg)'},
  REJECTED:{t:'❌ مرفوض',c:'var(--danger-fg)',bg:'var(--danger-bg)'},
};
const INV_PR_STATUS={OPEN:{t:'🛒 مطلوب شراؤه',c:'var(--warn-fg)',bg:'var(--warn-bg)'}, PURCHASED:{t:'✅ تم الشراء',c:'var(--ok-fg)',bg:'var(--ok-bg)'}, CANCELLED:{t:'✕ ملغي',c:'var(--muted)',bg:'var(--input)'}};
function invQty(v){ const n=Number(v); return n.toLocaleString('ar-EG',{maximumFractionDigits:2}); }
function invItem(id){ return _invItems.find(i=>String(i.id)===String(id)); }
function invLow(i){ return Number(i.minQty)>0 && Number(i.qty)<=Number(i.minQty); }

// ── طلبات الإيجار — طلب معدات/عمالة من المهندس + اعتماد مدير المشروع (وحدة قابلة للتفعيل، أونلاين فقط) ──
let _rrContractors=[], _rrPlaces=[], _rrRequests=[], _rrStatusFilter='';
const RR_RESOURCE_LABEL={EQUIPMENT:'🚜 معدة', LABOR:'👷 عمالة'};
const RR_STATUS_LABEL={
  PENDING:{t:'⏳ معلّق', c:'var(--warn-fg)', bg:'var(--warn-bg)'},
  APPROVED:{t:'✅ معتمد', c:'var(--ok-fg)', bg:'var(--ok-bg)'},
  APPROVED_NOTES:{t:'📝 معتمد بملاحظات', c:'var(--navy-text)', bg:'var(--info-bg)'},
  REJECTED:{t:'⛔ مرفوض', c:'var(--danger-fg)', bg:'var(--danger-bg)'},
};
function rrCanDecide(){ return isAdmin() || isProjectManager(); }
// بادج "متطابق" في تاب السركي — لو السطر مربوط بطلب فعلي (rentRequestId) أو مطابق له بالتاريخ/المقاول/المكان
function rrMatchFor(r){
  if(r.rentRequestId!=null){ return _rrApprovedCache.find(x=>String(x.id)===String(r.rentRequestId))||null; }
  return _rrApprovedCache.find(x=>x.date===r.date && x.contractor===r.contractor && x.place===r.place)||null;
}
async function rrLoadRefData(){
  const [ctr, pl]=await Promise.all([api('GET','/api/contractors'), api('GET','/api/places')]);
  _rrContractors=ctr.data; _rrPlaces=pl.data;
  const cSel=document.getElementById('rr-contractor'), pSel=document.getElementById('rr-place');
  if(cSel){ const v=cSel.value; cSel.innerHTML='<option value="">-- اختر المقاول / المورد --</option>'+_rrContractors.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join(''); if(v) cSel.value=v; }
  if(pSel){ const v=pSel.value; pSel.innerHTML='<option value="">-- اختر المكان --</option>'+_rrPlaces.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join(''); if(v) pSel.value=v; }
}
function rrSetStatusFilter(status){
  _rrStatusFilter=status;
  document.querySelectorAll('#rr-status-filter .inv-cat').forEach(b=>b.classList.toggle('active', b.dataset.status===status));
  rrRenderList();
}
async function renderRentRequests(){
  const list=document.getElementById('rr-list'); if(!list) return;
  if(!getAccessToken()||!navigator.onLine){ list.innerHTML='<div class="home-empty">طلبات الإيجار بيانات حية — محتاج اتصال بالنت</div>'; return; }
  try{
    await rrLoadRefData();
    const q=await api('GET','/api/rent-requests');
    _rrRequests=q.data;
    rrRenderList();
  }catch(e){ list.innerHTML='<div class="home-empty">⚠ '+esc(e.message||'تعذر التحميل')+'</div>'; }
}
function rrRenderList(){
  const list=document.getElementById('rr-list'); if(!list) return;
  let rows=_rrRequests.filter(r=>!_rrStatusFilter||r.status===_rrStatusFilter);
  if(!rrShowAll){
    const {start,end}=getWeekBounds(rrWeekOffset);
    const s=toYMD(start), e=toYMD(end);
    rows=rows.filter(r=>r.date>=s && r.date<=e);
  }
  const cnt=document.getElementById('rr-count'); if(cnt) cnt.textContent=rows.length+' طلب';
  if(!rows.length){ list.innerHTML='<div class="home-empty">'+(_rrRequests.length?'لا يوجد طلب بالفلتر ده':'لا يوجد طلبات إيجار بعد')+'</div>'; return; }
  // سجل المهندس بقى للعرض بس — القرار (اعتماد/رفض) اتنقل لتاب "اعتماد طلبات الإيجار" المستقل
  list.innerHTML=rows.map(r=>{
    const st=RR_STATUS_LABEL[r.status]||RR_STATUS_LABEL.PENDING;
    const rv=r.reviews||[]; const lastReview=rv[rv.length-1];
    return `<div class="record-card">
      <div class="record-head">
        <div class="record-title"><div class="record-name">${esc(r.requestNo)} · ${RR_RESOURCE_LABEL[r.resourceType]||r.resourceType}</div><div class="record-spec">👷 ${esc(r.contractorName)} · 📍 ${esc(r.placeName)}</div></div>
        <div class="record-side"><span class="badge" style="background:${st.bg};color:${st.c}">${st.t}</span></div>
      </div>
      <div class="record-meta"><span class="badge">📅 ${esc(r.date)} (${esc(r.day)})</span> <span class="badge">${esc(r.qty)} ${esc(r.qtyType)} × ${fmt(r.price)} ج.م</span> <span class="badge">💰 ${fmt(r.total)} ج.م</span></div>
      <div class="record-notes">📝 ${esc(r.statementOfWork)}</div>
      ${lastReview&&lastReview.note?'<div class="record-notes">💬 '+esc(lastReview.note)+'</div>':''}
    </div>`;
  }).join('');
}
function rrValidate(resourceType, date, contractorId, placeId, qty, price, statementOfWork){
  if(!resourceType){ showToast('⚠ اختر نوع المطلوب', true); return false; }
  if(!date){ showToast('⚠ اختر التاريخ', true); return false; }
  if(!contractorId){ showToast('⚠ اختر المقاول / المورد', true); return false; }
  if(!placeId){ showToast('⚠ اختر المكان', true); return false; }
  if(!(qty>0)){ showToast('⚠ أدخل الكمية', true); return false; }
  if(!(price>=0)){ showToast('⚠ أدخل السعر', true); return false; }
  if(!statementOfWork){ showToast('⚠ اكتب بيان الأعمال', true); return false; }
  return true;
}
async function saveRentRequest(){
  const resourceType=document.getElementById('rr-resource-type').value;
  const date=document.getElementById('rr-date').value;
  const day=document.getElementById('rr-day').value;
  const contractorId=document.getElementById('rr-contractor').value;
  const placeId=document.getElementById('rr-place').value;
  const qty=Number(document.getElementById('rr-qty').value);
  const qtyType=document.getElementById('rr-qty-type').value;
  const price=Number(document.getElementById('rr-price').value);
  const statementOfWork=document.getElementById('rr-sow').value.trim();
  if(!rrValidate(resourceType, date, contractorId, placeId, qty, price, statementOfWork)) return;
  try{
    await api('POST','/api/rent-requests',{contractorId, placeId, resourceType, day, date, qty, qtyType, price, statementOfWork});
    showToast('✅ اترسل طلب الإيجار');
    document.getElementById('rr-qty').value=''; document.getElementById('rr-price').value=''; document.getElementById('rr-total').value=''; document.getElementById('rr-sow').value='';
    renderRentRequests();
  }catch(e){ showToast('⚠ '+(e.message||'تعذر إرسال الطلب'), true); }
}
// ── اعتماد طلبات الإيجار — تاب مستقل لمدير المشروع/الأدمن (وحدة rent_approvals، أونلاين فقط) ──
// القرار كان جوّه سجل المهندس نفسه، بقى هنا بس — سجل المهندس (rrRenderList) بقى للعرض بس.
let _raRequests=[], _raStatusFilter='';
function raSetStatusFilter(status){
  _raStatusFilter=status;
  document.querySelectorAll('#ra-status-filter .inv-cat').forEach(b=>b.classList.toggle('active', b.dataset.status===status));
  raRenderList();
}
async function renderRentApprovals(){
  const list=document.getElementById('ra-list'); if(!list) return;
  if(!getAccessToken()||!navigator.onLine){ list.innerHTML='<div class="home-empty">اعتماد طلبات الإيجار بيانات حية — محتاج اتصال بالنت</div>'; return; }
  try{
    const q=await api('GET','/api/rent-requests');
    _raRequests=q.data;
    raRenderList();
  }catch(e){ list.innerHTML='<div class="home-empty">⚠ '+esc(e.message||'تعذر التحميل')+'</div>'; }
}
function raRenderList(){
  const list=document.getElementById('ra-list'); if(!list) return;
  const rows=_raRequests.filter(r=>!_raStatusFilter||r.status===_raStatusFilter);
  const cnt=document.getElementById('ra-count'); if(cnt) cnt.textContent=rows.length+' طلب';
  if(!rows.length){ list.innerHTML='<div class="home-empty">'+(_raRequests.length?'لا يوجد طلب بالفلتر ده':'لا يوجد طلبات إيجار بعد')+'</div>'; return; }
  const canDecide=rrCanDecide();
  // جدول زي شاشة اعتماد المدراء (aprBuildTable): مدير المشروع بيقارن طلبات كتير بسرعة، وصف لكل طلب بيحط كل بيان في عموده والقرار في آخر الصف
  const heads=['التاريخ والوقت','المهندس','رقم الطلب','النوع','المقاول','المكان','تاريخ الشغل','الكمية','السعر','الإجمالي','بيان الأعمال','الإجراء / الحالة'];
  let html='<table class="apr-table"><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>';
  html+=rows.map(r=>{
    const rv=r.reviews||[]; const lastReview=rv[rv.length-1];
    const notesBlock=(lastReview&&lastReview.note)?'<div class="record-notes">💬 '+esc(lastReview.note)+'</div>':'';
    const when=new Date(r.createdAt);
    let actionCell;
    if(canDecide && r.status==='PENDING'){
      actionCell='<div class="apr-acts">'
        + '<button class="apr-a apr-a-ok" onclick="raDecide(\''+r.id+'\',\'APPROVED\')">✅ اعتماد</button>'
        + '<button class="apr-a apr-a-notes" onclick="raDecide(\''+r.id+'\',\'APPROVED_NOTES\')">📝 معتمد بملاحظات</button>'
        + '<button class="apr-a apr-a-rej" onclick="raDecide(\''+r.id+'\',\'REJECTED\')">⛔ رفض</button>'
        + '</div>';
    } else {
      const mod=(r.status==='APPROVED'||r.status==='APPROVED_NOTES')?'apr-ok':(r.status==='REJECTED'?'apr-rej':'apr-lock');
      const t=(RR_STATUS_LABEL[r.status]||RR_STATUS_LABEL.PENDING).t;
      actionCell='<span class="apr-pill '+mod+'">'+esc(t)+'</span>';
    }
    return '<tr>'
      +'<td class="apr-when">'+when.toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit',year:'numeric'})+'<br>'+when.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})+'</td>'
      +'<td class="apr-eng">'+esc(personName(r.user))+'<small>'+esc(r.user?.title||'مهندس')+'</small></td>'
      +'<td>'+esc(r.requestNo)+'</td>'
      +'<td>'+esc(RR_RESOURCE_LABEL[r.resourceType]||r.resourceType)+'</td>'
      +'<td>'+esc(r.contractorName)+'</td>'
      +'<td>'+esc(r.placeName)+'</td>'
      +'<td>'+esc(r.date)+'<br><small>'+esc(r.day)+'</small></td>'
      +'<td>'+esc(r.qty)+' '+esc(r.qtyType)+'</td>'
      +'<td>'+fmt(r.price)+'</td>'
      +'<td>'+fmt(r.total)+'</td>'
      +'<td>'+esc(r.statementOfWork)+'</td>'
      +'<td>'+actionCell+notesBlock+'</td>'
      +'</tr>';
  }).join('');
  html+='</tbody></table>';
  list.innerHTML=html;
}
async function raDecide(id, decision){
  let note;
  if(decision!=='APPROVED'){
    note=prompt(decision==='REJECTED' ? 'سبب الرفض (إلزامي):' : 'الملاحظة (إلزامية):');
    if(note===null) return;
    note=note.trim();
    if(!note){ showToast('⚠ لازم تكتب ملاحظة', true); return; }
  }
  try{
    await api('POST','/api/rent-requests/'+id+'/decide',{decision, note:note||undefined});
    showToast('✅ اتسجل القرار');
    renderRentApprovals();
  }catch(e){ showToast('⚠ '+(e.message||'تعذر تسجيل القرار'), true); }
}

async function renderInventory(){
  const list=document.getElementById('inv-items-list'); if(!list) return;
  if(!getAccessToken()||!navigator.onLine){ list.innerHTML='<div class="home-empty">المخازن بيانات مشتركة حية — محتاج اتصال بالنت</div>'; return; }
  try{
    const [units, cats, items]=await Promise.all([api('GET','/api/inventory/units'), api('GET','/api/inventory/categories'), api('GET','/api/inventory/items')]);
    _invUnits=units.data; _invCats=cats.data; _invItems=items.data;
    invFillUnitSelect(); invFillCatSelect(); invFillItemSelects(); renderInvItems(); renderInvLines();
    renderInvIssues(); renderInvPurchases();
  }catch(e){ list.innerHTML='<div class="home-empty">⚠ '+esc(e.message||'تعذر تحميل المخزون')+'</div>'; }
}
function invFillCatSelect(){
  const sel=document.getElementById('inv-i-cat'); if(!sel) return;
  const cur=sel.value;
  sel.innerHTML=_invCats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if(cur&&_invCats.includes(cur)) sel.value=cur;
}
// شريط الفئات (فلترة سريعة) — بيجمع الفئات المعرفة + أي فئة موجودة فعلًا على الأصناف
function renderInvCats(){
  const el=document.getElementById('inv-cats'); if(!el) return;
  const used=[...new Set(_invItems.map(i=>i.category||'عام'))];
  const cats=used.length>1?used:[];
  if(!cats.length){ el.innerHTML=''; return; }
  if(_invCatFilter&&!cats.includes(_invCatFilter)) _invCatFilter='';
  el.innerHTML='<button class="inv-cat'+(_invCatFilter===''?' active':'')+'" onclick="invSetCat(\'\')">الكل</button>'
    + cats.map(c=>`<button class="inv-cat${_invCatFilter===c?' active':''}" onclick="invSetCat(${jsArg(c)})">${esc(c)}</button>`).join('');
}
function invSetCat(c){ _invCatFilter=decodeURIComponent(c); renderInvItems(); }
function invFillUnitSelect(){
  const sel=document.getElementById('inv-i-unit'); if(!sel) return;
  const cur=sel.value;
  sel.innerHTML=_invUnits.map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join('');
  if(cur&&_invUnits.includes(cur)) sel.value=cur;
}
function invFillItemSelects(){
  const opts=_invItems.map(i=>`<option value="${i.id}">${esc(i.name)} (${esc(i.code)}) — متاح ${invQty(i.qty)} ${esc(i.unit)}</option>`).join('');
  ['inv-req-item','inv-pr-item'].forEach(id=>{
    const sel=document.getElementById(id); if(!sel) return;
    const cur=sel.value;
    sel.innerHTML='<option value="">-- اختار الصنف --</option>'+opts;
    if(cur) sel.value=cur;
  });
}
function renderInvItems(){
  const list=document.getElementById('inv-items-list'); if(!list) return;
  // بطاقات الملخص + النواقص + شريط الفئات
  const lows=_invItems.filter(invLow);
  const tt=document.getElementById('inv-tile-total'); if(tt) tt.textContent=_invItems.length;
  const tk=document.getElementById('inv-tile-ok'); if(tk) tk.textContent=_invItems.length-lows.length;
  const tl=document.getElementById('inv-tile-low'); if(tl) tl.textContent=lows.length;
  const short=document.getElementById('inv-shortages');
  if(short) short.innerHTML=lows.length?'<div class="inv-restock"><div class="t">⚠️ محتاج إعادة طلب</div>'
    + lows.map(i=>`<button class="inv-rchip" onclick="invQuickPurchase(${jsArg(String(i.id))})">🛒 ${esc(i.name)} (متبقي ${invQty(i.qty)})</button>`).join('')+'</div>':'';
  renderInvCats();

  const q=normSearch(document.getElementById('inv-search')?.value||'');
  const rows=_invItems.filter(i=>
    (!_invCatFilter||(i.category||'عام')===_invCatFilter)
    && (!q||normSearch(i.name).includes(q)||normSearch(i.code).includes(q)));
  if(!rows.length){ list.innerHTML='<div class="home-empty">'+(_invItems.length?'لا يوجد صنف بالبحث/الفلتر ده':'المخزن فاضي — أضف أول صنف')+'</div>'; return; }
  const admin=isAdmin();
  list.innerHTML=rows.map(i=>`<div class="inv-item" id="inv-item-${i.id}">
      <div class="inv-item-row">
        <div class="mid">
          <div class="nm">${esc(i.name)}${invLow(i)?' <span class="inv-lowtag">ناقص</span>':''}</div>
          <div class="cd"><span class="chip">${esc(i.code)}</span>${i.category&&i.category!=='عام'?' · '+esc(i.category):''}${Number(i.minQty)>0?' · حد الطلب: '+invQty(i.minQty):''}</div>
        </div>
        <div class="qty ${invLow(i)?'low':'ok'}"><div class="n">${invQty(i.qty)}</div><div class="u">${esc(i.unit)}</div></div>
        ${admin?`<button class="more" onclick="document.getElementById('inv-item-${i.id}').classList.toggle('open')">⋯</button>`:''}
      </div>
      ${admin?`<div class="actions">
        <button class="btn btn-navy btn-inline" onclick="invMoveIn(${jsArg(String(i.id))})">📥 وارد</button>
        <button class="btn btn-ghost btn-inline" onclick="invAdjust(${jsArg(String(i.id))})">🛠 جرد</button>
        <button class="btn btn-ghost btn-inline" onclick="invEditItem(${jsArg(String(i.id))})">✏️ تعديل</button>
      </div>`:''}
    </div>`).join('');
}
// مودال إضافة/تعديل الصنف
function invOpenItemModal(){
  _invEditId=null;
  ['inv-i-code','inv-i-name','inv-i-qty','inv-i-min'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const q=document.getElementById('inv-i-qty'); if(q){ q.disabled=false; q.placeholder='0'; }
  invFillUnitSelect(); invFillCatSelect();
  document.getElementById('inv-item-modal-title').textContent='➕ إضافة صنف جديد';
  document.getElementById('inv-item-save-btn').textContent='💾 إضافة الصنف';
  document.getElementById('inv-item-modal').style.display='flex';
  document.body.classList.add('modal-open');
  setTimeout(()=>document.getElementById('inv-i-name')?.focus(), 50);
}
function invCloseItemModal(){
  _invEditId=null;
  document.getElementById('inv-item-modal').style.display='none';
  document.body.classList.remove('modal-open');
}
// حفظ الصنف (المودال بوضعين: إضافة / تعديل)
async function invSaveItem(){
  const code=document.getElementById('inv-i-code').value.trim();
  const name=document.getElementById('inv-i-name').value.trim();
  const unit=document.getElementById('inv-i-unit').value;
  const category=document.getElementById('inv-i-cat').value||'عام';
  const qty=Number(document.getElementById('inv-i-qty').value)||0;
  const minQty=Number(document.getElementById('inv-i-min').value)||0;
  if(!name){ showToast('⚠ اكتب اسم الصنف', true); return; }
  if(!code){ showToast('⚠ اكتب الكود', true); return; }
  if(!unit){ showToast('⚠ اختار وحدة القياس', true); return; }
  try{
    if(_invEditId) await api('PUT','/api/inventory/items/'+_invEditId,{code,name,unit,category,minQty});
    else await api('POST','/api/inventory/items',{code,name,unit,category,qty,minQty});
    showToast(_invEditId?'✅ اتعدل الصنف':'✅ اتضاف الصنف');
    invCloseItemModal();
    renderInventory();
  }catch(e){ showToast('⚠ '+e.message, true); }
}
function invEditItem(id){
  const i=invItem(id); if(!i) return;
  invOpenItemModal();
  _invEditId=String(i.id);
  document.getElementById('inv-i-code').value=i.code;
  document.getElementById('inv-i-name').value=i.name;
  document.getElementById('inv-i-unit').value=i.unit;
  document.getElementById('inv-i-cat').value=i.category||'عام';
  const q=document.getElementById('inv-i-qty'); q.value=''; q.disabled=true; q.placeholder='بالوارد/الجرد فقط';
  document.getElementById('inv-i-min').value=Number(i.minQty)||'';
  document.getElementById('inv-item-modal-title').textContent='✏️ تعديل: '+i.name;
  document.getElementById('inv-item-save-btn').textContent='💾 حفظ التعديل';
}
// استيراد أصناف من Excel — التعرف على الأعمدة بالاسم (زي استيراد السجلات)، والأكواد الموجودة بتتخطى
async function invImportExcel(input){
  const file=input.files&&input.files[0]; input.value='';
  if(!file) return;
  try{
    await ensureXLSX();
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    const sheet=wb.Sheets[wb.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(sheet,{defval:''});
    if(!rows.length){ showToast('⚠ الشيت فاضي', true); return; }
    // مطابقة مرنة لأسماء الأعمدة
    const pick=(row,keys)=>{ for(const k of Object.keys(row)){ const n=normSearch(k); if(keys.some(x=>n.includes(x))) return String(row[k]).trim(); } return ''; };
    const items=[];
    for(const r of rows){
      const code=pick(r,['كود','code','sku']);
      const name=pick(r,['اسم','صنف','بيان','name','item']);
      const unit=pick(r,['وحد','unit'])||'عدد';
      const category=pick(r,['فئه','فئة','تصنيف','category'])||'عام';
      const qty=Number(pick(r,['كميه','كمية','رصيد','qty','quantity']))||0;
      const minQty=Number(pick(r,['حد','الطلب','min']))||0;
      if(code&&name) items.push({code,name,unit,category,qty,minQty});
    }
    if(!items.length){ showToast('⚠ مفيش صفوف فيها كود واسم — راجع أسماء الأعمدة', true); return; }
    if(!confirm('هيتم استيراد '+items.length+' صنف (الأكواد الموجودة هتتخطى) — نكمل؟')) return;
    const r=(await api('POST','/api/inventory/items/import',{items})).data;
    let msg='✅ اتضاف '+r.added+' صنف';
    if(r.skipped) msg+=' · اتخطى '+r.skipped+' (موجودين)';
    if(r.failed&&r.failed.length) msg+=' · فشل '+r.failed.length;
    showToast(msg);
    if(r.failed&&r.failed.length) alert('صفوف فشلت:\n'+r.failed.map(f=>f.code+': '+f.reason).join('\n'));
    renderInventory();
  }catch(e){ showToast('⚠ '+(e.message||'فشل قراءة الملف'), true); }
}
async function invAddCategory(){
  const c=prompt('اكتب اسم الفئة الجديدة (مثال: عزل):'); if(c===null) return;
  const t=c.trim(); if(!t){ showToast('⚠ اكتب اسم الفئة', true); return; }
  try{
    const r=await api('POST','/api/inventory/categories',{category:t});
    _invCats=r.data; invFillCatSelect(); document.getElementById('inv-i-cat').value=t;
    showToast('✅ اتضافت الفئة');
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function invAddUnit(){
  const u=prompt('اكتب وحدة القياس الجديدة (مثال: برميل):'); if(u===null) return;
  const t=u.trim(); if(!t){ showToast('⚠ اكتب اسم الوحدة', true); return; }
  try{
    const r=await api('POST','/api/inventory/units',{unit:t});
    _invUnits=r.data; invFillUnitSelect(); document.getElementById('inv-i-unit').value=t;
    showToast('✅ اتضافت الوحدة');
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function invMoveIn(id){
  const i=invItem(id); if(!i) return;
  const q=prompt('كمية الوارد الجديد من "'+i.name+'" ('+i.unit+'):'); if(q===null) return;
  const qty=Number(q); if(!(qty>0)){ showToast('⚠ اكتب كمية صحيحة أكبر من صفر', true); return; }
  try{
    await api('POST','/api/inventory/items/'+i.id+'/move',{type:'IN', qty, note:'وارد'});
    showToast('✅ اتسجل وارد '+invQty(qty)+' '+i.unit);
    renderInventory();
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function invAdjust(id){
  const i=invItem(id); if(!i) return;
  const q=prompt('جرد "'+i.name+'": اكتب العدد الفعلي الموجود على الرف دلوقتي ('+i.unit+') — المسجل حاليًا '+invQty(i.qty)+':'); if(q===null) return;
  const qty=Number(q); if(!(qty>=0)){ showToast('⚠ اكتب عدد صحيح', true); return; }
  const note=prompt('سبب التسوية (إلزامي — مثال: هالك/كسر/عجز جرد):'); if(note===null) return;
  if(!note.trim()){ showToast('⚠ سبب التسوية إلزامي', true); return; }
  try{
    await api('POST','/api/inventory/items/'+i.id+'/move',{type:'ADJUST', qty, note:note.trim()});
    showToast('✅ اتسوت الكمية على '+invQty(qty)+' '+i.unit);
    renderInventory();
  }catch(e){ showToast('⚠ '+e.message, true); }
}
// ── طلب الصرف: بنود مؤقتة ثم إرسال ──
function invAddLine(){
  const sel=document.getElementById('inv-req-item'); const qtyEl=document.getElementById('inv-req-qty');
  const i=invItem(sel.value);
  if(!i){ showToast('⚠ اختار الصنف', true); return; }
  const qty=Number(qtyEl.value);
  if(!(qty>0)){ showToast('⚠ اكتب الكمية', true); return; }
  const already=_invLines.filter(l=>String(l.itemId)===String(i.id)).reduce((s,l)=>s+l.qty,0);
  if(qty+already>Number(i.qty)){
    // قرار صاحب المشروع: الكمية غير كافية → توجيه لطلب شراء أو التواصل مع مدير التنفيذ
    if(confirm('⚠ الكمية غير كافية من "'+i.name+'" — المتاح '+invQty(i.qty)+' '+i.unit+'.\n\nتعمل طلب شراء بالكمية دي بدلها؟ (أو الغي وتواصل مع مدير التنفيذ)')){
      api('POST','/api/inventory/purchase-requests',{itemId:String(i.id), qtyRequested:qty, note:'الكمية كانت غير كافية لطلب صرف'})
        .then(()=>{ showToast('🛒 اتعمل طلب شراء — هيظهر لمدير التنفيذ'); renderInvPurchases(); })
        .catch(e=>showToast('⚠ '+e.message, true));
    }
    return;
  }
  _invLines.push({itemId:String(i.id), name:i.name, code:i.code, unit:i.unit, qty});
  qtyEl.value=''; sel.value='';
  renderInvLines();
}
function invRemoveLine(idx){ _invLines.splice(idx,1); renderInvLines(); }
function renderInvLines(){
  const el=document.getElementById('inv-req-lines'); if(!el) return;
  el.innerHTML=_invLines.length?_invLines.map((l,idx)=>`<div class="setting-item">
      <div class="setting-name" style="font-size:12px">${esc(l.name)} — <b>${invQty(l.qty)} ${esc(l.unit)}</b></div>
      <button class="btn-sm-del" onclick="invRemoveLine(${idx})">✕</button>
    </div>`).join(''):'';
}
async function invSubmitIssue(){
  if(!_invLines.length){ showToast('⚠ أضف صنف واحد على الأقل', true); return; }
  const note=document.getElementById('inv-req-note').value.trim();
  try{
    await api('POST','/api/inventory/issue-requests',{lines:_invLines.map(l=>({itemId:l.itemId, qty:l.qty})), note});
    _invLines=[]; renderInvLines(); document.getElementById('inv-req-note').value='';
    showToast('📤 اتبعت طلب الصرف — بانتظار الاعتماد');
    renderInvIssues();
  }catch(e){ alert('⚠ '+e.message); renderInventory(); }
}
// ── قائمة طلبات الصرف ──
async function renderInvIssues(){
  const el=document.getElementById('inv-issue-list'); if(!el) return;
  try{
    const rows=(await api('GET','/api/inventory/issue-requests')).data;
    const admin=isAdmin();
    const pending=rows.filter(r=>r.status==='SUBMITTED').length;
    const cnt=document.getElementById('inv-issue-count'); if(cnt) cnt.textContent=pending&&admin?pending+' بانتظار الاعتماد':'';
    const dot=document.getElementById('inv-issue-dot');
    if(dot){ dot.style.display=(admin&&pending)?'':'none'; dot.textContent=pending; }
    if(!rows.length){ el.innerHTML='<div class="home-empty">لا توجد طلبات صرف بعد</div>'; return; }
    el.innerHTML=rows.map(r=>{
      const st=INV_ISSUE_STATUS[r.status]||INV_ISSUE_STATUS.SUBMITTED;
      const lines=(r.lines||[]).map(l=>esc(l.item?.name||'')+' × '+invQty(l.qty)+' '+esc(l.item?.unit||'')).join('<br>');
      return `<div class="setting-item" style="flex-direction:column;align-items:stretch;gap:6px">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <div style="min-width:0;flex:1">
            ${admin?'<div class="setting-name" style="font-size:12px">👤 '+esc(r.user?.email||'')+(r.user?.title?' — '+esc(r.user.title):'')+'</div>':''}
            <div class="setting-sub" style="line-height:1.9">${lines}</div>
            ${r.note?'<div class="setting-sub">📝 '+esc(r.note)+'</div>':''}
            ${r.reviewNote?'<div class="setting-sub" style="color:var(--danger-fg)">💬 '+esc(r.reviewNote)+'</div>':''}
            <div class="setting-sub">${new Date(r.createdAt).toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'})}</div>
          </div>
          <span class="pill" style="background:${st.bg};color:${st.c};font-size:10.5px;padding:3px 8px;border-radius:999px;white-space:nowrap;font-weight:800">${st.t}</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${admin&&r.status==='SUBMITTED'?'<button class="btn btn-navy btn-inline" onclick="invReviewIssue(\''+r.id+'\',\'APPROVED\')">✅ اعتماد</button><button class="btn btn-danger btn-inline" onclick="invReviewIssue(\''+r.id+'\',\'REJECTED\')">❌ رفض</button>':''}
          ${admin&&r.status==='APPROVED'?'<button class="btn btn-gold btn-inline" onclick="invFulfill(\''+r.id+'\')">📦 تم الصرف — اخصم من المخزون</button>':''}
          ${!admin&&r.status==='SUBMITTED'?'<button class="btn btn-danger btn-inline" onclick="invDeleteIssue(\''+r.id+'\')">🗑 حذف الطلب</button>':''}
        </div>
      </div>`;
    }).join('');
  }catch(e){ el.innerHTML='<div class="home-empty">⚠ تعذر تحميل الطلبات</div>'; }
}
async function invReviewIssue(id, status){
  let reviewNote;
  if(status==='REJECTED'){ reviewNote=prompt('سبب الرفض (هيظهر للمهندس):'); if(reviewNote===null) return; }
  try{
    await api('PATCH','/api/inventory/issue-requests/'+id+'/review',{status, reviewNote:reviewNote||undefined});
    showToast(status==='APPROVED'?'✅ تم الاعتماد — اضغط "تم الصرف" لما الصرف يحصل فعليًا':'❌ اترفض');
    renderInvIssues();
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function invFulfill(id){
  if(!confirm('تأكيد الصرف الفعلي؟ الكميات هتتخصم من المخزون فورًا.')) return;
  try{
    await api('POST','/api/inventory/issue-requests/'+id+'/fulfill');
    showToast('📦 تم الصرف واتخصمت الكميات');
    renderInventory();
  }catch(e){ alert('⚠ '+e.message); renderInventory(); }
}
async function invDeleteIssue(id){
  if(!confirm('حذف طلب الصرف؟')) return;
  try{ await api('DELETE','/api/inventory/issue-requests/'+id); showToast('🗑 اتحذف'); renderInvIssues(); }
  catch(e){ showToast('⚠ '+e.message, true); }
}
// ── طلبات الشراء ──
async function renderInvPurchases(){
  const el=document.getElementById('inv-purchase-list'); if(!el) return;
  try{
    const rows=(await api('GET','/api/inventory/purchase-requests')).data;
    const admin=isAdmin();
    if(!rows.length){ el.innerHTML='<div class="home-empty">لا توجد طلبات شراء</div>'; return; }
    el.innerHTML=rows.map(r=>{
      const st=INV_PR_STATUS[r.status]||INV_PR_STATUS.OPEN;
      return `<div class="setting-item" style="flex-direction:column;align-items:stretch;gap:6px">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <div style="min-width:0;flex:1">
            <div class="setting-name" style="font-size:12px">${esc(r.item?.name||'')} (${esc(r.item?.code||'')})</div>
            <div class="setting-sub">مطلوب: <b>${invQty(r.qtyRequested)} ${esc(r.item?.unit||'')}</b> · كان بالمخزن وقت الطلب: ${invQty(r.qtyAtRequest)} · المتاح دلوقتي: ${invQty(r.item?.qty||0)}</div>
            ${r.note?'<div class="setting-sub">📝 '+esc(r.note)+'</div>':''}
            <div class="setting-sub">👤 ${esc(r.byUser?.email||'')} · ${new Date(r.createdAt).toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'})}</div>
          </div>
          <span class="pill" style="background:${st.bg};color:${st.c};font-size:10.5px;padding:3px 8px;border-radius:999px;white-space:nowrap;font-weight:800">${st.t}</span>
        </div>
        ${admin&&r.status==='OPEN'?`<div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-navy btn-inline" onclick="invSetPurchase('${r.id}','PURCHASED')">✅ تم الشراء</button>
          <button class="btn btn-ghost btn-inline" onclick="invSetPurchase('${r.id}','CANCELLED')">✕ إلغاء</button>
        </div>`:''}
      </div>`;
    }).join('');
  }catch(e){ el.innerHTML='<div class="home-empty">⚠ تعذر تحميل طلبات الشراء</div>'; }
}
function invQuickPurchase(id){
  const i=invItem(id); if(!i) return;
  invSwitchTab('purchases');
  document.getElementById('inv-pr-item').value=String(i.id);
  setTimeout(()=>{ const q=document.getElementById('inv-pr-qty'); q.focus(); q.scrollIntoView({behavior:'smooth', block:'center'}); }, 100);
}
async function invSubmitPurchase(){
  const sel=document.getElementById('inv-pr-item'); const i=invItem(sel.value);
  if(!i){ showToast('⚠ اختار الصنف', true); return; }
  const qty=Number(document.getElementById('inv-pr-qty').value);
  if(!(qty>0)){ showToast('⚠ اكتب الكمية', true); return; }
  try{
    await api('POST','/api/inventory/purchase-requests',{itemId:String(i.id), qtyRequested:qty, note:''});
    sel.value=''; document.getElementById('inv-pr-qty').value='';
    showToast('🛒 اتعمل طلب الشراء — بالمخزن حاليًا '+invQty(i.qty)+' '+i.unit);
    renderInvPurchases();
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function invSetPurchase(id, status){
  if(status==='PURCHASED'&&!confirm('تم الشراء فعلًا؟ (لما البضاعة توصل سجّلها "وارد" على الصنف من شاشة المخزون)')) return;
  try{
    await api('PATCH','/api/inventory/purchase-requests/'+id,{status});
    showToast(status==='PURCHASED'?'✅ اتعلم تم الشراء — سجل الوارد لما يوصل':'✕ اتلغى');
    renderInvPurchases();
  }catch(e){ showToast('⚠ '+e.message, true); }
}

const SUB_STATUS={SUBMITTED:{t:'⏳ مُرسَل — بانتظار المراجعة',c:'var(--warn-fg)',bg:'var(--warn-bg)'}, APPROVED:{t:'✅ معتمد',c:'var(--ok-fg)',bg:'var(--ok-bg)'}, REJECTED:{t:'❌ مرفوض — يُعاد',c:'var(--danger-fg)',bg:'var(--danger-bg)'}};
/* ── تصنيف الكشف: هو محتاج شغل من المهندس، ولا ماشي، ولا خلص؟ ──
   need = رجع له (رفض من المديرين أو من DC في الشيت) → لازم يعدّل ويعيد الإرسال
   prog = ماشي في السلسلة أو عند DC → متابعة بس
   done = معتمد بالكامل ونزل الشيت */
/* ملاحظة DC (عمود E في جوجل شيت) — بلوك بارز مش سطر خافت.
   كانت جوّه قايمة خطوات الشيت بخط 11px رمادي، وهي آخر مرحلة وأهم ملاحظة بتوصل للمهندس.
   لو DC رفض → أحمر (ده سبب الرفض)، غير كده أصفر. */
function dcNotesBox(s){
  // اللايف (s.sheet?.execNotes) أحدث، بس لو فشل النداء آخر مرة بيرجع فاضي — بنرجع للمخزّن (s.dcNote) عشان الملاحظة ما تختفيش
  const note=String(s.sheet?.execNotes||s.dcNote||'').trim();
  if(!note) return '';
  const rejected=String(s.sheet?.status||'').includes('مرفوض');
  const bg=rejected?'var(--danger-bg)':'var(--warn-bg)', fg=rejected?'var(--danger-fg)':'var(--warn-fg)';
  const head=rejected?'⛔ <b>DC رجّع الكشف</b> — السبب:':'📝 <b>ملاحظة من DC:</b>';
  const unseen=s.dcNoteAt && (!s.dcNoteSeenAt || s.dcNoteSeenAt<s.dcNoteAt);
  const seenBtn=unseen?' <button class="btn btn-ghost btn-inline" onclick="markDcNoteSeen(\''+s.id+'\', this)">✔ شفت الملاحظة</button>':'';
  return '<div class="s" style="font-size:11.5px;padding:6px 8px;background:'+bg+';color:'+fg+';border-radius:8px;line-height:1.7">'
    + head+' '+esc(note)+seenBtn+'</div>';
}
function subBucket(s){
  const sh=String(s.sheet?.status||'');
  if(s.reviewState==='RETURNED' || s.status==='REJECTED' || sh.includes('مرفوض')) return 'need';
  if(sh.includes('معتمد بالكامل')) return 'done';
  return 'prog';
}
/* شريط السلسلة المصغّر — نفس اللي بيشوفه المدير في أعمدة تاب الاعتمادات، بس في سطر واحد للمهندس.
   ⚠ المستويات الجاية مش معروفة في رد /mine (السيرفر بيرجّع اللي عدّى والمستوى الحالي بس)،
   فبنحط "…" مكانها بدل ما نخمّن سلسلة غلط. آخر خطوة دايمًا DC وحالتها من جوجل شيت. */
function subChainBar(s){
  const rev=Number(s.revision||0);
  const seen=[];
  (s.reviews||[]).forEach(x=>{ if(Number(x.revision)===rev && x.decision!=='REJECTED' && seen.indexOf(x.level)<0) seen.push(x.level); });
  const steps=seen.map(l=>'<span class="sc-step sc-done">✅ '+esc(l)+'</span>');
  if(s.reviewState==='RETURNED'){
    const rej=(s.reviews||[]).filter(x=>x.decision==='REJECTED').pop();
    steps.push('<span class="sc-step sc-rej">❌ '+esc(rej?rej.level:'مرفوض')+'</span>');
    steps.push('<span class="sc-step sc-wait">↩ رجع لك</span>');
    return '<div class="sub-chain">'+steps.join('<span class="sc-sep">›</span>')+'</div>';
  }
  if(s.reviewState==='IN_REVIEW'){
    if(s.currentLevel) steps.push('<span class="sc-step sc-now">⏳ '+esc(s.currentLevel)+'</span>');
    steps.push('<span class="sc-step sc-wait" title="ممكن يكون فيه مستويات تانية قبل DC">…</span>');
  }
  const shStat=String(s.sheet?.status||'');
  let dc='<span class="sc-step sc-wait">🖋 DC</span>';
  if(s.reviewState==='SENT'){
    if(shStat.includes('معتمد بالكامل'))   dc='<span class="sc-step sc-done">✅ DC</span>';
    else if(shStat.includes('مرفوض'))      dc='<span class="sc-step sc-rej">❌ DC</span>';
    else                                    dc='<span class="sc-step sc-now">⏳ DC</span>';
  }
  steps.push(dc);
  return '<div class="sub-chain">'+steps.join('<span class="sc-sep">›</span>')+'</div>';
}
function subRow(s, adminView){
  let st=SUB_STATUS[s.status]||SUB_STATUS.SUBMITTED;
  // حالة جوجل شيت الحية بتغلب "بانتظار المراجعة" المحلية
  const shStat=String(s.sheet?.status||'');
  let _fullyApproved=false;
  if(s.status!=='REJECTED'){
    if(shStat.includes('معتمد بالكامل'))      { st={t:'✅ معتمد بالكامل',c:'var(--ok-fg)',bg:'var(--ok-bg)'}; _fullyApproved=true; }
    else if(shStat.includes('مرفوض'))         st={t:'❌ '+shStat,c:'var(--danger-fg)',bg:'var(--danger-bg)'};
  }
  // ── حالة سلسلة اعتمادات المديرين ──
  let rejBox='';
  if(s.reviewState==='IN_REVIEW'){ st={t:'⏳ قيد مراجعة المديرين'+(s.currentLevel?' — مع '+s.currentLevel:''),c:'var(--warn-fg)',bg:'var(--warn-bg)'}; }
  else if(s.reviewState==='RETURNED'){
    const rej=(s.reviews||[]).filter(x=>x.decision==='REJECTED').pop();
    st={t:'❌ مرفوض — أعد الإرسال',c:'var(--danger-fg)',bg:'var(--danger-bg)'};
    if(rej) rejBox='<div class="s" style="font-size:11.5px;color:var(--danger-fg);font-weight:700">❌ تم الرفض من '+esc(rej.level)+(rej.note?' — السبب: '+esc(rej.note):'')+'</div>';
  }
  // عدّى المديرين ولسه عند DC: الشارة كانت لسه بتقول "مُرسَل — بانتظار المراجعة" وهي حالة محلية قديمة
  // ومضلّلة — المديرين خلصوا خلاص. دلوقتي بتقول الحقيقة: الكشف عند DC.
  else if(s.reviewState==='SENT' && !shStat.includes('معتمد بالكامل') && !shStat.includes('مرفوض')){
    st={t:'🖋 عند DC — التوقيع والـ PDF',c:'var(--warn-fg)',bg:'var(--warn-bg)'};
  }
  // ملاحظات المعتمدين على النسخة الحالية
  const notes=(s.reviews||[]).filter(x=>x.revision===(s.revision||0) && x.decision==='APPROVED_NOTES' && x.note);
  const notesBox = notes.length
    ? '<div class="s" style="font-size:11.5px;padding:6px 8px;background:var(--warn-bg);color:var(--warn-fg);border-radius:8px;line-height:1.7">'
      + notes.map(x=>'📝 <b>'+esc(x.level)+'</b> اعتمد بملاحظة: '+esc(x.note)).join('<br>')+'</div>'
    : '';
  // سطور مشطوبة من المعتمدين (رفض جزئي) في النسخة الحالية
  const struckRows=(s.rowRejections||[]).filter(x=>Number(x.revision)===Number(s.revision||0));
  const struckBox = struckRows.length
    ? '<div class="s" style="font-size:11.5px;padding:6px 8px;background:var(--danger-bg);color:var(--danger-fg);border-radius:8px;line-height:1.7">'
      + struckRows.map(x=>'✕ <b>سطر مشطوب:</b> '+esc(x.label)+' — <b>'+esc(x.level)+'</b>'+(x.note?': '+esc(x.note):'')).join('<br>')
      + (s.reviewState==='IN_REVIEW'||s.reviewState==='SENT' ? '<br><span style="font-weight:600">الكشف كمّل اعتماده من غير السطور دي (اتشالت من الإجمالي).</span>' : '')+'</div>'
    : '';
  // سطور معدّلة من مدير المشروع (بدل الشطب) في النسخة الحالية
  const editedRows=(s.rowEdits||[]).filter(x=>Number(x.revision)===Number(s.revision||0));
  const editBox = editedRows.length
    ? '<div class="s" style="font-size:11.5px;padding:6px 8px;background:var(--warn-bg);color:var(--warn-fg);border-radius:8px;line-height:1.7">'
      + editedRows.map(x=>{
        const bits=[];
        if(x.qtyTo!=null) bits.push('العدد '+esc(x.qtyFrom==null?'—':x.qtyFrom)+'→'+esc(x.qtyTo));
        if(x.priceTo!=null) bits.push('السعر '+esc(x.priceFrom==null?'—':x.priceFrom)+'→'+esc(x.priceTo));
        if(x.totalTo!=null) bits.push('الإجمالي '+esc(x.totalFrom==null?'—':x.totalFrom)+'→'+esc(x.totalTo));
        return '✏️ <b>سطر معدّل:</b> '+esc(x.label)+(bits.length?' — '+bits.join(' · '):'')+' — <b>'+esc(x.level)+'</b>: '+esc(x.note);
      }).join('<br>')+'</div>'
    : '';
  const who = adminView ? '<div class="sub-meta">👤 '+esc(personName(s.user))+(s.user?.displayName?' <span style="direction:ltr;unicode-bidi:embed">'+esc(s.user.email||'')+'</span>':'')+(s.user?.title?' — '+esc(s.user.title):'')+'</div>' : '';
  const bucket=subBucket(s);
  // التفاصيل مطوية افتراضيًا — دي كانت أكتر حاجة بتطوّل الكارت
  const detail = '<div class="sub-meta">أُرسل '+esc(new Date(s.createdAt).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}))+(s.engineerNote?' · 📝 '+esc(s.engineerNote):'')+'</div>'
    + notesBox
    + (s.reviewNote?'<div class="s" style="font-size:11.5px;color:var(--text)">💬 رد المراجعة: '+esc(s.reviewNote)+'</div>':'')
    + (s.reviewState==='SENT'?sheetTimeline(s):'');
  return `<div class="sub-card ${bucket==='need'?'c-need':''}">
    <div class="sub-top">
      <div style="min-width:0;flex:1 1 220px">
        <div class="sub-name">${esc(s.contractorName)}${s.placeName?' · '+esc(s.placeName):''}${s.projectName?' · 🏗 '+esc(s.projectName):''} <span class="apr-rev">rev ${String(s.revision||0).padStart(2,'0')}</span></div>
        <div class="sub-meta">${s.kind==='equipment' ? '🚜 كشف معدات · الشهر '+esc(s.weekStart)+' → '+esc(s.weekEnd)+' · '+s.recordsCount+' يوم تشغيل · '+fmtMinutes(Math.round(Number(s.total)*60))+' ساعة' : 'الأسبوع '+esc(s.weekStart)+' → '+esc(s.weekEnd)+' · '+s.recordsCount+' سجل · '+fmt(s.total)+' ج.م'}</div>
        ${who}
      </div>
      <span class="pill sub-status-pill"${_fullyApproved?` data-cheer-id="${esc(String(s.id))}"`:''} style="background:${st.bg};color:${st.c};font-size:10.5px;padding:3px 8px;border-radius:999px;white-space:normal;max-width:100%;flex:0 1 auto;font-weight:800">${st.t}</span>
    </div>
    ${subChainBar(s)}
    ${rejBox}${struckBox}${editBox}${dcNotesBox(s)}
    <details class="sub-more"><summary>التفاصيل ▾</summary><div class="sub-mbody">${detail}</div></details>
    <div class="sub-acts">
      <button class="btn btn-ghost btn-inline" onclick="downloadSubmission(${jsArg(String(s.id))},${jsArg(s.file?.fileName||'sheet.xlsx')})">⬇️ الملف</button>
      ${!adminView && s.reviewState==='RETURNED' ? '<button class="btn btn-gold btn-inline" onclick="resendSubmission(\''+s.id+'\',\''+(s.kind||'labor')+'\')">🔄 عدّل السركي وأعد الإرسال</button>' : ''}
      ${s.reviewState==='SENT' && s.googleSyncEnabled ? '<button class="btn btn-ghost btn-inline" onclick="refreshDcNotes(\''+s.id+'\', this)" title="بيعيد قراءة حالة الكشف وملاحظة الـDC من شيت الاعتماد">🔄 تحديث لتلقي ملاحظات DC</button>' : ''}
      ${isAdmin() && s.reviewState==='SENT' && !s.gsheetRow && s.googleSyncEnabled && subSentLongAgo(s) ? '<button class="btn btn-ghost btn-inline" onclick="resyncSubmission(\''+s.id+'\', this)" title="أداة إصلاح للأدمن فقط — بترفع الملف تاني لشيت الاعتماد لو الرفع الأول فشل">☁️ إعادة الإرسال للشيت</button>' : ''}
      ${adminView && isAdmin() ? '<button class="btn btn-danger btn-inline" onclick="adminDeleteSubmission(\''+s.id+'\')" title="حذف نهائي من التطبيق (الأدمن فقط)">🗑 حذف</button>' : ''}
    </div>
  </div>`;
}
/* تجميع الكروت في ٣ مجموعات بعناوين وعدّادات. "خلصت" مطوية افتراضيًا
   عشان الكشوف القديمة ما تزحمش اللي محتاج شغل. مجموعة فاضية ما بتظهرش أصلًا. */
function subGroupsHtml(rows, adminView){
  const G=[
    {k:'need', open:true,  t:adminView?'🔴 راجعة للمهندس':'🔴 محتاج منك إجراء', h:adminView?'مرفوضة — عند المهندس عشان يعدّل ويعيد الإرسال':'عدّلها وأعد إرسالها'},
    {k:'prog', open:true,  t:'⏳ في الطريق', h:adminView?'ماشية في الاعتمادات أو عند DC':'ماشية في الاعتمادات — مفيش حاجة مطلوبة منك'},
    {k:'done', open:false, t:'✅ خلصت', h:'اعتمدت بالكامل ونزلت الشيت'},
  ];
  return G.map(g=>{
    const list=rows.filter(r=>subBucket(r)===g.k);
    if(!list.length) return '';
    // ملاحظة DC لسه ما اتشافتش جوّه مجموعة مطوية = ملاحظة مخبّية ورا سهم، وهي بالظبط اللي
    // عايزينها توصل. فالمجموعة بتتفتح لوحدها وبيبان عدّاد أحمر على عنوانها.
    const unseen=list.filter(r=>r.dcNoteAt && (!r.dcNoteSeenAt || r.dcNoteSeenAt<r.dcNoteAt)).length;
    const open=g.open||unseen>0;
    const badge=unseen?'<span class="sub-gcount" style="background:var(--danger-bg);color:var(--danger-fg);font-weight:900" title="ملاحظات من DC لسه ما اتشافتش">📝 '+unseen+'</span>':'';
    return '<details class="sub-group g-'+g.k+'"'+(open?' open':'')+'>'
      + '<summary><span>'+g.t+'</span><span class="sub-gcount">'+list.length+'</span>'+badge
      + '<span class="sub-ghint">'+g.h+'</span><span class="sub-gcaret">▾</span></summary>'
      + '<div class="sub-gbody">'+list.map(r=>subRow(r,adminView)).join('')+'</div></details>';
  }).join('');
}
/* بحث بسيط: المقاول · المكان · تواريخ الأسبوع */
function subMatch(s,q){
  if(!q) return true;
  return ((s.contractorName||'')+' '+(s.placeName||'')+' '+(s.weekStart||'')+' '+(s.weekEnd||'')).toLowerCase().indexOf(q)>=0;
}
// الصفوف بتتحفظ عشان البحث يفلتر من غير طلب جديد للسيرفر مع كل حرف
let _mySubRows=[], _mySubQ='';
function subSearchMine(v){ _mySubQ=String(v||'').trim().toLowerCase(); subPaintMine(); }
function subPaintMine(){
  const el=document.getElementById('my-submissions'); if(!el) return;
  if(!_mySubRows.length){ el.innerHTML='<div class="home-empty">مفيش تسليمات بعد — ابعت أول كشف من زرار "إرسال للاعتماد"</div>'; return; }
  const rows=_mySubRows.filter(r=>subMatch(r,_mySubQ));
  el.innerHTML = rows.length ? subGroupsHtml(rows,false) : '<div class="home-empty">مفيش كشف مطابق للبحث</div>';
  cheerMascotScan();
}
async function renderMySubmissions(){
  const el=document.getElementById('my-submissions'); if(!el) return;
  if(!getAccessToken()||!navigator.onLine){ el.innerHTML='<div class="home-empty">محتاج نت لعرض التسليمات</div>'; return; }
  try{
    _mySubRows=(await api('GET','/api/submissions/mine')).data;
    subPaintMine();
  }catch(e){ el.innerHTML='<div class="home-empty">⚠ تعذر التحميل</div>'; }
}
// ── الفرحة: تطلع من ورا شارة "✅ معتمد بالكامل" ──
// display-only زي باقي الشخصيات. بتفرح **مرة واحدة لكل كشف** — أرقام الكشوف اللي اتفرح لها
// متخزّنة في localStorage، عشان ماتفرحش كل مرة يتفتح تاب التسليمات.
const MASCOT_CHEER_SRC = 'data:image/png;base64,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';
const CHEER_SEEN_KEY = 'cea_cheer_seen';
let _cheerTimer = null;
function cheerSeenGet(){
  try{ const v=localStorage.getItem(CHEER_SEEN_KEY); return v===null ? null : (JSON.parse(v)||[]); }
  catch(e){ return []; }
}
function cheerSeenSet(ids){
  try{ localStorage.setItem(CHEER_SEEN_KEY, JSON.stringify(ids.slice(-300))); }catch(e){}
}
function cheerEnsureCSS(){
  if(document.getElementById('cheer-css')) return;
  const st=document.createElement('style');
  st.id='cheer-css';
  st.textContent = `
/* نفس مبدأ المقاول: الشخصية z-index:0 والشارة z-index:1 بخلفية صلبة، فالجسم بيتخفي وراها */
.sub-top{position:relative}
.sub-status-pill{position:relative;z-index:1}
#cheer-mascot{position:absolute;z-index:0;pointer-events:none;
  animation:cheer-jump .55s cubic-bezier(.34,1.5,.5,1)}
#cheer-mascot img{width:var(--cheer-w,86px);height:auto;display:block;
  filter:drop-shadow(0 4px 10px rgba(0,0,0,.22))}
@keyframes cheer-jump{
  0%{transform:translateY(60%) scale(.9);opacity:0}
  60%{transform:translateY(-6%) scale(1.02);opacity:1}
  100%{transform:translateY(0) scale(1);opacity:1}}
@media (prefers-reduced-motion: reduce){#cheer-mascot{animation:none}}
`;
  document.head.appendChild(st);
}
function cheerHide(){
  try{
    if(_cheerTimer){ clearTimeout(_cheerTimer); _cheerTimer=null; }
    const el=document.getElementById('cheer-mascot');
    if(el) el.remove();
  }catch(e){}
}
// بتتنادى بعد رسم "تسليماتي". بتدوّر على أول كشف اتعتمد بالكامل ولسه ما اتفرحلوش.
function cheerMascotScan(){
  try{
    const pills = Array.prototype.slice.call(document.querySelectorAll('#my-submissions [data-cheer-id]'));
    const all = pills.map(el=>el.getAttribute('data-cheer-id'));
    const seen = cheerSeenGet();
    // أول تشغيل بعد نزول الفيتشر: بنسجّل الكشوف المعتمدة الحالية من غير فرحة — عشان
    // ما نفرحش لكشف قديم اتعتمد من زمان.
    if(seen === null){ cheerSeenSet(all); return; }
    const fresh = pills.filter(el => seen.indexOf(el.getAttribute('data-cheer-id')) < 0);
    cheerSeenSet(seen.concat(all.filter(id => seen.indexOf(id) < 0)));
    if(!fresh.length) return;
    cheerShow(fresh[0]);
  }catch(e){}
}
function cheerShow(pill){
  try{
    cheerEnsureCSS();
    cheerHide();
    const host = pill.closest('.sub-top');
    if(!host) return;
    // ⚠ الكشف المعتمد بينزل في مجموعة "✅ خلصت" وهي مطوية افتراضيًا (open:false في subGroupsHtml).
    // من غير الفتح دي، الفرحة بتتحط جوّه <details> مقفول ومحدش بيشوفها.
    const det = pill.closest('details');
    if(det && !det.open) det.open = true;
    const el = document.createElement('div');
    el.id = 'cheer-mascot';
    el.innerHTML = `<img src="${MASCOT_CHEER_SRC}" alt="" aria-hidden="true">`;
    host.appendChild(el);
    // بنوقّف الشخصية فوق الشارة بالظبط: مركزها على مركز الشارة، وآخر جسمها جوّه الشارة
    // بـ8px فيتخفي وراها (الشارة z-index:1 وليها خلفية صلبة).
    const img = el.querySelector('img');
    const place = ()=>{
      const w = img.offsetWidth || 86, h = img.offsetHeight || 97;
      el.style.left = Math.max(2, Math.round(pill.offsetLeft + pill.offsetWidth/2 - w/2)) + 'px';
      el.style.top  = Math.round(pill.offsetTop + pill.offsetHeight - 8 - h) + 'px';
    };
    if(img.complete) place(); else img.onload = place;
    place();
    pill.scrollIntoView({block:'center', behavior:'smooth'});
    _cheerTimer = setTimeout(cheerHide, 5000);
  }catch(e){}
}
// base: '/api/submissions' (صاحب الملف/الأدمن) أو '/api/approvals' (المعتمدين من تاب الاعتمادات)
async function downloadSubmission(id, name, base='/api/submissions'){
  try{
    const res=await fetch(API_URL+base+'/'+id+'/file',{headers:{'Authorization':'Bearer '+getAccessToken()}});
    if(!res.ok) throw new Error('تعذر التنزيل');
    const blob=await res.blob(); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
  }catch(e){ showToast('⚠ '+e.message, true); }
}
// الكشف عدّى اعتمادات المديرين (SENT) بس الرفع لجوجل شيت فشل (gsheetRow فاضي) → إعادة المحاولة عبر /gsync (بياخد لدقيقة)
async function resyncSubmission(id, btn){
  if(btn){ btn.disabled=true; btn.textContent='⏳ جاري الإرسال للشيت...'; }
  try{
    const r=await api('POST','/api/submissions/'+id+'/gsync');
    showToast(r.data?.alreadySynced ? 'ℹ️ الكشف موجود في الشيت بالفعل (صف '+r.data.gsheetRow+')' : '☁️ وصل شيت الاعتماد — صف '+(r.data?.gsheetRow||''));
    renderMySubmissions(); if(typeof renderAdminSubmissions==='function' && isAdmin()) renderAdminSubmissions();
  }catch(e){ showToast('⚠ '+e.message, true); if(btn){ btn.disabled=false; btn.textContent='☁️ إعادة الإرسال للشيت'; } }
}
// الزرار ده للمهندس — بيحدّث حالة الشيت وملاحظة الـDC بس، عمره ما يبعت الملف. الإرسال للشيت
// تلقائي لما السلسلة تكمل، وإعادة الإرسال للأدمن بس.
async function refreshDcNotes(id, btn){
  if(btn){ btn.disabled=true; btn.textContent='⏳ جاري التحديث...'; }
  try{
    const r=await api('POST','/api/submissions/'+id+'/gsync');
    showToast(r.data?.relinked ? 'ℹ️ لقينا صف الكشف في الشيت وربطناه — حالة الـDC ظاهرة دلوقتي' : r.data?.alreadySynced ? '🔄 تم التحديث (مفيش حاجة اتغيرت)' : '🔄 تم التحديث');
    renderMySubmissions(); if(typeof renderAdminSubmissions==='function' && isAdmin()) renderAdminSubmissions();
  }catch(e){ showToast('⚠ '+e.message, true); if(btn){ btn.disabled=false; btn.textContent='🔄 تحديث لتلقي ملاحظات DC'; } }
}
// المهندس بيأكّد إنه قرا ملاحظة الـDC — بيشيل زرار "شفت الملاحظة" من على الكارت
async function markDcNoteSeen(id, btn){
  if(btn){ btn.disabled=true; btn.textContent='⏳ ...'; }
  try{
    await api('POST','/api/submissions/'+id+'/dc-note-seen');
    renderMySubmissions(); if(typeof renderAdminSubmissions==='function' && isAdmin()) renderAdminSubmissions();
  }catch(e){ showToast('⚠ '+e.message, true); if(btn){ btn.disabled=false; btn.textContent='✔ شفت الملاحظة'; } }
}
// حذف الكشف بقى للأدمن فقط من كارت الحساب في إدارة الحسابات (المهندس مابقاش يقدر يحذف بعد الإرسال)
async function adminLoadUserSubs(){
  const box=document.getElementById('admin-user-subs'); if(!box||!_adminSelected) return;
  box.innerHTML='<div class="hint">⏳ ...</div>';
  try{
    const rows=(await api('GET','/api/submissions?userId='+_adminSelected.id+'&limit=100')).data;
    if(!rows.length){ box.innerHTML='<div class="hint">مفيش كشوف لهذا الحساب.</div>'; return; }
    const st=r=> r.reviewState==='IN_REVIEW' ? '⏳ قيد مراجعة المديرين ('+esc(r.currentLevel||'')+')' : r.reviewState==='RETURNED' ? '❌ مرفوض — عند المهندس' : (r.gsheetRow ? '✅ وصل الشيت (صف '+r.gsheetRow+')' : '☁️ اتبعت (لسه ما وصلش الشيت)');
    box.innerHTML=rows.map(r=>'<div class="list-item" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">'
      +'<div><b>'+esc(r.contractorName||'')+'</b>'+(r.placeName?' · '+esc(r.placeName):'')+' <small class="text-muted">'+esc(r.weekStart)+' → '+esc(r.weekEnd)+' · rev '+String(r.revision).padStart(2,'0')+'</small><br><small>'+st(r)+'</small></div>'
      +'<button class="btn btn-danger btn-inline" onclick="adminDeleteSubmission(\''+r.id+'\')">🗑 حذف</button></div>').join('');
  }catch(e){ box.innerHTML='<div class="hint">⚠ '+esc(e.message||'تعذر التحميل')+'</div>'; }
}
// ── ترجمة الأخطاء لمعناها بالعربي ──
// كل خطأ بيرجع للجهاز له معنى تشغيلي: مين المسؤول (السيرفر / الحساب / الجهاز) وهل محتاج تدخل.
// r = صف الحساب (عشان نفرّق مثلًا 403 السراكي لحساب معتمد = طبيعي، مش مشكلة)
// ترجمة تفاصيل خطأ التحقق (ZodError من السيرفر: "qtyType: Invalid enum value. Expected 'a' | 'b', received 'c'")
// لعربي مفهوم: "نوع الكمية: القيمة 'c' مش من الخيارات المسموحة (a / b)"
function actDetailAr(det){
  let t=String(det||'');
  t=t.replace(/(^|·\s*)([a-zA-Z_]+):\s*/g,(m,pre,f)=>pre+((typeof SYNC_FIELD_AR!=='undefined'&&SYNC_FIELD_AR[f])||f)+': ');
  t=t.replace(/Invalid enum value\. Expected (.+?), received '([^']*)'/g,(m,exp,got)=>"القيمة '"+got+"' مش من الخيارات المسموحة ("+exp.replace(/'/g,'').replace(/\s*\|\s*/g,' / ')+')');
  t=t.replace(/Required/g,'مطلوب').replace(/Expected (number|string), received (\w+)/g,'نوع البيانات غلط');
  return t;
}
function actErrMeaning(e, r){
  if(!e) return null;
  const st=Number(e.status), path=String(e.path||''), det=String(e.detail||'');
  if(st===403 && path.startsWith('/api/records') && r && !r.hasRecords)
    return {t:'طبيعي — الحساب معتمد بس ومالوش وحدة السراكي', ok:true};
  if(st===403 && det.includes('الوحدة'))
    return {t:'وحدة مش مفعّلة للحساب — فعّلها من القوائم الرئيسية', ok:false};
  if(st===403) return {t:'مالوش صلاحية على الطلب ده', ok:false};
  if(st===401) return {t:'الجلسة انتهت — محتاج يسجّل دخول تاني', ok:false};
  if(st===429) return {t:'ضغط على السيرفر — التطبيق بيعيد المحاولة لوحده', ok:true};
  if(st===413) return {t:'الملف أكبر من الحد المسموح', ok:false};
  if(st===404) return {t:'عنصر مش موجود على السيرفر (اتمسح أو قديم)', ok:false};
  // /gsync = ربط كشف معتمد بصفه في جوجل شيت — مالوش علاقة بسجلات على جهاز المهندس
  if(st===400 && path.includes('/gsync')) return {t:'كشف معتمد مالوش صف في شيت الاعتماد'+(det?' ('+det+')':'')+' — الكشف على السيرفر ومستني الأدمن يربطه أو يعيد إرساله، مفيش حاجة واقفة على جهاز المهندس', ok:false};
  if(st===400) return {t:'السيرفر رفض البيانات'+(det?': '+actDetailAr(det):' (ناقصة أو غلط)')+' — السجل واقف على جهاز المهندس لحد ما يتعدّل', ok:false};
  if(st>=500) return {t:'خطأ في السيرفر — محتاج مراجعة', ok:false};
  return {t:det||('خطأ '+st), ok:false};
}
// حالة الحساب في سطر واحد — الخلاصة اللي الأدمن بيقراها بسرعة
function actVerdict(r){
  const err=actErrMeaning(r.errTop, r);
  if(r.loginFail>0 && r.loginOk===0) return {t:'⛔ مش قادر يدخل', c:'var(--danger-fg)', b:'var(--danger-bg)'};
  if(err && !err.ok) return {t:'⚠️ فيه خطأ متكرر', c:'var(--warn-fg)', b:'var(--warn-bg)'};
  if(!r.lastSeenAt) return {t:'⏳ لسه ما دخلش', c:'var(--muted)', b:'var(--input)'};
  // حساب ما فتحش التطبيق أصلًا خلال المدة: "مش نشط" — مش مشكلة مزامنة (كان بيتحسب إنذار بالغلط)
  const activeInWindow = (Date.now()-new Date(r.lastSeenAt)) < _actDays*24*60*60*1000;
  if(!activeInWindow) return {t:'😴 مش نشط', c:'var(--muted)', b:'var(--input)'};
  if(r.hasRecords && r.sync===0) return {t:'⚠️ مفيش مزامنة', c:'var(--warn-fg)', b:'var(--warn-bg)'};
  return {t:'✅ سليم', c:'var(--ok-fg)', b:'var(--ok-bg)'};
}
function actWhen(v){
  if(!v) return '—';
  const d=new Date(v), mins=Math.round((Date.now()-d)/60000);
  if(mins<1) return 'دلوقتي';
  if(mins<60) return 'من '+mins+' دقيقة';
  if(mins<1440) return 'من '+Math.round(mins/60)+' ساعة';
  return d.toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
}
let _actDays=7, _actRows=[];
async function renderActivityTable(){
  const box=document.getElementById('act-table'); if(!box) return;
  if(!navigator.onLine){ box.innerHTML='<div class="home-empty">بيانات حية — محتاج اتصال بالنت</div>'; return; }
  box.innerHTML='<div class="home-empty">⏳ جاري التحميل...</div>';
  try{
    const r=await api('GET','/api/admin/activity/summary?days='+_actDays);
    _actRows=r.data;
    const heads=['الحساب','الحالة','آخر دخول','دخول ناجح','محاولات فاشلة','آخر مزامنة','مزامنات','أخطاء','معنى الخطأ'];
    let html='<table class="apr-table act-table"><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>';
    html+=_actRows.map(u=>{
      const v=actVerdict(u), err=actErrMeaning(u.errTop, u);
      const sync=u.syncReportedAt||u.lastSync;
      const syncTxt=u.hasRecords ? (sync?actWhen(sync):'—') : '<span class="text-muted">مالوش سراكي</span>';
      const failCell=u.loginFail
        ? '<b style="color:var(--danger-fg)">'+u.loginFail+'</b><br><small class="text-muted">'+esc(actWhen(u.lastLoginFail))+'</small>'
        : '0';
      const errCell=u.errors
        ? '<b style="color:var(--warn-fg)">'+u.errors+'</b>'+(u.errTop?'<br><small class="text-muted">'+esc(String(u.errTop.status))+' · '+esc(String(u.errTop.path||'').replace('/api/',''))+'</small>':'')
        : '0';
      return '<tr>'
        +'<td class="apr-eng" style="text-align:right">'+esc(personName(u))+'<small>'+esc(u.title||u.grade||'')+'</small></td>'
        +'<td><span class="apr-pill" style="background:'+v.b+';color:'+v.c+'">'+esc(v.t)+'</span></td>'
        +'<td>'+esc(actWhen(u.lastSeenAt))+'</td>'
        +'<td>'+(u.loginOk||0)+'</td>'
        +'<td>'+failCell+'</td>'
        +'<td>'+syncTxt+'</td>'
        +'<td>'+(u.sync||0)+'</td>'
        +'<td>'+errCell+'</td>'
        +'<td style="white-space:normal;min-width:200px;text-align:right">'+(err?'<span style="color:'+(err.ok?'var(--muted)':'var(--danger-fg)')+'">'+esc(err.t)+'</span>':'<span class="text-muted">—</span>')+'</td>'
        +'</tr>';
    }).join('');
    html+='</tbody></table>';
    box.innerHTML=html;
    const n=document.getElementById('act-count');
    // العدّاد: اللي محتاج تدخل فعلًا (مشكلة دخول/خطأ/مزامنة) — "مش نشط" و"لسه ما دخلش" مش مشاكل
    if(n){ const bad=_actRows.filter(u=>/^[⛔⚠]/.test(actVerdict(u).t)).length; n.textContent = bad ? bad+' محتاج نظرة' : 'كله سليم'; }
  }catch(e){ box.innerHTML='<div class="home-empty">⚠ '+esc(e.message||'تعذر التحميل')+'</div>'; }
}
function setActDays(d){
  _actDays=d;
  document.querySelectorAll('.act-days').forEach(b=>b.classList.toggle('active', Number(b.dataset.v)===d));
  renderActivityTable();
}
// سجل نشاط الحساب — دخول/مزامنة/أخطاء، عشان الأدمن يعرف مصدر المشكلة (السيرفر ولا جهاز المهندس)
const ACT_LABEL={
  LOGIN_OK:['✅','تسجيل دخول ناجح'],
  LOGIN_FAIL:['⛔','محاولة دخول فاشلة'],
  SYNC:['🔄','مزامنة'],
  API_ERR:['⚠️','خطأ في طلب'],
};
async function adminLoadActivity(){
  const box=document.getElementById('admin-user-activity'); if(!box||!_adminSelected) return;
  box.innerHTML='<div class="hint">⏳ ...</div>';
  try{
    const rows=(await api('GET','/api/admin/activity?userId='+_adminSelected.id+'&limit=60')).data;
    if(!rows.length){ box.innerHTML='<div class="hint">مفيش نشاط مسجّل (السجل بيحتفظ بآخر 14 يوم).</div>'; return; }
    box.innerHTML=rows.map(r=>{
      const [ic,lbl]=ACT_LABEL[r.event]||['•',r.event];
      const when=new Date(r.createdAt).toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'});
      const bad=r.event==='LOGIN_FAIL'||r.event==='API_ERR';
      return '<div class="list-item" style="padding:6px 8px">'
        +'<div style="font-size:12px;font-weight:800;color:'+(bad?'var(--danger-fg)':'var(--text)')+'">'+ic+' '+esc(lbl)
        +(r.status?' <span class="apr-rev">'+r.status+'</span>':'')+'</div>'
        +(r.detail?'<div style="font-size:11.5px;color:var(--muted)">'+esc(r.event==='API_ERR'?actDetailAr(r.detail):r.detail)+'</div>':'')
        +'<div style="font-size:10.5px;color:var(--muted)">'+esc(when)+(r.path?' · '+esc(r.path):'')+(r.device?' · '+esc(r.device):'')+'</div>'
        +'</div>';
    }).join('');
  }catch(e){ box.innerHTML='<div class="hint">⚠ '+esc(e.message||'تعذر التحميل')+'</div>'; }
}
async function adminDeleteSubmission(id){
  if(!confirm('حذف الكشف ده نهائيًا من التطبيق؟\n\nهيتمسح من سجل المهندس ومن طابور الاعتمادات مع سجل مراجعاته. لو كان وصل جوجل شيت، الصف هناك بيفضل زي ما هو.')) return;
  try{ await api('DELETE','/api/submissions/'+id); showToast('🗑 اتحذف'); adminLoadUserSubs(); if(typeof renderAdminSubmissions==='function') renderAdminSubmissions(); }
  catch(e){ showToast('⚠ '+e.message, true); }
}
// ── التسليمات (الأدمن) ──
let _subFilter='';
async function renderAdminSubmissions(){
  const el=document.getElementById('admin-submissions'); if(!el) return;
  try{
    const rows=(await api('GET','/api/submissions'+(_subFilter?'?status='+_subFilter:''))).data;
    const pending=rows.filter(r=>r.status==='SUBMITTED').length;
    const cnt=document.getElementById('admin-sub-count'); if(cnt) cnt.textContent = pending ? pending+' بانتظار المراجعة' : '';
    el.innerHTML = rows.length ? subGroupsHtml(rows,true) : '<div class="home-empty">لا توجد تسليمات'+(_subFilter?' بالحالة دي':'')+'</div>';
  }catch(e){ el.innerHTML='<div class="home-empty">⚠ تعذر التحميل</div>'; }
}
function setSubFilter(v){ _subFilter=v; document.querySelectorAll('.sub-filter').forEach(b=>b.classList.toggle('active', b.dataset.v===v)); renderAdminSubmissions(); }
// مودال المراجعة (بدل prompt() اللي بيتكتم في PWA)
function reviewSubmission(id, status){
  let ov=document.getElementById('review-overlay');
  if(!ov){ ov=document.createElement('div'); ov.id='review-overlay'; ov.className='modal-overlay'; document.body.appendChild(ov); }
  const approve = status==='APPROVED';
  ov.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true">
      <div class="modal-head">${approve?'✅ اعتماد الكشف':'❌ رفض الكشف'}</div>
      <div class="modal-body">
        <label class="hint" style="display:block;margin-bottom:6px">${approve?'ملاحظة للمهندس (اختياري)':'سبب الرفض — هيظهر للمهندس عشان يصلّح ويعيد الإرسال'}</label>
        <textarea id="review-note" rows="3" maxlength="500" placeholder="${approve?'مثال: تمام، اتبعت للمالية':'مثال: الإجمالي مش مطابق — راجع خصم يوم الاثنين'}" style="width:100%"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-inline" onclick="closeReviewModal()">إلغاء</button>
        <button class="btn ${approve?'btn-primary':'btn-danger'} btn-inline" id="review-confirm-btn">${approve?'✅ اعتماد':'❌ رفض'}</button>
      </div>
    </div>`;
  ov.style.display='flex'; document.body.classList.add('modal-open');
  document.getElementById('review-confirm-btn').onclick=async()=>{
    const note=(document.getElementById('review-note').value||'').trim();
    if(!approve && !note){ showToast('⚠ اكتب سبب الرفض', true); return; }
    const btn=document.getElementById('review-confirm-btn'); btn.disabled=true;
    try{ await api('PATCH','/api/submissions/'+id+'/review',{status, reviewNote:note}); closeReviewModal(); showToast(approve?'✅ تم الاعتماد':'❌ تم الرفض'); renderAdminSubmissions(); }
    catch(e){ showToast('⚠ '+e.message, true); btn.disabled=false; }
  };
  setTimeout(()=>document.getElementById('review-note')?.focus(),100);
}
function closeReviewModal(){ const ov=document.getElementById('review-overlay'); if(ov) ov.style.display='none'; document.body.classList.remove('modal-open'); }

async function exportIRExcel(){
  await ensureXLSX();
  if(!irRecords.length){showToast('⚠ لا يوجد بيانات IR',true);return;}
  const h=['التاريخ','البند','المكان','الاستشاري','الحالة','الملاحظات'];
  const ws=XLSX.utils.aoa_to_sheet([h,...irRecords.map(r=>[r.date,r.item,r.place,r.inspector,r.status,r.notes])]);
  ws['!cols']=[14,45,18,22,12,35].map(w=>({wch:w}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'سجل IR');
  const fileName=`سراكي_IR_${todayYMD()}.xlsx`;
  if(window.isCapacitor){
    try{
      const wbout2 = XLSX.write(wb, {bookType:'xlsx', type:'array'});
      const uint8b = new Uint8Array(wbout2);
      const b64b = bytesToBase64(uint8b);
      window.Capacitor.Plugins.Filesystem.writeFile({path:fileName,data:b64b,directory:'CACHE',recursive:true})
        .then(()=>window.Capacitor.Plugins.Filesystem.getUri({path:fileName,directory:'CACHE'}))
        .then(u=>window.Capacitor.Plugins.Share.share({title:fileName,url:u.uri}))
        .then(()=>showToast('📥 تم تنزيل IR!'))
        .catch(e=>showToast('⚠ خطأ: '+e.message,true));
    }catch(e){showToast('⚠ خطأ: '+e.message,true);}
  } else {
    XLSX.writeFile(wb, fileName);
    showToast('📥 تم تنزيل IR!');
  }
}
// ⚠ الحذف هنا بيتزامن مع السيرفر (المزامنة بتشوف السجلات اختفت محليًا فتحذفها من السحابة) — النص لازم يقول كده صراحةً
function clearAllData(){if(!confirm('⚠ حذف كل سجلات العمال نهائياً من الجهاز ومن السيرفر (السحابة)؟\n\nمتقدرش ترجعها بعد كده.'))return;records=[];saveAll();renderRecords();renderSummary();showToast('🗑 تم الحذف — وهيتحذف من السيرفر مع المزامنة');}
function clearAllIR(){if(!confirm('⚠ حذف كل سجلات IR نهائياً من الجهاز ومن السيرفر (السحابة)؟\n\nمتقدرش ترجعها بعد كده.'))return;irRecords=[];saveAll();renderIR();renderSummary();showToast('🗑 تم الحذف — وهيتحذف من السيرفر مع المزامنة');}

// إعادة تهيئة الجهاز فقط: بتمسح النسخة المحلية (بما فيها snapshot المزامنة عشان ما يتبعتش أي حذف للسيرفر)
// وبتسحب نسخة نظيفة من السيرفر. بيانات السحابة ما بتتمسش.
async function resetAllApp(){
  if(!confirm('⚠ إعادة تهيئة الجهاز\n\nده هيمسح كل البيانات من الجهاز ده بس:\n• سجلات المقاولين\n• سجلات IR\n• المهام\n• التقارير اليومية\n• الموقف التنفيذي\n• المقاولين والأماكن والبنود\n• التوقيع\n\nنسختك على السيرفر (السحابة) مش هتتأثر — وهتتحمّل تاني بعد التهيئة.\nمتأكد؟')) return;
  if(hasUnsyncedLocalData() && !confirm('⚠ فيه شغل لسه ما اترفعش للسيرفر وهيضيع.\n\nتكمل على أي حال؟')) return;
  if(!confirm('تأكيد أخير — إعادة تهيئة الجهاز؟')) return;
  wipeLocalAppData();
  updateLoadOlderUI();
  deductChips=[]; exportContractorChips=[]; exportPlaceChips=[];
  renderDeductChips(); renderExportContractorChips(); renderExportPlaceChips();
  populateDropdowns();
  renderRecords(); renderIR(); renderTodo(); renderSummary(); renderSettings(); initSiteTab();
  showToast('✅ تم إعادة تهيئة الجهاز');
  if(navigator.onLine && getAccessToken()){
    try{
      setSyncStatus('⏳ جاري تحميل نسختك من السيرفر...');
      await pullAll();
      _suppressAutoSync=true; saveAll(); _suppressAutoSync=false;
      populateDropdowns(); renderRecords(); renderIR(); renderTodo(); renderSummary(); renderSettings(); initSiteTab(); renderHome();
      setSyncStatus('✅ تم التحميل من السيرفر ('+records.length+' سجل)', '#2E7D32');
    }catch(e){ setSyncStatus('⚠ تعذّر التحميل من السيرفر — هيتحاول تاني تلقائيًا', '#C62828'); }
  }
}

// تشغيل التحقق فور جاهزية الصفحة بدون انتظار تحميل الخطوط أو الصور الكبيرة
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initAuthGate());
} else {
  initAuthGate();
}

// مؤقت أمان يضمن اختفاء الـ Splash Screen حتى لو تأخرت أي استجابة شبكة
setTimeout(() => {
  const s = document.getElementById('splash');
  if (s && !s.classList.contains('hide')) {
    s.classList.add('hide');
    setTimeout(() => { if (s) s.remove(); }, 700);
  }
}, 2000);


// ── TODO ─────────────────────────────────────────────────────────────────────

function saveTodo() {
  const date     = document.getElementById('todo-date').value;
  const notes    = document.getElementById('todo-notes').value.trim();
  const place    = document.getElementById('todo-place').value;
  const priority = document.getElementById('todo-priority').value;
  if(!notes){showToast('⚠ اكتب بيان الأعمال',true);return;}
  const isNewTodo = todoEditingId === null;
  if(!isNewTodo){
    const idx = todos.findIndex(t=>t.id===todoEditingId);
    if(idx!==-1) todos[idx] = {...todos[idx], date, notes, place, priority};
  } else {
    todos.push({id:Date.now(), date, notes, place, priority, done:false});
  }
  // الحفظ فشل → شيل الجديدة من الذاكرة وسيب النموذج مليان (كان بيتفضّى والمهمة تضيع)
  if(!saveAll()){ if(isNewTodo) todos.pop(); renderTodo(); return; }
  if(!isNewTodo){
    todoEditingId = null;
    document.getElementById('todo-edit-banner').classList.remove('show');
    document.getElementById('todo-save-btn').textContent = '✅ إضافة المهمة';
    showToast('✏️ تم التعديل');
  } else showToast('✅ تم إضافة المهمة');
  renderTodo(); clearTodoForm();
}

function clearTodoForm(){
  document.getElementById('todo-notes').value='';
  document.getElementById('todo-place').value='';
  document.getElementById('todo-priority').value='عادي';
  document.getElementById('todo-date').value=todayYMD();
}

function toggleTodo(id){
  const t = todos.find(x=>x.id===id);
  if(t){ t.done=!t.done; saveAll(); renderTodo(); }
}

function editTodo(id){
  const t = todos.find(x=>x.id===id);
  if(!t) return;
  todoEditingId = id;
  document.getElementById('todo-date').value     = t.date;
  document.getElementById('todo-notes').value    = t.notes;
  document.getElementById('todo-place').value    = t.place;
  document.getElementById('todo-priority').value = t.priority;
  document.getElementById('todo-edit-banner').classList.add('show');
  document.getElementById('todo-save-btn').textContent = '💾 حفظ التعديل';
  window.scrollTo({top:0,behavior:'smooth'});
}

function cancelTodoEdit(){
  todoEditingId = null;
  document.getElementById('todo-edit-banner').classList.remove('show');
  document.getElementById('todo-save-btn').textContent = '✅ إضافة المهمة';
  clearTodoForm();
}

function deleteTodo(id){
  if(!confirm('حذف هذه المهمة؟')) return;
  todos = todos.filter(t=>t.id!==id);
  saveAll(); renderTodo(); showToast('🗑 تم الحذف');
}

function renderTodo(){
  const list = document.getElementById('todo-list');
  const f    = document.getElementById('todo-filter').value;
  const fp   = document.getElementById('todo-filter-priority').value;
  let filtered = [...todos].sort((a,b)=>{
    const p = {عاجل:0,متوسط:1,عادي:2};
    return (p[a.priority]||2)-(p[b.priority]||2) || (a.date||'').localeCompare(b.date||'');
  });
  if(f==='pending') filtered = filtered.filter(t=>!t.done);
  if(f==='done')    filtered = filtered.filter(t=>t.done);
  if(fp)            filtered = filtered.filter(t=>t.priority===fp);
  document.getElementById('todo-count').textContent = filtered.length + ' مهمة';
  if(!filtered.length){
    list.innerHTML=`<div class="empty-state"><div class="icon">✅</div><p>${todos.length?'لا يوجد مهام بهذا الفلتر':'لا يوجد مهام بعد'}</p></div>`;
    return;
  }
  const todayStr = todayYMD();
  list.innerHTML = filtered.map(t=>{
    const overdue = !t.done && t.date && t.date < todayStr;
    return `
    <div class="todo-card p-${esc(t.priority||'عادي')} ${t.done?'todo-done':''}">
      <div class="todo-body">
        <input type="checkbox" class="todo-check" ${t.done?'checked':''} onchange="toggleTodo(${t.id})" aria-label="إنجاز">
        <div style="flex:1;min-width:0">
          <div class="todo-title">${esc(t.notes)}</div>
          <div class="todo-date">
            ${t.date?`<span>📅 ${esc(t.date)}</span>`:''}
            ${overdue?`<span class="badge badge-danger">متأخرة</span>`:''}
            ${t.place?`<span>📍 ${esc(t.place)}</span>`:''}
            <span class="prio ${esc(t.priority)}">${t.priority==='عاجل'?'🔴':t.priority==='متوسط'?'🟡':'🟢'} ${esc(t.priority)}</span>
          </div>
        </div>
        <div class="record-actions">
          <button class="icon-btn edit" onclick="editTodo(${t.id})" title="تعديل">✏️</button>
          <button class="icon-btn del"  onclick="deleteTodo(${t.id})" title="حذف">✕</button>
        </div>
      </div>
    </div>`;}).join('');
}

async function exportTodoExcel(){
  await ensureXLSX();
  if(!todos.length){showToast('⚠ لا يوجد مهام',true);return;}
  const h=['التاريخ','بيان الأعمال','المكان','الأولوية','الحالة'];
  const ws=XLSX.utils.aoa_to_sheet([h,...todos.map(t=>[t.date,t.notes,t.place,t.priority,t.done?'منجزة':'معلقة'])]);
  ws['!cols']=[14,50,18,12,10].map(w=>({wch:w}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'To-Do');
  const fileName=`سراكي_todo_${todayYMD()}.xlsx`;
  if(window.isCapacitor){
    try{
      const wbout3 = XLSX.write(wb, {bookType:'xlsx', type:'array'});
      const uint8c = new Uint8Array(wbout3);
      const b64c = bytesToBase64(uint8c);
      window.Capacitor.Plugins.Filesystem.writeFile({path:fileName,data:b64c,directory:'CACHE',recursive:true})
        .then(()=>window.Capacitor.Plugins.Filesystem.getUri({path:fileName,directory:'CACHE'}))
        .then(u=>window.Capacitor.Plugins.Share.share({title:fileName,url:u.uri}))
        .then(()=>showToast('📥 تم تنزيل To-Do!'))
        .catch(e=>showToast('⚠ خطأ: '+e.message,true));
    }catch(e){showToast('⚠ خطأ: '+e.message,true);}
  } else {
    XLSX.writeFile(wb, fileName);
    showToast('📥 تم تنزيل To-Do!');
  }
}


// ── SIGNATURE ────────────────────────────────────────────────────────────────
let engineerSignature = localStorage.getItem('saraki_signature') || null;

function renderSignatureSettings() {
  const wrap = document.getElementById('sig-preview-wrap');
  const empty = document.getElementById('sig-empty-msg');
  const img   = document.getElementById('sig-preview-img');
  if (engineerSignature) {
    img.src = engineerSignature;
    wrap.style.display = 'block';
    empty.style.display = 'none';
  } else {
    wrap.style.display = 'none';
    empty.style.display = 'block';
  }
}

async function processSignaturePhoto(input) {
  const ok = await requirePin();
  if(!ok){ input.value=''; return; }
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const original = new Image();
    original.onload = function() {
      const canvas = document.getElementById('sig-canvas');
      const maxW = 900;
      const scale = original.width > maxW ? maxW / original.width : 1;
      const W = Math.round(original.width * scale);
      const H = Math.round(original.height * scale);
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#fff';
      ctx.fillRect(0,0,W,H);
      ctx.drawImage(original, 0, 0, W, H);

      const imgData = ctx.getImageData(0,0,W,H);
      const d = imgData.data;

      // ── Step 1: Grayscale ──
      const gray = new Uint8Array(W*H);
      for(let i=0;i<W*H;i++){
        const p=i*4;
        gray[i] = Math.round(0.299*d[p] + 0.587*d[p+1] + 0.114*d[p+2]);
      }

      // ── Step 2: Integral image for adaptive threshold ──
      const R = 18;  // window half-size (bigger = handles uneven lighting better)
      const C = 12;  // bias (higher = less noise, lower = keep faint strokes)
      const intg = new Float64Array((W+1)*(H+1));
      for(let y=0;y<H;y++){
        for(let x=0;x<W;x++){
          intg[(y+1)*(W+1)+(x+1)] =
            gray[y*W+x]
            + intg[y*(W+1)+(x+1)]
            + intg[(y+1)*(W+1)+x]
            - intg[y*(W+1)+x];
        }
      }

      // ── Step 3: Adaptive threshold → binary ──
      const bw = new Uint8Array(W*H);
      for(let y=0;y<H;y++){
        for(let x=0;x<W;x++){
          const x1=Math.max(0,x-R), y1=Math.max(0,y-R);
          const x2=Math.min(W-1,x+R), y2=Math.min(H-1,y+R);
          const count=(x2-x1+1)*(y2-y1+1);
          const sum = intg[(y2+1)*(W+1)+(x2+1)]
                    - intg[y1*(W+1)+(x2+1)]
                    - intg[(y2+1)*(W+1)+x1]
                    + intg[y1*(W+1)+x1];
          bw[y*W+x] = gray[y*W+x] < (sum/count - C) ? 0 : 255;
        }
      }

      // ── Step 4: Noise removal — kill isolated dark pixels ──
      const clean = new Uint8Array(bw);
      for(let y=1;y<H-1;y++){
        for(let x=1;x<W-1;x++){
          if(bw[y*W+x]===0){
            let n=0;
            for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
              if(dx===0&&dy===0) continue;
              if(bw[(y+dy)*W+(x+dx)]===0) n++;
            }
            if(n<2) clean[y*W+x]=255; // isolated → white
          }
        }
      }

      // ── Step 5: Write pure black ink on white ──
      for(let i=0;i<W*H;i++){
        const p=i*4, v=clean[i];
        d[p]=v; d[p+1]=v; d[p+2]=v; d[p+3]=255;
      }
      ctx.putImageData(imgData,0,0);

      // ── Step 6: Auto-crop — find bounding box of ink pixels ──
      let minX=W, maxX=0, minY=H, maxY=0;
      for(let y=0;y<H;y++){
        for(let x=0;x<W;x++){
          if(clean[y*W+x]===0){
            if(x<minX) minX=x; if(x>maxX) maxX=x;
            if(y<minY) minY=y; if(y>maxY) maxY=y;
          }
        }
      }
      // Add padding around signature
      const pad=16;
      minX=Math.max(0,minX-pad); minY=Math.max(0,minY-pad);
      maxX=Math.min(W-1,maxX+pad); maxY=Math.min(H-1,maxY+pad);
      const cW=maxX-minX+1, cH=maxY-minY+1;

      // Draw cropped result to a new canvas
      const crop=document.createElement('canvas');
      crop.width=cW; crop.height=cH;
      const cCtx=crop.getContext('2d');
      cCtx.fillStyle='#fff';
      cCtx.fillRect(0,0,cW,cH);
      cCtx.drawImage(canvas,minX,minY,cW,cH,0,0,cW,cH);

      engineerSignature = crop.toDataURL('image/png');
      localStorage.setItem('saraki_signature', engineerSignature);
      pushSignatureToCloud(engineerSignature);
      renderSignatureSettings();
      input.value = '';
      showToast('✅ تم حفظ التوقيع!');
    };
    original.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function clearSignature() {
  const ok = await requirePin();
  if(!ok) return;
  if (!confirm('حذف التوقيع؟')) return;
  engineerSignature = null;
  localStorage.removeItem('saraki_signature');
  pushSignatureToCloud(null);
  renderSignatureSettings();
  showToast('🗑 تم حذف التوقيع');
}

// Hook renderSignatureSettings into renderSettings
const _origRenderSettings = renderSettings;
renderSettings = function() {
  _origRenderSettings();
  renderSignatureSettings();
};

// ── WEEK NAVIGATOR (Wed→Tue) ─────────────────────────────────────────────────
let weekOffset = 0; // 0 = current week, -1 = last week, etc.
let showAll = false;

// تحديث شكل زرار "كل السجلات" وتعتيم عنوان الأسبوع لما يكون الفلتر الأسبوعي متعطّل
function syncShowAllUI(){
  const btn = document.getElementById('show-all-btn');
  const nav = document.getElementById('week-nav');
  if(btn){ btn.classList.toggle('on', showAll); btn.textContent = showAll ? '✅ كل السجلات' : '📋 كل السجلات'; }
  if(nav) nav.classList.toggle('all-mode', showAll);
}
function toggleShowAll(){
  showAll = !showAll;
  syncShowAllUI();
  renderRecords();
}

function getWeekBounds(offset) {
  const today = new Date();
  today.setHours(0,0,0,0);
  // Find most recent Wednesday (day 3)
  const dow = today.getDay(); // 0=Sun,1=Mon,...,6=Sat
  // Days since last Wednesday
  const daysSinceWed = (dow + 7 - 3) % 7;
  const wed = new Date(today);
  wed.setDate(today.getDate() - daysSinceWed + offset * 7);
  const tue = new Date(wed);
  tue.setDate(wed.getDate() + 6);
  return { start: wed, end: tue };
}

function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

function renderWeekNav() {
  const {start, end} = getWeekBounds(weekOffset);
  const label = weekOffset === 0 ? '📅 الأسبوع الحالي' : weekOffset === -1 ? '📅 الأسبوع الماضي' : weekOffset < 0 ? `📅 قبل ${Math.abs(weekOffset)} أسابيع` : `📅 بعد ${weekOffset} أسابيع`;
  const fmt = d => d.toLocaleDateString('ar-EG', {day:'numeric', month:'short'});
  document.getElementById('week-label').textContent = label;
  document.getElementById('week-range').textContent = `${fmt(start)}  ←  ${fmt(end)}`;
}

function shiftWeek(dir) {
  showAll = false; syncShowAllUI();
  weekOffset += dir;
  renderWeekNav();
  renderRecords();
}

function resetWeek() {
  weekOffset = 0;
  showAll = false; syncShowAllUI();
  renderWeekNav();
  renderRecords();
}

// Init week nav on load
renderWeekNav();

// ── RENT REQUESTS — week nav (نفس منطق سجل السراكي، حالة مستقلة) ────────────
let rrWeekOffset = 0;
let rrShowAll = false;

function rrSyncShowAllUI(){
  const btn = document.getElementById('rr-show-all-btn');
  const nav = document.getElementById('rr-week-nav');
  if(btn){ btn.classList.toggle('on', rrShowAll); btn.textContent = rrShowAll ? '✅ كل الطلبات' : '📋 كل الطلبات'; }
  if(nav) nav.classList.toggle('all-mode', rrShowAll);
}
function rrToggleShowAll(){
  rrShowAll = !rrShowAll;
  rrSyncShowAllUI();
  rrRenderList();
}
function rrRenderWeekNav(){
  const {start, end} = getWeekBounds(rrWeekOffset);
  const label = rrWeekOffset === 0 ? '📅 الأسبوع الحالي' : rrWeekOffset === -1 ? '📅 الأسبوع الماضي' : rrWeekOffset < 0 ? `📅 قبل ${Math.abs(rrWeekOffset)} أسابيع` : `📅 بعد ${rrWeekOffset} أسابيع`;
  const fmtD = d => d.toLocaleDateString('ar-EG', {day:'numeric', month:'short'});
  document.getElementById('rr-week-label').textContent = label;
  document.getElementById('rr-week-range').textContent = `${fmtD(start)}  ←  ${fmtD(end)}`;
}
function rrShiftWeek(dir){
  rrShowAll = false; rrSyncShowAllUI();
  rrWeekOffset += dir;
  rrRenderWeekNav();
  rrRenderList();
}
function rrResetWeek(){
  rrWeekOffset = 0;
  rrShowAll = false; rrSyncShowAllUI();
  rrRenderWeekNav();
  rrRenderList();
}
rrRenderWeekNav();

// ── RENT REQUESTS — sub-tabs (نفس منطق switchSiteTab) ────────────────────────
let currentRentTab = 'log';
function switchRentTab(name){
  currentRentTab = name;
  document.getElementById('rstab-log').style.display = name==='log'?'block':'none';
  document.getElementById('rstab-new').style.display = name==='new'?'block':'none';
  document.getElementById('rstab-log-btn').classList.toggle('active', name==='log');
  document.getElementById('rstab-new-btn').classList.toggle('active', name==='new');
}
{
  const rd=document.getElementById('rr-date');
  if(rd){ rd.value=todayYMD(); autoSetDay(todayYMD(),'rr-day'); }
}

// ── SITE SUB-TABS ────────────────────────────────────────────────────────────
let currentSiteTab = 'daily';
function switchSiteTab(name){
  currentSiteTab = name;
  document.getElementById('stab-daily').style.display = name==='daily'?'block':'none';
  document.getElementById('stab-exec').style.display  = name==='exec' ?'block':'none';
  document.getElementById('stab-daily-btn').classList.toggle('active', name==='daily');
  document.getElementById('stab-exec-btn').classList.toggle('active',  name==='exec');
}

// ── DAILY REPORT ─────────────────────────────────────────────────────────────
let dailyRecords = JSON.parse(localStorage.getItem('cea_daily')||'[]');
let dailyEditingId = null;
let dailyPhotoData = null;

function saveDailyAll(){ localStorage.setItem('cea_daily', JSON.stringify(dailyRecords)); }

function autoSetDailyDay(val){
  const name=dayNameOf(val); if(!name) return;
  const sel=document.getElementById('daily-day');
  for(let i=0;i<sel.options.length;i++) if(normDay(sel.options[i].value)===normDay(name)){sel.selectedIndex=i;break;}
}

function autoFillDailySpec(){
  const name=document.getElementById('daily-contractor').value;
  const c=contractors.find(x=>x.name===name);
  if(c) document.getElementById('daily-spec').value=c.spec||'';
}

// ضغط صورة قبل تخزينها في localStorage (صورة الكاميرا الخام ممكن توصل 5-8 ميجا Base64 → الذاكرة تتملي بعد كام تقرير)
// بنصغّر لأقصى ضلع 1280px ونحفظ JPEG بجودة 0.72 → غالبًا 150-300 كيلوبايت
function compressImageFile(file, maxSide=1280, quality=0.72){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      try{
        const scale=Math.min(1, maxSide/Math.max(img.width,img.height));
        const w=Math.round(img.width*scale), h=Math.round(img.height*scale);
        const c=document.createElement('canvas'); c.width=w; c.height=h;
        const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);
        ctx.drawImage(img,0,0,w,h);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg',quality));
      }catch(e){ URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error('تعذر قراءة الصورة')); };
    img.src=url;
  });
}
async function attachDailyPhoto(input){
  const file=input.files[0]; if(!file) return;
  try{
    dailyPhotoData=await compressImageFile(file);
    document.getElementById('daily-photo-img').src=dailyPhotoData;
    document.getElementById('daily-photo-preview').style.display='block';
  }catch(e){ showToast('⚠ '+e.message,true); }
  input.value='';
}

function removeDailyPhoto(){
  dailyPhotoData=null;
  document.getElementById('daily-photo-preview').style.display='none';
  document.getElementById('daily-photo-img').src='';
}

function saveDailyRecord(){
  const date      =document.getElementById('daily-date').value.trim();
  const day       =document.getElementById('daily-day').value.trim();
  const contractor=document.getElementById('daily-contractor').value.trim();
  const spec      =document.getElementById('daily-spec').value.trim();
  const work      =document.getElementById('daily-work').value.trim();
  const place     =document.getElementById('daily-place').value.trim();
  const photo     =dailyPhotoData||null;
  if(!date||!contractor||!work){showToast('⚠ التاريخ والمقاول وبيان الأعمال مطلوبين',true);return;}
  const isNewDaily = dailyEditingId===null;
  if(!isNewDaily){
    const idx=dailyRecords.findIndex(r=>r.id===dailyEditingId);
    if(idx!==-1) dailyRecords[idx]={...dailyRecords[idx],date,day,contractor,spec,work,place,photo};
  } else {
    dailyRecords.push({id:Date.now(),date,day,contractor,spec,work,place,photo});
  }
  // أخطر فورم في الموضوع ده: الصور هي أشهر سبب لامتلاء الذاكرة، وكان بيمسح النموذج والصورة
  // بعد الحفظ الفاشل — يعني التقرير والصورة يضيعوا مع بعض. دلوقتي بنسيبهم عشان يعيد المحاولة.
  if(!saveAll()){ if(isNewDaily) dailyRecords.pop(); renderDaily(''); return; }
  if(!isNewDaily){
    dailyEditingId=null;
    document.getElementById('daily-edit-banner').style.display='none';
    document.getElementById('daily-save-btn').textContent='✅ حفظ التقرير اليومي';
    showToast('✏️ تم التعديل');
  } else showToast('✅ تم حفظ التقرير اليومي');
  clearDailyForm();
  renderDaily('');
}

function clearDailyForm(){
  ['daily-date','daily-work'].forEach(id=>document.getElementById(id).value='');
  ['daily-day','daily-contractor','daily-place'].forEach(id=>document.getElementById(id).selectedIndex=0);
  document.getElementById('daily-spec').value='';
  removeDailyPhoto();
}

function cancelDailyEdit(){
  dailyEditingId=null;
  document.getElementById('daily-edit-banner').style.display='none';
  document.getElementById('daily-save-btn').textContent='✅ حفظ التقرير اليومي';
  clearDailyForm();
}

function editDailyRecord(id){
  const r=dailyRecords.find(x=>x.id===id); if(!r) return;
  dailyEditingId=id;
  document.getElementById('daily-date').value=r.date;
  autoSetDailyDay(r.date);
  document.getElementById('daily-contractor').value=r.contractor;
  document.getElementById('daily-spec').value=r.spec||'';
  document.getElementById('daily-work').value=r.work||'';
  document.getElementById('daily-place').value=r.place||'';
  if(r.photo){ dailyPhotoData=r.photo; document.getElementById('daily-photo-img').src=r.photo; document.getElementById('daily-photo-preview').style.display='block'; }
  else removeDailyPhoto();
  document.getElementById('daily-edit-banner').style.display='flex';
  document.getElementById('daily-save-btn').textContent='💾 حفظ التعديل';
  switchTab('site'); switchSiteTab('daily');
  window.scrollTo({top:0,behavior:'smooth'});
}

function deleteDailyRecord(id){
  if(!confirm('حذف هذا التقرير؟')) return;
  dailyRecords=dailyRecords.filter(r=>r.id!==id);
  saveAll(); renderDaily(''); showToast('🗑 تم الحذف');
}

function renderDaily(filterDate){
  const list=document.getElementById('daily-list');
  if(!list) return;
  const dq = filterDate !== undefined
    ? filterDate
    : (document.getElementById('daily-filter-date')?document.getElementById('daily-filter-date').value||'':'');
  let f=[...dailyRecords].reverse();
  if(dq) f=f.filter(r=>r.date===dq);
  const countEl=document.getElementById('daily-count');
  if(countEl) countEl.textContent=f.length+' سجل';
  if(!f.length){ list.innerHTML=dailyRecords.length?`<div class="empty-state"><div class="icon">🔍</div><p>لا يوجد نتائج</p></div>`:`<div class="empty-state"><div class="icon">📋</div><p>لا يوجد تقارير بعد</p></div>`; return; }
  list.innerHTML=f.map(r=>`
    <div class="record-card">
      <div class="record-head">
        <div class="record-title"><div class="record-name">${esc(r.contractor)}</div><div class="record-spec">${esc(r.spec||'')}</div></div>
        <div class="record-actions">
          <button class="icon-btn edit" onclick="editDailyRecord(${r.id})" title="تعديل">✏️</button>
          <button class="icon-btn del"  onclick="deleteDailyRecord(${r.id})" title="حذف">✕</button>
        </div>
      </div>
      <div class="record-meta">
        <span class="badge">📅 ${esc(r.day||'')} ${esc(r.date)}</span>
        ${r.place?`<span class="badge">📍 ${esc(r.place)}</span>`:''}
      </div>
      <div class="record-notes">🏗 ${esc(r.work)}</div>
      ${r.photo?`
        <img src="${r.photo}" class="thumb" onclick="openPhotoLightbox('${r.id}')" id="thumb-${r.id}" alt="صورة">
        <div id="lightbox-${r.id}" class="lightbox" onclick="this.style.display='none'">
          <img src="${r.photo}" alt="">
        </div>`
      :(r.photoFileId?`
        <button class="btn btn-ghost btn-inline" id="pbtn-${r.id}" onclick="loadDailyPhoto(${r.id})">📷 عرض الصورة</button>
        <div id="pwrap-${r.id}"></div>`:'')}
    </div>`).join('');
}
// (M11) الصور المرفوعة بتتشال من التخزين المحلي (كانت بتملى حصة localStorage وتضيع بيانات بصمت)
// وبتتحمل عند الطلب — مع كاش في الذاكرة للجلسة الحالية بس
const _dailyPhotoCache=new Map();
async function loadDailyPhoto(id){
  const r=dailyRecords.find(x=>x.id===id); if(!r||!r.photoFileId) return;
  const btn=document.getElementById('pbtn-'+id); if(btn){ btn.disabled=true; btn.textContent='⏳ جاري التحميل...'; }
  try{
    let dataUrl=_dailyPhotoCache.get(id);
    if(!dataUrl){
      const res=await fetch(API_URL+'/api/files/'+r.photoFileId+'/content',{headers:{'Authorization':'Bearer '+getAccessToken()}});
      if(!res.ok) throw new Error('تعذر تحميل الصورة');
      const blob=await res.blob();
      dataUrl=await new Promise(resolve=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.readAsDataURL(blob);});
      _dailyPhotoCache.set(id, dataUrl);
    }
    const wrap=document.getElementById('pwrap-'+id);
    if(wrap){
      wrap.innerHTML=`<img src="${dataUrl}" class="thumb" onclick="document.getElementById('lightbox-${id}').style.display='flex'" alt="صورة">
        <div id="lightbox-${id}" class="lightbox" onclick="this.style.display='none'"><img src="${dataUrl}" alt=""></div>`;
    }
    if(btn) btn.style.display='none';
  }catch(e){
    if(btn){ btn.disabled=false; btn.textContent='📷 عرض الصورة'; }
    showToast('⚠ '+(e.message||'تعذر تحميل الصورة')+' — جرب تاني', true);
  }
}

function openPhotoLightbox(id){
  const lb=document.getElementById('lightbox-'+id);
  if(lb){ lb.style.display='flex'; }
}

// ── EXEC STATUS ───────────────────────────────────────────────────────────────
let execRecords = JSON.parse(localStorage.getItem('cea_exec')||'[]');
let execEditingId = null;

// الموقف التنفيذي بيتحفظ بمفتاحه لوحده — لكن لازم يحترم نفس عقد saveAll:
// (1) لو الذاكرة اتملت كان بيرمي استثناء **غير مُمسك**: المستخدم يكون شاف "✅ تم حفظ البند"
//     (الرسالة كانت قبل الحفظ)، والقايمة ما بتتحدثش، ومحدش بيقوله إن حاجة ما اتحفظتش.
// (2) كان مابيجدولش مزامنة زي أي حفظ تاني — فتعديل الموقف التنفيذي بيستنى الدورة الدورية.
function saveExecAll(){
  try{
    localStorage.setItem('cea_exec', JSON.stringify(execRecords));
    scheduleSync();
    return true;
  }catch(e){
    console.error('saveExecAll failed', e);
    showToast('⚠ الذاكرة المحلية اتملت — البيانات ما اتحفظتش! امسح صور تقارير قديمة أو اعمل نسخة احتياطية', true);
    return false;
  }
}

// ---- Exec stages chips ----
let execSelectedStages = [];

// stageDone[i] = نسبة إنجاز المرحلة i (0-100)
let stageDone = [];

function onExecItemChange(){
  const itemName = document.getElementById('exec-item').value;
  const item = items.find(it=>it.name===itemName);
  const wrap = document.getElementById('exec-stages-wrap');
  const totalWrap = document.getElementById('exec-total-pct-wrap');
  if(!item||!item.stages||item.stages.length===0){
    wrap.style.display='none';
    totalWrap.style.display='none';
    stageDone=[];
    return;
  }
  stageDone = new Array(item.stages.length).fill(0);
  wrap.style.display='block';
  totalWrap.style.display='block';
  renderStageSliders(item);
  recalcExecTotal(item);
}

function renderStageSliders(item){
  const el = document.getElementById('exec-stages-sliders');
  el.innerHTML = item.stages.map((s,i)=>`
    <div class="stage-slider">
      <div class="head">
        <span class="name">${esc(s.name)}</span>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="w">وزن البند: <b>${s.pct}%</b></span>
          <span id="exec-stage-done-label-${i}" class="done">0%</span>
        </div>
      </div>
      <input type="range" min="0" max="100" value="0" step="5" oninput="onStageDone(${i},this.value)" style="width:100%">
      <div class="track"><div id="exec-stage-fill-${i}"></div></div>
      <div class="contrib">إسهامه في البند: <b id="exec-stage-contrib-${i}">0.0%</b> من ${s.pct}%</div>
    </div>`).join('');
}

function onStageDone(idx, val){
  stageDone[idx] = Number(val);
  const item = items.find(it=>it.name===document.getElementById('exec-item').value);
  if(!item||!item.stages) return;
  const s = item.stages[idx];
  // update this stage UI
  const contrib = (s.pct * stageDone[idx] / 100);
  document.getElementById(`exec-stage-done-label-${idx}`).textContent = val+'%';
  document.getElementById(`exec-stage-fill-${idx}`).style.width = val+'%';
  document.getElementById(`exec-stage-contrib-${idx}`).textContent = contrib.toFixed(1)+'%';
  recalcExecTotal(item);
}

function recalcExecTotal(item){
  const total = item.stages.reduce((sum,s,i)=> sum + (s.pct * (stageDone[i]||0) / 100), 0);
  const v = Math.round(total * 10) / 10;
  updateExecPct(v);
  const noteEl = document.getElementById('exec-stages-note');
  if(noteEl){
    if(v>0){
      noteEl.style.display='block';
      noteEl.textContent = `📊 إجمالي إنجاز البند: ${v.toFixed(1)}%`;
    } else {
      noteEl.style.display='none';
    }
  }
}

function getExecStagesSnapshot(){
  const item = items.find(it=>it.name===document.getElementById('exec-item').value);
  if(!item||!item.stages) return [];
  return item.stages.map((s,i)=>({
    name: s.name,
    weight: s.pct,
    done: stageDone[i]||0,
    contrib: Math.round(s.pct*(stageDone[i]||0))/100
  }));
}

function updateExecPct(v){
  v=Number(v);
  const rounded = Math.round(v*10)/10;
  document.getElementById('exec-pct-label').textContent=rounded+'%';
  document.getElementById('exec-pct-fill').style.width=rounded+'%';
  const color=v<25?'#C62828':v<50?'#E65100':v<75?'#F9A825':v<100?'#2E7D32':'#1565C0';
  document.getElementById('exec-pct-fill').style.background=color;
  document.getElementById('exec-pct-label').style.color=color;
}

function saveExecRecord(){
  const item =document.getElementById('exec-item').value.trim();
  const place=document.getElementById('exec-place').value.trim();
  const notes=document.getElementById('exec-notes').value.trim();
  if(!item){showToast('⚠ اختر البند أولاً',true);return;}
  const stagesSnapshot = getExecStagesSnapshot();
  const itemObj = items.find(it=>it.name===item);
  const pct = itemObj&&itemObj.stages
    ? Math.round(itemObj.stages.reduce((s,st,i)=>s+(st.pct*(stageDone[i]||0)/100),0)*10)/10
    : 0;
  // الحفظ هنا بيعدّل على سجل موجود في 3 حالات من 3 (تعديل / تحديث بند بنفس المكان / إضافة)،
  // فبنمسك نسخة من الحالة قبل التعديل ونرجّعها لو الحفظ فشل — المصفوفة بتتعدّل في مكانها
  // عشان مرجعها اللي بتستخدمه المزامنة يفضل هو هو.
  const execSnapshot=execRecords.map(r=>({...r}));
  const wasExecEdit=execEditingId!==null;
  if(wasExecEdit){
    const idx=execRecords.findIndex(r=>r.id===execEditingId);
    if(idx!==-1) execRecords[idx]={...execRecords[idx],item,place,pct,notes,stages:stagesSnapshot,stageDone:[...stageDone],updated:todayYMD()};
  } else {
    const existing=execRecords.find(r=>r.item===item&&r.place===place);
    if(existing){ existing.pct=pct; existing.notes=notes; existing.stages=stagesSnapshot; existing.stageDone=[...stageDone]; existing.updated=todayYMD(); }
    else execRecords.push({id:Date.now(),item,place,pct,notes,stages:stagesSnapshot,stageDone:[...stageDone],updated:todayYMD()});
  }
  if(!saveExecAll()){ execRecords.length=0; execRecords.push(...execSnapshot); renderExec(); return; }
  if(wasExecEdit){
    execEditingId=null;
    document.getElementById('exec-edit-banner').style.display='none';
    document.getElementById('exec-save-btn').textContent='✅ حفظ البند';
    showToast('✏️ تم التعديل');
  } else showToast('✅ تم حفظ البند');
  clearExecForm(); renderExec();
}

function clearExecForm(){
  ['exec-item','exec-place'].forEach(id=>document.getElementById(id).selectedIndex=0);
  document.getElementById('exec-notes').value='';
  updateExecPct(0);
  stageDone=[];
  const wrap=document.getElementById('exec-stages-wrap');
  if(wrap) wrap.style.display='none';
  const totalWrap=document.getElementById('exec-total-pct-wrap');
  if(totalWrap) totalWrap.style.display='none';
  const note=document.getElementById('exec-stages-note');
  if(note) note.style.display='none';
  const sliders=document.getElementById('exec-stages-sliders');
  if(sliders) sliders.innerHTML='';
}

function cancelExecEdit(){
  execEditingId=null;
  document.getElementById('exec-edit-banner').style.display='none';
  document.getElementById('exec-save-btn').textContent='✅ حفظ البند';
  clearExecForm();
}

function editExecRecord(id){
  const r=execRecords.find(x=>x.id===id); if(!r) return;
  execEditingId=id;
  switchTab('site'); switchSiteTab('exec');
  document.getElementById('exec-item').value=r.item||'';
  onExecItemChange(); // render sliders
  // restore stageDone values
  if(r.stageDone&&r.stageDone.length){
    const item=items.find(it=>it.name===r.item);
    stageDone=[...r.stageDone];
    if(item&&item.stages){
      item.stages.forEach((_,i)=>{
        const slEl=document.getElementById(`exec-stages-sliders`)?.querySelectorAll('input[type=range]')[i];
        if(slEl){ slEl.value=stageDone[i]||0; onStageDone(i,stageDone[i]||0); }
      });
    }
  }
  document.getElementById('exec-place').value=r.place||'';
  document.getElementById('exec-notes').value=r.notes||'';
  document.getElementById('exec-edit-banner').style.display='flex';
  document.getElementById('exec-save-btn').textContent='💾 حفظ التعديل';
  window.scrollTo({top:0,behavior:'smooth'});
}

async function exportExecExcel(){
  await ensureXLSX();
  if(!execRecords.length){showToast('⚠ لا يوجد بيانات',true);return;}
  const rows=[['البند','المكان','اسم المرحلة','وزن المرحلة %','إنجاز المرحلة %','إسهام في البند %','إجمالي إنجاز البند %','آخر تحديث','ملاحظات']];
  execRecords.forEach(r=>{
    const stages=r.stages||[];
    if(stages.length===0){
      rows.push([r.item,r.place||'','-','-','-','-',r.pct||0,r.updated||'',r.notes||'']);
    } else {
      stages.forEach((s,i)=>{
        rows.push([
          i===0?r.item:'',
          i===0?(r.place||''):'',
          s.name,
          s.weight||s.pct||0,
          s.done||0,
          Number(s.contrib||0).toFixed(1),
          i===0?(r.pct||0):'',
          i===0?(r.updated||''):'',
          i===0?(r.notes||''):''
        ]);
      });
    }
  });
  const ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[18,14,18,12,12,12,14,14,25].map(w=>({wch:w}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'الموقف التنفيذي');
  const fileName='exec_status_'+todayYMD()+'.xlsx';
  if(window.isCapacitor){
    try{
      const wbout=XLSX.write(wb,{bookType:'xlsx',type:'array'});
      const uint8 = new Uint8Array(wbout);
      const b64 = bytesToBase64(uint8);
      window.Capacitor.Plugins.Filesystem.writeFile({path:fileName,data:b64,directory:'CACHE',recursive:true})
        .then(()=>window.Capacitor.Plugins.Filesystem.getUri({path:fileName,directory:'CACHE'}))
        .then(u=>window.Capacitor.Plugins.Share.share({title:fileName,url:u.uri}))
        .then(()=>showToast('📥 تم تصدير الموقف التنفيذي'))
        .catch(e=>showToast('⚠ خطأ: '+e.message,true));
    }catch(e){showToast('⚠ خطأ: '+e.message,true);}
  } else {
    XLSX.writeFile(wb,fileName);
    showToast('📥 تم تصدير الموقف التنفيذي');
  }
}

function deleteExecRecord(id){
  if(!confirm('حذف هذا البند؟')) return;
  const before=execRecords;
  execRecords=execRecords.filter(r=>r.id!==id);
  // الحذف ما اتحفظش → نرجّع البند عشان القايمة ما تورّيش إنه اتحذف وهو لسه موجود
  if(!saveExecAll()){ execRecords=before; return; }
  renderExec(); showToast('🗑 تم الحذف');
}

function renderExec(){
  const list=document.getElementById('exec-list');
  const f=[...execRecords].sort((a,b)=>b.pct-a.pct);
  document.getElementById('exec-count').textContent=f.length+' بند';
  if(!f.length){ list.innerHTML=`<div class="empty-state"><div class="icon">🏗</div><p>لا يوجد بنود بعد</p></div>`; return; }
  list.innerHTML=f.map(r=>{
    const pct=Number(r.pct)||0;
    const color=pct<25?'#C62828':pct<50?'#E65100':pct<75?'#F9A825':pct<100?'#2E7D32':'#1565C0';
    const stagesHtml=(r.stages||[]).map(s=>{
      const done=s.done||0;
      const contrib=Number(s.contrib||0);
      const sc=done<50?'#E65100':done<100?'#F9A825':'#2E7D32';
      return `<div class="stage-line">
        <div class="h">
          <b>${esc(s.name)}</b>
          <span style="color:${sc};font-weight:900">${done}% <span style="color:var(--muted);font-weight:400">(إسهام: ${contrib.toFixed(1)}%)</span></span>
        </div>
        <div class="track sm"><div style="width:${done}%;background:${sc}"></div></div>
      </div>`;
    }).join('');
    return `<div class="record-card">
      <div class="record-head">
        <div class="record-title"><div class="record-name" style="font-size:13px">${esc(r.item)}</div>${r.place?`<div class="record-spec">📍 ${esc(r.place)}</div>`:''}</div>
        <div class="record-side" style="text-align:center;min-width:56px">
          <div class="exec-pct-big" style="color:${color}">${pct}%</div>
          <div class="exec-pct-lbl">إجمالي</div>
        </div>
        <div class="record-actions">
          <button class="icon-btn edit" onclick="editExecRecord(${r.id})" title="تعديل">✏️</button>
          <button class="icon-btn del"  onclick="deleteExecRecord(${r.id})" title="حذف">✕</button>
        </div>
      </div>
      <div class="track lg" style="margin:6px 0 10px"><div style="width:${pct}%;background:${color};transition:width .4s"></div></div>
      ${stagesHtml}
      ${r.updated?`<div style="font-size:10px;color:var(--muted);margin-top:5px">آخر تحديث: ${esc(r.updated)}</div>`:''}
      ${r.notes?`<div class="record-notes">📝 ${esc(r.notes)}</div>`:''}
    </div>`;
  }).join('');
}

function initSiteTab(){
  // Contractors
  fillSelect('daily-contractor','<option value="">-- اختر المقاول --</option>',contractorOpts());
  // Items for exec — populate from items array
  if(items.length) fillSelect('exec-item','<option value="">-- اختر البند --</option>',itemsOptGroups());
  else fillSelect('exec-item','<option value="">-- لا يوجد بنود -- أضف من الإعدادات --</option>','');
  // Places
  ['daily-place','exec-place'].forEach(id=>fillSelect(id,'<option value="">-- اختر المكان --</option>',placeOpts()));
  if(document.getElementById('daily-list')) renderDaily('');
  if(document.getElementById('exec-list')) renderExec();
}

// ============ API SYNC (MySQL Backend) ============
// بديل Supabase بالكامل: مزامنة "أوفلاين أولاً" مع الـ Backend الجديد.
// المبدأ: localStorage هو مصدر الحقيقة المحلي (كل الشغل اليومي شغال من غير نت زي ما هو)،
// والمزامنة بتحصل تلقائيًا في الخلفية بعد كل حفظ (debounced) + عند رجوع النت + بالزراير اليدوية.
//
// آلية المزامنة (mirror sync): بنحتفظ بـ snapshot (hash لكل عنصر وقت آخر مزامنة ناجحة).
//   رفع: العنصر الجديد (id محلي كبير) → POST، المتغيّر عن الـ snapshot → PUT، المحذوف محليًا → DELETE.
//   البيانات المُدارة من الأدمن (الأماكن/التوقيع/PIN) بتتسحب دايمًا من السيرفر (السيرفر أولوية)،
//   والمهندس مايرفعهاش أصلاً (السيرفر هيرفض 403 برضه — الحماية الحقيقية هناك).

// عنوان الـ API — عدّله عند النشر (أو حط window.CEA_API_URL قبل تحميل app.js)
const API_URL = window.CEA_API_URL || 'https://cea-backend-production-5cbe.up.railway.app';

// ============ AUTH (Backend JWT: Email + Password) ============
// ملحوظة: الحسابات بينشئها الأدمن فقط من حسابه (POST /api/auth/register بتوكن الأدمن).
function getCurrentUserEmail(){ return localStorage.getItem('cea_user_email') || null; }
function getAccessToken(){ return localStorage.getItem('cea_access_token') || null; }
function getRefreshToken(){ return localStorage.getItem('cea_refresh_token') || null; }
function getUserRole(){ return localStorage.getItem('cea_user_role') || 'ENGINEER'; }
function isAdmin(){ return getUserRole() === 'ADMIN'; }
function isProjectManager(){ return localStorage.getItem('cea_user_grade') === 'project manager'; }
function saveSession(data){
  localStorage.setItem('cea_access_token', data.accessToken);
  localStorage.setItem('cea_refresh_token', data.refreshToken);
  if(data.user){
    localStorage.setItem('cea_user_email', data.user.email);
    localStorage.setItem('cea_user_role',  data.user.role || 'ENGINEER');
    if(data.user.title!==undefined) localStorage.setItem('cea_user_title', data.user.title||'');
    if(data.user.displayName!==undefined) localStorage.setItem('cea_user_name', data.user.displayName||'');
  }
}
function clearSession(){
  localStorage.removeItem('cea_access_token');
  localStorage.removeItem('cea_refresh_token');
  localStorage.removeItem('cea_user_email');
  localStorage.removeItem('cea_user_role');
  localStorage.removeItem('cea_user_grade');
}
// كل مفاتيح بيانات التطبيق على الجهاز (بدون مفاتيح الجلسة) — تُمسح عند الخروج أو تبديل الحساب
// عشان بيانات مهندس ما تتدمجش في حساب مهندس تاني على نفس الهاتف
const APP_DATA_KEYS=['saraki_records','saraki_ir','cea_equipment','cea_eq_contractor','cea_eq_site','cea_eq_sites','saraki_todos','saraki_contractors','saraki_places','saraki_inspectors','saraki_items',
  'cea_daily','cea_exec','saraki_signature','cea_records_fully_loaded','cea_records_oldest_loaded','cea_place_notes','cea_place_sites',
  'cea_sync_snapshot','cea_pin_hash','cea_user_title','cea_enabled_modules','cea_enabled_features',
  'cea_notifs','cea_notif_snooze','cea_notif_pending'];
function wipeLocalAppData(){
  APP_DATA_KEYS.forEach(k=>localStorage.removeItem(k));
  records=[]; irRecords=[]; equipmentRecords=[]; todos=[]; contractors=[]; places=[]; inspectors=[]; items=[]; placeNotes={}; placeSites={};
  dailyRecords=[]; execRecords=[]; engineerSignature=null; _syncSnap={};
  recordsFullyLoaded=true; recordsOldestLoaded=null;
}
function hasUnsyncedLocalData(){
  const loc=a=>a.some(x=>isLocalId(x.id));
  return loc(records)||loc(irRecords)||loc(equipmentRecords)||loc(todos)||loc(execRecords)||loc(dailyRecords);
}
function showLoginScreen(msg){
  const scr=document.getElementById('login-screen');
  if(scr) scr.classList.add('show');
  const s=document.getElementById('splash');
  if(s){ s.classList.add('hide'); }
  const err=document.getElementById('login-error');
  if(err) err.textContent = msg || '';
  const btn=document.getElementById('login-btn');
  if(btn){ btn.disabled=false; btn.textContent='دخول'; }
}
function hideLoginScreen(){
  const scr=document.getElementById('login-screen');
  if(scr) scr.classList.remove('show');
}

// طلب API موحّد: JSON + Bearer token + تجديد تلقائي للتوكن عند 401 (مرة واحدة)
let _refreshing=null;
const _sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(method, path, body, _retried, _rlTries){
  const headers={'Content-Type':'application/json'};
  const token=getAccessToken();
  if(token) headers['Authorization']='Bearer '+token;
  const res=await fetch(API_URL+path,{
    method, headers,
    body: body!==undefined ? JSON.stringify(body) : undefined
  });
  // 429 = تجاوز حد الطلبات، مش انتهاء جلسة — نستنى ونعيد المحاولة بدل ما نطلع المستخدم
  if(res.status===429){
    const tries=_rlTries||0;
    if(tries<3){
      const hdr=Number(res.headers.get('retry-after'))||0;
      const waitMs=hdr>0 ? Math.min(hdr*1000, 15000) : (1500*Math.pow(2,tries));
      setSyncStatus('⏳ ضغط على السيرفر — إعادة المحاولة بعد '+Math.ceil(waitMs/1000)+' ثانية', '#E65100');
      await _sleep(waitMs);
      return api(method, path, body, _retried, tries+1);
    }
  }
  if(res.status===401 && !_retried && getRefreshToken()){
    // توكن الوصول انتهى — جدد مرة واحدة وأعد المحاولة (القفل جوّه tryRefreshSession نفسها)
    const st=await tryRefreshSession();
    if(st==='ok') return api(method, path, body, true, _rlTries);
  }
  let data=null;
  try{ data=await res.json(); }catch(e){ /* استجابة غير JSON */ }
  if(!res.ok){
    const err=new Error((data&&data.message)||('HTTP '+res.status));
    err.status=res.status; err.code=data&&data.code; err.details=data&&data.details;
    throw err;
  }
  return data;
}

// (15 سبتمبر 2026) مهلة على نداءات الإقلاع — على نت "معلّق" (بيقبل الاتصال وما بيردّش)
// الـ fetch كان بيستنى للأبد، فـ onAuthReady ما بتتندهش أبدًا: لا بانر أوفلاين، ولا حالة
// مزامنة، ولا كود جهاز. والمهندس يفتكر إن شغله اتزامن وهو لسه محلي. وحدث 'online'
// ما بيتطلقش في الحالة دي لأن المتصفح شايف نفسه متصل.
// AbortController يدوي (مش AbortSignal.timeout) عشان أجهزة الميدان القديمة.
// المهلة ١٢ ثانية مش ٨: شبكات المواقع ضعيفة أغلب الوقت، ورقم قصير كان هيقطع
// اتصالات كانت هتنجح ويودّي المهندس أوفلاين من غير داعي.
function _fetchWithTimeout(url, opts, ms){
  if(typeof AbortController==='undefined') return fetch(url, opts); // متصفح قديم: السلوك القديم
  const ac=new AbortController();
  const t=setTimeout(()=>{ try{ ac.abort(); }catch(e){} }, ms||12000);
  return fetch(url, Object.assign({}, opts, {signal:ac.signal})).finally(()=>clearTimeout(t));
}
async function verifySession(token){
  try{
    const res=await _fetchWithTimeout(API_URL+'/api/auth/me',{headers:{'Authorization':'Bearer '+token}},12000);
    if(res.ok){
      const d=await res.json();
      if(d.data){ localStorage.setItem('cea_user_role', d.data.role||'ENGINEER'); localStorage.setItem('cea_user_title', d.data.title||''); localStorage.setItem('cea_user_name', d.data.displayName||''); localStorage.setItem('cea_user_site', String(d.data.site||1)); localStorage.setItem('cea_user_grade', d.data.grade||''); applyFormButtons(); }
      return 'ok';
    }
    // 429 (ضغط طلبات) أو خطأ سيرفر مؤقت = مش انتهاء جلسة — نعتبره مشكلة شبكة ونكمل أوفلاين
    if(res.status===429 || res.status>=500) return 'network_error';
    return 'invalid';
  }catch(e){ return 'network_error'; }
}
// التجديد بيمرّ كله من قفل واحد (_refreshing) عشان طلبين متزامنين ما يستخدموش نفس التوكن مرتين.
// و_sessionDead: أول ما السيرفر يرفض التوكن نهائيًا، نوقف أي محاولات تانية فورًا ونطلب تسجيل دخول
// (من غيرها كل طلب API فاشل كان بيطلق محاولة تجديد جديدة — عشرات الطلبات في ثواني بلا فايدة).
let _sessionDead=false;
function tryRefreshSession(){
  if(_sessionDead) return Promise.resolve('invalid');
  if(_refreshing) return _refreshing;
  _refreshing=_doRefreshSession().then(st=>{
    if(st==='invalid') killDeadSession();
    return st;
  }).finally(()=>{ _refreshing=null; });
  return _refreshing;
}
// جلسة ميتة: نمسح التوكنات ونعرض شاشة الدخول مرة واحدة — البيانات المحلية تفضل مكانها
function killDeadSession(){
  if(_sessionDead) return;
  _sessionDead=true;
  clearSession();
  setSyncStatus('⚠ انتهت الجلسة — سجّل الدخول', '#C62828');
  showLoginScreen('⚠ انتهت الجلسة — سجّل الدخول تاني بنفس حسابك. بياناتك محفوظة على الجهاز وهترجع كلها فورًا.');
}
async function _doRefreshSession(){
  const refresh=getRefreshToken();
  if(!refresh) return 'invalid';
  try{
    const res=await fetch(API_URL+'/api/auth/refresh',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({refreshToken:refresh})
    });
    if(!res.ok){
      // 429 (ضغط طلبات) أو خطأ سيرفر مؤقت = التوكن سليم، المشكلة مؤقتة — ما نقتلش الجلسة
      if(res.status===429 || res.status>=500) return 'network_error';
      // لو تبويب/نافذة تانية جدّدت في نفس اللحظة وحفظت توكن أحدث في localStorage — جرّبه قبل ما نعلن انتهاء الجلسة
      const current=getRefreshToken();
      if(current && current!==refresh){
        const st=await verifySession(getAccessToken());
        if(st==='ok') return 'ok';
      }
      return 'invalid';
    }
    const d=await res.json();
    // التوكنات بتتدوّر (rotation): القديم اتلغى على السيرفر — لازم نحفظ الجديد فورًا
    saveSession(d.data);
    return 'ok';
  }catch(e){ return 'network_error'; }
}
async function doLogin(){
  const email=document.getElementById('login-email').value.trim();
  const password=document.getElementById('login-password').value;
  const err=document.getElementById('login-error');
  const btn=document.getElementById('login-btn');
  err.textContent='';
  if(!email||!password){ err.textContent='⚠ اكتب الإيميل وكلمة المرور'; return; }
  btn.disabled=true; btn.textContent='جارِ الدخول...';
  try{
    const res=await fetch(API_URL+'/api/auth/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password})
    });
    const d=await res.json();
    if(!res.ok){
      err.textContent='❌ الإيميل أو كلمة المرور غلط';
      btn.disabled=false; btn.textContent='دخول';
      return;
    }
    // حساب مختلف عن آخر حساب استخدم الجهاز: بياناته المحلية ما تتنقلش للحساب الجديد
    const lastEmail=(localStorage.getItem('cea_last_user_email')||'').toLowerCase();
    const newEmail=String(d.data.user&&d.data.user.email||email).toLowerCase();
    if(lastEmail && lastEmail!==newEmail) wipeLocalAppData();
    localStorage.setItem('cea_last_user_email', newEmail);
    saveSession(d.data);
    _sessionDead=false; // جلسة جديدة سليمة — نسمح بالتجديد تاني
    // verifySession بتجيب grade/title/name/site من /me — doLogin ما بيستلمهاش من رد /login نفسه
    await verifySession(d.data.accessToken);
    hideLoginScreen();
    onAuthReady(false);
  }catch(e){
    err.textContent='❌ مفيش اتصال بالإنترنت — أول تسجيل دخول على الجهاز ده لازم يبقى فيه نت';
    btn.disabled=false; btn.textContent='دخول';
  }
}
async function doLogout(){
  if(!confirm('تسجيل الخروج من الحساب؟\n\nبيانات التطبيق هتتمسح من الجهاز ده (هي محفوظة على السيرفر وهترجع أول ما تسجّل دخول تاني).')) return;
  // نحاول نرفع أي شغل لسه ما اترفعش قبل المسح
  if(navigator.onLine && hasUnsyncedLocalData()){
    try{ await syncNow(); }catch(e){ /* نكمل */ }
    if(hasUnsyncedLocalData() && !confirm('⚠ فيه شغل لسه ما اترفعش للسيرفر وهيضيع لو خرجت دلوقتي.\n\nتخرج على أي حال؟')) return;
  } else if(!navigator.onLine && hasUnsyncedLocalData()){
    if(!confirm('⚠ إنت أوفلاين وفيه شغل لسه ما اترفعش — هيضيع لو خرجت دلوقتي.\n\nتخرج على أي حال؟')) return;
  }
  const rt=getRefreshToken();
  // إبطال الجلسة على السيرفر (لو فيه نت) — ومسح محلي في كل الأحوال
  if(rt){ fetch(API_URL+'/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:rt})}).catch(()=>{}); }
  wipeLocalAppData();
  clearSession();
  location.reload();
}
// (15 سبتمبر 2026) عرض البيانات المحلية فورًا — مستقل تمامًا عن الشبكة.
// كان كل الرسم جوّه onAuthReady، واللي مبيتنداش غير بعد "await verifySession" —
// يعني لو النت بطيء أو معلّق (مش مقطوع) المهندس يفضل قدام شاشة فاضية وسراكيه
// موجودة على جهازه في localStorage. وده كان سبب بلاغات "كل حاجة اتمسحت".
// idempotent: onAuthReady بتعيد الرسم بعدين عادي، والحارس بيمنع تكرار إخفاء السplash.
let _localRendered=false;
function renderLocalNow(){
  if(_localRendered) return;
  _localRendered=true;
  try{
    // الرسم بيحصل دلوقتي ورا الـ splash، بس الـ splash نفسه يستنى لحد ما شريط التحميل يكمل
    // (أنيميشن 2 ثانية من فتح الصفحة) — كان بيختفي فورًا فالشريط يبان ثانية ويطير
    const s=document.getElementById('splash');
    if(s){ setTimeout(()=>{ s.classList.add('hide'); setTimeout(()=>s.remove(),700); }, Math.max(0, 2000-performance.now())); }
    const el=document.getElementById('account-email-display');
    if(el) el.textContent=getCurrentUserEmail()||'';
    const today=todayYMD();
    const fd=document.getElementById('f-date'); if(fd){ fd.value=today; autoSetDay(today); }
    const ird=document.getElementById('ir-date'); if(ird) ird.value=today;
    const td=document.getElementById('todo-date'); if(td&&!td.value) td.value=today;
    const dd=document.getElementById('daily-date'); if(dd&&!dd.value){ dd.value=today; autoSetDailyDay(today); }
    populateDropdowns(); renderRecords(); renderIR(); renderTodo(); renderSummary(); initSiteTab();
    renderHome(); applyModuleVisibility(); updateLoadOlderUI(); renderBell();
  }catch(e){ /* الرسم المبكر مايوقفش الإقلاع أبدًا */ }
}
async function initAuthGate(){
  const token=getAccessToken();
  const email=getCurrentUserEmail();
  if(token&&email){
    renderLocalNow(); // البيانات تبان قبل أي نداء شبكة
    const status=await verifySession(token);
    if(status==='ok'){ onAuthReady(false); return; }
    if(status==='network_error'){ onAuthReady(true); return; }
    const rstatus=await tryRefreshSession();
    if(rstatus==='ok'){ onAuthReady(false); return; }
    if(rstatus==='network_error'){ onAuthReady(true); return; }
    clearSession();
    showLoginScreen('⚠ انتهت الجلسة — سجّل الدخول تاني بنفس حسابك. بياناتك محفوظة على الجهاز وهترجع كلها فورًا.');
  } else {
    showLoginScreen();
  }
}
function onAuthReady(offline){
  const el=document.getElementById('account-email-display');
  if(el) el.textContent=getCurrentUserEmail()||'';
  const codeEl=document.getElementById('sync-project-code-display');
  if(codeEl) codeEl.textContent=getDeviceCode();
  const banner=document.getElementById('offline-banner');
  if(banner) banner.style.display=offline?'block':'none';
  if(offline) showToast('⚠ وضع أوفلاين — الاتصال بالخادم غير متاح دلوقتي، شغلك بيتحفظ محليًا وهيتزامن أول ما النت يرجع', true);
  // مواعيد الإرسال/الاعتماد — محتاجينها من أول لحظة عشان الكارت يبان والأزرار تتقفل قبل ما المستخدم يدوس
  if(!offline){ loadWindows(); loadProjects(); }
  setTimeout(()=>{const s=document.getElementById('splash');if(s){s.classList.add('hide');setTimeout(()=>s.remove(),700);}},Math.max(600, 2000-performance.now()));
  const today=todayYMD();
  document.getElementById('f-date').value=today; autoSetDay(today);
  document.getElementById('ir-date').value=today;
  const td=document.getElementById('todo-date'); if(td&&!td.value) td.value=today;
  const dd=document.getElementById('daily-date'); if(dd&&!dd.value){ dd.value=today; autoSetDailyDay(today); }
  populateDropdowns();renderRecords();renderIR();renderTodo();renderSummary();initSiteTab();
  renderHome();
  applyModuleVisibility();
  updateLoadOlderUI();
  renderBell();
  if(!offline){ initialSync().then(()=>refreshServerOldest()); loadNotifications(); }
}
// ============ END AUTH ============

// ============ محرك المزامنة ============
// نافذة السجلات المُحمّلة افتراضيًا (نفس سلوك النسخة القديمة)
const SYNC_WINDOW_MONTHS = 2;
function isoDateMonthsAgo(months){
  const d=new Date();
  d.setMonth(d.getMonth()-months);
  return d.toISOString().split('T')[0];
}

// snapshot: hash لكل عنصر وقت آخر مزامنة ناجحة — أساس اكتشاف الجديد/المتغيّر/المحذوف
let _syncSnap=JSON.parse(localStorage.getItem('cea_sync_snapshot')||'{}');
function saveSyncSnap(){ localStorage.setItem('cea_sync_snapshot', JSON.stringify(_syncSnap)); }
function snapOf(entity){ if(!_syncSnap[entity]) _syncSnap[entity]={}; return _syncSnap[entity]; }
// كل الكيانات اللي ليها snapshot (mirrorPushById + mirrorPushByName) — تُستخدم في تفضية الـsnapshot
// بعد الاستعادة من ملف من غير ما نمسح الأوبچكت نفسه (initialSync بيفرّق بين الاتنين)
const SYNC_ENTITIES=['records','ir','equipment','todos','exec','daily','contractors','places','inspectors','items'];

// hash نصي بسيط (djb2) — كافي لاكتشاف التغيير، مش للأمان
function syncHash(obj){
  const s=JSON.stringify(obj);
  let h=5381;
  for(let i=0;i<s.length;i++){ h=((h*33)^s.charCodeAt(i))>>>0; }
  return h.toString(36);
}
// الـ id المحلي (Date.now() ≈ 1.7e12) دايمًا أكبر بكتير من ids السيرفر (auto-increment صغيرة)
function isLocalId(id){ return Number(id)>=1e12; }
function clampPct(v,min){ return Math.min(100, Math.max(min, Math.round(Number(v)||min))); }

// ── تحويل العناصر المحلية لأجسام API (نفس الدوال بتُستخدم لحساب الـ hash) ──
function recordBody(r){
  return { day:r.day||'', date:r.date||'', contractor:r.contractor||'', spec:r.spec||'',
    qty:Number(r.qty)||0, qtyType:r.qtyType||'يومية', price:Number(r.price)||0,
    discount:Number(r.discount)||0, place:r.place||'', notes:r.notes||'',
    deductOn:Array.isArray(r.deductOn)?r.deductOn:(r.deductOn?[r.deductOn]:[]),
    deductNote:r.deductNote||'', done:!!r.done,
    rentRequestId:r.rentRequestId!=null?Number(r.rentRequestId):null };
}
function contractorBody(c){
  return { name:c.name, spec:c.spec||'—',
    rate:(c.rate!==''&&c.rate!=null)?Number(c.rate):null, rateType:c.rateType||'يومية',
    // isLabor بس لو موجودة على المقاول: نسخة الجهاز القديمة (قبل 19 سبتمبر) مافيهاش المفتاح، ولو بعتناه false
    // الهاش هيختلف عن الـsnapshot فالأدمن يرفع كل المقاولين "مش عمالة" قبل السحب ويمسح علامة الـmigration
    ...('isLabor' in c ? {isLabor:!!c.isLabor} : {}) };
}
function itemBody(it){
  return { cat:it.cat||'عام', name:it.name,
    stages:(it.stages||[]).map(s=>({name:s.name, pct:clampPct(s.pct!=null?s.pct:s.weight,1)})) };
}
function todoBody(t){
  return { date:t.date||'', notes:t.notes||'', place:t.place||'', priority:t.priority||'عادي', done:!!t.done };
}
function irBody(r){
  return { date:r.date||'', item:r.item||'', place:r.place||'', inspector:r.inspector||'',
    status:r.status||'—', notes:r.notes||'' };
}
// سركي المعدات — المدة (minutes) مش في الـ body: السيرفر بيحسبها من الوقت، والجهاز بيحسب نفس القيمة محليًا
function eqBody(r){
  return { date:r.date||'', day:r.day||'', contractor:r.contractor||'', equipment:r.equipment||'', place:r.place||'',
    timeFrom:r.timeFrom||'', timeTo:r.timeTo||'', works:r.works||'', notes:r.notes||'',
    deductOn:Array.isArray(r.deductOn)?r.deductOn:[], deductNote:r.deductNote||'' };
}
function mapApiEquipment(r){
  return { id:Number(r.id), date:ymdOf(r.date), day:r.day||'', contractor:r.contractor||'', equipment:r.equipment||'', place:r.place||'',
    timeFrom:r.timeFrom||'', timeTo:r.timeTo||'', minutes:Number(r.minutes)||0, works:r.works||'', notes:r.notes||'',
    deductOn:Array.isArray(r.deductOn)?r.deductOn:[], deductNote:r.deductNote||'' };
}
function execBody(e){
  const stages=e.stages||[];
  return { item:e.item||'', place:e.place||'', pct:Number(e.pct)||0, notes:e.notes||'',
    stages:stages.map((s,i)=>({ name:s.name, pct:clampPct(s.pct!=null?s.pct:s.weight,0),
      done:!!(e.stageDone&&e.stageDone[i]) })) };
}
function dailyBody(d){
  return { date:d.date||'', day:d.day||'', contractor:d.contractor||'', spec:d.spec||'',
    work:d.work||'', place:d.place||'', photoFileId:d.photoFileId||null };
}

// ── رفع mirror للكيانات اللي ليها id محلي (سجلات/مهام/IR/موقف/تقارير يومية) ──
// بيرجّع عدد الأخطاء؛ بيكمل على باقي العناصر لو عنصر فشل
// حماية من التكرار: قبل رفع أي عنصر بـ id محلي كـ "جديد"، بنجيب نسخة السيرفر ونبحث عن
// عنصر بنفس المحتوى بالظبط (hash متطابق) ومش مربوط بأي عنصر محلي — لو موجود بنربطه بدل ما نعيد رفعه.
// (الحالة: جهاز عليه بيانات قديمة من قبل الترحيل بيزامن أول مرة والسجلات موجودة على السيرفر أصلًا)
async function fetchServerHashIndex(base, bodyFn, serverToLocal){
  let rows=[];
  if(base==='/api/records'){
    let page=1, total=Infinity;
    while(rows.length<total){
      const res=await api('GET', base+'?limit=500&page='+page);
      total=res.data.total; if(!res.data.rows.length) break;
      rows=rows.concat(res.data.rows); page++;
    }
  } else {
    rows=(await api('GET', base)).data;
  }
  const idx=new Map(); // hash → [serverIds]
  for(const r of rows){
    const h=syncHash(bodyFn(serverToLocal(r)));
    if(!idx.has(h)) idx.set(h,[]);
    idx.get(h).push(Number(r.id));
  }
  return idx;
}
// تحويل صف السيرفر لنفس شكل العنصر المحلي (عشان نحسب نفس الـ hash)
const SERVER_TO_LOCAL={
  '/api/records': r=>mapApiRecord(r),
  '/api/ir-records': r=>({id:Number(r.id), date:ymdOf(r.date), item:r.item, place:r.place, inspector:r.inspector, status:r.status, notes:r.notes||''}),
  '/api/equipment-records': r=>mapApiEquipment(r),
  '/api/todos': r=>({id:Number(r.id), date:ymdOf(r.date), notes:r.notes, place:r.place||'', priority:r.priority, done:!!r.done}),
  '/api/exec-records': r=>({id:Number(r.id), item:r.item, place:r.place, pct:Number(r.pct), notes:r.notes||'', stages:r.stages||[], stageDone:r.stageDone||[]}),
  '/api/daily-records': r=>({id:Number(r.id), date:ymdOf(r.date), day:r.day, contractor:r.contractor||'', spec:r.spec||'', work:r.work||'', place:r.place||'', photoFileId:r.photoFileId?Number(r.photoFileId):null}),
};

const SYNC_FIELD_AR={day:'اليوم',date:'التاريخ',contractor:'المقاول',spec:'المهنة',qty:'الكمية',qtyType:'نوع الكمية',price:'السعر',discount:'الخصم',place:'المكان',notes:'الملاحظات',deductOn:'بالخصم على',deductNote:'ملاحظة الخصم'};
async function mirrorPushById(entity, arr, base, bodyFn){
  const snap=snapOf(entity);
  const newSnap={};
  let errors=0;
  // فهرس محتوى السيرفر — يُبنى مرة واحدة فقط لو فيه عناصر محلية جديدة (توفير طلبات)
  let serverIdx=null;
  const staleIds=new Set(); // سجلات محلية بـ id سيرفر ما بقاش موجود (404) — بتتشال
  const usedServerIds=new Set(arr.filter(x=>!isLocalId(x.id)).map(x=>Number(x.id)));
  for(const item of arr){
    try{
      const b=bodyFn(item);
      const h=syncHash(b);
      if(isLocalId(item.id)){
        if(!serverIdx && SERVER_TO_LOCAL[base]) serverIdx=await fetchServerHashIndex(base, bodyFn, SERVER_TO_LOCAL[base]);
        const match=serverIdx ? (serverIdx.get(h)||[]).find(id=>!usedServerIds.has(id)) : null;
        if(match){
          // موجود على السيرفر بنفس المحتوى → اربط بدل ما ترفع نسخة تانية
          item.id=match; usedServerIds.add(match);
          newSnap[item.id]=h;
        } else {
          const res=await api('POST', base, b);
          item.id=Number(res.data.id);   // استبدال الـ id المحلي بـ id السيرفر نهائيًا
          usedServerIds.add(item.id);
          newSnap[item.id]=h;
        }
        delete item.syncError;
      } else if(snap[item.id]!==h){
        await api('PUT', base+'/'+item.id, b);
        newSnap[item.id]=h;
        delete item.syncError;
      } else {
        newSnap[item.id]=h;
      }
    }catch(e){
      if(e.status===404 && !isLocalId(item.id)){
        // السجل اتمسح من السيرفر (تنظيف/حذف من جهاز تاني) — السيرفر مرجع: نشيله محليًا
        staleIds.add(String(item.id));
      } else {
        errors++; if(!isLocalId(item.id)) newSnap[item.id]=snap[item.id];
        // السيرفر رفض البيانات نفسها (400): السبب يتخزن على السجل ويظهر على كارته — بدل ما يفضل
        // "لسه ما اترفعش" من غير ما المهندس يعرف ليه (كان بيتعاد كل 20 ثانية للأبد بصمت)
        if(e.status===400){
          const d=Array.isArray(e.details)&&e.details.length ? e.details.slice(0,2).map(x=>SYNC_FIELD_AR[x.path]||x.path?(SYNC_FIELD_AR[x.path]||x.path)+': '+x.message:x.message).join(' · ') : e.message;
          item.syncError=d;
        }
      }
    }
  }
  if(staleIds.size){
    const keep=arr.filter(x=>!staleIds.has(String(x.id)));
    arr.length=0; arr.push(...keep); // تعديل في المكان عشان المرجع (records/todos/...) يفضل نفسه
  }
  // الموجود في الـ snapshot ومش موجود محليًا = اتحذف محليًا → احذفه من السيرفر
  const localIds=new Set(arr.map(x=>String(x.id)));
  for(const id of Object.keys(snap)){
    if(!localIds.has(id)){
      try{ await api('DELETE', base+'/'+id); }catch(e){ if(e.status!==404) errors++; }
    }
  }
  _syncSnap[entity]=newSnap;
  return errors;
}

// ── رفع mirror للكيانات المُعرّفة بالاسم (مقاولين/استشاريين/بنود) ──
async function mirrorPushByName(entity, arr, base, bodyFn, nameOf, removeLocal){
  const snap=snapOf(entity);
  const newSnap={};
  let errors=0;
  const serverRows=(await api('GET', base)).data;
  const serverByName=new Map(serverRows.map(r=>[nameOf(r), r]));
  const remoteDeleted=new Set();
  for(const item of arr){
    try{
      const b=bodyFn(item);
      const h=syncHash(b);
      const name=b.name;
      const existing=serverByName.get(name);
      if(!existing){
        // مش موجود على السيرفر: لو متزامن قبل كده ومفيش تعديل محلي → اتحذف من السيرفر/جهاز تاني
        // → نحذفه محليًا بدل ما نعيد إحياءه. لو جديد أو متعدل محليًا → يترفع (التعديل المحلي بيكسب).
        // بنقبل كمان بصمة الشكل القديم {name} فقط (قبل إضافة خانة الملاحظة) — عشان ذاكرة
        // الأجهزة اللي لسه متحدثة ما تتفسرش غلط كـ"تعديل محلي" فتعيد إحياء المحذوف
        if(snap[name]===h || snap[name]===syncHash({name})){ remoteDeleted.add(name); continue; }
        await api('POST', base, b);
      }
      else if(snap[name]!==h){ await api('PUT', base+'/'+existing.id, b); }
      newSnap[name]=h;
    }catch(e){ errors++; if(e.status===409) showToast(e.message,true); }
  }
  if(remoteDeleted.size && typeof removeLocal==='function'){ try{ removeLocal(remoteDeleted); }catch(e){} }
  const localNames=new Set(arr.map(x=>bodyFn(x).name));
  for(const [name,row] of serverByName){
    if(!localNames.has(name)){
      // نحذف من السيرفر فقط لو الاسم كان معروف للجهاز ده (موجود في snapshot آخر مزامنة) —
      // يعني المستخدم حذفه هنا فعلًا. غير كده فهو صف جديد اتضاف من جهاز تاني:
      // نسيبه في حاله، والسحب اللي بييجي بعد الرفع (pullManagedData) هيضيفه محليًا.
      // (من غير الشرط ده: جهاز بنسخة قديمة كان بيمسح من السيرفر أي إضافة جديدة من جهاز تاني)
      if(snap[name]===undefined) continue;
      try{ await api('DELETE', base+'/'+row.id); }catch(e){ if(e.status!==404) errors++; }
    }
  }
  _syncSnap[entity]=newSnap;
  return errors;
}

// ── التقارير اليومية: رفع الصورة أولاً (dataURL → ملف) ثم السجل ──
async function uploadDailyPhotoIfNeeded(d){
  if(!d.photo || d.photoFileId) return;
  const blob=await (await fetch(d.photo)).blob();
  const fd=new FormData();
  fd.append('file', blob, 'daily-'+(d.date||'photo')+'.jpg');
  const res=await fetch(API_URL+'/api/files',{
    method:'POST',
    headers:{'Authorization':'Bearer '+getAccessToken()},
    body:fd
  });
  if(!res.ok) throw new Error('فشل رفع الصورة');
  const j=await res.json();
  d.photoFileId=Number(j.data.id);
}
async function pushDailyRecords(){
  let errors=0;
  for(const d of dailyRecords){
    try{ await uploadDailyPhotoIfNeeded(d); }catch(e){ errors++; }
  }
  errors+=await mirrorPushById('daily', dailyRecords, '/api/daily-records', dailyBody);
  // (M11) بعد ما الصورة ترفع والسجل يتزامن: نشيل الـ base64 من التخزين المحلي —
  // الصور كانت بتملى حصة localStorage (~5MB) فتضيع بيانات بصمت. العرض بقى عند الطلب من السيرفر.
  dailyRecords.forEach(d=>{ if(d.photo && d.photoFileId && !isLocalId(d.id)) d.photo=null; });
  return errors;
}

// ── البيانات المُدارة من الأدمن: سحب دايمًا (السيرفر أولوية) ──
// الأماكن + PIN + التوقيع — المهندس بياخدهم من السيرفر ومايرفعهمش
// تحديث snapshot كيان اسمي بنسخة السيرفر — عشان الحذف المحلي اللاحق يتزامن، والجديد القادم من جهاز تاني ما يتفسرش غلط
function refreshNameSnap(entity, list, bodyFn){
  const s=snapOf(entity); const names=new Set();
  list.forEach(x=>{ const b=bodyFn(x); names.add(b.name); s[b.name]=syncHash(b); });
  Object.keys(s).forEach(n=>{ if(!names.has(n)) delete s[n]; });
}
async function pullManagedData(){
  // المقاولون: بيتسحبوا للجميع — الأدمن كمان (كان بيرفع بس، فجهاز أدمن تاني ما كانش بيشوف الجديد إلا بإعادة دخول)
  const ctrRes=await api('GET','/api/contractors');
  const serverCtr=ctrRes.data.map(c=>({name:c.name, spec:c.spec||'—', rate:c.rate!=null?String(Number(c.rate)):'', rateType:c.rateType||'يومية', isLabor:!!c.isLabor}));
  if(JSON.stringify(serverCtr)!==JSON.stringify(contractors)) contractors=serverCtr;
  refreshNameSnap('contractors', contractors, contractorBody);
  // الاستشاريون والبنود: نفس الفكرة — إضافات جهاز تاني توصل في المزامنة الدورية مش بس عند الدخول
  try{
    const inspRes=await api('GET','/api/inspectors');
    const serverInsp=inspRes.data.map(i=>i.name);
    if(JSON.stringify(serverInsp)!==JSON.stringify(inspectors)) inspectors=serverInsp;
    refreshNameSnap('inspectors', inspectors.map(n=>({name:n})), i=>({name:i.name}));
  }catch(e){}
  try{
    const itsRes=await api('GET','/api/items');
    const serverIts=itsRes.data.map(it=>({cat:it.cat, name:it.name, stages:it.stages||[]}));
    if(JSON.stringify(serverIts)!==JSON.stringify(items)) items=serverIts;
    refreshNameSnap('items', items, itemBody);
  }catch(e){}
  const placesRes=await api('GET','/api/places');
  const serverPlaces=placesRes.data.map(p=>p.name);
  if(JSON.stringify(serverPlaces)!==JSON.stringify(places)){
    places=serverPlaces;
  }
  // ملاحظات الأماكن: السيرفر مرجعها دايمًا (بيحددها الأدمن)
  const serverNotes={};
  placesRes.data.forEach(p=>{ if(p.note) serverNotes[p.name]=p.note; });
  if(JSON.stringify(serverNotes)!==JSON.stringify(placeNotes)){
    placeNotes=serverNotes; savePlaceNotes();
    if(typeof updatePlaceNoteIcon==='function') updatePlaceNoteIcon();
  }
  // مشروع كل مكان: السيرفر مرجعه دايمًا كمان
  const serverSites={};
  placesRes.data.forEach(p=>{ if(p.site) serverSites[p.name]=p.site; });
  if(JSON.stringify(serverSites)!==JSON.stringify(placeSites)){
    placeSites=serverSites; savePlaceSites();
  }
  // حدّث snapshot الأماكن بنسخة السيرفر — عشان لو المستخدم حذف مكان محليًا بعدين، الحذف يتزامن صح
  // (mirrorPushByName مش بيحذف من السيرفر غير الأسماء المعروفة في الـ snapshot)
  const psnap=snapOf('places');
  const srvPlaceNames=new Set(serverPlaces);
  placesRes.data.forEach(p=>{ psnap[p.name]=syncHash({name:p.name, note:p.note||'', site:p.site||DEFAULT_PROJECT_ID}); });
  Object.keys(psnap).forEach(n=>{ if(!srvPlaceNames.has(n)) delete psnap[n]; });
  saveSyncSnap();
  const st=(await api('GET','/api/account/settings')).data;
  if(st.pinHash) setPinHash(st.pinHash);
  if(Array.isArray(st.enabledModules)) setEnabledModules(st.enabledModules);
  if(Array.isArray(st.enabledFeatures)) setEnabledFeatures(st.enabledFeatures);
  if(st.signatureFileId){
    try{
      const res=await fetch(API_URL+'/api/files/'+st.signatureFileId+'/content',{
        headers:{'Authorization':'Bearer '+getAccessToken()}
      });
      if(res.ok){
        const blob=await res.blob();
        const dataUrl=await new Promise(resolve=>{
          const fr=new FileReader(); fr.onload=()=>resolve(fr.result); fr.readAsDataURL(blob);
        });
        engineerSignature=dataUrl;
        localStorage.setItem('saraki_signature', engineerSignature);
        if(typeof renderSignatureSettings==='function') renderSignatureSettings();
      }
    }catch(e){ /* التوقيع هيتسحب في مزامنة جاية */ }
  }
}
// الأدمن بس هو اللي بيرفع الأماكن (المهندس هيترفض له 403 أصلاً)
// المقاولون بقوا بيانات يديرها الأدمن (زي الأماكن): الأدمن يرفع فروقه، والمهندس يسحب فقط
async function pushContractorsIfAdmin(){
  if(!isAdmin()) return 0;
  return mirrorPushByName('contractors', contractors, '/api/contractors', contractorBody, r=>r.name,
    names=>{ contractors=contractors.filter(c=>!names.has(c.name)); });
}
async function pushPlacesIfAdmin(){
  if(!isAdmin()) return 0;
  return mirrorPushByName('places', places.map(name=>({name})), '/api/places', p=>({name:p.name, note:placeNotes[p.name]||'', site:placeProjectId(p.name)}), r=>r.name,
    names=>{ places=places.filter(n=>!names.has(n)); names.forEach(n=>{ delete placeNotes[n]; delete placeSites[n]; }); savePlaceNotes(); savePlaceSites(); });
}

// ── سحب ودمج التغييرات القادمة من أجهزة تانية (بعد الرفع) ──
// القاعدة: التعديل المحلي غير المرفوع بيكسب دايمًا؛ غير كده السيرفر مرجع.
//  - صف سيرفر مش موجود محليًا → جديد من جهاز تاني → يضاف
//  - صف موجود والنسخة المحلية زي الـ snapshot (مفيش تعديل محلي) والسيرفر مختلف → ناخد نسخة السيرفر
//  - صف محلي بـ id سيرفر مش موجود في نتيجة السيرفر (وجوه نطاق الجلب) وغير معدّل محليًا → اتحذف من جهاز تاني → يتشال
async function mergePullById(entity, arr, base, bodyFn, mapFn, opts){
  const scoped = opts && opts.recordsWindow;
  let serverRows=[];
  if(scoped){
    const from = localOldestDate() || isoDateMonthsAgo(SYNC_WINDOW_MONTHS);
    let page=1, total=Infinity;
    while(serverRows.length<total){
      const res=await api('GET', base+'?date_from='+from+'&limit=500&page='+page);
      total=res.data.total; if(!res.data.rows.length) break;
      serverRows=serverRows.concat(res.data.rows); page++;
    }
    opts._from = from;
  } else {
    serverRows=(await api('GET', base)).data;
  }
  const snap=snapOf(entity);
  const byId=new Map(arr.map(x=>[String(x.id), x]));
  let changed=0;
  const serverIds=new Set();
  for(const raw of serverRows){
    const mapped=mapFn(raw);
    const sid=String(mapped.id);
    serverIds.add(sid);
    const local=byId.get(sid);
    const serverHash=syncHash(bodyFn(mapped));
    if(!local){
      arr.push(mapped); snap[mapped.id]=serverHash; changed++;
    } else {
      const localHash=syncHash(bodyFn(local));
      if(localHash!==serverHash && snap[sid]===localHash){
        // اتعدل على السيرفر (من جهاز تاني) والمحلي من غير تعديل → ناخد نسخة السيرفر
        Object.assign(local, mapped); snap[sid]=serverHash; changed++;
      }
    }
  }
  // المحذوف من جهاز تاني
  for(let i=arr.length-1;i>=0;i--){
    const x=arr[i];
    if(isLocalId(x.id)) continue;               // لسه ما اترفعش — مش موضوعنا
    if(serverIds.has(String(x.id))) continue;   // موجود
    if(scoped && x.date && x.date < opts._from) continue; // خارج نطاق الجلب — ما نحكمش عليه
    if(snap[x.id]===syncHash(bodyFn(x))){       // غير معدّل محليًا → الحذف جه من السيرفر
      arr.splice(i,1); delete snap[x.id]; changed++;
    }
  }
  return changed;
}

// ── المزامنة الكاملة ──
let _syncing=false;
let _suppressAutoSync=false;
// حماية من إعادة رفع بيانات قديمة: لو الجهاز عنده سجلات بـ ids سيرفر والسيرفر ما يعرفهاش
// (اتمسحت/اتنضفت هناك)، السيرفر هو المرجع — نسحب النسخة النظيفة بدل ما نعيد رفع القديم
// يتنفّذ مرة واحدة بس كل تشغيل للتطبيق: الفحص بيبعت طلب لكل سجل في العيّنة،
// ولو اتنفّذ مع كل مزامنة (كل 5 دقايق + بعد كل حفظ) بيغرق السيرفر ويوصل لحد الطلبات (429).
// "السيرفر اتنضف" حدث نادر جدًا — فحص واحد عند بداية الجلسة كفاية.
let _authCheckDone=false;
async function serverIsAuthoritative(){
  if(_authCheckDone) return false;
  _authCheckDone=true;
  const serverIds=records.filter(r=>!isLocalId(r.id)).map(r=>Number(r.id));
  if(serverIds.length<10) return false;
  // عيّنة أصغر (8) موزعة على كل القائمة — تكفي للكشف بربع عدد الطلبات
  const step=Math.max(1, Math.floor(serverIds.length/8));
  const sample=serverIds.filter((_,i)=>i%step===0).slice(0,8);
  let missing=0, checked=0;
  for(const id of sample){
    try{ await api('GET','/api/records/'+id); checked++; }
    catch(e){
      if(e.status===404){ missing++; checked++; }
      else return false; // 429/شبكة/خطأ سيرفر — مش دليل على تنضيف، نسيب البيانات المحلية زي ما هي
    }
  }
  return checked>0 && missing/checked > 0.2; // أكتر من 20% مش موجودين = السيرفر اتنضف
}

async function syncNow(){
  if(_syncing || !getAccessToken()) return;
  if(!navigator.onLine){ setSyncStatus('⚠ أوفلاين — هتتزامن أول ما النت يرجع', 'var(--muted)'); return; }
  _syncing=true;
  setSyncStatus('⏳ جاري المزامنة...');
  try{
    if(await serverIsAuthoritative()){
      setSyncStatus('⏳ السيرفر اتحدّث — جاري تحميل النسخة الجديدة...');
      // الشغل المحلي اللي لسه ما اترفعش (id محلي) ما يتمسحش — نحتفظ بيه ونرجّعه بعد السحب ليترفع عاديًا
      const keep={
        records:records.filter(r=>isLocalId(r.id)), todos:todos.filter(t=>isLocalId(t.id)),
        irRecords:irRecords.filter(r=>isLocalId(r.id)), execRecords:execRecords.filter(e=>isLocalId(e.id)),
        dailyRecords:dailyRecords.filter(d=>isLocalId(d.id)),
      };
      await pullAll({fullHistory:true}); // كل السجلات — عشان نستبدل أي نسخة محلية قديمة بالكامل
      const kept=keep.records.length+keep.todos.length+keep.irRecords.length+keep.execRecords.length+keep.dailyRecords.length;
      if(kept){
        records.push(...keep.records); todos.push(...keep.todos); irRecords.push(...keep.irRecords);
        execRecords.push(...keep.execRecords); dailyRecords.push(...keep.dailyRecords);
        saveAll(); // بيجدول مزامنة ترفع المحتفَظ بيه
        renderRecords(); renderTodo(); renderIR(); renderSummary();
      }
      setSyncStatus('✅ تم التحديث من السيرفر ('+records.length+' سجل)', '#2E7D32');
      showToast('✅ تم تحديث بياناتك من السيرفر'+(kept?' — و'+kept+' عنصر محلي هيترفع دلوقتي':''));
      return;
    }
    let errors=0;
    errors+=await pushContractorsIfAdmin();
    errors+=await mirrorPushByName('inspectors', inspectors.map(n=>({name:n})), '/api/inspectors', i=>({name:i.name}), r=>r.name,
      names=>{ inspectors=inspectors.filter(n=>!names.has(n)); });
    errors+=await mirrorPushByName('items', items, '/api/items', itemBody, r=>r.name,
      names=>{ items=items.filter(it=>!names.has(it.name)); });
    errors+=await pushPlacesIfAdmin();
    // كل موديول على حسب تفعيله للمستخدم (المعطّل بيرجع 403 من السيرفر — ما نضربوش أصلًا)
    if(moduleEnabled('records'))    errors+=await mirrorPushById('records', records, '/api/records', recordBody);
    if(moduleEnabled('ir'))         errors+=await mirrorPushById('ir', irRecords, '/api/ir-records', irBody);
    if(moduleEnabled('equipment'))  errors+=await mirrorPushById('equipment', equipmentRecords, '/api/equipment-records', eqBody);
    if(moduleEnabled('todo'))       errors+=await mirrorPushById('todos', todos, '/api/todos', todoBody);
    if(moduleEnabled('site_exec'))  errors+=await mirrorPushById('exec', execRecords, '/api/exec-records', execBody);
    if(moduleEnabled('site_daily')) errors+=await pushDailyRecords();
    // ⬇ الاتجاه التاني: سحب اللي اتغير من أجهزة تانية — كل كيان لوحده، فشل واحد ما يوقفش الباقي
    let pulled=0;
    const tryPull=async fn=>{ try{ pulled+=await fn(); }catch(e){ /* هيتحاول في الدورة الجاية */ } };
    if(moduleEnabled('records'))   await tryPull(()=>mergePullById('records', records, '/api/records', recordBody, mapApiRecord, {recordsWindow:true}));
    if(moduleEnabled('ir'))        await tryPull(()=>mergePullById('ir', irRecords, '/api/ir-records', irBody, r=>({id:Number(r.id), date:ymdOf(r.date), item:r.item, place:r.place, inspector:r.inspector, status:r.status, notes:r.notes||''})));
    if(moduleEnabled('equipment')) await tryPull(()=>mergePullById('equipment', equipmentRecords, '/api/equipment-records', eqBody, mapApiEquipment));
    if(moduleEnabled('todo'))      await tryPull(()=>mergePullById('todos', todos, '/api/todos', todoBody, t=>({id:Number(t.id), date:ymdOf(t.date), notes:t.notes, place:t.place||'', priority:t.priority, done:!!t.done})));
    if(moduleEnabled('site_exec')) await tryPull(()=>mergePullById('exec', execRecords, '/api/exec-records', execBody, e=>({id:Number(e.id), item:e.item, place:e.place, pct:Number(e.pct), notes:e.notes||'', stages:e.stages||[], stageDone:e.stageDone||[], updated:e.updated})));
    await pullManagedData();
    saveSyncSnap();
    _suppressAutoSync=true; saveAll(); _suppressAutoSync=false;
    populateDropdowns();
    if(pulled>0){
      renderRecords(); renderIR(); renderTodo(); renderExec(); renderHome(); renderEquipment();
      if(typeof renderDashboard==='function') renderDashboard();
    }
    refreshServerOldest(); // يحدّث ظهور زرار "تحميل سجلات أقدم" حسب واقع السيرفر
    // إبلاغ السيرفر بإحصاءات الجهاز (عدد السراكي محليًا + اللي لسه ما اترفعش) — الأدمن بيشوفها في إدارة الحسابات
    if(moduleEnabled('records')){
      api('POST','/api/account/sync-stats',{localRecords:records.length, unsynced:records.filter(r=>isLocalId(r.id)).length}).catch(()=>{});
    }
    // (7 سبتمبر 2026 — قرار صاحب المشروع) تحذيرات "ما اترفعش/اترفض" للأدمن فقط:
    // المهندس بيشوف حالة هادية، والأدمن بيشوف العدد هنا والتفاصيل في سجل النشاط وكارت الحساب
    if(errors>0 && isAdmin()){
      setSyncStatus('⚠ اتزامن مع '+errors+' خطأ — هيتحاول تاني تلقائيًا', '#C62828');
    } else {
      setSyncStatus('✅ متزامن ('+new Date().toLocaleTimeString('ar-EG')+')', '#2E7D32');
    }
  }catch(e){
    if(isAdmin()) setSyncStatus('⚠ فشلت المزامنة — شغلك محفوظ محليًا وهيتزامن تلقائيًا', '#C62828');
    else setSyncStatus('💾 شغلك محفوظ على الجهاز — هيتزامن تلقائيًا', 'var(--muted)');
  }finally{
    _syncing=false;
  }
}

// مزامنة تلقائية بعد أي حفظ (debounce 3 ثواني) — بتتنادى من saveAll()
let _syncTimer=null;
function scheduleSync(){
  if(_suppressAutoSync || !getAccessToken()) return;
  if(_syncTimer) clearTimeout(_syncTimer);
  _syncTimer=setTimeout(()=>{ _syncTimer=null; syncNow(); }, 3000);
}
// أول ما النت يرجع: زامن فورًا
window.addEventListener('online', ()=>{ if(getAccessToken()) syncNow(); });
// كل 5 دقايق والتطبيق مفتوح — عشان تغييرات الأجهزة التانية توصل من غير ما تعمل حاجة
setInterval(()=>{ if(getAccessToken() && navigator.onLine && !document.hidden) syncNow(); }, 5*60*1000);
// وأول ما ترجع للتطبيق (من الخلفية/تاب تاني) — أحدث نسخة على طول
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden && getAccessToken() && navigator.onLine) syncNow(); });

// ── السحب الكامل (استعادة من السيرفر — بيستبدل البيانات المحلية) ──
async function pullAll(opts){
  // fullHistory: سحب كل السجلات بدل آخر شهرين (يُستخدم عند إعادة المزامنة بعد تنظيف السيرفر)
  const fullHistory = !!(opts && opts.fullHistory);
  // (15 سبتمبر 2026) النافذة تكبر ومتضيقش أبدًا.
  // كان cutoff دايمًا "النهاردة ناقص شهرين"، فكل سحب كامل بيرمي التوسيع اللي المهندس
  // عمله بـ"تحميل أقدم" — وسجلاته القديمة تختفي من العرض بعد أي reload/تحديث نسخة،
  // فيفتكر إنها اتمسحت. (الجهاز اللي سحب من زمان كان بيبان عنده سجلات أكتر من اللي سحب النهاردة!)
  // دلوقتي بنسحب من أقدم تاريخ بين النافذة الافتراضية واللي المهندس وسّعه بنفسه.
  const win=isoDateMonthsAgo(SYNC_WINDOW_MONTHS);
  const cutoff=(recordsOldestLoaded && recordsOldestLoaded < win) ? recordsOldestLoaded : win;

  // السجلات: نافذة آخر شهرين (أو الكل)، مع pagination
  // الحسابات اللي مالهاش وحدة "السراكي" (المعتمدين مثلًا) السيرفر بيرجّع لها 403 —
  // ما ينفعش نطلبها أصلًا، وإلا المزامنة كلها بتفشل وتظهر "تعذر الاتصال بالسيرفر" وهو مفيش مشكلة اتصال
  if(moduleEnabled('records')){
    let rows=[], page=1, total=Infinity;
    while(rows.length<total){
      const res=await api('GET','/api/records?'+(fullHistory?'':'date_from='+cutoff+'&')+'limit=500&page='+page+'&sort=date&dir=desc');
      total=res.data.total;
      if(!res.data.rows.length) break;
      rows=rows.concat(res.data.rows);
      page++;
    }
    records=rows.map(mapApiRecord);
  }

  // الموديولات المعطّلة للمستخدم بترجع 403 من السيرفر — ما ينفعش فشل موديول واحد يوقّع الاستعادة كلها.
  // نسحب كل كيان على حدة: المعطّل/الفاشل يرجع null ونسيب نسخته المحلية زي ما هي.
  const getOpt=async (path, moduleKey)=>{
    if(moduleKey && !moduleEnabled(moduleKey)) return null;
    try{ return await api('GET',path); }
    catch(e){ if(e.status===403) return null; throw e; }
  };
  const [ctr, insp, its, irs, tds, exs, dls, eqs]=await Promise.all([
    getOpt('/api/contractors'), getOpt('/api/inspectors'), getOpt('/api/items'),
    getOpt('/api/ir-records','ir'), getOpt('/api/todos','todo'), getOpt('/api/exec-records','site_exec'),
    getOpt('/api/daily-records','site_daily'), getOpt('/api/equipment-records','equipment')
  ]);
  if(eqs) equipmentRecords=eqs.data.map(mapApiEquipment);
  if(ctr) contractors=ctr.data.map(c=>({name:c.name, spec:c.spec||'—', rate:c.rate!=null?String(Number(c.rate)):'', rateType:c.rateType||'يومية', isLabor:!!c.isLabor}));
  if(insp) inspectors=insp.data.map(i=>i.name);
  if(its) items=its.data.map(it=>({cat:it.cat, name:it.name, stages:it.stages||[]}));
  if(irs) irRecords=irs.data.map(r=>({id:Number(r.id), date:ymdOf(r.date), item:r.item, place:r.place, inspector:r.inspector, status:r.status, notes:r.notes||''}));
  if(tds) todos=tds.data.map(t=>({id:Number(t.id), date:ymdOf(t.date), notes:t.notes, place:t.place||'', priority:t.priority, done:!!t.done}));
  if(exs) execRecords=exs.data.map(e=>({id:Number(e.id), item:e.item, place:e.place, pct:Number(e.pct), notes:e.notes||'', stages:e.stages||[], stageDone:e.stageDone||[], updated:e.updated}));
  // (M11) الصور مبقتش بتتنزل كلها مقدمًا (كانت بتملى حصة localStorage) — بتتحمل عند الطلب في renderDaily
  if(dls) dailyRecords=dls.data.map(d=>({id:Number(d.id), date:ymdOf(d.date), day:d.day, contractor:d.contractor||'', spec:d.spec||'', work:d.work||'', place:d.place||'', photoFileId:d.photoFileId?Number(d.photoFileId):null, photo:null}));

  await pullManagedData();

  // بناء الـ snapshot بحيث المزامنة الجاية تبقى no-op (كل حاجة متطابقة)
  _syncSnap={};
  const fill=(entity, arr, bodyFn, keyFn)=>{
    const s=snapOf(entity);
    arr.forEach(x=>{ s[keyFn(x)]=syncHash(bodyFn(x)); });
  };
  fill('records', records, recordBody, x=>x.id);
  fill('ir', irRecords, irBody, x=>x.id);
  fill('equipment', equipmentRecords, eqBody, x=>x.id);
  fill('todos', todos, todoBody, x=>x.id);
  fill('exec', execRecords, execBody, x=>x.id);
  fill('daily', dailyRecords, dailyBody, x=>x.id);
  fill('contractors', contractors, contractorBody, x=>x.name);
  fill('inspectors', inspectors.map(n=>({name:n})), i=>({name:i.name}), x=>x.name);
  fill('items', items, itemBody, x=>x.name);
  if(isAdmin()) fill('places', places.map(n=>({name:n})), p=>({name:p.name}), x=>x.name);
  saveSyncSnap();

  recordsFullyLoaded=fullHistory;
  recordsOldestLoaded=fullHistory?null:cutoff;
  saveRecordsLoadState();

  _suppressAutoSync=true; saveAll(); _suppressAutoSync=false;
  populateDropdowns(); renderRecords(); renderExec(); renderIR(); renderTodo(); renderEquipment(); renderDaily&&renderDaily(); renderHome();
  if(typeof renderSettings==='function') renderSettings();
  if(typeof renderDashboard==='function') renderDashboard();
  updateLoadOlderUI();
}

function ymdOf(v){ return String(v||'').split('T')[0]; }
function mapApiRecord(r){
  return {
    id:Number(r.id), day:r.day, date:ymdOf(r.date), contractor:r.contractorName||r.contractor||'',
    spec:r.spec||'', qty:Number(r.qty), qtyType:r.qtyType||'يومية', price:Number(r.price),
    discount:Number(r.discount), total:Number(r.total), notes:r.notes||'',
    place:r.placeName||r.place||'', deductOn:r.deductOn||[], deductNote:r.deductNote||'',
    done:!!r.done,
    rentRequestId:r.rentRequestId!=null?Number(r.rentRequestId):null
  };
}

// ── أول مزامنة بعد تسجيل الدخول: تحديد الاتجاه الصح تلقائيًا ──
async function initialSync(){
  try{
    const snapEmpty=Object.keys(_syncSnap).length===0;
    const localHasData=records.length||contractors.length||todos.length;
    if(snapEmpty){
      // أول مرة الجهاز ده يتصل بالسيرفر الجديد
      let serverHasData=false;
      try{
        // نفس السبب: الحساب بلا وحدة السراكي بيرجّع 403 — نتخطى الفحص بدل ما نعتبره فشل اتصال
        const probe=moduleEnabled('records') ? await api('GET','/api/records?limit=1') : null;
        serverHasData=(probe && probe.data.total>0) || (await api('GET','/api/contractors')).data.length>0;
      }catch(e){
        if(e.status===403){ setSyncStatus('✅ متزامن — الحساب ده مالوش سراكي', '#2E7D32'); return; }
        setSyncStatus('⚠ تعذر الاتصال بالسيرفر', '#C62828'); return;
      }
      if(serverHasData && localHasData){
        // بيانات هنا وهناك ومفيش snapshot (حالة الترحيل من النسخة القديمة):
        // السيرفر فيه نسختك المستوردة الكاملة — الاستعادة منه هي الأأمن
        const pull=confirm('السيرفر فيه بيانات محفوظة لحسابك.\n\n"موافق" = استعادة بيانات السيرفر (الموصى به بعد التحديث)\n"إلغاء" = رفع البيانات المحلية للسيرفر بدلها');
        if(pull){ await pullAll(); showToast('✅ تم الاستعادة من السيرفر'); }
        else { await syncNow(); }
      } else if(serverHasData){
        await pullAll();
        showToast('✅ تم تحميل بياناتك من السيرفر');
      } else {
        await syncNow();
      }
    } else {
      // جهاز متزامن قبل كده — مزامنة عادية
      await syncNow();
    }
  }catch(e){
    setSyncStatus('⚠ فشلت المزامنة الأولى — شغلك محفوظ محليًا', '#C62828');
  }
}

// ── واجهة أزرار المزامنة اليدوية (نفس عناصر الشاشة القديمة) ──
function generateDeviceCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg=()=>Array.from({length:4},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
  return 'CEA-'+seg()+'-'+seg();
}
// كود العرض مشتق من الإيميل (للتعريف فقط — المزامنة بقت بالحساب نفسه مش بالكود)
function codeFromEmail(email){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const norm=(email||'').trim().toLowerCase();
  let h1=0,h2=5381;
  for(let i=0;i<norm.length;i++){
    const c=norm.charCodeAt(i);
    h1=(h1*31+c)>>>0;
    h2=((h2*33)^c)>>>0;
  }
  const seg=(seed)=>{
    let s=seed>>>0,out='';
    for(let i=0;i<4;i++){ s=(Math.imul(s,1103515245)+12345)>>>0; out+=chars[s%chars.length]; }
    return out;
  };
  return 'CEA-'+seg(h1)+'-'+seg(h2);
}
function getDeviceCode(){
  const email=getCurrentUserEmail();
  if(email) return codeFromEmail(email);
  let c=localStorage.getItem('cea_device_code');
  if(!c){ c=generateDeviceCode(); localStorage.setItem('cea_device_code',c); }
  return c;
}
function copySyncCode(){ copyTextToClipboard(getDeviceCode()); }

// نسخ نص للحافظة بأكثر من طريقة، عشان يشتغل حتى لو navigator.clipboard مش متاح
function copyTextToClipboard(text){
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text)
      .then(()=>showToast('✅ تم نسخ الكود'))
      .catch(()=>{ if(!legacyCopy(text)) showToast('⚠ فشل النسخ — انسخ الكود يدويًا: '+text, true); });
  } else {
    if(legacyCopy(text)) showToast('✅ تم نسخ الكود');
    else showToast('⚠ فشل النسخ — انسخ الكود يدويًا: '+text, true);
  }
}
function legacyCopy(text){
  try{
    const ta=document.createElement('textarea');
    ta.value=text;
    ta.style.position='fixed';
    ta.style.left='-9999px';
    ta.style.top='0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok=document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }catch(e){ return false; }
}

function setSyncStatus(msg, color='var(--muted)'){
  const el=document.getElementById('sync-status');
  if(el){ el.textContent=msg; el.style.color=color; }
}

// زرار "رفع": مزامنة فورية كاملة
async function syncUpload(){
  await syncNow();
  showToast('☁️ تمت المزامنة');
}
// زرار "استعادة": سحب كامل من حساب المستخدم (بيستبدل البيانات المحلية)
// ملحوظة: خانة الكود بقت للعرض فقط — الاستعادة بتتم من حسابك المسجّل دخوله
async function syncDownload(){
  if(!confirm('هتستعيد بيانات حسابك من السيرفر وهتستبدل البيانات المحلية الحالية. متأكد؟')) return;
  setSyncStatus('⏳ جاري الاستعادة...');
  try{
    await pullAll();
    setSyncStatus('✅ تم الاستعادة — آخر '+SYNC_WINDOW_MONTHS+' شهر ('+records.length+' سجل)', '#2E7D32');
    showToast('✅ تم الاستعادة — '+records.length+' سجل (آخر '+SYNC_WINDOW_MONTHS+' شهر)');
  }catch(e){
    setSyncStatus('❌ فشل: '+e.message, '#C62828');
    showToast('⚠ فشل الاستعادة', true);
  }
}

// ── تحميل سجلات أقدم (عند الطلب) ──
// المرجع هو الواقع مش فلاغ محلي: بنقارن أقدم سجل محلي بأقدم سجل على السيرفر.
// لو السيرفر عنده أقدم → الزرار يظهر ويحمّل شهرين إضافيين لكل ضغطة.
let _serverOldestDate=null; // أقدم تاريخ على السيرفر (يُجلب مرة وبيتحدث بعد كل مزامنة)
function localOldestDate(){
  let m=null; for(const r of records){ if(r.date && (!m || r.date<m)) m=r.date; } return m;
}
async function refreshServerOldest(){
  try{
    const res=await api('GET','/api/records?limit=1&sort=date&dir=asc');
    _serverOldestDate = res.data.rows.length ? ymdOf(res.data.rows[0].date) : null;
  }catch(e){ /* أوفلاين — نسيب القيمة السابقة */ }
  updateLoadOlderUI();
}
function hasOlderOnServer(){
  const lo=localOldestDate();
  if(!_serverOldestDate) return false;
  if(!lo) return true;                 // محليًا فاضي والسيرفر فيه بيانات
  return _serverOldestDate < lo;       // السيرفر عنده أقدم من اللي عندي
}

async function loadOlderRecords(){
  if(!hasOlderOnServer()){ showToast('✅ كل السجلات متحملة بالفعل'); updateLoadOlderUI(); return; }
  const btn=document.getElementById('load-older-btn');
  if(btn){ btn.disabled=true; btn.textContent='⏳ جاري التحميل...'; }
  try{
    const before=localOldestDate()||todayYMD();
    const newCutoff=(()=>{ const d=new Date(before); d.setMonth(d.getMonth()-SYNC_WINDOW_MONTHS); return d.toISOString().split('T')[0]; })();
    // نجيب اللي أقدم من أقدم سجل عندي (date_to حصري)
    const dayBefore=(()=>{ const d=new Date(before); d.setDate(d.getDate()-1); return d.toISOString().split('T')[0]; })();
    let rows=[], page=1, total=Infinity;
    while(rows.length<total){
      const res=await api('GET','/api/records?date_from='+newCutoff+'&date_to='+dayBefore+'&limit=500&page='+page+'&sort=date&dir=desc');
      total=res.data.total;
      if(!res.data.rows.length) break;
      rows=rows.concat(res.data.rows);
      page++;
    }
    const existingIds=new Set(records.map(r=>String(r.id)));
    const mapped=rows.map(mapApiRecord).filter(r=>!existingIds.has(String(r.id)));
    if(mapped.length){
      records=records.concat(mapped);
      const s=snapOf('records');
      mapped.forEach(r=>{ s[r.id]=syncHash(recordBody(r)); }); // عشان الرفع الجاي مايعتبرهمش جداد
      saveSyncSnap();
      _suppressAutoSync=true; saveAll(); _suppressAutoSync=false;
      populateDropdowns(); renderRecords(); renderExec(); renderHome();
      if(typeof renderDashboard==='function') renderDashboard();
    }
    // لو النافذة دي فاضية لكن السيرفر لسه عنده أقدم (فجوة زمنية) — المستخدم يضغط تاني وهيقفز للنافذة اللي بعدها
    recordsOldestLoaded=newCutoff; recordsFullyLoaded=!hasOlderOnServer(); saveRecordsLoadState();
    updateLoadOlderUI();
    showToast(mapped.length ? '✅ تم تحميل '+mapped.length+' سجل أقدم' : (hasOlderOnServer() ? 'مفيش سجلات في الفترة دي — اضغط تاني للأقدم' : '✅ وصلت لأول سجل — كل البيانات متحملة دلوقتي'));
  }catch(e){
    showToast('⚠ فشل تحميل السجلات الأقدم', true);
  }finally{
    if(btn){ btn.disabled=false; updateLoadOlderUI(); }
  }
}

function updateLoadOlderUI(){
  const wrap=document.getElementById('load-older-wrap');
  const btn=document.getElementById('load-older-btn');
  if(!wrap||!btn) return;
  if(!hasOlderOnServer()){
    wrap.style.display='none';
  } else {
    wrap.style.display='block';
    const lo=localOldestDate();
    btn.textContent='⬇️ تحميل سجلات أقدم من '+(lo||'');
  }
}

// ============ دوال التوافق (نفس الأسماء القديمة المستدعاة من باقي الكود) ============
// الأماكن/المقاولين: مجرد جدولة مزامنة — المحرك بيرفع الفروق تلقائيًا
function pushPlacesToCloud(){ scheduleSync(); }
function pushContractorsToCloud(){ scheduleSync(); }
// التوقيع: الأدمن بس (رفع كملف + ربطه بالإعدادات) — للمهندس بيتسحب من السيرفر فقط
async function pushSignatureToCloud(dataUrl){
  if(!isAdmin() || !getAccessToken() || !navigator.onLine) return;
  try{
    if(!dataUrl){
      await api('PUT','/api/account/settings',{signatureFileId:null});
      return;
    }
    const blob=await (await fetch(dataUrl)).blob();
    const fd=new FormData();
    fd.append('file', blob, 'signature.png');
    const res=await fetch(API_URL+'/api/files',{
      method:'POST',
      headers:{'Authorization':'Bearer '+getAccessToken()},
      body:fd
    });
    if(!res.ok) return;
    const j=await res.json();
    await api('PUT','/api/account/settings',{signatureFileId:Number(j.data.id)});
  }catch(e){ /* فشل صامت — هيتحاول في مزامنة جاية */ }
}
// PIN: الأدمن بس — للمهندس الـ PIN جاي من السيرفر (أو محلي بحت لو مفيش)
async function pushPinHashToCloud(hash){
  if(!isAdmin() || !getAccessToken() || !navigator.onLine) return;
  try{ await api('PUT','/api/account/settings',{pinHash:hash||null}); }catch(e){ /* صامت */ }
}
// السحب التلقائي للبيانات المرجعية بعد الدخول (اسم قديم بيتنادى من أماكن تانية)
async function autoSyncReferenceData(){
  try{
    await pullManagedData();
    saveAll();
    populateDropdowns();
    if(typeof renderSettings==='function') renderSettings();
    if(typeof initSiteTab==='function') initSiteTab();
  }catch(e){ /* أوفلاين — هيتحاول في المزامنة الجاية */ }
}
// ============ END API SYNC ============


function backupData() {
  const backup = {
    version: '1.0',
    date: new Date().toISOString(),
    records,
    irRecords,
    equipmentRecords,
    todos,
    contractors,
    places,
    inspectors,
    items,
    dailyRecords: typeof dailyRecords!=='undefined'?dailyRecords:[],
    execRecords:  typeof execRecords !=='undefined'?execRecords :[],
    placeSites
  };
  const jsonStr = JSON.stringify(backup, null, 2);
  const fileName = `CEA_backup_${todayYMD()}.json`;
  if(window.isCapacitor){
    const b64 = utf8ToBase64(jsonStr);
    // Use CACHE — no permission needed on Android 10+
    window.Capacitor.Plugins.Filesystem.writeFile({
      path: fileName,
      data: b64,
      directory: 'CACHE',
      recursive: true
    })
    .then(()=>window.Capacitor.Plugins.Filesystem.getUri({path:fileName,directory:'CACHE'}))
    .then(u=>window.Capacitor.Plugins.Share.share({
      title: fileName,
      text: 'CEA Backup',
      url: u.uri,
      dialogTitle: 'احفظ النسخة الاحتياطية'
    }))
    .then(()=>showToast('📤 تم تصدير النسخة الاحتياطية!'))
    .catch(e=>{
      // fallback: try DATA directory
      window.Capacitor.Plugins.Filesystem.writeFile({
        path: fileName, data: b64, directory: 'DATA', recursive: true
      })
      .then(()=>window.Capacitor.Plugins.Filesystem.getUri({path:fileName,directory:'DATA'}))
      .then(u=>window.Capacitor.Plugins.Share.share({title:fileName,url:u.uri}))
      .then(()=>showToast('📤 تم تصدير النسخة الاحتياطية!'))
      .catch(e2=>showToast('⚠ خطأ: '+e2.message,true));
    });
  } else {
    const blob = new Blob([jsonStr], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href=url; a.download=fileName; a.click();
    URL.revokeObjectURL(url);
    showToast('📤 تم تصدير النسخة الاحتياطية!');
  }
}

function applyRestoreData(jsonStr){
  try {
    const data = JSON.parse(jsonStr);
    if(!data || typeof data!=='object' || (!data.records && !data.contractors)){showToast('⚠ الملف مش باك اب صحيح',true);return;}
    // تحقق من شكل البيانات: ملف معدَّل يدويًا ما ينفعش يكسر التطبيق أو يحقن كود في الواجهة
    const num=(v,d)=>{ const n=Number(v); return Number.isFinite(n)?n:d; };
    const str=v=>v==null?'':String(v);
    const arr=v=>Array.isArray(v)?v.filter(x=>x&&typeof x==='object'):null;
    let seq=Date.now();
    const withId=x=>({...x, id:num(x.id, seq++)});
    const isDataImg=v=>typeof v==='string' && /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
    const stages=v=>Array.isArray(v)?v.map(s=>typeof s==='string'?s:{...s, name:str(s&&s.name), pct:num(s&&s.pct,0), done:!!(s&&s.done)}):[];
    const R=arr(data.records), I=arr(data.irRecords), T=arr(data.todos), C=arr(data.contractors), P=Array.isArray(data.places)?data.places.map(str):null,
          N=Array.isArray(data.inspectors)?data.inspectors.map(str):null, IT=arr(data.items), D=arr(data.dailyRecords), E=arr(data.execRecords);
    if(R)  records      = R.map(x=>withId({...x, qty:num(x.qty,0), price:num(x.price,0), discount:num(x.discount,0), total:num(x.total,0), done:!!x.done}));
    if(I)  irRecords    = I.map(withId);
    const Q=arr(data.equipmentRecords); if(Q) equipmentRecords = Q.map(x=>withId({...x, minutes:num(x.minutes,0)}));
    if(T)  todos        = T.map(x=>withId({...x, done:!!x.done}));
    if(C)  contractors  = C.map(c=>({name:str(c.name), spec:str(c.spec)||'—', rate:str(c.rate), rateType:str(c.rateType)||'يومية'}));
    if(P)  places       = P;
    if(N)  inspectors   = N;
    if(IT) items        = IT.map(it=>({cat:str(it.cat), name:str(it.name), stages:stages(it.stages)}));
    if(D)  dailyRecords = D.map(x=>withId({...x, photo:isDataImg(x.photo)?x.photo:null, photoFileId:x.photoFileId!=null?num(x.photoFileId,null):null}));
    if(E)  execRecords  = E.map(x=>withId({...x, pct:num(x.pct,0), stages:stages(x.stages), stageDone:Array.isArray(x.stageDone)?x.stageDone.map(Boolean):[]}));
    if(data.placeSites && typeof data.placeSites==='object' && !Array.isArray(data.placeSites)){ placeSites=data.placeSites; savePlaceSites(); }
    // ⚠ الاستعادة بتستبدل بيانات الجهاز بالكامل — لازم snapshot المزامنة يتفضّى الأول.
    // من غير كده أول مزامنة بعدها بتلاقي سجلات في الـsnapshot ومش في الملف فتعتبرها "اتحذفت"
    // وتبعت DELETE للسيرفر: استعادة نسخة من أسبوعين كانت بتمسح الأسبوعين دول من السحابة كمان.
    // مهم: بنفضّي كل كيان لوحده ومابنمسحش الأوبچكت نفسه ({}) — لأن initialSync بيعتبر
    // snapshot فاضي خالص = "أول اتصال بالسيرفر" فيعرض ديالوج الترحيل اللي "موافق" فيه
    // بتعمل pullAll وتلغي الاستعادة اللي المهندس لسه عاملها. الحماية من الحذف بتفضل زي ما هي
    // لأن حلقة الـDELETE بتلف على مفاتيح كيان فاضي = صفر حذف.
    SYNC_ENTITIES.forEach(k=>{ _syncSnap[k]={}; });
    saveSyncSnap();
    _suppressAutoSync=true;
    saveAll();
    _suppressAutoSync=false;
    // نجدول مزامنة عشان الـsnapshot يتبني تاني فورًا (زي ما resetAllApp بيعمل pullAll بعد المسح)
    scheduleSync();
    populateDropdowns();
    renderRecords();
    renderIR();
    renderTodo();
    renderSummary();
    renderSettings();
    initSiteTab();
    showToast(`✅ تم الاستعادة — ${records.length} سجل، ${irRecords.length} IR، ${todos.length} مهمة`);
  } catch(err) {
    showToast('⚠ خطأ في قراءة الملف: '+err.message,true);
  }
}

function restoreFromFile(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){ applyRestoreData(e.target.result); };
  reader.readAsText(file);
  input.value='';
}

function restoreData() {
  if(!confirm('⚠ استعادة نسخة احتياطية من ملف\n\n• بيانات الجهاز الحالية كلها هتتستبدل بمحتوى الملف.\n• نسختك على السيرفر مش هتتمسح.\n• أول مزامنة هترجّع المقاولين والأماكن والبنود وطلبات الفحص والمهام والموقف التنفيذي والمعدات.\n• السراكي الأقدم من أقدم تاريخ في الملف بترجع بزرار "⬇️ تحميل سجلات أقدم"، والتقارير اليومية بترجع من زرار "استعادة" في الإعدادات.\n\nتكمل؟')) return;
  if(window.isCapacitor){
    // Use Capacitor FilePicker plugin
    if(window.Capacitor.Plugins.FilePicker){
      window.Capacitor.Plugins.FilePicker.pickFiles({
        types: ['application/json'],
        multiple: false,
        readData: true
      }).then(function(result){
        if(!result.files || !result.files.length){showToast('⚠ لم يتم اختيار ملف',true);return;}
        const file = result.files[0];
        // data is base64 encoded
        const jsonStr = base64ToUtf8(file.data);
        applyRestoreData(jsonStr);
      }).catch(function(e){
        showToast('⚠ خطأ في فتح الملف: '+e.message,true);
      });
    } else {
      // fallback to hidden input if plugin not available
      document.getElementById('restore-file-hidden').click();
    }
  } else {
    document.getElementById('restore-file-hidden').click();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// تحليلات الأماكن والمقاولين (للمديرين) — أونلاين فقط، كل الحساب في السيرفر
// ───────────────────────────────────────────────────────────────────────────
// الملخص (تاب summary) بيحسب من localStorage = سجلات المهندس نفسه بس.
// التاب ده مختلف: بيسأل /api/analytics اللي بيجمّع سجلات كل المهندسين المسندين
// للمدير. الأماكن والمقاولين الاتنين بيانات مرجعية يديرها الأدمن وحده
// (writeRoles: ['ADMIN'] على السيرفر + pushContractorsIfAdmin/pushPlacesIfAdmin)
// وبتتنسخ نصًّا حرفيًا لحسابات المهندسين، فالأسماء موحّدة والتجميع عبرهم صح.
// ═══════════════════════════════════════════════════════════════════════════

let _anDim='place';         // place | contractor
let _anScope=null;          // {level, engineers[], sites[]}
let _anPeriod='month';      // week | month | q | all | custom
let _anBucket='week';       // تجميع الاتجاه الزمني
let _anApprovedBucket='month'; // تجميع تاب "الإجمالي الفعلي" (أسبوعي/شهري/سنوي)
let _anSort='total';
let _anData=null;
let _anTrend=null;
let _anSeq=0;               // الفلتر ممكن يتغيّر والطلب لسه شغال — بنتجاهل الرد القديم

const AN_DIMS=[{k:'place',l:'🏗 الأماكن'},{k:'contractor',l:'👷 المقاولين'},{k:'matrix',l:'🔀 العلاقة'},{k:'approved',l:'🔒 الإجمالي الفعلي'},{k:'labor',l:'👷 العمالة'}];
const AN_PERIODS=[{k:'week',l:'هذا الأسبوع'},{k:'month',l:'هذا الشهر'},{k:'q',l:'آخر 3 شهور'},{k:'all',l:'كل الفترة'},{k:'custom',l:'مخصص'}];
const AN_SORTS=[{k:'total',l:'الأعلى منصرفًا'},{k:'records',l:'الأكتر سجلات'},{k:'discount',l:'الأعلى خصمًا'},{k:'last',l:'آخر نشاط'},{k:'name',l:'الاسم'}];

const anInt=n=>Number(n||0).toLocaleString('ar-EG',{maximumFractionDigits:0});
const anPct=n=>Number(n||0).toLocaleString('ar-EG',{maximumFractionDigits:1});
// أيام العمالة ممكن تيجي كسور (نص يوم) — نعرضها بفاصلة بدل ما نقرّبها زي anInt
const anDays=n=>Number(n||0).toLocaleString('ar-EG',{maximumFractionDigits:2});
const anIsCtr=()=>_anDim==='contractor';
const anIsMx=()=>_anDim==='matrix';
const AN_ENDPOINT={place:'places', contractor:'contractors', matrix:'matrix', approved:'approved-totals', labor:'labor'};
const anIsApproved=()=>_anDim==='approved';
const anIsLabor=()=>_anDim==='labor';

// حدود الفترة المختارة — بداية الأسبوع سبت (زي أسبوع كشوف السراكي)
// مشترك بين تاب التحليلات وتاب تحليل العمالة — نفس منطق الفترات بفرق الـ ids بس
function anRangeFor(period, fromId, toId){
  if(period==='all') return {};
  if(period==='custom'){
    const f=document.getElementById(fromId), t=document.getElementById(toId);
    const r={}; if(f&&f.value) r.from=f.value; if(t&&t.value) r.to=t.value; return r;
  }
  const now=new Date(), to=toYMD(now); const d=new Date(now);
  if(period==='week') d.setDate(d.getDate()-((d.getDay()+1)%7));
  else if(period==='month') d.setDate(1);
  else d.setDate(d.getDate()-90);
  return {from:toYMD(d), to};
}
function anRange(){ return anRangeFor(_anPeriod,'an-from','an-to'); }
function anQuery(extra){
  const r=anRange(), p=new URLSearchParams();
  if(r.from) p.set('from',r.from);
  if(r.to) p.set('to',r.to);
  const site=document.getElementById('an-site'), user=document.getElementById('an-user');
  if(site&&site.value) p.set('site',site.value);
  if(user&&user.value) p.set('userId',user.value);
  Object.entries(extra||{}).forEach(([k,v])=>{ if(v!=null&&v!=='') p.set(k,v); });
  const s=p.toString(); return s?('?'+s):'';
}
function anSetDim(k){ if(k===_anDim) return; _anDim=k; anPaintChips(); renderAnalytics(); }
function anSetPeriod(k){
  _anPeriod=k;
  const box=document.getElementById('an-custom'); if(box) box.style.display = k==='custom' ? '' : 'none';
  anPaintChips();
  if(k!=='custom') renderAnalytics();
}
function anPaintChips(){
  const dims=document.getElementById('an-dims');
  if(dims) dims.innerHTML=AN_DIMS.map(d=>`<button type="button" class="an-chip an-dim${d.k===_anDim?' on':''}" onclick="anSetDim('${d.k}')">${esc(d.l)}</button>`).join('');
  const box=document.getElementById('an-periods'); if(!box) return;
  box.innerHTML=AN_PERIODS.map(p=>`<button type="button" class="an-chip${p.k===_anPeriod?' on':''}" onclick="anSetPeriod('${p.k}')">${esc(p.l)}</button>`).join('');
}
function anSetBucket(b){ _anBucket=b; renderAnalytics(); }
function anSetApprovedBucket(b){ _anApprovedBucket=b; renderAnalytics(); }
function anSetSort(v){ _anSort=v; anPaintBody(); }

async function renderAnalytics(fresh){
  const body=document.getElementById('an-body'); if(!body) return;
  if(!getAccessToken()||!navigator.onLine){
    body.innerHTML='<div class="card"><div class="home-empty">📈 التحليلات بيانات حية — محتاج اتصال بالنت</div></div>';
    return;
  }
  const seq=++_anSeq;
  body.innerHTML='<div class="card"><div class="home-empty">⏳ بيتم تجميع البيانات...</div></div>';
  try{
    if(!_anScope){
      const sc=await api('GET','/api/analytics/scope');
      _anScope=sc.data;
      anPaintFilters();
    }
    const f=fresh===true?{fresh:'1'}:{};
    // تاب "الإجمالي الفعلي" له بكت خاص بيه (أسبوعي/شهري/سنوي) ومالوش رسم اتجاه — نطلبه لوحده
    const mainQuery = anIsApproved() ? Object.assign({bucket:_anApprovedBucket}, f) : f;
    const calls=[api('GET','/api/analytics/'+(AN_ENDPOINT[_anDim]||'places')+anQuery(mainQuery))];
    if(!anIsApproved() && !anIsLabor()) calls.push(api('GET','/api/analytics/trend'+anQuery(Object.assign({bucket:_anBucket},f))));
    const [p,t]=await Promise.all(calls);
    if(seq!==_anSeq) return; // فلتر أحدث اتطلب — الرد ده بقى قديم
    _anData=p.data; _anTrend=t?t.data:null;
    anPaintBody();
  }catch(e){
    if(seq!==_anSeq) return;
    body.innerHTML='<div class="card"><div class="home-empty">⚠ '+esc(e.message||'تعذر التحميل')+'</div></div>';
  }
}

// قوائم الفلترة + سطر يوضح نطاق الرؤية (المدير لازم يعرف الأرقام دي بتخص مين)
function anPaintFilters(){
  const sc=_anScope||{engineers:[],sites:[],level:'self'};
  const sel=document.getElementById('an-user');
  if(sel) sel.innerHTML='<option value="">كل المهندسين</option>'+sc.engineers
    .map(u=>`<option value="${esc(u.id)}">${esc(u.displayName?u.displayName:(u.title?u.title+' — ':'')+u.email)}</option>`).join('');
  const siteWrap=document.getElementById('an-site-wrap'), site=document.getElementById('an-site');
  if(site) site.innerHTML='<option value="">كل المواقع</option>'+(sc.sites||[]).map(s=>`<option value="${s}">${s===2?'الموقع الثاني':'الموقع الأول'}</option>`).join('');
  if(siteWrap) siteWrap.style.display=(sc.sites||[]).length>1?'':'none';
  const hint=document.getElementById('an-scope');
  if(hint){
    const n=sc.engineers.length;
    hint.innerHTML = sc.level==='all'
      ? `نطاقك: <b style="color:var(--gold-text)">كل الحسابات</b> (${anInt(n)} حساب)`
      : sc.level==='team'
        ? `نطاقك: <b style="color:var(--gold-text)">المهندسين المسندين لك</b> (${anInt(n)} حساب) — الأرقام دي بتاعتهم بس`
        : 'نطاقك: <b>سجلاتك أنت بس</b> — مالكش مهندسين مسندين';
  }
  anPaintChips();
}

// ── الرسوم: SVG خام بدون مكتبة (بتشتغل أوفلاين وبتطبع صح) ──
function anBarChart(pts){
  if(!pts||!pts.length) return '<div class="home-empty">مفيش سجلات في الفترة دي</div>';
  const H=150, PAD_T=12, PAD_B=24, W=Math.max(300, pts.length*46);
  const max=Math.max.apply(null, pts.map(p=>p.total))||1;
  let out='';
  pts.forEach((p,i)=>{
    const h=Math.max(2, ((H-PAD_T-PAD_B)*p.total)/max);
    // عرض العمود متسقّف: مع فترة أو اتنين بس العمود كان بيطلع بلوك عريض وحش
    const bw=W/pts.length, w=Math.min(bw*0.6, 56), x=i*bw+(bw-w)/2, y=H-PAD_B-h;
    const lab=p.bucket.length>7?p.bucket.slice(5):p.bucket; // YYYY-MM-DD → MM-DD
    out+=`<rect class="an-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>${esc(p.bucket)} — ${anInt(p.total)} ج.م · ${anInt(p.records)} سجل</title></rect>`
       +`<text class="an-xlab" x="${(x+w/2).toFixed(1)}" y="${H-PAD_B+14}">${esc(lab)}</text>`;
  });
  return `<div class="an-chart-scroll"><svg class="an-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
       + `<line class="an-axis" x1="0" y1="${H-PAD_B}" x2="${W}" y2="${H-PAD_B}"/>${out}</svg></div>`;
}
function anRowBars(rows){
  if(!rows.length) return '<div class="home-empty">مفيش بيانات في الفترة دي</div>';
  const top=rows.slice(0,12), max=top[0].total||1;
  return '<div class="an-bars">'+top.map(r=>{
    const pctW=Math.max(2, (r.total/max)*100);
    return `<div class="an-bars-row"><div class="an-bars-head"><span class="an-bars-name">${esc(r.name)}</span><span class="an-bars-val">${anInt(r.total)}</span></div>`
         + `<div class="an-bars-track"><div class="an-bars-fill" style="width:${pctW.toFixed(1)}%"></div></div></div>`;
  }).join('')+'</div>';
}

function anSortRows(rows){
  const c=[...rows];
  if(_anSort==='records') c.sort((a,b)=>b.records-a.records);
  else if(_anSort==='discount') c.sort((a,b)=>b.discount-a.discount);
  else if(_anSort==='last') c.sort((a,b)=>String(b.lastDate||'').localeCompare(String(a.lastDate||'')));
  else if(_anSort==='name') c.sort((a,b)=>a.name.localeCompare(b.name,'ar'));
  else c.sort((a,b)=>b.total-a.total);
  return c;
}

// كروت الأرقام — مختلفة حسب البُعد (IR/الإنجاز مالهمش معنى للمقاولين، وأسماء برّا القائمة للمقاولين بس)
// شبكة مقاول × مكان. الصف/العمود الأخير = إجمالي المقاول في **كل** الأماكن (مش المعروضة بس)
// عشان الرقم يبقى صح لوحده — والعناوين بتقول كده صراحةً.
function anMatrixTable(d){
  if(!d.contractors.length) return '<div class="home-empty">مفيش سجلات في الفترة دي</div>';
  const cell=new Map(); d.cells.forEach(x=>cell.set(x.c+' '+x.p, x));
  // التدرّج بالترتيب مش بالنسبة للأكبر: قيمة شاذة واحدة كانت بتخلي كل الخانات
  // التانية شبه بيضا. الرقم المكتوب في الخانة هو المرجع الدقيق دايمًا.
  const rank=new Map();
  [...d.cells].sort((a,b)=>a.total-b.total).forEach((x,i,arr)=>rank.set(x.c+' '+x.p, arr.length>1?i/(arr.length-1):1));
  let h='<table class="apr-table an-matrix"><thead><tr><th class="an-mx-head">المقاول \\ المكان</th>'
      + d.places.map(p=>`<th title="${esc(p.name)}">${esc(p.name)}</th>`).join('')
      + '<th>الإجمالي (كل الأماكن)</th></tr></thead><tbody>';
  h+=d.contractors.map(c=>'<tr><th class="an-mx-head" title="'+esc(c.name)+'">'+esc(c.name)+'</th>'
      + d.places.map(p=>{
          const x=cell.get(c.key+' '+p.key);
          if(!x) return '<td class="an-mx-0">·</td>';
          const a=(0.10+0.45*(rank.get(c.key+' '+p.key)||0)).toFixed(3);
          return `<td class="an-mx-v" style="background:rgba(201,168,76,${a})" title="${esc(c.name)} — ${esc(p.name)}&#10;${anInt(x.total)} ج.م · ${anInt(x.records)} سجل · آخر نشاط ${esc(x.lastDate||'—')}">${anInt(x.total)}</td>`;
        }).join('')
      + `<td><b>${anInt(c.total)}</b></td></tr>`).join('');
  h+='<tr class="an-mx-tot"><th class="an-mx-head">الإجمالي (كل المقاولين)</th>'
   + d.places.map(p=>`<td><b>${anInt(p.total)}</b></td>`).join('')
   + `<td><b>${anInt(d.totals.total)}</b></td></tr>`;
  return h+'</tbody></table>';
}

function anKpis(d){
  if(anIsMx()){
    const t=d.totals;
    return [
      ['','إجمالي المنصرف (ج.م)', anInt(t.total), false],
      ['gold','مقاولين', anInt(t.contractors), false],
      ['purple','أماكن', anInt(t.places), false],
      ['green','ثنائيات فيها شغل', anInt(t.pairs), false],
      ['','عدد السجلات', anInt(t.records), false],
      [t.hiddenContractors?'tint-warn':'tint-ok','مقاولين برّا الشبكة', anInt(t.hiddenContractors), false],
      [t.hiddenPlaces?'tint-warn':'tint-ok','أماكن برّا الشبكة', anInt(t.hiddenPlaces), false],
      [t.hiddenTotal?'red':'tint-ok','منصرف برّا الشبكة', anInt(t.hiddenTotal), false],
    ];
  }
  const t=d.totals, top=d.rows[0];
  const common=[
    ['','إجمالي المنصرف (ج.م)', anInt(t.total), false],
    ['red','نسبة الخصم', anPct(t.discountPct)+'%', false],
    ['purple','عدد السجلات', anInt(t.records), false],
    ['green','مهندسين سجّلوا', anInt(d.engineers), false],
  ];
  return anIsCtr()
    ? [common[0], ['gold','مقاولين اشتغلوا', anInt(t.contractors), false], common[1], common[2],
       common[3],
       [t.unknown?'red':'tint-ok','أسماء برّا قائمتك', anInt(t.unknown), false],
       ['tint-warn','ساعات معدات', anPct(t.equipHours), false],
       ['tint-purple','أعلى مقاول', top?esc(top.name):'—', true]]
    : [common[0], ['gold','أماكن فيها شغل', anInt(t.places), false], common[1], common[2],
       common[3],
       ['tint-ok','طلبات فحص', anInt(t.irTotal), false],
       ['tint-warn','ساعات معدات', anPct(t.equipHours), false],
       ['tint-purple','أعلى مكان', top?esc(top.name):'—', true]];
}

function anTable(rows){
  // اليوميات = مجموع الكميات للسجلات اللي نوعها "يومية" فقط — غير عمود "أيام" اللي بيعدّ التواريخ المختلفة
  const heads = anIsCtr()
    ? ['المقاول','التخصص','الفئة','متوسط السعر','المنصرف','الخصم','% الخصم','سجلات','أيام','اليوميات','أماكن','مهندسين','ساعات معدات','آخر نشاط']
    : ['المكان','المنصرف','الخصم','% الخصم','سجلات','أيام','مقاولين','مهندسين','IR (A/B/C)','الإنجاز','ساعات معدات','آخر نشاط'];
  let t='<table class="apr-table an-table"><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>';
  t+=rows.map(r=>{
    const dpct=r.gross>0?(r.discount/r.gross)*100:0;
    const money=`<td><b>${anInt(r.total)}</b></td><td>${anInt(r.discount)}</td><td class="${dpct>=10?'an-bad':''}">${anPct(dpct)}%</td>`;
    if(anIsCtr()){
      // اسم مش في قائمة المقاولين عند الأدمن = اسم قديم في سجل قديم (اتغيّر أو اتحذف)
      const flag=r.inList?'':' <span class="an-warn" title="الاسم ده مش في قائمة المقاولين عندك — سجل قديم باسم اتغيّر أو اتحذف">⚠</span>';
      return '<tr>'
        +`<td class="an-name">${esc(r.name)}${flag}</td>`
        +`<td>${esc(r.spec||'—')}</td>`
        +`<td>${r.rate==null?'—':anInt(r.rate)+' / '+esc(r.rateType||'يومية')}</td>`
        +`<td>${r.avgPrice==null?'—':anInt(r.avgPrice)}</td>`
        +money
        +`<td>${anInt(r.records)}</td><td>${anInt(r.days)}</td><td>${r.dailyQty?anInt(r.dailyQty):'—'}</td><td>${anInt(r.places)}</td><td>${anInt(r.engineers)}</td>`
        +`<td>${r.equipHours?anPct(r.equipHours):'—'}</td><td>${esc(r.lastDate||'—')}</td></tr>`;
    }
    return '<tr>'
      +`<td class="an-name">${esc(r.name)}${r.variants.length>1?' <span class="an-warn" title="مكتوب بأكتر من صيغة: '+esc(r.variants.join(' · '))+'">✎</span>':''}</td>`
      +money
      +`<td>${anInt(r.records)}</td><td>${anInt(r.days)}</td><td>${anInt(r.contractors)}</td><td>${anInt(r.engineers)}</td>`
      +`<td>${r.ir.total?`${anInt(r.ir.a)}/${anInt(r.ir.b)}/${anInt(r.ir.c)}`:'—'}</td>`
      +`<td>${r.execAvg==null?'—':anPct(r.execAvg)+'%'}</td>`
      +`<td>${r.equipHours?anPct(r.equipHours):'—'}</td>`
      +`<td>${esc(r.lastDate||'—')}</td></tr>`;
  }).join('');
  return t+'</tbody></table>';
}

// جدول "الإجمالي الفعلي" — شكل مختلف عن باقي الأبعاد (weekStart/label بدل صف مكان/مقاول)
function anApprovedTable(rows){
  let t='<table class="apr-table an-table"><thead><tr><th>الفترة</th><th>عدد الكشوف</th><th>الإجمالي</th></tr></thead><tbody>';
  t+=rows.map(r=>`<tr><td class="an-name">${esc(r.label)}</td><td>${anInt(r.submissions)}</td><td><b>${anInt(r.total)}</b></td></tr>`).join('');
  return t+'</tbody></table>';
}
function anApprovedView(d){
  const t=d.totals;
  let html='<div class="summary-grid">'
    + `<div class="summary-box"><span class="val">${anInt(t.total)}</span><span class="lbl">الإجمالي الفعلي (ج.م)</span></div>`
    + `<div class="summary-box purple"><span class="val">${anInt(t.submissions)}</span><span class="lbl">عدد الكشوف</span></div>`
    + '</div>';
  html+='<div class="card"><div class="card-title between"><span class="t">🔒 الإجمالي الفعلي</span>'
      + `<span class="an-seg"><button type="button" class="an-chip${_anApprovedBucket==='week'?' on':''}" onclick="anSetApprovedBucket('week')">أسبوعي</button>`
      + `<button type="button" class="an-chip${_anApprovedBucket==='month'?' on':''}" onclick="anSetApprovedBucket('month')">شهري</button>`
      + `<button type="button" class="an-chip${_anApprovedBucket==='year'?' on':''}" onclick="anSetApprovedBucket('year')">سنوي</button></span></div>`
      + (d.rows.length?('<div class="apr-scroll">'+anApprovedTable(d.rows)+'</div>'):'<div class="home-empty">مفيش كشوف في النطاق ده</div>')
      + (t.estimated>0?`<div class="hint">⚠ ${anInt(t.estimated)} كشف من قبل تتبّع الإجمالي الفعلي — الرقم المعروض ليها هو اللي بعته المهندس وقتها، ولو مدير شطب سطر فيها بعد كده يمكن ميكونش متخصوم منه.</div>`:'')
      + '</div>';
  return html;
}

// تاب "العمالة": يوميات مسجلة قبل الاعتماد مقابل اللي عدّى الاعتماد فعلًا (بعد شطب/تعديل المديرين)، مقسّمة بمقاول ثم مهندس
function anLaborView(d){
  const t=d.totals||{before:0,after:0,diff:0,estimated:0,duplicates:0};
  let html='<div class="summary-grid">'
    + `<div class="summary-box"><span class="val">${anDays(t.before)}</span><span class="lbl">يوميات مسجلة (قبل الاعتماد)</span></div>`
    + `<div class="summary-box purple"><span class="val">${anDays(t.after)}</span><span class="lbl">يوميات معتمدة (بعد الاعتماد)</span></div>`
    + `<div class="summary-box gold"><span class="val">${anDays(t.diff)}</span><span class="lbl">الفرق</span></div>`
    + '</div>';
  const dups=d.duplicates||[];
  if(dups.length){
    let dt='<table class="apr-table an-table"><thead><tr><th>المهندس</th><th>المقاول</th><th>اليوم</th><th>الكشوف</th><th>اليوميات</th></tr></thead><tbody>';
    dt+=dups.map(x=>`<tr><td class="an-name">${esc(x.engineer)}</td><td>${esc(x.contractor)}</td><td>${esc(x.date)}</td>`
      +`<td>${x.submissions.map(s=>'#'+esc(s)).join('، ')}</td><td>${x.days.map(v=>anDays(v)).join(' + ')}</td></tr>`).join('');
    dt+='</tbody></table>';
    html+='<div class="card accent-red"><div class="card-title"><span>⚠</span> أيام تم اعتمادها في أكتر من كشف</div>'
      + '<div class="hint">نفس اليوم لنفس المقاول عند نفس المهندس دخل في أكتر من كشف وتم اعتماده — راجعوا الصرف عشان مايتحاسبش مرتين</div>'
      + `<div class="apr-scroll">${dt}</div></div>`;
  }
  html+='<div class="hint">قبل الاعتماد = اللي المهندس سجّله في يومياته. بعد الاعتماد = اللي عدّى كل الاعتمادات، بعد ما المديرين شطبوا أو عدّلوا سطور فيها.</div>';
  const contractors_=d.contractors||[];
  if(!contractors_.length){
    html+='<div class="home-empty">مفيش يوميات لمقاولين العمالة في النطاق ده</div>';
  } else {
    html+=contractors_.map(c=>{
      let t2='<table class="apr-table an-table"><thead><tr><th>المهندس</th><th>قبل الاعتماد</th><th>بعد الاعتماد</th><th>الفرق</th></tr></thead><tbody>';
      t2+=(c.engineers||[]).map(en=>`<tr><td class="an-name">${esc(en.name)}</td><td>${anDays(en.before)}</td><td>${anDays(en.after)}${en.dupExtra>0?` <span class="an-bad" title="يوميات محسوبة أكتر من مرة">(+${anDays(en.dupExtra)} مكرر)</span>`:''}</td><td>${anDays(en.diff)}</td></tr>`).join('');
      t2+=`<tr><td class="an-name"><b>الإجمالي</b></td><td><b>${anDays(c.before)}</b></td><td><b>${anDays(c.after)}</b></td><td><b>${anDays(c.diff)}</b></td></tr>`;
      t2+='</tbody></table>';
      return `<div class="card"><div class="card-title"><span>👷</span> ${esc(c.name)}</div><div class="apr-scroll">${t2}</div></div>`;
    }).join('');
  }
  if(t.estimated>0) html+=`<div class="hint">⚠ ${anInt(t.estimated)} كشف قديم لسه يومياته بعد الاعتماد ما اتحسبتش.</div>`;
  return html;
}

// ═══════════════════════════════════════════════════════════════════════════
// تحليل العمالة (وحدة مستقلة — 👷 تحليل العمالة) — نفس تقرير anLaborView بالظبط،
// لكن مصدره /api/labor-analytics: كل المهندسين دايمًا، بغض النظر عن درجة/إسناد الحساب.
// ═══════════════════════════════════════════════════════════════════════════
let _labPeriod='month';
let _labScope=null;
let _labSeq=0;

function labRange(){ return anRangeFor(_labPeriod,'lab-from','lab-to'); }
function labQuery(extra){
  const r=labRange(), p=new URLSearchParams();
  if(r.from) p.set('from',r.from);
  if(r.to) p.set('to',r.to);
  const site=document.getElementById('lab-site'), user=document.getElementById('lab-user');
  if(site&&site.value) p.set('site',site.value);
  if(user&&user.value) p.set('userId',user.value);
  Object.entries(extra||{}).forEach(([k,v])=>{ if(v!=null&&v!=='') p.set(k,v); });
  const s=p.toString(); return s?('?'+s):'';
}
function labSetPeriod(k){
  _labPeriod=k;
  const box=document.getElementById('lab-custom'); if(box) box.style.display = k==='custom' ? '' : 'none';
  labPaintChips();
  if(k!=='custom') renderLaborTab();
}
function labPaintChips(){
  const box=document.getElementById('lab-periods'); if(!box) return;
  box.innerHTML=AN_PERIODS.map(p=>`<button type="button" class="an-chip${p.k===_labPeriod?' on':''}" onclick="labSetPeriod('${p.k}')">${esc(p.l)}</button>`).join('');
}
function labPaintFilters(){
  const sc=_labScope||{engineers:[],sites:[]};
  const sel=document.getElementById('lab-user');
  if(sel) sel.innerHTML='<option value="">كل المهندسين</option>'+sc.engineers
    .map(u=>`<option value="${esc(u.id)}">${esc(u.displayName?u.displayName:(u.title?u.title+' — ':'')+u.email)}</option>`).join('');
  const siteWrap=document.getElementById('lab-site-wrap'), site=document.getElementById('lab-site');
  if(site) site.innerHTML='<option value="">كل المواقع</option>'+(sc.sites||[]).map(s=>`<option value="${s}">${s===2?'الموقع الثاني':'الموقع الأول'}</option>`).join('');
  if(siteWrap) siteWrap.style.display=(sc.sites||[]).length>1?'':'none';
  labPaintChips();
}
async function renderLaborTab(fresh){
  const body=document.getElementById('lab-body'); if(!body) return;
  if(!getAccessToken()||!navigator.onLine){
    body.innerHTML='<div class="card"><div class="home-empty">👷 تحليل العمالة بيانات حية — محتاج اتصال بالنت</div></div>';
    return;
  }
  const seq=++_labSeq;
  body.innerHTML='<div class="card"><div class="home-empty">⏳ بيتم تجميع البيانات...</div></div>';
  try{
    if(!_labScope){
      const sc=await api('GET','/api/labor-analytics/scope');
      _labScope=sc.data;
      labPaintFilters();
    }
    const f=fresh===true?{fresh:'1'}:{};
    const p=await api('GET','/api/labor-analytics'+labQuery(f));
    if(seq!==_labSeq) return; // فلتر أحدث اتطلب — الرد ده بقى قديم
    body.innerHTML=anLaborView(p.data);
  }catch(e){
    if(seq!==_labSeq) return;
    body.innerHTML='<div class="card"><div class="home-empty">⚠ '+esc(e.message||'تعذر التحميل')+'</div></div>';
  }
}

function anPaintBody(){
  const body=document.getElementById('an-body'); if(!body||!_anData) return;
  const d=_anData;
  if(anIsApproved()){ body.innerHTML=anApprovedView(d); return; }
  if(anIsLabor()){ body.innerHTML=anLaborView(d); return; }
  const rows=anIsMx()?[]:anSortRows(d.rows);
  const k=anKpis(d);
  const box=(x)=>`<div class="summary-box ${x[0]}"><span class="val"${x[3]?' style="font-size:13px"':''}>${x[2]}</span><span class="lbl">${x[1]}</span></div>`;
  let html='<div class="summary-grid">'+k.slice(0,4).map(box).join('')+'</div>'
         + '<div class="summary-grid">'+k.slice(4).map(box).join('')+'</div>';

  html+='<div class="card"><div class="card-title between"><span class="t">📉 اتجاه المنصرف</span>'
      + `<span class="an-seg"><button type="button" class="an-chip${_anBucket==='week'?' on':''}" onclick="anSetBucket('week')">أسبوعي</button>`
      + `<button type="button" class="an-chip${_anBucket==='month'?' on':''}" onclick="anSetBucket('month')">شهري</button></span></div>`
      + anBarChart(_anTrend)+'</div>';

  if(anIsMx()){
    // الشبكة عريضة بطبعها — قايمة أعلى الثنائيات بتخلي الشاشة مفيدة على الموبايل كمان
    html+='<div class="card"><div class="card-title"><span>🔝</span> أعلى الثنائيات (مقاول — مكان)</div>'+anRowBars(d.topPairs)+'</div>'
        + '<div class="card"><div class="card-title"><span>🔀</span> مين اشتغل فين</div>'
        + '<div class="hint">كل خانة = منصرف المقاول ده في المكان ده. اللون بيتدرّج بترتيب الخانة بين الخانات كلها (أغمق = ترتيب أعلى) — الرقم نفسه هو المرجع. النقطة · معناها إن المقاول ماشتغلش في المكان ده في الفترة دي.'
        + (d.totals.hiddenContractors||d.totals.hiddenPlaces
            ? ` الشبكة بتعرض أعلى ${anInt(d.contractors.length)} مقاول × ${anInt(d.places.length)} مكان — الباقي (${anInt(d.totals.hiddenTotal)} ج.م) بره الشبكة، وبيظهر في تاب الأماكن والمقاولين كامل.`
            : '')
        + '</div><div class="apr-scroll">'+anMatrixTable(d)+'</div></div>';
    body.innerHTML=html;
    return;
  }

  html+='<div class="card"><div class="card-title"><span>'+(anIsCtr()?'👷':'🏗')+'</span> المنصرف على كل '+(anIsCtr()?'مقاول':'مكان')+'</div>'+anRowBars(d.rows)+'</div>';

  html+='<div class="card"><div class="card-title between"><span class="t">📋 التفاصيل</span>'
      + `<select id="an-sort" onchange="anSetSort(this.value)" class="an-sort">${AN_SORTS.map(s=>`<option value="${s.k}"${s.k===_anSort?' selected':''}>${esc(s.l)}</option>`).join('')}</select></div>`
      + (rows.length?('<div class="apr-scroll">'+anTable(rows)+'</div>'):'<div class="home-empty">مفيش بيانات في النطاق ده</div>')
      + '</div>';

  if(anIsCtr()){
    // السجل بيحتفظ باسم المقاول وقت التسجيل — فأي اسم برّا القائمة معناه إنه اتغيّر أو اتحذف بعدها
    const out=d.rows.filter(r=>!r.inList);
    if(out.length) html+='<div class="card accent-gold"><div class="card-title"><span>⚠</span> أسماء في السجلات مش في قائمة المقاولين</div>'
      + '<div class="hint">السجل بيحتفظ باسم المقاول زي ما كان وقت التسجيل. الأسماء دي معناها إن المقاول اتغيّر اسمه أو اتحذف من القائمة بعد ما السجلات اتكتبت — الفلوس محسوبة صح، بس الاسم مش هيتطابق مع القائمة الحالية:</div>'
      + out.map(r=>`<div class="setting-item"><div style="flex:1;min-width:0"><div class="setting-name">${esc(r.name)}</div><div class="setting-sub">${anInt(r.records)} سجل · ${anInt(r.total)} ج.م · آخر نشاط ${esc(r.lastDate||'—')}</div></div></div>`).join('')
      + '</div>';
  }else{
    // اختلاف كتابة نفس المكان = حد كتبه بإيده بدل ما يختاره
    const mixed=d.rows.filter(r=>r.variants.length>1);
    if(mixed.length) html+='<div class="card accent-gold"><div class="card-title"><span>✎</span> أماكن مكتوبة بأكتر من صيغة</div>'
      + '<div class="hint">الأرقام اتجمعت صح (التطبيق بيوحّد الهمزات والمسافات)، بس يُفضّل توحيد الكتابة عند المهندسين عشان القوائم تبقى نضيفة:</div>'
      + mixed.map(r=>`<div class="setting-item"><div style="flex:1;min-width:0"><div class="setting-name">${esc(r.name)}</div><div class="setting-sub">${esc(r.variants.join('  ·  '))}</div></div></div>`).join('')
      + '</div>';
  }

  body.innerHTML=html;
}

/* ═══════════════ 🔔 التنبيهات الداخلية ═══════════════
   السيرفر بيخزّن **تعريف** التنبيه بس (عنوان + جدولة + مستقبلين)، والجهاز بيحسب
   مواعيد الظهور محليًا — فالجرس شغّال حتى أوفلاين من آخر نسخة اتحمّلت.
   نوعان في نفس اللوحة:
     • تنبيهات الأدمن (من تاب "التنبيهات") — ليها "✅ تم" لكل ظهور على حدة
     • تنبيهات تلقائية بيحسبها النظام (كشف مستني اعتمادك / كشف مرفوض / مهام متأخرة)
       — ما فيهاش "تم": بتختفي لوحدها لما السبب يخلص، وفيها "🕘 مش دلوقتي" لليوم. */

let notifDefs=[], notifAuto={}, _notifKeysShown=null, _notifUsers=[];
function notifLoadCache(){
  try{ const c=JSON.parse(localStorage.getItem('cea_notifs')||'null');
    if(c){ notifDefs=Array.isArray(c.list)?c.list:[]; notifAuto=c.auto||{}; } }catch(e){}
}
function notifSaveCache(){
  try{ localStorage.setItem('cea_notifs', JSON.stringify({list:notifDefs, auto:notifAuto, at:Date.now()})); }catch(e){}
}
notifLoadCache();

const NOTIF_DAY_NAMES=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']; // نفس ترتيب getDay()
const NOTIF_WEEK_ORDER=[6,0,1,2,3,4,5];  // العرض بيبدأ بالسبت (أول الأسبوع عندنا)
const NOTIF_GRACE_DAYS=1;                // التنبيه اللي فات ميعاده بيفضل ظاهر يوم كمان (متأخر)

function notifTime12(t){
  const p=String(t||'08:00').split(':'); const h=Number(p[0])||0, m=Number(p[1])||0;
  return (h%12||12)+':'+String(m).padStart(2,'0')+(h<12?' ص':' م');
}
// فرق الأيام بين تاريخين نصيين (YYYY-MM-DD) بتوقيت الجهاز
function notifDayDiff(a,b){
  const d1=new Date(a+'T00:00:00'), d2=new Date(b+'T00:00:00');
  return Math.round((d1-d2)/86400000);
}
function notifRelDay(ymd){
  const diff=notifDayDiff(ymd, todayYMD());
  if(diff===0) return 'النهاردة';
  if(diff===1) return 'بكرة';
  if(diff===-1) return 'إمبارح';
  const d=new Date(ymd+'T00:00:00');
  const label=NOTIF_DAY_NAMES[d.getDay()]+' '+d.toLocaleDateString('ar-EG',{day:'numeric',month:'long'});
  return (diff>0?'':'')+label;
}
// اليوم ده ميعاد للتنبيه ده؟ (بيحترم نافذة البداية/النهاية)
function notifMatchesDay(def, d){
  const ymd=toYMD(d);
  if(def.startDate && ymd<def.startDate) return false;
  if(def.endDate   && ymd>def.endDate)   return false;
  if(def.schedule==='daily')  return true;
  if(def.schedule==='once')   return ymd===def.onceDate;
  if(def.schedule==='weekly') return (def.weekdays||[]).indexOf(d.getDay())>=0;
  if(def.schedule==='monthly'){
    const last=new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    return d.getDate()===Math.min(Number(def.monthDay)||1, last);
  }
  return false;
}
// الظهور المستحق دلوقتي: بيفتح قبل الميعاد بـ leadDays (من ساعة الميعاد) وبيفضل ليوم بعده
function notifCurrentOccurrence(def, now){
  const done={}; (def.done||[]).forEach(k=>done[k]=1);
  const p=String(def.timeOfDay||'08:00').split(':');
  const hh=Number(p[0])||0, mm=Number(p[1])||0;
  const lead=Math.max(0, Number(def.leadDays)||0);
  for(let off=-NOTIF_GRACE_DAYS; off<=lead; off++){
    const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+off);
    if(!notifMatchesDay(def,d)) continue;
    const key=toYMD(d);
    if(done[key]) continue;
    const showFrom=new Date(d); showFrom.setDate(showFrom.getDate()-lead); showFrom.setHours(hh,mm,0,0);
    const hideAfter=new Date(d); hideAfter.setDate(hideAfter.getDate()+NOTIF_GRACE_DAYS); hideAfter.setHours(23,59,59,999);
    if(now>=showFrom && now<=hideAfter) return {key:key, ymd:key};
  }
  return null;
}
// أقرب ميعاد جاي (للسطر التحتاني في اللوحة وللمعاينة في تاب الإدارة)
function notifNextOccurrence(def){
  for(let off=0; off<=400; off++){
    const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+off);
    if(notifMatchesDay(def,d)) return toYMD(d);
  }
  return null;
}

// ── "مش دلوقتي" للتنبيهات التلقائية (على الجهاز بس، لآخر اليوم) ──
function notifSnoozeMap(){ try{ return JSON.parse(localStorage.getItem('cea_notif_snooze')||'{}'); }catch(e){ return {}; } }
function notifSnoozed(key){ return notifSnoozeMap()[key]===todayYMD(); }
function notifSnooze(key){
  const m=notifSnoozeMap(); m[key]=todayYMD();
  try{ localStorage.setItem('cea_notif_snooze', JSON.stringify(m)); }catch(e){}
  renderBell(); renderNotifyPanel();
}

// ── التنبيهات التلقائية (اعتمادات + كشوف مرفوضة من السيرفر، المهام المتأخرة من بيانات الجهاز) ──
function notifAutoItems(){
  const a=notifAuto||{}, out=[];
  if(a.approvals && a.approvals.count){
    out.push({auto:true, key:'auto:approvals', icon:'📋', level:'urgent',
      title:a.approvals.count+' كشف مستني اعتمادك',
      body:'ادخل تاب "اعتمادات المديرين" واعتمد الكشوف اللي دورك فيها.', tab:'approvals'});
  }
  if(a.rejected && a.rejected.count){
    const lines=(a.rejected.items||[]).map(i=>'• '+(i.contractorName||'كشف')+(i.note?' — '+i.note:'')).join('\n');
    out.push({auto:true, key:'auto:rejected', icon:'❌', level:'urgent',
      title:a.rejected.count+' كشف مرفوض محتاج تعديل وإعادة إرسال',
      body:lines||'ادخل تاب "التسليمات" وشوف سبب الرفض.', tab:'submissions'});
  }
  if(a.backup){
    const b=a.backup;
    out.push({auto:true, key:'auto:backup', icon:'💾', level:'urgent',
      title: !b.at ? 'مفيش نسخة احتياطية متسجّلة' : (b.ok ? 'آخر نسخة احتياطية بقالها أكتر من يوم ونص' : 'آخر نسخة احتياطية فشلت'),
      body: (b.detail ? b.detail + ' · ' : '')+'افتح إدارة الحسابات → كارت "🗄 النسخة الاحتياطية" وخد نسخة يدوية للتأكد.',
      tab:'admin'});
  }
  const late=(typeof todos!=='undefined'?todos:[]).filter(t=>!t.done && t.date && t.date<todayYMD()).length;
  if(late && moduleEnabled('todo')){
    out.push({auto:true, key:'auto:todos', icon:'⏰', level:'warn',
      title:late+' مهمة فات ميعادها', body:'خلّصها أو أجّل ميعادها من تاب "المهام".', tab:'todo'});
  }
  return out.filter(x=>!notifSnoozed(x.key));
}

// كل التنبيهات المستحقة دلوقتي: التلقائي الأول (عمل مطلوب فعلًا) وبعده تنبيهات الأدمن بالأقدم ميعادًا
function notifActiveItems(){
  const now=new Date(), out=[];
  notifDefs.forEach(def=>{
    const occ=notifCurrentOccurrence(def, now);
    if(occ) out.push({def:def, occ:occ, key:'n'+def.id+':'+occ.key, icon:def.icon||'🔔',
      level:def.level||'info', title:def.title, body:def.body||'', tab:def.linkTab||''});
  });
  out.sort((x,y)=> String(x.occ.ymd).localeCompare(String(y.occ.ymd)));
  return notifAutoItems().concat(out);
}

// ── الجرس ──
function renderBell(){
  const btn=document.getElementById('bell-btn'), badge=document.getElementById('bell-badge');
  if(!btn) return;
  btn.style.display = getAccessToken() ? 'flex' : 'none';
  const items=notifActiveItems(), n=items.length;
  if(badge){ badge.style.display = n?'':'none'; badge.textContent = n>9?'9+':String(n); }
  // تنبيه جديد ظهر والتطبيق مفتوح؟ رنّة + Toast مرة واحدة
  const keys=items.map(i=>i.key);
  if(_notifKeysShown){
    const fresh=items.filter(i=>_notifKeysShown.indexOf(i.key)<0);
    if(fresh.length){
      btn.classList.add('ringing'); setTimeout(()=>btn.classList.remove('ringing'), 3000);
      showToast('🔔 '+fresh[0].title+(fresh.length>1?(' (+'+(fresh.length-1)+')'):''));
    }
  }
  _notifKeysShown=keys;
  if(document.body.classList.contains('notify-open')) renderNotifyPanel();
}

function toggleNotifyPanel(){
  if(document.body.classList.contains('notify-open')) closeNotifyPanel(); else openNotifyPanel();
}
function openNotifyPanel(){
  document.body.classList.add('notify-open');
  const p=document.getElementById('notify-panel'); if(p) p.setAttribute('aria-hidden','false');
  const b=document.getElementById('bell-btn'); if(b) b.setAttribute('aria-expanded','true');
  const mb=document.getElementById('notify-manage-btn'); if(mb) mb.style.display = isAdmin()?'':'none';
  renderNotifyPanel();
  loadNotifications();
}
function closeNotifyPanel(){
  document.body.classList.remove('notify-open');
  const p=document.getElementById('notify-panel'); if(p) p.setAttribute('aria-hidden','true');
  const b=document.getElementById('bell-btn'); if(b) b.setAttribute('aria-expanded','false');
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeNotifyPanel(); });

function notifWhenLabel(item){
  if(item.auto) return {txt:'دلوقتي', late:true};
  const k=item.occ.ymd, diff=notifDayDiff(k, todayYMD()), t=notifTime12(item.def.timeOfDay);
  if(diff===0)  return {txt:'⏰ النهاردة الساعة '+t, late:false};
  if(diff<0)    return {txt:'⚠ كان المفروض '+notifRelDay(k)+' — لسه ما اتعملش', late:true};
  return {txt:'🗓 '+notifRelDay(k)+' الساعة '+t, late:false};
}
function notifItemHtml(item){
  const w=notifWhenLabel(item);
  const cls = item.auto ? 'lv-auto' : ('lv-'+(item.level||'info'));
  const go = item.tab ? '<button class="go" onclick="notifGo(\''+esc(item.tab)+'\')">فتح</button>' : '';
  const act = item.auto
    ? go+'<button onclick="notifSnooze(\''+esc(item.key)+'\')">مش دلوقتي</button>'
    : go+'<button onclick="notifDone(\''+esc(String(item.def.id))+'\',\''+esc(item.occ.ymd)+'\')">✅ تم</button>';
  return '<div class="notify-item '+cls+'">'
    +'<div class="ic">'+esc(item.icon||'🔔')+'</div>'
    +'<div class="bd"><div class="ti">'+esc(item.title||'')+'</div>'
    +(item.body?'<div class="tx">'+esc(item.body)+'</div>':'')
    +'<div class="when'+(w.late?' late':'')+'">'+esc(w.txt)+'</div></div>'
    +'<div class="acts">'+act+'</div></div>';
}
function renderNotifyPanel(){
  const box=document.getElementById('notify-list'); if(!box) return;
  const items=notifActiveItems();
  box.innerHTML = items.length ? items.map(notifItemHtml).join('')
    : '<div class="home-empty">✅ مفيش تنبيهات مستحقة دلوقتي</div>';
  // السطر التحتاني: أقرب تنبيه جاي (عشان تعرف إن فيه حاجة مجدولة حتى لو اللوحة فاضية)
  const foot=document.getElementById('notify-foot'); if(!foot) return;
  let best=null;
  notifDefs.forEach(def=>{
    const nx=notifNextOccurrence(def);
    if(nx && (!best || nx<best.ymd)) best={ymd:nx, def:def};
  });
  foot.innerHTML = best
    ? ('🗓 الجاي: <b>'+esc(best.def.title)+'</b> — '+esc(notifRelDay(best.ymd))+' الساعة '+esc(notifTime12(best.def.timeOfDay)))
    : (notifDefs.length?'':'مفيش تنبيهات مجدولة'+(isAdmin()?' — ضيفها من "⚙️ إدارة"':''));
}
function notifGo(tab){ closeNotifyPanel(); if(tab) switchTab(tab); }

// ── "تم" على ظهور: بيتسجل محليًا فورًا، وبيتبعت للسيرفر (لو أوفلاين بيستنى في طابور) ──
function notifPendingGet(){ try{ return JSON.parse(localStorage.getItem('cea_notif_pending')||'[]'); }catch(e){ return []; } }
function notifPendingSet(a){ try{ localStorage.setItem('cea_notif_pending', JSON.stringify(a)); }catch(e){} }
async function notifFlushPending(){
  const q=notifPendingGet(); if(!q.length || !navigator.onLine || !getAccessToken()) return;
  const left=[];
  for(const it of q){
    try{ await api('POST','/api/notifications/'+it.id+'/'+(it.undo?'undone':'done'), {occurrence:it.occurrence}); }
    catch(e){ if(!e.status || e.status>=500) left.push(it); } // 404 = التنبيه اتمسح → نسيبه
  }
  notifPendingSet(left);
}
async function notifDone(id, occurrence){
  const def=notifDefs.filter(d=>String(d.id)===String(id))[0];
  if(def){ def.done=(def.done||[]).concat([occurrence]); notifSaveCache(); }
  renderBell(); renderNotifyPanel();
  showToast('✅ تمام — هيرجع يظهر في ميعاده الجاي');
  try{ await api('POST','/api/notifications/'+id+'/done',{occurrence}); }
  catch(e){ notifPendingSet(notifPendingGet().concat([{id:id, occurrence:occurrence}])); }
}

// ── تحميل التنبيهات من السيرفر ──
let _notifLoading=false;
async function loadNotifications(manual){
  if(!getAccessToken()) return;
  if(!navigator.onLine){ if(manual) showToast('⚠ أوفلاين — المعروض من آخر تحديث'); renderBell(); return; }
  if(_notifLoading) return;
  _notifLoading=true;
  try{
    await notifFlushPending();
    const r=await api('GET','/api/notifications');
    notifDefs=(r.data&&r.data.notifications)||[];
    notifAuto=(r.data&&r.data.auto)||{};
    notifSaveCache();
    if(manual) showToast('✅ اتحدّثت');
  }catch(e){
    if(manual) showToast('⚠ '+(e.message||'تعذر تحديث التنبيهات'), true);
  }finally{
    _notifLoading=false;
    renderBell();
  }
}
setInterval(()=>{ renderBell(); }, 60*1000);                                   // مواعيد الظهور بتتحسب على الجهاز
setInterval(()=>{ if(!document.hidden) loadNotifications(); }, 5*60*1000);     // تعريفات جديدة/تنبيهات تلقائية
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden){ renderBell(); loadNotifications(); } });
window.addEventListener('online', ()=>loadNotifications());

/* ═══════════ تاب "التنبيهات" — إدارة (أدمن فقط) ═══════════ */
let _notifAll=[], _notifEditId=null;

function notifScheduleText(d){
  let s='';
  if(d.schedule==='daily') s='كل يوم';
  else if(d.schedule==='weekly') s='كل '+((d.weekdays||[]).map(x=>NOTIF_DAY_NAMES[x]).join(' و')||'—');
  else if(d.schedule==='monthly') s='يوم '+(d.monthDay||'—')+' من كل شهر';
  else s='مرة واحدة يوم '+(d.onceDate||'—');
  s+=' · '+notifTime12(d.timeOfDay);
  if(d.leadDays>0) s+=' · بينبّه قبلها '+(d.leadDays===1?'بيوم':(d.leadDays===2?'بيومين':('بـ'+d.leadDays+' أيام')));
  if(d.startDate||d.endDate) s+=' · ('+(d.startDate||'من دلوقتي')+' ← '+(d.endDate||'مفتوح')+')';
  return s;
}
function notifAudienceText(d){
  if(d.audience==='all')   return '👥 كل الحسابات';
  if(d.audience==='me')    return '🙋 أنا بس';
  if(d.audience==='site')  return '🏗️ حسابات '+siteName(d.audienceSite);
  if(d.audience==='grade') return '🎖️ '+gradeLabel(d.audienceGrade);
  const names=(d.userIds||[]).map(id=>{
    const u=_notifUsers.filter(x=>String(x.id)===String(id))[0];
    return u?personName(u):('#'+id);
  });
  return '👤 '+(names.join('، ')||'حسابات مختارة');
}
function notifAdminRow(d){
  const nx=notifNextOccurrence(d);
  return '<div class="notif-row'+(d.active?'':' off')+'">'
    +'<div class="ic">'+esc(d.icon||'🔔')+'</div>'
    +'<div class="bd"><div class="n">'+esc(d.title)+(d.active?'':' <span style="font-size:11px;color:var(--muted)">(موقوف)</span>')+'</div>'
    +(d.body?'<div class="s">'+esc(d.body)+'</div>':'')
    +'<div class="s">⏰ '+esc(notifScheduleText(d))+'</div>'
    +'<div class="s">'+esc(notifAudienceText(d))+(d.linkTab?(' · يفتح: '+esc(TAB_TITLES[d.linkTab]||d.linkTab)):'')+'</div>'
    +'<div class="s">'+(d.active&&nx?('🗓 الجاي: '+esc(notifRelDay(nx))):'—')+'</div></div>'
    +'<div class="acts">'
    +'<button class="btn-sm-edit" onclick="notifEdit(\''+esc(String(d.id))+'\')">✏️</button>'
    +'<button class="btn-sm-edit" style="background:var(--muted)" onclick="notifToggleActive(\''+esc(String(d.id))+'\')">'+(d.active?'⏸':'▶')+'</button>'
    +'<button class="btn-sm-edit" style="background:var(--red)" onclick="notifDelete(\''+esc(String(d.id))+'\')">🗑</button>'
    +'</div></div>';
}
async function renderNotifyAdmin(){
  if(!isAdmin()){ switchTab('home'); return; }
  notifBuildWeekdays();
  notifFillPickers();
  const box=document.getElementById('notify-admin-list'); if(!box) return;
  if(!navigator.onLine){ box.innerHTML='<div class="home-empty">⚠ إدارة التنبيهات محتاجة اتصال بالنت</div>'; return; }
  try{
    try{ _notifUsers=(await api('GET','/api/admin/users')).data||[]; }catch(e){ _notifUsers=[]; }
    notifFillUsers();
    _notifAll=(await api('GET','/api/notifications/manage')).data||[];
    box.innerHTML = _notifAll.length ? _notifAll.map(notifAdminRow).join('')
      : '<div class="home-empty">مفيش تنبيهات لسه — اضغط "➕ تنبيه جديد"</div>';
  }catch(e){ box.innerHTML='<div class="home-empty">⚠ '+esc(e.message||'تعذر التحميل')+'</div>'; }
}
function notifBuildWeekdays(){
  const box=document.getElementById('nf-weekdays'); if(!box || box.children.length) return;
  box.innerHTML=NOTIF_WEEK_ORDER.map(d=>'<button type="button" class="nf-day" data-d="'+d+'" onclick="this.classList.toggle(\'on\');notifPreview()">'+NOTIF_DAY_NAMES[d]+'</button>').join('');
}
function notifFillPickers(){
  const st=document.getElementById('nf-site');
  if(st) st.innerHTML='<option value="1">'+esc(siteName(1))+'</option><option value="2">'+esc(siteName(2))+'</option>';
  const gr=document.getElementById('nf-grade');
  if(gr) gr.innerHTML=Object.keys(GRADE_LABELS).map(g=>'<option value="'+esc(g)+'">'+esc(GRADE_LABELS[g])+'</option>').join('');
}
function notifFillUsers(){
  const box=document.getElementById('nf-users'); if(!box) return;
  box.innerHTML=_notifUsers.map(u=>'<label class="pref-row" style="min-height:40px;padding:5px 2px;cursor:pointer">'
    +'<span class="pref-title" style="font-size:13px;font-weight:700">'+esc(personName(u))+' <span style="font-weight:600;color:var(--muted);direction:ltr;unicode-bidi:embed">'+esc(u.email)+'</span></span>'
    +'<input type="checkbox" class="nf-user-cb" value="'+esc(String(u.id))+'" style="width:20px;height:20px;accent-color:var(--gold)"></label>').join('')
    || '<div class="home-empty">لا يوجد حسابات</div>';
}
function notifSetForm(d){
  const g=id=>document.getElementById(id);
  g('nf-title').value=d.title||'';
  g('nf-body').value=d.body||'';
  g('nf-icon').value=d.icon||'';
  g('nf-level').value=d.level||'info';
  g('nf-schedule').value=d.schedule||'weekly';
  g('nf-monthday').value=d.monthDay||'';
  g('nf-oncedate').value=d.onceDate||'';
  g('nf-time').value=d.timeOfDay||'08:00';
  g('nf-lead').value=d.leadDays||0;
  g('nf-start').value=d.startDate||'';
  g('nf-end').value=d.endDate||'';
  g('nf-audience').value=d.audience||'me';
  g('nf-site').value=String(d.audienceSite||1);
  if(d.audienceGrade) g('nf-grade').value=d.audienceGrade;
  g('nf-linktab').value=d.linkTab||'';
  const days=d.weekdays||[];
  document.querySelectorAll('#nf-weekdays .nf-day').forEach(b=>b.classList.toggle('on', days.indexOf(Number(b.dataset.d))>=0));
  const ids=(d.userIds||[]).map(String);
  document.querySelectorAll('.nf-user-cb').forEach(cb=>{ cb.checked = ids.indexOf(String(cb.value))>=0; });
  notifScheduleChanged(); notifAudienceChanged();
}
function notifNew(){
  _notifEditId=null;
  notifBuildWeekdays(); notifFillPickers(); notifFillUsers();
  // الافتراضي = المثال الأشهر عندنا: كل ثلاثاء الساعة 9 صباحًا مع تنبيه قبلها بيوم
  notifSetForm({schedule:'weekly', weekdays:[2], timeOfDay:'09:00', leadDays:1, level:'warn', icon:'🔔', audience:'me'});
  document.getElementById('notify-form-title').textContent='➕ تنبيه جديد';
  document.getElementById('notify-form-card').style.display='block';
  document.getElementById('nf-title').focus();
}
function notifEdit(id){
  const d=_notifAll.filter(x=>String(x.id)===String(id))[0]; if(!d) return;
  _notifEditId=String(id);
  notifBuildWeekdays(); notifFillPickers(); notifFillUsers();
  notifSetForm(d);
  document.getElementById('notify-form-title').textContent='✏️ تعديل التنبيه';
  document.getElementById('notify-form-card').style.display='block';
  document.getElementById('notify-form-card').scrollIntoView({behavior:'smooth', block:'start'});
}
function notifCancel(){ _notifEditId=null; document.getElementById('notify-form-card').style.display='none'; }
function notifScheduleChanged(){
  const v=document.getElementById('nf-schedule').value;
  document.getElementById('nf-weekly-wrap').style.display  = v==='weekly'?'':'none';
  document.getElementById('nf-monthly-wrap').style.display = v==='monthly'?'':'none';
  document.getElementById('nf-once-wrap').style.display    = v==='once'?'':'none';
  notifPreview();
}
function notifAudienceChanged(){
  const v=document.getElementById('nf-audience').value;
  document.getElementById('nf-site-wrap').style.display  = v==='site'?'':'none';
  document.getElementById('nf-grade-wrap').style.display = v==='grade'?'':'none';
  document.getElementById('nf-users-wrap').style.display = v==='users'?'':'none';
  notifPreview();
}
function notifReadForm(){
  const g=id=>document.getElementById(id).value;
  const days=[]; document.querySelectorAll('#nf-weekdays .nf-day.on').forEach(b=>days.push(Number(b.dataset.d)));
  const ids=[]; document.querySelectorAll('.nf-user-cb:checked').forEach(cb=>ids.push(cb.value));
  return {
    title:g('nf-title').trim(), body:g('nf-body').trim(), icon:g('nf-icon').trim()||'🔔',
    level:g('nf-level'), schedule:g('nf-schedule'),
    onceDate:g('nf-oncedate')||null, weekdays:days, monthDay:g('nf-monthday')?Number(g('nf-monthday')):null,
    timeOfDay:g('nf-time')||'08:00', leadDays:Number(g('nf-lead'))||0,
    startDate:g('nf-start')||null, endDate:g('nf-end')||null,
    audience:g('nf-audience'), audienceSite:Number(g('nf-site'))||1, audienceGrade:g('nf-grade'),
    userIds:ids, linkTab:g('nf-linktab')
  };
}
// معاينة حيّة: التنبيه ده هيظهر إمتى وليمين
function notifPreview(){
  const box=document.getElementById('nf-preview'); if(!box) return;
  const d=notifReadForm();
  const nx=notifNextOccurrence(d);
  let s='⏰ '+notifScheduleText(d)+'<br>'+notifAudienceText(d);
  if(nx){
    s+='<br>🗓 أول ظهور: '+notifRelDay(nx);
    if(d.leadDays>0){
      const pre=new Date(nx+'T00:00:00'); pre.setDate(pre.getDate()-d.leadDays);
      s+=' — وهيبتدي يبان في الجرس من '+notifRelDay(toYMD(pre))+' الساعة '+notifTime12(d.timeOfDay);
    }
  }else s+='<br>⚠ مفيش ميعاد جاي بالإعدادات دي';
  box.innerHTML=s;
}
document.addEventListener('input', e=>{
  if(e.target && e.target.id && e.target.id.indexOf('nf-')===0) notifPreview();
});
async function notifSave(){
  const body=notifReadForm();
  if(!body.title){ showToast('⚠ اكتب عنوان التنبيه', true); return; }
  if(body.schedule==='weekly' && !body.weekdays.length){ showToast('⚠ اختار يوم واحد على الأقل', true); return; }
  if(body.schedule==='monthly' && !body.monthDay){ showToast('⚠ اكتب يوم الشهر', true); return; }
  if(body.schedule==='once' && !body.onceDate){ showToast('⚠ اختار تاريخ التنبيه', true); return; }
  if(body.audience==='users' && !body.userIds.length){ showToast('⚠ اختار حساب واحد على الأقل', true); return; }
  const btn=document.getElementById('nf-save-btn'); btn.disabled=true;
  try{
    if(_notifEditId) await api('PATCH','/api/notifications/manage/'+_notifEditId, body);
    else await api('POST','/api/notifications/manage', body);
    showToast('✅ اتحفظ');
    notifCancel();
    await renderNotifyAdmin();
    loadNotifications();
  }catch(e){ showToast('⚠ '+(e.message||'تعذر الحفظ'), true); }
  finally{ btn.disabled=false; }
}
async function notifToggleActive(id){
  const d=_notifAll.filter(x=>String(x.id)===String(id))[0]; if(!d) return;
  try{
    await api('PATCH','/api/notifications/manage/'+id, {active: !d.active});
    showToast(d.active?'⏸ اتوقف':'▶ اشتغل');
    await renderNotifyAdmin(); loadNotifications();
  }catch(e){ showToast('⚠ '+(e.message||'تعذر التعديل'), true); }
}
async function notifDelete(id){
  const d=_notifAll.filter(x=>String(x.id)===String(id))[0];
  if(!confirm('حذف التنبيه "'+((d&&d.title)||'')+'" نهائيًا؟')) return;
  try{
    await api('DELETE','/api/notifications/manage/'+id);
    showToast('🗑 اتحذف');
    await renderNotifyAdmin(); loadNotifications();
  }catch(e){ showToast('⚠ '+(e.message||'تعذر الحذف'), true); }
}

/* ═══════════ 🗄 حالة النسخة الاحتياطية (شاشة الأدمن) ═══════════
   المساران موجودين في السيرفر من زمان (`/admin/backup-status` و`/admin/backup-now`) ومكانش
   فيه أي واجهة بتناديهم — يعني فشل النسخة كان بيفضل في اللوجات لحد ما حد يدوّر. */
function backupAgeText(at){
  if(!at) return 'مفيش نسخة متسجّلة';
  const ms=Date.now()-Date.parse(at);
  if(!Number.isFinite(ms)) return esc(String(at));
  const h=Math.floor(ms/3600000);
  if(h<1) return 'من شوية';
  if(h<24) return 'من '+h+' ساعة';
  const d=Math.floor(h/24);
  return d===1?'من يوم':(d===2?'من يومين':'من '+d+' أيام');
}
async function loadBackupStatus(){
  const box=document.getElementById('backup-status'); if(!box) return;
  if(!navigator.onLine){ box.innerHTML='<div class="home-empty">⚠ محتاج اتصال بالنت</div>'; return; }
  box.innerHTML='<div class="home-empty">⏳</div>';
  try{
    const st=(await api('GET','/api/admin/backup-status')).data;
    if(!st){
      box.innerHTML='<div class="setting-item"><div style="flex:1"><div class="setting-name" style="color:var(--danger-fg)">⚠ مفيش نسخة احتياطية متسجّلة</div>'
        +'<div class="setting-sub">يا إما السيرفر لسه ما عملش نسخة من يوم آخر نشر، يا إما ربط جوجل مش مفعّل.</div></div></div>';
      return;
    }
    const at=st.at, ageMs=at?(Date.now()-Date.parse(at)):Infinity;
    const stale=!(ageMs<36*3600*1000);
    const ok=st.ok===true && !stale;
    const when=at ? new Date(at).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}) : '—';
    const color = ok?'var(--ok-fg)':'var(--danger-fg)';
    const head = st.ok===true ? (stale?'⚠ آخر نسخة نجحت — بس بقالها وقت':'✅ آخر نسخة نجحت') : '❌ آخر نسخة فشلت';
    box.innerHTML='<div class="setting-item"><div style="flex:1;min-width:0">'
      +'<div class="setting-name" style="color:'+color+'">'+head+' · '+esc(backupAgeText(at))+'</div>'
      +'<div class="setting-sub">'+esc(when)+'</div>'
      +(st.detail?'<div class="setting-sub" style="margin-top:3px">'+esc(st.detail)+'</div>':'')
      +'</div></div>';
  }catch(e){ box.innerHTML='<div class="home-empty">⚠ '+esc(e.message||'تعذر التحميل')+'</div>'; }
}
async function runBackupNow(){
  if(!confirm('تاخد نسخة احتياطية كاملة دلوقتي وترفعها على Google Drive؟')) return;
  const btn=document.getElementById('backup-now-btn');
  const old=btn.textContent; btn.disabled=true; btn.textContent='⏳ جاري أخذ النسخة...';
  try{
    const r=await api('POST','/api/admin/backup-now');
    showToast('✅ '+((r.data&&r.data.detail)||'تمت النسخة'));
  }catch(e){ showToast('⚠ '+(e.message||'فشل النسخ الاحتياطي'), true); }
  finally{
    btn.disabled=false; btn.textContent=old;
    loadBackupStatus();
    loadNotifications(); // التنبيه في الجرس يختفي/يظهر حسب النتيجة
  }
}
