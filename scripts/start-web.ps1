# Workbench web launcher (called by start-web.vbs at logon).
# Binds dsh web to this machine's Tailscale IPv4 so the phone can open http://100.x.x.x:3080/
# Idempotent: exits if the port is already listening; re-detects the Tailscale address each run.
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI without a BOM,
# so non-ASCII text turns into mojibake and breaks the parser.
#
# Two logs:
#   logs\web.log      - launcher messages
#   logs\web.out.log  - dsh web output (contains the one-time login URL with ?token=...)

$ErrorActionPreference = 'SilentlyContinue'

$root   = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root 'logs'
$log    = Join-Path $logDir 'web.log'
$out    = Join-Path $logDir 'web.out.log'
$err    = Join-Path $logDir 'web.err.log'
$port   = 3080

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $log -Value $line -Encoding utf8
}

# rotate when a log exceeds 2 MB
foreach ($f in @($log, $out, $err)) {
  if ((Test-Path $f) -and ((Get-Item $f).Length -gt 2MB)) {
    Move-Item -Path $f -Destination ($f + '.1') -Force
  }
}

# 1) already listening -> nothing to do
if (netstat -ano | Select-String ":$port\s" | Select-String 'LISTENING') {
  exit 0
}

# 2) find the Tailscale IPv4 (100.64.0.0/10 CGNAT range); retry ~90s for a slow logon
$ip = $null
for ($i = 0; $i -lt 18 -and -not $ip; $i++) {
  if ($i -gt 0) { Start-Sleep -Seconds 5 }
  $ip = ([regex]::Matches((ipconfig | Out-String), '(100\.\d{1,3}\.\d{1,3}\.\d{1,3})') |
         ForEach-Object { $_.Groups[1].Value } | Select-Object -First 1)
}
if (-not $ip) {
  Write-Log "no Tailscale address found after 90s (tailscaled not running?), skip start"
  exit 1
}
Write-Log "starting dsh web: host=$ip port=$port"

$exe = 'E:\dsh\DeepSeek Harness.exe'
$bin = 'E:\dsh\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js'
$env:ELECTRON_RUN_AS_NODE = '1'

# 3) start detached, with redirected output so the login URL lands in web.out.log
$args = @($bin, '--profile', 'web', '--host', $ip, '--port', $port, '--no-open')
$p = Start-Process -FilePath $exe -ArgumentList $args -WindowStyle Hidden -PassThru `
       -RedirectStandardOutput $out -RedirectStandardError $err
Write-Log "spawned pid=$($p.Id)"
$p.WaitForExit()
Write-Log "dsh web exited: code=$($p.ExitCode)"
