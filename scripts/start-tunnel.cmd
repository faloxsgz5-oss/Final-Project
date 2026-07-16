@echo off
cd /d "%~dp0.."
node node_modules\expo\bin\cli start --dev-client --tunnel --port 8081 > expo-tunnel.log 2> expo-tunnel-error.log
