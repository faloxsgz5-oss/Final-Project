@echo off
setlocal

set KIM_REMOTE_NAME=kim
set KIM_REMOTE_URL=https://github.com/konpong2006-pixel/Final-Project-KIKIM.git
set KIM_BRANCH=codex/merge-kim-updates-into-friend
set LOCAL_BRANCH=test-kim-merged

echo.
echo SmartLife: merge/check KIM updates
echo ----------------------------------
echo This script will NOT push to origin.
echo It will add/fetch KIM remote and checkout a local test branch.
echo.

git --version >nul 2>nul
if errorlevel 1 (
  echo Git is not installed or not available in PATH.
  exit /b 1
)

if not exist .git (
  echo This folder is not a Git repository.
  echo Please run this script inside the cloned Final-Project folder.
  exit /b 1
)

git remote get-url %KIM_REMOTE_NAME% >nul 2>nul
if errorlevel 1 (
  echo Adding remote %KIM_REMOTE_NAME%...
  git remote add %KIM_REMOTE_NAME% %KIM_REMOTE_URL%
) else (
  echo Remote %KIM_REMOTE_NAME% already exists.
)

echo Fetching KIM merged branch...
git fetch %KIM_REMOTE_NAME% %KIM_BRANCH%
if errorlevel 1 exit /b 1

git show-ref --verify --quiet refs/heads/%LOCAL_BRANCH%
if errorlevel 1 (
  echo Creating local branch %LOCAL_BRANCH% from %KIM_REMOTE_NAME%/%KIM_BRANCH%...
  git switch -c %LOCAL_BRANCH% %KIM_REMOTE_NAME%/%KIM_BRANCH%
) else (
  echo Switching to existing local branch %LOCAL_BRANCH%...
  git switch %LOCAL_BRANCH%
  if errorlevel 1 exit /b 1
  echo Updating local branch from %KIM_REMOTE_NAME%/%KIM_BRANCH%...
  git merge --ff-only %KIM_REMOTE_NAME%/%KIM_BRANCH%
)
if errorlevel 1 exit /b 1

echo Installing dependencies...
npm install
if errorlevel 1 exit /b 1

npm --prefix functions install
if errorlevel 1 exit /b 1

echo Running checks...
npm run typecheck
if errorlevel 1 exit /b 1

npm --prefix functions run build
if errorlevel 1 exit /b 1

npm run test:line-import
if errorlevel 1 exit /b 1

echo.
echo Done. You are now on branch %LOCAL_BRANCH%.
echo If everything looks good, create a new branch/PR instead of pushing to main directly.
echo.
