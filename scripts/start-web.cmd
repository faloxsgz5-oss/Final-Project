@echo off
cd /d "%~dp0.."
node node_modules\expo\bin\cli start --web --port 8081 > expo-web.log 2> expo-web-error.log
