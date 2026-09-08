# =============================================================
#  RAG — بحث دلالي في المشروع كله بدون نت
#
#     local-ai\rag.ps1 -Build                    # ابنِ الفهرس (مرة، وكل ما الكود يتغير)
#     local-ai\rag.ps1 "فين حساب متوسط المقاول؟" # دوّر وهات المقاطع
#     local-ai\rag.ps1 "..." -Answer             # ودَع الموديل يجاوب منها
#     local-ai\rag.ps1 "..." -K 8                # عدد المقاطع (افتراضي 5)
# =============================================================

param(
    [Parameter(Position = 0)][string]$Query,
    [switch]$Build,
    [switch]$Answer,
    [int]$K = 5
)

$ErrorActionPreference = 'Stop'

$Root      = 'E:\llm'
$OllamaExe = Join-Path $Root 'ollama\ollama.exe'
$RagDir    = Join-Path $PSScriptRoot 'rag'

if (-not (Test-Path $OllamaExe)) { throw "Ollama مش متسطّب. شغّل: local-ai\setup-offline-ai.ps1" }

# CPU فقط — كارت GT 1030 بينهّي llama-server بـ 0xc0000409 (CUDA toolchain قديم).
# CUDA_VISIBLE_DEVICES لوحده مش كفاية (مجرّب) — OLLAMA_LLM_LIBRARY هو الحاسم.
$env:OLLAMA_LLM_LIBRARY   = 'cpu'
$env:CUDA_VISIBLE_DEVICES = ''

# --- تشغيل الخادم لو مش شغال ---
$up = $false
try { Invoke-WebRequest 'http://127.0.0.1:11434/api/tags' -UseBasicParsing -TimeoutSec 3 | Out-Null; $up = $true } catch { }
if (-not $up) {
    Write-Host 'بشغّل خادم Ollama...'
    Start-Process -FilePath $OllamaExe -ArgumentList 'serve' -WindowStyle Hidden
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        try { Invoke-WebRequest 'http://127.0.0.1:11434/api/tags' -UseBasicParsing -TimeoutSec 2 | Out-Null; $up = $true; break } catch { }
    }
    if (-not $up) { throw 'الخادم مقامش' }
}

$env:OLLAMA_API_BASE = 'http://127.0.0.1:11434'

# --- موديل التضمين لازم يكون موجود ---
$tags = (Invoke-WebRequest 'http://127.0.0.1:11434/api/tags' -UseBasicParsing).Content
if ($tags -notmatch 'nomic-embed-text') {
    Write-Host 'موديل التضمين (nomic-embed-text ~274 MB) مش موجود - بينزّله...' -ForegroundColor Yellow
    & $OllamaExe pull nomic-embed-text
    if (-not $?) { throw 'فشل تنزيل nomic-embed-text' }
}

if ($Build) {
    Write-Host "`nبيبني الفهرس (قراءة فقط - مش بيكتب في أي ملف من البرنامج)`n" -ForegroundColor Cyan
    node (Join-Path $RagDir 'build.js')
    exit $LASTEXITCODE
}

if (-not $Query) {
    Write-Host 'اكتب سؤالك:  local-ai\rag.ps1 "السؤال"' -ForegroundColor Yellow
    Write-Host 'أو ابنِ الفهرس الأول:  local-ai\rag.ps1 -Build'
    exit 1
}

$args2 = @('--k', $K)
if ($Answer) { $args2 += '--answer' }
$args2 += $Query

node (Join-Path $RagDir 'ask.js') @args2
exit $LASTEXITCODE
