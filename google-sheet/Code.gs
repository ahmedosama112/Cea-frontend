/**************************************************************
 * CEA — اعتماد سجلات السراكي إلكترونياً (نسخة التصميم الجديد)
 *
 * ✅ نفس الأعمدة ونفس المنطق بالظبط (التحويل، التوقيعات A16/G16، PDF في DC، الإخفاء الأسبوعي)
 * 🖋 (سبتمبر 2026) زرار واحد للـ DC: المراجعة بقت جوه تطبيق CEA، فاعتماد خانة "مدير التنفيذ" (D)
 *    بينزّل التوقيعين ويملّي خانة "مدير المشروع" (F) تلقائيًا ويطلّع الـ PDF — انظر onEditHandler
 * 🎨 جديد: تصميم موحّد بهوية CEA (كحلي/ذهبي) بدل الألوان الصارخة،
 *    ترويسة نظيفة، الحالة كشارة ملوّنة، خيارات الاعتماد بالعربي،
 *    تنسيق تلقائي لكل صف جديد، ودالة applyNewDesign لإعادة تنسيق
 *    الموجود مرة واحدة بدون مسح أي بيانات.
 * 🔌 جاهز للربط بالتطبيق: addSubmissionRow(...) تُستدعى من الـ API
 *    (نفس ما يفعله الفورم) — انظر القسم الأخير.
 *
 * التشغيل أول مرة: اختار applyNewDesign من القائمة فوق واضغط ▶ Run
 **************************************************************/

const CONFIG = {
  SHEET_NAME: 'Saraki site',
  FORM_Q_ENGINEER_NAME: 'إسم المهندس',
  FORM_Q_FILE: 'حمل ملف السركي هنا',
  // ⚠ لو ضفت سؤال "المشروع" في الفورم، خلي نصه مطابق للسطر ده حرف بحرف
  FORM_Q_PROJECT: 'المشروع',
  PROCESSING_FOLDER_ID: '14t459eIi0OVHa2zSbwpD-7FnnQ-uD7Fg',
  DC_FOLDER_ID: '1GrptvPNLk3-6O26m90iRUDPibkEjBGyV',
  // توقيع مدير التنفيذ — مختلف لكل مشروع (سكني/تجاري)؛ مدير المشروع توقيعه واحد
  SIG_EXEC_MANAGER_FILE_ID: '1yj9AXVFeLY_GKM_m-sVI1SjUShWbCfEu',            // 🏠 سكني (اتحدّث 14 سبتمبر 2026)
  SIG_EXEC_MANAGER_COMMERCIAL_FILE_ID: '1vM74f45icYl4ueGAPas9KrBnRO1uT1i5',  // 🏪 تجاري (اتحدّث 14 سبتمبر 2026)
  // مدير المشروع توقيعه واحد للمشروعين (سكني وتجاري) — مفيش نسخة تجاري ليه.
  // كان فيه SIG_PROJECT_MANAGER_COMMERCIAL_FILE_ID هنا؛ اتشال 14 سبتمبر 2026 لأنه
  // مكانش متنادى من أي مكان في الملف وكان بيوهم إن فيه توقيعين.
  SIG_PROJECT_MANAGER_FILE_ID: '1Rf7xhHPA4TylkInJsGKCzk6LD0vDUfuL',                 // (اتحدّث 14 سبتمبر 2026)
  RAW_UPLOADS_FOLDER_ID: '1hFk4iV5icPkUPQvy4mfZz1lRiKR3HNEz',
  DEFAULT_PROJECT: '🏠 سكني', // المشروع الافتراضي لو مفيش اختيار (صفوف قديمة / فورم بدون السؤال)

  // اتجاه الشيت المحوّل (اللي بيتعتمد ويطلع منه الـ PDF):
  // false = السكربت ما يفرضش اتجاه، ويسيب الشيت زي ما طلع من التحويل (زرار RTL في جوجل شيت ما يتشغّلش تلقائيًا)
  // true  = يفرض يمين→شمال زي الأول
  // ⚠ ملاحظة: الـ PDF بيتولّد من نفس الشيت ده، فاتجاهه بيتبع نفس الإعداد
  FORCE_CONVERTED_SHEET_RTL: false,

  // ✅ التحديد التلقائي حسب المهندس: أي اسم في القائمة دي → 🏪 تجاري، وأي حد تاني → 🏠 سكني
  // المطابقة بتتجاهل المسافات الزيادة، وبتقبل الاسم الجزئي (لو كتب "أحمد" والقائمة فيها "أحمد" بس — يتطابق)
  // ⚠ اكتب الأسماء زي ما المهندسين بيكتبوها في الفورم بالظبط
  COMMERCIAL_ENGINEERS: [
    // 'اسم مهندس التجاري الأول',
    // 'اسم مهندس التجاري الثاني',
  ],
};

/* المشروع التلقائي حسب اسم المهندس (تُستخدم لو مفيش اختيار صريح من فورم/تطبيق) */
function projectForEngineer(engineerName) {
  const name = String(engineerName || '').trim().toLowerCase();
  if (!name) return CONFIG.DEFAULT_PROJECT;
  const hit = (CONFIG.COMMERCIAL_ENGINEERS || []).some(n => {
    const nn = String(n || '').trim().toLowerCase();
    return nn && (name === nn || name.includes(nn) || nn.includes(name));
  });
  return hit ? PROJECT.COM : PROJECT.RES;
}

/* المشروع — بيحدد توقيع مدير التنفيذ */
const PROJECT = { RES: '🏠 سكني', COM: '🏪 تجاري' };
const PROJECT_OPTIONS = ['', PROJECT.RES, PROJECT.COM];
function execSignatureIdFor(projectValue) {
  const isCommercial = String(projectValue || '').includes('تجاري');
  const raw = isCommercial ? CONFIG.SIG_EXEC_MANAGER_COMMERCIAL_FILE_ID : CONFIG.SIG_EXEC_MANAGER_FILE_ID;
  // لو توقيع التجاري لسه ما اتحطش، نرجع للسكني بدل ما الاعتماد يفشل
  if (isCommercial && (!raw || raw.indexOf('PUT_') === 0)) {
    Logger.log('⚠ توقيع المشروع التجاري غير مضبوط في CONFIG — استُخدم توقيع السكني');
    return getFileIdFromUrl(CONFIG.SIG_EXEC_MANAGER_FILE_ID);
  }
  return getFileIdFromUrl(raw);
}

const SIGNATURE_SIZE = { width: 90, height: 30 };
const MIN_ROW_HEIGHT = 35;
const ROW_BAND_HEIGHT = 42; // ارتفاع صفوف شيت المتابعة — أعلى شوية عشان لون الاعتماد يبان كشارة

const COLS = {
  ENGINEER_NAME: 1, TIMESTAMP: 2, FILE_URL: 3,
  APPROVE_EXEC: 4, NOTES_EXEC: 5, APPROVE_PM: 6, NOTES_PM: 7,
  STATUS: 8, CONVERTED_SHEET_URL: 9, PDF_URL: 10,
  PROJECT: 11, // 🏠/🏪 — عمود جديد في آخر الجدول، الأعمدة القديمة ما اتحركتش
};
const LAST_COL = 11;
const HEADER_ROWS = 2;

/* ───────── هوية CEA ───────── */
const THEME = {
  navy: '#173058', navyDark: '#0F2240', gold: '#C9A84C', goldSoft: '#F3EAD0',
  ink: '#152238', muted: '#63708A', grid: '#C3CCDA', zebra: '#F5F7FB', white: '#FFFFFF',
  // حدّ خانات الاعتماد/الحالة: أسود رفيع — يبان كفاصل واضح بين الخانات
  borderStrong: '#000000',
  okBg: '#11734B',  okFg: '#FFFFFF',   // معتمد — أخضر غامق + خط أبيض
  warnBg: '#FFEE00', warnFg: '#3D3400', // معتمد بملاحظات — أصفر + خط غامق للتباين
  dangerBg: '#B10202', dangerFg: '#FFFFFF', // مرفوض — أحمر غامق + خط أبيض
  infoBg: '#E8EEF8',  infoFg: '#173058',
};

/* خيارات الاعتماد — بالعربي مع أيقونة (نفس المعاني القديمة بالظبط) */
const APPROVAL = {
  APPROVED: '✅ معتمد',
  NOT_APPROVED: '❌ مرفوض',
  APPROVED_WITH_COMMENTS: '⚠ معتمد بملاحظات',
};
/* توافق مع الصفوف القديمة (اللي فيها القيم الإنجليزية) */
const LEGACY_APPROVAL = { 'APPROVED': APPROVAL.APPROVED, 'NOT APPROVED': APPROVAL.NOT_APPROVED, 'APPROVED WITH COMMENTS': APPROVAL.APPROVED_WITH_COMMENTS };
const DROPDOWN_OPTIONS = ['', APPROVAL.APPROVED, APPROVAL.NOT_APPROVED, APPROVAL.APPROVED_WITH_COMMENTS];
const isOk = v => v === APPROVAL.APPROVED || v === APPROVAL.APPROVED_WITH_COMMENTS || v === 'APPROVED' || v === 'APPROVED WITH COMMENTS' || v === ADMIN_APPROVED;
const isNo = v => v === APPROVAL.NOT_APPROVED || v === 'NOT APPROVED';

/* 🖋 (سبتمبر 2026) المراجعة والاعتماد بقوا جوه تطبيق CEA، والصف بيوصل الشيت بعد اكتمال السلسلة:
   خانة F (كانت "إعتماد مدير المشروع") بتتملي تلقائيًا بالقيمة دي وتتقفل، وG بتحمل ملخص مين اعتمد */
const ADMIN_APPROVED = '✅ معتمد بالكامل';
/* ختم خانة F: لازم نشيل قاعدة التحقق الأول — setValue من السكربت بيرفض القيمة لو القاعدة "مقفولة" (حصل فعليًا: F72)،
   وبعد الكتابة نحط قاعدة بتسمح بالقيمة دي بس (= مقفولة عمليًا من غير ما تكسر الكتابة) */
function sealAdminApproval(cell) {
  cell.clearDataValidations();
  cell.setValue(ADMIN_APPROVED);
  cell.setDataValidation(sealedValidation(ADMIN_APPROVED));
}
/* ارتفاع صف فيه سلسلة اعتماد متعددة الأسطر: wrap + ارتفاع حسب عدد السطور (بحد أدنى ارتفاع الشريط العادي) */
function fitApprovalChainRow(sheet, row) {
  const cell = sheet.getRange(row, COLS.NOTES_PM);
  cell.setWrap(true).setVerticalAlignment('middle');
  const lines = String(cell.getValue() || '').split('\n').length;
  const wanted = Math.max(ROW_BAND_HEIGHT, 16 * lines + 12);
  if (sheet.getRowHeight(row) < wanted) sheet.setRowHeight(row, wanted);
}
/* مرة واحدة (من القائمة ▶ Run): الصفوف القديمة اللي سلسلة الاعتماد فيها مفصولة بـ " | " → سطر لكل اعتماد + ضبط الارتفاع */
function reformatApprovalChainColumn() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return;
  const last = sheet.getLastRow();
  if (last <= HEADER_ROWS) return;
  const rng = sheet.getRange(HEADER_ROWS + 1, COLS.NOTES_PM, last - HEADER_ROWS, 1);
  const vals = rng.getValues();
  let changed = 0;
  const fixed = vals.map(([v]) => {
    const s = String(v || '');
    if (!s.includes(' | ')) return [v];
    changed++;
    return [s.replace(/\s*\|\s*/g, '\n').replace(/^نسخة (\d+)\s*—\s*/, 'نسخة $1\n')];
  });
  if (changed) rng.setValues(fixed);
  for (let r = HEADER_ROWS + 1; r <= last; r++) {
    if (String(sheet.getRange(r, COLS.NOTES_PM).getValue() || '').includes('\n')) fitApprovalChainRow(sheet, r);
  }
  SpreadsheetApp.getUi().alert('✅ تم تنسيق سلسلة الاعتماد: ' + changed + ' صف اتعدل (سطر لكل اعتماد).');
}
function sealedValidation(value) {
  return SpreadsheetApp.newDataValidation().requireValueInList([String(value)], false).setAllowInvalid(false).build();
}

const STATUS = {
  NEW: 'جديد', CONVERTED: 'بانتظار DC',            // كان "قيد الاعتماد" — دلوقتي المتبقي بعد التطبيق هو DC (التوقيع + PDF) بس
  EXEC_APPROVED: 'معتمد مدير التنفيذ', PM_APPROVED: 'معتمد مدير المشروع', // (توافق مع الصفوف القديمة)
  DONE: 'معتمد بالكامل ✅', REJ_EXEC: 'مرفوض من DC', REJ_PM: 'مرفوض من مدير المشروع',
};

const SIG_CELL_EXEC = 'A16';
const SIG_CELL_PM   = 'G16';
const SIG_CELL_TL   = 'J16'; // كان بلوك "توقيع العامل" — بقى توقيع مدير الفريق (بيوصل مختوم من التطبيق)
// ⚠ الخانتين EXEC/PM فوق بترتيب الملفات القديمة (A = تنفيذ، G = مشروع) — للصفوف القديمة بس؛ الملفات الجديدة بتوصل موقّعة

/* =====================================================================
 * 🎨 التصميم — يُطبَّق مرة على الموجود (applyNewDesign) وتلقائيًا على كل صف جديد
 * ===================================================================== */
function applyNewDesign() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) { SpreadsheetApp.getUi().alert('مفيش شيت اسمه "' + CONFIG.SHEET_NAME + '"'); return; }

  sheet.setRightToLeft(true);
  sheet.setHiddenGridlines(true);
  // الأعمدة المجمّدة بتمنع دمج الترويسة — نشيل تجميد الأعمدة مؤقتًا ونرجّعه في الآخر
  const frozenCols = sheet.getFrozenColumns();
  if (frozenCols > 0) sheet.setFrozenColumns(0);
  sheet.setFrozenRows(HEADER_ROWS);

  // لو الشيت أعمدته أقل من الجدول (مثلاً بعد ما مسحنا الزيادة قبل إضافة عمود المشروع) — نضيف الناقص
  if (sheet.getMaxColumns() < LAST_COL) sheet.insertColumnsAfter(sheet.getMaxColumns(), LAST_COL - sheet.getMaxColumns());

  // ── الترويسة (صفين): مجموعات فوق + أسماء الأعمدة تحت ──
  const r1 = sheet.getRange(1, 1, 1, LAST_COL);
  r1.breakApart();
  sheet.getRange(1, 1, 1, 3).merge().setValue('مهندس الموقع');
  sheet.getRange(1, 4, 1, 2).merge().setValue('DC');
  sheet.getRange(1, 6, 1, 2).merge().setValue('اعتماد التطبيق');
  sheet.getRange(1, 8, 1, 3).merge().setValue('الاعتماد والإخراج');
  sheet.getRange(1, 11).setValue('المشروع');
  r1.setBackground(THEME.navyDark).setFontColor(THEME.white).setFontWeight('bold').setFontSize(11)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setFontFamily('Cairo');
  sheet.setRowHeight(1, 32);

  const headers = ['إسم المهندس', 'تاريخ الإرسال', 'ملف السركي', 'اعتماد DC', 'ملاحظات DC', 'الاعتماد الإداري', 'سلسلة الاعتماد', 'الحالة', 'السراكي بعد الإعتماد', 'PDF النهائي', 'سكني / تجاري'];
  const r2 = sheet.getRange(2, 1, 1, LAST_COL);
  r2.setValues([headers]).setBackground(THEME.navy).setFontColor(THEME.gold).setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setFontFamily('Cairo').setWrap(true);
  sheet.setRowHeight(2, 30);
  // خط ذهبي رفيع تحت الترويسة
  r2.setBorder(null, null, true, null, null, null, THEME.gold, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // ── عروض الأعمدة ──
  const widths = [150, 130, 300, 160, 150, 160, 150, 170, 240, 240, 110];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // ── الصفوف الموجودة + هامش 200 صف فاضي بعدها (مش الشيت كله — آلاف الصفوف الفاضية بتبطّئ التنفيذ) ──
  // الصفوف الجديدة بتاخد الستايل تلقائيًا وقت ما تنزل (styleNewRow) على أي حال
  const lastRow = Math.min(sheet.getMaxRows(), Math.max(sheet.getLastRow(), HEADER_ROWS) + 200);
  if (lastRow > HEADER_ROWS) {
    const n = lastRow - HEADER_ROWS;
    const body = sheet.getRange(HEADER_ROWS + 1, 1, n, LAST_COL);
    body.setFontFamily('Cairo').setFontSize(10).setFontColor(THEME.ink).setVerticalAlignment('middle').setWrap(true)
      .setBorder(true, true, true, true, true, true, THEME.grid, SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(HEADER_ROWS + 1, COLS.ENGINEER_NAME, n, 1).setFontWeight('bold').setHorizontalAlignment('center');
    sheet.getRange(HEADER_ROWS + 1, COLS.TIMESTAMP, n, 1).setNumberFormat('dd/MM/yyyy hh:mm').setHorizontalAlignment('center').setFontColor(THEME.ink).setFontWeight('bold');
    // خانات الاعتماد/الحالة: شكل "شارة" أوضح — خط أكبر Bold + حدّ أتقل وأغمق
    // عشان الألوان ما تسيحش على بعض وكل خانة تبان منفصلة
    [COLS.APPROVE_EXEC, COLS.APPROVE_PM, COLS.STATUS].forEach(c =>
      sheet.getRange(HEADER_ROWS + 1, c, n, 1).setHorizontalAlignment('center').setVerticalAlignment('middle')
        .setFontWeight('bold').setFontSize(11)
        .setBorder(true, true, true, true, true, true, THEME.borderStrong, SpreadsheetApp.BorderStyle.SOLID));
    [COLS.FILE_URL, COLS.CONVERTED_SHEET_URL, COLS.PDF_URL].forEach(c => sheet.getRange(HEADER_ROWS + 1, c, n, 1).setHorizontalAlignment('center'));
    sheet.setRowHeights(HEADER_ROWS + 1, n, ROW_BAND_HEIGHT); // صف أعلى شوية عشان اللون يبان كشريط/شارة

    // ── تحويل القيم القديمة + الدروب داون — بالجملة على العمودين (بدل خلية-خلية) ──
    [COLS.APPROVE_EXEC, COLS.APPROVE_PM].forEach(c => {
      const rng = sheet.getRange(HEADER_ROWS + 1, c, n, 1);
      rng.clearDataValidations(); // لازم قبل الكتابة — وإلا القاعدة القديمة ترفض العربي
      const vals = rng.getValues().map(([v]) => [LEGACY_APPROVAL[v] || v]);
      rng.setValues(vals);
    });
    const open = SpreadsheetApp.newDataValidation().requireValueInList(DROPDOWN_OPTIONS, true).setAllowInvalid(false).build();
    const locked = SpreadsheetApp.newDataValidation().requireValueInList([''], true).setAllowInvalid(false).build();
    sheet.getRange(HEADER_ROWS + 1, COLS.APPROVE_EXEC, n, 1).setDataValidation(open);
    // خانة الاعتماد الإداري (F): لو فيها قيمة (اتملت تلقائيًا من التطبيق أو صف قديم خلصان) → مقفولة؛
    // لو فاضية وDC اعتمد (صف قديم كان واقف عند مدير المشروع قبل التحديث) → مفتوحة للتوافق؛ غير كده مقفولة
    const execVals = sheet.getRange(HEADER_ROWS + 1, COLS.APPROVE_EXEC, n, 1).getValues();
    const pmVals = sheet.getRange(HEADER_ROWS + 1, COLS.APPROVE_PM, n, 1).getValues();
    const rules = [];
    const sealedCache = {};
    const sealedFor = v => (sealedCache[v] = sealedCache[v] || sealedValidation(v));
    for (let i = 0; i < n; i++) rules.push([pmVals[i][0] ? sealedFor(pmVals[i][0]) : (isOk(execVals[i][0]) ? open : locked)]);
    sheet.getRange(HEADER_ROWS + 1, COLS.APPROVE_PM, n, 1).setDataValidations(rules);

    // ── عمود المشروع: دروب داون سكني/تجاري + الافتراضي للصفوف القديمة اللي فيها بيانات ──
    const projRange = sheet.getRange(HEADER_ROWS + 1, COLS.PROJECT, n, 1);
    projRange.setHorizontalAlignment('center').setFontWeight('bold');
    projRange.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PROJECT_OPTIONS, true).setAllowInvalid(false).build());
    const nameVals = sheet.getRange(HEADER_ROWS + 1, COLS.ENGINEER_NAME, n, 1).getValues();
    const projVals = projRange.getValues();
    // الصفوف القديمة: تحديد تلقائي حسب اسم المهندس (قائمة COMMERCIAL_ENGINEERS) — والموجود مسبقًا ما يتغيرش
    const filled = projVals.map(([v], i) => [v || (nameVals[i][0] ? projectForEngineer(nameVals[i][0]) : '')]);
    projRange.setValues(filled);
  }

  applyConditionalFormatting(sheet);

  // ── الأعمدة الزيادة بعد الجدول (K وما بعده — بتظهر على الشمال في RTL): نخفيها عشان الشيت يبقى محصور في الجدول ──
  // إخفاء مش مسح — لو فيها بيانات قديمة بتفضل موجودة (Unhide columns يرجّعها)
  const maxCols = sheet.getMaxColumns();
  if (maxCols > LAST_COL) {
    const extra = maxCols - LAST_COL;
    // getLastColumn = آخر عمود فيه بيانات فعلًا: لو ≤ 10 يبقى الزيادة كلها فاضية → نمسحها (أنظف)، وإلا نخفيها بس
    if (sheet.getLastColumn() <= LAST_COL) sheet.deleteColumns(LAST_COL + 1, extra);
    else sheet.hideColumns(LAST_COL + 1, extra);
  }
  // ملاحظة: بدون تجميد أعمدة — دمج مجموعات الترويسة (مثلًا A1:C1) بيتعارض مع أي عمود مجمّد. الصفوف المثبتة كفاية.
  SpreadsheetApp.getUi().alert('✅ تم تطبيق التصميم الجديد على ' + Math.max(0, lastRow - HEADER_ROWS) + ' صف — بدون مسح أي بيانات.');
}

/* دروب داون الاعتماد لصف معين (خانة مدير المشروع تتقفل لحد ما مدير التنفيذ يعتمد) */
function applyRowDropdowns(sheet, row) {
  const open = SpreadsheetApp.newDataValidation().requireValueInList(DROPDOWN_OPTIONS, true).setAllowInvalid(false).build();
  const locked = SpreadsheetApp.newDataValidation().requireValueInList([''], true).setAllowInvalid(false).build();
  sheet.getRange(row, COLS.APPROVE_EXEC).setDataValidation(open);
  const execVal = sheet.getRange(row, COLS.APPROVE_EXEC).getValue();
  const pmCell = sheet.getRange(row, COLS.APPROVE_PM);
  // الاعتماد الإداري (F): فيها قيمة (اتملت من التطبيق) → مقفولة؛ فاضية وDC اعتمد (صف قديم) → مفتوحة؛ غير كده مقفولة
  const pmVal = pmCell.getValue();
  pmCell.setDataValidation(pmVal ? sealedValidation(pmVal) : (isOk(execVal) ? open : locked));
}

/* تنسيق شرطي: الاعتماد + الحالة + تظليل متناوب — قواعد واحدة للشيت كله */
function applyConditionalFormatting(sheet) {
  const maxRows = sheet.getMaxRows();
  const n = maxRows - HEADER_ROWS;
  const approveRanges = [sheet.getRange(HEADER_ROWS + 1, COLS.APPROVE_EXEC, n, 1), sheet.getRange(HEADER_ROWS + 1, COLS.APPROVE_PM, n, 1)];
  const statusRange = [sheet.getRange(HEADER_ROWS + 1, COLS.STATUS, n, 1)];
  const notesExecRange = sheet.getRange(HEADER_ROWS + 1, COLS.NOTES_EXEC, n, 1); // ملاحظات مدير التنفيذ (E)
  const notesPmRange   = sheet.getRange(HEADER_ROWS + 1, COLS.NOTES_PM, n, 1);   // ملاحظات مدير المشروع (G)
  const body = [sheet.getRange(HEADER_ROWS + 1, 1, n, LAST_COL)];
  const mk = (text, bg, fg, ranges) => SpreadsheetApp.newConditionalFormatRule().whenTextContains(text).setBackground(bg).setFontColor(fg).setBold(true).setRanges(ranges).build();
  // خانة الملاحظات: رمادي خافت ثابت (مش بتاخد لون الاعتماد). قاعدة دايمة عشان تكسب على التظليل المتناوب.
  const grayNote = (range) => SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=TRUE').setBackground('#F2F3F5').setFontColor(THEME.ink).setBold(true).setRanges([range]).build();
  const rules = [
    // الاعتماد (عربي + إنجليزي قديم)
    mk('✅', THEME.okBg, THEME.okFg, approveRanges), mk('APPROVED WITH', THEME.warnBg, THEME.warnFg, approveRanges),
    mk('⚠', THEME.warnBg, THEME.warnFg, approveRanges), mk('❌', THEME.dangerBg, THEME.dangerFg, approveRanges),
    mk('NOT APPROVED', THEME.dangerBg, THEME.dangerFg, approveRanges),
    // الحالة
    mk('معتمد بالكامل', THEME.okBg, THEME.okFg, statusRange), mk('مرفوض', THEME.dangerBg, THEME.dangerFg, statusRange),
    mk('قيد الاعتماد', THEME.infoBg, THEME.infoFg, statusRange), mk('بانتظار DC', THEME.infoBg, THEME.infoFg, statusRange),
    mk('معتمد مدير', THEME.warnBg, THEME.warnFg, statusRange),
    mk('⚠', THEME.dangerBg, THEME.dangerFg, statusRange),
    // المشروع
    mk('سكني', THEME.infoBg, THEME.infoFg, [sheet.getRange(HEADER_ROWS + 1, COLS.PROJECT, n, 1)]),
    mk('تجاري', THEME.goldSoft, THEME.warnFg, [sheet.getRange(HEADER_ROWS + 1, COLS.PROJECT, n, 1)]),
    // الملاحظات: رمادي خافت ثابت — لا تاخد لون الاعتماد
    grayNote(notesExecRange),
    grayNote(notesPmRange),
    // تظليل متناوب خفيف للقراءة
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=ISEVEN(ROW())').setBackground(THEME.zebra).setRanges(body).build(),
  ];
  // مهم: قاعدة APPROVED الإنجليزي الصريحة بعد "APPROVED WITH" و"NOT APPROVED" عشان ما تلتقطهمش
  rules.splice(5, 0, mk('APPROVED', THEME.okBg, THEME.okFg, approveRanges));
  sheet.setConditionalFormatRules(rules);
}

/* تنسيق صف جديد واحد (يُستدعى بعد أي إضافة) */
function styleNewRow(sheet, row) {
  const rng = sheet.getRange(row, 1, 1, LAST_COL);
  rng.setFontFamily('Cairo').setFontSize(10).setFontColor(THEME.ink).setVerticalAlignment('middle').setWrap(true)
    .setBorder(true, true, true, true, true, true, THEME.grid, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(row, COLS.ENGINEER_NAME).setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(row, COLS.TIMESTAMP).setNumberFormat('dd/MM/yyyy hh:mm').setHorizontalAlignment('center').setFontColor(THEME.ink).setFontWeight('bold');
  // نفس شكل "الشارة" للصف الجديد: خط أكبر Bold + حدّ أتقل وأغمق
  [COLS.APPROVE_EXEC, COLS.APPROVE_PM, COLS.STATUS].forEach(c =>
    sheet.getRange(row, c).setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setFontWeight('bold').setFontSize(11)
      .setBorder(true, true, true, true, true, true, THEME.borderStrong, SpreadsheetApp.BorderStyle.SOLID));
  [COLS.FILE_URL, COLS.CONVERTED_SHEET_URL, COLS.PDF_URL].forEach(c => sheet.getRange(row, c).setHorizontalAlignment('center'));
  const proj = sheet.getRange(row, COLS.PROJECT);
  proj.setHorizontalAlignment('center').setFontWeight('bold')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PROJECT_OPTIONS, true).setAllowInvalid(false).build());
  if (sheet.getRowHeight(row) < ROW_BAND_HEIGHT) sheet.setRowHeight(row, ROW_BAND_HEIGHT);
  applyRowDropdowns(sheet, row);
}

/* =====================================================================
 * 1) الفورم (لسه شغّال زي ما هو — للطوارئ) + 🔌 الإضافة من التطبيق
 * ===================================================================== */
function onFormSubmitHandler(e) {
  const responses = e.namedValues || {};
  // مطابقة مرنة لأسئلة الفورم: الأول بالنص الحرفي من CONFIG، ولو مش لاقي بندوّر على
  // سؤال عنوانه يحتوي كلمة مفتاحية — كده تغيير صياغة السؤال في الفورم مش بيكسر حاجة
  const findAnswer = (exactKey, keywords) => {
    if (responses[exactKey] && responses[exactKey][0]) return responses[exactKey][0];
    for (const key of Object.keys(responses)) {
      if (keywords.some(w => key.includes(w)) && responses[key][0]) return responses[key][0];
    }
    return '';
  };
  const engineerName = findAnswer(CONFIG.FORM_Q_ENGINEER_NAME, ['مهندس', 'الاسم', 'إسم', 'اسم']);
  const fileUrl = findAnswer(CONFIG.FORM_Q_FILE, ['ملف', 'سركي', 'سراكي', 'حمل', 'رفع']);
  const rawProject = findAnswer(CONFIG.FORM_Q_PROJECT, ['مشروع', 'سكني', 'تجاري', 'نوع']);
  // 🆘 مسار الطوارئ: الفورم = الملف مش موقّع → المسار القديم بالكامل (DC يعتمد من الشيت → توقيعات Drive → PDF)
  processNewSubmission(engineerName, fileUrl, normalizeProject(rawProject), '', false);
}

/* توحيد قيمة المشروع من أي مصدر (فورم/تطبيق) — بيرجع '' لو مفيش اختيار صريح
 * عشان التحديد التلقائي بالاسم (projectForEngineer) ياخد دوره */
function normalizeProject(v) {
  const s = String(v || '');
  if (s.includes('تجاري')) return PROJECT.COM;
  if (s.includes('سكني')) return PROJECT.RES;
  return '';
}

/* 🔌 نقطة الدخول من التطبيق (تُستدعى عبر Web App أو Sheets API بعد رفع الملف لـ Drive)
 * engineerName: اسم المهندس، fileUrl: رابط الإكسيل على Drive، project: 'سكني' أو 'تجاري' */
function addSubmissionRow(engineerName, fileUrl, project, approvalSummary) {
  return processNewSubmission(engineerName, fileUrl, normalizeProject(project), approvalSummary, true);
}

/* 🔎 دوّر على صف موجود بالفعل لنفس الكشف (اسم مهندس + اسم ملف) — يُستخدم قبل أي رفع
   عشان لو ردّ doPost الأول ضاع (تايم آوت من السيرفر) نلاقي الصف اللي اتعمل فعلًا بدل ما نكرره.
   بيمشي من آخر صف لفوق ويوقف بعد أقصى 300 صف — الدالة دي بتشتغل جوه request ومينفعش تمشي على شيت كبير كله */
/* notBeforeMs (اختياري): الصف لازم يكون اتعمل بعد الوقت ده. الباك اند بيبعت وقت إنشاء ملف
   الكشف الحالي — فالصفوف اللي أقدم منه بتخص نسخة سابقة (إعادة إرسال كشف مرفوض بتعمل ملف جديد
   بنفس الاسم)، وربط الكشف بيها كان هيوصّل المهندس لحالة النسخة القديمة. */
function findSubmissionRow(engineerName, fileName, maxAgeMinutes, notBeforeMs) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return null;
  const name = String(engineerName || '').trim();
  const wantedFile = String(fileName || '').trim();
  if (!name || !wantedFile) return null;
  // ⚠ اسم الملف مش فريد: `سركي_<مقاول>_<بداية>_<نهاية>.xlsx` بيتكرر مع إعادة إرسال نفس الأسبوع.
  // maxAgeMinutes بيقصر البحث على آخر كام دقيقة: إعادة المحاولة بعد رد ضايع بتحصل في ثواني،
  // أما إعادة إرسال كشف مرفوض فبعد ساعات. من غير الحد ده النسخة المصححة كانت هتتحسب "مكررة"
  // وترجع رقم الصف القديم، فما توصلش الـDC خالص.
  const ageLimit = maxAgeMinutes ? (Date.now() - maxAgeMinutes * 60 * 1000) : null;
  const floor = Number(notBeforeMs) || null;
  // الأقسى بين الاتنين هو اللي بيحكم
  const minTime = (ageLimit && floor) ? Math.max(ageLimit, floor) : (ageLimit || floor);
  const wantedNoExt = wantedFile.replace(/\.xlsx$/i, '');
  const lastRow = sheet.getLastRow();
  const firstRow = Math.max(HEADER_ROWS + 1, lastRow - 300 + 1);
  for (let row = lastRow; row >= firstRow; row--) {
    const rowName = String(sheet.getRange(row, COLS.ENGINEER_NAME).getValue() || '').trim();
    if (rowName !== name) continue; // مقارنة رخيصة — نعملها الأول قبل ما نلمس Drive
    if (minTime) {
      const ts = sheet.getRange(row, COLS.TIMESTAMP).getValue();
      const t = (ts instanceof Date) ? ts.getTime() : 0;
      if (!t || t < minTime) continue; // صف قديم — مش إعادة محاولة لنفس الدفعة
    }
    try {
      const fileId = fileIdInCell(sheet, row, COLS.FILE_URL);
      if (!fileId) continue;
      const actualName = DriveApp.getFileById(fileId).getName().trim();
      const actualNoExt = actualName.replace(/\.xlsx$/i, '');
      if (actualName === wantedFile || actualNoExt === wantedNoExt || actualName === wantedNoExt || actualNoExt === wantedFile) {
        return row;
      }
    } catch (err) { continue; } // أي خطأ (ملف اتمسح، رابط تالف...) → نتخطى الصف ده ونكمل
  }
  return null;
}

/* المنطق المشترك — نفس القديم بالظبط + تنسيق الصف الجديد
   approvalSummary (اختياري): ملخص سلسلة اعتمادات المديرين من التطبيق → خانة G "سلسلة الاعتمادات"
   signed: true = الملف جاي من التطبيق موقّعًا بالكامل (اعتمادات + توقيعات) → PDF فورًا والصف "معتمد بالكامل"
           false = جاي من الفورم (طوارئ — السيرفر واقع) → المسار القديم: "بانتظار DC"، والـ DC يعتمد من
           خانة D فتنزل توقيعات Drive (تنفيذ + مشروع) ويتولّد الـ PDF (onEditHandler) */
function processNewSubmission(engineerName, fileUrl, project, approvalSummary, signed, kind) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) return null;
    const row = sheet.getLastRow() + 1;

    sheet.getRange(row, COLS.ENGINEER_NAME).setValue(safeText(engineerName));
    sheet.getRange(row, COLS.TIMESTAMP).setValue(new Date());
    // الأولوية: اختيار صريح (من التطبيق/سؤال الفورم) → وإلا تلقائي حسب اسم المهندس (COMMERCIAL_ENGINEERS)
    sheet.getRange(row, COLS.PROJECT).setValue(safeText(project || projectForEngineer(engineerName)));

    const fileId = getFileIdFromUrl(fileUrl);
    if (!fileId) {
      sheet.getRange(row, COLS.FILE_URL).setValue(safeText(fileUrl));
      sheet.getRange(row, COLS.STATUS).setValue('⚠ تعذر قراءة رابط الملف');
      styleNewRow(sheet, row);
      return row;
    }
    try { moveFileToFolder(fileId, CONFIG.RAW_UPLOADS_FOLDER_ID); } catch (err) { Logger.log('نقل الملف الأصلي: ' + err); }
    try { setFileSmartChip(sheet, row, COLS.FILE_URL, fileUrl); } catch (err) { Logger.log('Smart Chip: ' + err); sheet.getRange(row, COLS.FILE_URL).setValue(safeText(fileUrl)); }

    // (25 سبتمبر 2026) كشف مقاولين العمالة اسم شيته المعتمد فيه "مقاول_عمالة" — الـDC بيميّزه من الاسم،
    // لأن عمود الملف الأصلي مخفي عنده. باقي الكشوف "سركي_معتمد_<المهندس>" عادي.
    const kindTag = submissionKindTag(kind, fileId);
    const newName = `سركي_معتمد_${kindTag}${engineerName}_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm')}`;
    const convertedId = convertExcelToGoogleSheet(fileId, newName, CONFIG.PROCESSING_FOLDER_ID);
    prepareApprovalSlots(convertedId);
    fixTextWrapping(convertedId);

    sheet.getRange(row, COLS.STATUS).setValue(STATUS.CONVERTED);
    setFileChip(sheet, row, COLS.CONVERTED_SHEET_URL, `https://docs.google.com/spreadsheets/d/${convertedId}/edit`);
    sheet.getRange(row, COLS.CONVERTED_SHEET_URL).setNote(convertedId);

    sheet.getRange(row, COLS.APPROVE_EXEC).setValue('');
    if (!signed) {
      // 🆘 صف من الفورم (طوارئ): الملف مش موقّع → نسيبه "بانتظار DC" بخانة F فاضية،
      // والـ DC يعتمد من D زي زمان → onEditHandler بينزّل توقيعات Drive ويختم F ويطلّع الـ PDF
      styleNewRow(sheet, row);
      try { applyConditionalFormatting(sheet); } catch (err) { Logger.log('تنسيق شرطي: ' + err); }
      return row;
    }
    // الصف بيوصل بعد اكتمال اعتمادات المديرين في التطبيق → الاعتماد الإداري (F) يتختم تلقائيًا ويتقفل،
    // وسلسلة الاعتماد (G) تتكتب زي ما جت من التطبيق
    // (12 سبتمبر 2026 — قرار صاحب المشروع) الاعتماد الإداري (F) مابقاش بيتختم هنا.
    // كان بيتملي تلقائيًا وقت الوصول فالصف بيبقى "معتمد بالكامل" قبل ما الـ DC يبص عليه أصلًا.
    // دلوقتي بيفضل فاضي، والـ DC يعتمد من D → onEditHandler يختم F ويطلّع الـ PDF.
    if (approvalSummary) sheet.getRange(row, COLS.NOTES_PM).setValue(safeText(approvalSummary));

    // علامة إن الملف وصل موقّعًا من التطبيق: onEditHandler لازم يتخطى تنزيل التوقيعات
    // من Drive للصف ده — التوقيعات متختومة في الإكسيل من السيرفر (signStamp.ts)،
    // وإعادة ختمها هتحط صور مكررة فوق بعضها.
    sheet.getRange(row, COLS.APPROVE_EXEC).setNote('signed');

    styleNewRow(sheet, row);
    try { applyConditionalFormatting(sheet); } catch (err) { Logger.log('تنسيق شرطي: ' + err); }
    // سلسلة الاعتماد بتيجي سطر لكل اعتماد → الصف ياخد ارتفاعه الطبيعي
    if (approvalSummary) fitApprovalChainRow(sheet, row);
    return row;
  } finally { lock.releaseLock(); }
}

/* =====================================================================
 * 2) الاعتماد (onEdit) — للصفوف القديمة + 🆘 صفوف الفورم في الطوارئ (سبتمبر 2026)
 *    الصفوف الجاية من التطبيق بتوصل موقّعة بالكامل وحالتها "معتمد بالكامل ✅" فورًا،
 *    والدالة دي بتخرج من غير ما تعمل حاجة على أي صف حالته DONE.
 *    بتشتغل على: الصفوف اللي كانت واقفة "بانتظار DC" قبل التحديث، وأي صف جاي من الفورم
 *    (السيرفر واقع → المهندس بيرفع الملف من الفورم → DC يعتمد من هنا → توقيعات Drive + PDF).
 *    ⚠ عشان كده الدالة دي ومفاتيح التوقيعات في CONFIG لازم يفضلوا — دي خطة الاسترجاع (RECOVERY-PLAN.md).
 * ===================================================================== */
function onEditHandler(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== CONFIG.SHEET_NAME) return;
  const col = e.range.getColumn(), row = e.range.getRow();
  if (row <= HEADER_ROWS) return;
  if (col !== COLS.APPROVE_EXEC && col !== COLS.APPROVE_PM) return;
  const newValue = e.range.getValue();
  if (!newValue) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // F اتلغت كخطوة خالص — لا اعتماد ولا رفض. أي تعديل فيها بيخرج من غير أثر
    if (col !== COLS.APPROVE_EXEC) return;
    if (isNo(newValue)) {
      sheet.getRange(row, COLS.STATUS).setValue(STATUS.REJ_EXEC);
      return;
    }
    if (!isOk(newValue)) return;

    const convertedId = sheet.getRange(row, COLS.CONVERTED_SHEET_URL).getNote().trim();
    if (!convertedId) {
      Logger.log('لا يوجد شيت محوّل في الصف ' + row);
      sheet.getRange(row, COLS.STATUS).setValue('⚠ لا يوجد ملف محوّل مرتبط بهذا الصف');
      return;
    }

    if (col === COLS.APPROVE_EXEC) {
      // 🖋 زرار واحد للـ DC (سبتمبر 2026): المراجعة والاعتماد بقوا جوه تطبيق CEA (اعتمادات المديرين)،
      // والكشف مابيوصلش الشيت إلا بعد اكتمال السلسلة. فاعتماد الخانة دي = "إخراج": بينزّل التوقيعين
      // (تنفيذ حسب المشروع + مدير المشروع) ويملّي خانة مدير المشروع تلقائيًا بنفس القيمة، والـ PDF بيتولد تحت.
      // صف خلصان بالفعل (إعادة اختيار القيمة) → ما نكررش التوقيعات ولا الـ PDF
      if (sheet.getRange(row, COLS.STATUS).getValue() === STATUS.DONE) return;
      // الصف اللي جه من التطبيق موقّع خلاص (علامته note='signed' على خانة D) — تنزيل توقيعات
      // Drive عليه تاني بيحط صور مكررة. الصفوف القديمة/الفورم بس هي اللي محتاجة الختم هنا.
      // طبقتين: العلامة (بتضيع لو حد مسح الملاحظة) + فحص الملف نفسه (بيصحّح لو العلامة ضاعت)
      const alreadySigned = String(sheet.getRange(row, COLS.APPROVE_EXEC).getNote() || '').trim() === 'signed'
        || hasAnySignature(convertedId);
      if (!alreadySigned) {
        const projectValue = sheet.getRange(row, COLS.PROJECT).getValue();
        insertSignatureOnAllSheets(convertedId, execSignatureIdFor(projectValue), SIG_CELL_EXEC);
        insertSignatureOnAllSheets(convertedId, getFileIdFromUrl(CONFIG.SIG_PROJECT_MANAGER_FILE_ID), SIG_CELL_PM);
      }
      // الاعتماد الإداري اتلغى كخطوة — سلسلة الاعتماد في G هي السجل، وD هو قرار الـDC،
      // وF كانت بتتختم بنفس الضغطة اللي بتتحقق منها فبوابة بتفتح دايمًا
      // بنسيب STATUS.PM_APPROVED هنا لحظيًا وبلوك الـ PDF تحت بيدهسها بـ DONE على طول (D بقى البوابة الوحيدة)
      sheet.getRange(row, COLS.STATUS).setValue(STATUS.PM_APPROVED);
    }

    const execOk = isOk(sheet.getRange(row, COLS.APPROVE_EXEC).getValue());
    if (execOk) {
      const engineerName = sheet.getRange(row, COLS.ENGINEER_NAME).getValue();
      const pdfName = approvedPdfName(engineerName, convertedId);
      const pdfUrl = exportSheetAsPdfToFolder(convertedId, pdfName, CONFIG.DC_FOLDER_ID);
      setFileChip(sheet, row, COLS.PDF_URL, pdfUrl);
      sheet.getRange(row, COLS.STATUS).setValue(STATUS.DONE);
    }
  } finally { lock.releaseLock(); }
}

/* =====================================================================
 * أدوات مساعدة (نفس القديم)
 * ===================================================================== */
function moveFileToFolder(fileId, folderId) {
  const file = DriveApp.getFileById(fileId);
  const target = DriveApp.getFolderById(folderId);
  const parents = file.getParents();
  while (parents.hasNext()) parents.next().removeFile(file);
  target.addFile(file);
}

function setFileSmartChip(sheet, row, col, fileUrl) {
  const ss = sheet.getParent();
  const request = {
    updateCells: {
      rows: [{ values: [{ userEnteredValue: { stringValue: '@' }, chipRuns: [{ startIndex: 0, chip: { richLinkProperties: { uri: fileUrl } } }] }] }],
      range: { sheetId: sheet.getSheetId(), startRowIndex: row - 1, endRowIndex: row, startColumnIndex: col - 1, endColumnIndex: col },
      fields: 'userEnteredValue,chipRuns',
    },
  };
  Sheets.Spreadsheets.batchUpdate({ requests: [request] }, ss.getId());
}
function setFileChip(sheet, row, col, fileUrl) {
  try { setFileSmartChip(sheet, row, col, fileUrl); }
  catch (err) { Logger.log('Smart Chip فشل (عمود ' + col + '): ' + err); sheet.getRange(row, col).setValue(safeText(fileUrl)); }
}

function convertExcelToGoogleSheet(fileId, newName, folderId) {
  const blob = DriveApp.getFileById(fileId).getBlob();
  const converted = Drive.Files.insert({ title: newName, mimeType: MimeType.GOOGLE_SHEETS, parents: [{ id: folderId }] }, blob, { convert: true });
  return converted.id;
}

function prepareApprovalSlots(sheetId) {
  SpreadsheetApp.openById(sheetId).getSheets().forEach(ws => {
    try { ws.getRange(SIG_CELL_EXEC).setValue(''); } catch (e) {}
    try { ws.getRange(SIG_CELL_PM).setValue(''); } catch (e) {}
    try { ws.getRange(SIG_CELL_TL).setValue(''); } catch (e) {}
  });
}

function fixTextWrapping(sheetId) {
  const sheets = SpreadsheetApp.openById(sheetId).getSheets();
  sheets.forEach(ws => {
    // اتجاه الشيت المحوّل: بيتحكم فيه CONFIG.FORCE_CONVERTED_SHEET_RTL.
    // مهم: ملف الإكسيل نفسه جاي بإعداد RTL، والتحويل بيحافظ عليه — فلازم نلغيه صراحةً
    // (setRightToLeft(false))، مش بس منستدعيهوش، وإلا زرار RTL بيفضل شغّال تلقائيًا.
    try { ws.setRightToLeft(!!CONFIG.FORCE_CONVERTED_SHEET_RTL); } catch (e) {}
    const lastRow = ws.getLastRow(), lastCol = ws.getLastColumn();
    if (lastRow <= 0 || lastCol <= 0) return;
    // اتجاه نص الخلايا كمان جاي من الإكسيل (readingOrder) — نرجّعه تلقائي (null)
    // عشان يتحدد حسب محتوى الخلية نفسها بدل ما يبقى مفروض RTL
    if (!CONFIG.FORCE_CONVERTED_SHEET_RTL) {
      try { ws.getRange(1, 1, lastRow, lastCol).setTextDirection(null); } catch (e) {}
    }
    const sigRows = getSignatureRowNumbers(ws);
    const orig = {}; sigRows.forEach(r => { orig[r] = ws.getRowHeight(r); });
    try { ws.getRange(1, 1, lastRow, lastCol).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP); } catch (e) {}
    try { ws.autoResizeRows(1, lastRow); } catch (e) {}
    try { for (let r = 1; r <= lastRow; r++) if (ws.getRowHeight(r) < MIN_ROW_HEIGHT) ws.setRowHeight(r, MIN_ROW_HEIGHT); } catch (e) {}
    try { sigRows.forEach(r => ws.setRowHeight(r, orig[r])); } catch (e) {}
    try { restoreRowHeightsForImages(ws); } catch (e) {}
  });
}
function getSignatureRowNumbers(ws) {
  const rows = new Set();
  [SIG_CELL_EXEC, SIG_CELL_PM, SIG_CELL_TL].forEach(a1 => {
    try {
      let range = ws.getRange(a1); const merged = range.getMergedRanges(); if (merged.length) range = merged[0];
      for (let r = range.getRow(); r < range.getRow() + range.getNumRows(); r++) rows.add(r);
    } catch (e) {}
  });
  return Array.from(rows);
}
function restoreRowHeightsForImages(ws) {
  ws.getImages().forEach(img => {
    try {
      const r = img.getAnchorCell().getRow(); const h = img.getHeight() + 4;
      if (h > ws.getRowHeight(r)) ws.setRowHeight(r, h);
    } catch (e) {}
  });
}

/* فيه توقيع فعلًا في الملف؟ — بنبص على خانات التوقيع الثلاثة في كل ورقات الشيت المحوّل.
   السبب: علامة note='signed' لوحدها مش كفاية — هي على خانة الـDC نفسها وأي مسح/لصق بيضيّعها،
   وساعتها السكربت بيفتكر الصف طوارئ وينزّل توقيعات Drive فوق توقيعات حقيقية. */
function hasAnySignature(sheetId) {
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    // الخانات دي بلوكات مدموجة — نحل الدمج عشان نقارن بالصف/العمود الحقيقي مش النص
    const cellRefs = [SIG_CELL_EXEC, SIG_CELL_PM, SIG_CELL_TL];
    for (const ws of ss.getSheets()) {
      const resolved = cellRefs.map(a1 => {
        let range = ws.getRange(a1); const merged = range.getMergedRanges(); if (merged.length) range = merged[0];
        return { row: range.getRow(), col: range.getColumn() };
      });
      for (const img of ws.getImages()) {
        const anchor = img.getAnchorCell();
        const ar = anchor.getRow(), ac = anchor.getColumn();
        if (resolved.some(t => t.row === ar && t.col === ac)) return true;
      }
    }
    return false;
  } catch (e) {
    // ما قدرناش نتأكد → نفترض إن فيه توقيع (الأمان في عدم التختيم، مش في التختيم):
    // توقيع ناقص بيتصلّح باليد، أما توقيع زيادة فوق ملف مالي فبيبوّظه.
    // بنسجّل السبب: في مسار الطوارئ الفشل ده معناه PDF طلع بلا توقيعات في صمت — لو ظهر في اللوج
    // يبقى الصف ده محتاج ختم يدوي أو إعادة توليد PDF بعده.
    Logger.log('⚠ hasAnySignature فشل للشيت ' + sheetId + ' — اتخطينا الختم احتياطًا: ' + e);
    return true;
  }
}

function insertSignatureOnAllSheets(sheetId, sigFileId, cellA1) {
  // توقيع مش مضبوط (مفتاح فاضي / PUT_...) أو صورته اتمسحت من Drive → نتخطاه ونكمّل (الـ PDF بيتولّد برضو).
  // كده ممكن تشيل صور التوقيعات من CONFIG وقت ما تحب والاعتماد ما يتكسرش — وترجّعها بلصق الـ ID تاني.
  if (!sigFileId || String(sigFileId).indexOf('PUT_') === 0) { Logger.log('⚠ توقيع غير مضبوط — اتخطى: ' + cellA1); return; }
  let blob;
  try { blob = DriveApp.getFileById(sigFileId).getBlob(); }
  catch (e) { Logger.log('⚠ صورة التوقيع مش موجودة في Drive (' + sigFileId + ') — اتخطى: ' + cellA1); return; }
  const ss = SpreadsheetApp.openById(sheetId);
  ss.getSheets().forEach(ws => { try { insertSignatureImageCentered(ws, blob, cellA1); } catch (e) {} });
}
function insertSignatureImageCentered(ws, blob, cellA1) {
  let range = ws.getRange(cellA1); const merged = range.getMergedRanges(); if (merged.length) range = merged[0];
  const c0 = range.getColumn(), r0 = range.getRow();
  let bw = 0; for (let c = c0; c < c0 + range.getNumColumns(); c++) bw += ws.getColumnWidth(c);
  let bh = 0; for (let r = r0; r < r0 + range.getNumRows(); r++) bh += ws.getRowHeight(r);
  const img = ws.insertImage(blob, c0, r0, Math.max(0, Math.round((bw - SIGNATURE_SIZE.width) / 2)), Math.max(0, Math.round((bh - SIGNATURE_SIZE.height) / 2)));
  img.setWidth(SIGNATURE_SIZE.width).setHeight(SIGNATURE_SIZE.height);
  return img;
}

// (25 سبتمبر 2026) اسم الـPDF بياخد "مقاول_عمالة" لو الشيت المحوّل اسمه فيه كده (submissionKindTag وقت التحويل)
// — نفس التمييز بتاع الشيت المعتمد، من غير ما نحتاج نوع الكشف في المسارات اللي مالهاش kind (DC/القائمة).
function approvedPdfName(engineerName, convertedId) {
  let tag = '';
  try { if (DriveApp.getFileById(convertedId).getName().indexOf('مقاول_عمالة') >= 0) tag = 'مقاول_عمالة_'; } catch (err) { tag = ''; }
  return `سركي_معتمد_${tag}${engineerName}_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')}.pdf`;
}
function exportSheetAsPdfToFolder(sheetId, pdfName, folderId) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=pdf&size=A4&portrait=false&scale=4&gridlines=false&printtitle=false&sheetnames=false&pagenumbers=false`;
  const response = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
  return DriveApp.getFolderById(folderId).createFile(response.getBlob().setName(pdfName)).getUrl();
}

// (25 سبتمبر 2026) 'مقاول_عمالة_' لكشف مقاولين العمالة (👷) بس، و'' لأي كشف تاني (مقاولين عاديين أو معدات).
// kind بييجي من التطبيق: labor_contractor / labor / equipment. لو فاضي (صف جاي من الفورم أو نسخة قديمة)
// بنحدده من اسم الملف الأصلي — التطبيق بيكتب "سركي_مقاول_عمالة_..." لكشوف مقاولين العمالة.
function submissionKindTag(kind, fileId) {
  let k = String(kind || '').trim().toLowerCase();
  if (!k && fileId) {
    try { k = DriveApp.getFileById(fileId).getName().indexOf('مقاول_عمالة') >= 0 ? 'labor_contractor' : ''; }
    catch (err) { k = ''; }
  }
  return k === 'labor_contractor' ? 'مقاول_عمالة_' : '';
}

function getFileIdFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/[-\w]{25,}/);
  return m ? m[0] : null;
}

// id الملف من خانة رابط — سواء نص عادي أو smart chip.
// (18 سبتمبر 2026) الـ chip قيمته '@' أو اسم الملف مش الرابط، و getRichTextValue ما بيشوفش رابطه،
// فالبحث عن صف موجود (findSubmissionRow) ما كانش بيلاقي ولا صف اتعمل من التطبيق.
// رابط الـ chip ما بيتقريش غير من Sheets API (نفس الخدمة اللي بتكتبه في setFileSmartChip).
function fileIdInCell(sheet, row, col) {
  const cell = sheet.getRange(row, col);
  let id = getFileIdFromUrl(cell.getValue());
  if (id) return id;
  const rich = cell.getRichTextValue();
  id = getFileIdFromUrl(rich ? rich.getLinkUrl() : null);
  if (id) return id;
  const res = Sheets.Spreadsheets.get(sheet.getParent().getId(), {
    ranges: ["'" + sheet.getName().replace(/'/g, "''") + "'!" + cell.getA1Notation()],
    fields: 'sheets.data.rowData.values(chipRuns,hyperlink)',
  });
  const v = (((((res.sheets || [])[0] || {}).data || [])[0] || {}).rowData || [])[0];
  const c = v && v.values && v.values[0];
  if (!c) return null;
  const chipUri = (c.chipRuns || []).map(r => r.chip && r.chip.richLinkProperties && r.chip.richLinkProperties.uri).filter(Boolean)[0];
  return getFileIdFromUrl(chipUri || c.hyperlink);
}

/* ========= فولدر النسخ الاحتياطية "CEA Backups" (بيتعمل تلقائيًا في جذر Drive) ========= */
function getOrCreateBackupFolder() {
  const name = 'CEA Backups';
  const it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}

/* =====================================================================
 * 3) الإخفاء الأسبوعي + القائمة (نفس القديم)
 * ===================================================================== */
function hideWeeklyData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return;
  const lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow <= HEADER_ROWS) return;
  let n = 0;
  for (let row = HEADER_ROWS + 1; row <= lastRow; row++) {
    if (sheet.isRowHiddenByUser(row)) continue;
    const vals = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
    if (vals.some(v => v !== '' && v !== null)) { sheet.hideRows(row); n++; }
  }
  Logger.log('hideWeeklyData: أُخفي ' + n + ' صف');
}
function unhideAllRows() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow > HEADER_ROWS) sheet.showRows(HEADER_ROWS + 1, lastRow - HEADER_ROWS);
}
/* 🖨 صف وصل من التطبيق موقّعًا لكن السكربت القديم كان لسه شغال وقتها فوقف "بانتظار DC":
   اعتماد D هيحط توقيعات Drive فوق التوقيعات الموجودة (تكرار). بدل كده: حدد الصف ← القائمة ← الأمر ده
   → PDF من الشيت المحوّل زي ما هو + "معتمد بالكامل ✅". (الصفوف الجديدة بعد لصق السكربت بتاخد PDF لوحدها.) */
function finalizeSignedRow() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== CONFIG.SHEET_NAME) { ui.alert('افتح شيت "' + CONFIG.SHEET_NAME + '" وحدد الصف الأول.'); return; }
  const row = sheet.getActiveRange().getRow();
  if (row <= HEADER_ROWS) { ui.alert('حدد صف كشف (مش الترويسة).'); return; }
  if (sheet.getRange(row, COLS.STATUS).getValue() === STATUS.DONE) { ui.alert('الصف ده معتمد بالكامل خلاص.'); return; }
  const convertedId = sheet.getRange(row, COLS.CONVERTED_SHEET_URL).getNote().trim();
  if (!convertedId) { ui.alert('مفيش شيت محوّل مرتبط بالصف ' + row + '.'); return; }
  const engineerName = sheet.getRange(row, COLS.ENGINEER_NAME).getValue();
  const pdfName = approvedPdfName(engineerName, convertedId);
  const pdfUrl = exportSheetAsPdfToFolder(convertedId, pdfName, CONFIG.DC_FOLDER_ID);
  setFileChip(sheet, row, COLS.PDF_URL, pdfUrl);
  // الاعتماد الإداري (F) اتلغى كخطوة والعمود مخفي — مابقاش يتختم من هنا كمان
  sheet.getRange(row, COLS.STATUS).setValue(STATUS.DONE);
  ui.alert('✅ اتولّد الـ PDF للصف ' + row + ' والحالة بقت "معتمد بالكامل".');
}

/* 🔄 لما الأونر يعدّل الشيت المحوّل يدويًا (يشيل توقيع غلط مثلاً) ويحتاج PDF جديد منه.
   عن قصد الدالة دي "غبية": مابتلمسش الحالة ولا F ولا التوقيعات — بس بتاخد الملف المحوّل زي
   ما هو دلوقتي وتعمل منه PDF جديد، فمن الآمن تشغيلها في أي وقت. */
function regeneratePdfForRow() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== CONFIG.SHEET_NAME) { ui.alert('افتح شيت "' + CONFIG.SHEET_NAME + '" وحدد الصف الأول.'); return; }
  const row = sheet.getActiveRange().getRow();
  if (row <= HEADER_ROWS) { ui.alert('حدد صف كشف (مش الترويسة).'); return; }
  const convertedId = sheet.getRange(row, COLS.CONVERTED_SHEET_URL).getNote().trim();
  if (!convertedId) { ui.alert('مفيش شيت محوّل مرتبط بالصف ' + row + '.'); return; }
  const confirm = ui.alert('إعادة توليد PDF', 'هيتعمل PDF جديد للصف ' + row + ' من الشيت المحوّل زي ما هو دلوقتي، وهيستبدل رابط الـ PDF القديم. تكمل؟', ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;
  const engineerName = sheet.getRange(row, COLS.ENGINEER_NAME).getValue();
  const pdfName = approvedPdfName(engineerName, convertedId);
  const pdfUrl = exportSheetAsPdfToFolder(convertedId, pdfName, CONFIG.DC_FOLDER_ID);
  setFileChip(sheet, row, COLS.PDF_URL, pdfUrl);
  ui.alert('✅ اتولّد PDF جديد للصف ' + row + '.');
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('⚙ أدوات السراكي')
    .addItem('🎨 إعادة تطبيق التصميم', 'applyNewDesign')
    .addItem('🖨 إخراج PDF لصف موقّع من التطبيق (بدون توقيعات Drive)', 'finalizeSignedRow')
    .addItem('🔄 إعادة توليد PDF للصف (بعد تعديل يدوي)', 'regeneratePdfForRow')
    .addSeparator()
    .addItem('🙈 إخفاء بيانات الأسبوع الآن', 'hideWeeklyData')
    .addItem('👁 إظهار كل الصفوف المخفية', 'unhideAllRows')
    .addToUi();
}

/* =====================================================================
 * 4) 🔌 استقبال التسليمات من تطبيق CEA (Web App)
 *
 * التطبيق (سيرفر Railway) بيبعت الكشف هنا بعد ما المهندس يراجع ويوافق:
 * POST بجسم JSON: { secret, engineerName, project, fileName, fileBase64 }
 * والسكربت بيعمل نفس اللي بيعمله مع الفورم بالظبط:
 * يحفظ الإكسيل في Drive → يحوّله → يجهّز التوقيعات → يضيف صف في الشيت.
 *
 * ⚠ النشر (مرة واحدة): Deploy > New deployment > Web app
 *    - Execute as: Me (حسابك)
 *    - Who has access: Anyone
 *    وانسخ الـ URL — هيتحط في إعدادات السيرفر مع نفس الـ secret.
 * الحماية: السكربت بيرفض أي طلب من غير الـ secret الصحيح.
 * ===================================================================== */
// السر مخزّن في Script Properties (مش مكتوب في الكود).
// لو احتجت تغيّره: ⚙️ Project Settings → Script Properties → عدّل WEBAPP_SECRET (نفس قيمة Railway).
const WEBAPP_SECRET = PropertiesService.getScriptProperties().getProperty('WEBAPP_SECRET') || '';
// (فحص أمني 2026-09-06 — N10) مقارنة بطول ثابت: ما تكشفش طول/بداية السر من زمن الرد
function secretMatches(given, expected) {
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
// (N10) أي نص جاي من التطبيق/الفورم بيتكتب في الشيت كنص: لو بدأ بـ = + - @ يتفسّر كمعادلة — بنسبقه بـ '
function safeText(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function doPost(e) {
  const out = (obj) => ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body.secret || !secretMatches(String(body.secret), WEBAPP_SECRET)) return out({ ok: false, error: 'unauthorized' });

    // 📊 استعلام الحالة: السيرفر بيبعت أرقام صفوف وبيرجع له حالة كل صف من عمود "الحالة"
    // (عشان المهندس يشوف في التطبيق كشفه وصل لفين في سلسلة الاعتماد)
    if (body.action === 'status') {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
      if (!sheet) return out({ ok: false, error: 'sheet not found' });
      const rows = Array.isArray(body.rows) ? body.rows : [];
      // ⚡ قراءة واحدة للرينج كله بدل getValue() لكل خانة.
      // القديم كان 5 نداءات API لكل صف (225 نداء لـ45 كشف) فبيتعدّى مهلة السيرفر (4 ث)
      // والرد بيرجع null فالكروت كلها تبقى بلا بيانات شيت. دلوقتي نداء واحد مهما كان عدد الصفوف.
      const statuses = {};
      const lastRow = sheet.getLastRow();
      const wanted = rows.map(Number).filter(row => row > HEADER_ROWS && row <= lastRow);
      if (wanted.length) {
        const minRow = Math.min.apply(null, wanted);
        const maxRow = Math.max.apply(null, wanted);
        // الأعمدة D..H متجاورة (4..8) فرينج واحد بيغطيها كلها
        const firstCol = COLS.APPROVE_EXEC;            // 4
        const width = COLS.STATUS - COLS.APPROVE_EXEC + 1; // 5 → D E F G H
        const block = sheet.getRange(minRow, firstCol, maxRow - minRow + 1, width).getValues();
        wanted.forEach(row => {
          const v = block[row - minRow];
          statuses[row] = {
            status: String(v[COLS.STATUS - firstCol] || ''),
            execApproval: String(v[COLS.APPROVE_EXEC - firstCol] || ''),
            pmApproval: String(v[COLS.APPROVE_PM - firstCol] || ''),
            execNotes: String(v[COLS.NOTES_EXEC - firstCol] || ''),
            pmNotes: String(v[COLS.NOTES_PM - firstCol] || ''),
          };
        });
      }
      return out({ ok: true, statuses: statuses });
    }

    // 💾 نسخة احتياطية يومية من قاعدة بيانات التطبيق — بتتحفظ في فولدر "CEA Backups" على Drive
    // (بيتعمل تلقائيًا لو مش موجود). بنحتفظ بآخر 30 نسخة وبنمسح الأقدم.
    if (body.action === 'backup' || body.action === 'backup-file') {
      if (!body.fileBase64 || !body.fileName) return out({ ok: false, error: 'missing backup payload' });
      const isObject = body.action === 'backup-file';
      if (isObject && !/^[a-f0-9]{64}\.json$/.test(body.fileName)) return out({ ok: false, error: 'invalid object name' });
      if (!isObject && !/^cea-db-backup-\d{4}-\d{2}-\d{2}\.json$/.test(body.fileName)) return out({ ok: false, error: 'invalid backup name' });
      const bytes = Utilities.base64Decode(body.fileBase64);
      const blob = Utilities.newBlob(bytes, 'application/json', body.fileName);
      const parsed = JSON.parse(blob.getDataAsString());
      if (isObject) {
        const content = Utilities.base64Decode(parsed.base64);
        const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, content).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
        if (hash + '.json' !== body.fileName || content.length !== parsed.size) return out({ ok: false, error: 'file checksum mismatch' });
      } else if (!parsed.tables || !Array.isArray(parsed.tables.users)) {
        return out({ ok: false, error: 'invalid database backup' });
      }
      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        let folder;
        if (isObject) {
          const folders = DriveApp.getFoldersByName('CEA Backup Files');
          folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('CEA Backup Files');
        } else {
          folder = getOrCreateBackupFolder();
        }
        const old = [];
        const existing = folder.getFilesByName(body.fileName);
        while (existing.hasNext()) old.push(existing.next());
        if (isObject) {
          for (const previous of old) {
            if (previous.getBlob().getDataAsString() === blob.getDataAsString()) {
              return out({ ok: true, fileId: previous.getId(), fileUrl: previous.getUrl(), reused: true });
            }
          }
        }
        // Create and verify first. A failed write never trashes the previous good copy.
        const file = folder.createFile(blob);
        if (file.getSize() !== bytes.length) {
          file.setTrashed(true);
          throw new Error('backup size mismatch');
        }
        old.forEach(previous => previous.setTrashed(true));
        if (!isObject) {
          const all = [];
          const it = folder.getFiles();
          while (it.hasNext()) {
            const candidate = it.next();
            if (/^cea-db-backup-\d{4}-\d{2}-\d{2}\.json$/.test(candidate.getName())) all.push(candidate);
          }
          all.sort((a, b) => b.getDateCreated() - a.getDateCreated());
          for (let i = 30; i < all.length; i++) all[i].setTrashed(true);
        }
        // File objects have no automatic expiry: older database copies may reference them.
        return out({ ok: true, fileId: file.getId(), fileUrl: file.getUrl() });
      } finally {
        lock.releaseLock();
      }
    }

    // 🔎 استعلام: هل الكشف ده موجود فعلًا في الشيت؟ (يُستخدم قبل إعادة رفع بعد ما رد الرفع الأول ضاع)
    if (body.action === 'findRow') {
      if (!body.engineerName || !body.fileName) return out({ ok: false, error: 'missing engineerName or fileName' });
      const row = findSubmissionRow(String(body.engineerName), String(body.fileName), null, body.notBefore);
      return out({ ok: true, row: row });
    }

    if (!body.fileBase64 || !body.engineerName) return out({ ok: false, error: 'missing engineerName or fileBase64' });

    // ⚠ لو رد النداء الأول ضاع، إعادة المحاولة كانت بتعمل صف تاني لنفس الكشف —
    // دلوقتي بندوّر الأول وبنرجّع رقم الصف الموجود من غير ما نرفع ملف جديد أو نعمل صف تاني
    const existingRow = findSubmissionRow(String(body.engineerName), body.fileName || '', 20);
    if (existingRow) return out({ ok: true, row: existingRow, duplicate: true });

    // إنشاء ملف الإكسيل في Drive (processNewSubmission هينقله لفولدر RAW ويحوّله زي الفورم)
    const blob = Utilities.newBlob(
      Utilities.base64Decode(body.fileBase64),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body.fileName || ('سركي_' + body.engineerName + '.xlsx')
    );
    const file = DriveApp.createFile(blob);
    // signed=true: الملف جاي من التطبيق موقّعًا بالكامل → PDF فورًا و"معتمد بالكامل" (مش بانتظار DC)
    const row = processNewSubmission(String(body.engineerName), file.getUrl(), normalizeProject(body.project), body.approvalSummary ? String(body.approvalSummary) : '', true, body.kind ? String(body.kind) : '');
    return out({ ok: true, row: row, fileId: file.getId(), fileUrl: file.getUrl() });
  } catch (err) {
    Logger.log('doPost error: ' + err);
    return out({ ok: false, error: String(err) });
  }
}
