@echo off
setlocal
set "SMARTLIFE_ROOT=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SMARTLIFE_ROOT%scripts\setup-team.ps1" %*
exit /b %ERRORLEVEL%
