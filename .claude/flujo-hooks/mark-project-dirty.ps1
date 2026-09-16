$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd()
if (-not $raw) { exit 0 }
try { $j = $raw | ConvertFrom-Json } catch { exit 0 }

$path = $j.tool_input.file_path
if (-not $path) { exit 0 }
if ([System.IO.Path]::GetExtension($path).ToLower() -ne '.md') { exit 0 }

$proj = [string]$j.cwd
if (-not $proj) { $proj = $env:CLAUDE_PROJECT_DIR }
if (-not $proj) { exit 0 }

$activeProjectFile = Join-Path $proj '.claude/.active-project'
if (-not (Test-Path $activeProjectFile)) { exit 0 }
$slug = (Get-Content $activeProjectFile -Raw).Trim()
if (-not $slug) { exit 0 }

$destDir = Join-Path $proj "flujo_projects/$slug"
if (-not (Test-Path $destDir)) { exit 0 }
$destDirFull = (Resolve-Path -LiteralPath $destDir).Path

$editedFull = $null
try { $editedFull = (Resolve-Path -LiteralPath $path -ErrorAction Stop).Path } catch { exit 0 }
if (-not $editedFull.StartsWith($destDirFull, [System.StringComparison]::OrdinalIgnoreCase)) { exit 0 }

$docKey = $editedFull.Substring($destDirFull.Length).TrimStart('\', '/') -replace '\\', '/'

$dorPath = Join-Path $destDirFull '.flujo-project/dor.json'
if (-not (Test-Path $dorPath)) { exit 0 }
$dor = Get-Content $dorPath -Raw | ConvertFrom-Json

# Solo actua sobre documentos YA registrados en dor.json - archivos nuevos requieren un comando
# explicito (/workflow-testcase, /workflow-update-docs) porque registrar algo nuevo requiere
# interpretacion, no solo reabrir un estado (nueva-planificacion.md §14.3).
if (-not ($dor.documents.PSObject.Properties.Name -contains $docKey)) { exit 0 }

$currentEntry = $dor.documents.$docKey
if ($currentEntry.status -eq 'pending') { exit 0 }

$dor.documents.$docKey = [PSCustomObject]@{ status = 'pending'; documentFingerprint = ''; checks = @() }
$dor.overallStatus = 'blocked'
$dor | ConvertTo-Json -Depth 10 | Set-Content $dorPath -Encoding utf8
exit 0
