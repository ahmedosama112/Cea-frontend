/**************************************************************
 * CEA — اعتماد سجلات السراكي إلكترونياً (نسخة التصميم الجديد)
 *
 * ✅ نفس الأعمدة ونفس المنطق بالظبط (التحويل، التوقيعات A16/G16،
 *    فتح خانة مدير المشروع بعد مدير التنفيذ، PDF في DC، الإخفاء الأسبوعي)
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
  SIG_EXEC_MANAGER_FILE_ID: '1yj9AXVFeLY_GKM_m-sVI1SjUShWbCfEu',            // 🏠 سكني (الموجود من الأول)
  SIG_EXEC_MANAGER_COMMERCIAL_FILE_ID: '1vM74f45icYl4ueGAPas9KrBnRO1uT1i5',  // 🏪 تجاري — حط الـ File ID هنا
  SIG_PROJECT_MANAGER_FILE_ID: '1ByWboACc2m6WxYIENrB-gA_VyekfU77s',                 // 🏠 سكني
  SIG_PROJECT_MANAGER_COMMERCIAL_FILE_ID: '1ByWboACc2m6WxYIENrB-gA_VyekfU77s',     // 🏪 تجاري — حط الـ File ID هنا
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
const isOk = v => v === APPROVAL.APPROVED || v === APPROVAL.APPROVED_WITH_COMMENTS || v === 'APPROVED' || v === 'APPROVED WITH COMMENTS';
const isNo = v => v === APPROVAL.NOT_APPROVED || v === 'NOT APPROVED';

const STATUS = {
  NEW: 'جديد', CONVERTED: 'قيد الاعتماد',
  EXEC_APPROVED: 'معتمد مدير التنفيذ', PM_APPROVED: 'معتمد مدير المشروع',
  DONE: 'معتمد بالكامل ✅', REJ_EXEC: 'مرفوض من مدير التنفيذ', REJ_PM: 'مرفوض من مدير المشروع',
};

const SIG_CELL_EXEC = 'A16';
const SIG_CELL_PM   = 'G16';

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
  sheet.getRange(1, 4, 1, 2).merge().setValue('مدير التنفيذ');
  sheet.getRange(1, 6, 1, 2).merge().setValue('مدير المشروع');
  sheet.getRange(1, 8, 1, 3).merge().setValue('الاعتماد والإخراج');
  sheet.getRange(1, 11).setValue('المشروع');
  r1.setBackground(THEME.navyDark).setFontColor(THEME.white).setFontWeight('bold').setFontSize(11)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setFontFamily('Cairo');
  sheet.setRowHeight(1, 32);

  const headers = ['إسم المهندس', 'تاريخ الإرسال', 'ملف السركي', 'إعتماد مدير التنفيذ', 'ملاحظات', 'إعتماد مدير المشروع', 'ملاحظات', 'الحالة', 'السراكي بعد الإعتماد', 'PDF النهائي', 'سكني / تجاري'];
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
    // خانة مدير المشروع: مفتوحة لو مدير التنفيذ اعتمد أو فيها قيمة، وإلا مقفولة — قاعدة واحدة لكل مجموعة متتالية
    const execVals = sheet.getRange(HEADER_ROWS + 1, COLS.APPROVE_EXEC, n, 1).getValues();
    const pmVals = sheet.getRange(HEADER_ROWS + 1, COLS.APPROVE_PM, n, 1).getValues();
    const rules = [];
    for (let i = 0; i < n; i++) rules.push([(isOk(execVals[i][0]) || pmVals[i][0]) ? open : locked]);
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
  // لو خانة مدير المشروع فيها قيمة بالفعل (صف قديم معتمد) ما نقفلهاش — القفل للصفوف الجديدة بس
  sheet.getRange(row, COLS.APPROVE_PM).setDataValidation((isOk(execVal) || pmCell.getValue()) ? open : locked);
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
    mk('قيد الاعتماد', THEME.infoBg, THEME.infoFg, statusRange), mk('معتمد مدير', THEME.warnBg, THEME.warnFg, statusRange),
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
  processNewSubmission(engineerName, fileUrl, normalizeProject(rawProject));
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
function addSubmissionRow(engineerName, fileUrl, project) {
  return processNewSubmission(engineerName, fileUrl, normalizeProject(project));
}

/* المنطق المشترك — نفس القديم بالظبط + تنسيق الصف الجديد */
function processNewSubmission(engineerName, fileUrl, project) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) return null;
    const row = sheet.getLastRow() + 1;

    sheet.getRange(row, COLS.ENGINEER_NAME).setValue(engineerName);
    sheet.getRange(row, COLS.TIMESTAMP).setValue(new Date());
    // الأولوية: اختيار صريح (من التطبيق/سؤال الفورم) → وإلا تلقائي حسب اسم المهندس (COMMERCIAL_ENGINEERS)
    sheet.getRange(row, COLS.PROJECT).setValue(project || projectForEngineer(engineerName));

    const fileId = getFileIdFromUrl(fileUrl);
    if (!fileId) {
      sheet.getRange(row, COLS.FILE_URL).setValue(fileUrl);
      sheet.getRange(row, COLS.STATUS).setValue('⚠ تعذر قراءة رابط الملف');
      styleNewRow(sheet, row);
      return row;
    }
    try { moveFileToFolder(fileId, CONFIG.RAW_UPLOADS_FOLDER_ID); } catch (err) { Logger.log('نقل الملف الأصلي: ' + err); }
    try { setFileSmartChip(sheet, row, COLS.FILE_URL, fileUrl); } catch (err) { Logger.log('Smart Chip: ' + err); sheet.getRange(row, COLS.FILE_URL).setValue(fileUrl); }

    const newName = `سركي_معتمد_${engineerName}_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm')}`;
    const convertedId = convertExcelToGoogleSheet(fileId, newName, CONFIG.PROCESSING_FOLDER_ID);
    prepareApprovalSlots(convertedId);
    fixTextWrapping(convertedId);

    sheet.getRange(row, COLS.STATUS).setValue(STATUS.CONVERTED);
    setFileChip(sheet, row, COLS.CONVERTED_SHEET_URL, `https://docs.google.com/spreadsheets/d/${convertedId}/edit`);
    sheet.getRange(row, COLS.CONVERTED_SHEET_URL).setNote(convertedId);

    sheet.getRange(row, COLS.APPROVE_EXEC).setValue('');
    sheet.getRange(row, COLS.APPROVE_PM).setValue('');
    styleNewRow(sheet, row);
    try { applyConditionalFormatting(sheet); } catch (err) { Logger.log('تنسيق شرطي: ' + err); }
    return row;
  } finally { lock.releaseLock(); }
}

/* =====================================================================
 * 2) الاعتماد (onEdit) — نفس المنطق القديم بالظبط مع القيم العربية
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
    if (col === COLS.APPROVE_PM) {
      const execVal = sheet.getRange(row, COLS.APPROVE_EXEC).getValue();
      if (!isOk(execVal)) {
        e.range.setValue('');
        SpreadsheetApp.getUi().alert('لازم مدير التنفيذ يعتمد الأول قبل ما تقدر تعتمد كمدير مشروع.');
        return;
      }
    }
    if (isNo(newValue)) {
      sheet.getRange(row, COLS.STATUS).setValue(col === COLS.APPROVE_EXEC ? STATUS.REJ_EXEC : STATUS.REJ_PM);
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
      // توقيع مدير التنفيذ حسب المشروع (سكني/تجاري) من عمود المشروع في نفس الصف
      const projectValue = sheet.getRange(row, COLS.PROJECT).getValue();
      insertSignatureOnAllSheets(convertedId, execSignatureIdFor(projectValue), SIG_CELL_EXEC);
      sheet.getRange(row, COLS.STATUS).setValue(STATUS.EXEC_APPROVED);
      const open = SpreadsheetApp.newDataValidation().requireValueInList(DROPDOWN_OPTIONS, true).setAllowInvalid(false).build();
      sheet.getRange(row, COLS.APPROVE_PM).setDataValidation(open);
    } else {
      insertSignatureOnAllSheets(convertedId, getFileIdFromUrl(CONFIG.SIG_PROJECT_MANAGER_FILE_ID), SIG_CELL_PM);
      sheet.getRange(row, COLS.STATUS).setValue(STATUS.PM_APPROVED);
    }

    const execOk = isOk(sheet.getRange(row, COLS.APPROVE_EXEC).getValue());
    const pmOk = isOk(sheet.getRange(row, COLS.APPROVE_PM).getValue());
    if (execOk && pmOk) {
      const engineerName = sheet.getRange(row, COLS.ENGINEER_NAME).getValue();
      const pdfName = `سركي_معتمد_${engineerName}_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')}.pdf`;
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
  catch (err) { Logger.log('Smart Chip فشل (عمود ' + col + '): ' + err); sheet.getRange(row, col).setValue(fileUrl); }
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
  [SIG_CELL_EXEC, SIG_CELL_PM].forEach(a1 => {
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

function insertSignatureOnAllSheets(sheetId, sigFileId, cellA1) {
  const ss = SpreadsheetApp.openById(sheetId);
  const blob = DriveApp.getFileById(sigFileId).getBlob();
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

function exportSheetAsPdfToFolder(sheetId, pdfName, folderId) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=pdf&size=A4&portrait=false&scale=4&gridlines=false&printtitle=false&sheetnames=false&pagenumbers=false`;
  const response = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
  return DriveApp.getFolderById(folderId).createFile(response.getBlob().setName(pdfName)).getUrl();
}

function getFileIdFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/[-\w]{25,}/);
  return m ? m[0] : null;
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
function onOpen() {
  SpreadsheetApp.getUi().createMenu('⚙ أدوات السراكي')
    .addItem('🎨 إعادة تطبيق التصميم', 'applyNewDesign')
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

function doPost(e) {
  const out = (obj) => ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body.secret || body.secret !== WEBAPP_SECRET) return out({ ok: false, error: 'unauthorized' });

    // 📊 استعلام الحالة: السيرفر بيبعت أرقام صفوف وبيرجع له حالة كل صف من عمود "الحالة"
    // (عشان المهندس يشوف في التطبيق كشفه وصل لفين في سلسلة الاعتماد)
    if (body.action === 'status') {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
      if (!sheet) return out({ ok: false, error: 'sheet not found' });
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const statuses = {};
      rows.forEach(r => {
        const row = Number(r);
        if (row > HEADER_ROWS && row <= sheet.getLastRow()) {
          statuses[row] = {
            status: String(sheet.getRange(row, COLS.STATUS).getValue() || ''),
            execApproval: String(sheet.getRange(row, COLS.APPROVE_EXEC).getValue() || ''),
            pmApproval: String(sheet.getRange(row, COLS.APPROVE_PM).getValue() || ''),
            execNotes: String(sheet.getRange(row, COLS.NOTES_EXEC).getValue() || ''),
            pmNotes: String(sheet.getRange(row, COLS.NOTES_PM).getValue() || ''),
          };
        }
      });
      return out({ ok: true, statuses: statuses });
    }

    // 💾 نسخة احتياطية يومية من قاعدة بيانات التطبيق — بتتحفظ في فولدر "CEA Backups" على Drive
    // (بيتعمل تلقائيًا لو مش موجود). بنحتفظ بآخر 30 نسخة وبنمسح الأقدم.
    if (body.action === 'backup') {
      if (!body.fileBase64 || !body.fileName) return out({ ok: false, error: 'missing backup payload' });
      const folder = getOrCreateBackupFolder();
      // لو فيه نسخة بنفس الاسم (نفس اليوم) — نستبدلها بدل ما نكرر
      const existing = folder.getFilesByName(body.fileName);
      while (existing.hasNext()) existing.next().setTrashed(true);
      const blob = Utilities.newBlob(Utilities.base64Decode(body.fileBase64), 'application/json', body.fileName);
      const file = folder.createFile(blob);
      // الاحتفاظ بآخر 30 نسخة فقط
      const all = [];
      const it = folder.getFiles();
      while (it.hasNext()) all.push(it.next());
      all.sort((a, b) => b.getDateCreated() - a.getDateCreated());
      for (let i = 30; i < all.length; i++) all[i].setTrashed(true);
      return out({ ok: true, fileId: file.getId(), fileUrl: file.getUrl(), kept: Math.min(all.length, 30) });
    }

    if (!body.fileBase64 || !body.engineerName) return out({ ok: false, error: 'missing engineerName or fileBase64' });

    // إنشاء ملف الإكسيل في Drive (processNewSubmission هينقله لفولدر RAW ويحوّله زي الفورم)
    const blob = Utilities.newBlob(
      Utilities.base64Decode(body.fileBase64),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body.fileName || ('سركي_' + body.engineerName + '.xlsx')
    );
    const file = DriveApp.createFile(blob);
    const row = processNewSubmission(String(body.engineerName), file.getUrl(), normalizeProject(body.project));
    return out({ ok: true, row: row, fileId: file.getId(), fileUrl: file.getUrl() });
  } catch (err) {
    Logger.log('doPost error: ' + err);
    return out({ ok: false, error: String(err) });
  }
}