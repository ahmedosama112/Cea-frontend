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
function _loadScriptOnce(src){
  return new Promise((resolve, reject)=>{
    if(document.querySelector('script[data-lazylib="'+src+'"]')){ resolve(); return; }
    const s=document.createElement('script');
    s.src=src;
    s.dataset.lazylib=src;
    s.onload=()=>resolve();
    s.onerror=()=>reject(new Error('فشل تحميل المكتبة: '+src));
    document.head.appendChild(s);
  });
}
// المكتبة المحلية (lib/ داخل APK) أولاً — ولو مش موجودة (نسخة PWA على الويب) بنحمّلها من CDN
function _loadLib(localSrc, cdnSrc){
  return _loadScriptOnce(localSrc).catch(()=>_loadScriptOnce(cdnSrc));
}
let _xlsxLoadPromise=null;
function ensureXLSX(){
  if(window.XLSX) return Promise.resolve();
  if(!_xlsxLoadPromise) _xlsxLoadPromise=_loadLib('lib/xlsx.full.min.js','https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  return _xlsxLoadPromise;
}
let _exceljsLoadPromise=null;
function ensureExcelJS(){
  if(window.ExcelJS) return Promise.resolve();
  if(!_exceljsLoadPromise) _exceljsLoadPromise=_loadLib('lib/exceljs.min.js','https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js');
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
let todos       = JSON.parse(localStorage.getItem('saraki_todos')       || '[]');
let contractors = JSON.parse(localStorage.getItem('saraki_contractors') || 'null') || [];
let places      = JSON.parse(localStorage.getItem('saraki_places')      || 'null') || [];
// ملاحظات الأماكن {اسم المكان: الملاحظة} — بتظهر للمهندس كأيقونة ❕ جنب اختيار المكان في تسجيل السركي
let placeNotes  = JSON.parse(localStorage.getItem('cea_place_notes')    || '{}');
function savePlaceNotes(){ try{ localStorage.setItem('cea_place_notes', JSON.stringify(placeNotes)); }catch(e){} }
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
const contractorOpts = () => contractors.map(c=>opt(c.name)).join('');
const placeOpts      = () => places.map(opt).join('');
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
    const special = o.value==='' || o.value==='__ALL__';
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
  ['f-place','ir-place','todo-place'].forEach(id=>fillSelect(id,'<option value="">-- اختر المكان --</option>',placeOpts()));
  fillSelect('search-place','<option value="">📍 كل الأماكن</option>',placeOpts());
  fillSelect('search-contractor-filter','<option value="">👷 كل المقاولين</option>',contractorOpts());
  fillSelect('f-deduct-on-select','<option value="">-- اختر مقاول --</option>',contractorOpts());
  fillSelect('export-contractor-select','<option value="">-- اضف مقاول --</option><option value="__ALL__">➕ اضافة جميع المقاولين</option>',contractorOpts());
  fillSelect('export-place-select','<option value="">-- اضف مكان --</option><option value="__ALL__">➕ اضافة جميع الأماكن</option>',placeOpts());
  fillSelect('ir-inspector','<option value="">-- اختر الاستشاري --</option>',inspectors.map(opt).join(''));
  fillSelect('ir-item','<option value="">-- اختر البند --</option>',itemsOptGroups());
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

function renderSettings() {
  document.querySelectorAll('.admin-only').forEach(el=>{ el.style.display = isAdmin() ? '' : 'none'; });
  const rateTypeLabel = {ساعة:'ساعة',يومية:'يومية',مقطوعية:'مقطوعية'};
  const emptyP = txt => `<p class="hint" style="padding:8px 0;margin:0">${txt}</p>`;
  document.getElementById('contractors-list').innerHTML = contractors.length
    ? contractors.map((c,i)=>`
      <div class="setting-item">
        <div style="flex:1;min-width:0">
          <div class="setting-name">${esc(c.name)}</div>
          <div class="setting-sub">${esc(c.spec)}${c.rate?` · ${Number(c.rate).toLocaleString('ar-EG')} ج.م / ${esc(c.rateType||'يومية')}`:''}</div>
        </div>
        ${isAdmin()?`<div class="setting-actions">
          <button class="btn-sm-edit" onclick="startEditContractor(${i})">تعديل</button>
          <button class="btn-sm-del"  onclick="removeContractor(${i})">حذف</button>
        </div>`:''}
      </div>`).join('')
    : emptyP('لا يوجد مقاولين');

  document.getElementById('places-list').innerHTML = places.length
    ? places.map((p,i)=>`<div class="setting-item">
        <div style="flex:1;min-width:0">
          <div class="setting-name">${esc(p)}</div>
          ${placeNotes[p]?`<div class="setting-sub">❕ ${esc(placeNotes[p])}</div>`:''}
        </div>
        ${isAdmin()?`<div class="setting-actions">
          <button class="btn-sm-edit" onclick="startEditPlace(${i})">تعديل</button>
          <button class="btn-sm-del" onclick="removePlace(${i})">حذف</button>
        </div>`:''}
      </div>`).join('')
    : emptyP('لا يوجد أماكن');
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
  if(!name){showToast('⚠ أدخل إسم المقاول',true);return;}
  contractors[i] = {name, spec, rate, rateType};
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
}

function addContractor() {
  const n = document.getElementById('new-contractor-name').value.trim();
  const s = document.getElementById('new-contractor-spec').value.trim();
  const r = document.getElementById('new-contractor-rate').value.trim();
  const rt = document.getElementById('new-contractor-rate-type').value;
  if(!n){showToast('⚠ أدخل إسم المقاول',true);return;}
  if(contractors.find(c=>c.name===n)){showToast('⚠ موجود مسبقاً',true);return;}
  contractors.push({name:n, spec:s||'—', rate:r, rateType:rt});
  saveAll(); populateDropdowns(); renderSettings(); pushContractorsToCloud();
  document.getElementById('new-contractor-name').value='';
  document.getElementById('new-contractor-spec').value='';
  document.getElementById('new-contractor-rate').value='';
  showToast('✅ تم إضافة المقاول');
}
function removeContractor(i){if(!confirm(`حذف "${contractors[i].name}"؟`))return;contractors.splice(i,1);saveAll();populateDropdowns();renderSettings();pushContractorsToCloud();showToast('🗑 تم الحذف');}
async function addPlace(){
  const ok = await requirePin();
  if(!ok) return;
  const p=document.getElementById('new-place').value.trim();if(!p){showToast('⚠ أدخل إسم المكان',true);return;}if(places.includes(p)){showToast('⚠ موجود مسبقاً',true);return;}
  const note=(document.getElementById('new-place-note')?.value||'').trim();
  places.push(p);
  if(note) placeNotes[p]=note; savePlaceNotes();
  saveAll();populateDropdowns();renderSettings();pushPlacesToCloud();
  document.getElementById('new-place').value=''; if(document.getElementById('new-place-note')) document.getElementById('new-place-note').value='';
  showToast('✅ تم إضافة المكان');
}
async function removePlace(i){
  const ok = await requirePin();
  if(!ok) return;
  if(!confirm(`حذف "${places[i]}"؟`))return;delete placeNotes[places[i]];savePlaceNotes();places.splice(i,1);saveAll();populateDropdowns();renderSettings();pushPlacesToCloud();showToast('🗑 تم الحذف');
}
async function editPlace(i, newName){
  const ok = await requirePin();
  if(!ok) return;
  newName = (newName||'').trim();
  if(!newName){ showToast('⚠ أدخل إسم المكان', true); return; }
  if(places.includes(newName)){ showToast('⚠ موجود مسبقاً', true); return; }
  if(placeNotes[places[i]]!==undefined){ placeNotes[newName]=placeNotes[places[i]]; delete placeNotes[places[i]]; savePlaceNotes(); }
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
  if(!newName){ showToast('⚠ أدخل إسم المكان', true); return; }
  if(newName!==oldName && places.includes(newName)){ showToast('⚠ موجود مسبقاً', true); return; }
  delete placeNotes[oldName];
  if(note) placeNotes[newName]=note; else delete placeNotes[newName];
  places[i]=newName;
  savePlaceNotes(); saveAll(); populateDropdowns(); renderSettings(); updatePlaceNoteIcon(); pushPlacesToCloud();
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
  if(name==='__ALL__'){
    contractors.forEach(c=>{ if(!exportContractorChips.includes(c.name)) exportContractorChips.push(c.name); });
    renderExportContractorChips();
    sel.value='';
    renderRecords();
    return;
  }
  if(!exportContractorChips.includes(name)){exportContractorChips.push(name);renderExportContractorChips();}
  sel.value='';
  renderRecords();
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
  if(name==='__ALL__'){
    places.forEach(p=>{ if(!exportPlaceChips.includes(p)) exportPlaceChips.push(p); });
    renderExportPlaceChips();
    sel.value='';
    renderRecords();
    return;
  }
  if(!exportPlaceChips.includes(name)){exportPlaceChips.push(name);renderExportPlaceChips();}
  sel.value='';
  renderRecords();
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
  if(!deductChips.includes(name)){deductChips.push(name);renderDeductChips();}
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
  if(c && c.rate) {
    document.getElementById('f-price').value = c.rate;
    if(c.rateType && document.getElementById('f-qty-type')) {
      document.getElementById('f-qty-type').value = c.rateType;
    }
    calcTotal();
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
function autoSetDay(dateVal){
  const dayName = dayNameOf(dateVal); if(!dayName) return;
  const sel = document.getElementById('f-day');
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
function calcTotal(){const q=parseFloat(document.getElementById('f-qty').value)||0,p=parseFloat(document.getElementById('f-price').value)||0,d=parseFloat(document.getElementById('f-discount').value)||0,t=q*p-d;document.getElementById('f-total').value=t>=0?fmt(t)+' ج.م':'---';}

function saveRecord(){
  const day=document.getElementById('f-day').value.trim(),date=document.getElementById('f-date').value.trim(),contractor=document.getElementById('f-contractor').value.trim(),spec=document.getElementById('f-spec').value.trim(),qty=parseFloat(document.getElementById('f-qty').value)||0,price=parseFloat(document.getElementById('f-price').value)||0,discount=parseFloat(document.getElementById('f-discount').value)||0,total=qty*price-discount,place=document.getElementById('f-place').value.trim(),notes=document.getElementById('f-notes').value.trim();
  const qtyType = (document.getElementById('f-qty-type') ? document.getElementById('f-qty-type').value : 'يومية');
  const deductOn   = getDeductOn(); // array of selected contractor names
  const deductNote = (document.getElementById('f-deduct-note') ? document.getElementById('f-deduct-note').value.trim() : '');
  if(!day){showToast('⚠ اختر اليوم',true);return;}if(!contractor){showToast('⚠ اختر المقاول',true);return;}if(!place){showToast('⚠ اختر مكان الأعمال',true);return;}if(!qty||!price){showToast('⚠ أدخل العدد والسعر',true);return;}
  if(editingId!==null){const idx=records.findIndex(r=>r.id===editingId);if(idx!==-1)records[idx]={...records[idx],day,date,contractor,spec,qty,qtyType,price,discount,total,place,notes,deductOn,deductNote};editingId=null;document.getElementById('edit-banner').classList.remove('show');document.getElementById('save-btn').textContent='✅ تسجيل البيانات';showToast('✏️ تم التعديل بنجاح!');}
  else{records.push({id:Date.now(),day,date,contractor,spec,qty,qtyType,price,discount,total,place,notes,deductOn,deductNote});showToast('✅ تم التسجيل بنجاح!');}
  if(!saveAll()) return; // الذاكرة اتملت — سيب النموذج زي ما هو عشان البيانات متضيعش
  renderRecords();renderSummary();clearForm(false);
}
function editRecord(id){const r=records.find(x=>x.id===id);if(!r)return;editingId=id;switchTab('form');document.getElementById('f-date').value=r.date;autoSetDay(r.date);if(!document.getElementById('f-day').value)document.getElementById('f-day').value=r.day;document.getElementById('f-qty').value=r.qty;if(document.getElementById('f-qty-type')) document.getElementById('f-qty-type').value=r.qtyType||'يومية';document.getElementById('f-price').value=r.price;document.getElementById('f-discount').value=r.discount;document.getElementById('f-notes').value=r.notes;document.getElementById('f-place').value=r.place;document.getElementById('f-contractor').value=r.contractor;document.getElementById('f-spec').value=r.spec;calcTotal();
  setDeductChips(r.deductOn||[]);
  if(r.deductNote) document.getElementById('f-deduct-note').value=r.deductNote;
  updatePlaceNoteIcon();
  document.getElementById('edit-banner').classList.add('show');document.getElementById('save-btn').textContent='💾 حفظ التعديل';window.scrollTo({top:0,behavior:'smooth'});}
function cancelEdit(){editingId=null;document.getElementById('edit-banner').classList.remove('show');document.getElementById('save-btn').textContent='✅ تسجيل البيانات';clearForm(false);}
function clearForm(ask=true){if(ask&&!confirm('هل تريد مسح النموذج؟'))return;['f-day','f-spec','f-qty','f-price','f-notes','f-place','f-total'].forEach(id=>document.getElementById(id).value='');document.getElementById('f-discount').value='0';if(document.getElementById('f-qty-type')) document.getElementById('f-qty-type').value='يومية';document.getElementById('f-date').value=todayYMD();autoSetDay(todayYMD());const cs=document.getElementById('f-contractor');if(cs)cs.selectedIndex=0;setDeductChips([]);const ds=document.getElementById('f-deduct-on-select');if(ds)ds.selectedIndex=0;}
function deleteRecord(id){if(!confirm('حذف هذا السجل؟'))return;records=records.filter(r=>r.id!==id);saveAll();renderRecords();renderSummary();showToast('🗑 تم الحذف');}
// done = مستبعَد من شيت الإكسيل المعتمد (اسم الحقل تاريخي؛ معناه الحالي: استبعاد من التصدير)
function toggleDone(id){const idx=records.findIndex(r=>r.id===id);if(idx===-1)return;records[idx].done=!records[idx].done;saveAll();renderRecords();showToast(records[idx].done?'🚫 مش هيتسجل في الإكسيل المعتمد':'↩️ رجع للإكسيل المعتمد');}

function saveIR(){
  const date=document.getElementById('ir-date').value,item=document.getElementById('ir-item').value,place=document.getElementById('ir-place').value,inspector=document.getElementById('ir-inspector').value,status=document.getElementById('ir-status').value,notes=document.getElementById('ir-notes').value.trim();
  if(!item){showToast('⚠ اختر البند',true);return;}if(!place){showToast('⚠ اختر المكان',true);return;}if(!status){showToast('⚠ اختر الحالة',true);return;}
  if(irEditingId!==null){const idx=irRecords.findIndex(r=>r.id===irEditingId);if(idx!==-1)irRecords[idx]={...irRecords[idx],date,item,place,inspector,status,notes};irEditingId=null;document.getElementById('ir-edit-banner').classList.remove('show');document.getElementById('ir-save-btn').textContent='✅ تسجيل IR';showToast('✏️ تم تعديل IR');}
  else{irRecords.push({id:Date.now(),date,item,place,inspector,status,notes});showToast('✅ تم تسجيل IR بنجاح!');}
  saveAll();renderIR();renderSummary();clearIRForm();
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
// نفس الفلاتر + نفس الترتيب اللي على الشاشة — بتستخدمها renderRecords و exportExcel و exportPDF
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
      </div>
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
const ALL_MODULES=['records','submissions','ir','site_daily','site_exec','todo','summary','inventory','approvals'];
const MODULE_LABELS={records:'السراكي (تسجيل + قائمة)', submissions:'التسليمات (إرسال الكشوف للاعتماد)', ir:'طلبات الفحص (IR)', site_daily:'التقرير اليومي', site_exec:'الموقف التنفيذي', todo:'المهام', summary:'الملخص', inventory:'المخازن (مخزون + طلبات صرف وشراء)', approvals:'اعتمادات المديرين (مراجعة واعتماد الكشوف)'};
// أي شاشة (tab) تابعة لأنهي وحدة — الشاشات غير المذكورة (home/settings/admin) دايمًا متاحة
const TAB_MODULE={form:'records', records:'records', submissions:'submissions', ir:'ir', site:['site_daily','site_exec'], todo:'todo', summary:'summary', inventory:'inventory', approvals:'approvals'};
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
  // الاعتمادات — زرار Google Form لكل موقع (الاسم بيتحدث تلقائيًا من أسماء المواقع)
  {key:'gform_site1',       label:'زرار Google Form — الموقع الأول', group:'الاعتمادات'},
  {key:'gform_site2',       label:'زرار Google Form — الموقع الثاني', group:'الاعتمادات'},
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
  const stabs=document.querySelectorAll('.stab[data-stab]');
  stabs.forEach(b=>{ const k=b.dataset.stab; b.style.display = ((k==='daily'&&dailyOn)||(k==='exec'&&execOn)) ? '' : 'none'; });
  // لو الشاشة الحالية اتقفلت — ارجع للرئيسية
  const cur=document.querySelector('.panel.active');
  if(cur){ const t=cur.id.replace('tab-',''); if(!tabEnabled(t)) switchTab('home'); }
}

// عناوين الشاشات (تظهر في الهيدر) — الترتيب نفسه في القائمة الجانبية
const TAB_TITLES = { home:'الرئيسية', form:'تسجيل سركي', records:'السراكي', submissions:'التسليمات', ir:'طلبات الفحص (IR)', site:'الموقف التنفيذي', todo:'المهام', summary:'الملخص', inventory:'المخازن', approvals:'اعتمادات المديرين', settings:'الإعدادات', admin:'إدارة الحسابات' };
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
  if(name==='home')renderHome();
  if(name==='submissions'&&typeof renderMySubmissions==='function')renderMySubmissions();
  if(name==='inventory')renderInventory();
  if(name==='approvals')renderApprovals();
  if(name==='admin'){renderAdmin(); if(typeof renderAdminSubmissions==='function') renderAdminSubmissions();}
  if(name==='settings')renderSettings();
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
// أسماء المواقع/المشاريع — بتتقري من السيرفر (يعدّلها الأدمن)، ودي القيم الافتراضية لحد ما تحمّل
let _siteNames={ '1':'كومباوند جريني', '2':'أزاليا' };
function siteName(s){ return _siteNames[String(s||1)]||('الموقع '+s); }
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
  const b1=document.getElementById('gform-btn-1'), b2=document.getElementById('gform-btn-2');
  if(!b1||!b2) return;
  const admin=isAdmin();
  b1.style.display=(admin||featureEnabled('gform_site1'))?'':'none';
  b2.style.display=(admin||featureEnabled('gform_site2'))?'':'none';
  if(admin){ b1.textContent='📤 Google Form — '+siteName(1); b2.textContent='📤 Google Form — '+siteName(2); }
}
applyFormButtons(); // عند فتح التطبيق (حتى أوفلاين) — من آخر موقع متخزن للمستخدم
async function loadSiteNames(){
  try{
    const r=await api('GET','/api/admin/config');
    _siteNames={ '1':r.data.site1Name||_siteNames['1'], '2':r.data.site2Name||_siteNames['2'] };
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
    applySiteNames();
    showToast('✅ اتحفظت الأسماء');
    renderAdmin();
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function renderAdmin(){
  if(!isAdmin()) { switchTab('home'); return; }
  await loadSiteNames(); // الأول — عشان أسماء المواقع تظهر صح في labels الفيتشرز والدروب داون
  loadAprLevelsAdmin();
  adminModuleCheckboxes('admin-create-modules', ['records','submissions','todo','summary'], DEFAULT_FEATURES);
  const list=document.getElementById('admin-users-list');
  try{
    _adminUsers=(await api('GET','/api/admin/users')).data;
    list.innerHTML = _adminUsers.map(u=>`
      <div class="setting-item">
        <div style="flex:1;min-width:0">
          <div class="setting-name" style="direction:ltr;text-align:right">${esc(u.email)} ${presenceDot(u.lastSeenAt)}</div>
          <div class="setting-sub">${esc(u.title||(u.role==='ADMIN'?'مدير النظام':'مستخدم'))}${u.role==='ADMIN'&&u.title?' · مدير نظام':''}${u.project?' · '+(u.project==='تجاري'?'🏪':'🏠')+' '+esc(u.project):''} · 🏗️ ${esc(siteName(u.site))} · ${presenceText(u.lastSeenAt)}</div>
        </div>
        <button class="btn-sm-edit" onclick="adminOpenUser('${u.id}')">${u.email===getCurrentUserEmail()?'حسابي':'إدارة'}</button>
      </div>`).join('') || '<div class="home-empty">لا يوجد حسابات</div>';
  }catch(e){ list.innerHTML='<div class="home-empty">⚠ تعذر تحميل الحسابات — تأكد من الاتصال</div>'; }
}
async function adminOpenUser(id){
  _adminSelected=_adminUsers.find(u=>String(u.id)===String(id)); if(!_adminSelected) return;
  document.getElementById('admin-user-title').textContent='⚙️ '+_adminSelected.email;
  document.getElementById('admin-user-card').style.display='block';
  document.getElementById('admin-user-jobtitle').value=_adminSelected.title||'';
  document.getElementById('admin-user-role').value=_adminSelected.role||'ENGINEER';
  document.getElementById('admin-user-project').value=_adminSelected.project||'سكني';
  document.getElementById('admin-user-site').value=String(_adminSelected.site||1);
  adminFillAprLevels(_adminSelected.approvalLevel||'');
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
      </div>
      <div class="setting-actions">
        <button class="btn-sm-edit" onclick="adminEditPlaceNote('${p.id}')">${p.note?'✏️ الملاحظة':'❕ ملاحظة'}</button>
        <button class="btn-sm-del" onclick="adminRemovePlace('${p.id}')">حذف</button>
      </div>
    </div>`).join('') : '<div class="home-empty">لا يوجد أماكن — أضف من الخانة بالأسفل</div>';
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
  try{
    await api('POST',`/api/admin/users/${_adminSelected.id}/places`,{name, note});
    inp.value=''; if(noteInp) noteInp.value='';
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
    await api('POST',`/api/admin/users/${_adminSelected.id}/places`,{name:p, note:placeNotes[p]||''});
    sel.value=''; adminRenderPlaces((await api('GET',`/api/admin/users/${_adminSelected.id}/places`)).data); showToast('✅ تم إضافة '+p+' لحسابه');
  }catch(e){ showToast('⚠ '+(e.code==='CONFLICT'?p+' موجود عنده بالفعل':e.message), true); }
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
// مستويات الاعتماد — تُحمّل مرة في renderAdmin وتُملأ في دروب داون الحساب
let _aprLevelsAdmin=[];
async function loadAprLevelsAdmin(){
  try{ _aprLevelsAdmin=(await api('GET','/api/admin/approval-levels')).data; }catch(e){ _aprLevelsAdmin=[]; }
  const i1=document.getElementById('aprlevels-input'); if(i1&&document.activeElement!==i1) i1.value=_aprLevelsAdmin.join(' | ');
}
function adminFillAprLevels(current){
  const sel=document.getElementById('admin-user-aprlevel'); if(!sel) return;
  sel.innerHTML='<option value="">مش معتمد</option>'+_aprLevelsAdmin.map(l=>`<option value="${esc(l)}">${esc(l)}</option>`).join('');
  sel.value=current||'';
}
async function adminSaveAprLevel(){
  if(!_adminSelected) return;
  const approvalLevel=document.getElementById('admin-user-aprlevel').value||null;
  try{
    const r=await api('PATCH',`/api/admin/users/${_adminSelected.id}`,{approvalLevel});
    _adminSelected.approvalLevel=r.data.approvalLevel;
    showToast(approvalLevel?('✅ بقى معتمد في مستوى '+approvalLevel):'✅ اتشال من المعتمدين');
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function adminSaveAprLevelNames(){
  const raw=document.getElementById('aprlevels-input').value.split('|').map(s=>s.trim()).filter(Boolean);
  if(!raw.length){ showToast('⚠ اكتب مستوى واحد على الأقل', true); return; }
  try{
    const r=await api('PUT','/api/admin/approval-levels',{levels:raw});
    _aprLevelsAdmin=r.data;
    if(_adminSelected) adminFillAprLevels(_adminSelected.approvalLevel||'');
    showToast('✅ اتحفظت المستويات بالترتيب: '+r.data.join(' → '));
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
function exportPDF(){
  const {pq,dq,cq}=getRecordFilters();
  const exp=getFilteredRecords(); // نفس الفلتر ونفس الترتيب اللي على الشاشة بالظبط
  if(!exp.length){showToast('⚠ لا يوجد بيانات بالفلتر ده',true);return;}

  const totalAmt = exp.reduce((s,r)=>s+r.total,0);
  const filterLabel = cq||pq||(dq?`تاريخ: ${dq}`:'')||scopeLabel(' ');
  const today = new Date().toLocaleDateString('ar-EG');

  const sigCell = engineerSignature
    ? `<img src="${engineerSignature}" style="height:14px;max-width:40px;display:block;margin:auto;object-fit:contain">`
    : '';

  const rows = exp.map((r,i) => {
    const da=deductList(r);
    return `
    <tr>
      <td style="text-align:center">${i+1}</td>
      <td style="text-align:center">${esc(r.date)}</td>
      <td style="text-align:center">${esc(r.day)}</td>
      <td>${esc(r.contractor)}</td>
      <td>${esc(r.spec)}</td>
      <td style="text-align:center">${esc(r.qty||0)} ${esc(r.qtyType||'')}</td>
      <td style="text-align:left;direction:ltr">${Number(r.price||0).toLocaleString('ar-EG',{minimumFractionDigits:2})}</td>
      <td style="text-align:left;direction:ltr;color:#C62828">${r.discount>0?Number(r.discount).toLocaleString('ar-EG',{minimumFractionDigits:2}):'-'}</td>
      <td style="text-align:left;direction:ltr;font-weight:900;color:#1B5E20">${Number(r.total||0).toLocaleString('ar-EG',{minimumFractionDigits:2})}</td>
      <td>${esc(r.notes)}</td>
      <td>${da.length?`<span style="color:#C62828;font-weight:700">${esc(da.join(' ، '))}</span>${r.deductNote?`<br><small style="color:#888">${esc(r.deductNote)}</small>`:''}`:''}</td>
      <td style="text-align:center;vertical-align:middle">${sigCell}</td>
    </tr>`;}).join('');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>CEA — سجل السراكي</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Cairo',sans-serif; direction:rtl; background:#fff; color:#1A2640; }

  .meta-bar {
    background:#EBF1FB; padding:8px 16px;
    display:flex; gap:20px; align-items:center;
    border-bottom:3px solid #C9A84C; flex-wrap:wrap;
    border-top:3px solid #1F3864;
  }
  .meta-bar .item { font-size:11px; }
  .meta-bar .item span { font-weight:900; color:#1F3864; }
  .meta-bar .total-big { font-size:13px; font-weight:900; color:#1B5E20; margin-right:auto; }

  table {
    width:100%; border-collapse:collapse; font-size:8.5px;
    margin-top:0; table-layout:fixed;
  }
  thead tr { background:#1F3864; color:#fff; }
  thead th {
    padding:5px 4px; font-weight:700; font-size:8.5px;
    border:1px solid #2F5496; text-align:center;
    word-break:break-word;
  }
  tbody tr:nth-child(even) { background:#F5F8FF; }
  tbody tr:nth-child(odd)  { background:#fff; }
  tbody td {
    padding:5px 4px; border:1px solid #D5E1F0;
    vertical-align:middle; line-height:1.3;
    word-break:break-word; overflow-wrap:break-word;
  }
  tfoot tr { background:#EBF1FB; }
  tfoot td { padding:6px 4px; font-weight:900; font-size:9px; border:1px solid #C5D3E8; }

  .pm-sig {
    margin-top:10px; padding:0 8px;
    display:flex; justify-content:flex-start;
  }
  .pm-sig-inner {
    font-size:9px; color:#6B7A99;
    border-top:1px solid #1F3864;
    padding-top:4px; min-width:160px; text-align:center;
  }

  .pdf-footer {
    margin-top:8px; text-align:center;
    font-size:9px; color:#aaa; padding-bottom:8px;
    border-top:3px solid #C9A84C; padding-top:6px;
  }

  @media print {
    @page { size:A4 landscape; margin:3mm; }
    html, body {
      -webkit-print-color-adjust:exact; print-color-adjust:exact;
      overflow:hidden;
    }
    * { page-break-inside:avoid !important; page-break-after:avoid !important; page-break-before:avoid !important; }
    table { font-size:6px !important; }
    thead th { font-size:6px !important; padding:2px 2px !important; line-height:1.2 !important; }
    tbody td  { font-size:6px !important; padding:2px 2px !important; line-height:1.2 !important; max-height:18px !important; overflow:hidden !important; }
    tfoot td  { font-size:6px !important; padding:2px 2px !important; }
    tbody tr  { max-height:18px !important; }
    tbody td img { height:12px !important; max-width:35px !important; }
    .meta-bar { padding:3px 8px !important; }
    .meta-bar .item { font-size:8px !important; }
    .meta-bar .total-big { font-size:10px !important; }
    .pm-sig { margin-top:3px !important; }
    .pm-sig-inner { font-size:7px !important; min-width:100px !important; }
    .pdf-footer { margin-top:2px !important; padding:2px 0 !important; font-size:6px !important; border-top-width:1px !important; }
    .no-print { display:none !important; }
  }

  .print-btn {
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
    background:linear-gradient(135deg,#1F3864,#2F5496);
    color:#fff; border:none; padding:14px 36px;
    border-radius:50px; font-family:'Cairo',sans-serif;
    font-size:15px; font-weight:900; cursor:pointer;
    box-shadow:0 6px 20px rgba(31,56,100,.4); z-index:999;
  }
</style>
</head>
<body>

<div class="meta-bar">
  <div class="item">🔍 الفلتر: <span>${esc(filterLabel)}</span></div>
  <div class="item">📋 عدد السجلات: <span>${exp.length}</span></div>
  <div class="item">📅 <span>${today}</span></div>
  <div class="total-big">💰 الإجمالي: ${Number(totalAmt).toLocaleString('ar-EG',{minimumFractionDigits:2})} ج.م</div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:3%">#</th>
      <th style="width:8%">التاريخ</th>
      <th style="width:6%">اليوم</th>
      <th style="width:11%">إسم المقاول</th>
      <th style="width:8%">التخصص</th>
      <th style="width:5%">مقط/يومية</th>
      <th style="width:7%">السعر</th>
      <th style="width:6%">الخصم</th>
      <th style="width:8%">الإجمالي</th>
      <th style="width:20%">بيان الأعمال</th>
      <th style="width:10%">الخصم على / ملاحظة</th>
      <th style="width:8%">توقيع المهندس المسئول</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr>
      <td colspan="8" style="text-align:left">الإجمالي الكلي</td>
      <td style="text-align:left;direction:ltr;color:#1B5E20">
        ${Number(totalAmt).toLocaleString('ar-EG',{minimumFractionDigits:2})} ج.م
      </td>
      <td colspan="3"></td>
    </tr>
  </tfoot>
</table>

<div class="pm-sig">
  <div class="pm-sig-inner">توقيع مدير التنفيذ</div>
</div>

<div class="pdf-footer">
  Civil Engineer Assistant (CEA) — by Eng / Ahmed Osama — ${today}
</div>

<button class="print-btn no-print" onclick="window.print()">🖨 اطبع / احفظ PDF</button>

</body></html>`;

  const label = (cq||pq||dq||scopeLabel()).replace(/[^a-zA-Z0-9\u0600-\u06FF_-]/g,'_');
  const fileName = `CEA_Saraki_${label}_${todayYMD()}.html`;

  if(window.isCapacitor){
    // Save as HTML file and share via Android share sheet
    const b64 = utf8ToBase64(html);
    window.Capacitor.Plugins.Filesystem.writeFile({
      path: fileName, data: b64, directory: 'CACHE', recursive: true
    })
    .then(()=>window.Capacitor.Plugins.Filesystem.getUri({path:fileName,directory:'CACHE'}))
    .then(u=>window.Capacitor.Plugins.Share.share({
      title: 'سجل السراكي — CEA',
      text: `${exp.length} سجل`,
      url: u.uri,
      dialogTitle: 'افتح أو احفظ الـ PDF'
    }))
    .then(()=>showToast(`🖨 ${exp.length} سجل — اختار "طباعة" أو "حفظ PDF"`))
    .catch(e=>showToast('⚠ خطأ: '+e.message,true));
  } else {
    // Browser: open in new tab
    const win = window.open('','_blank');
    if(win){ win.document.write(html); win.document.close(); }
    else {
      // Fallback: download as HTML file
      const blob = new Blob([html],{type:'text/html;charset=utf-8'});
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href=url; a.download=fileName; a.click();
      URL.revokeObjectURL(url);
    }
    showToast(`🖨 جاهز للطباعة — ${exp.length} سجل`);
  }
}

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

  ws.mergeCells(2,1,2,13);
  ws.getCell(2,1).value = 'كومبوند جريني افينيو  —  سجل سركي معدات وعمالة أسبوعي';
  styleRange(2,1,2,13,{font:{bold:true,size:11,color:{argb:navy},name:'Arial'}, fill:gold});
  ws.getRow(2).height = 20;

  ws.mergeCells(3,11,3,13); ws.getCell(3,13).value = 'إسم العامل :';
  ws.mergeCells(3,8,3,10);  ws.getCell(3,10).value = c ? c.name : contractorName;
  ws.mergeCells(3,5,3,7);   ws.getCell(3,7).value = 'المهنة :';
  ws.mergeCells(3,1,3,4);   ws.getCell(3,4).value = c ? (c.spec||'') : '';
  styleRange(3,1,3,13,{font:{size:10,name:'Arial'}});
  [13,7].forEach(cc=>{ws.getCell(3,cc).font={bold:true,size:10,name:'Arial',color:{argb:navy}};});

  const currentPlace = placeLabel || [...new Set(exp.map(r=>r.place).filter(Boolean))].join(' ، ');
  ws.mergeCells(4,11,4,13); ws.getCell(4,13).value = 'الموقع :';
  ws.mergeCells(4,8,4,10);  ws.getCell(4,10).value = currentPlace;
  ws.mergeCells(4,5,4,7);   ws.getCell(4,7).value = 'المشروع :';
  ws.mergeCells(4,1,4,4);   ws.getCell(4,1).value = 'كومبوند جريني افينيو';
  styleRange(4,1,4,13,{font:{size:10,name:'Arial'}});
  [13,7].forEach(cc=>{ws.getCell(4,cc).font={bold:true,size:10,name:'Arial',color:{argb:navy}};});

  ws.mergeCells(5,9,5,13); ws.getCell(5,13).value = 'نوع المعدة وقيمتها / قيمة اليومية :';
  ws.mergeCells(5,6,5,8);  ws.getCell(5,8).value = c && c.rate ? `${Number(c.rate).toLocaleString('ar-EG')} ج.م / ${c.rateType||'يومية'}` : '';
  ws.getCell(5,4).value = 'من :';
  ws.getCell(5,3).value = wkStart;
  ws.getCell(5,2).value = 'إلى :';
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

  ws.mergeCells(sigCapRow,10,sigCapRow,13); ws.getCell(sigCapRow,13).value = 'توقيع العامل';
  ws.mergeCells(sigCapRow,7,sigCapRow,9);   ws.getCell(sigCapRow,7).value = 'توقيع مدير المشروع';
  ws.mergeCells(sigCapRow,1,sigCapRow,5);   ws.getCell(sigCapRow,5).value = 'توقيع مدير التنفيذ';
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
async function buildApprovedWorkbook(exp, weekBounds, pq){
  try{
    // استبعاد السجلات اللي المهندس علّم عليها "مش هيتسجل في الإكسيل المعتمد" (r.done)
    exp = exp.filter(r=>!r.done);
    if(!exp.length){ showToast('⚠ كل السجلات مستبعَدة من الإكسيل المعتمد',true); return null; }
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

    const contractorNames = [...new Set(exp.map(r=>r.contractor))];
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
    const fileName = `سركي_${label}_${wkStart}_${wkEnd}.xlsx`;
    const total = exp.reduce((a,r)=>a+(Number(r.total)||0),0);
    return {buffer, fileName, sheetsCount, contractorNames, wkStart, wkEnd, total, recordsCount: exp.length, placesLabel, buildLabel: label, workbook};

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
    ? '⚠ إختار مقاول أو مكان من قائمة الفلاتر الذهبي أعلى الصفحة'
    : '⚠ إختار مقاول من فلتر "👷 كل المقاولين" أعلى الصفحة الأول';
}

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
  // أو لو "كل السجلات" مفعّلة ناخد أسبوع أقدم سجل في النتائج
  let weekBounds;
  if(dq) weekBounds = getWeekBoundsForDate(dq);
  else if(!showAll) weekBounds = getWeekBounds(weekOffset);
  else weekBounds = getWeekBoundsForDate(exp[0].date);

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
  // صور التوقيع: الصف اللي فيها صورة
  const imgRows=new Map();
  try{
    (ws.getImages ? ws.getImages() : []).forEach(im=>{
      const r=Math.floor(im.range.tl.nativeRow)+1, c=Math.floor(im.range.tl.nativeCol)+1;
      const media=workbook.getImage ? workbook.getImage(im.imageId) : null;
      if(media && media.base64) imgRows.set(r+':'+c, 'data:image/'+(media.extension||'png')+';base64,'+media.base64);
      else if(media && media.buffer){ imgRows.set(r+':'+c, 'data:image/'+(media.extension||'png')+';base64,'+bytesToBase64(new Uint8Array(media.buffer))); }
    });
  }catch(e){}
  const widths=[]; for(let c=1;c<=colCount;c++){ const col=ws.getColumn(c); widths.push(Math.round((col.width||9)*7.2)); }
  let html='<table class="xl-preview" dir="rtl"><colgroup>'+widths.map(w=>'<col style="width:'+w+'px">').join('')+'</colgroup>';
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
      const img=imgRows.get(r+':'+c); if(img) content='<img src="'+img+'" alt="توقيع" style="height:22px;max-width:70px;object-fit:contain">'+content;
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
function resendSubmission(id){
  _resendTargetId=id;
  switchTab('records');
  showToast('✍️ عدّل السركي، اختار المقاول في الفلتر الذهبي، واضغط "مراجعة وإرسال الكشف" — هيتبعت كنسخة جديدة (rev++)', false);
}
async function submitApprovedForReview(){
  const {nq,pq,dq,cq}=getRecordFilters();
  syncExportChipsFromTopFilter();
  if(!exportContractorChips.length && !exportPlaceChips.length){ showToast(exportSelectionHint(), true); return; }
  if((nq || pq || cq) && !exportContractorChips.length){ showToast(exportSelectionHint(), true); return; }
  await ensureExcelJS();
  let exp=[...records];
  if(dq) exp=exp.filter(r=>r.date===dq);
  else if(!showAll){ const {start,end}=getWeekBounds(weekOffset); const s=toYMD(start), en=toYMD(end); exp=exp.filter(r=>r.date>=s && r.date<=en); }
  if(exportContractorChips.length) exp=exp.filter(r=>exportContractorChips.includes(r.contractor));
  if(exportPlaceChips.length)      exp=exp.filter(r=>exportPlaceChips.includes(r.place));
  if(!exp.length){showToast('⚠ لا يوجد بيانات بالفلتر ده',true);return;}
  exp.sort((a,b)=>a.date.localeCompare(b.date));
  let weekBounds;
  if(dq) weekBounds = getWeekBoundsForDate(dq);
  else if(!showAll) weekBounds = getWeekBounds(weekOffset);
  else weekBounds = getWeekBoundsForDate(exp[0].date);
  const built = await buildApprovedWorkbook(exp, weekBounds, pq);
  if(!built) return;
  const expSent = exp.filter(r=>!r.done); // اللي هيتصدّر فعلاً — المعاينة والعدّ زي الملف بالظبط
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
          <div><strong>المهندس:</strong> ${esc(getCurrentUserEmail()||'')}${title?' — '+esc(title):''}</div>
          <div><strong>المقاول:</strong> ${esc(ctrLabel)}</div>
          ${b.placesLabel?'<div><strong>المكان:</strong> '+esc(b.placesLabel)+'</div>':''}
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
  const {built:b} = _pendingSubmission;
  try{
    const fd=new FormData();
    fd.append('file', new Blob([b.buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), b.fileName);
    fd.append('contractorName', b.contractorNames.length===1 ? b.contractorNames[0] : b.contractorNames.join('، '));
    fd.append('placeName', b.placesLabel||'');
    fd.append('weekStart', b.wkStart); fd.append('weekEnd', b.wkEnd);
    fd.append('total', String(b.total)); fd.append('recordsCount', String(b.recordsCount));
    fd.append('engineerNote', (document.getElementById('submit-note')?.value||'').trim());
    // لو ده إعادة إرسال لكشف مرفوض → يروح على /resend بنسخة جديدة بدل ما يعمل كشف جديد
    const url = _resendTargetId ? (API_URL+'/api/submissions/'+_resendTargetId+'/resend') : (API_URL+'/api/submissions');
    const res=await fetch(url,{method:'POST',headers:{'Authorization':'Bearer '+getAccessToken()},body:fd});
    const j=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.message||('HTTP '+res.status));
    const wasResend=!!_resendTargetId; _resendTargetId=null;
    closeSubmitReview();
    showToast(wasResend?'✅ اتبعت النسخة الجديدة للمراجعة من أول المستوى':'✅ تم إرسال الكشف للاعتماد — تابع حالته من "تسليماتي"');
    if(typeof renderMySubmissions==='function') renderMySubmissions();
  }catch(e){
    showToast('⚠ فشل الإرسال: '+e.message, true);
    if(btn){ btn.disabled=false; btn.textContent='✅ موافق — إرسال للاعتماد'; }
  }
}

// ── تسليماتي (المهندس) ──
// خط سير الاعتماد في جوجل شيت (بيظهر لو التسليم متربط بصف في الشيت)
function sheetTimeline(s){
  if(!s.gsheetRow){
    // الربط شغّال بس التسليم ده لسه ما وصلش (الرفع في الخلفية بياخد لدقيقة) — أو الربط مش مفعّل أصلًا
    return s.googleSyncEnabled ? '<div class="s" style="font-size:11px;color:var(--muted);margin-top:3px">⏳ جاري الإرسال لشيت الاعتماد...</div>' : '';
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
    steps.push((sh.execApproval?('✅ مدير التنفيذ: '+esc(sh.execApproval)):'⏳ بانتظار مدير التنفيذ'));
    if(sh.execApproval) steps.push((sh.pmApproval?('✅ مدير المشروع: '+esc(sh.pmApproval)):'⏳ بانتظار مدير المشروع'));
    if(sh.execNotes) steps.push('📝 ملاحظات التنفيذ: '+esc(sh.execNotes));
    if(sh.pmNotes) steps.push('📝 ملاحظات المشروع: '+esc(sh.pmNotes));
  }
  return '<div class="s" style="font-size:11px;margin-top:4px;padding:6px 8px;background:var(--input);border-radius:8px;line-height:1.8">'
    + '<span style="font-weight:800;color:'+color+'">'+icon+' '+(st?esc(st):'قيد الاعتماد')+'</span><br>'
    + steps.join('<br>') + '</div>';
}
/* ═══════════ اعتمادات المديرين (وحدة approvals — أونلاين فقط) ═══════════
   سلسلة مراجعة داخل التطبيق قبل ما الكشف ينزل جوجل شيت. */
let _aprLevels=[], _aprActiveLevels=[], _aprMyLevel=null, _aprRows=[];
const APR_TIPS={
  APPROVED:['اعتماد','معتمد بدون ملاحظات — الكشف يفتح للمعتمد اللي بعده في السلسلة.'],
  APPROVED_NOTES:['اعتماد بملاحظات','معتمد مع ملاحظة — بيكمل للمعتمد اللي بعده برضو. الملاحظة بتتسجل، مش بترجع للمهندس.'],
  REJECTED:['رفض بملاحظات','الكشف بيرجع للمهندس، يعمل الملاحظات ويعيد إرساله كنسخة جديدة.']
};
async function renderApprovals(){
  const box=document.getElementById('apr-table'); if(!box) return;
  if(!getAccessToken()||!navigator.onLine){ box.innerHTML='<div class="home-empty">اعتمادات المديرين بيانات حية — محتاج اتصال بالنت</div>'; return; }
  try{
    const [lv, q]=await Promise.all([api('GET','/api/approvals/levels'), api('GET','/api/approvals/queue')]);
    _aprLevels=lv.data; _aprRows=q.data; _aprMyLevel=q.myLevel;
    // المستويات النشطة (اللي ليها معتمد فعلًا) — "آخر معتمد" بيتحسب عليها، لأن المستوى من غير معتمد بيتخطى
    _aprActiveLevels=Array.isArray(q.activeLevels)?q.activeLevels:_aprLevels;
    const roleEl=document.getElementById('apr-myrole');
    if(roleEl) roleEl.innerHTML = _aprMyLevel ? ('دورك: <b style="color:var(--gold-text)">'+esc(_aprMyLevel)+'</b>') : (isAdmin()?'أدمن — تقدر تعتمد أي مستوى':'مالكش مستوى اعتماد محدد');
    aprBuildTable();
  }catch(e){ box.innerHTML='<div class="home-empty">⚠ '+esc(e.message||'تعذر التحميل')+'</div>'; }
}
function aprLevelCell(r, level){
  // القرار المسجل على المستوى ده في النسخة الحالية
  const rv=(r.reviews||[]).filter(x=>x.level===level && x.revision===r.revision);
  const last=rv[rv.length-1];
  if(last){
    if(last.decision==='REJECTED') return '<span class="apr-pill apr-rej">❌ مرفوض</span>';
    if(last.decision==='APPROVED_NOTES') return '<span class="apr-pill apr-notes" title="'+esc(last.note||'')+'">📝 بملاحظات</span>';
    return '<span class="apr-pill apr-ok">✅ معتمد</span>';
  }
  if(r.reviewState==='IN_REVIEW' && r.currentLevel===level) return '<span class="apr-pill apr-wait">⏳ '+(r.canAct?'دورك':'منتظر')+'</span>';
  // مستوى لسه ما وصلوش
  const li=_aprLevels.indexOf(level), ci=_aprLevels.indexOf(r.currentLevel);
  if(r.reviewState==='IN_REVIEW' && li>ci) return '<span class="apr-pill apr-lock">🔒 مقفول</span>';
  return '<span class="apr-pill apr-lock">—</span>';
}
function aprStatusCell(r){
  if(r.reviewState==='RETURNED'){
    const rej=(r.reviews||[]).filter(x=>x.decision==='REJECTED').pop();
    return '<span class="apr-pill apr-rej">❌ رجع للمهندس'+(rej?' من '+esc(rej.level):'')+'</span>';
  }
  if(r.reviewState==='SENT') return '<span class="apr-pill apr-ok">✅ اتبعت للتوقيع</span>';
  if(r.canAct) return '<div class="apr-acts">'
    + '<button class="apr-a apr-a-ok" onclick="aprAsk(\''+r.id+'\',\'APPROVED\')">✅ اعتماد <span class="apr-info" onclick="event.stopPropagation();aprTip(\'APPROVED\')">!</span></button>'
    + '<button class="apr-a apr-a-notes" onclick="aprAsk(\''+r.id+'\',\'APPROVED_NOTES\')">📝 بملاحظات <span class="apr-info" onclick="event.stopPropagation();aprTip(\'APPROVED_NOTES\')">!</span></button>'
    + '<button class="apr-a apr-a-rej" onclick="aprAsk(\''+r.id+'\',\'REJECTED\')">❌ رفض <span class="apr-info" onclick="event.stopPropagation();aprTip(\'REJECTED\')">!</span></button>'
    + '</div>';
  return '<span class="apr-pill apr-lock">مع '+esc(r.currentLevel||'—')+'</span>';
}
function aprBuildTable(){
  const box=document.getElementById('apr-table'); if(!box) return;
  const active=_aprRows.filter(r=>r.reviewState==='IN_REVIEW');
  if(!_aprRows.length){ box.innerHTML='<div class="home-empty">لا توجد كشوف في المراجعة</div>'; return; }
  const heads=['التاريخ والوقت','المهندس','الملف',..._aprLevels,'النسخة','الإجراء / الحالة'];
  let html='<table class="apr-table"><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>';
  html+=_aprRows.map(r=>{
    const when=new Date(r.createdAt);
    const mine=r.canAct?' class="mine"':'';
    return '<tr'+mine+'>'
      +'<td class="apr-when">'+when.toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit',year:'numeric'})+'<br>'+when.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})+'</td>'
      +'<td class="apr-eng">'+esc(r.user?.email?.split('@')[0]||'')+'<small>'+esc(r.user?.title||'مهندس')+'</small></td>'
      +'<td><button class="apr-fbtn" onclick="aprReview(\''+r.id+'\')">👁 مراجعة</button><button class="apr-fbtn" onclick="downloadSubmission(\''+r.id+'\',\''+esc(r.file?.fileName||'sheet.xlsx')+'\')">⬇ تحميل</button></td>'
      +_aprLevels.map(l=>'<td>'+aprLevelCell(r,l)+'</td>').join('')
      +'<td><span class="apr-rev">rev '+String(r.revision).padStart(2,'0')+'</span></td>'
      +'<td>'+aprStatusCell(r)+'</td>'
      +'</tr>';
  }).join('');
  html+='</tbody></table>';
  box.innerHTML=html;
}
// مراجعة = معاينة الملف جوه التطبيق (جدول) من غير تحميل — نفس محرك معاينة الكشوف
async function aprReview(id){
  const r=_aprRows.find(x=>String(x.id)===String(id));
  const name=r?.user?.email?.split('@')[0]||'الكشف';
  showToast('⏳ جاري فتح الملف للمراجعة...');
  try{
    await ensureExcelJS();
    const res=await fetch(API_URL+'/api/submissions/'+id+'/file',{headers:{'Authorization':'Bearer '+getAccessToken()}});
    if(!res.ok) throw new Error('تعذر فتح الملف');
    const buf=await res.arrayBuffer();
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws=wb.worksheets[0];
    if(!ws) throw new Error('الملف فاضي');
    aprOpenPreview('👁 مراجعة كشف '+name, wb, r);
  }catch(e){ showToast('⚠ '+(e.message||'تعذر فتح الملف'), true); }
}
// نفس شكل معاينة المهندس (openSubmitReview) بالظبط — كارت معلومات + زوم + الكشف المنسّق + أزرار القرار
function aprOpenPreview(title, wb, r){
  let ov=document.getElementById('apr-preview-ov');
  if(!ov){ ov=document.createElement('div'); ov.id='apr-preview-ov'; ov.className='modal-overlay'; document.body.appendChild(ov); }
  const sheetsHtml=wb.worksheets.map(ws=>'<div class="xl-sheet-title">'+esc(ws.name)+'</div>'+renderSheetHtml(ws, wb)).join('');
  const acts = (r && r.canAct)
    ? '<button class="btn btn-inline" style="background:linear-gradient(135deg,#1B5E20,#2E7D32);color:#fff" onclick="aprClosePreview();aprAsk(\''+r.id+'\',\'APPROVED\')">✅ اعتماد</button>'
      +'<button class="btn btn-gold btn-inline" onclick="aprClosePreview();aprAsk(\''+r.id+'\',\'APPROVED_NOTES\')">📝 بملاحظات</button>'
      +'<button class="btn btn-danger btn-inline" onclick="aprClosePreview();aprAsk(\''+r.id+'\',\'REJECTED\')">❌ رفض</button>'
      +'<button class="btn btn-ghost btn-inline" onclick="aprClosePreview()">إغلاق</button>'
    : '<span class="hint" style="flex:1">مش دورك في الاعتماد على الكشف ده دلوقتي — للاطلاع فقط</span><button class="btn btn-ghost btn-inline" onclick="aprClosePreview()">إغلاق</button>';
  ov.innerHTML=`
    <div class="modal-box wide" role="dialog" aria-modal="true">
      <div class="modal-head">${esc(title)}</div>
      <div class="modal-body">
        <div class="hint-box" style="margin-bottom:10px">
          <div><strong>المهندس:</strong> ${esc(r.user?.email||'')}${r.user?.title?' — '+esc(r.user.title):''}</div>
          <div><strong>المقاول:</strong> ${esc(r.contractorName||'')}</div>
          ${r.placeName?'<div><strong>المكان:</strong> '+esc(r.placeName)+'</div>':''}
          <div><strong>الأسبوع:</strong> من ${esc(r.weekStart)} إلى ${esc(r.weekEnd)}</div>
          <div><strong>عدد السجلات:</strong> ${r.recordsCount} · <strong>الإجمالي:</strong> ${fmt(r.total)} ج.م · <strong>النسخة:</strong> rev ${String(r.revision).padStart(2,'0')}</div>
          <div><strong>الملف:</strong> <span style="direction:ltr;unicode-bidi:embed">${esc(r.file?.fileName||'')}</span> (${wb.worksheets.length} شيت)</div>
        </div>
        <div class="subhead" style="margin-top:0;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <span>📄 الكشف كما بعته المهندس (${wb.worksheets.length} شيت)</span>
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
  _aprZoom=1; aprZoom(0);
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
  // "آخر معتمد" بيتحسب على المستويات النشطة (اللي ليها معتمد) — المستوى الفاضي بيتخطى فمايتحسبش
  const ai=_aprActiveLevels.indexOf(r.currentLevel);
  const isStuck=ai===-1; // المستوى الحالي مش من النشطة (اتعاد تسميته) — الأدمن بس يقدر يحرّكه
  const isLast=!isStuck && ai===_aprActiveLevels.length-1;
  if(decision==='APPROVED'){
    if(isStuck) aprOpenModal('#8A6D1D','⚠ الكشف واقف عند مستوى مش موجود في السلسلة','المستوى "'+(r.currentLevel||'')+'" اتعدّل اسمه أو اتشال. الاعتماد هيحرّك الكشف '+(_aprActiveLevels.length?('لأول مستوى نشط ("'+_aprActiveLevels[0]+'").'):'ويبعته لجوجل شيت لأنه مفيش معتمدين مضبوطين.'),'💾 تحريك الكشف','var(--gold)', false, '#1A2640');
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
  if(okLabel){ ok.style.display=''; ok.textContent=okLabel; ok.style.background=okBg||bar; ok.style.color=okColor||'#fff'; ok.style.border='none'; ok.onclick=aprConfirm; }
  else ok.style.display='none';
  document.getElementById('apr-modal').style.display='flex'; document.body.classList.add('modal-open');
}
function aprCloseModal(){ document.getElementById('apr-modal').style.display='none'; document.body.classList.remove('modal-open'); _aprPending=null; }
async function aprConfirm(){
  if(!_aprPending) return;
  const {id, decision}=_aprPending;
  const note=document.getElementById('apr-note').value.trim();
  if(decision!=='APPROVED' && !note){ showToast('⚠ اكتب الملاحظة', true); return; }
  const ok=document.getElementById('apr-modal-ok'); ok.disabled=true; ok.textContent='⏳ جاري الحفظ...';
  try{
    await api('POST','/api/approvals/'+id+'/decide',{decision, note});
    aprCloseModal();
    showToast(decision==='REJECTED'?'❌ اترفض ورجع للمهندس':(decision==='APPROVED_NOTES'?'📝 اتعتمد بملاحظات':'✅ اتعتمد'));
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
    showToast(status==='APPROVED'?'✅ اتعتمد — اضغط "تم الصرف" لما الصرف يحصل فعليًا':'❌ اترفض');
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
function subRow(s, adminView){
  let st=SUB_STATUS[s.status]||SUB_STATUS.SUBMITTED;
  // حالة جوجل شيت الحية بتغلب "بانتظار المراجعة" المحلية — لو المديرين اعتمدوا (أو رفضوا) في الشيت،
  // الشارة الرئيسية تعكس ده فورًا بدل ما تفضل "مُرسَل" رغم إن الكشف خلص اعتماد
  const shStat=String(s.sheet?.status||'');
  if(s.status!=='REJECTED'){
    if(shStat.includes('معتمد بالكامل'))      st={t:'✅ معتمد بالكامل',c:'var(--ok-fg)',bg:'var(--ok-bg)'};
    else if(shStat.includes('مرفوض'))         st={t:'❌ '+shStat,c:'var(--danger-fg)',bg:'var(--danger-bg)'};
  }
  // ── حالة سلسلة اعتمادات المديرين (بتغلب حالة جوجل القديمة طالما لسه في المراجعة أو مرفوض) ──
  let rejBox='';
  if(s.reviewState==='IN_REVIEW'){ st={t:'⏳ قيد مراجعة المديرين'+(s.currentLevel?' — مع '+s.currentLevel:''),c:'var(--warn-fg)',bg:'var(--warn-bg)'}; }
  else if(s.reviewState==='RETURNED'){
    const rej=(s.reviews||[]).filter(x=>x.decision==='REJECTED').pop();
    st={t:'❌ مرفوض — أعد الإرسال',c:'var(--danger-fg)',bg:'var(--danger-bg)'};
    if(rej) rejBox='<div class="s" style="font-size:11.5px;color:var(--danger-fg);margin-top:2px;font-weight:700">❌ تم الرفض من '+esc(rej.level)+(rej.note?' — السبب: '+esc(rej.note):'')+'</div>';
  }
  else if(s.reviewState==='SENT'){ /* عدّى المديرين — نسيب حالة جوجل (DC) زي ما هي فوق */ }
  const who = adminView ? '<div class="s">👤 '+esc(s.user?.email||'')+(s.user?.title?' — '+esc(s.user.title):'')+'</div>' : '';
  return `<div class="setting-item" style="flex-direction:column;align-items:stretch;gap:6px">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
      <div style="min-width:0;flex:1">
        <div class="setting-name">${esc(s.contractorName)}${s.placeName?' · '+esc(s.placeName):''} <span class="apr-rev">rev ${String(s.revision||0).padStart(2,'0')}</span></div>
        <div class="setting-sub">الأسبوع ${esc(s.weekStart)} → ${esc(s.weekEnd)} · ${s.recordsCount} سجل · ${fmt(s.total)} ج.م</div>
        ${who}
        <div class="s" style="font-size:11px;color:var(--muted)">أُرسل ${esc(new Date(s.createdAt).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}))}${s.engineerNote?' · 📝 '+esc(s.engineerNote):''}</div>
        ${rejBox}
        ${s.reviewNote?'<div class="s" style="font-size:11.5px;color:var(--text);margin-top:2px">💬 رد المراجعة: '+esc(s.reviewNote)+'</div>':''}
        ${s.reviewState==='SENT'?sheetTimeline(s):''}
      </div>
      <span class="pill" style="background:${st.bg};color:${st.c};font-size:10.5px;padding:3px 8px;border-radius:999px;white-space:nowrap;font-weight:800">${st.t}</span>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-inline" onclick="downloadSubmission(${jsArg(String(s.id))},${jsArg(s.file?.fileName||'sheet.xlsx')})">⬇️ الملف</button>
      ${!adminView && s.reviewState==='RETURNED' ? '<button class="btn btn-gold btn-inline" onclick="resendSubmission(\''+s.id+'\')">🔄 عدّل السركي وأعد الإرسال</button>' : ''}
      ${!adminView && s.reviewState==='IN_REVIEW' ? '<button class="btn btn-danger btn-inline" onclick="deleteMySubmission(\''+s.id+'\')" title="بيمسح التسليم من سجلك هنا فقط">🗑 حذف من سجل تسليماتي</button>' : ''}
    </div>
  </div>`;
}
async function renderMySubmissions(){
  const el=document.getElementById('my-submissions'); if(!el) return;
  if(!getAccessToken()||!navigator.onLine){ el.innerHTML='<div class="home-empty">محتاج نت لعرض التسليمات</div>'; return; }
  try{
    const rows=(await api('GET','/api/submissions/mine')).data;
    el.innerHTML = rows.length ? rows.map(s=>subRow(s,false)).join('') : '<div class="home-empty">مفيش تسليمات بعد — ابعت أول كشف من زرار "إرسال للاعتماد"</div>';
  }catch(e){ el.innerHTML='<div class="home-empty">⚠ تعذر التحميل</div>'; }
}
async function downloadSubmission(id, name){
  try{
    const res=await fetch(API_URL+'/api/submissions/'+id+'/file',{headers:{'Authorization':'Bearer '+getAccessToken()}});
    if(!res.ok) throw new Error('تعذر التنزيل');
    const blob=await res.blob(); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
  }catch(e){ showToast('⚠ '+e.message, true); }
}
async function deleteMySubmission(id){
  try{ await api('DELETE','/api/submissions/'+id); showToast('🗑 اتحذف من سجلك — لو كان وصل شيت الاعتماد بيفضل موجود هناك'); renderMySubmissions(); }
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
    el.innerHTML = rows.length ? rows.map(s=>subRow(s,true)).join('') : '<div class="home-empty">لا توجد تسليمات'+(_subFilter?' بالحالة دي':'')+'</div>';
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
  if(todoEditingId !== null){
    const idx = todos.findIndex(t=>t.id===todoEditingId);
    if(idx!==-1) todos[idx] = {...todos[idx], date, notes, place, priority};
    todoEditingId = null;
    document.getElementById('todo-edit-banner').classList.remove('show');
    document.getElementById('todo-save-btn').textContent = '✅ إضافة المهمة';
    showToast('✏️ تم التعديل');
  } else {
    todos.push({id:Date.now(), date, notes, place, priority, done:false});
    showToast('✅ تم إضافة المهمة');
  }
  saveAll(); renderTodo(); clearTodoForm();
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
  if(dailyEditingId!==null){
    const idx=dailyRecords.findIndex(r=>r.id===dailyEditingId);
    if(idx!==-1) dailyRecords[idx]={...dailyRecords[idx],date,day,contractor,spec,work,place,photo};
    dailyEditingId=null;
    document.getElementById('daily-edit-banner').style.display='none';
    document.getElementById('daily-save-btn').textContent='✅ حفظ التقرير اليومي';
    showToast('✏️ تم التعديل');
  } else {
    dailyRecords.push({id:Date.now(),date,day,contractor,spec,work,place,photo});
    showToast('✅ تم حفظ التقرير اليومي');
  }
  saveAll(); clearDailyForm();
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

function saveExecAll(){ localStorage.setItem('cea_exec', JSON.stringify(execRecords)); }

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
  if(execEditingId!==null){
    const idx=execRecords.findIndex(r=>r.id===execEditingId);
    if(idx!==-1) execRecords[idx]={...execRecords[idx],item,place,pct,notes,stages:stagesSnapshot,stageDone:[...stageDone],updated:todayYMD()};
    execEditingId=null;
    document.getElementById('exec-edit-banner').style.display='none';
    document.getElementById('exec-save-btn').textContent='✅ حفظ البند';
    showToast('✏️ تم التعديل');
  } else {
    const existing=execRecords.find(r=>r.item===item&&r.place===place);
    if(existing){ existing.pct=pct; existing.notes=notes; existing.stages=stagesSnapshot; existing.stageDone=[...stageDone]; existing.updated=todayYMD(); }
    else execRecords.push({id:Date.now(),item,place,pct,notes,stages:stagesSnapshot,stageDone:[...stageDone],updated:todayYMD()});
    showToast('✅ تم حفظ البند');
  }
  saveExecAll(); clearExecForm(); renderExec();
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
  execRecords=execRecords.filter(r=>r.id!==id);
  saveExecAll(); renderExec(); showToast('🗑 تم الحذف');
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
function saveSession(data){
  localStorage.setItem('cea_access_token', data.accessToken);
  localStorage.setItem('cea_refresh_token', data.refreshToken);
  if(data.user){
    localStorage.setItem('cea_user_email', data.user.email);
    localStorage.setItem('cea_user_role',  data.user.role || 'ENGINEER');
    if(data.user.title!==undefined) localStorage.setItem('cea_user_title', data.user.title||'');
  }
}
function clearSession(){
  localStorage.removeItem('cea_access_token');
  localStorage.removeItem('cea_refresh_token');
  localStorage.removeItem('cea_user_email');
  localStorage.removeItem('cea_user_role');
}
// كل مفاتيح بيانات التطبيق على الجهاز (بدون مفاتيح الجلسة) — تُمسح عند الخروج أو تبديل الحساب
// عشان بيانات مهندس ما تتدمجش في حساب مهندس تاني على نفس الهاتف
const APP_DATA_KEYS=['saraki_records','saraki_ir','saraki_todos','saraki_contractors','saraki_places','saraki_inspectors','saraki_items',
  'cea_daily','cea_exec','saraki_signature','cea_records_fully_loaded','cea_records_oldest_loaded','cea_place_notes',
  'cea_sync_snapshot','cea_pin_hash','cea_user_title','cea_enabled_modules','cea_enabled_features'];
function wipeLocalAppData(){
  APP_DATA_KEYS.forEach(k=>localStorage.removeItem(k));
  records=[]; irRecords=[]; todos=[]; contractors=[]; places=[]; inspectors=[]; items=[]; placeNotes={};
  dailyRecords=[]; execRecords=[]; engineerSignature=null; _syncSnap={};
  recordsFullyLoaded=true; recordsOldestLoaded=null;
}
function hasUnsyncedLocalData(){
  const loc=a=>a.some(x=>isLocalId(x.id));
  return loc(records)||loc(irRecords)||loc(todos)||loc(execRecords)||loc(dailyRecords);
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
    err.status=res.status; err.code=data&&data.code;
    throw err;
  }
  return data;
}

async function verifySession(token){
  try{
    const res=await fetch(API_URL+'/api/auth/me',{headers:{'Authorization':'Bearer '+token}});
    if(res.ok){
      const d=await res.json();
      if(d.data){ localStorage.setItem('cea_user_role', d.data.role||'ENGINEER'); localStorage.setItem('cea_user_title', d.data.title||''); localStorage.setItem('cea_user_site', String(d.data.site||1)); applyFormButtons(); }
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
  showLoginScreen('⚠ انتهت الجلسة، سجّل الدخول مرة أخرى');
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
async function initAuthGate(){
  const token=getAccessToken();
  const email=getCurrentUserEmail();
  if(token&&email){
    const status=await verifySession(token);
    if(status==='ok'){ onAuthReady(false); return; }
    if(status==='network_error'){ onAuthReady(true); return; }
    const rstatus=await tryRefreshSession();
    if(rstatus==='ok'){ onAuthReady(false); return; }
    if(rstatus==='network_error'){ onAuthReady(true); return; }
    clearSession();
    showLoginScreen('⚠ انتهت الجلسة، سجّل الدخول مرة أخرى');
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
  setTimeout(()=>{const s=document.getElementById('splash');if(s){s.classList.add('hide');setTimeout(()=>s.remove(),700);}},600);
  const today=todayYMD();
  document.getElementById('f-date').value=today; autoSetDay(today);
  document.getElementById('ir-date').value=today;
  const td=document.getElementById('todo-date'); if(td&&!td.value) td.value=today;
  const dd=document.getElementById('daily-date'); if(dd&&!dd.value){ dd.value=today; autoSetDailyDay(today); }
  populateDropdowns();renderRecords();renderIR();renderTodo();renderSummary();initSiteTab();
  renderHome();
  applyModuleVisibility();
  updateLoadOlderUI();
  if(!offline){ initialSync().then(()=>refreshServerOldest()); }
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
    deductNote:r.deductNote||'', done:!!r.done };
}
function contractorBody(c){
  return { name:c.name, spec:c.spec||'—',
    rate:(c.rate!==''&&c.rate!=null)?Number(c.rate):null, rateType:c.rateType||'يومية' };
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
  '/api/todos': r=>({id:Number(r.id), date:ymdOf(r.date), notes:r.notes, place:r.place||'', priority:r.priority, done:!!r.done}),
  '/api/exec-records': r=>({id:Number(r.id), item:r.item, place:r.place, pct:Number(r.pct), notes:r.notes||'', stages:r.stages||[], stageDone:r.stageDone||[]}),
  '/api/daily-records': r=>({id:Number(r.id), date:ymdOf(r.date), day:r.day, contractor:r.contractor||'', spec:r.spec||'', work:r.work||'', place:r.place||'', photoFileId:r.photoFileId?Number(r.photoFileId):null}),
};

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
      } else if(snap[item.id]!==h){
        await api('PUT', base+'/'+item.id, b);
        newSnap[item.id]=h;
      } else {
        newSnap[item.id]=h;
      }
    }catch(e){
      if(e.status===404 && !isLocalId(item.id)){
        // السجل اتمسح من السيرفر (تنظيف/حذف من جهاز تاني) — السيرفر مرجع: نشيله محليًا
        staleIds.add(String(item.id));
      } else {
        errors++; if(!isLocalId(item.id)) newSnap[item.id]=snap[item.id];
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
    }catch(e){ errors++; }
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
  const serverCtr=ctrRes.data.map(c=>({name:c.name, spec:c.spec||'—', rate:c.rate!=null?String(Number(c.rate)):'', rateType:c.rateType||'يومية'}));
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
  // حدّث snapshot الأماكن بنسخة السيرفر — عشان لو المستخدم حذف مكان محليًا بعدين، الحذف يتزامن صح
  // (mirrorPushByName مش بيحذف من السيرفر غير الأسماء المعروفة في الـ snapshot)
  const psnap=snapOf('places');
  const srvPlaceNames=new Set(serverPlaces);
  placesRes.data.forEach(p=>{ psnap[p.name]=syncHash({name:p.name, note:p.note||''}); });
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
  return mirrorPushByName('places', places.map(name=>({name})), '/api/places', p=>({name:p.name, note:placeNotes[p.name]||''}), r=>r.name,
    names=>{ places=places.filter(n=>!names.has(n)); names.forEach(n=>delete placeNotes[n]); savePlaceNotes(); });
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
    if(moduleEnabled('todo'))       errors+=await mirrorPushById('todos', todos, '/api/todos', todoBody);
    if(moduleEnabled('site_exec'))  errors+=await mirrorPushById('exec', execRecords, '/api/exec-records', execBody);
    if(moduleEnabled('site_daily')) errors+=await pushDailyRecords();
    // ⬇ الاتجاه التاني: سحب اللي اتغير من أجهزة تانية — كل كيان لوحده، فشل واحد ما يوقفش الباقي
    let pulled=0;
    const tryPull=async fn=>{ try{ pulled+=await fn(); }catch(e){ /* هيتحاول في الدورة الجاية */ } };
    if(moduleEnabled('records'))   await tryPull(()=>mergePullById('records', records, '/api/records', recordBody, mapApiRecord, {recordsWindow:true}));
    if(moduleEnabled('ir'))        await tryPull(()=>mergePullById('ir', irRecords, '/api/ir-records', irBody, r=>({id:Number(r.id), date:ymdOf(r.date), item:r.item, place:r.place, inspector:r.inspector, status:r.status, notes:r.notes||''})));
    if(moduleEnabled('todo'))      await tryPull(()=>mergePullById('todos', todos, '/api/todos', todoBody, t=>({id:Number(t.id), date:ymdOf(t.date), notes:t.notes, place:t.place||'', priority:t.priority, done:!!t.done})));
    if(moduleEnabled('site_exec')) await tryPull(()=>mergePullById('exec', execRecords, '/api/exec-records', execBody, e=>({id:Number(e.id), item:e.item, place:e.place, pct:Number(e.pct), notes:e.notes||'', stages:e.stages||[], stageDone:e.stageDone||[], updated:e.updated})));
    await pullManagedData();
    saveSyncSnap();
    _suppressAutoSync=true; saveAll(); _suppressAutoSync=false;
    populateDropdowns();
    if(pulled>0){
      renderRecords(); renderIR(); renderTodo(); renderExec(); renderHome();
      if(typeof renderDashboard==='function') renderDashboard();
    }
    refreshServerOldest(); // يحدّث ظهور زرار "تحميل سجلات أقدم" حسب واقع السيرفر
    if(errors>0){
      setSyncStatus('⚠ اتزامن مع '+errors+' خطأ — هيتحاول تاني تلقائيًا', '#C62828');
    } else {
      setSyncStatus('✅ متزامن ('+new Date().toLocaleTimeString('ar-EG')+')', '#2E7D32');
    }
  }catch(e){
    setSyncStatus('⚠ فشلت المزامنة — شغلك محفوظ محليًا وهيتزامن تلقائيًا', '#C62828');
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
  const cutoff=isoDateMonthsAgo(SYNC_WINDOW_MONTHS);

  // السجلات: نافذة آخر شهرين (أو الكل)، مع pagination
  let rows=[], page=1, total=Infinity;
  while(rows.length<total){
    const res=await api('GET','/api/records?'+(fullHistory?'':'date_from='+cutoff+'&')+'limit=500&page='+page+'&sort=date&dir=desc');
    total=res.data.total;
    if(!res.data.rows.length) break;
    rows=rows.concat(res.data.rows);
    page++;
  }
  records=rows.map(mapApiRecord);

  // الموديولات المعطّلة للمستخدم بترجع 403 من السيرفر — ما ينفعش فشل موديول واحد يوقّع الاستعادة كلها.
  // نسحب كل كيان على حدة: المعطّل/الفاشل يرجع null ونسيب نسخته المحلية زي ما هي.
  const getOpt=async (path, moduleKey)=>{
    if(moduleKey && !moduleEnabled(moduleKey)) return null;
    try{ return await api('GET',path); }
    catch(e){ if(e.status===403) return null; throw e; }
  };
  const [ctr, insp, its, irs, tds, exs, dls]=await Promise.all([
    getOpt('/api/contractors'), getOpt('/api/inspectors'), getOpt('/api/items'),
    getOpt('/api/ir-records','ir'), getOpt('/api/todos','todo'), getOpt('/api/exec-records','site_exec'),
    getOpt('/api/daily-records','site_daily')
  ]);
  if(ctr) contractors=ctr.data.map(c=>({name:c.name, spec:c.spec||'—', rate:c.rate!=null?String(Number(c.rate)):'', rateType:c.rateType||'يومية'}));
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
  populateDropdowns(); renderRecords(); renderExec(); renderIR(); renderTodo(); renderDaily&&renderDaily(); renderHome();
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
    done:!!r.done
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
        const probe=await api('GET','/api/records?limit=1');
        serverHasData=probe.data.total>0 || (await api('GET','/api/contractors')).data.length>0;
      }catch(e){ setSyncStatus('⚠ تعذر الاتصال بالسيرفر', '#C62828'); return; }
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
    todos,
    contractors,
    places,
    inspectors,
    items,
    dailyRecords: typeof dailyRecords!=='undefined'?dailyRecords:[],
    execRecords:  typeof execRecords !=='undefined'?execRecords :[]
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
    if(T)  todos        = T.map(x=>withId({...x, done:!!x.done}));
    if(C)  contractors  = C.map(c=>({name:str(c.name), spec:str(c.spec)||'—', rate:str(c.rate), rateType:str(c.rateType)||'يومية'}));
    if(P)  places       = P;
    if(N)  inspectors   = N;
    if(IT) items        = IT.map(it=>({cat:str(it.cat), name:str(it.name), stages:stages(it.stages)}));
    if(D)  dailyRecords = D.map(x=>withId({...x, photo:isDataImg(x.photo)?x.photo:null, photoFileId:x.photoFileId!=null?num(x.photoFileId,null):null}));
    if(E)  execRecords  = E.map(x=>withId({...x, pct:num(x.pct,0), stages:stages(x.stages), stageDone:Array.isArray(x.stageDone)?x.stageDone.map(Boolean):[]}));
    saveAll();
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
  if(!confirm('هل أنت متأكد؟ ستُستبدل كل البيانات الحالية بالنسخة الاحتياطية!')) return;
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
