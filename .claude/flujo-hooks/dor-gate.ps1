$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd()
if (-not $raw) { exit 0 }
try { $j = $raw | ConvertFrom-Json } catch { exit 0 }

$proj = $j.cwd
if (-not $proj) { $proj = $env:CLAUDE_PROJECT_DIR }
if (-not $proj) { exit 0 }

$prompt = [string]$j.prompt
$matchesPlan = $prompt -match '(^|\s)/(flujo-core:)?workflow-plan(\s|$)'
$matchesImplement = $prompt -match '(^|\s)/(flujo-core:)?flujo-implement(\s|$)'
if (-not $matchesPlan -and -not $matchesImplement) { exit 0 }

$activeProjectFile = Join-Path $proj '.claude/.active-project'
if (-not (Test-Path $activeProjectFile)) { exit 0 }
$slug = (Get-Content $activeProjectFile -Raw).Trim()
if (-not $slug) { exit 0 }

$dorPath = Join-Path $proj "flujo_projects/$slug/.flujo-project/dor.json"
if (-not (Test-Path $dorPath)) { exit 0 }

try { $dor = Get-Content $dorPath -Raw | ConvertFrom-Json } catch { exit 0 }
if ($dor.overallStatus -ne 'blocked') { exit 0 }

$pending = @()
if ($dor.documents) {
  foreach ($docName in $dor.documents.PSObject.Properties.Name) {
    $status = $dor.documents.$docName.status
    if ($status -ne 'verified') { $pending += "$docName ($status)" }
  }
}
$reason = "DoR bloqueado para el proyecto activo '$slug'. Documentos pendientes:`n" + ($pending -join "`n") + "`nCorre /workflow-confirm antes de continuar."
(@{ decision = 'block'; reason = $reason } | ConvertTo-Json -Compress -Depth 6)
exit 0
