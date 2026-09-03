# System Reference — مشروع CEA (متابعة السرايكي)

مرجع تقني كامل لبنية المشروع، الملفات، والـ features الموجودة فعليًا في الكود — مُستخرج بالكامل من قراءة الكود المصدري (بدون افتراضات). آخر تحديث: 2026-09-01.

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
├── app.js                        ~4,830 سطر — كل منطق الواجهة (state, rendering, sync, export, inventory)
├── app.js.pre-submit.bak                 — نسخة app.js قبل إضافة ميزة الاعتمادات (Submissions)
├── app.js.supabase.bak                   — نسخة app.js قبل الترحيل من Supabase إلى MySQL
├── index (17).html               ~1,075 سطر — الواجهة (HTML) + استدعاء app.js وcapacitor.js
├── style.css                     ~615 سطر — كل التنسيق (layout, tabs, dark mode, modals, drawer, inventory...)
├── manifest.webmanifest                  — PWA manifest (اسم، أيقونات، RTL، standalone)
├── sw.js                                 — Service Worker: تخزين مؤقت أوفلاين لهيكل التطبيق
├── build-pwa.js                          — يبني pwa-dist/ (النسخة الجاهزة للنشر) من الملفات المصدرية
├── make-icons.js                         — يولّد أيقونات PWA (192/512/maskable) من الصفر بدون مكتبات صور
├── dev-server.js                         — سيرفر تطوير محلي (live-reload عبر SSE) + endpoint تصحيح `/__save`
├── CHANGELOG.md                          — سجل مراجعة سابقة (bug fixes + توصيات)
├── SECURITY_REPORT.md                    — تقرير الفحص الأمني + حالة الإصلاحات (دفعتان)
├── SESSION-LOG.md                        — سجل جلسة العمل الكبرى (أواخر أغسطس → سبتمبر 2026) مضغوطًا
├── ROADMAP-INVENTORY.md                  — تصميم وحدة المخازن وقراراتها
├── DEPLOY-NEXT-RELEASE.md                — خطوات نشر باقة المخازن+الأمان الجاهزة للتنفيذ الفوري
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
│   ├── Code.gs                           — Google Apps Script (شيت جريني): يستقبل الاعتمادات، يبني Sheet+PDF بتوقيعات، يتتبّع الحالة
│   └── Code-site2.gs                     — نسخة أزاليا (فولدراتها متظبطة، التوقيعات placeholders — الاعتماد يكمل بدونها)
├── pwa-dist/                             — ناتج build-pwa.js (حزمة جاهزة للنشر على Cloudflare Pages) — ليس مصدر
├── debug-x/                              — فولدر فاضي
├── .wrangler/                            — حالة Cloudflare Wrangler المحلية (أداة نشر، ليست كود)
├── .claude/                              — إعدادات Claude Code + skills (أداة تطوير، ليست جزء من التطبيق)
└── backend/                              — الـ Backend (Node/TS/Express/Prisma/MySQL)
    ├── prisma/schema.prisma              — 17 جدول (انظر backend/README.md)
    ├── prisma/seed.ts                    — بيانات افتراضية + أول أدمن
    ├── prisma/migrations/                — 6 migrations
    ├── scripts/
    │   ├── import-backup.ts              — استيراد نسخة التطبيق المحلية القديمة (صيغة CEA_backup_*)
    │   ├── restore-backup.ts             — ⭐ استعادة كاملة من الباك اب اليومي (كل الحسابات بنفس الأرقام) — مُختبر
    │   ├── dump-to-file.ts               — توليد ملف باك اب يدوي بنفس صيغة اليومي
    │   ├── seed-inventory.ts             — جرد افتتاحي افتراضي للمخازن (25 صنف، كميات صفر)
    │   ├── dedupe-records.ts             — إزالة تكرار السجلات
    │   ├── docker-start.sh
    │   └── run-tests.js
    ├── src/
    │   ├── config/                       — env.ts, prisma.ts
    │   ├── routes/, controllers/, services/, middlewares/, schema/ (Zod), utils/
    │   └── dist/                         — ناتج compile (ليس مصدر)
    ├── tests/                            — vitest + supertest (auth, entities, modules, records, submissions)
    ├── Dockerfile, docker-compose.yml, railway.json — إعدادات نشر/تشغيل محلي
    └── README.md
```

> MySQL محلي حاليًا في `E:\mysql-8.0.46-winx64` (شغّال كعملية، مش service) — قواعد: `cea` (تطوير/بيانات حقيقية) و`cea_test` (اختبارات فقط).

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
        ↓ (اعتمادات فقط)
Google Apps Script Web App (google-sheet/Code.gs) → Google Sheet + PDF + توقيعات
```

الواجهة **لا تتصل بقاعدة البيانات مباشرة أبدًا** — كل شيء عبر الـ API بتوكن JWT، والصلاحيات (أدمن/مهندس + ownership + تفعيل موديول) مفروضة على مستوى السيرفر (`requireModule` middleware) وليس فقط في الواجهة. الواجهة نفسها لسه بدون build tool (HTML/JS/CSS خام)، لكن `build-pwa.js` يجهّز نسخة نشر منها.

طبقة الـ PWA (`sw.js`) منفصلة تمامًا عن أي شيء أعلاه — بتكاش هيكل التطبيق (HTML/JS/CSS/أيقونات/مكتبات Excel) فقط، وبتمرّر أي طلب API (cross-origin) زي ما هو بدون تدخل.

---

## 4. نظام الموديولات والصلاحيات (Modules & Features Permission System)

ميزة جديدة بالكامل تتحكم في أي تابات/فيتشرز تظهر لكل مهندس، تُدار من لوحة الأدمن وتُفرض على مستوى الواجهة والسيرفر معًا.

| العنصر | الوصف |
|---|---|
| `ALL_MODULES` | `['records','submissions','ir','site_daily','site_exec','todo','summary','inventory']` — الموديولات (تابات) القابلة للتفعيل/التعطيل لكل مستخدم (`inventory` مش في الافتراضي — مخفية حتى يفعّلها الأدمن) |
| `MODULE_LABELS`, `TAB_MODULE` | تسمية عربية لكل موديول + ربطه بمعرّف التاب في الـ DOM |
| `enabledModules` / `enabledFeatures` | تُقرأ من `AccountSettings` عبر الـ API وتُخزَّن محليًا في `cea_enabled_modules` / `cea_enabled_features` |
| `ALL_FEATURES` / `FEATURE_KEYS` / `DEFAULT_FEATURES` | فيتشرز أدق داخل كل تاب (مش كل التاب بالكامل) |
| `applyModuleVisibility` | تُطبَّق بعد كل تسجيل دخول/مزامنة — تخفي التابات/الفيتشرز غير المفعّلة من DOM فعليًا |
| `moduleEnabled`, `featureEnabled`, `tabEnabled` | دوال فحص سريعة تُستخدم في كل مكان قبل عرض عنصر واجهة |

**فرض مطابق على السيرفر**: `requireModule` middleware في `backend/src/middlewares` يمنع أي طلب API لموديول غير مفعّل لهذا المستخدم، حتى لو تم تجاوز الفحص في الواجهة — يعني الحماية حقيقية وليست شكلية فقط.

---

## 5. جرد الـ Features الكامل (app.js — 4,263 سطر)

مرتّبة حسب المجال الوظيفي بترتيب ظهورها في الملف، مع أرقام الأسطر التقريبية والدوال الرئيسية.

### 5.1 الأدوات الأساسية (Utilities) — أسطر 1-68
| Feature | الدوال | الوصف |
|---|---|---|
| HTML escaping / safe args | `esc`, `jsArg` | منع XSS عند حقن نصوص المستخدم في innerHTML |
| UTF-8 Base64 helpers | `bytesToBase64`, `base64ToBytes`, `utf8ToBase64`, `base64ToUtf8` | ترميز/فك ترميز يدعم العربي والإيموجي بالكامل |
| Lazy library loader | `ensureXLSX`, `ensureExcelJS` | حقن مكتبات Excel ديناميكيًا عند أول استخدام فعلي فقط |

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
| معاينة داخل التطبيق | `renderSheetHtml`, `argbToCss`, `colLetterToNum` — يعرض شكل ملف Excel كـ HTML قبل التصدير الفعلي |

### 5.19 ورشة الاعتمادات (Submissions & Approval Workflow) — أسطر 2216-2431 — **ميزة جديدة بالكامل**
المهندس يرسل كشف "السراكي المعتمد" للمراجعة، ويتبع حالته حتى الاعتماد النهائي عبر Google Sheets:

| المجموعة | الدوال |
|---|---|
| إرسال للمراجعة | `submitApprovedForReview`, `openSubmitReview`, `confirmSubmitApproved` |
| معاينة داخل مودال (Zoom) | `sheetZoom`/`sheetZoomReset`, `toggleSheetFull`, `closeSubmitReview` |
| Timeline الحالة | `sheetTimeline`, `subRow` |
| قائمة اعتمادات المهندس | `renderMySubmissions`, `downloadSubmission`, `deleteMySubmission` (حذف مسموح فقط طالما لسه "مُرسَل") |
| مراجعة الأدمن | `renderAdminSubmissions`, `setSubFilter`, `reviewSubmission` (اعتماد/رفض بملاحظة، قابل للتراجع لحالة "مُرسَل" مرة أخرى), `closeReviewModal` |

الحالات: `SUBMITTED` → `APPROVED` / `REJECTED`. كل عملية إرسال بتُدفع في الخلفية إلى Google Sheets (`google-sheet/Code.gs` عبر `backend/src/services/googleSheet.ts`) وتُقرأ حالتها الحية من هناك.

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

### 5.29 دوال التوافق القديمة (Legacy Compat) — أسطر 4106-4146
`pushPlacesToCloud`, `pushContractorsToCloud`, `pushSignatureToCloud`, `pushPinHashToCloud`, `autoSyncReferenceData` — نفس الأسماء القديمة (وقت Supabase) لكن بمنطق الـ Backend الجديد داخليًا.

### 5.30 نسخ احتياطي/استعادة محلي (JSON) — أسطر 4146-4263
`backupData`, `applyRestoreData`, `restoreFromFile`, `restoreData` — يُصدّر كل الحالة المحلية كملف JSON (Capacitor Filesystem+Share على أندرويد، أو تنزيل Blob على الويب) ويستعيدها من ملف مُختار. **منفصلة تمامًا عن المزامنة السحابية** ولا تحتاج إنترنت.

---

## 6. بنية الواجهة (`index (17).html` — 964 سطر)

### السكربتات
- سطر 16: كتلة inline تضبط `window.isCapacitor` وتطبّق كلاس `dark-boot` قبل أول رسم (منع وميض أبيض)
- سطر 27: `capacitor.js` (خارجي، جزء من مشروع Android الأكبر)
- سطر 962 (آخر السطور): `app.js`

### الشاشات/التابات الرئيسية (`<div id="...">`) — بترتيب الظهور في المستند

| ID | الدور | ملاحظة |
|---|---|---|
| `#splash` | شاشة البداية | |
| `#login-screen` (+`#login-error`) | تسجيل الدخول (إيميل/كلمة سر) | الآن عبر JWT من الـ Backend، وليس Supabase |
| `#offline-banner` | تنبيه انقطاع الاتصال | |
| `#drawer-scrim` + الـ Drawer | قائمة تنقل جانبية | **جديد** |
| `#tab-home` | لوحة الرئيسية — `#home-recent`, `#home-todos` | **جديد** |
| `#tab-admin` | لوحة الأدمن (أدمن فقط) — `#admin-submissions`, `#admin-users-list`, `#admin-user-modules`, `#admin-user-places`, `#admin-user-contractors`, `#admin-sig-preview`, `#admin-create-modules`, `#admin-created-box` | **جديد بالكامل** |
| `#tab-submissions` | اعتمادات المهندس — `#my-submissions` | **جديد** |
| شريط تابات سفلي (4 عناصر) | تنقل رئيسي سريع | **جديد** |
| `#tab-form` | فورم "سراكي" جديد — `#f-deduct-chips` | |
| `#tab-records` | قائمة السراكي — `#week-nav`, `#export-contractor-chips`, `#export-place-chips`, `#records-list` | |
| `#tab-ir` | طلبات الفحص — `#ir-list` | |
| `#tab-site` | تبويب "الموقف"، فيه تبويبين فرعيين: | |
| &nbsp;&nbsp;`#stab-daily` | التقرير اليومي — `#daily-photo-preview`, `#daily-list` | |
| &nbsp;&nbsp;`#stab-exec` | الموقف التنفيذي — `#exec-stages-wrap`, `#exec-stages-sliders`, `#exec-pct-fill`, `#exec-list` | |
| `#tab-todo` | المهام — `#todo-list` | |
| `#tab-summary` | الملخص — `#contractor-summary` | |
| `#tab-settings` | الإعدادات — مقاولون/أماكن/استشاريون/بنود، استيراد Excel، حساب/مزامنة (`#account-email-display`, `#sync-project-code-display`, `#sync-status`, `#load-older-wrap`)، توقيع (`#sig-preview-wrap`, `#sig-empty-msg`) | |

---

## 7. بنية `style.css` (599 سطر)

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
| **أدوات تكبير/ملء الشاشة للمعاينة** | 594 — **جديد** |

> نما الملف من 440 سطر إلى 599 سطر أساسًا لدعم الـ Drawer، شريط التابات السفلي، شاشة الرئيسية، ومودال معاينة/مراجعة الاعتمادات.

---

## 8. الـ PWA (Progressive Web App)

| الملف | الدور |
|---|---|
| `manifest.webmanifest` | اسم "CEA – Civil Engineer Assistant"، عربي/RTL، `display: standalone`، لون الثيم navy (#173058)، 3 أيقونات |
| `sw.js` | Service Worker — cache باسم `cea-v1` يشمل HTML/JS/CSS/manifest/أيقونات/مكتبتي Excel. **استراتيجية مزدوجة (تحديث 2026-08-21):** ملفات الكود (index.html/app.js/style.css + أي طلب navigate) **network-first** عشان أي نشر جديد يوصل فورًا والكاش احتياط أوفلاين فقط؛ الأصول الثابتة (أيقونات/مكتبات) stale-while-revalidate؛ وتمرير مباشر (network-only) لأي طلب cross-origin (يعني طلبات الـ API لا تُكاش أبدًا) |
| `icons/` | icon-192.png, icon-512.png, icon-maskable-512.png |
| `make-icons.js` | يولّد الأيقونات الثلاث من الصفر (PNG encoder يدوي، بدون مكتبات) — دائرة navy بحلقة ذهبية وحرف "CEA" |
| `build-pwa.js` | يبني `pwa-dist/`: ينسخ ويعيد تسمية `index (17).html` → `index.html`، ينسخ app.js/style.css/manifest/icons/lib، يضخ رقم إصدار cache جديد داخل `sw.js`، ويكتب ملف `_headers` لـ Cloudflare Pages (رؤوس أمان + منع cache على sw.js) |
| `dev-server.js` | سيرفر تطوير محلي (بورت 5173) يخدم `index (17).html` كجذر، مع live-reload عبر SSE عند تعديل الملفات، وendpoint تصحيح `/__save` يكتب `debug-out.xlsx` |

---

## 9. Backend — `backend/` (Node/TypeScript/Express/Prisma/MySQL)

يستبدل Supabase بالكامل؛ الواجهة لا تتحدث مع قاعدة البيانات مباشرة أبدًا، فقط عبر هذا الـ API الموثّق بـ JWT.

### 9.1 نموذج البيانات (Prisma — 17 جدول)
`User` (role ADMIN/ENGINEER، title، project [سكني/تجاري]، site [1/2 — الموقع/المشروع المنفصل]، lastSeenAt)، `RefreshToken`، `PasswordResetToken`، `AccountSettings` (PIN hash، ملف التوقيع، `enabledModules`/`enabledFeatures` كـ JSON لكل مستخدم)، `Contractor`، `Place`، `Inspector`، `Item`+`ItemStage`، `Record`+`RecordDeduction` (سجلات السراكي)، `IrRecord`، `Todo`، `ExecRecord`+`ExecRecordStage`، `DailyRecord` (تقارير بالصور)، `File` (تجريد بيانات وصفية للملفات المرفوعة فوق تخزين محلي)، `Submission` (ورشة الاعتماد: SUBMITTED/APPROVED/REJECTED، مربوطة بـ Google Drive/Sheet).

### 9.2 أهم نقاط النهاية (Endpoints)
- **Auth**: register/login/refresh/logout/me/change-password — **مسارا `password-reset/*` مُعطَّلان عمدًا منذ 2026-08-21** (كانا يعيدان التوكن في الاستجابة بدون مصادقة = استيلاء على أي حساب — انظر C1 في `SECURITY_REPORT.md`؛ البديل الآمن: `POST /api/admin/users/:userId/reset-password`) — JWT (15 دقيقة access + 30 يوم refresh دوّار مع كشف إعادة استخدام يُلغي كل الجلسات)، bcrypt 12 rounds. **مهلة سماح (grace window)** — env: `REFRESH_REUSE_GRACE_SEC` (افتراضي 120 ثانية): إعادة استخدام توكن أُلغي بسبب تدوير عادي (`rotated=true` في جدول `refresh_tokens`) داخل المهلة تُقبل وتصدر توكنات جديدة بدل اعتبارها سرقة — يمنع خروج المستخدم القسري عند سباق تبويبين أو انقطاع حفظ التوكن الجديد. التوكنات الملغاة أمنيًا (logout/تغيير كلمة سر) لا تستفيد من المهلة أبدًا.
- **CRUD كيانات (مقيدة بالملكية)**: `/api/contractors`, `/api/places` (كتابة للأدمن فقط), `/api/inspectors`, `/api/items` (مع مراحل متداخلة), `/api/records` (صفحات، فلاتر، الإجمالي يُحسب على السيرفر), `/api/ir-records`, `/api/todos`, `/api/exec-records`, `/api/daily-records` (رفع صور), `/api/files`, `/api/account/settings` (PIN/توقيع — قراءة فقط للمهندس، كتابة للأدمن).
- **`/api/admin/*`** (أدمن فقط): قائمة المستخدمين، إدارة أماكن/مقاولين لكل مستخدم + "نسخ مقاولي الأدمن"، إعدادات الحساب لكل مستخدم، تشغيل نسخة احتياطية يدوية DB→Drive، كتالوج الموديولات/الفيتشرز، إنشاء حساب مهندس، تعديل title/role/project/site، ملخص حساب قبل الحذف، حذف حساب (تأكيد إيميل + حماية عدم حذف نفسه/آخر أدمن)، إعادة تعيين كلمة السر.
- **`/api/submissions/*`**: المهندس يرفع Excel معتمد (multipart) → يُخزَّن ويُدفع لـ Google Sheets في الخلفية؛ `/mine` يعرض اعتمادات المستخدم بحالة حية من الشيت؛ `/:id/file` تنزيل (المالك أو الأدمن)؛ الأدمن يعرض الكل + فلترة بالحالة؛ `/:id/review` (PATCH، اعتماد/رفض بملاحظة، قابل للتراجع)؛ `/:id/gsync` إعادة محاولة يدوية للدفع لجوجل؛ DELETE مسموح فقط أثناء SUBMITTED.
- `requireModule` middleware يفرض نفس تقييد الموديولات على مستوى السيرفر لمسارات records/submissions/ir/todo/exec/daily.

### 9.3 الخدمات (Services)
| الخدمة | الدور |
|---|---|
| `googleSheet.ts` | يستدعي Google Apps Script Web App لدفع الاعتمادات وجلب حالتها الحية — **بيدعم موقعين**: الموقع 1 عبر `GOOGLE_WEBAPP_URL`/`GOOGLE_WEBAPP_SECRET` والموقع 2 عبر `GOOGLE_WEBAPP_URL_2`/`GOOGLE_WEBAPP_SECRET_2`؛ الميزة تُعطَّل تلقائيًا لكل موقع غير مضبوط. التوجيه حسب `Submission.site` (المُثبَّت من `User.site` وقت الإنشاء) |
| `backup.ts` | يُصدّر قاعدة البيانات كاملة (كل الجداول شاملًا `app_config` والمخازن) كـ JSON إلى Google Drive، جدولة يومية بعد 3 صباحًا UTC + زر يدوي، وآخر نتيجة بتتسجل في `app_config` وتُقرأ من `GET /api/admin/backup-status`. **الاستعادة الكاملة:** `scripts/restore-backup.ts` (مُختبر end-to-end) |
| `storage.ts` | تجريد تخزين ملفات محلي على القرص (`StorageAdapter` — جاهز للاستبدال بـ S3/R2)، أسماء عشوائية في فولدرات شهرية، محمي من path-traversal |

### 9.4 الأمان
Helmet، CORS مقيّد بـ `CORS_ORIGIN`، rate limiting عام + أشد على مسارات auth، تحقق Zod على كل المدخلات، Prisma parameterized queries (بدون SQL خام)، تخزين الـ refresh tokens كـ hash، رسائل خطأ موحّدة بدون stack traces، الملفات تُخدَم فقط عبر endpoint موثّق ومقيّد بالملكية (بدون static serving مباشر).

---

## 10. تكامل Google Sheets — `google-sheet/Code.gs`

Google Apps Script منشور كـ Web App تحت حساب جوجل الخاص بالأدمن. يستقبل POST من `backend/src/services/googleSheet.ts` يحتوي (الملف + اسم المهندس + نوع المشروع)، ويقوم بـ:
1. تحويل الملف إلى صف في Google Sheet منسّق (ألوان navy/gold الخاصة بـ CEA).
2. تضمين صور توقيعات الاعتماد — معرّفات ملفات التوقيع في `CONFIG`. **(تحديث 2026-08-26)** توقيع **مدير التنفيذ** بيتحدد حسب نوع المشروع (🏠 سكني / 🏪 تجاري) عبر `execSignatureIdFor()` — لو توقيع التجاري لسه placeholder بيرجع لتوقيع السكني بدل ما الاعتماد يفشل. نوع المشروع بيوصل مع كل اعتماد من `googleSheet.ts` (من حقل `User.project`)، وفيه تحديد تلقائي احتياطي بقائمة `COMMERCIAL_ENGINEERS` + `DEFAULT_PROJECT` للصفوف القديمة، وعمود "سكني/تجاري" في الشيت بدروب داون وألوان. **متبقي:** توقيع **مدير المشروع** لسه ملف واحد ثابت للنوعين (`SIG_PROJECT_MANAGER_FILE_ID` يُستخدم مباشرة) رغم وجود `SIG_PROJECT_MANAGER_COMMERCIAL_FILE_ID` كـ placeholder غير مستخدم — محتاج دالة اختيار مماثلة + ضبط الـ File IDs التجارية.
3. توليد PDF.
4. تتبّع حالة الاعتماد (`✅ معتمد` / `❌ مرفوض` / `⚠ معتمد بملاحظات`) والتي تُقرأ لاحقًا عبر `fetchSheetStatuses`.

يعالج أيضًا أكشن `backup` القادم من `backup.ts` لحفظ نسخة قاعدة البيانات في Drive. الأعمدة معرّفة في `COLS` (اسم المهندس، الوقت، رابط الملف، اعتماد/ملاحظات المدير التنفيذي والمشروع، الحالة، رابط الشيت المحوّل، رابط PDF، نوع المشروع).

---

## 11. ملاحظات للمرجعية المستقبلية

- **(2026-09-01) وحدة المخازن — مكتملة محليًا وغير منشورة عمدًا** — التفاصيل الكاملة في **قسم 12** بالأسفل، وخطوات نشرها في [DEPLOY-NEXT-RELEASE.md](DEPLOY-NEXT-RELEASE.md).
- **(2026-09-03) وحدة "اعتمادات المديرين" — مبنية بالكامل محليًا، غير منشورة، وفيها إصلاحات إلزامية قبل النشر** — التصميم والبنية والحالة وقائمة الإصلاحات في [SESSION-LOG.md](SESSION-LOG.md) **قسم 9** (أبدأ منه في أي جلسة جديدة). ملخص: سلسلة مراجعة داخل التطبيق (مستويات مرتبة قابلة للتعديل، `User.approvalLevel`، `submission_reviews`، `/api/approvals/*` خلف وحدة `approvals`) قبل ما الكشف يوصل جوجل شيت؛ الشيت يفضل للـ DC فقط.

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
- كل الحسابات المالية (qty × price − discount = total) تعيش فقط داخل `calcTotal`/`saveRecord` — أي إعادة تنفيذ لهذا المنطق (في الـ Backend مثلاً) يجب أن يطابقها تمامًا.
- ميزة النسخ الاحتياطي/الاستعادة المحلية (قسم 5.30) **منفصلة تمامًا** عن المزامنة السحابية ويجب عدم الخلط بينهما عند أي إعادة تصميم.
- ورشة الاعتمادات (قسم 5.19) تعتمد على توفر `GOOGLE_WEBAPP_URL`/`GOOGLE_WEBAPP_SECRET` في env الـ Backend — بدونها الميزة تتعطل تلقائيًا (fail-safe، وليس crash).
- نظام الموديولات/الصلاحيات (قسم 4) مفروض على مستويين (واجهة + سيرفر) — أي تعديل مستقبلي على تابات جديدة لازم يُضاف في الاثنين معًا (`ALL_MODULES` في app.js **و** middleware `requireModule` في الـ backend) وإلا هيبقى فيه ثغرة صلاحيات.
- ملفات `app.js.pre-submit.bak` و`app.js.supabase.bak` هما لقطات تاريخية لأغراض الرجوع فقط — لا تُستدعى من أي مكان في التطبيق الحي، وممكن حذفهما بأمان لو مفيش حاجة تانية بتعتمد عليهم.
- `debug-out.xlsx` و`debug-x/` ملفات/فولدرات تطوير مؤقتة (من `dev-server.js`) — مش جزء من بيانات أو منطق التطبيق.

---

## 12. وحدة المخازن (Inventory) — مكتملة، غير منشورة بعد

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

### الاختبارات — `tests/inventory.test.ts` (11 اختبار، الإجمالي 56)
حماية الوحدة، الكود الفريد، الحركات وسبب التسوية الإلزامي، رفض الكمية غير الكافية، دورة الصرف كاملة، **الفشل الذري بدون خصم جزئي** لو بند واحد نقص بعد الاعتماد، عزل طلبات المهندس، لقطة طلب الشراء، الاستيراد الجماعي، صلاحيات الوحدات والفئات.

### قرارات مسجلة
مخزن واحد حاليًا (حقل `site` جاهز للمستقبل ومُتجاهل) · الأدمن هو أمين المخزن في الـ MVP · طلب أكبر من المتاح = رفض فوري + توجيه لطلب شراء أو التواصل مع مدير التنفيذ · الوحدة **مش في `DEFAULT_MODULES`** — أي نشر لن يُظهرها لأحد حتى يفعّلها الأدمن حسابًا بحساب.
