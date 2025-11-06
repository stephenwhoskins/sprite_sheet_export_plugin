@echo off
setlocal

:: Define the destination folder
set "DEST1=%LOCALAPPDATA%\Adobe\Animate 2024\en_US\Configuration\Commands"


copy "src\Art brush.include" "%DEST1%%" /Y
copy "src\auto tween.include" "%DEST1%" /Y
copy "src\Sprite sheet export.jsfl" "%DEST1%" /Y
copy "src\Zero Transform.include" "%DEST1%" /Y

echo All files copied.
endlocal
pause
