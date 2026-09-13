# دليل نقل الـ Backend من Railway إلى Hostinger

> **ملف توثيق فقط — لا شيء في هذا الملف مُنفَّذ.** كُتب يوم 2026-08-29، وآخر تحديث **2026-09-13**.
> مرجع كامل لأي شخص (أو أي موديل AI) ينفّذ النقل لاحقًا خطوة بخطوة.
> اقرأ [SYSTEM_REFERENCE.md](SYSTEM_REFERENCE.md) أولًا لو محتاج فهم أعمق للنظام.

## ⭐ ليه النقل أصلًا — الأرقام (قياس فعلي 2026-09-13)

`railway metrics --all --since 7d`:

| الخدمة | الرام | المعالج | القرص |
|---|---|---|---|
| **MySQL** | **813 MB / 1024** | < 0.01 vCPU | 245 MB |
| cea-backend | 211 MB / 1024 | < 0.01 vCPU | 49 MB |

Railway بيحاسب على الرام أساسًا. القاعدة واخدة **٤ أضعاف** التطبيق وهي ساكنة، وبياناتها
الحقيقية أقل من ميجا (النسخة الاحتياطية اليومية 708 KB). يعني أغلب الفاتورة بتتدفع مقابل
رام بيحجزها MySQL لنفسه (buffer pool) بغض النظر عن حجم البيانات.

**الاستهلاك الكلي ≈ 1 GB رام و300 MB قرص** — ده مقياس اختيار الخطة تحت.

---

## 1. الوضع الحالي (قبل النقل)

| المكوّن | مكانه | ملاحظات |
|---|---|---|
| الواجهة (PWA) | Cloudflare Pages — مشروع `cea-app` → https://cea-app.pages.dev | **لا تُنقل** — تفضل مكانها، هيتغير فيها سطر واحد بس (عنوان الـ API) |
| الـ Backend (Node/Express/Prisma) | Railway — مشروع `zooming-possibility` → خدمة `cea-backend` | https://cea-backend-production-5cbe.up.railway.app — Docker من `backend/Dockerfile`، بيسمع على `PORT` (Railway بيمرره 8080) |
| قاعدة البيانات MySQL | Railway — خدمة `MySQL` (قاعدة اسمها `railway`) | وصول خارجي عبر TCP Proxy: `thomas.proxy.rlwy.net:38986` (اليوزر `root`) |
| ملفات مرفوعة (اعتمادات/توقيعات/صور) | Railway Volume على `/data/uploads` | **لازم تتنقل مع الداتا** — من غيرها تنزيل ملفات التسليمات القديمة هيبوظ |
| Google Apps Script (شيتين جريني/أزاليا) | حساب جوجل — مش على Railway | **لا يتأثر بالنقل إطلاقًا** — السيرفر بيندهه outbound فقط |
| الكود المصدري | GitHub: `ahmedosama112/cea-backend` (فولدر `backend/` هو الريبو) | (تحديث 2026-09-13) Railway بقى بينشر **من GitHub تلقائيًا** مع كل `git push origin main` — مش `railway up` |

### متغيرات البيئة الحالية على Railway (خدمة cea-backend)

انسخ **القيم الفعلية** من Railway → cea-backend → Variables قبل ما تقفل أي حاجة:

| المتغير | ملاحظة |
|---|---|
| `DATABASE_URL` | هيتغير لعنوان قاعدة Hostinger الجديدة |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | **انقلهم زي ما هم بالظبط** — لو اتغيروا كل المستخدمين هيتسجل خروجهم |
| `GOOGLE_WEBAPP_URL` / `GOOGLE_WEBAPP_SECRET` | ربط شيت جريني (الموقع 1) — زي ما هم |
| `GOOGLE_WEBAPP_URL_2` / `GOOGLE_WEBAPP_SECRET_2` | ربط شيت أزاليا (الموقع 2) — زي ما هم |
| `CORS_ORIGIN` | خليه `https://cea-app.pages.dev` (حاليًا `*` — دي فرصة تصليحها) |
| `NODE_ENV` | `production` |
| `UPLOAD_DIR` | حاليًا `/data/uploads` — في الإعداد الجديد تحت هيبقى `/app/uploads` (mount) |
| `RATE_LIMIT_MAX` | `1200` |
| `ACCESS_TOKEN_TTL_MIN` / `REFRESH_TOKEN_TTL_DAYS` / `BCRYPT_ROUNDS` | اختيارية — ليها defaults في `src/config/env.ts` |

---

## 2. المطلوب على Hostinger

⚠️ **الاستضافة المشتركة (Shared/Cloud hosting) لا تصلح** — البرنامج محتاج Node.js دائم التشغيل + MySQL + كتابة ملفات على القرص. المطلوب **Hostinger VPS**، أوبنتو 22.04/24.04.

**الخطة: KVM 1 كفاية بفارق كبير** (أسعار معروضة 2026-09-13):

| الخطة | المواصفات | السعر |
|---|---|---|
| **KVM 1** ✅ | 1 vCPU · **4 GB رام** · 50 GB NVMe | ‎$6.49‏/شهر بعقد سنتين مدفوع مقدمًا · التجديد ‎$11.99‏ |
| KVM 2 | 2 vCPU · 8 GB · 100 GB | ‎$8.99‏/شهر · التجديد ‎$14.99‏ |

الاستهلاك المقاس (1 GB رام · 300 MB قرص) يعني KVM 1 فيه **٤ أضعاف** الرام المطلوبة
و**١٥٠ ضعف** المساحة. متدفعش في أكبر من كده.

**مقارنة سنتين:** Railway بالمعدل الحالي (~$16/شهر) ≈ **$384** · KVM 1 = **$155**.

**مهم:** فيه **ضمان استرجاع ٣٠ يوم** — انقل، جرّب شهر كامل بشغل حقيقي، ولو مانفعش استرجع فلوسك.
ودومين مجاني سنة (بيحل موضوع الـHTTPS تحت)، ونسخ احتياطي أسبوعي + snapshots من عندهم
فوق نسختك اليومية على Drive.

الأسهل والأقرب لإعداد Railway الحالي: **Docker Compose** (نفس الـ Dockerfile الموجود، من غير أي تعديل كود).

---

## 3. خطوات النقل

### ⏱ نافذة النقل — إزاي تجمّد النظام من غير مجال للخطأ

**الخطر الحقيقي في أي نقل:** جهاز يزامن شغل جديد على القاعدة **القديمة** بعد ما تكون سحبت
النسخة الأخيرة. الشغل ده بيضيع في صمت — محدش يلاحظه إلا بعد أيام.

**الحل: جمّد قبل ما تسحب.**

#### المفتاح الصح: إيقاف خدمة `cea-backend` من لوحة Railway

**متكسرش الدومين ولا تمسح سجل DNS.** الـDNS بيتكاش عند المستخدمين ومزودي الخدمة، فالكسر
بياخد وقت يسري والرجوع بياخد وقت أطول — وإنت عايز مفتاح لحظي في الاتجاهين.

إيقاف الخدمة: لحظي · الرجوع لحظي · والقاعدة بتفضل شغالة عشان تسحب منها النسخة الأخيرة.
**أوقف `cea-backend` بس — سيب `MySQL` شغالة.**

#### ليه التجميد مش بيوقف شغل المهندسين

التطبيق **أوفلاين-أول**. لما الـAPI يقف:

| الشغل | بيحصل إيه |
|---|---|
| تسجيل سركي · تعديل · حذف | ✅ شغال عادي — بيتحفظ على الجهاز والمزامنة تتأجل |
| إرسال كشف · اعتمادات · طلبات إيجار · تحليلات | ⛔ متقفلة (وده المطلوب) |

يعني التجميد بيأجل المزامنة، مش بيوقف الشغل.

#### الترتيب الإلزامي

| # | الخطوة | ليه بالترتيب ده |
|---|---|---|
| ١ | **أوقف خدمة `cea-backend`** (مش MySQL) | من اللحظة دي مستحيل أي جهاز يكتب في القاعدة القديمة |
| ٢ | اسحب النسخة الأخيرة — قاعدة + ملفات (الخطوة 0) | القاعدة ساكنة، فالنسخة مضمونة إنها آخر حاجة فعلًا |
| ٣ | ابنِ السيرفر الجديد واستورد (الخطوات 1–4) | براحتك — محدش مستني |
| ٤ | **اختبر** (الخطوة 5) | قبل ما أي مستخدم يشوف السيرفر الجديد |
| ٥ | حوّل `API_URL` وانشر الواجهة (الخطوة 6) | الأجهزة تبدأ تروح للجديد وتزامن المتأخر |
| ٦ | سيب Railway واقف أسبوع (الخطوة 7) | خطة رجوع |

#### الرجوع لو حصلت مشكلة

رجّع `API_URL` للرابط القديم + انشر الواجهة + شغّل خدمة Railway تاني. **أقل من دقيقتين.**

#### التوقيت

- **يوم إجازة، أو برّه نوافذ الإرسال والاعتماد** (التطبيق فيه نوافذ زمنية يحددها الأدمن —
  برّاها محدش بيبعت أصلًا)
- **المهندس اللي التطبيق مفتوح عنده مش هياخد الرابط الجديد إلا لما يقفل ويفتح.** ده سبب
  إضافي ليوم الإجازة
- **بلّغهم قبلها بأسبوع:** "يوم كذا فيه صيانة — لو التطبيق قال مفيش نت، كمّل تسجيل عادي،
  شغلك محفوظ وهيتزامن لوحده"

**التوقف الفعلي للمستخدم ≈ ٢٠–٣٠ دقيقة** (من إيقاف الخدمة لحد نشر الواجهة الجديدة)، مش
الـ٣–٤ ساعات بتاعة النقل كله.

---

### الخطوة 0 — نسخ احتياطي كامل (قبل أي حاجة)

من جهاز فيه `mysql` client (موجود محليًا في `E:\mysql-8.0.46-winx64\bin`):

```bash
# باسورد root من Railway → خدمة MySQL → Variables → MYSQL_ROOT_PASSWORD
mysqldump -h thomas.proxy.rlwy.net -P 38986 -u root -p --single-transaction --routines railway > cea-db-backup.sql
```

الملفات المرفوعة (Volume): من فولدر `backend/` على جهاز متسجل دخول Railway CLI:

```bash
# من Git Bash على ويندوز (MSYS_NO_PATHCONV بيمنع تحويل مسار /data لمسار ويندوز)
# متطلبات أول مرة: مفتاح SSH محلي + railway ssh keys add (اتعملوا بالفعل على جهاز E:)
MSYS_NO_PATHCONV=1 railway ssh --service cea-backend -- tar czf - -C /data uploads > cea-uploads.tgz
# للتحقق: tar tzf cea-uploads.tgz | wc -l
```

> ✅ نسخة فعلية اتسحبت بنجاح يوم 2026-09-01 → `backups/uploads-2026-09-01.tgz` في فولدر المشروع. أعد السحب بنفس الأمر قبل النقل مباشرة.

> بديل لو `railway ssh` مش متاح: التطبيق فيه زرار نسخة احتياطية يدوية (لوحة الأدمن) بيرفع JSON كامل للقاعدة على Google Drive — بس ده للقاعدة فقط، مش بديل عن نسخ فولدر uploads.

### الخطوة 1 — تجهيز الـ VPS

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin
```

وجّه دومين (مثلًا `api.yourdomain.com`) بسجل A على IP الـ VPS — شهادة HTTPS هتتعمل تلقائيًا بـ Caddy تحت.

#### 1أ — تأمين السيرفر (قبل ما تحط أي بيانات عليه)

الفرق الجوهري عن Railway: هناك مكانش فيه سيرفر مكشوف على الإنترنت باسم مستخدم وباسورد.
هنا فيه — و**السيرفرات الجديدة بتتضرب بمحاولات دخول تلقائية خلال ساعات من تشغيلها**. الخطوات
دي مش رفاهية.

**١. مفتاح SSH بدل الباسورد**

من جهازك (مش من السيرفر):
```bash
ssh-keygen -t ed25519 -C "cea-vps"          # لو مالكش مفتاح
ssh-copy-id root@<IP-الـVPS>                 # بينسخ المفتاح للسيرفر
ssh root@<IP-الـVPS>                         # لازم يدخل من غير ما يسأل باسورد
```

⚠ **متعملش الخطوة اللي بعدها غير لما الدخول بالمفتاح ينجح فعلًا** — لو قفلت الباسورد
والمفتاح مش شغال، هتتقفل برّه السيرفر. (Hostinger عندهم console في اللوحة كخطة إنقاذ.)

وبعدها على السيرفر، في `/etc/ssh/sshd_config`:
```
PasswordAuthentication no
PermitRootLogin prohibit-password
```
ثم `systemctl restart ssh`.

**٢. الجدار الناري — اقفل كل حاجة إلا ٣ منافذ**

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp       # SSH
ufw allow 80/tcp       # HTTP (Caddy بيحتاجه لشهادة Let's Encrypt)
ufw allow 443/tcp      # HTTPS
ufw enable
ufw status verbose
```

⚠ **منفذ MySQL (3306) مايتفتحش خالص.** التطبيق بيوصل للقاعدة عبر شبكة Docker الداخلية
(`db:3306`) مش عبر الإنترنت. على Railway كان مكشوف عبر TCP proxy — متكررش ده.

للتأكد إن القاعدة مش مكشوفة، لازم `docker-compose.yml` **مايكونش فيه `ports:` تحت خدمة `db`**
(النسخة في الخطوة 3 مظبوطة كده عمدًا).

**٣. منع محاولات الدخول المتكررة**

```bash
apt install -y fail2ban
systemctl enable --now fail2ban
fail2ban-client status sshd
```

**٤. تحديثات أمنية تلقائية**

```bash
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades      # اختار Yes
```

**٥. تحقق سريع بعد ما تخلص**

```bash
ufw status                                   # لازم 22/80/443 بس
ss -tlnp | grep -E ":3306|:4000"             # المفروض مايظهروش على 0.0.0.0
```

من جهازك، اتأكد إن القاعدة فعلًا مقفولة من برّه:
```bash
nc -vz <IP-الـVPS> 3306                       # المفروض يفشل — وده المطلوب
```

### الخطوة 2 — رفع الكود

```bash
git clone https://github.com/ahmedosama112/cea-backend.git /opt/cea-backend
cd /opt/cea-backend
```

> تأكد إن آخر كود مدفوع على GitHub قبل النقل (`git log -1` محليًا في `backend/` وقارن). لو GitHub متأخر، ارفع الفولدر بـ scp/rsync بدل clone.

### الخطوة 3 — ملفات التشغيل على الـ VPS

أنشئ `/opt/cea-backend/docker-compose.yml`:

```yaml
services:
  db:
    image: mysql:8.0
    restart: unless-stopped
    # ⭐ أهم سطر في الملف ده: من غيره MySQL بيحجز ~800 MB رام لقاعدة بياناتها أقل من ميجا
    # (ده اللي كان بياكل أغلب فاتورة Railway). 256M أكتر من كفاية للحجم الحالي.
    command: ["--innodb-buffer-pool-size=256M", "--performance-schema=OFF"]
    environment:
      MYSQL_ROOT_PASSWORD: "غيّرني-باسورد-قوي"
      MYSQL_DATABASE: cea
    volumes:
      - db-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-p$$MYSQL_ROOT_PASSWORD"]
      interval: 5s
      retries: 20

  api:
    build: .
    restart: unless-stopped
    env_file: .env.production
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - uploads:/app/uploads

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data

volumes:
  db-data:
  uploads:
  caddy-data:
```

وملف `/opt/cea-backend/Caddyfile` (بدّل الدومين):

```
api.yourdomain.com {
    reverse_proxy api:4000
}
```

وملف `/opt/cea-backend/.env.production` (القيم من الجدول في القسم 1):

```
NODE_ENV=production
PORT=4000
DATABASE_URL=mysql://root:نفس-باسورد-db-اللي-فوق@db:3306/cea
CORS_ORIGIN=https://cea-app.pages.dev
JWT_ACCESS_SECRET=(انسخه من Railway حرفيًا)
JWT_REFRESH_SECRET=(انسخه من Railway حرفيًا)
UPLOAD_DIR=/app/uploads
MAX_UPLOAD_MB=8
RATE_LIMIT_MAX=1200
GOOGLE_WEBAPP_URL=(من Railway)
GOOGLE_WEBAPP_SECRET=(من Railway)
GOOGLE_WEBAPP_URL_2=(من Railway)
GOOGLE_WEBAPP_SECRET_2=(من Railway)
```

### الخطوة 4 — استيراد الداتا والملفات

```bash
cd /opt/cea-backend
docker compose up -d db          # شغّل القاعدة الأول لوحدها
# انقل cea-db-backup.sql و cea-uploads.tgz للسيرفر (scp)، ثم:
docker compose exec -T db mysql -u root -p"الباسورد" cea < cea-db-backup.sql
docker compose up -d api         # أول إقلاع بيشغّل prisma migrate deploy تلقائيًا (docker-start.sh)
docker compose cp cea-uploads.tgz api:/tmp/
docker compose exec api sh -c "tar xzf /tmp/cea-uploads.tgz -C /app && rm /tmp/cea-uploads.tgz"
docker compose up -d caddy
```

### الخطوة 5 — اختبار قبل التحويل

```bash
curl https://api.yourdomain.com/health
# المفروض: {"success":true,"status":"ok"}
```

- سجّل دخول بحساب حقيقي عبر الـ API الجديد (Postman/curl) وتأكد إن نفس الباسوردات شغالة (دليل إن القاعدة والـ JWT secrets اتنقلوا صح).
- نزّل ملف تسليم قديم (دليل إن uploads اتنقلت صح).

### الخطوة 6 — تحويل الواجهة على السيرفر الجديد

عنوان الـ API مكتوب في **سطر واحد** في `app.js` (السطر **5846** — اتأكد منه بـ
`grep -n "const API_URL" app.js` لأن الرقم بيتحرك مع كل تعديل):

```js
const API_URL = window.CEA_API_URL || 'https://cea-backend-production-5cbe.up.railway.app';
```

غيّر الرابط إلى `https://api.yourdomain.com`، ثم من فولدر المشروع:

```bash
node build-pwa.js
npx wrangler pages deploy pwa-dist --project-name cea-app --commit-dirty=true
```

الـ Service Worker بتاع التطبيق network-first — المستخدمين هياخدوا النسخة الجديدة تلقائيًا مع أول فتح متصل بالنت.

### الخطوة 7 — فترة مراقبة ثم إيقاف Railway

- **سيب Railway شغال أسبوعًا** كخطة رجوع — النقل مش بيمسح حاجة منه.
- **مهم:** بعد التحويل مباشرة، اعتبر قاعدة Railway مجمّدة — أي شغل بيحصل بيتسجل في قاعدة Hostinger فقط، والرجوع لـ Railway بعدها هيفقد الشغل الجديد (إلا لو عملت dump عكسي).
- بعد التأكد إن كل حاجة مستقرة: اقفل خدمتي `cea-backend` و`MySQL` من لوحة Railway (أو امسح المشروع) لإيقاف الفوترة.

---

### الخطوة 8 — بعد النقل: تأكد إن الجوبات الدورية شغالة

اتضافوا بعد ما الملف ده اتكتب، وكلهم بيشتغلوا من `src/server.ts` وقت الإقلاع:

| الجوب | كل قد إيه | العلامة في اللوج |
|---|---|---|
| نسخة احتياطية للقاعدة → Drive | يوميًا بعد 3 فجرًا UTC | `[backup]` |
| `sheetWatch` — ملاحظة الـDC من الشيت | كل 10 دقايق | `[sheetWatch]` — بيسجّل بس لما فيه تغيير |
| تنظيف التوكنات المنتهية | يوميًا | `[token-cleanup]` |

```bash
docker compose logs api --since 24h | grep -E "\[backup\]|\[sheetWatch\]|\[token-cleanup\]"
```

⚠ الجوبات دي بتحتاج `GOOGLE_WEBAPP_*` — لو ناقصة هتتعطّل في صمت (بتطبع
`[sheetWatch] معطّل — ربط جوجل غير مفعّل` عند الإقلاع).

---

## 4. حاجات لا تتغير في النقل (لا تلمسها)

- **Google Apps Script** (شيتي جريني وأزاليا + الفورمين + التوقيعات) — السيرفر بيندههم برابط خارجي، شغالين مع أي استضافة.
- **النسخة الاحتياطية اليومية DB→Drive** — جزء من كود السيرفر، هتشتغل من Hostinger تلقائيًا طالما متغيرات `GOOGLE_WEBAPP_*` متنقلة.
- **Cloudflare Pages** — الواجهة فضلت مكانها؛ التغيير الوحيد هو سطر `API_URL`.
- **حسابات المستخدمين وكلمات السر** — جوه القاعدة المتنقلة، ومع نفس الـ JWT secrets مفيش حد هيحس بحاجة.

## 5. مشاكل متوقعة وحلولها

| العرض | السبب الغالب | الحل |
|---|---|---|
| `api` بيعمل restart loop وأول سطر في اللوج عن migrations | `DATABASE_URL` غلط أو القاعدة لسه بتقلع | `docker compose logs api` — راجع الرابط والباسورد |
| تسجيل الدخول شغال بس الكل اتسجل خروجه | JWT secrets اتغيرت | انسخهم من Railway حرفيًا وأعد `docker compose up -d api` |
| CORS errors في المتصفح | `CORS_ORIGIN` ناقص أو غلط | لازم يساوي أصل الواجهة بالظبط: `https://cea-app.pages.dev` |
| تنزيل تسليم قديم بيرجع 404 بوضوح "الملف لم يعد موجودًا" | فولدر uploads ما اتنقلش أو اتفك في مكان غلط | الملفات لازم تكون تحت `/app/uploads` جوه كونتينر الـ api |
| شغل مهندس ضاع بعد النقل | جهاز زامن على القاعدة القديمة بعد سحب النسخة الأخيرة | ده اللي نافذة النقل بتمنعه — التجميد **قبل** السحب. لو حصل: شغّل Railway، اسحب dump تاني، وقارن السجلات الناقصة |
| اتقفلت برّه السيرفر بعد تعديل SSH | المفتاح مش مظبوط والباسورد اتقفل | ادخل من console الـVPS في لوحة Hostinger ورجّع `PasswordAuthentication yes` مؤقتًا |
| الشهادة مش بتتعمل (Caddy بيفشل) | منفذ 80 مقفول في `ufw` أو الدومين لسه ما وجّهش | `ufw allow 80/tcp` + اتأكد إن سجل A بيشاور على IP الـVPS |
| الاعتمادات مش بتوصل للشيتات | متغيرات `GOOGLE_WEBAPP_*` ناقصة | انقل الأربعة كلهم، وجرّب زرار "🔄 تحديث لتلقي ملاحظات DC" من التطبيق |
| ملاحظات الـDC مش بتتحدّث لوحدها | جوب `sheetWatch` مش شغال | شوف الخطوة 8 — الأغلب `GOOGLE_WEBAPP_*` ناقصة |
| "الإجمالي الفعلي" في التحليلات فاضي | طبيعي لو القاعدة اتنقلت لكن مفيش كشوف جديدة اتبعتت بعد النقل | العمود `approved_total` بيتملّي وقت الدفع لجوجل بس — الكشوف القديمة بتفضل "تقديرية" |

---

## 6. ملخص اللي اتغير من 2026-08-29 لـ 2026-09-13

الملف ده اتكتب قبل شغل كتير. الحاجات دي كلها **بتتنقل مع القاعدة والكود تلقائيًا** — مذكورة
هنا عشان اللي ينفّذ النقل يعرف إنها موجودة ويتأكد منها بعد النقل:

- **أعمدة جديدة في `submissions`**: `dc_note` · `dc_note_at` · `dc_note_seen_at` · `approved_total`
- **عمود جديد في `records`**: `rent_request_id` (قيد فريد — طلب إيجار واحد = سطر سركي واحد)
- **جدول طلبات الإيجار** (`rent_requests` + `rent_request_reviews`) وواجهته
- **عدد الـmigrations**: 32 (كان أقل وقت كتابة الملف) — `prisma migrate deploy` بيمشيهم كلهم
  بالترتيب عند أول إقلاع، مافيش خطوة يدوية
- **Apps Script اتعدّل**: `findRow` (بحث عن صف موجود قبل إنشاء صف جديد) — الكود بتاعه في
  `google-sheet/Code.gs` ومحتاج يتلزق وينشر في محرر Apps Script، **مش بيتأثر بالنقل**
