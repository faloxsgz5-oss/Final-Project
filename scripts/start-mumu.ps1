$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$adbCandidates = @(
  'E:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe',
  'E:\Program Files\Netease\MuMuPlayer\nx_device\12.0\shell\adb.exe',
  (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe')
)
$adb = $adbCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $adb) {
  throw 'ไม่พบ ADB ของ MuMu หรือ Android SDK ในเครื่องนี้'
}

Push-Location $projectRoot
try {
  & $adb start-server | Out-Null
  $connectedDevices = & $adb devices | Select-String -Pattern "\tdevice$"
  if (-not $connectedDevices) {
    throw 'ยังไม่พบ MuMu กรุณาเปิด MuMu ให้เข้าหน้าหลักก่อน แล้วรันคำสั่งนี้ใหม่'
  }

  & $adb reverse tcp:8081 tcp:8081 | Out-Null
  $launcher = Start-Job -ScriptBlock {
    param($adbPath)
    Start-Sleep -Seconds 5
    & $adbPath shell am start -a android.intent.action.VIEW -d 'exp+smartlife://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' com.smartlife.student | Out-Null
  } -ArgumentList $adb

  Write-Host 'กำลังเปิด SmartLife บน MuMu...' -ForegroundColor Green
  Write-Host 'กรุณาเปิดหน้าต่างนี้ไว้ระหว่างใช้งาน Development Build และกด Ctrl+C เมื่อต้องการหยุด' -ForegroundColor Yellow
  & node '.\node_modules\expo\bin\cli' start --dev-client --localhost --port 8081
}
finally {
  if ($launcher) {
    Stop-Job -Job $launcher -ErrorAction SilentlyContinue
    Remove-Job -Job $launcher -Force -ErrorAction SilentlyContinue
  }
  Pop-Location
}
