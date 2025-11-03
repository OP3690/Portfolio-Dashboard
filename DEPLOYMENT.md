# Deployment Guide

## Prerequisites
- GitHub account with repository: https://github.com/OP3690/Portfolio-Dashboard
- Vercel account (free tier works)
- Render account (free tier works)
- MongoDB Atlas account (for database)

## Environment Variables Required

Before deploying, you'll need to set these environment variables:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
```

## Step-by-Step Deployment Instructions

### Part 1: Push Code to GitHub

1. **Add all files to git:**
   ```bash
   git add .
   ```

2. **Commit changes:**
   ```bash
   git commit -m "Initial portfolio dashboard with login and analytics"
   ```

3. **Set remote (if not already set):**
   ```bash
   git remote add origin https://github.com/OP3690/Portfolio-Dashboard.git
   ```

4. **Push to GitHub:**
   ```bash
   git push -u origin main
   ```

### Part 2: Deploy to Vercel

Vercel is recommended for Next.js apps as it has native support.

1. **Go to Vercel:**
   - Visit https://vercel.com
   - Sign in with your GitHub account

2. **Import Project:**
   - Click "Add New..." → "Project"
   - Import from GitHub → Select "Portfolio-Dashboard" repository
   - Click "Import"

3. **Configure Project:**
   - **Framework Preset:** Next.js (auto-detected)
   - **Root Directory:** `portfolio-dashboard` (if your repo has nested structure) or `.` (if root)
   - **Build Command:** `npm run build` (default)
   - **Output Directory:** `.next` (default)
   - **Install Command:** `npm install` (default)

4. **Add Environment Variables:**
   - Click "Environment Variables"
   - Add: `MONGODB_URI` = `your_mongodb_connection_string`
   - Click "Save"

5. **Deploy:**
   - Click "Deploy"
   - Wait for build to complete (~2-3 minutes)
   - Your app will be live at: `https://portfolio-dashboard-xxxxx.vercel.app`

6. **Custom Domain (Optional):**
   - Go to Settings → Domains
   - Add your custom domain

### Part 3: Deploy to Render

Render can be used as a backup or for specific services.

1. **Go to Render:**
   - Visit https://render.com
   - Sign up/Login with GitHub

2. **Create New Web Service:**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository: "Portfolio-Dashboard"
   - Click "Connect"

3. **Configure Service:**
   - **Name:** `portfolio-dashboard`
   - **Region:** Choose closest to you (e.g., Oregon, US)
   - **Branch:** `main`
   - **Root Directory:** `portfolio-dashboard` (if nested) or leave blank (if root)
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`

4. **Add Environment Variables:**
   - Scroll to "Environment Variables"
   - Add: `MONGODB_URI` = `your_mongodb_connection_string`
   - Add: `NODE_ENV` = `production`

5. **Select Plan:**
   - Choose "Free" plan
   - Click "Create Web Service"

6. **Deploy:**
   - Render will start building automatically
   - Wait for deployment (~5-10 minutes)
   - Your app will be live at: `https://portfolio-dashboard.onrender.com`

### Part 4: Post-Deployment Checklist

- [ ] Test login functionality
- [ ] Test file upload
- [ ] Verify MongoDB connection
- [ ] Check API routes are working
- [ ] Test on mobile devices
- [ ] Monitor error logs

### Troubleshooting

**Common Issues:**

1. **Build Fails on Vercel/Render:**
   - Check build logs for errors
   - Ensure all dependencies are in `package.json`
   - Verify Node.js version compatibility

2. **MongoDB Connection Issues:**
   - Verify `MONGODB_URI` is correctly set
   - Check MongoDB Atlas IP whitelist (add 0.0.0.0/0 for Render/Vercel)
   - Ensure database user has proper permissions

3. **Environment Variables Not Working:**
   - Restart deployment after adding env vars
   - Check variable names match exactly (case-sensitive)
   - Clear build cache if needed

4. **API Routes Not Working:**
   - Verify `export const dynamic = 'force-dynamic'` in API routes
   - Check API route file structure matches Next.js 13+ App Router format

### Recommended: MongoDB Atlas Setup

1. Create account at https://www.mongodb.com/cloud/atlas
2. Create a free cluster
3. Create database user
4. Whitelist IP addresses:
   - For Vercel: Add `0.0.0.0/0` (allow all)
   - For Render: Add `0.0.0.0/0` (allow all)
5. Get connection string from "Connect" → "Connect your application"
6. Replace `<password>` and `<database>` in connection string

### Notes

- Vercel is recommended for Next.js apps (better performance, automatic optimizations)
- Render free tier may spin down after inactivity (cold starts take time)
- Both platforms auto-deploy on git push to main branch
- Monitor usage to stay within free tier limits

