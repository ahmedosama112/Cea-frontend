# =============================================================
#  تجهيز موديل محلي (بدون نت) لمشروع CEA — خطة احتياطية
#  يتسطّب كله على E:\llm لأن C: فيه 1.2 GB بس فاضية.
#  يتشغّل مرة واحدة وانت متصل بالنت. بعد كده يشتغل offline.
#  التشغيل:  powershell -ExecutionPolicy Bypass -File local-ai\setup-offline-ai.ps1
# =============================================================

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root      = 'E:\llm'
$OllamaDir = Join-Path $Root 'ollama'
$ModelsDir = Join-Path $Root 'models'
$VenvDir   = Join-Path $Root 'venv'
$CacheDir  = Join-Path $Root 'pip-cache'
$OllamaExe = Join-Path $OllamaDir 'ollama.exe'

function Step($n, $t) { Write-Host "`n[$n] $t" -ForegroundColor Cyan }
function Ok($t)       { Write-Host "    OK - $t" -ForegroundColor Green }
function Warn($t)     { Write-Host "    !  $t" -ForegroundColor Yellow }

# ---------- 0) فحص المساحة ----------
Step 0 'فحص المساحة على E:'
$free = (Get-PSDrive -Name E).Free / 1GB
Write-Host ("    E: فيها {0:N1} GB فاضية" -f $free)
if ($free -lt 20) { throw "محتاج 20 GB على الأقل على E:. المتاح $([math]::Round($free,1)) GB" }
Ok 'المساحة كافية'

# ---------- 1) المجلدات ----------
Step 1 'إنشاء المجلدات'
foreach ($d in @($Root, $OllamaDir, $ModelsDir, $CacheDir)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}
Ok $Root

# ---------- 2) متغيرات البيئة ----------
# دي أهم خطوة: من غيرها Ollama بيكتب الموديلات في C:\Users\uo\.ollama ويفضّي القرص
Step 2 'ضبط متغيرات البيئة (User scope)'
$envs = @{
    'OLLAMA_MODELS'      = $ModelsDir          # مكان الموديلات -> E:
    'OLLAMA_HOST'        = '127.0.0.1:11434'   # محلي فقط، مش متاح على الشبكة
    'OLLAMA_KEEP_ALIVE'  = '30m'               # يفضل الموديل في الرام بدل ما يعيد تحميله
    'OLLAMA_NUM_PARALLEL'= '1'                 # 16 GB رام مش هتستحمل أكتر
    'OLLAMA_MAX_LOADED_MODELS' = '1'
    # إجباري: كارت GT 1030 معماريته (Pascal) أقدم من CUDA اللي Ollama متبني عليه،
    # ولو حاول يستخدمه بينهار بـ 0xc0000409 "unsupported toolchain".
    #
    # مقيس فعليًا: CUDA_VISIBLE_DEVICES='-1' لوحده *مش كفاية* — Ollama فضل
    # يوزّع الطبقات على الكارت (ollama ps بيقول "60%/40% CPU/GPU") والتوليد بيتعلّق.
    # اللي بيشتغل فعلاً هو OLLAMA_LLM_LIBRARY=cpu.
    # للتأكد بعد أي تغيير:  ollama ps  ->  لازم يقول "100% CPU"
    'OLLAMA_LLM_LIBRARY' = 'cpu'
    'CUDA_VISIBLE_DEVICES' = ''
    'PIP_CACHE_DIR'      = $CacheDir           # كاش pip -> E: (C: مفيهاش مكان)
    'OLLAMA_API_BASE'    = 'http://127.0.0.1:11434'  # aider بيقرا ده
}
foreach ($k in $envs.Keys) {
    [Environment]::SetEnvironmentVariable($k, $envs[$k], 'User')
    Set-Item -Path "env:$k" -Value $envs[$k]
}
# PATH بـ SetEnvironmentVariable مش setx (setx بيقص عند 1024 حرف ويبوّظ الـ PATH)
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notlike "*$OllamaDir*") {
    [Environment]::SetEnvironmentVariable('Path', "$userPath;$OllamaDir", 'User')
}
$env:Path = "$env:Path;$OllamaDir"
Ok ('الموديلات هتتخزن في ' + $ModelsDir)
# ---------- 3) تنزيل Ollama (نسخة zip بدون installer) ----------
Step 3 'تنزيل Ollama'
if (Test-Path $OllamaExe) {
    Warn 'Ollama موجود بالفعل - تخطي'
} else {
    # مهم: التحميل على E: مش على $env:TEMP — لأن TEMP على C: وفيها 1.2 GB بس
    # والملف نفسه 1.4 GB. لو نزل على C: كان هيفشل ويملّي القرص.
    $TmpDir = Join-Path $Root 'tmp'
    if (-not (Test-Path $TmpDir)) { New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null }
    $zip = Join-Path $TmpDir 'ollama-windows-amd64.zip'
    $url = 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip'

    # تحميل يدوي بدل Invoke-WebRequest عشان النسبة تتطبع في المخرجات وتقدر تتابعها
    $resp = $null; $in = $null; $out = $null
    try {
        # استئناف: لو التحميل اتقطع، نكمّل من مكانه مش من الأول
        $have = 0
        if (Test-Path $zip) { $have = (Get-Item $zip).Length }

        $req = [Net.HttpWebRequest]::Create($url)
        $req.UserAgent = 'Mozilla/5.0'
        $req.Timeout   = 60000
        if ($have -gt 0) {
            $req.AddRange($have)
            Write-Host ("    لقيت {0:N0} MB نازلة قبل كده - بكمّل من مكانها" -f ($have/1MB))
        }
        $resp = $req.GetResponse()

        # 206 = السيرفر وافق يكمّل | 200 = رفض، يبقى من الأول
        if ($resp.StatusCode -eq [Net.HttpStatusCode]::PartialContent) {
            $total = $have + $resp.ContentLength
            $out   = [IO.File]::Open($zip, [IO.FileMode]::Append)
            $done  = $have
        } else {
            $total = $resp.ContentLength
            $out   = [IO.File]::Create($zip)
            $done  = 0
            if ($have -gt 0) { Warn 'السيرفر مبيدعمش الاستئناف - بيبدأ من الأول' }
        }
        Write-Host ("    الحجم الكلي: {0:N0} MB  ->  $zip" -f ($total/1MB))

        $in   = $resp.GetResponseStream()
        $buf  = New-Object byte[] 1048576
        $lastPct = -1
        while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
            $out.Write($buf, 0, $n)
            $done += $n
            $pct = [int](100 * $done / $total)
            if ($pct -ge $lastPct + 2) {
                $lastPct = $pct
                Write-Host ("    {0,3}%   {1:N0} / {2:N0} MB" -f $pct, ($done/1MB), ($total/1MB))
            }
        }
    } finally {
        if ($out)  { $out.Close() }
        if ($in)   { $in.Close() }
        if ($resp) { $resp.Close() }
    }
    Write-Host '    بيفك الضغط...'
    Expand-Archive -Path $zip -DestinationPath $OllamaDir -Force
    Remove-Item $zip -Force
    if (-not (Test-Path $OllamaExe)) { throw "ollama.exe مالقيتهوش في $OllamaDir" }
    Ok ('اتسطّب في ' + $OllamaDir)
}

# ---------- 4) تشغيل السيرفر ----------
Step 4 'تشغيل خادم Ollama'
$running = $false
try {
    Invoke-WebRequest -Uri 'http://127.0.0.1:11434' -UseBasicParsing -TimeoutSec 3 | Out-Null
    $running = $true
} catch { }
if ($running) {
    Warn 'شغال بالفعل'
} else {
    Start-Process -FilePath $OllamaExe -ArgumentList 'serve' -WindowStyle Hidden
    $up = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        try {
            Invoke-WebRequest -Uri 'http://127.0.0.1:11434' -UseBasicParsing -TimeoutSec 2 | Out-Null
            $up = $true; break
        } catch { }
    }
    if (-not $up) { throw 'الخادم مقامش خلال 30 ثانية' }
    Ok 'شغال على 127.0.0.1:11434'
}

# ---------- 5) تنزيل الموديلات ----------
# qwen2.5-coder:7b  ~4.7 GB - الأساسي، أحسن جودة كود تقدر عليها 16 GB DDR3
# qwen2.5-coder:3b  ~1.9 GB - السريع، للأسئلة القصيرة والتعديلات الصغيرة
Step 5 'تنزيل الموديلات (~6.6 GB اجمالي)'
& $OllamaExe pull qwen2.5-coder:7b
if (-not $?) { throw 'فشل تنزيل qwen2.5-coder:7b' }
& $OllamaExe pull qwen2.5-coder:3b
if (-not $?) { throw 'فشل تنزيل qwen2.5-coder:3b' }
Ok 'الموديلات جاهزة'

# ---------- 6) aider في venv على E: ----------
Step 6 'تجهيز aider'
if (Test-Path (Join-Path $VenvDir 'Scripts\aider.exe')) {
    Warn 'aider موجود بالفعل - تخطي'
} else {
    python -m venv $VenvDir
    if (-not $?) { throw 'فشل إنشاء venv - اتأكد إن python في الـ PATH' }
    $pip = Join-Path $VenvDir 'Scripts\pip.exe'
    & $pip install --upgrade pip
    & $pip install aider-chat
    if (-not $?) { throw 'فشل تنصيب aider-chat' }
    Ok ('aider اتسطّب في ' + $VenvDir)
}

# ---------- خلاص ----------
Write-Host "`n===================================================" -ForegroundColor Green
Write-Host " تمام. الشغل كله على E:\llm - و C: مالمستهاش." -ForegroundColor Green
Write-Host " التشغيل من دلوقتي:  local-ai\ai.ps1" -ForegroundColor Green
Write-Host " من هنا ورايح مش محتاج نت خالص." -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
