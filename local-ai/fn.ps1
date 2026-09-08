# =============================================================
#  مستخرج الدوال من app.js  —  الطريقة الوحيدة تشغّل الموديل المحلي على الملف ده
#
#  app.js فيه 495 دالة و ~145 ألف توكن. الملف ككل مستحيل،
#  لكن كل دالة لوحدها (أطولها 203 سطر) بتدخل في الـ 8192 مريحة.
#
#  الاستخدام:
#     local-ai\fn.ps1                    # اعرض كل الدوال
#     local-ai\fn.ps1 -Find matrix       # دوّر على دالة بالاسم
#     local-ai\fn.ps1 anMatrixTable      # اقصّها في scratch\ وجهّز الأمر
#
#  بيقرا app.js قراءة فقط — عمره ما بيكتب فيه.
# =============================================================

param(
    [Parameter(Position = 0)][string]$Name,
    [string]$Find
)

$ErrorActionPreference = 'Stop'
$Project = Split-Path -Parent $PSScriptRoot
$Src     = Join-Path $Project 'app.js'
$Scratch = Join-Path $PSScriptRoot 'scratch'

if (-not (Test-Path $Src)) { throw "مالقيتش app.js في $Project" }

# قراءة فقط — ReadAllLines مابيلمسش الملف
$lines = [IO.File]::ReadAllLines($Src)

# فهرسة كل الدوال على المستوى الأعلى
$fns = @()
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*(async\s+)?function\s+([A-Za-z_$][\w$]*)') {
        $fns += [pscustomobject]@{ Idx = $i; Name = $Matches[2] }
    }
}

# --- عرض / بحث ---
if (-not $Name) {
    $show = if ($Find) { $fns | Where-Object { $_.Name -like "*$Find*" } } else { $fns }
    if (-not $show) { Write-Host "مفيش دالة اسمها فيه '$Find'" -ForegroundColor Yellow; exit 1 }
    foreach ($f in $show) {
        $pos  = [Array]::IndexOf($fns, $f)
        $end  = if ($pos -lt $fns.Count - 1) { $fns[$pos + 1].Idx } else { $lines.Count }
        $len  = $end - $f.Idx
        "{0,6}  {1,-42} {2,4} سطر" -f ($f.Idx + 1), $f.Name, $len
    }
    ""
    "الإجمالي: $($show.Count) دالة"
    exit 0
}

# --- استخراج ---
$hit = $fns | Where-Object { $_.Name -eq $Name } | Select-Object -First 1
if (-not $hit) {
    Write-Host "مفيش دالة بالاسم ده بالظبط: $Name" -ForegroundColor Yellow
    $near = $fns | Where-Object { $_.Name -like "*$Name*" } | Select-Object -First 8
    if ($near) { "قصدك واحدة من دول؟"; $near | ForEach-Object { "   $($_.Name)" } }
    exit 1
}

$pos   = [Array]::IndexOf($fns, $hit)
$end   = if ($pos -lt $fns.Count - 1) { $fns[$pos + 1].Idx } else { $lines.Count }
$body  = $lines[$hit.Idx..($end - 1)]
$first = $hit.Idx + 1
$last  = $end

# الحد الأقصى: 8192 توكن ناقص مساحة للرد والقواعد
$chars = ($body -join "`n").Length
$tok   = [int]($chars / 3.2)
if ($tok -gt 5000) {
    Write-Host "!  الدالة دي ~$tok توكن — كبيرة على الموديل المحلي حتى لوحدها." -ForegroundColor Yellow
}

if (-not (Test-Path $Scratch)) { New-Item -ItemType Directory -Path $Scratch -Force | Out-Null }
$out = Join-Path $Scratch "$Name.js"

# هيدر بيفكّرك ترجّعها فين — والكتابة بـ LF زي app.js بالظبط
$header = @(
    "// ==== مقصوصة من app.js  سطور $first-$last  ===="
    "// لما تخلص: انسخ المحتوى ده وحطّه مكان السطور دي في app.js بإيدك."
    "// متنسخش الهيدر ده. ومتخليش أي أداة تكتب في app.js مباشرة."
    ""
)
[IO.File]::WriteAllText($out, (($header + $body) -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))

Write-Host ""
Write-Host "  $Name" -ForegroundColor Green
Write-Host "  سطور $first-$last  ($($body.Count) سطر · ~$tok توكن)"
Write-Host "  -> $out"
Write-Host ""
Write-Host "  شغّل عليها:" -ForegroundColor Cyan
Write-Host "     local-ai\ai.ps1 local-ai\scratch\$Name.js"
Write-Host ""
