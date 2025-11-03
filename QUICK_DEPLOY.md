# Quick Deployment Guide

## ✅ Code is on GitHub!
**Repository**: https://github.com/OP3690/Portfolio-Dashboard

---

## 🚀 Vercel Deployment (5 Minutes)

### Step 1: Sign Up/Login
1. Go to: https://vercel.com
2. Click "Sign Up" → "Continue with GitHub"

### Step 2: Import Project
1. Click "Add New..." → "Project"
2. Find "Portfolio-Dashboard" → Click "Import"

### Step 3: Configure
- **Framework**: Next.js (auto-detected) ✅
- **Root Directory**: `.` (default - leave as is)
- **Build Command**: `npm run build` (default)
- **Output Directory**: `.next` (default)

### Step 4: Add Environment Variable
**CRITICAL**: Add this before deploying!

- Click "Environment Variables"
- **Key**: `MONGODB_URI`
- **Value**: Your MongoDB connection string
  ```
  mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
  ```
- Select all environments (Production, Preview, Development)
- Click "Add"

### Step 5: Deploy
1. Click "Deploy"
2. Wait 2-3 minutes
3. Visit your URL: `https://portfolio-dashboard-xxxxx.vercel.app`

---

## 🌐 Render Deployment (10 Minutes)

### Step 1: Sign Up/Login
1. Go to: https://render.com
2. Click "Get Started for Free" → "Continue with GitHub"

### Step 2: Create Web Service
1. Click "New +" → "Web Service"
2. Connect "Portfolio-Dashboard" repository

### Step 3: Configure
- **Name**: `portfolio-dashboard`
- **Region**: Choose closest (e.g., Oregon)
- **Branch**: `main`
- **Root Directory**: Leave blank (default `.`)
- **Runtime**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

### Step 4: Environment Variables
Add these:
1. **Key**: `MONGODB_URI` → **Value**: Your MongoDB connection string
2. **Key**: `NODE_ENV` → **Value**: `production`

### Step 5: Deploy
1. Select "Free" plan
2. Click "Create Web Service"
3. Wait 5-10 minutes
4. Visit: `https://portfolio-dashboard.onrender.com`

---

## 📊 MongoDB Atlas Setup (If Needed)

### Quick Setup:
1. Go to: https://www.mongodb.com/cloud/atlas
2. Sign up → Create Free Cluster (M0)
3. **Database Access**: Create user → Save password!
4. **Network Access**: Add IP `0.0.0.0/0` (Allow from anywhere)
5. **Database**: Click "Connect" → "Connect your application"
6. Copy connection string → Replace `<password>` and `<database>`

**Example connection string:**
```
mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/portfolio?retryWrites=true&w=majority
```

---

## ✅ Test After Deployment

1. Visit your deployed URL
2. You should see login page
3. Login with:
   - Email: `omprakashutaha@gmail.com`
   - Password: `123456`
4. Test dashboard features

---

## 🆘 Need Help?

Check `DEPLOYMENT_STEPS.md` for detailed troubleshooting guide.

---

## 📝 Important Notes

- **Vercel** is recommended (better for Next.js, faster)
- **Render** free tier spins down after 15 min inactivity (cold starts)
- Both auto-deploy on git push to `main` branch
- Always add `MONGODB_URI` before first deployment!

