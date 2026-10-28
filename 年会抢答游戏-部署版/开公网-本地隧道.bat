@echo off
cd /d "%~dp0"
echo 正在建立公网通道（localtunnel 备用，手机扫码后需输入一次 IP 才能继续）...
echo （大屏上的二维码就是让大家扫的码；IP 会显示在「开公网.bat」的窗口里）
echo.
node tunnel.js
pause
