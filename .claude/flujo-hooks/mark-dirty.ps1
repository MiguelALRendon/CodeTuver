$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd()
if (-not $raw) { exit 0 }
try { $j = $raw | ConvertFrom-Json } catch { exit 0 }

$path = $j.tool_input.file_path
if (-not $path) { exit 0 }
$ext = [System.IO.Path]::GetExtension($path).ToLower()

$proj = [string]$j.cwd
if (-not $proj) { $proj = $env:CLAUDE_PROJECT_DIR }
if (-not $proj) { exit 0 }

# extensiones de codigo desde flujo.json: default universal + lo que anexo el stack-pack en /flujo-init
$codeExt = @('.css', '.scss', '.sql', '.ps1')
try {
  $fj = Get-Content (Join-Path $proj 'flujo.json') -Raw | ConvertFrom-Json
  if ($fj.codeExtensions) { $codeExt = @($fj.codeExtensions) }
} catch {}
if ($codeExt -notcontains $ext) { exit 0 }

$dir = Join-Path $proj '.claude'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
New-Item -ItemType File -Path (Join-Path $dir '.flujo-dirty') -Force | Out-Null
exit 0
