@echo off
cd /d "%~dp0"
echo 正在建立公网通道（cloudflared，手机扫码直接进、不用输密码）...
echo 若长时间没反应，可能是网络限制，可改用「开公网-本地隧道.bat」。
echo.
node cf-tunnel.js
pause
