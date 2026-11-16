// renderSheetHtml بتحوّل ملف Excel جاي من المهندس لـ HTML قدّام المعتمد — أي قيمة ستايل جوّه الملف
// لازم ماتقدرش تقفل style="…" وتحقن عناصر/أحداث (ثغرة XSS اتلقت في فحص الأمان — نوفمبر 2026)
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function slice(startMarker,endMarker){ const i=src.indexOf(startMarker); const j=src.indexOf(endMarker,i); assert.ok(i>=0&&j>i,startMarker); return src.slice(i,j); }
const code=[
 slice('function esc(v){','\n// لتمرير نص'),
 slice('function argbToCss(argb)','\n// توقيع مدير المشروع اللي السيرفر'),
].join('\n');
const ctx={bytesToBase64:()=>'',isProjectManager:()=>false};
vm.createContext(ctx); vm.runInContext(code,ctx);

function sheet(cellProps,images=[],media=null){
 const cell=Object.assign({value:'x'},cellProps);
 const ws={rowCount:1,columnCount:1,model:{merges:[]},getColumn:()=>({width:9}),getRow:()=>({height:null,getCell:c=>c===1?cell:{value:null}}),getCell:()=>({value:null}),getImages:()=>images};
 return [ws,{getImage:()=>media}];
}
const EVIL='FF112233;x:y" data-x="1"><img src=x onerror=alert(1)><b "';
const noInjection=html=>{ assert.ok(!/<img[^>]*onerror/i.test(html),html); assert.ok(!html.includes('data-x="1"'),html); };

test('fill color with a quote breakout is dropped, not rendered',()=>{
 const [ws,wb]=sheet({fill:{type:'pattern',fgColor:{argb:EVIL}}});
 noInjection(ctx.renderSheetHtml(ws,wb));
});
test('font color with a quote breakout is dropped, not rendered',()=>{
 const [ws,wb]=sheet({font:{color:{argb:'FF000000" onfocus="alert(3)" tabindex="1'}}});
 const html=ctx.renderSheetHtml(ws,wb); noInjection(html); assert.ok(!html.includes('onfocus="'),html);
});
test('alignment values outside the allowlist are ignored',()=>{
 const [ws,wb]=sheet({alignment:{horizontal:'center" onmouseover="alert(2)',vertical:'middle'}});
 const html=ctx.renderSheetHtml(ws,wb); assert.ok(!html.includes('onmouseover="'),html); assert.ok(html.includes('vertical-align:middle'));
});
test('image media extension cannot break the src attribute',()=>{
 const [ws,wb]=sheet({},[{imageId:1,range:{tl:{nativeRow:0,nativeCol:0}}}],{extension:'png" onerror="alert(4)',base64:'AAAA'});
 const html=ctx.renderSheetHtml(ws,wb); assert.ok(!html.includes('onerror="alert(4)'),html); assert.ok(html.includes('data:image/png;base64,AAAA'));
});
test('valid colors still render',()=>{
 const [ws,wb]=sheet({fill:{type:'pattern',fgColor:{argb:'FFFFFF00'}},font:{bold:true,color:{argb:'FFFF0000'}}});
 const html=ctx.renderSheetHtml(ws,wb); assert.ok(html.includes('background:#FFFF00'),html); assert.ok(html.includes('color:#FF0000'),html); assert.ok(html.includes('font-weight:700'));
});
