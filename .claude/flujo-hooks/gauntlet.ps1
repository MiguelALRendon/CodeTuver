param(
  [string]$Tier = 'local',
  [string]$ProjectDir = $env:CLAUDE_PROJECT_DIR
)
$ErrorActionPreference = 'Stop'
if (-not $ProjectDir) { $ProjectDir = (Get-Location).Path }
# un npx.cmd de otro gestor de Node mas temprano en el PATH del sistema falla en este proyecto (busca un .servbay.config inexistente); se antepone el Node real solo para este proceso
if (Test-Path 'C:\Program Files\nodejs\npx.cmd') {
  $env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
}
$cfgPath = Join-Path $ProjectDir 'gauntlet.json'
if (-not (Test-Path $cfgPath)) { Write-Output 'gauntlet: sin gauntlet.json en el proyecto, nada que correr'; exit 0 }
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json

# politica de pruebas desde flujo.json: switch de unitarias, sub-switch bdd, proyecto de pruebas
$testEnabled = $false
$testBdd = $false
$testProject = ''
$styleEnabled = $false
$flujoPath = Join-Path $ProjectDir 'flujo.json'
if (Test-Path $flujoPath) {
  try {
    $fj = Get-Content $flujoPath -Raw | ConvertFrom-Json
    $t = $fj.testing; if ($t) { $testEnabled = ($t.enabled -eq $true); $testBdd = ($t.bdd -eq $true); $testProject = [string]$t.project }
    if ($fj.style) { $styleEnabled = ($fj.style.enabled -eq $true) }
  } catch {}
}

$tiers = switch ($Tier) {
  'all' { @('local', 'ci', 'nightly') }
  'ci' { @('local', 'ci') }
  default { @($Tier) }
}
$stages = $cfg.stages | Where-Object { $tiers -contains $_.tier -and $_.enabled -ne $false } | Sort-Object order
$ran = 0
foreach ($s in $stages) {
  # etapas de prueba unitaria: gated por el switch; encendido sin proyecto = bloqueo duro
  if ($s.requiresTesting -eq $true) {
    if (-not $testEnabled) { continue }
    if (-not $testProject) {
      Write-Output "GAUNTLET FAIL en etapa '$($s.id)': testing.enabled=true pero flujo.json no define testing.project. Configura el proyecto de pruebas o apaga el switch."
      exit 1
    }
  }
  # etapa de ejecucion bdd: gated por el sub-switch testing.bdd
  if ($s.requiresBdd -eq $true) {
    if (-not $testBdd) { continue }
    if (-not $testProject) {
      Write-Output "GAUNTLET FAIL en etapa '$($s.id)': testing.bdd=true pero flujo.json no define testing.project."
      exit 1
    }
  }
  # etapa de estilos: gated por el switch style.enabled
  if ($s.requiresStyle -eq $true) {
    if (-not $styleEnabled) { continue }
  }
  $ran++
  if ($s.internal) {
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot ("$($s.internal).ps1")) -ProjectDir $ProjectDir 2>&1
    $code = $LASTEXITCODE
  }
  else {
    $cmd = $s.cmd -replace '\$\{testProject\}', $testProject
    Push-Location $ProjectDir
    $out = & cmd /c "$cmd 2>&1"
    $code = $LASTEXITCODE
    Pop-Location
  }
  if ($code -ne 0) {
    $tail = ($out | Select-Object -Last 25) -join "`n"
    if ($s.blocking -eq 'soft') { Write-Output "gauntlet aviso en '$($s.id)' (informativo)"; continue }
    Write-Output "GAUNTLET FAIL en etapa '$($s.id)' (orden $($s.order)):`n$tail"
    exit 1
  }
}
Write-Output "gauntlet OK ($ran etapas, tier=$Tier)"
exit 0
