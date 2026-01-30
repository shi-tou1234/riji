@echo off
echo 正在启动我的日记本...
cd /d "%~dp0"
npm run electron:dev
pause
