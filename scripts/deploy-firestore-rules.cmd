@echo off
cd /d "%~dp0.."
echo Deploying SmartLife Firestore rules...
call npx -y firebase-tools@latest deploy --only firestore:rules --project smartlife-budget
if errorlevel 1 (
  echo.
  echo Deployment failed. Keep this window open and check the message above.
  pause
  exit /b 1
)
echo.
echo Firestore rules deployed successfully.
pause
