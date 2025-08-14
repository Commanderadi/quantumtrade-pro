@echo off
echo Starting Stock & Crypto Platform...
echo.

echo Step 1: Checking if .env file exists...
if not exist ".env" (
    echo ERROR: .env file is missing!
    echo Please create .env file with the content from SETUP_QUICK.md
    pause
    exit /b 1
)

echo Step 2: Installing backend dependencies...
cd backend
call npm install
if errorlevel 1 (
    echo ERROR: Backend npm install failed!
    pause
    exit /b 1
)

echo Step 3: Installing frontend dependencies...
cd ../frontend
call npm install
if errorlevel 1 (
    echo ERROR: Frontend npm install failed!
    pause
    exit /b 1
)

echo Step 4: Starting backend server...
cd ../backend
start "Backend Server" cmd /k "npm start"

echo Step 5: Starting frontend server...
cd ../frontend
start "Frontend Server" cmd /k "npm start"

echo.
echo Servers are starting...
echo Backend: http://localhost:5000
echo Frontend: http://localhost:3000
echo.
echo Press any key to close this window...
pause > nul 