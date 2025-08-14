# 🚀 Quick Setup Guide - Fix All Errors

## **Step 1: Create Environment File**

Create a file named `.env` in the root directory with this content:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=stock_crypto_platform
DB_PORT=3306

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random_123456789

# Server Configuration
PORT=5000
NODE_ENV=development

# API Keys (optional - you can get these later)
ALPHA_VANTAGE_API_KEY=demo
FINNHUB_API_KEY=demo
COINAPI_API_KEY=demo
```

## **Step 2: Start Backend**

```powershell
cd backend
npm install
npm start
```

## **Step 3: Start Frontend (in new terminal)**

```powershell
cd frontend
npm start
```

## **Step 4: Database Setup**

1. Install MySQL if not already installed
2. Create database: `CREATE DATABASE stock_crypto_platform;`
3. Run the schema: `mysql -u root -p stock_crypto_platform < backend/database/schema.sql`

## **Common Errors & Fixes:**

### ❌ "Cannot find module" errors
**Fix:** Run `npm install` in both backend and frontend directories

### ❌ "Port already in use" 
**Fix:** Kill existing processes or change PORT in .env

### ❌ "Database connection failed"
**Fix:** Check MySQL is running and credentials in .env

### ❌ "React version conflicts"
**Fix:** Already fixed - using React 18 now

### ❌ "API key errors"
**Fix:** The app will work with demo keys, but get real ones for full features

## **Quick Test:**

1. Backend should show: `Backend server is running on http://localhost:5000`
2. Frontend should open: `http://localhost:3000`
3. Register/login should work
4. All AI features should work with mock data

## **Need Help?**

If you still get errors, run these commands:

```powershell
# Clean install
cd backend
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install

cd ../frontend  
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

The platform will work with mock data even without real API keys! 🎉 