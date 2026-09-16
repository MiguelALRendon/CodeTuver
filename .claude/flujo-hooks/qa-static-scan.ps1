param(
  [string]$ProjectDir = $env:CLAUDE_PROJECT_DIR
)
$ErrorActionPreference = 'Stop'
if (-not $ProjectDir) { $ProjectDir = (Get-Location).Path }

# Heuristico, no prueba nada: alimenta revision_estatica.resumen de qa-coverage.json con candidatos concretos citables.
$targets = @(
  (Join-Path $ProjectDir 'src'),
  (Join-Path $ProjectDir 'src-tauri/src')
)
$files = @()
foreach ($t in $targets) {
  if (Test-Path $t) {
    $files += Get-ChildItem -Path $t -Recurse -File -Include '*.ts', '*.vue', '*.rs' |
      Where-Object { $_.FullName -notmatch '\.spec\.ts$' }
  }
}

$findings = [ordered]@{
  fallback_datos_viejos = @()
  error_no_normalizado  = @()
  listas_sin_dedup      = @()
  guardia_sin_salida    = @()
  estado_intermedio     = @()
  vocabulario_manual    = @()
  roundtrip_manual      = @()
}

foreach ($f in $files) {
  $rel = $f.FullName.Substring($ProjectDir.Length + 1) -replace '\\', '/'
  $lines = Get-Content -LiteralPath $f.FullName -ErrorAction SilentlyContinue
  if (-not $lines) { continue }
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $ln = $lines[$i]
    $lineNo = $i + 1
    # Hallazgo 5: fallback que puede no cubrir dato persistido viejo/incompleto.
    if ($ln -match '(localStorage|persisted|loadCharacterEditorSettings|getItem)' -and $ln -match '\?\?') {
      $findings.fallback_datos_viejos += "${rel}:${lineNo}: $($ln.Trim())"
    }
    # Hallazgo 7: error normalizado a String(err) sin pasar por errorMessage().
    if (($ln -match 'String\(\s*(err|error|e)\s*\)' -or $ln -match '`\$\{\s*(err|error|e)\s*\}`') -and $ln -notmatch 'errorMessage') {
      $findings.error_no_normalizado += "${rel}:${lineNo}: $($ln.Trim())"
    }
    # Hallazgo 8: listas combinadas sin dedup visible.
    if (($ln -match '\.concat\(' -or $ln -match '\.\.\..*,\s*\.\.\.') -and $ln -notmatch 'new Set|Array\.from\(new Set') {
      $findings.listas_sin_dedup += "${rel}:${lineNo}: $($ln.Trim())"
    }
    # Hallazgo 4: guardia "ya activo" - candidato a revisar si tiene salida no destructiva.
    if ($ln -match '(?i)(ya hay una sesion activa|already active|alreadyActive)') {
      $findings.guardia_sin_salida += "${rel}:${lineNo}: $($ln.Trim())"
    }
    # Hallazgo 3: estado intermedio - candidato a revisar si siempre llega a un estado terminal.
    if ($ln -match "(?i)(status|state)\s*[:=]\s*['\`"](pending|loading|en.?curso|in.?progress|cargando)['\`"]") {
      $findings.estado_intermedio += "${rel}:${lineNo}: $($ln.Trim())"
    }
  }
  # Hallazgo 6: comparacion de igualdad de string contra un campo tipo vocabulario cerrado, requiere revision manual.
  if (($lines -join "`n") -match 'entry\.state\s*===\s*state|=== state\)|\.find\(\(entry\) => entry\.') {
    $findings.vocabulario_manual += "${rel}: comparacion de igualdad contra 'state' - confirmar a mano que emisor y consumidor comparten el mismo vocabulario cerrado"
  }
  # Bugs de hips/retargeting: exportar/importar son mitades de un roundtrip, recordatorio de probar el ciclo completo.
  if ($rel -match '(export|import)' -and $rel -match '\.ts$') {
    $findings.roundtrip_manual += "${rel}: nombre sugiere una mitad de un roundtrip - confirmar que se probo el ciclo completo, no solo esta mitad"
  }
}

$report = [ordered]@{
  generatedAt       = (Get-Date).ToString('o')
  totalFilesScanned = $files.Count
  findings          = $findings
}
$reportPath = Join-Path $ProjectDir 'docs/reference/qa-static-scan-report.json'
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $reportPath -Encoding utf8

$total = ($findings.Values | ForEach-Object { $_.Count } | Measure-Object -Sum).Sum
Write-Output "qa-static-scan: $($files.Count) archivos escaneados, $total candidatos encontrados. Reporte: docs/reference/qa-static-scan-report.json"
exit 0
