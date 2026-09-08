# =============================================================
#  تشغيل المساعد المحلي (بدون نت) على مشروع CEA
#
#  الاستخدام:
#     local-ai\ai.ps1 sw.js                  # الموديل الأساسي 7B
#     local-ai\ai.ps1 -Fast dev-server.js    # الموديل السريع 3B
#     local-ai\ai.ps1                        # من غير ملفات، وتضيفهم بـ /add جوه
# =============================================================

param(
    [switch]$Fast,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Files
)

$ErrorActionPreference = 'Stop'

$Root      = 'E:\llm'
$OllamaExe = Join-Path $Root 'ollama\ollama.exe'
$AiderExe  = Join-Path $Root 'venv\Scripts\aider.exe'
$Project   = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path $OllamaExe)) { throw "Ollama مش متسطّب. شغّل: local-ai\setup-offline-ai.ps1" }
if (-not (Test-Path $AiderExe))  { throw "aider مش متسطّب. شغّل: local-ai\setup-offline-ai.ps1" }

# --- تحذير الرام: الموديل 7B محتاج ~5.5 GB متفرغة ---
$freeRam = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB
$needed  = if ($Fast) { 2.5 } else { 5.5 }
Write-Host ("رام فاضية: {0:N1} GB (المطلوب ~{1} GB)" -f $freeRam, $needed)
if ($freeRam -lt $needed) {
    Write-Host "!  الرام مش كفاية. اقفل المتصفح/فوتوشوب الأول، وإلا هيشتغل من الـ pagefile وهيبقى بطيء جدًا." -ForegroundColor Yellow
    $ans = Read-Host "أكمّل برضه؟ (y/n)"
    if ($ans -ne 'y') { exit 1 }
}

# CPU فقط — كارت GT 1030 بينهّي llama-server بـ 0xc0000409 (CUDA toolchain قديم).
# CUDA_VISIBLE_DEVICES لوحده مش كفاية (مجرّب) — OLLAMA_LLM_LIBRARY هو الحاسم.
$env:OLLAMA_LLM_LIBRARY   = 'cpu'
$env:CUDA_VISIBLE_DEVICES = ''

# --- تشغيل الخادم لو مش شغال ---
$up = $false
try { Invoke-WebRequest 'http://127.0.0.1:11434' -UseBasicParsing -TimeoutSec 3 | Out-Null; $up = $true } catch { }
if (-not $up) {
    Write-Host 'بشغّل خادم Ollama...'
    Start-Process -FilePath $OllamaExe -ArgumentList 'serve' -WindowStyle Hidden
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        try { Invoke-WebRequest 'http://127.0.0.1:11434' -UseBasicParsing -TimeoutSec 2 | Out-Null; $up = $true; break } catch { }
    }
    if (-not $up) { throw 'الخادم مقامش' }
}

$env:OLLAMA_API_BASE = 'http://127.0.0.1:11434'
$model = if ($Fast) { 'ollama_chat/qwen2.5-coder:3b' } else { 'ollama_chat/qwen2.5-coder:7b' }

# =====  حارس الملفات — رفض مش تحذير  =====
# ملفات ممنوع الموديل المحلي يفتحها نهائيًا: قلب البرنامج، وكبيرة أوي عليه أصلاً.
$Protected = @('app.js', 'index (17).html', 'sw.js', 'manifest.webmanifest')

foreach ($f in $Files) {
    $name = Split-Path $f -Leaf
    if ($Protected -contains $name) {
        Write-Host "`n  مرفوض: '$name' ملف محمي." -ForegroundColor Red
        Write-Host "  السبب: ده قلب البرنامج، والموديل المحلي مش قدّه (app.js لوحده ~145 ألف توكن)." -ForegroundColor Red
        Write-Host "  البديل: اقص الدالة في local-ai\scratch\ واشتغل عليها، وارجّعها بإيدك.`n" -ForegroundColor Yellow
        exit 1
    }
    $p = Join-Path $Project $f
    if (Test-Path $p) {
        $tok = [int]((Get-Item $p).Length / 3.2)
        if ($tok -gt 6000) {
            Write-Host "`n  مرفوض: '$f' فيه ~$tok توكن، والحد 8192." -ForegroundColor Red
            Write-Host "  الموديل هيقرا ناقص من غير ما يقولك، والنتيجة هتبقى غلط.`n" -ForegroundColor Yellow
            exit 1
        }
    }
}

Push-Location $Project
try {
    # لقطة قبل الجلسة — عشان نعرف بعدين هو غيّر إيه بالظبط
    $before = @{}
    git ls-files | ForEach-Object {
        if (Test-Path $_) { $before[$_] = (Get-FileHash -Path $_ -Algorithm MD5).Hash }
    }

    Write-Host "`nالموديل: $model  |  التعديلات محلية · مفيش commit تلقائي · مفيش نت`n" -ForegroundColor Cyan
    & $AiderExe --model $model @Files

    # =====  التقرير بعد الجلسة  =====
    Write-Host "`n================ اتغير إيه في الجلسة دي ================" -ForegroundColor Cyan
    $changed = @()
    foreach ($k in $before.Keys) {
        if (Test-Path $k) {
            if ((Get-FileHash -Path $k -Algorithm MD5).Hash -ne $before[$k]) { $changed += $k }
        } else { $changed += "$k (اتمسح!)" }
    }
    if ($changed.Count -eq 0) {
        Write-Host "  ولا ملف اتغير." -ForegroundColor Green
    } else {
        foreach ($c in $changed) {
            Write-Host "  * $c" -ForegroundColor Yellow
            if ($Protected -contains (Split-Path $c -Leaf)) {
                Write-Host "    !!! ده ملف محمي واتغير — راجعه فورًا" -ForegroundColor Red
            }
        }
        Write-Host "`n  شوف التفاصيل :  git diff" -ForegroundColor Gray
        Write-Host "  ارجّع ملف     :  git checkout -- ""<اسم الملف>""" -ForegroundColor Gray
        Write-Host "  ارجّع كل حاجة :  git checkout -- ." -ForegroundColor Gray
    }

    # فحص سلامة app.js حتى لو محدش لمسه — احتياط
    if (Test-Path 'app.js') {
        $b = [IO.File]::ReadAllBytes('app.js')
        $cr = 0; foreach ($x in $b) { if ($x -eq 13) { $cr++ } }
        if ($cr -gt 0) {
            Write-Host "`n  !!! app.js اتحول لـ CRLF ($cr) — ارجّعه فورًا: git checkout -- app.js" -ForegroundColor Red
        }
    }
    Write-Host "=======================================================`n" -ForegroundColor Cyan
} finally {
    Pop-Location
}
