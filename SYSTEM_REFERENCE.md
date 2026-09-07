# System Reference — مشروع CEA (متابعة السرايكي)

مرجع تقني كامل لبنية المشروع، الملفات، والـ features الموجودة فعليًا في الكود — مُستخرج بالكامل من قراءة الكود المصدري (بدون افتراضات). آخر تحديث: 2026-09-06.

> **تحديث 2026-09-06:** ملخص ما بعد 2026-09-01 (السرد الكامل في [SESSION-LOG.md](SESSION-LOG.md) أقسام 9–13). **كل ما يلي منشور في الإنتاج** (Railway backend حتى `291828d`، الواجهة على Cloudflare حتى `0f01ea1`، كاش `cea-202609061540`)، الاختبارات **84/84**:
> 1. **باقة 2026-09-03 اتنشرت فعليًا** (المخازن + دفعة الأمان الثانية + اعتمادات المديرين، backend `be19004`) — وحدة المخازن (قسم 12) بقت على الإنتاج لكن مخفية حتى يفعّلها الأدمن حسابًا بحساب.
> 2. **وحدة "اعتمادات المديرين"** (`approvals`) — سلسلة مراجعة داخل التطبيق قبل ما الكشف يوصل جوجل شيت: تاب جديد بجدول طابور، قرارات اعتماد/بملاحظات/رفض، إعادة إرسال بنسخة `rev++`، جدول `submission_reviews`، مسارات `/api/approvals/*`. التفاصيل في **قسم 13**.
> 3. **الدرجات والمعتمدون المسندون** — `users.grade` (5 درجات ثابتة) بدل `approval_level`، ومعتمد بالاسم لكل حساب في كل مستوى (`approver_tl_id/cm_id/pm_id`)، ومصفوفة "مين يعتمد لمين" **قابلة للتعديل** من شاشة الإدارة (`app_config.approvalMatrix`).
> 4. **التوقيعات جوّه التطبيق** — `backend/src/services/signStamp.ts` (exceljs) يختم توقيع كل معتمد فعلي على الكشف قبل الدفع لجوجل (A16 مدير المشروع · G16 مدير التنفيذ · J16 مدير الفريق — البلوك يُتعرَّف عليه من نص عنوانه في الصف 17)، فالملف يوصل الشيت موقّعًا والـ PDF يتولّد فورًا. "اعتماد DC" مابقاش خطوة موافقة.
> 5. **`google-sheet/Code.gs` (الموقع الأول) اتعاد تعريف أعمدته:** D = اعتماد DC، E = ملاحظات DC، F = الاعتماد الإداري (يُختم تلقائيًا `✅ معتمد بالكامل` ويُقفل)، G = سلسلة الاعتماد؛ وبيدعم مسارين: من التطبيق (`signed=true` → PDF فورًا) ومن الفورم (`signed=false` → المسار القديم بالكامل كطوارئ). **اللصق في Apps Script يدوي ولسه معلّق.** `Code-site2.gs` لم يُلمس.
> 6. **خطة استرجاع** لو السيرفر وقع — [RECOVERY-PLAN.md](RECOVERY-PLAN.md): الفورم + اعتماد DC من الشيت كمسار طوارئ بلا سيرفر (قسم 15).
> 7. **سجل نشاط الحسابات** — جدول `activity_logs` (دخول ناجح/فاشل، مزامنة، أخطاء API بهوية صاحب الطلب)، كارت "📊 نشاط الحسابات" بجدول كل الحسابات + قسم سجل في كارت الحساب، تنظيف بعد 14 يوم. التفاصيل في **قسم 14**.
> 8. **إصلاحات من الاستخدام الحقيقي:** `'unsafe-eval'` في CSP (ExcelJS 4.3 بتحتاجه)، محمّل مكتبات يتحقق من الـ global ويتخطى كاش الـ SW ويرجع للـ CDN، الـ SW لا يكاش `lib/*.js` إلا لو رد JS حقيقي، المزامنة ما بتطلبش `/api/records` لحساب بلا وحدة السراكي (كانت بتطلع "تعذر الاتصال" بالغلط)، حذف الكشوف بقى للأدمن فقط، إحصاءات مزامنة الجهاز (`POST /api/account/sync-stats`)، معاينة الكشف بترتيب الأعمدة الطبيعي (A يسار) وبتوقيعات المديرين ظاهرة.
> 9. **الواجهة بقت في git** — ريبو بجذر المشروع (بلا remote)، `.gitignore` بيستثني `backend/` (ريبو مستقل على GitHub) و`pwa-dist/` و`backups/` والـ `.bak`.
> 10. **وحدة "🚜 سركي المعدات" (`equipment`) — منشورة ليلة 2026-09-06 (backend `e6c38e3`، واجهة كاش `cea-202609061924`)، مخفية حتى يفعّلها الأدمن:** كشف تشغيل شهري (20→19) لمعدة مؤجّرة، ورقة لكل 5 أيام، يعدّي على نفس دورة الاعتماد بـ `submissions.kind=equipment`. التفاصيل في **قسم 16** و[SESSION-LOG.md](SESSION-LOG.md) قسم 14.

> **تحديث 2026-09-01:** ملخص ما بعد 2026-08-26 (السرد الزمني الكامل في [SESSION-LOG.md](SESSION-LOG.md)):
> 1. **إصلاحات جوهرية في محرك المزامنة** (`mirrorPushByName`/`pullManagedData`) — انظر التنبيه المضاف في قسم 5.28: الحذف من السيرفر مشروط بمعرفة الجهاز للاسم في snapshot، لا إحياء للمحذوف غير المعدّل محليًا، والمقاولون/الاستشاريون/البنود بيتسحبوا دوريًا للجميع (الأدمن كمان).
> 2. **ملاحظات الأماكن:** `Place.note` — أيقونة ❕ جنب اختيار المكان في تسجيل السركي تعرض الملاحظة؛ تُدار من الإعدادات (فورم تعديل اسم+ملاحظة) ومن لوحة الأدمن، وتنتقل مع النسخ.
> 3. **لوحة الأدمن:** نسخ كل الأماكن/المقاولين دفعة واحدة (`copy-mine`)، كتابة مقاول جديد مباشرة، خانات بحث في قوائم الاختيار، دروب داون الموقع+المشروع في إنشاء الحساب، قائمة "الوحدات الظاهرة له" بقت أقسامًا مطوية بعدادات (وفيتشر `records_filters` اتفصل لـ `records_search`/`records_sort`/`records_export_chips` بترحيل تلقائي للقوائم القديمة في الطرفين).
> 4. **التسليمات:** الشارة الرئيسية بتتبع حالة الشيت الحية ("✅ معتمد بالكامل")، زرار "حذف من سجل تسليماتي"، وطابور إرسال لكل موقع في `googleSheet.ts` (الكشوف المتزامنة تروح لجوجل واحدًا واحدًا — يمنع فشل قفل Apps Script).
> 5. **منظومة استعادة كاملة (مُختبرة):** `scripts/restore-backup.ts` يعيد بناء النظام كله من ملف الباك اب اليومي بنفس الأرقام، `scripts/dump-to-file.ts` لنسخة يدوية، `GET /api/admin/backup-status` لآخر نتيجة، والباك اب بقى يشمل `app_config` وجداول المخازن. نسخة ملفات الرفع مسحوبة في `backups/uploads-2026-09-01.tgz`.
> 6. **دفعة الأمان الثانية** (محلية — تُنشر مع الباقة): CSP كامل، قفل محاولات الدخول، كاش حالات الشيت 60ث بمهلة 4ث، multer 2، صور التقارير اليومية عند الطلب (بدل ملء localStorage)، `/health` يلمس القاعدة، تحقق env/تواريخ/أرقام/magic bytes، تنظيف توكنات يومي، إشعار النسخة الجديدة، تحصين dev-server (127.0.0.1 + حظر الملفات الحساسة)، حذف `cookie-parser` و`DEFAULT_CONTRACTORS` — الجدول الكامل في `SECURITY_REPORT.md` ("الدفعة الثانية").
> 7. **وحدة المخازن مكتملة (غير منشورة)** — انظر قسم 12 الجديد بالأسفل.
> 8. **بيئة التطوير:** الواجهة على localhost بتكلم الـ Backend المحلي تلقائيًا (`window.CEA_API_URL` في index.html)، والقاعدة المحلية استُعيدت من نسخة إنتاج.
> 9. **النشر معلّق عمدًا:** الإنتاج على نسخة ما قبل المخازن — خطوات النشر الجاهزة في [DEPLOY-NEXT-RELEASE.md](DEPLOY-NEXT-RELEASE.md).

> **تحديث 2026-08-26:** توثيق ما حصل بعد 2026-08-21:
> 1. **فحص أمني شامل + إصلاحات منشورة** — انظر `SECURITY_REPORT.md` (تاريخ 2026-08-21). أُصلح ونُشر على الإنتاج: حذف مساري `password-reset/*` (كانا يعيدان التوكن في الاستجابة — استيلاء على أي حساب)، `trust proxy` + `skipSuccessfulRequests` على limiter المصادقة، تنظيف اسم ملف الاعتماد (`fixFileName` في السيرفر + `jsArg` في زر التنزيل)، منع حذف الملفات المرتبطة بـ Submission/توقيع، `wipeLocalAppData()` عند الخروج/الدخول بإيميل مختلف، إعادة التهيئة محلية فقط، `serverIsAuthoritative` يحتفظ بالعناصر ذات id محلي، تحقق صارم في `applyRestoreData`، والمزامنة/الاستعادة لكل موديول على حدة حسب `moduleEnabled()`. الاختبارات 45/45 ناجحة. المتبقي يدويًا: تدوير `WEBAPP_SECRET` وضبط توقيعات المشروع التجاري.
> 2. **تغيير استراتيجية الـ Service Worker** — ملفات الكود (HTML/JS/CSS + طلبات navigate) بقت **network-first** (أي نشر جديد يوصل فورًا، والكاش احتياط أوفلاين)، والأصول الثابتة (أيقونات/مكتبات) stale-while-revalidate. طلبات cross-origin (الـ API) لا تُلمس إطلاقًا كما كانت.
> 3. **دعم مشروعين (🏠 سكني / 🏪 تجاري) في سلسلة الاعتماد** — نوع مشروع المستخدم بيتبعت مع كل اعتماد للـ Backend ثم لجوجل شيت، و`Code.gs` (اتحدّث 2026-08-26) بقى يختار توقيع مدير التنفيذ حسب المشروع. **متبقي:** توقيع مدير المشروع لسه واحد للمشروعين + الـ File IDs التجارية placeholders — التفاصيل في قسم 10.

> **تحديث 2026-08-21:** إعادة كتابة شاملة للمرجع. النسخة السابقة (2026-08-18) كانت توثّق التطبيق عند لحظة الترحيل من Supabase إلى MySQL فقط، وفاتها إضافات كبيرة حصلت بعد كده: نظام صلاحيات الموديولات/الفيتشرز، لوحة الأدمن الكاملة، تبويب الرئيسية (Home)، ورشة "الاعتمادات" (Submissions) المتكاملة مع Google Sheets، الـ Drawer الجانبي، وملفات الـ PWA (Service Worker + Manifest + build script). كل ده موثّق دلوقتي بالكامل تحت.

---

## 1. نظرة عامة

تطبيق ويب من صفحة واحدة (Single HTML/JS/CSS، بدون build step ولا framework) لإدارة متابعة أعمال موقع إنشائي: تسجيل أعمال المقاولين اليومية ("السراكي")، طلبات الفحص (IR)، التقارير اليومية بالصور، متابعة نسب الإنجاز، المهام، وملخص/تقارير Excel وPDF، بالإضافة إلى **ورشة اعتماد رسمية** (Submissions) بتوصل لجوجل شيت وتوقيعات المدراء.

يعمل التطبيق في وضعين:
1. **PWA (ويب)** — قابل للتثبيت عبر `manifest.webmanifest` + `sw.js`، يعمل أوفلاين بالكامل بعد أول تحميل.
2. **تطبيق أندرويد عبر Capacitor** (WebView) — نفس الكود، مع `window.isCapacitor` و`capacitor.js` (خارج هذا الفولدر، جزء من مشروع Android أكبر).

التخزين الأساسي **localStorage** على الجهاز (أوفلاين أولاً)، مع **Backend خاص (Node/Express/Prisma/MySQL)** كطبقة مزامنة/مصادقة/صلاحيات — Supabase تم إزالته بالكامل من الاستخدام الفعلي (نسخته القديمة محفوظة في `app.js.supabase.bak` فقط للرجوع).

---

## 2. بنية الملفات (File Structure)

```
E:\fabel max cea project\
├── app.js                        ~5,660 سطر — كل منطق الواجهة (state, rendering, sync, export, inventory, approvals, admin activity)
├── app.js.pre-submit.bak                 — نسخة app.js قبل إضافة ميزة الاعتمادات (Submissions)
├── app.js.supabase.bak                   — نسخة app.js قبل الترحيل من Supabase إلى MySQL
├── index (17).html               ~1,215 سطر — الواجهة (HTML) + استدعاء app.js وcapacitor.js
├── style.css                     ~715 سطر — كل التنسيق (layout, tabs, dark mode, modals, drawer, inventory, approvals, activity table...)
├── manifest.webmanifest                  — PWA manifest (اسم، أيقونات، RTL، standalone)
├── sw.js                                 — Service Worker: تخزين مؤقت أوفلاين لهيكل التطبيق
├── build-pwa.js                          — يبني pwa-dist/ (النسخة الجاهزة للنشر) من الملفات المصدرية
├── make-icons.js                         — يولّد أيقونات PWA (192/512/maskable) من الصفر بدون مكتبات صور
├── dev-server.js                         — سيرفر تطوير محلي (live-reload عبر SSE) + endpoint تصحيح `/__save`
├── CHANGELOG.md                          — سجل مراجعة سابقة (bug fixes + توصيات)
├── SECURITY_REPORT.md                    — تقرير الفحص الأمني + حالة الإصلاحات (دفعتان)
├── SESSION-LOG.md                        — سجل جلسة العمل الكبرى (أواخر أغسطس → سبتمبر 2026) مضغوطًا
├── ROADMAP-INVENTORY.md                  — تصميم وحدة المخازن وقراراتها
├── DEPLOY-NEXT-RELEASE.md                — سجل النشرات الفعلية (3 و5 سبتمبر 2026) + خطوات/rollback مرجعية للنشرات الجاية
├── RECOVERY-PLAN.md                      — 🆘 خطة الاسترجاع لو السيرفر وقع (الفورم + اعتماد DC من الشيت كمسار طوارئ)
├── MIGRATION-RAILWAY-TO-HOSTINGER.md     — دليل النقل الكامل لـ Hostinger
├── backups/                              — uploads-*.tgz (نسخة ملفات الرفع من Railway) + CEA_backup_2026-08-17.json (اتنقل هنا — بيانات حقيقية)
├── SYSTEM_REFERENCE.md                   — هذا الملف
├── CEA_backup_2026-08-17.json            — نسخة احتياطية كاملة (مصدر استيراد البيانات لـ MySQL)
├── debug-out.xlsx                        — ملف مؤقت من `/__save` (تصحيح، ليس بيانات تطبيق)
├── icons/                                — icon-192.png, icon-512.png, icon-maskable-512.png
├── lib/
│   ├── xlsx.full.min.js          (~860 KB) — مكتبة SheetJS، قراءة/استيراد Excel (lazy load)
│   └── exceljs.min.js            (~1.1 MB) — مكتبة ExcelJS، بناء Excel منسّق للتصدير (lazy load)
├── google-sheet/
│   ├── Code.gs                           — Google Apps Script (شيت جريني): يستقبل الكشف الموقّع من التطبيق → صف + شيت محوّل + PDF فورًا؛ ومسار الفورم القديم (بانتظار DC) للطوارئ — انظر قسم 10
│   ├── Code -قديم.gs                     — نسخة ما قبل تحديثات سبتمبر 2026 (للرجوع فقط، لا تُنشر)
│   └── Code-site2.gs                     — نسخة أزاليا (فولدراتها متظبطة، التوقيعات placeholders) — **لم تُحدَّث** بتغييرات سبتمبر عمدًا
├── pwa-dist/                             — ناتج build-pwa.js (حزمة جاهزة للنشر على Cloudflare Pages) — ليس مصدر
├── debug-x/                              — فولدر فاضي
├── .wrangler/                            — حالة Cloudflare Wrangler المحلية (أداة نشر، ليست كود)
├── .claude/                              — إعدادات Claude Code + skills (أداة تطوير، ليست جزء من التطبيق)
└── backend/                              — الـ Backend (Node/TS/Express/Prisma/MySQL)
    ├── prisma/schema.prisma              — 26 جدول (انظر backend/README.md وقسم 9.1)
    ├── prisma/seed.ts                    — بيانات افتراضية + أول أدمن
    ├── prisma/migrations/                — 21 migration (آخرها 20260906200000_equipment_records)
    ├── scripts/
    │   ├── import-backup.ts              — استيراد نسخة التطبيق المحلية القديمة (صيغة CEA_backup_*)
    │   ├── restore-backup.ts             — ⭐ استعادة كاملة من الباك اب اليومي (كل الحسابات بنفس الأرقام) — مُختبر
    │   ├── dump-to-file.ts               — توليد ملف باك اب يدوي بنفس صيغة اليومي
    │   ├── seed-inventory.ts             — جرد افتتاحي افتراضي للمخازن (25 صنف، كميات صفر)
    │   ├── upsert-admin.ts               — إنشاء/تحديث حساب أدمن بإيميل وباسورد (استُخدم لإعادة بناء القاعدة المحلية)
    │   ├── dedupe-records.ts             — إزالة تكرار السجلات
    │   ├── docker-start.sh
    │   └── run-tests.js
    ├── src/
    │   ├── config/                       — env.ts, prisma.ts
    │   ├── routes/ (auth, account, admin, approvals, submissions, inventory, ...), controllers/, middlewares/, schema/ (Zod), utils/
    │   ├── services/                     — googleSheet, backup, storage, approvalChain (سلسلة الاعتماد + الدفع للشيت), signStamp (ختم التوقيعات), activityLog
    │   └── dist/                         — ناتج compile (ليس مصدر)
    ├── tests/                            — vitest + supertest — 11 ملف (auth, entities, modules, records, submissions, inventory, approvals, signStamp, activityLog, sync-stats, equipment) = 94 اختبار
    ├── Dockerfile, docker-compose.yml, railway.json — إعدادات نشر/تشغيل محلي
    └── README.md
```

> MySQL محلي حاليًا في `E:\mysql-8.0.46-winx64` (شغّال كعملية، مش service) — قواعد: `cea` (تطوير) و`cea_test` (اختبارات فقط). ⚠ **(2026-09-03)** قاعدة `cea` المحلية اتمسحت بالغلط (تشغيل `npx vitest run` مباشرة بدل `npm test`) وبقت بيانات تجريبية بس — حسابات محلية `asepremong420@gmail.com` (أدمن)، `tl@test.com`، `pm@test.com`، `testeng@cea.com`، `admin@test.com` (باسورد `password123` إلا الأول). `tests/helpers.ts` بقى يرفض أي `DATABASE_URL` مش بينتهي بـ `/cea_test`. لو محتاج نسخة إنتاج محلية: `scripts/dump-to-file.ts` ثم `scripts/restore-backup.ts --wipe`.

### ملفات مُشار إليها في الكود لكن غير موجودة في هذا الفولدر

| الملف | أين يُستدعى | الدور |
|---|---|---|
| `capacitor.js` | `<script src="capacitor.js">` في الـ HTML | جسر Capacitor الأصلي (Filesystem, Share, Notifications...) — جزء من مشروع Android أكبر |

### تحميل مكتبات Excel والخطوط
- `lib/xlsx.full.min.js` و`lib/exceljs.min.js` **لا** تُستدعيان عبر `<script>` ثابت في الـ HTML — يتم حقنهما ديناميكيًا (`ensureXLSX`/`ensureExcelJS`) وقت الحاجة فقط، لكنهما مُدرجتان في قائمة الـ Service Worker cache (`sw.js`) عشان يشتغل الاستيراد/التصدير حتى أوفلاين.
- خط "Cairo" لا يزال يُحمَّل عبر `@import` من Google Fonts (وليس ملفًا محليًا) — يحتاج اتصال إنترنت أول مرة لعرض الخط الصحيح.

---

## 3. المعمارية العامة (ملخص)

```
واجهة المستخدم (index.html + style.css)
        ↓
app.js  →  state في متغيرات JS (records, todos, contractors, enabledModules, ...)
        ↓
localStorage  ← [ المصدر الأساسي محليًا — يعمل أوفلاين بالكامل ]
        ↓ (مزامنة تلقائية debounced + عند رجوع النت + يدوية)
REST API (backend/ — Express + JWT + requireModule middleware)
        ↓
MySQL (قاعدة cea عبر Prisma)
        ↓ (الكشوف فقط — بعد اكتمال سلسلة اعتمادات المديرين داخل التطبيق وختم توقيعاتهم في signStamp.ts)
Google Apps Script Web App (google-sheet/Code.gs) → Google Sheet + شيت محوّل + PDF فورًا (الملف بيوصل موقّعًا)
```

الواجهة **لا تتصل بقاعدة البيانات مباشرة أبدًا** — كل شيء عبر الـ API بتوكن JWT، والصلاحيات (أدمن/مهندس + ownership + تفعيل موديول) مفروضة على مستوى السيرفر (`requireModule` middleware) وليس فقط في الواجهة. الواجهة نفسها لسه بدون build tool (HTML/JS/CSS خام)، لكن `build-pwa.js` يجهّز نسخة نشر منها.

طبقة الـ PWA (`sw.js`) منفصلة تمامًا عن أي شيء أعلاه — بتكاش هيكل التطبيق (HTML/JS/CSS/أيقونات/مكتبات Excel) فقط، وبتمرّر أي طلب API (cross-origin) زي ما هو بدون تدخل.

---

## 4. نظام الموديولات والصلاحيات (Modules & Features Permission System)

ميزة جديدة بالكامل تتحكم في أي تابات/فيتشرز تظهر لكل مهندس، تُدار من لوحة الأدمن وتُفرض على مستوى الواجهة والسيرفر معًا.

| العنصر | الوصف |
|---|---|
| `ALL_MODULES` | `['records','submissions','ir','site_daily','site_exec','todo','summary','inventory','approvals','equipment']` — الموديولات (تابات) القابلة للتفعيل/التعطيل لكل مستخدم (`inventory` و`approvals` و`equipment` مش في الافتراضي — مخفية حتى يفعّلها الأدمن؛ المخازن والاعتمادات **أونلاين فقط**، والمعدات أوفلاين-أولًا زي السراكي) |
| `MODULE_LABELS`, `TAB_MODULE` | تسمية عربية لكل موديول + ربطه بمعرّف التاب في الـ DOM |
| `enabledModules` / `enabledFeatures` | تُقرأ من `AccountSettings` عبر الـ API وتُخزَّن محليًا في `cea_enabled_modules` / `cea_enabled_features` |
| `ALL_FEATURES` / `FEATURE_KEYS` / `DEFAULT_FEATURES` | فيتشرز أدق داخل كل تاب (مش كل التاب بالكامل) |
| `applyModuleVisibility` | تُطبَّق بعد كل تسجيل دخول/مزامنة — تخفي التابات/الفيتشرز غير المفعّلة من DOM فعليًا |
| `moduleEnabled`, `featureEnabled`, `tabEnabled` | دوال فحص سريعة تُستخدم في كل مكان قبل عرض عنصر واجهة |

**فرض مطابق على السيرفر**: `requireModule` middleware في `backend/src/middlewares` يمنع أي طلب API لموديول غير مفعّل لهذا المستخدم، حتى لو تم تجاوز الفحص في الواجهة — يعني الحماية حقيقية وليست شكلية فقط.

---

## 5. جرد الـ Features الكامل (app.js — ~5,660 سطر)

مرتّبة حسب المجال الوظيفي بترتيب ظهورها في الملف، مع أرقام الأسطر التقريبية والدوال الرئيسية.

> ⚠ أرقام الأسطر في 5.1–5.30 من نسخة 2026-08-21 (4,263 سطر) وبقت تقريبية جدًا بعد إضافات سبتمبر (المخازن + الاعتمادات + النشاط ≈ +1,400 سطر) — الدوال نفسها موجودة بنفس الأسماء والترتيب. القسم 5.31 بأرقام نسخة 2026-09-06.

### 5.1 الأدوات الأساسية (Utilities) — أسطر 1-68
| Feature | الدوال | الوصف |
|---|---|---|
| HTML escaping / safe args | `esc`, `jsArg` | منع XSS عند حقن نصوص المستخدم في innerHTML |
| UTF-8 Base64 helpers | `bytesToBase64`, `base64ToBytes`, `utf8ToBase64`, `base64ToUtf8` | ترميز/فك ترميز يدعم العربي والإيموجي بالكامل |
| Lazy library loader | `ensureXLSX`, `ensureExcelJS`, `_loadLib`, `_loadScriptOnce(src, globalName)` | حقن مكتبات Excel ديناميكيًا عند أول استخدام فعلي فقط. **(2026-09-03)** بيتحقق من وجود الـ global (`XLSX`/`ExcelJS`) بعد التحميل — `onload` بيتنفذ حتى لو الملف تالف أو HTML — والترتيب: `lib/` المحلية → نفسها بمعامل عشوائي (يتخطى كاش الـ SW) → CDN، مع toast واضح عند الفشل |

### 5.2 PIN Protection System — أسطر 88-303
حماية UI محلية لعمليات حسّاسة (تعديل الأماكن، التوقيع). الدوال: `sha256Hex`, `getPinHash/setPinHash/hasPinSet`, `openPinModal`, `requirePin`, `changePin`.

### 5.3 الوضع الداكن (Dark Mode) — أسطر 303-341
`setDarkModeIcon`, `toggleDarkMode` — يُنفَّذ فور التحميل لمنع وميض أبيض.

### 5.4 الحفظ العام والتوست — أسطر 327-367
`saveRecordsLoadState`, `saveAll`, `fmt`, `showToast`.

### 5.5 بيانات مرجعية — الإعدادات (Settings) — أسطر 377-701
| الكيان | الدوال |
|---|---|
| المقاولون | `startEditContractor`, `addContractor`, `removeContractor` |
| الأماكن (محمية بـ PIN) | `addPlace`, `removePlace`, `editPlace` |
| الاستشاريون/المفتشون | `addInspector`, `removeInspector` |
| البنود والمراحل | `addStageToNew`, `renderNewItemStages`, `addItem`, `removeItem`, `startEditItem`, `saveEditItem` |
| استيراد/تصدير البنود Excel | `exportItemsExcel`, `importItemsExcel` |
| عرض الإعدادات + dropdowns | `populateDropdowns`, `renderSettings` |

### 5.6 اختيار متعدد للتصدير وخصومات — أسطر 701-808
`export-contractor-chips`, `export-place-chips`, `deduct-chips`, `fillSpec` (تعبئة تلقائية للتخصص حسب المقاول).

### 5.7 استيراد Excel (سجلات) — أسطر 821-908
`importExcel`.

### 5.8 أدوات التاريخ/اليوم — أسطر 908-937
`todayYMD`, `dayNameOf`, `autoSetDay`, `dateForDayName`, `autoSetDateFromDay`, `calcTotal`.

### 5.9 السجلات الرئيسية ("سراكي") CRUD — أسطر 939-971
`saveRecord`, `editRecord`, `cancelEdit`, `clearForm`, `deleteRecord`, `toggleDone`.

### 5.10 طلبات الفحص (IR) CRUD — أسطر 959-969
`saveIR`, `clearIRForm`, `editIR`, `cancelIrEdit`, `deleteIR`.

### 5.11 فلترة/فرز/عرض — أسطر 972-1109
`setSort`, `getRecordFilters`, `getFilteredRecords`, `scopeLabel`, `renderRecords`, `renderIR`, `renderSummary`.

### 5.12 محرك الموديولات/الصلاحيات — أسطر 1110-1179
انظر قسم 4 أعلاه. `setEnabledModules`, `moduleEnabled`, `setEnabledFeatures`, `featureEnabled`, `tabEnabled`, `applyModuleVisibility`.

### 5.13 التنقل: تابات + Drawer جانبي — أسطر 1180-1223
`switchTab`, `openDrawer`/`closeDrawer` — قائمة تنقل جانبية جديدة (RTL، تفتح من اليمين) بديل/مكمّل لشريط التابات السفلي.

### 5.14 لوحة الأدمن (Admin Panel) — أسطر 1224-1558 — **ميزة جديدة بالكامل**
شاشة إدارة حسابات كاملة، مرئية فقط للأدمن (`isAdmin()`):

| المجموعة | الدوال |
|---|---|
| حالة الاتصال | `presenceDot`/`presenceText` — نقطة تدل هل المهندس متصل الآن |
| عرض المستخدمين | `renderAdmin`, `adminOpenUser`/`adminCloseUser` |
| صلاحيات الموديولات/الفيتشرز | `adminModuleCheckboxes`, `adminReadModules`/`adminReadFeatures`, `adminSaveModules` |
| إدارة الأماكن لكل مستخدم | `adminRenderPlaces`, `adminAddPlace`/`adminRemovePlace` |
| إدارة المقاولين لكل مستخدم | `adminLoadContractors`, `adminAddContractor`/`adminRemoveContractor`, `adminCopyMyContractors` (نسخ مقاولي الأدمن للمهندس دفعة واحدة) |
| التوقيع | `adminRenderSignature`, `adminUploadSignatureBlob`/`adminUseMySignature`/`adminUploadSignature`, `adminClearSignature` |
| بيانات الحساب | `adminSaveTitle`/`adminSaveProject`/`adminSaveRole` |
| حذف حساب (تأكيد بخطوتين) | `adminDeleteCancel`, `adminDeleteStep1`, `adminDeleteStep2`, `adminDeleteFinal` |
| إنشاء/إدارة | `adminResetPassword`, `adminCopyCreated`, `adminCreateUser` |
| **الدرجة والمعتمدون المسندون** (2026-09-05) | `adminFillGradeAndApprovers`, `adminSaveGrade`, `adminSaveApprover`, `gradeLabel` (`GRADE_LABELS`, `APR_LEVEL_UI`) — دروب داون الدرجة + سطر يشرح سلسلة كشوفه + دروب داون معتمد لكل مستوى مطلوب (مفلتر بالدرجة، ممنوع الحساب يعتمد لنفسه) + تحذير أحمر `.apr-miss` للمستوى الناقص |
| **مصفوفة "مين يعتمد لمين"** (2026-09-06) | `loadAprLevelsAdmin` (`_aprMeta`), `renderAprMatrix`, `aprMatrixToggle`, `aprMatrixSave` (بيحذّر بعدد الكشوف قيد المراجعة قبل الحفظ), `aprMatrixReset` — كارت "سلسلة الاعتماد حسب الدرجة" بخانات اختيار لكل درجة؛ المستوى اللي مش فوق الدرجة مقفول |
| **نشاط الحسابات** (2026-09-06) | `renderActivityTable`, `setActDays` (24س/7/14 يوم), `actVerdict`, `actErrMeaning` (ترجمة الخطأ لمعناه حسب الحساب), `actWhen`, `adminLoadActivity` (سجل الحساب الواحد), `adminSyncLine` (عدد السراكي على السيرفر + آخر إبلاغ مزامنة من الجهاز) |
| **كشوف الحساب + حذفها** (2026-09-05) | `adminLoadUserSubs`, `adminDeleteSubmission` — الحذف بقى للأدمن فقط (من كارت الحساب ومن تاب التسليمات بعرض الأدمن) |

### 5.15 تبويب الرئيسية (Home Dashboard) — أسطر 1559-1629 — **ميزة جديدة**
`renderHome` — ويدجت نشاط حديث + ملخص مهام سريع، أول شاشة تظهر بعد تسجيل الدخول.

### 5.16 تصدير Excel (سجلات) — أسطر 1630-1662
`exportExcel`.

### 5.17 تصدير PDF — أسطر 1663-1866
`exportPDF` — طباعة HTML إلى PDF (وليس مكتبة PDF حقيقية، ملاحظة من CHANGELOG لسه صحيحة).

### 5.18 كشف "السراكي المعتمد" — أسطر 1866-2237
| Feature | الدوال |
|---|---|
| بناء الشيت | `getWeekBoundsForDate`, `buildApprovedSheet`, `buildApprovedWorkbook` |
| تصدير | `exportApprovedExcel` |
| معاينة داخل التطبيق | `renderSheetHtml`, `argbToCss`, `colLetterToNum` — يعرض شكل ملف Excel كـ HTML قبل التصدير الفعلي. **(سبتمبر 2026)** الجدول `dir="ltr"` (العمود A يسار) عشان يُقرأ عربي صح ويطابق الشيت/الـ PDF، وصورة مرساتها جوّه خلية مدموجة بتتنسب للخلية الرئيسية (وإلا توقيعات المديرين ما كانتش بتترسم) |
| اختيار المقاول بدون chips | `syncExportChipsFromTopFilter`, `exportSelectionHint` — لو فيتشر `records_export_chips` معطّل للحساب، التصدير/الإرسال بياخد المقاول/المكان من الفلتر العلوي بدل ما يطلب حاجة مش ظاهرة |

> **بلوكات التوقيع في الكشف (الصف 16، عناوينها في الصف 17) — منذ 2026-09-05:** `A16` = توقيع مدير المشروع · `G16` = توقيع مدير التنفيذ · `J16` = توقيع مدير الفريق (كان "توقيع العامل"). السيرفر (`signStamp.ts`) بيتعرّف على البلوك من **نص العنوان** مش من ترتيب ثابت — فلو اتغيّر الترتيب هنا السيرفر بيتبعه، والملفات القديمة بتتختم صح برضو.

### 5.19 ورشة الاعتمادات (Submissions) — أسطر 2216-2431 (نسخة أغسطس) — **اتغيّر مسارها في سبتمبر 2026**
المهندس يرسل كشف "السراكي المعتمد" للمراجعة ويتبع حالته. **منذ 2026-09-03 الكشف بيعدّي أولًا على سلسلة "اعتمادات المديرين" داخل التطبيق (قسم 13)، وبس بعد اكتمالها بيتختم بتوقيعات المعتمدين ويتبعت لجوجل شيت.**

| المجموعة | الدوال |
|---|---|
| إرسال للمراجعة | `submitApprovedForReview`, `openSubmitReview`, `confirmSubmitApproved` (بيستخدم `_resendTargetId` لإعادة الإرسال على `/resend` بنسخة جديدة) |
| معاينة داخل مودال (Zoom) | `sheetZoom`/`sheetZoomReset`, `toggleSheetFull`, `closeSubmitReview` |
| Timeline الحالة | `sheetTimeline` (بيقرأ حالة الشيت الحية: الاعتماد الإداري / DC / سلسلة الاعتماد), `subRow` (بيعرض حالة السلسلة، سبب الرفض، وملاحظات "معتمد بملاحظات" في صندوق أصفر) |
| قائمة تسليمات المهندس | `renderMySubmissions`, `downloadSubmission(id, name, base)`, `resendSubmission` (بعد الرفض: يوجّه لتعديل السركي ثم إعادة الإرسال rev++), `resyncSubmission` ("☁️ إعادة الإرسال للشيت" لكشف `SENT` بلا `gsheetRow` → `/gsync`) |
| عرض الأدمن | `renderAdminSubmissions`, `setSubFilter`, `adminDeleteSubmission` (حذف نهائي — أدمن فقط). **`reviewSubmission`/`closeReviewModal` القديمتان موجودتان بلا استخدام** — الاعتماد بقى حصريًا من تاب اعتمادات المديرين، و`deleteMySubmission` اتشالت |

حالات `Submission.reviewState`: `IN_REVIEW` (عند المعتمد `currentLevel`/`currentApproverId`) → `RETURNED` (مرفوض — يرجع للمهندس) أو `SENT` (اكتملت السلسلة → ختم التوقيعات → الدفع لجوجل شيت). الحالة الحية من الشيت ("✅ معتمد بالكامل") بتتقرأ بعد كده عبر `googleSheet.ts` كما كان.

### 5.31 اعتمادات المديرين (وحدة `approvals`) — أسطر ~2775-3035 (نسخة 2026-09-06) — **جديدة**
تاب "📋 اعتمادات المديرين" — أونلاين فقط، بيظهر للحساب اللي مفعّل له الأدمن الوحدة. التصميم والقواعد في **قسم 13**.

| المجموعة | الدوال |
|---|---|
| الطابور والجدول | `renderApprovals` (`GET /api/approvals/levels` + `/queue`), `aprBuildTable` (يحفظ `scrollLeft` بين إعادات الرسم), `aprLevelCell` (✅/⏳ دورك/🔒 مقفول/`·` مش في سلسلته), `aprStatusCell` |
| التحديث | `aprAutoRefresh` (كل 20 ث والتاب ظاهر + عند الرجوع للتطبيق، بيتخطى لو فيه قرار مفتوح), `aprHardRefresh` (زرار "🔄 تحديث" = إعادة تحميل التطبيق والرجوع لنفس التاب عبر `sessionStorage.cea_reopen_tab`) |
| زوم الجدول (موبايل فقط ≤899px) | `aprTableZoom`, `aprTableZoomReset`, `aprTableApplyZoom` (CSS `zoom`، محفوظ في `cea_apr_zoom`) |
| المراجعة داخل التطبيق | `aprReview` (`GET /api/approvals/:id/file` — الأصل أثناء المراجعة، والنسخة **الموقّعة** بعد `SENT`), `aprOpenPreview`, `aprZoom`/`aprZoomReset`, `aprClosePreview` |
| القرار | `aprAsk` (يقرأ `isLast`/`isStuck`/`chain` من السيرفر لكل كشف), `aprOpenModal`/`aprCloseModal` (بيعيدوا تفعيل زرار التأكيد — كان بيفضل disabled), `aprConfirm` (`POST /api/approvals/:id/decide`), `aprTip` (`APR_TIPS`) |
| تنظيف العرض (أدمن) | `aprHideBtn`, `aprHide` (`POST /api/approvals/:id/hide` — يخفي الصف من الطابور فقط، للكشوف `SENT`/`RETURNED`) |

### 5.32 سركي المعدات (وحدة `equipment`) — بعد `resendSubmission` (نسخة 2026-09-06 مساءً) — **جديدة (منشورة ليلة 2026-09-06)**
تاب "🚜 سراكي معدات (شهري)": كشف تشغيل شهري (الشهر من 20 لـ 19) لمعدة مؤجّرة، أوفلاين-أولًا زي السراكي (`equipmentRecords` في `cea_equipment`). التصميم في **قسم 16**.

| المجموعة | الدوال |
|---|---|
| الشهر 20→19 | `getEqMonthBounds(offset)`, `getEqMonthBoundsForDate`, `eqMonthLabel`, `renderEqMonthNav`, `shiftEqMonth`, `resetEqMonth`, `eqSheetsCount` |
| الإعدادات (محلية) | `eqFixedContractor`/`eqApplyFixedContractor`/`eqSaveFixedContractor` (مقاول ثابت مقفول في الفورم), `eqCurrentSite`/`eqSiteOptions`/`eqCustomSites`/`eqAddSite`/`eqRemoveSite`/`eqSaveSite`/`eqLoadSiteNames` (الموقع في راس الكشف: اسما الموقعين من `/api/config` + مضاف على الجهاز), `renderEqSettings` — مفاتيح `cea_eq_contractor`/`cea_eq_site`/`cea_eq_sites` |
| الفورم/CRUD | `eqFillEquipment` (المعدة = تخصص المقاول، قراءة فقط), `saveEquipment` (اليوم من التاريخ، المدة `eqMinutes` — لو "إلى" أصغر من "من" = عدّى نص الليل), `clearEqForm`, `editEquipment`, `cancelEqEdit`, `deleteEquipment`, `eqRepeatLast`, `eqCalcDuration`, `eqSetDay`, `fmtMinutes` |
| السجل | `renderEquipment` (الشهر المعروض أو "📋 كل الشهور" `eqShowAll`/`toggleEqShowAll`، ملخص أيام/ساعات/ورقات، كروت), `eqMonthRecords(forSheet)`, بالخصم على: `eqAddDeductChip`/`eqRemoveDeductChip`/`eqSetDeductChips`/`eqRenderDeductChips` |
| الكشف | `buildEquipmentWorkbook`, `buildEquipmentSheet` (ورقة لكل 5 أيام تقويمية، نفس شبكة الـ 13 عمود وبلوكات التوقيع في الصف 16/17), `prepareEquipmentSheet` (الشهر المعروض، كل المعدات في ملف واحد — مجموعة ورقات لكل معدة), `previewEquipmentSheet`, `exportEquipmentExcel`, `submitEquipmentForReview`, `openEquipmentReview` (نفس مودال المراجعة) — الإرسال عبر `confirmSubmitApproved` مع `kind='equipment'` |
| المزامنة | `eqBody`, `mapApiEquipment` — `mirrorPushById('equipment', …, '/api/equipment-records')` في `syncNow`، سحب في `pullAll`، `SERVER_TO_LOCAL`، النسخة الاحتياطية/الاستعادة |

### 5.20 تصدير IR — أسطر 2432-2456
`exportIRExcel`.

### 5.21 إعادة التهيئة (Factory Reset) — أسطر 2456-2497
`clearAllData`, `clearAllIR`, `resetAllApp`.

### 5.22 المهام (Todo) — أسطر 2497-2624
`saveTodo`, `toggleTodo`, `editTodo`, `deleteTodo`, `renderTodo`, `exportTodoExcel`.

### 5.23 توقيع المهندس — أسطر 2625-2780
`renderSignatureSettings`, `processSignaturePhoto`, `clearSignature`.

### 5.24 التنقل بين الأسابيع — أسطر 2780-2840
`syncShowAllUI`, `toggleShowAll`, `getWeekBounds`, `toYMD`, `renderWeekNav`, `shiftWeek`, `resetWeek`.

### 5.25 تبويب "الموقف" — التقرير اليومي (صور) — أسطر 2840-3007
`switchSiteTab`, `saveDailyAll`, `autoSetDailyDay`, `autoFillDailySpec`, `compressImageFile` (ضغط الصور Canvas إلى 1280px/JPEG 72% — يمنع تخطي حد `localStorage`), `attachDailyPhoto`, `saveDailyRecord`, `renderDaily`, `openPhotoLightbox`.

### 5.26 تبويب "الموقف" — الموقف التنفيذي (نسب إنجاز) — أسطر 3007-3263
`saveExecAll`, `onExecItemChange`, `renderStageSliders`, `onStageDone`, `recalcExecTotal`, `getExecStagesSnapshot`, `updateExecPct`, `saveExecRecord`, `exportExecExcel`, `renderExec`, `initSiteTab`.

### 5.27 المصادقة (Auth — JWT من الـ Backend الجديد) — أسطر 3288-3450
`getCurrentUserEmail`, `getAccessToken`/`getRefreshToken`, `getUserRole`, `isAdmin`, `saveSession`/`clearSession`, `showLoginScreen`/`hideLoginScreen`, `api()` (طلب موحد fetch بتجديد تلقائي للتوكن عند 401)، `verifySession`, `tryRefreshSession`, `doLogin`, `doLogout`, `initAuthGate`, `onAuthReady`.

### 5.28 محرك المزامنة (Sync Engine) — أسطر 3452-4106
المبدأ: **أوفلاين أولاً** — localStorage مصدر الحقيقة المحلي، مزامنة mirror-sync تلقائية (debounce 3 ثواني بعد أي `saveAll`) + عند رجوع النت + زراير يدوية.

| المجموعة | الدوال |
|---|---|
| Snapshot/hash للمقارنة | `saveSyncSnap`, `snapOf`, `syncHash`, `isLocalId` |
| تحويل الأشكال (محلي↔API) | `recordBody`/`contractorBody`/`itemBody`/`todoBody`/`irBody`/`execBody`/`dailyBody`, `mapApiRecord` |
| الرفع والسحب | `fetchServerHashIndex`, `mirrorPushById`, `mirrorPushByName`, `uploadDailyPhotoIfNeeded`, `pushDailyRecords`, `pullManagedData`, `mergePullById`, `serverIsAuthoritative` |
| صلاحيات الأدمن في الدفع | `pushContractorsIfAdmin`, `pushPlacesIfAdmin` |
| التحكم العام | `syncNow`, `scheduleSync` (debounced), `pullAll`, `initialSync` |
| كود الجهاز/المزامنة | `generateDeviceCode`, `codeFromEmail`, `getDeviceCode`, `copySyncCode`, `copyTextToClipboard`/`legacyCopy` |
| واجهة الحالة | `setSyncStatus`, `syncUpload`/`syncDownload` |
| تحميل سجلات أقدم (pagination) | `localOldestDate`, `refreshServerOldest`, `hasOlderOnServer`, `loadOlderRecords`, `updateLoadOlderUI` |

قواعد مهمة: الـ id المحلي (`Date.now()` ≥ 10^12) بيتبدل بـ id السيرفر بعد أول رفع ناجح؛ الأماكن/المقاولون (حسب صلاحية الأدمن)/التوقيع/PIN بيانات مُدارة، تُسحب دائمًا من السيرفر كمرجع أساسي.

> **⚠ قواعد `mirrorPushByName` بعد إصلاحات 2026-08-31/09-01 (لا تُكسر عند أي تعديل):**
> 1. الحذف من السيرفر **فقط** للأسماء المعروفة في snapshot الجهاز (وإلا جهاز بنسخة قديمة يمسح إضافات الأجهزة الأخرى).
> 2. اسم محلي غير موجود على السيرفر وغير معدّل محليًا (بصمته تساوي الـ snapshot — مع قبول بصمة الشكل القديم `{name}`) = محذوف عن بُعد → يُحذف محليًا، **لا يُعاد رفعه**.
> 3. المقاولون/الاستشاريون/البنود بيتسحبوا دوريًا في `pullManagedData` **للجميع بمن فيهم الأدمن** مع تحديث الـ snapshots (`refreshNameSnap`).

> **(2026-09-06)** `pullAll` و`initialSync` ما بيطلبوش `/api/records` إلا لو `moduleEnabled('records')` — حساب معتمد بس (وحدة `approvals` فقط) كان بياخد 403 فتفشل المزامنة كلها برسالة "⚠ تعذر الاتصال بالسيرفر" المضللة؛ 403 بقى يعرض "✅ متزامن — الحساب ده مالوش سراكي". وبعد كل `syncNow` الجهاز بيبلّغ `POST /api/account/sync-stats` بعدد السراكي المحلية واللي لسه بمعرّف محلي — بتظهر للأدمن في كارت الحساب (`adminSyncLine`) وفي جدول النشاط.

### 5.29 دوال التوافق القديمة (Legacy Compat) — أسطر 4106-4146
`pushPlacesToCloud`, `pushContractorsToCloud`, `pushSignatureToCloud`, `pushPinHashToCloud`, `autoSyncReferenceData` — نفس الأسماء القديمة (وقت Supabase) لكن بمنطق الـ Backend الجديد داخليًا.

### 5.30 نسخ احتياطي/استعادة محلي (JSON) — أسطر 4146-4263
`backupData`, `applyRestoreData`, `restoreFromFile`, `restoreData` — يُصدّر كل الحالة المحلية كملف JSON (Capacitor Filesystem+Share على أندرويد، أو تنزيل Blob على الويب) ويستعيدها من ملف مُختار. **منفصلة تمامًا عن المزامنة السحابية** ولا تحتاج إنترنت.

---

## 6. بنية الواجهة (`index (17).html` — ~1,215 سطر)

### السكربتات
- سطر 16: كتلة inline تضبط `window.isCapacitor` وتطبّق كلاس `dark-boot` قبل أول رسم (منع وميض أبيض)
- سطر ~42: `capacitor.js` (خارجي، جزء من مشروع Android الأكبر)
- سطر ~1211 (آخر السطور): `app.js`
- كتلة inline بتضبط `window.CEA_API_URL` على localhost عشان الواجهة المحلية تكلم الـ Backend المحلي

### الشاشات/التابات الرئيسية (`<div id="...">`) — بترتيب الظهور في المستند

| ID | الدور | ملاحظة |
|---|---|---|
| `#splash` | شاشة البداية | |
| `#login-screen` (+`#login-error`) | تسجيل الدخول (إيميل/كلمة سر) | الآن عبر JWT من الـ Backend، وليس Supabase |
| `#offline-banner` | تنبيه انقطاع الاتصال | |
| `#drawer-scrim` + الـ Drawer | قائمة تنقل جانبية | **جديد** |
| `#tab-home` | لوحة الرئيسية — `#home-recent`, `#home-todos` | **جديد** |
| `#tab-admin` | لوحة الأدمن (أدمن فقط) — `#admin-submissions`, `#admin-users-list`, كارت **"📊 نشاط الحسابات"** (`#act-table`, `#act-count`, أزرار `.act-days`), كارت الحساب (`#admin-user-grade`, `#admin-grade-hint`, `#admin-user-approvers`, `#admin-user-modules`, `#admin-user-subs`, `#admin-user-activity`, `#admin-user-places`, `#admin-user-contractors`, `#admin-sig-preview`), كارت **"🖋️ سلسلة الاعتماد حسب الدرجة"** (`#apr-matrix`, `#apr-matrix-save`), كارت أسماء المواقع, `#admin-create-modules`, `#admin-created-box` | اتوسّعت في سبتمبر 2026 |
| `#tab-submissions` | تسليمات المهندس — `#my-submissions` | |
| `#tab-approvals` | اعتمادات المديرين — `#apr-myrole`, `.apr-zoom-bar` (موبايل فقط), `#apr-scroll` > `#apr-table`, ومودالات `#apr-modal` (القرار + `#apr-note`) و`#apr-preview-ov` (المعاينة) | **جديد (2026-09-03)** |
| شريط تابات سفلي (4 عناصر) | تنقل رئيسي سريع | **جديد** |
| `#tab-form` | فورم "سراكي" جديد — `#f-deduct-chips` | |
| `#tab-records` | قائمة السراكي — `#week-nav`, `#export-contractor-chips`, `#export-place-chips`, `#records-list` | |
| `#tab-ir` | طلبات الفحص — `#ir-list` | |
| `#tab-site` | تبويب "الموقف"، فيه تبويبين فرعيين: | |
| &nbsp;&nbsp;`#stab-daily` | التقرير اليومي — `#daily-photo-preview`, `#daily-list` | |
| &nbsp;&nbsp;`#stab-exec` | الموقف التنفيذي — `#exec-stages-wrap`, `#exec-stages-sliders`, `#exec-pct-fill`, `#exec-list` | |
| `#tab-todo` | المهام — `#todo-list` | |
| `#tab-summary` | الملخص — `#contractor-summary` | |
| `#tab-settings` | الإعدادات — مقاولون/أماكن/استشاريون/بنود، استيراد Excel، كارت إعدادات السركي الشهري (`#eq-settings`، لمن عنده وحدة المعدات)، حساب/مزامنة (`#account-email-display`, `#sync-project-code-display`, `#sync-status`, `#load-older-wrap`)، توقيع (`#sig-preview-wrap`, `#sig-empty-msg`) | |

---

## 7. بنية `style.css` (~713 سطر)

| القسم | الأسطر تقريبًا |
|---|---|
| Header banner (تعليق) | 3-54 |
| Base | 60 |
| Header | 75 |
| Sticky top (offline banner + tabs) | 100 |
| Settings toggle row | 106 |
| **شريط التابات السفلي** | 126 — **جديد** |
| **الـ Drawer الجانبي (RTL)** | 151 — **جديد** |
| **شاشة الرئيسية (Home)** | 207 — **جديد** |
| Layout + `.section-title` | 249, 272 |
| Forms | 275 |
| Buttons | 305 |
| Toast | 331 |
| Records | 343 |
| Filters / بحث | 396 |
| Week navigator | 415 |
| Edit banner | 429 |
| Sub-tabs (site) | 436 |
| Summary | 441 |
| Settings | 460 |
| IR status | 488 |
| Exec | 494 |
| To-Do | 512 |
| Splash | 526 |
| Login | 538 |
| PIN modal | 551 |
| Misc | 560 |
| Collapsible chips summary | 571 |
| **مودال عام (مراجعة الاعتمادات)** | 574 — **جديد** |
| **معاينة شيت Excel داخل التطبيق** | 586 — **جديد** |
| **أدوات تكبير/ملء الشاشة للمعاينة** | 612 |
| **اعتمادات المديرين** (`.apr-*`: الجدول، العمود الأخير sticky، شريط الزوم للموبايل، توسيع التاب لـ 1400px على الكمبيوتر، `.apr-hide`) | 619 — **جديد (سبتمبر 2026)** |
| **المخازن** (`.inv-*` بروح Sortly) | 651 — **جديد** |
| **مصفوفة السلسلة + تحذير المعتمد الناقص + جدول نشاط الحسابات** (`.apr-mx-*`, `.apr-miss`, `.act-table` بعمود أول sticky وترويسة لاصقة، `.act-scroll` بارتفاع ~3 حسابات) | 686 — **جديد (سبتمبر 2026)** |

> نما الملف من 440 سطر إلى ~713 سطر: الـ Drawer، شريط التابات السفلي، الرئيسية، مودال المعاينة، ثم المخازن واعتمادات المديرين وجدول النشاط. (أرقام الأسطر للأقسام القديمة أزيحت ~+15 عن الجدول الأصلي.)

---

## 8. الـ PWA (Progressive Web App)

| الملف | الدور |
|---|---|
| `manifest.webmanifest` | اسم "CEA – Civil Engineer Assistant"، عربي/RTL، `display: standalone`، لون الثيم navy (#173058)، 3 أيقونات |
| `sw.js` | Service Worker — cache باسم `cea-v1` يشمل HTML/JS/CSS/manifest/أيقونات/مكتبتي Excel. **استراتيجية مزدوجة (تحديث 2026-08-21):** ملفات الكود (index.html/app.js/style.css + أي طلب navigate) **network-first** عشان أي نشر جديد يوصل فورًا والكاش احتياط أوفلاين فقط؛ الأصول الثابتة (أيقونات/مكتبات) stale-while-revalidate؛ وتمرير مباشر (network-only) لأي طلب cross-origin (يعني طلبات الـ API لا تُكاش أبدًا). **(2026-09-03)** `lib/*.js` ما يتخزّنش في الكاش إلا لو رد الشبكة content-type جافاسكريبت حقيقي — قبل كده نسخة تالفة/HTML كانت بتفضل تتقدّم من الكاش وتطلع "ExcelJS is not defined" |
| `icons/` | icon-192.png, icon-512.png, icon-maskable-512.png |
| `make-icons.js` | يولّد الأيقونات الثلاث من الصفر (PNG encoder يدوي، بدون مكتبات) — دائرة navy بحلقة ذهبية وحرف "CEA" |
| `build-pwa.js` | يبني `pwa-dist/`: ينسخ ويعيد تسمية `index (17).html` → `index.html`، ينسخ app.js/style.css/manifest/icons/lib، يضخ رقم إصدار cache جديد داخل `sw.js`، ويكتب ملف `_headers` لـ Cloudflare Pages (رؤوس أمان + CSP + منع cache على sw.js). **CSP بيسمح بـ `'unsafe-eval'` في `script-src` منذ 2026-09-03** — ExcelJS 4.3 بتعمل eval عند التحميل ومن غيره التصدير المعتمد والإرسال بيفشلوا (حصل فعليًا بعد النشر) |
| `dev-server.js` | سيرفر تطوير محلي (بورت 5173) يخدم `index (17).html` كجذر، مع live-reload عبر SSE عند تعديل الملفات، وendpoint تصحيح `/__save` يكتب `debug-out.xlsx` |

---

## 9. Backend — `backend/` (Node/TypeScript/Express/Prisma/MySQL)

يستبدل Supabase بالكامل؛ الواجهة لا تتحدث مع قاعدة البيانات مباشرة أبدًا، فقط عبر هذا الـ API الموثّق بـ JWT.

### 9.1 نموذج البيانات (Prisma — 26 جدول)
`User` (role ADMIN/ENGINEER، title، project [سكني/تجاري]، site [1/2]، lastSeenAt، **`grade`** [junior/senior/team leader/construction manager/project manager — NOT NULL افتراضي junior]، **`approverTlId/approverCmId/approverPmId`** [المعتمد المسند بالاسم لكل مستوى، FK بـ SET NULL]، **`syncLocalRecords/syncUnsynced/syncReportedAt`** [إبلاغ الجهاز])، `RefreshToken`، `PasswordResetToken`، `AccountSettings` (PIN hash، ملف التوقيع، `enabledModules`/`enabledFeatures`)، `Contractor`، `Place` (+note)، `Inspector`، `Item`+`ItemStage`، `Record`+`RecordDeduction`، `IrRecord`، `Todo`، `ExecRecord`+`ExecRecordStage`، `DailyRecord`، `File`، `AppConfig` (key/value — أسماء المواقع، وحدات/فئات المخازن، **`approvalMatrix`**؛ `value` اتوسّع لـ 1000 حرف)، `Submission` (site، gsheetRow، **`kind`** labor/equipment، **`revision`**، **`reviewState`** IN_REVIEW/RETURNED/SENT، **`currentLevel`**، **`currentApproverId`** [null = كشف قديم: أي معتمد بدرجة المستوى]، **`queueHiddenAt`**)، **`SubmissionReview`** (level، decision APPROVED/APPROVED_NOTES/REJECTED، note، revision، byUserId — سجل تدقيق كامل)، **`EquipmentRecord`** (contractor، equipment، place، day، date، timeFrom/timeTo، minutes [من السيرفر]، works، notes، deductOn [JSON أسماء]، deductNote)، **`ActivityLog`** (userId/email/event/detail/status/path/ip/device)، وجداول المخازن الخمسة (`InventoryItem`، `StockMove`، `IssueRequest`+`IssueRequestLine`، `PurchaseRequest`).

Migrations بعد 2026-09-01 (كلها مطبّقة إنتاجًا): `20260903120000_manager_approvals` · `20260903150000_backfill_review_state` (حرجة: الكشوف القديمة → `SENT`) · `20260905000000_user_sync_stats` · `20260905010000_submission_queue_hidden` · `20260905120000_grade_and_assigned_approvers` · `20260906150000_activity_log` · `20260906170000_appconfig_wider_value` · **`20260906200000_equipment_records`** (منشورة ليلة 2026-09-06).

### 9.2 أهم نقاط النهاية (Endpoints)
- **Auth**: register/login/refresh/logout/me/change-password — **مسارا `password-reset/*` مُعطَّلان عمدًا منذ 2026-08-21** (كانا يعيدان التوكن في الاستجابة بدون مصادقة = استيلاء على أي حساب — انظر C1 في `SECURITY_REPORT.md`؛ البديل الآمن: `POST /api/admin/users/:userId/reset-password`) — JWT (15 دقيقة access + 30 يوم refresh دوّار مع كشف إعادة استخدام يُلغي كل الجلسات)، bcrypt 12 rounds. **مهلة سماح (grace window)** — env: `REFRESH_REUSE_GRACE_SEC` (افتراضي 120 ثانية): إعادة استخدام توكن أُلغي بسبب تدوير عادي (`rotated=true` في جدول `refresh_tokens`) داخل المهلة تُقبل وتصدر توكنات جديدة بدل اعتبارها سرقة — يمنع خروج المستخدم القسري عند سباق تبويبين أو انقطاع حفظ التوكن الجديد. التوكنات الملغاة أمنيًا (logout/تغيير كلمة سر) لا تستفيد من المهلة أبدًا.
- **CRUD كيانات (مقيدة بالملكية)**: `/api/contractors`, `/api/places` (كتابة للأدمن فقط), `/api/inspectors`, `/api/items` (مع مراحل متداخلة), `/api/records` (صفحات، فلاتر، الإجمالي يُحسب على السيرفر), `/api/ir-records`, `/api/todos`, `/api/exec-records`, `/api/daily-records` (رفع صور), `/api/files`, `/api/account/settings` (PIN/توقيع — قراءة فقط للمهندس، كتابة للأدمن).
- **`/api/admin/*`** (أدمن فقط): `GET /users` (بيرجع كمان `recordsCount`، إحصاءات المزامنة، `missingApprovers`)، `POST /users` (إنشاء بـ site/project)، `PATCH /users/:userId` (title/role/project/site + **`grade`** + **`approverTlId/CmId/PmId`** مع تحقق: المعتمد لازم درجته = المستوى وممنوع يعتمد لنفسه)، `GET /users/:userId/summary`، `DELETE /users/:userId`، `POST /users/:userId/reset-password`، أماكن/مقاولين لكل مستخدم + `copy-mine` للاتنين، `GET/PUT /users/:userId/settings`، `GET/PATCH /config` (أسماء المواقع)، `GET /modules`، `GET /backup-status` + `POST /backup-now`، **`GET /approval-levels`** (`{grades, levels, matrix, approvers, solePmId}`)، **`GET/PUT /approval-matrix`** (الـ GET بيرجع `inReview` للتحذير قبل الحفظ)، **`GET /activity?userId=|email=`** و**`GET /activity/summary?days=`** (كل الحسابات في استعلامين مجمّعين).
- **`/api/approvals/*`** (خلف `requireModule('approvals')`): `GET /levels`، `GET /queue` (منذ 2026-09-07: **كل الكشوف لكل من عنده الوحدة** — IN_REVIEW + آخر 7 أيام SENT/RETURNED؛ كل صف بيرجع `chain`/`isLast`/`isStuck`/`canAct` — و`canAct` هو اللي محصور على المعتمد المسند/الأدمن/الكشف القديم بمستوى درجته)، `GET /:id/file` (لأي حساب عنده الوحدة — قرار 2026-09-07: الرؤية للجميع والاعتماد للمسند فقط؛ الأصل أثناء المراجعة والنسخة **الموقّعة** بعد `SENT`)، `POST /:id/decide` (APPROVED/APPROVED_NOTES/REJECTED — الرفض بملاحظة إلزامية)، **`POST /:id/rows/reject`** (شطب سطر: {sheetIndex,row,label,note} — نفس صلاحية decide، بلا إلغاء، شطب الكل = رفض كامل تلقائي)، `POST /:id/hide` (أدمن: إخفاء من الطابور فقط).
- **`/api/submissions/*`**: `POST /` (multipart) → يُخزَّن ويبدأ `startChain` قبل الرد (لو مفيش مستويات مطلوبة لدرجته → يتبعت للشيت فورًا)؛ `POST /:id/resend` (للمرفوض فقط، rev++ والسلسلة من أولها)؛ `GET /mine` (بحالة السلسلة + `reviews` + حالة الشيت الحية)؛ `GET /` للأدمن (+ فلتر `?userId=` و`status`)؛ `GET /:id/file` (المالك أو الأدمن)؛ `PATCH /:id/review` (قديم، بلا استخدام من الواجهة)؛ `POST /:id/gsync` (إعادة الدفع عبر `approvalChain` — بيختم التوقيعات كمان)؛ **`DELETE /:id` أدمن فقط لأي حالة** (منذ 2026-09-05 — cascade على `submission_reviews`؛ صف الشيت لو وصل بيفضل).
- **`/api/account/*`**: `GET/PUT /settings` (الكتابة أدمن فقط)، **`POST /sync-stats`** (الجهاز بيبلّغ عدد السراكي المحلية واللي لسه ما اترفعش — بيتسجل كمان كحدث `SYNC` في سجل النشاط).
- **`/api/equipment-records`** (خلف `requireModule('equipment')`): CRUD عبر `crudRouter` مقيّد بالملكية؛ `minutes` تُحسب على السيرفر من `timeFrom/timeTo` وأي قيمة مُرسلة تُتجاهل. و`POST /api/submissions` بيقبل `kind` (labor|equipment).
- `requireModule` middleware يفرض نفس تقييد الموديولات على مستوى السيرفر لمسارات records/submissions/ir/todo/exec/daily/inventory/approvals/equipment.

### 9.3 الخدمات (Services)
| الخدمة | الدور |
|---|---|
| `googleSheet.ts` | يستدعي Google Apps Script Web App لدفع الكشوف (الملف الموقّع + اسم المهندس + نوع المشروع + `approvalSummary`) وجلب حالتها الحية — **بيدعم موقعين**: الموقع 1 عبر `GOOGLE_WEBAPP_URL`/`GOOGLE_WEBAPP_SECRET` والموقع 2 عبر `GOOGLE_WEBAPP_URL_2`/`GOOGLE_WEBAPP_SECRET_2`؛ الميزة تُعطَّل تلقائيًا لكل موقع غير مضبوط. التوجيه حسب `Submission.site` (المُثبَّت من `User.site` وقت الإنشاء) |
| `backup.ts` | يُصدّر قاعدة البيانات كاملة (كل الجداول شاملًا `app_config` والمخازن) كـ JSON إلى Google Drive، جدولة يومية بعد 3 صباحًا UTC + زر يدوي، وآخر نتيجة بتتسجل في `app_config` وتُقرأ من `GET /api/admin/backup-status`. **الاستعادة الكاملة:** `scripts/restore-backup.ts` (مُختبر end-to-end) |
| `storage.ts` | تجريد تخزين ملفات محلي على القرص (`StorageAdapter` — جاهز للاستبدال بـ S3/R2)، أسماء عشوائية في فولدرات شهرية، محمي من path-traversal |
| **`approvalChain.ts`** (2026-09-03→06) | سلسلة اعتمادات المديرين: `GRADES`/`APPROVING_GRADES`، المصفوفة (`loadApprovalMatrix` عند الإقلاع + كاش في الذاكرة، `setApprovalMatrix`، `normalizeChain` بيفرض ترتيب السلم)، `requiredLevelsFor`، `buildChain`/`resolveChainForUser` (سلسلة الكشف نفسه: مستوى + الشخص المسند، ومستوى بلا شخص يتخطى، `soleProjectManagerId` تلقائي)، `nextLevel` → `{next|done|stuck}`، `startChain`، `collectSignatures` (آخر اعتماد لكل مستوى في النسخة الحالية → توقيع صاحبه من `UserSettings.signatureFileId`)، `signedFileBuffer`، `approvalSummary` (سطر لكل قرار → عمود G في الشيت)، `pushSubmissionToSheet` (ختم ثم دفع — **فشل الختم مايوقفش الدفع**) |
| **`rowReject.ts`** (2026-09-07) | شطب سطر من الكشف (رفض جزئي): `applyRowRejections` بيعدّل xlsx بمعرفة تخطيط الكشف (خط أحمر + تصفير + السبب في الملاحظات + إعادة حساب إجمالي الورقة/الشهر)، `countDataRows` لتحديد "كل السطور اتشطبت". بيتطبق في `/approvals/:id/file` أثناء المراجعة وفي `signedFileBuffer` قبل الختم، والملخص بيذكره في الشيت |
| **`signStamp.ts`** (2026-09-05) | exceljs 4.4: `stampSignatures(buffer, sigs)` بيلزق توقيع كل مستوى في بلوكه على **كل أوراق المصنّف**؛ `blocksForSheet` بيتعرّف على البلوك من نص عنوان الصف 17 (بيعرف كمان عناوين كشف المعدات: "مهندس التنفيذ" = construction manager، "المشرف المسئول" = بلوك المهندس فلا يُختم عليه، ومستوى بلا بلوك يُتخطى)؛ `fitInBlock` بيحافظ على نسبة الصورة (≤50% عرض البلوك، ≤58% ارتفاع الصف، متوسّطة) ويكتب المرساة بصيغة `nativeCol/Off` بالـ EMU الصح (المرساة الكسرية في exceljs بتتحوّل غلط). الملف الأصلي في التخزين ما بيتغيرش — الموقّع نسخة عابرة |
| **`activityLog.ts`** (2026-09-06) | `logActivity` (مغلّفة بـ try/catch كامل — ممنوع تعطّل أي طلب) بتُستدعى من `auth.controller.login` (نجاح/فشل بالإيميل)، `errorHandler` (أي 4xx/5xx بهوية صاحب الطلب، مع فلتر ضوضاء 401 على refresh/login)، و`account/sync-stats`؛ `scheduleActivityCleanup` يحذف الأقدم من 14 يوم يوميًا |

### 9.4 الأمان
Helmet، CORS مقيّد بـ `CORS_ORIGIN`، rate limiting عام + أشد على مسارات auth، تحقق Zod على كل المدخلات، Prisma parameterized queries (بدون SQL خام)، تخزين الـ refresh tokens كـ hash، رسائل خطأ موحّدة بدون stack traces، الملفات تُخدَم فقط عبر endpoint موثّق ومقيّد بالملكية (بدون static serving مباشر).

---

## 10. تكامل Google Sheets — `google-sheet/Code.gs`

Google Apps Script منشور كـ Web App تحت حساب جوجل الخاص بالأدمن. **النسخة في الريبو (5 سبتمبر 2026 وبعده) لسه محتاجة لصق يدوي في محرر Apps Script** (استبدال الكود → Deploy → Manage deployments → New version → تشغيل `applyNewDesign` مرة). `Code-site2.gs` (أزاليا) **لم يُحدَّث** بأي من تغييرات سبتمبر بقرار صاحب المشروع.

**مسارا الدخول (`processNewSubmission(engineerName, fileUrl, project, approvalSummary, signed)`):**
1. **من التطبيق (`doPost` → `signed=true`):** الملف بيوصل **موقّعًا بالكامل** (توقيعات المعتمدين اتختمت في السيرفر) → صف جديد + تحويل الملف لشيت (`prepareApprovalSlots` بيفضّي A16/G16/J16 قبل التحويل، والتحويل بيحافظ على الصور) → خانة F تُختم `✅ معتمد بالكامل` وتُقفل (`sealAdminApproval` — بيشيل قاعدة التحقق الأول لأن `setValue` كان بيترفض على خانة "مقفولة") → G = `approvalSummary` (سطر لكل اعتماد + `fitApprovalChainRow`) → **PDF يتولّد فورًا** في فولدر DC والحالة "معتمد بالكامل ✅" (لو الـ PDF فشل: الحالة "⚠ اتحوّل بس الـ PDF فشل" والملف المحوّل موجود).
2. **من Google Form (`onFormSubmitHandler` → `signed=false`) — 🆘 مسار الطوارئ:** الصف يوصل "بانتظار DC" بخانة F فاضية، والـ DC يختار ✅ في خانة D → `onEditHandler` ينزّل توقيعي مدير التنفيذ (حسب سكني/تجاري عبر `execSignatureIdFor`) ومدير المشروع من صور Drive الثابتة في `CONFIG` على A16/G16، يختم F، ويولّد الـ PDF. توقيع مش مضبوط أو اتمسح من Drive بيتخطى بدل ما الاعتماد يتكسر. **`onEditHandler` ومفاتيح التوقيعات في `CONFIG` لازم يفضلوا — دول خطة الاسترجاع (قسم 15).**

**الأعمدة (`COLS`) بعد إعادة التعريف (نفس الترتيب، معانٍ جديدة):** A اسم المهندس · B تاريخ الإرسال · C ملف السركي · **D اعتماد DC** (الزرار الواحد — بيخرج فورًا على أي صف حالته DONE) · **E ملاحظات DC** · **F الاعتماد الإداري** (تلقائي من التطبيق) · **G سلسلة الاعتماد** · H الحالة · I السراكي بعد الاعتماد (الشيت المحوّل) · J PDF النهائي · K سكني/تجاري. الحالات: "بانتظار DC" (ابتدائية لصفوف الفورم) · "معتمد بالكامل ✅" · "مرفوض من DC" (+ الحالات القديمة للتوافق).

**أوامر القائمة "⚙ أدوات السراكي":** `applyNewDesign` (إعادة تطبيق التصميم/العناوين/الأقفال بلا مساس بالبيانات) · **`finalizeSignedRow`** (صف وصل موقّعًا من التطبيق لكن السكربت القديم كان شغال وقتها فوقف "بانتظار DC" → PDF بلا توقيعات Drive مكررة) · `reformatApprovalChainColumn` (مرة واحدة: G القديمة من " | " لسطر لكل اعتماد) · إخفاء/إظهار بيانات الأسبوع.

يعالج أيضًا أكشن `backup` القادم من `backup.ts` لحفظ نسخة قاعدة البيانات في Drive، وحالة كل صف بتُقرأ من التطبيق عبر `fetchSheetStatuses` (كاش 60 ث في `googleSheet.ts`).

---

## 11. ملاحظات للمرجعية المستقبلية

- **(2026-09-01) وحدة المخازن — مكتملة محليًا وغير منشورة عمدًا** — التفاصيل الكاملة في **قسم 12** بالأسفل، وخطوات نشرها في [DEPLOY-NEXT-RELEASE.md](DEPLOY-NEXT-RELEASE.md).
- **(2026-09-03 → 06) وحدة "اعتمادات المديرين" + الدرجات + التوقيعات داخل التطبيق — منشورة بالكامل** — التوثيق البنيوي في **قسم 13** بالأسفل، والسرد الزمني والقرارات في [SESSION-LOG.md](SESSION-LOG.md) أقسام 9–13 (ابدأ من هناك في أي جلسة جديدة).
- **(2026-09-06) متبقٍ يدويًا عند صاحب المشروع:** لصق `google-sheet/Code.gs` في Apps Script للموقع الأول (لحد ما يتلصق: الصفوف الجديدة بتوصل موقّعة وبتقف "بانتظار DC" — تتخلّص بأمر `finalizeSignedRow` أو بلصق السكربت)، رفع توقيع كل معتمد من كارت حسابه، وإسناد المعتمدين لكل حساب (قبلها أي كشف جديد بيتخطى مدير الفريق ومدير التنفيذ ويروح لمدير المشروع مباشرة).
- **(2026-09-05) مسار الطوارئ:** [RECOVERY-PLAN.md](RECOVERY-PLAN.md) بيعتمد على بقاء `onEditHandler` ومفاتيح التوقيعات في `CONFIG` داخل `Code.gs`، وتريجر الفورم، وزرار الفورم (`gform_site1/2`) ظاهر للمهندسين — ما تشيلش أي منها.
- **(2026-09-03) الواجهة في git:** ريبو بجذر المشروع (بلا remote). لو عايز نسخة على GitHub: `git remote add origin ...` ثم `git push -u origin main`. الـ backend ريبو مستقل جوه `backend/` (على GitHub).

- **(2026-08-26) دعم موقعين/مشروعين منفصلين تمامًا — مُنفَّذ:** البرنامج بقى يخدم مشروعًا ثانيًا منفصلًا (مش السكني/التجاري — دول نوعان داخل المشروع الأول نفسه)، لكل موقع Google Sheet وApps Script ومدير تنفيذ/مدير مشروع مختلفون:
  - `User.site` (1 افتراضي / 2) يحدده الأدمن من لوحة الإدارة (دروب داون "الموقع" + `adminSaveSite` في app.js، وشارة "🏗️ الموقع الثاني" في قائمة الحسابات).
  - `Submission.site` يتثبّت وقت الإنشاء (عشان لو المهندس اتنقل موقع، متابعة حالة تسليماته القديمة تفضل صح — `gsheetRow` رقم صف داخل شيت موقعه).
  - `googleSheet.ts`: خريطة مواقع — الموقع 1 = `GOOGLE_WEBAPP_URL/SECRET`، الموقع 2 = `GOOGLE_WEBAPP_URL_2/SECRET_2` (لو فاضيين، تسليمات الموقع 2 محلية فقط، fail-safe). `fetchStatusesBySite` يجمع الصفوف حسب الموقع ويسأل كل Web App مرة واحدة، بمفتاح `site:row` لأن أرقام الصفوف بتتكرر بين الشيتين.
  - النسخ الاحتياطي للقاعدة (`backup.ts`) بيروح دائمًا لموقع 1 (قاعدة واحدة مشتركة).
  - **إجراء التشغيل للموقع الثاني (يدوي، مرة واحدة):** نسخ الشيت + نسخ `Code.gs` في مشروع Apps Script جديد بإعداداته (معرّفات الشيت/الفولدرات + صور توقيع مديري الموقع الثاني) + نشره كـ Web App وضبط `GOOGLE_WEBAPP_URL_2/SECRET_2` في env — ولو فيه Google Form، نسخة فورم مربوطة بالشيت الجديد (سؤال سكني/تجاري اختياري — `DEFAULT_PROJECT` بيغطي غيابه).
  - **أسماء المواقع قابلة للتعديل:** جدول `app_config` (key/value) — الافتراضي: الموقع 1 "كومباوند جريني"، الموقع 2 "أزاليا". `GET /api/admin/config` + `PATCH /api/admin/config` (أدمن) و`GET /api/config` (أي مستخدم مسجّل). كارت "🏗️ أسماء المواقع" في لوحة الأدمن، والأسماء بتظهر في كل دروب داون موقع وشارة المستخدمين.
  - **إنشاء الحساب:** دروب داون الموقع + نوع المشروع (سكني/تجاري) اتضافوا لفورم إنشاء الحساب (مش بس شاشة التعديل) — `POST /api/admin/users` بيقبل `site` و`project`.
  - **زرار Google Form حسب الموقع:** زرارين في تاب الاعتمادات (`gform-btn-1/2` — جريني: forms.gle/VjYxT2BkGj8UdkPY8، أزاليا: forms.gle/58VnYeRS69DgctbQ8). الظهور بيتحكم فيه الأدمن من قائمة "الوحدات الظاهرة له" عبر فيتشرين جديدين `gform_site1`/`gform_site2` (labels بتتبع أسماء المواقع تلقائيًا). حسابات قديمة قايمة فيتشرزها متحفوظة من قبل إضافة المفاتيح دي بترجع تلقائيًا لموقع المهندس (`site` من `/api/auth/me` المتخزن في `cea_user_site`) لحد أول حفظ من لوحة الأدمن. الأدمن بيشوف الزرارين دايمًا بأسماء المواقع.
  - Migrations: `20260826210000_user_submission_site`, `20260826230000_app_config`. (أثناء تطبيقها اتحلّت migration فاشلة معلّقة من 2026-08-25 اسمها `add_chat_messages` — كانت من تجربة شات جرت على نسخة المشروع في بارتشن D لكن ضربت قاعدة `cea` المحلية **المشتركة** بين النسختين. اتمسحت نهائيًا يوم 2026-08-26: جدول `chat_messages` وسجلات الـ migrations بتاعته اتشالوا من `cea` و`cea_test`، والإنتاج لم يتأثر بها إطلاقًا — تم التحقق من `_prisma_migrations` على Railway قبل النشر.)
- **(2026-09-07)** أنواع الكمية أربعة في الطرفين: يومية · ساعة · مقطوعية · **عدد** (enum `RateType` بـ `COUNT`) — أي خيار جديد في `f-qty-type` لازم يتضاف في `rateType.ts` والـ enum والـ migration معًا، وإلا السجلات بتترفض بـ 400 بصمت عند المهندس (درس قسم 17 في SESSION-LOG).
- كل الحسابات المالية (qty × price − discount = total) تعيش فقط داخل `calcTotal`/`saveRecord` — أي إعادة تنفيذ لهذا المنطق (في الـ Backend مثلاً) يجب أن يطابقها تمامًا.
- ميزة النسخ الاحتياطي/الاستعادة المحلية (قسم 5.30) **منفصلة تمامًا** عن المزامنة السحابية ويجب عدم الخلط بينهما عند أي إعادة تصميم.
- ورشة الاعتمادات (قسم 5.19) تعتمد على توفر `GOOGLE_WEBAPP_URL`/`GOOGLE_WEBAPP_SECRET` في env الـ Backend — بدونها الميزة تتعطل تلقائيًا (fail-safe، وليس crash). سلسلة اعتمادات المديرين (قسم 13) مستقلة عن ده: بتشتغل حتى لو الشيت معطّل، والدفع للشيت fire-and-forget بعد اكتمالها مع زرار "☁️ إعادة الإرسال للشيت" لو فشل.
- نظام الموديولات/الصلاحيات (قسم 4) مفروض على مستويين (واجهة + سيرفر) — أي تعديل مستقبلي على تابات جديدة لازم يُضاف في الاثنين معًا (`ALL_MODULES` في app.js **و** middleware `requireModule` في الـ backend) وإلا هيبقى فيه ثغرة صلاحيات.
- ملفات `app.js.pre-submit.bak` و`app.js.supabase.bak` هما لقطات تاريخية لأغراض الرجوع فقط — لا تُستدعى من أي مكان في التطبيق الحي، وممكن حذفهما بأمان لو مفيش حاجة تانية بتعتمد عليهم.
- `debug-out.xlsx` و`debug-x/` ملفات/فولدرات تطوير مؤقتة (من `dev-server.js`) — مش جزء من بيانات أو منطق التطبيق.

---

## 12. وحدة المخازن (Inventory) — منشورة منذ 2026-09-03 (مخفية حتى يفعّلها الأدمن)

مخزن واحد مشترك، **أونلاين فقط** (بيانات مشتركة حية — عكس باقي النظام الأوفلاين-أولاً، وده قرار تصميم مقصود). التصميم والقرارات في [ROADMAP-INVENTORY.md](ROADMAP-INVENTORY.md)، والنشر في [DEPLOY-NEXT-RELEASE.md](DEPLOY-NEXT-RELEASE.md).

### القاعدة الذهبية
**الكمية (`qty`) لا تُعدَّل مباشرة أبدًا** — كل تغيير يمر عبر حركة في `stock_moves` (وارد IN / صرف OUT / تسوية جرد ADJUST بسبب إلزامي) داخل transaction، والصرف مشروط بـ `qty >= المطلوب` على مستوى القاعدة (`updateMany` شرطي — طلبان متزامنان على آخر كمية: واحد فقط ينجح). دفتر الحركات = سجل تدقيق كامل (مين/امتى/ليه).

### الجداول (migrations: `inventory_module` + `inventory_category`)
`InventoryItem` (code فريد لكل site، name، unit، category، qty، minQty) · `StockMove` · `IssueRequest` + `IssueRequestLine` (حالات: SUBMITTED→APPROVED→FULFILLED / REJECTED) · `PurchaseRequest` (بلقطة `qtyAtRequest` وقت الطلب — تفضل ثابتة مهما اتغير المخزون).

### الـ API — `/api/inventory/*` (خلف `requireModule('inventory')`؛ الكتابة والاعتماد والصرف أدمن فقط)
- `items` (GET/POST/PUT) + `items/import` (استيراد جماعي، يتخطى الأكواد الموجودة) + `items/:id/move` (IN/ADJUST) + `items/:id/moves` (آخر 50 حركة)
- `issue-requests` (إنشاء — يُرفض فورًا لو الكمية غير كافية برسالة توجيه لطلب الشراء / review / **fulfill** = الخصم الذري / حذف للمُرسَل فقط)
- `purchase-requests` (إنشاء بلقطة الكمية / تغيير الحالة OPEN→PURCHASED/CANCELLED)
- `units` و`categories`: قائمة أساسية + إضافات الأدمن (CSV في `app_config`)

### الواجهة — تاب "📦 المخازن" (تصميم بروح Sortly بعد معاينة معتمدة)
تبويبات فرعية (المخزون | طلب صرف | الطلبات بعدّاد أحمر | الشراء) · 3 بطاقات ملخص · كارت "⚠️ محتاج إعادة طلب" بأزرار تحويل سريع لطلب شراء · كروت أصناف (كمية كبيرة ملونة، زرار ⋯ لأفعال الأدمن) · فلترة بالفئات + بحث · مودال إضافة/تعديل · زرار استيراد Excel (أعمدة بالاسم: الكود/الاسم/الوحدة/الفئة/الكمية/حد الطلب).

### الاختبارات — `tests/inventory.test.ts` (11 اختبار؛ إجمالي المشروع 84 في 2026-09-06)
حماية الوحدة، الكود الفريد، الحركات وسبب التسوية الإلزامي، رفض الكمية غير الكافية، دورة الصرف كاملة، **الفشل الذري بدون خصم جزئي** لو بند واحد نقص بعد الاعتماد، عزل طلبات المهندس، لقطة طلب الشراء، الاستيراد الجماعي، صلاحيات الوحدات والفئات.

### قرارات مسجلة
مخزن واحد حاليًا (حقل `site` جاهز للمستقبل ومُتجاهل) · الأدمن هو أمين المخزن في الـ MVP · طلب أكبر من المتاح = رفض فوري + توجيه لطلب شراء أو التواصل مع مدير التنفيذ · الوحدة **مش في `DEFAULT_MODULES`** — أي نشر لن يُظهرها لأحد حتى يفعّلها الأدمن حسابًا بحساب.

---

## 13. اعتمادات المديرين (Approvals) + الدرجات + التوقيعات داخل التطبيق — منشورة (2026-09-03 → 06)

> السبب: مدير المشروع لاقى جوجل شيت معقّدًا، وAppSheet اترفض (التريجرات ما بتشتغلش مع كتابة API + الخصوصية + اشتراك مدفوع). القرار: **المراجعة والاعتماد والتوقيعات كلها جوّه تطبيق CEA**، وجوجل شيت بقى مخزن + PDF فقط. "اعتماد DC" مكنش خطوة موافقة أصلًا (تصريح صاحب المشروع) — كان حيلة لإنزال التوقيعات والـ PDF من الشيت.

### 13.1 المسار الكامل لكشف واحد
1. المهندس يبعت الكشف من "السراكي" → `POST /api/submissions` → `startChain` يبني **سلسلة الكشف** من درجة صاحبه (المصفوفة) + المعتمدين المسندين له بالاسم. مستوى بلا شخص مسند **يتخطى**؛ مفيش مستويات مطلوبة → يتبعت للشيت فورًا (fallback آمن).
2. الكشف `IN_REVIEW` عند `currentLevel`/`currentApproverId`. المعتمد يشوفه في تاب "📋 اعتمادات المديرين" (تحديث تلقائي كل 20 ث)، يراجعه جوّه التطبيق (نفس محرك معاينة الكشوف)، ويقرر: **معتمد** (يفتح للي بعده) / **معتمد بملاحظات** (يكمل والملاحظة تتسجل وتظهر للمهندس في صندوق أصفر) / **مرفوض بملاحظات** (إلزامية → `RETURNED` → المهندس يشوف "تم الرفض من X — السبب: Y").
2ب. **شطب سطر (منذ 2026-09-07):** المعتمد اللي دوره يقدر يشطب يوم معيّن بسبب (زرار ✕ تحت الورقة في المعاينة) بدل ما يرفض الكشف كله: السطر يتشطب بالأحمر ويتشال من إجمالي الورقة، الكشف يكمّل السلسلة ويوصل الـ DC بدونه، المهندس يشوف السطر والسبب في تسليماتي. مفيش إلغاء؛ شطب كل السطور = رفض كامل.
3. بعد الرفض: "🔄 عدّل السركي وأعد الإرسال" → `POST /:id/resend` بنسخة `rev++` والسلسلة من أولها. كل قرار في `submission_reviews` (سجل تدقيق كامل).
4. آخر اعتماد → `SENT` → `collectSignatures` (توقيع **الشخص اللي اعتمد فعلًا** في كل مستوى من `UserSettings.signatureFileId`) → `stampSignatures` يختمها في بلوكاتها على كل أوراق المصنّف → الدفع لجوجل شيت مع `approvalSummary` → الشيت يحوّل ويطلّع الـ PDF فورًا. فشل الختم مايوقفش الدفع (يتبعت بلا توقيعات ويتسجل الخطأ)؛ فشل الدفع → زرار "☁️ إعادة الإرسال للشيت" في تسليماتي (`/gsync`).
5. بعد `SENT`، `GET /api/approvals/:id/file` بيرجّع النسخة الموقّعة (نفس اللي راحت جوجل) للمعاينة/التحميل.

### 13.2 الدرجات والمصفوفة (2026-09-05/06)
- **`users.grade`** حقل واحد بدورين (درجة الحساب + مستوى اعتماده). الدرجات الخمس ثابتة في الكود: `junior · senior · team leader · construction manager · project manager`. المستويات اللي بتعتمد (أعمدة جدول الطابور): `team leader → construction manager → project manager`.
- **المصفوفة "مين يعتمد لمين"** — افتراضي: junior/senior → الثلاثة؛ team leader → مدير التنفيذ ← مدير المشروع؛ construction/project manager → محدش (الكشف يروح الشيت فورًا). **قابلة للتعديل** من كارت "سلسلة الاعتماد حسب الدرجة" (خانات اختيار؛ درجة ما تعتمدش لنفسها ولا لأعلى منها — مقفولة) وبتتخزن في `app_config.approvalMatrix` مع كاش في الذاكرة (`requiredLevelsFor` لازم تفضل sync). الترتيب يُفرض دائمًا بترتيب السلم.
- **الإسناد بالاسم لكل حساب** (`approverTlId/CmId/PmId`) من كارت الحساب — دروب داون مفلتر بالدرجة، وتحذير أحمر للمستوى الناقص ("المستوى ده هيتخطى"). مدير المشروع الوحيد في النظام بيتحدد تلقائيًا بلا إسناد.
- **الصلاحيات (منذ 2026-09-07):** كل المعتمدين بيشوفوا كل الكشوف وملفاتها؛ مدير فريق تاني **ما يقدرش يعتمد** كشف مش مسند له (403). الاستثناءات: الأدمن (يشوف الكل ويعتمد أي مستوى)، الكشوف القديمة (`currentApproverId = null` → أي معتمد بدرجة المستوى)، ومهندس بلا معتمد مسند (المستوى يتخطى).
- **كشف "معلّق" (`isStuck`):** المستوى الحالي خرج من سلسلة صاحبه (درجته أو إسناده أو المصفوفة اتغيّرت) → يفضل `IN_REVIEW` ولا يتبعت قبل أوانه؛ الأدمن باعتماده يحرّكه لأول مستوى في سلسلته الحالية (أو للشيت لو مفيش). حفظ المصفوفة بيحذّر بعدد الكشوف قيد المراجعة.

### 13.3 التوقيعات (2026-09-05)
| البلوك | الخلية | المستوى |
|---|---|---|
| توقيع مدير المشروع | `A16` | project manager |
| توقيع مدير التنفيذ | `G16` | construction manager |
| توقيع مدير الفريق (كان "توقيع العامل") | `J16` | team leader |

السيرفر بيتعرّف على البلوك من **نص العنوان في الصف 17** (`blocksForSheet`) — فالملفات القديمة (A = تنفيذ، G = مشروع) بتتختم صح برضو. حجم التوقيع بنسبته الأصلية (≤50% عرض البلوك، ≤58% ارتفاع الصف). **كل معتمد لازم يرفع توقيعه** (الأدمن يرفعه له من كارت الحساب — `PUT /api/account/settings` أدمن فقط)؛ معتمد بلا توقيع = بلوكه يطلع فاضي والكشف يعدّي عادي. مفيش "توقيع مدير تنفيذ التجاري" بقى — فيه بس مين اعتمد.

### 13.4 التشغيل
- **ترتيب التفعيل لأي معتمد:** فعّل له وحدة "اعتمادات المديرين" **أولًا** ثم حدد درجته وأسند له المهندسين — العكس يوقف الكشوف عند شخص مش شايف التاب (الأدمن يقدر يفكها).
- الطابور مفلتر بالزمن: `IN_REVIEW` كله + `RETURNED`/`SENT` خلال آخر 7 أيام، والأدمن يقدر يخفي صفوف خلصانة من العرض (`queue_hidden_at` — بلا حذف).
- الشيت الحي بيعرض للمهندس بعد `SENT`: "الاعتماد الإداري" (F) / "بانتظار DC" أو "DC" (D) / "سلسلة الاعتماد" (G).
- في الإنتاج وقت النشر: 3 team leader / 1 construction manager / 2 project manager / 15 junior، والإسناد بيظبطه صاحب المشروع.

---

## 14. سجل نشاط الحسابات (Activity Log) — منشور 2026-09-06

**المشكلة الأصلية:** لوجات morgan مفيهاش هوية المستخدم (IP بس)، فمكنش ينفع تربط خطأ بحساب. اتكشف بيها باج حقيقي: حساب معتمد بس (`beshoy.alfy`) كان بياخد 403 متكرر على `/api/records` من المزامنة فتظهر له "تعذر الاتصال" — اتصلح في `pullAll`/`initialSync` (قسم 5.28).

- **جدول `activity_logs`:** `user_id · email · event · detail · status · path · ip · device · created_at`. الأحداث: `LOGIN_OK · LOGIN_FAIL` (بالإيميل حتى لو الحساب مش موجود) `· SYNC` (من `sync-stats` بأرقامه) `· API_ERR` (أي 4xx/5xx من `errorHandler` بهوية صاحب الطلب). تنظيف يومي بعد 14 يوم.
- **قاعدة ذهبية:** `logActivity` مغلّفة بـ try/catch كامل — بتشتغل جوّه مسار تسجيل الدخول ومعالج الأخطاء، ولو رمت بتكسرهم (حصل فعليًا محليًا: Prisma client قديم → الدخول رجع 500).
- **الواجهة:** كارت "📊 نشاط الحسابات" فوق كارت الحساب في الإدارة — جدول **كل** الحسابات (حتى بلا نشاط): الحساب · الحالة (`actVerdict`: ⛔ مش قادر يدخل / ⚠️ خطأ متكرر / ⚠️ مفيش مزامنة / 😴 مش نشط / ⏳ لسه ما دخلش / ✅ سليم) · آخر دخول · دخول ناجح · محاولات فاشلة · آخر مزامنة · مزامنات · أخطاء · **معنى الخطأ** (`actErrMeaning`: 403 على السراكي لحساب معتمد بس = طبيعي، لمهندس = وحدة مش مفعّلة؛ 401 الجلسة انتهت؛ 429 ضغط والتطبيق بيعيد؛ 5xx خطأ سيرفر). فلتر 24س/7/14 يوم، شارة "كام حساب محتاج نظرة"، ارتفاع ~3 حسابات بتمرير رأسي وترويسة لاصقة. وقسم "📜 سجل النشاط (آخر 14 يوم)" جوّه كارت كل حساب.
- **الـ API:** `GET /api/admin/activity?userId=|email=` و`GET /api/admin/activity/summary?days=` (استعلامان مجمّعان فقط — users + logs — والتجميع في الذاكرة؛ بيدمج مفتاحي userId والإيميل عشان `LOGIN_FAIL` يتحسب).

---

## 15. خطة الاسترجاع لو السيرفر وقع — [RECOVERY-PLAN.md](RECOVERY-PLAN.md) (2026-09-05)

الهدف: الشغل ما يقفش لو Railway وقع. التطبيق (Cloudflare) مستقل وبيفتح **أوفلاين** بنفس الجلسة والبيانات (`network_error` ما بيمسحش الجلسة). المسار: المهندس يطلّع "📄 تنزيل نسخة Excel معتمدة" من جهازه → يرفعها من زرار "📤 رفع ملف السركي على Google Form" (فيتشر `gform_site1/2`) → الصف يوصل الشيت "بانتظار DC" → الـ DC يعتمد من خانة D → توقيعات Drive (تنفيذ حسب سكني/تجاري + مدير المشروع) + PDF زي زمان (بلا توقيع مدير الفريق ولا سلسلة المديرين — مقبول كطوارئ). المسارين (تطبيق/فورم) شغالين جنب بعض في نفس الشيت بلا تعارض. لما السيرفر يرجع: المزامنة تلقائية، والكشوف اللي عدّت من الفورم مش في "تسليماتي" (طبيعي — ما تتعادش). الشروط اللي لازم تفضل: تريجرا `onFormSubmitHandler`/`onEditHandler`، صور التوقيع في Drive (`CONFIG`)، الفورم مربوط بالشيت، وزرار الفورم ظاهر للمهندسين. الملف فيه كمان أوامر تشخيص/إصلاح السيرفر (rollback، استعادة القاعدة من "CEA Backups" في Drive، ملفات الرفع غير الدائمة على Railway).

---

## 16. سركي المعدات (وحدة `equipment`) — إيجار معدات شهري — منشورة ليلة 2026-09-06 ✅ (مخفية حتى التفعيل)

**الورقة الأصلية:** كشف ورقي شهري للمعدة المؤجّرة، كل ورقة 5 أيام (التاريخ · اليوم · المكان · الوقت من/إلى · المدة · بيان الأعمال · **بالخصم على** [مضاف بطلب صاحب المشروع] · ملاحظات) وتحتها 3 توقيعات. **مفيش فلوس** — كشف تشغيل بالساعات، والحساب خارج التطبيق.

- **الشهر من يوم 20 ليوم 19 اللي بعده** (`getEqMonthBounds`)، بمتصفح شهري زي متصفح الأسابيع. التسجيل يومي عادي: سطر لكل يوم تشغيل (ممكن أكتر في اليوم لو اتنقلت مكان/فترة)، والمدة من السيرفر (`minutesBetween`؛ نص الليل محسوب).
- **البيانات:** جدول `equipment_records` (قسم 9.1) — المقاول من قائمة المقاولين (snapshot نصي)، **اسم المعدة = تخصص المقاول** (يتملى تلقائيًا وقراءة فقط — يعني تخصص مقاول المعدات في الإعدادات هو نوع المعدة)، المكان من قائمة الأماكن. متصفح الشهر أول عنصر في التاب. كارت "🚜 إعدادات السركي الشهري" **في تاب الإعدادات** (محلي على الجهاز؛ `data-module="equipment"` + فيتشر `equipment_settings` في الافتراضي — الأدمن يقدر يخفيه): مقاول ثابت يتقفل في الفورم، والموقع اللي يتكتب في راس الكشف (جريني/أزاليا/مضاف) بدل قائمة الأماكن. أوفلاين-أولًا بنفس محرك المزامنة (`mirrorPushById`/`mergePullById`).
- **الكشف الشهري:** ملف Excel واحد، **ورقة لكل 5 أيام تقويمية** من 20 لـ 19 (7 ورقات لشهر 31 يوم، 6 لشهر 30) — الأيام كلها موجودة والفاضي صف فاضي. راس كل ورقة: شركة هوم جيت · "[الموقع] — سركي / إيجار معدات (المعدة)" · إسم المقاول · المعدة · الموقع (من إعدادات السركي الشهري، مش الأماكن) · المشروع · الفترة من/إلى حسب الورقة · "ورقة n من N — شهر …". صف 13 إجمالي ساعات الورقة + إجمالي الشهر (وأيام التشغيل). نفس شبكة الـ 13 عمود وهوية الكشف الأسبوعي.
- **التوقيعات (الصف 16، العناوين 17):** `A..E` = توقيع مدير المشروع · `G..I` = توقيع مهندس التنفيذ · `J..M` = توقيع **المشرف المسئول** (= توقيع المهندس المسجّل، بيتحط من التطبيق وقت البناء). `signStamp.ts` بيختم مدير المشروع ومدير التنفيذ من حسابات المعتمدين، ومدير الفريق (لو في السلسلة) بيعتمد بلا بلوك فيتخطى.
- **الإرسال:** نفس دورة الاعتماد بالظبط — `POST /api/submissions` بـ `kind=equipment` (`contractorName` = المقاول، `placeName` = المعدة، `total` = الساعات، `recordsCount` = أيام التشغيل) → سلسلة المديرين → ختم → جوجل شيت (نفس الشيت، الملف متعدد الورقات بيتحوّل والـ PDF بكل الورقات — `Code.gs` بلا تعديل). "تسليماتي" وتاب الاعتمادات بيميّزوا الكشف بـ "🚜 كشف معدات".
- **الظهور:** وحدة `equipment` مش في الافتراضي — الأدمن يفعّلها حسابًا بحساب من "الوحدات الظاهرة له" (وبتتفرض على السيرفر بـ `requireModule`).
- **النشر:** اتنشر ليلة 2026-09-06 — backend `e6c38e3` (deployment `58c2b74d`) + واجهة `68a4325` (كاش `cea-202609061924`). المتبقي: تفعيل الوحدة للحسابات من إدارة الحسابات.


## 17. تحليلات المشروع (وحدة `analytics`) — شاشة تحليل بيانات للمديرين — منشورة 2026-09-07 ✅ (مخفية حتى التفعيل)

**السؤال اللي بتجاوب عليه:** المدير عايز يشوف أرقام **كل** مهندسينه في مكان واحد. تاب "الملخص" مابيعملش ده — بيحسب من `localStorage` يعني سجلات المهندس نفسه بس. التاب ده بيسأل السيرفر اللي بيجمّع سجلات كل الحسابات المسندة للمدير.

**بُعدان:** 🏗 **الأماكن** و👷 **المقاولين** (مبدّل فوق الفلاتر). الاتنين شغالين لأن الاتنين **بيانات مرجعية يديرها الأدمن وحده**:
- `entities.routes.ts` → `writeRoles: ['ADMIN']` على راوتر المقاولين وراوتر الأماكن — أي مهندس يحاول يضيف بياخد 403 من **السيرفر** مش إخفاء في الواجهة.
- `app.js` → `pushContractorsIfAdmin` / `pushPlacesIfAdmin` بترجعوا صفر لغير الأدمن ("الأدمن يرفع فروقه، والمهندس يسحب فقط").
- الأدمن بينسخهم لحسابات المهندسين **نصًّا حرفيًا** (`/users/:id/{places,contractors}/copy-mine`).

فالاسم واحد عند الجميع والتجميع عبر الحسابات بيطلع صح. (`@@unique([userId, name])` هنا تخزين لكل حساب **لنفس القائمة**، مش قوائم مختلفة.)

⚠ **التحفّظ الوحيد:** `records.contractorName` / `placeName` نسخة نصية وقت التسجيل. لو اسم اتغيّر أو اتحذف بعد كده، السجلات القديمة بتفضل بالاسم القديم — عشان كده صف المقاول بيرجع `inList` (هل الاسم لسه في قائمة الأدمن؟) وفيه كارت في آخر الشاشة بيعرض الأسماء دي بدل ما نخفي الفرق.

### 17.1 الملفات
| الملف | الدور |
|---|---|
| `backend/src/services/analytics.service.ts` | `normName` (توحيد الأسماء) · `resolveScope` (مين بيشوف مين) · `placesReport` · `contractorsReport` · `matrixReport` · `trendSeries` |
| `backend/src/routes/analytics.routes.ts` | 5 مسارات قراءة فقط + كاش 60 ثانية |
| `backend/tests/analytics.test.ts` | 15 اختبار (التجميع + النطاق + منع التسريب + المعجم + المصفوفة) |
| `app.js` (آخر الملف) | `renderAnalytics` وكل دوال `an*` |
| `index (17).html` | زرار القائمة + `#tab-analytics` (مبدّل البُعد + فلاتر + `#an-body`) |
| `style.css` (آخر الملف) | `.an-*` |

### 17.2 المسارات
| المسار | بيرجّع |
|---|---|
| `GET /api/analytics/scope` | `{level, engineers[], sites[]}` — لملء الفلاتر وعرض نطاق الرؤية |
| `GET /api/analytics/places?from&to&site&userId&fresh` | `{totals, rows[]}` — صف لكل مكان |
| `GET /api/analytics/contractors?…` | `{totals, rows[]}` — صف لكل مقاول (+ `inList`/`spec`/`rate`/`avgPrice`) |
| `GET /api/analytics/matrix?…&limit` | `{contractors[], places[], cells[], topPairs[], totals}` — شبكة مقاول × مكان |
| `GET /api/analytics/trend?…&place&contractor&bucket=week\|month` | `[{bucket,total,records}]` |

كلها `authenticate + requireModule('analytics')` من `routes/index.ts`. **مفيش أي مسار كتابة** — التاب ده بيقرأ ويجمّع بس.

### 17.3 نطاق الرؤية (مفروض على السيرفر)
`resolveScope` بيحدد الحسابات اللي الأرقام بتتحسب عليها:
- **أدمن** → كل الحسابات (`level: 'all'`).
- **معتمد** (درجته من `APPROVING_GRADES`) → اللي مسندينه في أي مستوى (`approver_tl_id` / `approver_cm_id` / `approver_pm_id` = هو) + نفسه (`level: 'team'`).
- **أي حساب تاني** → سجلاته هو بس (`level: 'self'`) — الوحدة لو اتفعلت لمهندس عادي بالغلط ما بتوريهوش حاجة زيادة.

فلترة بـ `userId` لحساب **بره** النطاق بترجع نتيجة فاضية (مش خطأ ومش تسريب). سطر تحت عنوان التاب بيقول للمدير نطاقه بالظبط عشان مايفهمش الأرقام غلط.

### 17.4 التجميع
- **الأماكن** (`placesReport`): 7 استعلامات `groupBy` متوازية — سراكي (مجاميع + مقاولين + مهندسين + أيام) · IR حسب الحالة · الموقف التنفيذي · المعدات.
- **المقاولين** (`contractorsReport`): 6 استعلامات — سراكي (مجاميع + `_avg` السعر + أماكن + مهندسين + أيام) · المعدات · **معجم المقاولين** (قائمة حسابات الأدمن) اللي بيدي التخصص والفئة المتفق عليها وبيحدد `inList`. IR والموقف التنفيذي **مش موجودين هنا** — مالهمش عمود مقاول في الـ schema.
- **المصفوفة** (`matrixReport`): استعلام `groupBy` واحد على (`contractorName`,`placeName`) — كل خانة = شغل مقاول في مكان. بترجع **أعلى N مقاول × أعلى M مكان** بالمنصرف (`limit`، افتراضي 15) وبتقول صراحةً كام اتشال وبكام (`hiddenContractors` / `hiddenPlaces` / `hiddenTotal`) — مش بنخفي فرق من غير ما نقوله. إجمالي الصف/العمود = إجمالي المقاول/المكان في **كل** الأماكن/المقاولين (مش المعروض بس)، والعناوين بتقول كده.
- **بترجع أرقام مجمّعة بس — ولا صف خام بيسيب القاعدة.**
- `normName` بيوحّد: التشكيل والتطويل · `أإآٱ→ا` · `ى→ي` · `ة→ه` · `ؤئ→ء` · أي فاصل → مسافة واحدة. يعني "الدور الأرضي" و"الدور الارضي" صف واحد. اسم المكان المعروض = الكتابة الأكتر استخدامًا (والباقي في `variants` + كارت تنبيه)؛ اسم المقاول المعروض = **الكتابة الرسمية من قائمة الأدمن** لو موجودة.
- `rateType` بيتحوّل من enum لعربي بـ `ENUM_TO_AR` زي باقي المسارات (كان بيرجع `DAILY` — اتصلّح).
- ⚠ **الموقف التنفيذي (عمود "الإنجاز") مش بيتأثر بفلتر الفترة** — `exec_records` مالهاش عمود تاريخ في الـ schema، فبتتحسب على الوضع الحالي دايمًا.
- كاش 60 ثانية لكل (مستخدم + بُعد + فلاتر). زرار "🔄 تحديث" بيبعت `fresh=1` اللي بيمسح مفتاح الكاش الأول — من غيره الزرار كان هيبقى شكلي لمدة دقيقة.

### 17.5 الواجهة
- **البُعد:** مبدّل ذهبي فوق (🏗 الأماكن / 👷 المقاولين) — بيغيّر الكروت وأعمدة الجدول وكارت التنبيه.
- **فلاتر:** الفترة (هذا الأسبوع بداية سبت / هذا الشهر / آخر 3 شهور / كل الفترة / مخصص) + الموقع (بيظهر لو فيه أكتر من موقع في النطاق) + المهندس.
- **أعمدة الأماكن:** منصرف · خصم · %خصم · سجلات · أيام · مقاولين · مهندسين · IR (A/B/C) · الإنجاز · ساعات معدات · آخر نشاط.
- **أعمدة المقاولين:** التخصص · الفئة المتفق عليها · **متوسط السعر الفعلي** (للمقارنة بالفئة) · منصرف · خصم · %خصم · سجلات · أيام · أماكن · مهندسين · ساعات معدات · آخر نشاط.
- **بُعد العلاقة (🔀):** شبكة حرارية مقاول × مكان + قايمة "أعلى الثنائيات" (الشبكة عريضة بطبعها، والقايمة بتخلي الشاشة مفيدة على الموبايل). عمود أسماء المقاولين مثبّت (`inset-inline-start` = يمين في RTL) والباقي بيتمرّر أفقيًا. **تدرّج اللون بترتيب الخانة مش بنسبتها للأكبر** — قيمة شاذة واحدة كانت بتخلي كل الخانات التانية شبه بيضا؛ الرقم المكتوب هو المرجع الدقيق.
- **كروت التنبيه:** أماكن مكتوبة بأكتر من صيغة (بُعد الأماكن) · أسماء مقاولين في السجلات مش في القائمة الحالية (بُعد المقاولين).
- **الرسوم SVG خام بدون مكتبة** — قرار متعمد: بتشتغل أوفلاين، بتتبع متغيرات الوضع الداكن، وبتطبع صح، وبنتجنب وجع تحميل مكتبة (زي اللي حصل مع ExcelJS و`unsafe-eval`).
- الطلبات بتترقّم (`_anSeq`): لو الفلتر/البُعد اتغيّر والطلب القديم لسه شغال، الرد القديم بيتجاهل بدل ما يرسم فوق الجديد.
- التاب **أونلاين فقط** (زي المخازن) — من غير نت بيعرض رسالة بدل أرقام قديمة مضللة.

### 17.6 الظهور والنشر
وحدة `analytics` **مش في الافتراضي** — الأدمن يفعّلها حسابًا بحساب من "الوحدات الظاهرة له" (ومفروضة على السيرفر بـ `requireModule`). **مفيش migration** — التاب بيقرأ من الجداول الموجودة زي ما هي.

**النشر:** 2026-09-07 على دفعتين — الأولى (الأماكن فقط) backend `70995ff` + واجهة `7f5ea54` كاش `cea-202609071618`؛ والتانية (بُعد المقاولين + إعادة التسمية لـ "تحليلات المشروع") backend `da07906` + واجهة `474a518` كاش `cea-202609071647`؛ والتالتة (بُعد العلاقة — المصفوفة) backend `a80ddd2` + واجهة `d028cca` كاش `cea-202609071707`. الاختبارات 113/113.
