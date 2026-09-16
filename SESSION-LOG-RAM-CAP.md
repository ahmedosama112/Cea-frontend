# سجل جلسة: تكبيح رام MySQL على Railway

> **النتيجة باختصار: رام MySQL نزلت من 750 MB لـ ~206 MB، والتطبيق شغال عادي.**
> التاريخ: **2026-09-16** (~17:20 بتوقيت القاهرة). المشروع على Railway: `zooming-possibility` · خدمة `MySQL` (`mysql:9.7.2`).
> مرتبط بـ: [SESSION-LOG-BACKUP-RESTORE.md](SESSION-LOG-BACKUP-RESTORE.md) · [MIGRATION-RAILWAY-TO-HOSTINGER.md](MIGRATION-RAILWAY-TO-HOSTINGER.md)

---

## ليه عملناها

صاحب المشروع **متفق مع شركته على $5 في الشهر** لاستضافة Railway. لوحة الفوترة (15 سبتمبر) كانت بتقول:

| البند | القيمة |
|---|---|
| سعر الرام | $0.000231 / GB / دقيقة ≈ **$9.98 لكل 1 GB شهريًا** |
| نصيب الرام من الفاتورة | **~97%** (المعالج والشبكة والـ Volume قروش) |
| استهلاك الشهر المتوقع | **~$8.26** |
| الـ "Estimated Bill $2.36" | = الزيادة **فوق** الـ $5 المدفوعة في خطة Hobby، بعد خصم $0.90 كريديت |

**الحد المسموح عشان نفضل تحت $5:** حوالي **470 MB رام إجمالي** (MySQL + backend).

والسبب كان واضح: سطر تشغيل MySQL في قالب Railway فيه **`--innodb-buffer-pool-size=1G`** صراحةً، مع إن البيانات كلها **~4 MB**.

> ملحوظة تاريخية: الموضوع اتفتح 15 سبتمبر واتلغى ساعتها ("علشان منبوظش حاجة"). اتعمل 16 سبتمبر بعد ما اتضح شرط الـ $5، وبشرط إن الرجوع سهل.

---

## القياس قبل التغيير (قراءة مباشرة من السيرفر)

| | القيمة |
|---|---|
| رام عملية `mysqld` (VmRSS) | **750 MB** |
| `innodb_buffer_pool_size` | 1024 MB مقسومين على **4** instances |
| `innodb_buffer_pool_chunk_size` | 128 MB |
| `innodb_log_buffer_size` | 64 MB |
| `max_connections` | 151 |
| **أقصى اتصالات حصلت فعلًا** (`Max_used_connections`) | **31** |
| `table_open_cache` | 4000 |
| متغيرات محفوظة (`persisted_variables`) | **0** — ملف `mysqld-auto.cnf` فاضي (14 بايت، اتنضّف 15 سبتمبر) |
| رام الـ backend (`cea-backend`) | ~78 MB |

---

## اللي اتعمل بالترتيب

### ١) نسخة احتياطية جديدة
من **Git Bash** (مش PowerShell — `>` في PowerShell 5.1 بيحفظ UTF-16 وبيبوّظ العربي):

```bash
cd "/e/fabel max cea project/backend"
railway ssh -s MySQL 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --no-tablespaces railway' > ../backups/cea-db-before-ramcap-20260916.sql
```

- الأمر بيشتغل **جوّه سيرفر MySQL**؛ الباسورد متغيّر على السيرفر ومابيعدّيش على الجهاز.
- `--single-transaction` = من غير قفل جداول، المهندسين ماحسّوش بحاجة.
- **الملف اتفحص:** 1.59 MB · 34 جدول · 26 جملة INSERT · آخره `Dump completed on 2026-09-16 17:12:25` · UTF-8 سليم · صفر CRLF.
- التحذيرات (password / GTID / Config as Code) طلعت على الشاشة بس، مادخلتش الملف. تحذير GTID موجود في نسخة 15 سبتمبر اللي اتجرّب استرجاعها ونجح.

> ⚠ لو اللصق مش شغال في Git Bash: **Shift+Insert** أو كليك يمين ← Paste (Ctrl+V مش بيشتغل هناك).

### ٢) تغيير سطر التشغيل
Railway ← خدمة **MySQL** ← **Settings** ← **Deploy** ← **Custom Start Command** ← لصق السطر الجديد ← **Deploy**.

### ٣) التحقق بعد إعادة التشغيل
MySQL قام في **أقل من دقيقة**.

| | قبل | بعد |
|---|---|---|
| **رام MySQL (VmRSS)** | 750 MB | **~206 MB** |
| buffer pool | 1024 MB × 4 | **128 MB × 1** |
| log buffer | 64 MB | **16 MB** |
| جداول قاعدة `railway` | 34 | **34** |
| `/health` | — | **HTTP 200 `{"status":"ok"}`** |

`/health` في `backend/src/app.ts` بيعمل **`SELECT 1` حقيقي عبر Prisma** — يعني 200 = الـ backend متصل بالقاعدة الجديدة فعلًا، مش بس السيرفر رد. وكمان اتصال الـ backend ظهر في قايمة الاتصالات.

---

## السطور (المرجع الأهم في الملف)

### ✅ السطر الحالي (بعد التكبيح)
```
docker-entrypoint.sh mysqld --innodb-use-native-aio=0 --disable-log-bin --performance_schema=0 --innodb-buffer-pool-size=128M --innodb-buffer-pool-instances=1 --innodb-log-buffer-size=16M
```

### ↩️ سطر الرجوع (الأصلي من قالب Railway)
```
docker-entrypoint.sh mysqld --innodb-use-native-aio=0 --disable-log-bin --performance_schema=0 --innodb-buffer-pool-size=1G
```

الفرق **حاجتين بس**: `1G` ← `128M` (+ instance واحد)، و log buffer من 64M (افتراضي) ← `16M`. كل الباقي بالحرف زي قالب Railway.

---

## 🚨 خطة الرجوع لو حصلت مشكلة

### امتى نرجع؟
| العَرَض | نرجع؟ |
|---|---|
| MySQL **مش بيقوم** بعد Deploy (الخدمة Crashed / بتعيد نفسها) | **✅ فورًا** |
| `/health` بيرجع **503 `db_unreachable`** لأكتر من دقيقتين | **✅ فورًا** |
| المهندسين بيشتكوا إن التطبيق **بطيء بشكل واضح** والـ hit ratio تحت (شوف "المراقبة") | ✅ |
| لوجات MySQL فيها `Out of memory` أو `Cannot allocate memory` | ✅ |
| الرام في الرسم طلعت أعلى من المتوقع بس التطبيق شغال | ❌ — ده موضوع فاتورة مش عطل، نحسب الأول |
| مهندس واحد مش شايف بياناته | ❌ — غالبًا مشكلة شبكة/أوفلاين عنده، مش القاعدة. شيك `/health` الأول |

### خطوات الرجوع (دقيقتين)
1. Railway ← **MySQL** ← **Settings** ← **Deploy** ← **Custom Start Command**.
2. امسح الخانة كلها والصق **سطر الرجوع** اللي فوق بالظبط.
3. اضغط **Deploy** من الشريط اللي بيظهر فوق.
4. استنى دقيقة، وافتح:
   ```
   https://cea-backend-production-5cbe.up.railway.app/health
   ```
   لازم ترجع `{"success":true,"status":"ok"}`.
5. للتأكد إن الإعداد رجع فعلًا (Git Bash):
   ```bash
   cd "/e/fabel max cea project/backend"
   railway ssh -s MySQL 'tr "\0" " " < /proc/1/cmdline; echo; grep VmRSS /proc/1/status'
   ```
   لازم تشوف `--innodb-buffer-pool-size=1G` والرام حوالي 750 MB.

**الرجوع مابيلمسش البيانات:** البيانات على الـ Volume، والسطر بيتحكّم في الذاكرة وقت التشغيل بس. الرجوع = نفس الحالة اللي كانت شغالة قبل 16 سبتمبر بالظبط.

### ⚠ لو الرجوع نفسه ماحلّش (الملجأ الأخير — احتمال بعيد جدًا)
- **ماتلمسش الـ Volume ولا تمسح الخدمة.**
- اتأكد مفيش ملف `mysqld-auto.cnf` فيه إعدادات بتغطّي على السطر:
  ```bash
  railway ssh -s MySQL 'cat /var/lib/mysql/mysqld-auto.cnf; echo; mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SELECT * FROM performance_schema.persisted_variables;"'
  ```
  لو فيه متغيرات: `RESET PERSIST <اسم_المتغير>;` وأعد التشغيل. (في 16 سبتمبر كان **صفر**.)
- استرجاع النسخة الاحتياطية **آخر حل خالص** لو البيانات نفسها اتأثرت (وده مش متوقع من تغيير رام). النسخة: `backups/cea-db-before-ramcap-20260916.sql`.
  ⚠ **الاسترجاع على الإنتاج ماتجرّبش قبل كده** — اللي اتجرّب هو الاسترجاع **محليًا على XAMPP** (شوف SESSION-LOG-BACKUP-RESTORE.md). ماتعملوش على الإنتاج من غير ما تبدأ جلسة مخصوصة له، لأن أي شغل اتعمل بعد 17:12 يوم 16 سبتمبر هيضيع.

---

## المراقبة — نعرف منين إن الـ 128M كفاية

**١) الرام في الفوترة:** Railway ← Usage ← المشروع ← RAM. المتوقع ~300–380 MB إجمالي بعد ما الكاش يتملي.

> ⚠ **رسم صفحة Usage متأخر وبيقفز لفوق وقت الـ Deploy — ده مش عطل.** بعد التكبيح مباشرة الرسم **طلع لفوق ~1.1 GB** بدل ما ينزل.
> السبب: وقت الـ Deploy Railway بيشغّل النسخة الجديدة قبل ما يشيل القديمة، فلحظات كان فيه MySQL قديم (750 MB) + جديد + الـ backend. والرسم ده **مجمّع على فترات طويلة**، فالخطوة الأخيرة شايلة لحظة التداخل دي.
> القياس المباشر في نفس الوقت (cgroup): **MySQL 204 MB + backend 86 MB ≈ 290 MB**، وdeployment واحد بس شغال (`55c6c6c5`، القديم `REMOVED`).
> **للقياس الفوري:** خدمة MySQL ← تاب **Metrics** (مش صفحة Usage)، أو أمر `VmRSS` تحت. صفحة Usage تتشاف بعد ساعتين على الأقل.

**٢) نسبة القراءة من الديسك (الـ hit ratio):**
```bash
railway ssh -s MySQL 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" -N -e "SHOW GLOBAL STATUS WHERE Variable_name IN (\"Innodb_buffer_pool_reads\",\"Innodb_buffer_pool_read_requests\",\"Innodb_buffer_pool_pages_free\",\"Innodb_buffer_pool_pages_total\");"'
```
- `Innodb_buffer_pool_reads` ÷ `Innodb_buffer_pool_read_requests` = نسبة الطلبات اللي اضطرت تقرا من الديسك. **تحت 1% = ممتاز.**
- `pages_free` لسه كبير = الكاش مش مليان أصلًا (متوقع — البيانات 4 MB والكاش 128 MB).

---

## الفاتورة المتوقعة بعد التكبيح

| | الرام الإجمالية | استهلاك الشهر |
|---|---|---|
| قبل | ~843 MB | ~$8.3 |
| بعد الإقلاع مباشرة | ~285 MB | ~$3.1 |
| بعد ما الكاش يتملي (تقدير) | ~350–380 MB | **~$3.8–4.1** |
| **الحد** | **470 MB** | **$5.00** |

= **هتدفع $5 بالظبط** (خطة Hobby). **لسه تقدير** — يتأكد بصورة الرام بعد يوم شغل حقيقي.

---

## المرحلة ٢ (مش محتاجينها دلوقتي) — لو الاستهلاك طلع فوق $5

إضافات لنفس السطر، **واحدة في المرة**:

| الإعداد | ليه | تحذير |
|---|---|---|
| `--max-connections=50` | كل اتصال بيحجز buffers خاصة بيه | أقصى اتصالات فعلية كانت **31** — **ماتنزلش تحت 50** |
| `--table-open-cache=400` | الافتراضي 4000 وعندنا 34 جدول بس | — |
| `--innodb-log-buffer-size=8M` | من 16M | مكسب صغير |

`--max-connections=50` نفسه هو اللي فريق Railway نفسه بيقترحه (المصادر تحت).

**مرفوض كوسيلة توفير:**
- **النقل لـ Hostinger** — أرخص KVM بـ $6.49/شهر، يعني فوق الميزانية أصلًا.
- **تقليل رام الـ backend** — 78 MB كلها، أقل من دولار.
- **SQLite** — الـ schema فيه 8 enums وPrisma مابيدعمش enums على SQLite.

---

## مصادر من النت

- **[Reduce memory usage of MySQL DB — Railway Help Station](https://station.railway.com/questions/reduce-memory-usage-of-my-sql-db-026c0811)** — نفس مشكلتنا بالظبط على Railway. الرد اقترح سطر تشغيل **شبه مطابق** لسطرنا:
  `docker-entrypoint.sh mysqld --innodb-use-native-aio=0 --disable-log-bin --performance_schema=0 --innodb_buffer_pool_size=128M --max_connections=50`
  وذكر إن MySQL بيستهلك عادةً **~250 MB** بعد كده — قريب جدًا من الـ ~206 MB اللي قسناها.
- **[High MySQL InnoDB cluster memory usage — Railway Help Station](https://station.railway.com/questions/high-my-sql-inno-db-cluster-memory-usage-ebc19325)** — فريق Railway وجّه لنفس الاتجاه: `max_connections` وملف الإعدادات.
- **[How to Optimize MySQL Server for Low Memory Environments — OneUptime](https://oneuptime.com/blog/post/2026-03-31-mysql-optimize-low-memory/view)** — بيأكد إن **`innodb_buffer_pool_instances = 1`** هو الصح تحت 1 GB (أكتر من instance بيزوّد overhead من غير فايدة)، وإن 128M مناسب لقاعدة صغيرة جدًا.
- **[Adjusting MySQL 8.0 Memory Parameters — Percona](https://www.percona.com/blog/adjusting-mysql-8-0-memory-parameters/)** — مرجع للـ buffers الخاصة بكل اتصال.
- **[How MySQL Uses Memory — MySQL 9.7 Reference Manual](https://dev.mysql.com/doc/en/memory-use.html)** — التوثيق الرسمي للنسخة اللي عندنا.
- **[Configuring InnoDB Buffer Pool Size — MySQL 8.4 Manual](https://dev.mysql.com/doc/refman/8.4/en/innodb-buffer-pool-resize.html)** — بيشرح ليه التغيير وهو شغال فشل يوم 15 سبتمبر: الحجم لازم يكون مضاعف لـ `chunk_size × instances` (128M × 4 = 512M كحد أدنى)، والحل كان تغيير `instances` وقت الإقلاع.
