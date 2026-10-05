# Joey AutoSync - envia para o GitHub os commits que ainda nao subiram.
# Roda a cada 3 min (Agendador de Tarefas). Varre as pastas da Area de Trabalho
# que sao repositorios git (ignora as que comecam com "_").
# NUNCA faz add/commit/pull/force: so "git push" quando o local esta a frente
# e o GitHub nao tem nada novo (senao so registra no log e espera o Fred).

$ErrorActionPreference = 'Continue'
$env:GIT_TERMINAL_PROMPT = '0'   # nunca trava pedindo senha
$env:GCM_INTERACTIVE     = 'never'

$dir = Join-Path $env:LOCALAPPDATA 'joey-autosync'
$log = Join-Path $dir 'sync.log'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

function Log($msg) {
  Add-Content -Path $log -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg) -Encoding UTF8
}

# Mantem o log pequeno (ultimas 500 linhas)
if ((Test-Path $log) -and ((Get-Item $log).Length -gt 200KB)) {
  $tail = Get-Content $log -Tail 500 -Encoding UTF8
  Set-Content -Path $log -Value $tail -Encoding UTF8
}

$desktop = [Environment]::GetFolderPath('Desktop')
$repos = Get-ChildItem -Path $desktop -Directory -ErrorAction SilentlyContinue |
  Where-Object { -not $_.Name.StartsWith('_') -and (Test-Path (Join-Path $_.FullName '.git')) }

foreach ($r in $repos) {
  $p = $r.FullName
  $g = Join-Path $p '.git'
  # No meio de merge/rebase: nao mexe
  if ((Test-Path "$g\MERGE_HEAD") -or (Test-Path "$g\rebase-merge") -or (Test-Path "$g\rebase-apply")) {
    Log "$($r.Name): merge/rebase em andamento - pulei"; continue
  }
  $up = git -C $p rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $up) { continue }   # branch sem upstream

  git -C $p -c gc.auto=0 -c maintenance.auto=false fetch --quiet 2>$null
  if ($LASTEXITCODE -ne 0) { Log "$($r.Name): fetch falhou (sem internet/login?)"; continue }

  $ahead  = [int](git -C $p rev-list --count "$up..HEAD" 2>$null)
  $behind = [int](git -C $p rev-list --count "HEAD..$up" 2>$null)
  if ($ahead -eq 0) { continue }

  if ($behind -gt 0) {
    Log "$($r.Name): $ahead commit(s) local e $behind no GitHub - DIVERGIU, nao enviei (puxar/resolver no VS Code)"
    continue
  }
  $out = git -C $p push --quiet 2>&1
  if ($LASTEXITCODE -eq 0) { Log "$($r.Name): enviei $ahead commit(s) -> $up" }
  else { Log "$($r.Name): push falhou: $out" }
}
