@echo off
chcp 65001 >nul
title C盘清理工具
echo ========================================
echo          C盘垃圾清理工具
echo ========================================
echo.
echo 正在准备清理，请稍候...
echo.

:: ============================================
:: 清理目录说明：
:: 1. 用户临时文件夹 (%temp%)
::    - 作用：存储当前用户运行程序时产生的临时文件
::    - 安全性：高，均可安全删除
:: 2. 系统临时文件夹 (C:\Windows\Temp)
::    - 作用：存储系统级别的临时文件
::    - 安全性：高，正在使用的文件会被跳过
:: 3. Windows更新下载缓存 (C:\Windows\SoftwareDistribution\Download)
::    - 作用：存储Windows更新安装包，更新完成后可删除
::    - 安全性：高，已安装的更新包可清理
:: 4. 回收站
::    - 作用：存放已删除的文件
::    - 安全性：中，清空后无法恢复
:: 5. 系统日志文件 (C:\Windows\Logs)
::    - 作用：存储Windows系统运行日志
::    - 安全性：高，日志文件可清理
:: 6. Prefetch预读取缓存 (C:\Windows\Prefetch)
::    - 作用：加速程序启动的预读取缓存
::    - 安全性：高，系统会自动重建
:: 7. 缩略图缓存
::    - 作用：资源管理器图片缩略图缓存
::    - 安全性：高，会自动重建
:: 8. 浏览器缓存（IE/Edge）
::    - 作用：网页浏览产生的缓存文件
::    - 安全性：高，可安全清理
:: ============================================

echo [1/8] 正在清理用户临时文件夹...
rd /s /q "%temp%" 2>nul
md "%temp%"

echo [2/8] 正在清理系统临时文件夹...
rd /s /q "C:\Windows\Temp" 2>nul
md "C:\Windows\Temp"

echo [3/8] 正在清理Windows更新缓存...
net stop wuauserv >nul 2>&1
net stop bits >nul 2>&1
rd /s /q "C:\Windows\SoftwareDistribution\Download" 2>nul
md "C:\Windows\SoftwareDistribution\Download"
net start wuauserv >nul 2>&1
net start bits >nul 2>&1

echo [4/8] 正在清空回收站...
rd /s /q "C:\$Recycle.Bin" 2>nul

echo [5/8] 正在清理系统日志文件...
for /d /r "C:\Windows\Logs" %%d in (*) do rd /s /q "%%d" 2>nul
del /s /f /q "C:\Windows\Logs\*.*" 2>nul

echo [6/8] 正在清理预读取缓存...
del /s /f /q "C:\Windows\Prefetch\*.*" 2>nul

echo [7/8] 正在清理缩略图缓存...
del /s /f /q "%localappdata%\Microsoft\Windows\Explorer\thumbcache_*.db" 2>nul

echo [8/8] 正在清理浏览器缓存...
rd /s /q "%localappdata%\Microsoft\Windows\INetCache" 2>nul
md "%localappdata%\Microsoft\Windows\INetCache"

echo.
echo ========================================
echo          清理完成！
echo ========================================
echo.
pause