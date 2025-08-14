@echo off
echo ========================================
echo    QuantumTrade Pro - Git Setup
echo ========================================
echo.

echo [1/6] Initializing Git repository...
git init

echo [2/6] Adding all files to Git...
git add .

echo [3/6] Making initial commit...
git commit -m "Initial commit: QuantumTrade Pro - Advanced Financial Intelligence Platform"

echo [4/6] Adding GitHub remote...
git remote add origin https://github.com/Commanderadi/quantumtrade-pro.git

echo [5/6] Setting main branch...
git branch -M main

echo [6/6] Pushing to GitHub...
git push -u origin main

echo.
echo ========================================
echo    Setup Complete!
echo ========================================
echo.
echo Your project is now on GitHub at:
echo https://github.com/Commanderadi/quantumtrade-pro
echo.
echo Next steps:
echo 1. Go to GitHub and verify your repository
echo 2. Add a description and topics
echo 3. Enable GitHub Pages if desired
echo 4. Share your project!
echo.
pause 