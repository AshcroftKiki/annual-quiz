@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [提示] 还没安装 Node.js，无法运行。
  echo 请先到 https://nodejs.org 下载安装（选 LTS 版，一路下一步即可），装完重新双击本文件。
  start https://nodejs.org
  pause
  exit /b
)

if not exist node_modules (
  echo 首次使用，正在安装依赖（稍等几十秒，只需一次）...
  call npm install
)

echo.
echo 抢答服务启动中，3 秒后自动打开本地大屏页（仅供本机测试）...
echo 活动当天要让大家扫码，请再双击「开公网.bat」。
echo （活动期间请勿关闭这个黑窗口；关闭即停止服务）
echo.
start "" cmd /c "timeout /t 3 >nul && start http://localhost:3000/host.html"
node server.js
pause
