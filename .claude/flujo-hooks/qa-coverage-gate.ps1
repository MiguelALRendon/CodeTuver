$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd()
if (-not $raw) { exit 0 }
try { $j = $raw | ConvertFrom-Json } catch { exit 0 }

$path = $j.tool_input.file_path
if (-not $path) { exit 0 }
if ($path -notmatch 'inventario-funcionalidades-qa\.md$') { exit 0 }

$proj = [string]$j.cwd
if (-not $proj) { $proj = $env:CLAUDE_PROJECT_DIR }
$ledgerPath = Join-Path $proj 'docs/reference/qa-coverage.json'
if (-not (Test-Path $ledgerPath)) {
  $reason = "qa-coverage-gate: no existe docs/reference/qa-coverage.json - no se puede marcar ningun item como revisado sin ledger de evidencia."
  (@{ hookSpecificOutput = @{ hookEventName = 'PreToolUse'; permissionDecision = 'deny'; permissionDecisionReason = $reason } } | ConvertTo-Json -Compress -Depth 5)
  exit 0
}
$ledger = Get-Content -LiteralPath $ledgerPath -Raw | ConvertFrom-Json

$texts = @()
if ($j.tool_input.new_string) { $texts += [string]$j.tool_input.new_string }
if ($j.tool_input.content) { $texts += [string]$j.tool_input.content }
if ($j.tool_input.edits) { foreach ($e in $j.tool_input.edits) { if ($e.new_string) { $texts += [string]$e.new_string } } }
if ($texts.Count -eq 0) { exit 0 }

# Los emojis literales en el .ps1 se corrompen en PowerShell 5.1 sin BOM (cae al codepage del sistema); se usan sus code points.
$checkMark = [char]::ConvertFromUtf32(0x2705)
$dinamicaKeys = @('timing_real', 'salida_proceso_externo', 'datos_persistidos_reales', 'vocabulario_real_modulos', 'render_real_pantalla', 'recuperacion_real_usuario')
$problems = @()

foreach ($t in $texts) {
  $lines = $t -split "`r?`n"
  foreach ($ln in $lines) {
    if ($ln -notmatch "^\s*-\s*$([regex]::Escape($checkMark))") { continue }
    if ($ln -notmatch '\[QA-(\d+)\]') {
      $problems += "linea marcada $checkMark sin tag [QA-###]: $($ln.Trim())"
      continue
    }
    $id = 'QA-' + $Matches[1]
    $entry = $ledger.$id
    if (-not $entry) {
      $problems += "${id}: no tiene entrada en qa-coverage.json - no se puede marcar $checkMark"
      continue
    }
    if (-not $entry.revision_estatica -or $entry.revision_estatica.hecha -ne $true -or -not $entry.revision_estatica.resumen) {
      $problems += "${id}: falta revision_estatica.hecha=true con resumen en el ledger"
    }
    if (-not $entry.camino_feliz -or -not $entry.camino_feliz.evidencia) {
      $problems += "${id}: falta camino_feliz.evidencia en el ledger"
    }
    if (-not $entry.dinamica) {
      $problems += "${id}: falta el bloque dinamica completo en el ledger"
      continue
    }
    foreach ($k in $dinamicaKeys) {
      $cat = $entry.dinamica.$k
      if (-not $cat) {
        $problems += "${id}: falta la categoria dinamica '$k' en el ledger"
        continue
      }
      if ($cat.aplica -eq $true -and -not $cat.evidencia) {
        $problems += "${id}: categoria '$k' marcada aplica=true sin evidencia"
      }
    }
  }
}

if ($problems.Count -gt 0) {
  $unique = $problems | Select-Object -Unique
  $reason = "qa-coverage-gate bloqueo la edicion (" + $unique.Count + " problema(s)): " + ($unique -join ' | ')
  (@{ hookSpecificOutput = @{ hookEventName = 'PreToolUse'; permissionDecision = 'deny'; permissionDecisionReason = $reason } } | ConvertTo-Json -Compress -Depth 5)
}
exit 0
