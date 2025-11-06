@echo off
setlocal

:: Define the destination folder
set "DEST2=C:\Program Files\Adobe\Adobe Animate 2024\Common\Configuration\Sprite Sheet Plugins"

copy "%CD%\src\JSON-stacked.plugin.jsfl" "%DEST2%" /Y

echo All files copied.
endlocal
pause
