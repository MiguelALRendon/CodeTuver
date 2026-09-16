$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd()
if (-not $raw) { exit 0 }
try { $j = $raw | ConvertFrom-Json } catch { exit 0 }
$proj = $j.cwd
if (-not $proj) { $proj = $env:CLAUDE_PROJECT_DIR }
if (-not $proj) { exit 0 }

$prompt = [string]$j.prompt
$dir = Join-Path $proj '.claude'
$modeFile = Join-Path $dir '.task-mode'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

# limpia el marcador de codigo-editado: solo cuenta lo editado en el turno actual
$dirtyMarker = Join-Path $dir '.flujo-dirty'
if (Test-Path $dirtyMarker) { Remove-Item $dirtyMarker -Force -ErrorAction SilentlyContinue }

# fija .task-mode desde el comando del usuario (unico canal para pasar a un modo editable)

if ($prompt -match '(^|\s)/(flujo-core:)?workflow-plan(\s|$)') {
  [System.IO.File]::WriteAllText($modeFile, 'plan')
}
elseif ($prompt -match '(^|\s)/plan(\s|$)') {
  [System.IO.File]::WriteAllText($modeFile, 'plan')
}
elseif ($prompt -match '(^|\s)/(flujo-core:)?flujo-implement(\s|$)') {
  [System.IO.File]::WriteAllText($modeFile, 'implement')
}
elseif ($prompt -match '(^|\s)/(flujo-core:)?flujo-mode\s+([a-zA-Z]+)') {
  $m = $Matches[3].ToLower()
  if ($m -eq 'clear') { if (Test-Path $modeFile) { Remove-Item $modeFile -Force } }
  else { [System.IO.File]::WriteAllText($modeFile, $m) }
}

if (Test-Path (Join-Path $proj 'specs')) { exit 0 }
$ctx = 'Recordatorio flujo: este proyecto aun no tiene carpeta specs/. Para cambios no triviales crea la spec con /spec-new antes de implementar (Gate 1 readiness).'
(@{ hookSpecificOutput = @{ hookEventName = 'UserPromptSubmit'; additionalContext = $ctx } } | ConvertTo-Json -Compress -Depth 5)
exit 0
