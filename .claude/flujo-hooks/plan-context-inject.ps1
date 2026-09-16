$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd()
if (-not $raw) { exit 0 }
try { $j = $raw | ConvertFrom-Json } catch { exit 0 }

$proj = [string]$j.cwd
if (-not $proj) { $proj = $env:CLAUDE_PROJECT_DIR }
if (-not $proj) { exit 0 }

$prompt = [string]$j.prompt
if ($prompt -notmatch '(^|\s)/(flujo-core:)?workflow-plan(\s|$)') { exit 0 }

$activeProjectFile = Join-Path $proj '.claude/.active-project'
if (-not (Test-Path $activeProjectFile)) { exit 0 }
$slug = (Get-Content $activeProjectFile -Raw).Trim()
if (-not $slug) { exit 0 }

$destDir = Join-Path $proj "flujo_projects/$slug"
$dotDir = Join-Path $destDir '.flujo-project'
$dorPath = Join-Path $dotDir 'dor.json'
if (-not (Test-Path $dorPath)) { exit 0 }
try { $dor = Get-Content $dorPath -Raw | ConvertFrom-Json } catch { exit 0 }

# Si esta blocked, dor-gate.ps1 ya va a bloquear el turno completo - no hace falta inyectar
# contexto que nunca se llegaria a usar.
if ($dor.overallStatus -ne 'ready') { exit 0 }

$tracePath = Join-Path $dotDir 'traceability.json'
$trace = if (Test-Path $tracePath) { Get-Content $tracePath -Raw | ConvertFrom-Json } else { [PSCustomObject]@{} }

$epicCount = 0
$featureCount = 0
if ($trace.PSObject.Properties.Name -contains 'epics') {
  $epicNames = @($trace.epics.PSObject.Properties.Name)
  $epicCount = $epicNames.Count
  foreach ($epicName in $epicNames) {
    $epicNode = $trace.epics.$epicName
    if ($epicNode.PSObject.Properties.Name -contains 'features') {
      $featureCount += @($epicNode.features.PSObject.Properties.Name).Count
    }
  }
}
if ($trace.PSObject.Properties.Name -contains 'features') {
  $featureCount += @($trace.features.PSObject.Properties.Name).Count
}

$sizeHint = if ($epicCount -gt 1) { 'monstruo (una sesion por Epic)' }
  elseif ($epicCount -eq 1 -or $featureCount -gt 1) { 'grande (una corrida por Feature)' }
  else { 'pequeno (una sola corrida)' }

$progressPath = Join-Path $dotDir 'plan-progress.json'
$progress = if (Test-Path $progressPath) { Get-Content $progressPath -Raw | ConvertFrom-Json } else { [PSCustomObject]@{ status = 'not-started'; planned = @(); pending = @() } }
$plannedList = ($progress.planned -join ', ')
$pendingList = ($progress.pending -join ', ')

$ctx = "[flujo-projects] Proyecto activo '$slug', dor.json en ready - toma la documentacion de flujo_projects/$slug/{02_entendimiento.md,03_requerimientos.md,04_pruebas/estrategia.md} como research-log precargado en vez de partir de una historia suelta. " +
  "Conteo detectado: $epicCount Epic(s), $featureCount Feature(s) -> tamano sugerido: $sizeHint. " +
  "Progreso previo (plan-progress.json): planned=[$plannedList] pending=[$pendingList]. " +
  "Al cerrar cada corrida sobre una Feature/Epic, invoca `${CLAUDE_PLUGIN_ROOT}/scripts/plan-progress-update.ps1 -ProjectSlug $slug -Completed <id>` para mover esa entrada de pending a planned. " +
  "Agrega siempre el Hito de QA como ultima Feature del rollup flujo_projects/$slug/05_plan.md antes de cerrar (plantilla en `${CLAUDE_PLUGIN_ROOT}/templates/_PROJECT_TEMPLATE/05_plan.md`). " +
  "05_plan.md es solo indice/rollup, nunca ejecutable - cada Feature sigue generando su propio specs/<feature>/plan.md exactamente igual que siempre."

(@{ hookSpecificOutput = @{ hookEventName = 'UserPromptSubmit'; additionalContext = $ctx } } | ConvertTo-Json -Compress -Depth 5)
exit 0
