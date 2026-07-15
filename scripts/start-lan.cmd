@echo off
cd /d "%~dp0.."
node node_modules\expo\bin\cli start --dev-client --lan --port 8081 > expo-lan.log 2> expo-lan-error.log
