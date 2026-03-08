@echo off
REM ============================================================
REM  CrazyDesk Tracker — Build standalone .exe for Windows
REM ============================================================
REM  Prerequisites:
REM    pip install -r requirements.txt
REM
REM  Usage:
REM    build.bat
REM
REM  Output:
REM    dist\CrazyDeskTracker.exe  (single file, ~40-60 MB)
REM ============================================================

echo.
echo ============================================
echo   CrazyDesk Tracker — Build EXE
echo ============================================
echo.

REM Step 1: Generate icon if not present
if not exist "assets\icon.ico" (
    echo [1/4] Generating icon...
    python generate_icon.py
) else (
    echo [1/4] Icon already exists, skipping.
)

REM Step 2: Generate version info for Windows metadata
echo [2/4] Generating version info...
python version_info.py
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: version_info.py failed, building without version info
)

REM Step 3: Run PyInstaller (UPX disabled to reduce SmartScreen false positives)
echo [3/4] Building with PyInstaller...
pyinstaller ^
    --name "CrazyDeskTracker" ^
    --onefile ^
    --noconsole ^
    --icon "assets\icon.ico" ^
    --add-data "assets;assets" ^
    --hidden-import "pynput.keyboard._win32" ^
    --hidden-import "pynput.mouse._win32" ^
    --hidden-import "pystray._win32" ^
    --hidden-import "PIL._tkinter_finder" ^
    --version-file "file_version_info.txt" ^
    --noupx ^
    --clean ^
    --noconfirm ^
    crazydesk_tracker.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: PyInstaller build failed!
    pause
    exit /b 1
)

REM Step 4: Done
echo.
echo [4/4] Build complete!
echo.
echo   Output: dist\CrazyDeskTracker.exe
echo.
echo   To run: double-click dist\CrazyDeskTracker.exe
echo   The tracker will appear in your system tray.
echo.
echo   NOTE: Windows SmartScreen may show a warning on first run.
echo   Click "More info" then "Run anyway" to proceed.
echo.
pause
