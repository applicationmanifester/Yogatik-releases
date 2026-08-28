@echo off
echo === where go ===
where go 2>nul
echo === Program Files Go ===
dir /b "C:\Program Files\Go\bin" 2>nul
echo === C Go ===
dir /b "C:\Go\bin" 2>nul
echo === userprofile go ===
dir /b "%USERPROFILE%\go\bin" 2>nul
echo === localappdata Programs Go ===
dir /b "%LOCALAPPDATA%\Programs\Go\bin" 2>nul
echo === done ===