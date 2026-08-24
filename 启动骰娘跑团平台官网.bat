@echo off
title 尘封之卷 · 骰娘跑团平台官网
cd /d "%~dp0"

rem ---- 探测 Python 命令（兼容 PATH 缺失情况）----
set PYCMD=
where python >nul 2>nul
if not errorlevel 1 (
    set PYCMD=python
    goto :pyfound
)
if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
    set PYCMD=%LOCALAPPDATA%\Programs\Python\Python313\python.exe
    goto :pyfound
)
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    set PYCMD=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
    goto :pyfound
)
echo [错误] 未找到 Python 解释器。
echo 请先安装 Python 3.8+（安装时勾选 Add python.exe to PATH）。
pause
exit /b 1

:pyfound
echo ============================================
echo   尘封之卷 · 骰娘跑团平台官网
echo   正在启动服务器（端口 5000）...
echo   浏览器将自动打开官网门户页面
echo   关闭本窗口即停止服务
echo ============================================

rem 4 秒后自动打开浏览器（后台执行，不显示额外窗口）
start "" /b powershell -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:5000/'"

%PYCMD% -m web.app

if errorlevel 1 (
    echo.
    echo [提示] 服务器启动失败，请查看上方错误信息。
    echo   常见原因：端口 5000 被占用，或依赖缺失（可运行 pip install -r requirements.txt）。
)
echo.
echo 服务器已停止。
pause
