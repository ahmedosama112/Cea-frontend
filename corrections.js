// Obligations are read from the API; dismissing a notification never clears them.
let correctionState='OPEN', correctionPage=1, correctionRows=[], correctionDraft=null, correctionLoad=0;
let managerCorrectionPage=1;
const CORRECTION_LABELS={OPEN:'مطلوب إجراء',RESENT:'أُعيد الإرسال — تحت المراجعة',RESOLVED:'تمت المعالجة'};
function correctionDate(value){return new Date(value).toLocaleString('ar-EG',{timeZone:'Africa/Cairo',dateStyle:'medium',timeStyle:'short'});}
async function loadCorrectionSummary(){
  const box=document.getElementById('correction-home'); if(!box || !moduleEnabled('submissions')) return;
  if(!getAccessToken()){box.textContent='';return;}
  try{
    const r=await api('GET','/api/submissions/corrections?limit=1');
    box.innerHTML='<button class="btn btn-ghost" onclick="openCorrections()">📋 عندك '+Number(r.summary.submissions)+' كشف مرفوض و'+Number(r.summary.days)+' يوم محتاج تصحيح</button>';
    if(Number(r.summary.submissions)+Number(r.summary.days)>0)rejectedMascot();
  }catch(e){box.textContent='⚠ تعذّر تحميل المطلوب منك — افتح التسليمات لإعادة المحاولة';}
}
function openCorrections(){switchTab('submissions');document.getElementById('correction-card')?.scrollIntoView({behavior:'smooth'});}
// ── شخصية المهندس بالخوذة: سركي مرفوض/أيام محتاجة تصحيح ──
// display-only زي باقي الشخصيات — كله جوّه try/catch وماتلمسش أي بيانات.
// بتظهر مرة واحدة كل تشغيل، من loadCorrectionSummary لما يكون فيه مطلوب فعلًا.
let _rejMascotShown=false,_rejMascotTimer=null;
function rejectedMascotHide(){try{if(_rejMascotTimer){clearTimeout(_rejMascotTimer);_rejMascotTimer=null;}const el=document.getElementById('rej-mascot');if(el)el.remove();}catch(e){}}
function rejectedMascotCSS(){
  if(document.getElementById('rej-mascot-css'))return;
  const st=document.createElement('style');st.id='rej-mascot-css';
  st.textContent='#rej-mascot{position:fixed;z-index:80;left:10px;bottom:80px;direction:ltr;display:flex;align-items:flex-start;gap:6px;animation:rej-pop .35s cubic-bezier(.34,1.4,.64,1)}'
    +'#rej-mascot img{width:74px;height:auto;display:block;cursor:pointer;transform:scaleX(-1);filter:drop-shadow(0 4px 10px rgba(0,0,0,.22))}'
    +'#rej-mascot .rej-bubble{direction:rtl;cursor:pointer;align-self:center;max-width:210px;font-weight:800;font-size:12.5px;line-height:1.5;background:var(--danger-bg);color:var(--red);border:1.5px solid var(--red);border-radius:14px;padding:8px 10px;position:relative}'
    +'#rej-mascot .rej-bubble::after{content:"";position:absolute;top:50%;margin-top:-7px;left:-14px;border:7px solid transparent;border-right-color:var(--red)}'
    +'#rej-mascot .rej-hint{display:block;margin-top:3px;font-weight:600;font-size:11px;opacity:.75}'
    +'@keyframes rej-pop{from{transform:translateY(8px) scale(.9);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}'
    +'@media (prefers-reduced-motion: reduce){#rej-mascot{animation:none}}';
  document.head.appendChild(st);
}
function rejectedMascot(){
  try{
    if(_rejMascotShown||typeof MASCOT_ENG_SRC==='undefined')return;
    _rejMascotShown=true;rejectedMascotCSS();rejectedMascotHide();
    const el=document.createElement('div');el.id='rej-mascot';
    el.innerHTML='<img src="'+MASCOT_ENG_SRC+'" alt="" aria-hidden="true">'
      +'<div class="rej-bubble">🚨 راجع قسم «مطلوب تعديل وإعادة إرسال» — عندك سركي محتاج يتعدل ويتبعت تاني'
      +'<span class="rej-hint">اضغط للذهاب للقسم · المس الصورة للإخفاء</span></div>';
    el.querySelector('img').onclick=rejectedMascotHide;
    el.querySelector('.rej-bubble').onclick=function(){rejectedMascotHide();openCorrections();};
    document.body.appendChild(el);
    _rejMascotTimer=setTimeout(rejectedMascotHide,10000);
  }catch(e){}
}
function correctionTab(state){correctionState=state;correctionPage=1;renderCorrections();if(typeof renderMySubmissions==='function')renderMySubmissions();}
function correctionMove(delta){correctionPage=Math.max(1,correctionPage+delta);renderCorrections();}
async function renderCorrections(){
  const box=document.getElementById('correction-list');if(!box)return;
  const load=++correctionLoad;
  box.innerHTML='<p class="hint">⏳ جاري تحميل طلبات التصحيح...</p>';
  document.querySelectorAll('[data-correction-state]').forEach(b=>b.classList.toggle('correction-active',b.dataset.correctionState===correctionState));
  try{
    const [r,d]=await Promise.all([api('GET','/api/submissions/corrections?state='+correctionState+'&page='+correctionPage),api('GET','/api/submissions/corrections/drafts')]);
    if(load!==correctionLoad)return;
    correctionRows=r.data;
    box.innerHTML=(r.data.length?r.data.map(t=>correctionRowHtml(t,false)).join(''):'<p class="hint">لا توجد طلبات في هذا التبويب.</p>')
      +(r.total>30?'<div class="correction-actions"><button class="btn btn-ghost btn-inline" '+(correctionPage===1?'disabled':'')+' onclick="correctionMove(-1)">السابق</button><span>'+correctionPage+' / '+Math.ceil(r.total/30)+'</span><button class="btn btn-ghost btn-inline" '+(correctionPage*30>=r.total?'disabled':'')+' onclick="correctionMove(1)">التالي</button></div>':'')
      +(r.data.some(t=>t.canCorrect)?'<button class="btn btn-gold" id="correction-create" onclick="createCorrectionDraft(this)">تصحيح الأيام المحددة</button>':'')
      +((d.data||[]).length?'<h4>مسودات محفوظة — لم تُرسل بعد</h4>'+d.data.map(x=>'<div class="correction-actions"><span>كشف #'+esc(x.sourceId)+' · مسودة #'+esc(x.id)+'</span><button class="btn btn-ghost btn-inline" onclick="editCorrectionDraft(\''+x.id+'\')">فتح المسودة</button><button class="btn btn-ghost btn-inline" onclick="deleteCorrectionDraft(\''+x.id+'\',this)">حذف المسودة</button></div>').join(''):'');
  }catch(e){if(load===correctionLoad)box.innerHTML='<p role="alert">⚠ '+esc(e.message)+'</p><button class="btn btn-ghost" onclick="renderCorrections()">إعادة المحاولة</button>';}
}
function correctionRowHtml(t,manager){
  const isWhole=Number(t.row)===0;
  const latest=t.links?.[0];
  return '<article class="correction-item'+(t.stale?' correction-stale':'')+'">'
    +'<div class="correction-actions">'+(!manager&&t.canCorrect?'<input type="checkbox" aria-label="اختيار يوم التصحيح" data-correction-id="'+t.id+'">':'')
    +'<strong>'+(isWhole?'كشف مرفوض':t.state==='OPEN'?'يوم مطلوب تصحيحه':'يوم تصحيح')+' #'+esc(t.sourceId)+' · نسخة '+Number(t.sourceRevision)+'</strong><span>'+esc(CORRECTION_LABELS[t.state]||t.state)+'</span></div>'
    +'<div>'+esc(t.source.contractorName)+' · '+esc(t.projectName||'المشروع غير محدد')+' · '+(t.source.kind==='equipment'?'معدات':'عمالة')+'</div>'
    +(manager?'<div>المهندس: '+esc(t.source.user.displayName||t.source.user.email)+'</div>':'')
    +'<p class="correction-reason">'+esc(t.reason)+'</p>'
    +'<div class="hint">طلبه: '+esc(t.requestedByName||'راجع سجل المراجعات')+' · '+esc(correctionDate(t.requestedAt))+' · بقاله '+Number(t.ageHours)+' ساعة'+(t.stale?' · تجاوز حد المتابعة':'')+'</div>'
    +(!isWhole?'<div class="hint">ورقة '+(Number(t.sheetIndex)+1)+'، صف '+Number(t.row)+' — المرجع مرتبط بنسخة المصدر</div>':'')
    +(t.legacyReview?'<p class="hint">⚠ راجع الإرسال السابق: لا توجد روابط سجلات موثوقة تثبت وجود بديل قديم. تشابه الاسم وحده لا يغلق الطلب.</p>':'')
    +(latest?'<div class="hint">آخر بديل: #'+esc(latest.replacementId)+' · نسخة '+Number(latest.revision)+'</div>':'')
    +(!manager&&isWhole&&t.state==='OPEN'?'<button class="btn btn-gold btn-inline" onclick="resendSubmission(\''+t.sourceId+'\',\''+t.source.kind+'\')">تعديل وإعادة إرسال</button>':'')
    +(!manager&&!isWhole&&t.state==='OPEN'&&!t.canCorrect?'<p class="hint">انتظر اكتمال مراجعة الأصل؛ إذا اترفض بالكامل استخدم تعديل وإعادة إرسال.</p>':'')
    +'</article>';
}
async function createCorrectionDraft(btn){
  const ids=[...document.querySelectorAll('[data-correction-id]:checked')].map(x=>x.dataset.correctionId);
  if(!ids.length){showToast('اختار الأيام المطلوب تصحيحها',true);return;}
  btn.disabled=true;
  try{const r=await api('POST','/api/submissions/corrections/drafts',{taskIds:ids});await editCorrectionDraft(r.data.id);await renderCorrections();}
  catch(e){showToast(e.message,true);}finally{btn.disabled=false;}
}
async function editCorrectionDraft(id){
  try{
    const r=await api('GET','/api/submissions/corrections/drafts/'+id);
    if(r.data.submittedId){showToast('المسودة أُرسلت بالفعل — حدّث المتابعة');renderCorrections();return;}
    correctionDraft=r.data;
    let overlay=document.getElementById('correction-editor');if(!overlay){overlay=document.createElement('div');overlay.id='correction-editor';overlay.className='modal-overlay';document.body.appendChild(overlay);}
    overlay.innerHTML='<div class="modal-box"><div class="modal-head">تصحيح الأيام المحددة — مسودة #'+esc(id)+'</div><div class="modal-body">'
      +'<p class="hint">المشروع والموقع والأيام من الكشف الأصلي. حفظ المسودة لا يعيد إرسال الطلب. راجع الملف قبل تأكيد الإرسال.</p>'
      +r.data.rows.map((row,i)=>'<fieldset class="correction-item" data-correction-edit="'+i+'"><legend>'+esc(row.label)+'</legend>'
        +(row.qty!=null?'<label>العدد<input class="correction-input" data-field="qty" type="number" min="0" step="0.01" value="'+esc(String(row.qty))+'"></label><label>السعر<input class="correction-input" data-field="price" type="number" min="0" step="0.01" value="'+esc(String(row.price))+'"></label>':'')
        +(row.qty!=null&&row.discount!=null?'<p class="hint">الخصم الأصلي المحفوظ: '+esc(String(row.discount))+' ج.م. عند تغيير العدد أو السعر يظل الخصم مبلغًا ثابتًا؛ لا يُسمح بصافي سالب. راجع الصافي في المعاينة.</p>':'')
        +(row.timeFrom!=null?'<label>من<input class="correction-input" data-field="timeFrom" type="time" value="'+esc(row.timeFrom)+'"></label><label>إلى<input class="correction-input" data-field="timeTo" type="time" value="'+esc(row.timeTo)+'"></label>':'')
        +(row.qty==null&&row.timeFrom==null?'<p class="hint">اليوم يجمع سجلات متعددة أو قيمًا غير قابلة للتحرير؛ تعديل البيان متاح هنا، والتفاصيل المالية تحتاج مراجعة المسؤول.</p>':'')
        +'<label>البيان / الملاحظات<textarea class="correction-input" data-field="notes" maxlength="500">'+esc(row.notes||'')+'</textarea></label></fieldset>').join('')
      +'<p id="correction-editor-status" role="status"></p></div><div class="modal-actions correction-actions">'
      +'<button class="btn btn-ghost btn-inline" onclick="closeCorrectionEditor()">إغلاق</button>'
      +'<button class="btn btn-ghost btn-inline" onclick="saveCorrectionDraft(this,false)">حفظ المسودة</button>'
      +'<button class="btn btn-ghost btn-inline" onclick="previewCorrectionDraft(this)">حفظ ومعاينة الملف</button>'
      +'<button class="btn btn-gold btn-inline" onclick="saveCorrectionDraft(this,true)">تأكيد وإرسال للاعتماد</button></div></div>';
    overlay.style.display='flex';document.body.classList.add('modal-open');
  }catch(e){showToast(e.message,true);}
}
function closeCorrectionEditor(){document.getElementById('correction-editor').style.display='none';document.body.classList.remove('modal-open');correctionDraft=null;}
async function saveCorrectionDraft(btn,send){
  if(!correctionDraft)return false;
  const buttons=[...document.querySelectorAll('#correction-editor button')];buttons.forEach(b=>b.disabled=true);
  const status=document.getElementById('correction-editor-status');status.textContent=send?'جاري الإرسال...':'جاري الحفظ...';
  try{
    const edits=[...document.querySelectorAll('[data-correction-edit]')].map(el=>{
      const row=correctionDraft.rows[Number(el.dataset.correctionEdit)];const edit={taskId:row.taskId};
      el.querySelectorAll('[data-field]').forEach(input=>edit[input.dataset.field]=input.value);return edit;
    });
    const r=await api('PATCH','/api/submissions/corrections/drafts/'+correctionDraft.id,{version:correctionDraft.version,edits});
    correctionDraft.version=r.data.version;
    if(send){
      await api('POST','/api/submissions/corrections/drafts/'+correctionDraft.id+'/submit',{version:correctionDraft.version});
      closeCorrectionEditor();showToast('تم إرسال كشف التصحيح في دورة الاعتماد');await Promise.all([renderCorrections(),loadCorrectionSummary(),renderMySubmissions()]);
    }else{status.textContent='اتحفظت المسودة — الطلب ما زال مطلوبًا حتى الإرسال.';}
    return true;
  }catch(e){
    if(send&&correctionDraft){
      try{const latest=await api('GET','/api/submissions/corrections/drafts/'+correctionDraft.id);
        if(latest.data.submittedId){closeCorrectionEditor();showToast('تم تأكيد الإرسال السابق — الكشف تحت المراجعة');await Promise.all([renderCorrections(),loadCorrectionSummary(),renderMySubmissions()]);return true;}
      }catch(checkError){ /* Keep the original error until submission can be confirmed. */ }
    }
    status.textContent='⚠ '+e.message;return false;
  }finally{buttons.forEach(b=>b.disabled=false);}
}
async function previewCorrectionDraft(btn){
  if(!await saveCorrectionDraft(btn,false)||!correctionDraft)return;
  try{
    const r=await fetch(API_URL+'/api/submissions/corrections/drafts/'+correctionDraft.id+'/file',{headers:{Authorization:'Bearer '+getAccessToken()}});
    if(!r.ok){const j=await r.json();throw new Error(j.message||'تعذّر تحميل المعاينة');}
    await ensureExcelJS();const wb=new ExcelJS.Workbook();await wb.xlsx.load(await r.arrayBuffer());
    let preview=document.getElementById('correction-preview');if(!preview){preview=document.createElement('div');preview.id='correction-preview';document.querySelector('#correction-editor .modal-body').appendChild(preview);}
    preview.innerHTML=wb.worksheets.map(ws=>'<div class="correction-sheet">'+renderSheetHtml(ws,wb)+'</div>').join('');
  }catch(e){showToast(e.message,true);}
}
async function deleteCorrectionDraft(id,btn){
  if(!confirm('حذف المسودة فقط؟ طلب التصحيح هيفضل مطلوبًا.'))return;
  btn.disabled=true;try{await api('DELETE','/api/submissions/corrections/drafts/'+id);await renderCorrections();}catch(e){showToast(e.message,true);}finally{btn.disabled=false;}
}
// التابات الفرعية جوه اعتمادات المديرين — الطابور الافتراضي، والتصحيحات بتتحمّل عند فتح تابها بس
function aprSubTab(name){
  document.getElementById('apr-sub-queue').hidden=name!=='queue';
  document.getElementById('apr-sub-corrections').hidden=name!=='corrections';
  document.getElementById('apr-subtab-queue').classList.toggle('on',name==='queue');
  document.getElementById('apr-subtab-corrections').classList.toggle('on',name==='corrections');
  if(name==='corrections')renderManagerCorrections(true);
}
// البادج الأحمر = عدد طلبات التصحيح المفتوحة — فشل التحميل يخفي البادج بس من غير ما يكسر التاب
async function loadManagerCorrectionBadge(){
  const badge=document.getElementById('apr-corr-badge');if(!badge)return;
  try{const r=await api('GET','/api/approvals/corrections?state=OPEN&limit=1');const n=Number(r.total)||0;badge.hidden=!n;badge.textContent=n>99?'99+':String(n);}
  catch(e){badge.hidden=true;}
}
async function renderManagerCorrections(reset){
  const box=document.getElementById('manager-correction-list');if(!box)return;if(reset)managerCorrectionPage=1;
  const project=document.getElementById('manager-correction-project');
  if(project && !project.options.length)project.innerHTML='<option value="">كل المشاريع</option>'+_projects.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('');
  const params=new URLSearchParams({page:String(managerCorrectionPage),state:document.getElementById('manager-correction-state').value,minAgeHours:document.getElementById('manager-correction-age').value||'0',staleHours:document.getElementById('manager-correction-threshold').value||'48'});
  if(project.value)params.set('projectId',project.value);
  const owner=document.getElementById('manager-correction-owner').value.trim();if(owner)params.set('ownerSearch',owner);
  box.textContent='جاري التحميل...';
  loadManagerCorrectionBadge();
  try{const r=await api('GET','/api/approvals/corrections?'+params);box.innerHTML=(r.data.length?r.data.map(t=>correctionRowHtml(t,true)).join(''):'<p class="hint">لا توجد طلبات مطابقة للفلاتر.</p>')
    +'<div class="correction-actions"><button class="btn btn-ghost btn-inline" '+(managerCorrectionPage===1?'disabled':'')+' onclick="managerCorrectionPage--;renderManagerCorrections()">السابق</button><span>'+managerCorrectionPage+' / '+Math.max(1,Math.ceil(r.total/30))+'</span><button class="btn btn-ghost btn-inline" '+(managerCorrectionPage*30>=r.total?'disabled':'')+' onclick="managerCorrectionPage++;renderManagerCorrections()">التالي</button></div>';}
  catch(e){box.innerHTML='<p role="alert">⚠ '+esc(e.message)+'</p><button class="btn btn-ghost" onclick="renderManagerCorrections()">إعادة المحاولة</button>';}
}
async function classifyLegacyStrike(id,revision,sheetIndex,row){
  const disposition=prompt('تصنيف الشطب القديم: اكتب 1 لمطلوب تصحيح، أو 2 للاستبعاد النهائي');
  if(disposition!=='1'&&disposition!=='2')return;
  const note=prompt('سبب التصنيف (إلزامي)');if(!note?.trim())return;
  try{await api('POST','/api/approvals/'+id+'/rows/classify',{revision,sheetIndex,row,disposition:disposition==='1'?'CORRECTION':'FINAL',note:note.trim()});showToast('تم التصنيف وتسجيل العملية');renderApprovals();}catch(e){showToast(e.message,true);}
}
