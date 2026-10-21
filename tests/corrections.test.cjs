const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','corrections.js'),'utf8');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function harness(api){
 const elements={'correction-list':{},'correction-home':{}};
 const ctx={console,URLSearchParams,Date,esc:escape,moduleEnabled:()=>true,getAccessToken:()=>true,api,
  document:{getElementById:id=>elements[id],querySelectorAll:()=>[]}};
 vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,elements};
}
function task(){return {id:'1',sourceId:'2',sourceRevision:0,row:8,sheetIndex:0,state:'OPEN',reason:'<img src=x onerror=alert(1)>',requestedAt:'2026-10-21T12:00:00Z',ageHours:1,requestedByName:'<script>manager</script>',source:{contractorName:'<b>contractor</b>',kind:'labor',user:{email:'<unsafe@example.test>'}},legacyReview:true,canCorrect:true};}
test('correction cards escape reasons, names and engineer metadata',()=>{
 const {ctx}=harness();const html=ctx.correctionRowHtml(task(),true);
 assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));
});
test('home summary keeps counts of submissions and days separate',async()=>{
 const {ctx,elements}=harness(async()=>({summary:{submissions:2,days:3}}));await ctx.loadCorrectionSummary();
 assert.match(elements['correction-home'].innerHTML,/2 كشف مرفوض و3 يوم محتاج تصحيح/);
});
test('summary loading failure is not presented as zero obligations',async()=>{
 const {ctx,elements}=harness(async()=>{throw Error('offline')});await ctx.loadCorrectionSummary();assert.match(elements['correction-home'].textContent,/تعذّر تحميل/);
});
test('list API failure exposes retry and escapes backend error text',async()=>{
 const {ctx,elements}=harness(async()=>{throw Error('<script>fail</script>')});await ctx.renderCorrections();
 assert.match(elements['correction-list'].innerHTML,/إعادة المحاولة/);assert.match(elements['correction-list'].innerHTML,/&lt;script&gt;/);assert.ok(!elements['correction-list'].innerHTML.includes('لا توجد طلبات'));
});
test('an empty successful list is distinct from a loading failure',async()=>{
 const {ctx,elements}=harness(async p=>p==='GET'?{data:[],total:0}:{data:[]});await ctx.renderCorrections();assert.match(elements['correction-list'].innerHTML,/لا توجد طلبات/);assert.ok(!elements['correction-list'].innerHTML.includes('role="alert"'));
});
test('a superseded list response cannot overwrite the latest result',async()=>{
 let release;const stale=new Promise(resolve=>release=resolve);let calls=0;
 const {ctx,elements}=harness(async(_method,url)=>{
  if(url.endsWith('/drafts'))return {data:[]};calls++;if(calls===1)return stale;return {data:[task()],total:1};
 });
 const first=ctx.renderCorrections();await ctx.renderCorrections();release({data:[],total:0});await first;
 assert.match(elements['correction-list'].innerHTML,/يوم مطلوب تصحيحه/);
});

test('retry after a lost submit response confirms the existing replacement instead of showing a false failure',async()=>{
 const {ctx,elements}=harness(async(method,url)=>{
  if(method==='PATCH')throw Error('draft already submitted');
  if(/\/drafts\/1$/.test(url))return {data:{submittedId:'2'}};
  return {data:[],total:0,summary:{submissions:0,days:0}};
 });
 elements['correction-editor-status']={};elements['correction-editor']={style:{display:'flex'}};
 ctx.document.body={classList:{remove(){}}};ctx.showToast=()=>{};ctx.renderMySubmissions=async()=>{};
 vm.runInContext('correctionDraft={id:"1",version:0,rows:[]}',ctx);
 assert.equal(await ctx.saveCorrectionDraft({},true),true);
 assert.equal(elements['correction-editor'].style.display,'none');
});
