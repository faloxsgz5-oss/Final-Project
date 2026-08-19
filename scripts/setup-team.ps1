[CmdletBinding()]
param(
  [switch]$RunAndroid,
  [switch]$SkipFirebaseLogin,
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$ProjectId = 'smartlife-budget'
$AndroidFirebaseAppId = '1:302211453614:android:985bc020cd94b78e2d133f'
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$EnvironmentPath = Join-Path $RepositoryRoot '.env.local'
$PreservedDebugToken = $null

if (Test-Path $EnvironmentPath) {
  $ExistingEnvironmentText = [System.IO.File]::ReadAllText($EnvironmentPath)
  $ExistingTokenMatch = [regex]::Match($ExistingEnvironmentText, '(?m)^EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN=([0-9a-fA-F-]{36})\s*$')
  if ($ExistingTokenMatch.Success) {
    $PreservedDebugToken = $ExistingTokenMatch.Groups[1].Value
  }
}

function Write-Step([string]$Message) {
  Write-Host "`n[SmartLife] $Message" -ForegroundColor Green
}

function Resolve-Command([string]$Name, [string[]]$Fallbacks = @()) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  foreach ($fallback in $Fallbacks) {
    if (Test-Path $fallback) { return $fallback }
  }
  return $null
}

function Invoke-Checked([string]$Executable, [string[]]$Arguments, [string]$FailureMessage) {
  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
}

Set-Location $RepositoryRoot
Write-Step "Preparing the shared SmartLife development environment"

$Node = Resolve-Command 'node.exe' @('C:\Program Files\nodejs\node.exe')
$Npm = Resolve-Command 'npm.cmd' @('C:\Program Files\nodejs\npm.cmd')
if (-not $Node -or -not $Npm) {
  $Winget = Resolve-Command 'winget.exe'
  if (-not $Winget) {
    throw 'Node.js 20+ is required. Install Node.js LTS, then run setup-smartlife.cmd again.'
  }
  Write-Step "Node.js was not found; installing Node.js LTS"
  Invoke-Checked $Winget @('install', '--id', 'OpenJS.NodeJS.LTS', '--exact', '--accept-package-agreements', '--accept-source-agreements', '--silent') 'Node.js installation failed.'
  $env:Path = "C:\Program Files\nodejs;$env:Path"
  $Node = Resolve-Command 'node.exe' @('C:\Program Files\nodejs\node.exe')
  $Npm = Resolve-Command 'npm.cmd' @('C:\Program Files\nodejs\npm.cmd')
}
if (-not $Node -or -not $Npm) { throw 'Node.js was installed but is not available yet. Reopen CMD and run setup-smartlife.cmd again.' }

$NodeMajor = [int]((& $Node --version).TrimStart('v').Split('.')[0])
if ($NodeMajor -lt 20) { throw 'SmartLife requires Node.js 20 or newer.' }

Write-Step "Connecting the app to the shared smartlife-budget Firebase project"
Copy-Item (Join-Path $RepositoryRoot '.env.example') (Join-Path $RepositoryRoot '.env.local') -Force
Copy-Item (Join-Path $RepositoryRoot 'config\google-services.team.json') (Join-Path $RepositoryRoot 'google-services.json') -Force

if ($PreservedDebugToken) {
  $RestoredEnvironmentText = [System.IO.File]::ReadAllText($EnvironmentPath)
  $RestoredEnvironmentText = [regex]::Replace(
    $RestoredEnvironmentText,
    '(?m)^EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN=.*$',
    "EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN=$PreservedDebugToken"
  )
  [System.IO.File]::WriteAllText($EnvironmentPath, $RestoredEnvironmentText, $Utf8NoBom)
}

if (-not $SkipInstall) {
  Write-Step "Installing application packages"
  Invoke-Checked $Npm @('ci') 'Application dependency installation failed.'
  Write-Step "Installing Cloud Functions packages"
  Push-Location (Join-Path $RepositoryRoot 'functions')
  try { Invoke-Checked $Npm @('ci') 'Cloud Functions dependency installation failed.' }
  finally { Pop-Location }
}

if (-not $SkipFirebaseLogin) {
  $Npx = Resolve-Command 'npx.cmd' @('C:\Program Files\nodejs\npx.cmd')
  if (-not $Npx) { throw 'npx is required but was not found.' }

  Write-Step "Checking Firebase team access"
  # Firebase CLI writes progress updates to stderr even when the command succeeds.
  # Do not let PowerShell treat those updates as terminating errors during setup.
  $PreviousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $Npx -y firebase-tools@latest projects:list --json *> $null
  $FirebaseProjectsExitCode = $LASTEXITCODE
  $ErrorActionPreference = $PreviousErrorActionPreference
  if ($FirebaseProjectsExitCode -ne 0) {
    Write-Step "Sign in with the Google account that has access to smartlife-budget"
    Invoke-Checked $Npx @('-y', 'firebase-tools@latest', 'login') 'Firebase login failed.'
  }

  $EnvironmentText = [System.IO.File]::ReadAllText($EnvironmentPath)
  $DebugToken = if ($PreservedDebugToken) { $PreservedDebugToken } else { [guid]::NewGuid().ToString() }
  $DisplayName = "SmartLife-$($env:COMPUTERNAME)-$($env:USERNAME)"

  if (-not $PreservedDebugToken) {
    Write-Step "Registering this computer with Firebase App Check"
    Invoke-Checked $Npx @(
      '-y', 'firebase-tools@latest',
      'appcheck:debugtokens:create', $DebugToken,
      '--app', $AndroidFirebaseAppId,
      '--display-name', $DisplayName,
      '--force',
      '--project', $ProjectId
    ) 'App Check registration failed. Ask the project owner to grant this Google account Firebase App Check access.'
  } else {
    Write-Step "Reusing this computer's existing Firebase App Check registration"
  }

  if ($EnvironmentText -match '(?m)^EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN=.*$') {
    $EnvironmentText = [regex]::Replace($EnvironmentText, '(?m)^EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN=.*$', "EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN=$DebugToken")
  } else {
    $EnvironmentText = $EnvironmentText.TrimEnd() + "`r`nEXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN=$DebugToken`r`n"
  }
  [System.IO.File]::WriteAllText($EnvironmentPath, $EnvironmentText, $Utf8NoBom)
}

Write-Step "Checking the SmartLife configuration"
Invoke-Checked $Npm @('run', 'doctor') 'SmartLife configuration validation failed.'

Write-Host "`nSmartLife is ready and connected to the shared backend." -ForegroundColor Cyan
Write-Host 'Gemini, iApp OCR, Firestore, Storage, and Cloud Functions use the already deployed smartlife-budget backend.'

if ($RunAndroid) {
  Write-Step "Building and opening SmartLife on Android"
  Invoke-Checked $Npm @('run', 'android') 'Android build or launch failed. Check Android Studio/emulator availability.'
} else {
  Write-Host "`nNext command: npm run android" -ForegroundColor Yellow
  Write-Host 'Or run: npm start  (when a SmartLife Development Build is already installed)'
}
