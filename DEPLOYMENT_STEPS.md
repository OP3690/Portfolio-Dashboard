# Step-by-Step Deployment Guide

## ✅ Step 1: Code Pushed to GitHub

Your code has been successfully pushed to: https://github.com/OP3690/Portfolio-Dashboard

---

## 🚀 Step 2: Deploy to Vercel (Recommended for Next.js)

### 2.1 Create Vercel Account
1. Go to https://vercel.com
2. Click "Sign Up"
3. Choose "Continue with GitHub"
4. Authorize Vercel to access your GitHub account

### 2.2 Import Your Project
1. After logging in, click "Add New..." button (top right)
2. Click "Project"
3. You'll see a list of your GitHub repositories
4. Find "Portfolio-Dashboard" and click "Import"

### 2.3 Configure Project Settings
1. **Framework Preset**: Should auto-detect "Next.js" ✅
2. **Root Directory**: 
   - If your repo structure is: `Portfolio-Dashboard/portfolio-dashboard/`
   - Then set: `portfolio-dashboard`
   - If code is at root: leave as `.` (default)
3. **Build Command**: `npm run build` (default - keep this)
4. **Output Directory**: `.next` (default - keep this)
5. **Install Command**: `npm install` (default - keep this)

### 2.4 Add Environment Variables
**IMPORTANT**: You must add your MongoDB connection string!

1. In the "Environment Variables" section:
   - **Key**: `MONGODB_URI`
   - **Value**: Your MongoDB Atlas connection string
     - Example: `mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority`
   - **Environment**: Select all (Production, Preview, Development)
   - Click "Add"

2. Click "Deploy" button

### 2.5 Wait for Deployment
- Vercel will build your project (takes 2-3 minutes)
- You'll see build logs in real-time
- Once complete, you'll get a URL like: `https://portfolio-dashboard-xxxxx.vercel.app`

### 2.6 Test Your Deployment
1. Visit your deployment URL
2. You should see the login page
3. Login with: `omprakashutaha@gmail.com` / `123456`
4. Test the dashboard functionality

---

## 🌐 Step 3: Deploy to Render (Alternative/Backup)

### 3.1 Create Render Account
1. Go to https://render.com
2. Click "Get Started for Free"
3. Choose "Continue with GitHub"
4. Authorize Render to access your GitHub account

### 3.2 Create New Web Service
1. Click "New +" button (top right)
2. Select "Web Service"
3. Click "Connect account" if not already connected
4. Find "Portfolio-Dashboard" repository
5. Click "Connect"

### 3.3 Configure Web Service
Fill in the following:

- **Name**: `portfolio-dashboard`
- **Region**: Choose closest to you (e.g., "Oregon (US West)")
- **Branch**: `main`
- **Root Directory**: 
  - If nested: `portfolio-dashboard`
  - If root: leave blank
- **Runtime**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

### 3.4 Add Environment Variables
1. Scroll down to "Environment Variables" section
2. Click "Add Environment Variable"
3. Add:
   - **Key**: `MONGODB_URI`
   - **Value**: Your MongoDB connection string
   - Click "Save"

4. Add another:
   - **Key**: `NODE_ENV`
   - **Value**: `production`
   - Click "Save"

### 3.5 Select Plan and Deploy
1. Under "Plan", select "Free"
   - Note: Free plan spins down after 15 min of inactivity
2. Click "Create Web Service"
3. Render will start building (takes 5-10 minutes)

### 3.6 Get Your URL
- Once deployed, you'll get: `https://portfolio-dashboard.onrender.com`
- Note: First load after inactivity may take 30-60 seconds (cold start)

---

## 📊 Step 4: MongoDB Atlas Setup (If Not Done)

### 4.1 Create MongoDB Atlas Account
1. Go to https://www.mongodb.com/cloud/atlas
2. Click "Try Free"
3. Sign up with email or Google

### 4.2 Create a Cluster
1. Choose "Build a Database" → "Free" (M0)
2. Choose a cloud provider (AWS recommended)
3. Select a region closest to you
4. Name your cluster (e.g., "portfolio-cluster")
5. Click "Create"

### 4.3 Create Database User
1. Go to "Database Access" (left sidebar)
2. Click "Add New Database User"
3. Choose "Password" authentication
4. Username: Create a username
5. Password: Generate a secure password (SAVE THIS!)
6. Database User Privileges: "Atlas admin" (or "Read and write to any database")
7. Click "Add User"

### 4.4 Whitelist IP Addresses
1. Go to "Network Access" (left sidebar)
2. Click "Add IP Address"
3. For Vercel/Render: Click "Allow Access from Anywhere" 
   - This adds `0.0.0.0/0`
4. Click "Confirm"

### 4.5 Get Connection String
1. Go to "Database" → Click "Connect" on your cluster
2. Choose "Connect your application"
3. Driver: "Node.js", Version: "5.5 or later"
4. Copy the connection string
5. Replace `<password>` with your database user password
6. Replace `<database>` with your database name (e.g., `portfolio`)
7. Final string looks like:
   ```
   mongodb+srv://username:password@cluster.mongodb.net/portfolio?retryWrites=true&w=majority
   ```

### 4.6 Add to Vercel/Render
Use this connection string as the `MONGODB_URI` environment variable in both platforms.

---

## 🔧 Step 5: Post-Deployment Configuration

### 5.1 Verify Environment Variables
- ✅ `MONGODB_URI` is set correctly
- ✅ Connection string includes password and database name

### 5.2 Test All Features
- [ ] Login works
- [ ] Dashboard loads
- [ ] Excel upload works
- [ ] Stock analytics displays
- [ ] API routes respond correctly

### 5.3 Monitor Logs
- **Vercel**: Go to your project → "Deployments" → Click latest → "Logs"
- **Render**: Go to your service → "Logs" tab

### 5.4 Set Up Custom Domain (Optional)

**For Vercel:**
1. Go to Project → Settings → Domains
2. Add your domain
3. Follow DNS configuration instructions

**For Render:**
1. Go to your service → Settings → Custom Domain
2. Add your domain
3. Update DNS records as shown

---

## 🐛 Troubleshooting

### Build Fails
**Error**: Module not found / Build errors
**Solution**: 
- Check build logs for specific error
- Ensure all dependencies are in `package.json`
- Try clearing build cache

### MongoDB Connection Fails
**Error**: MongooseServerSelectionError / Connection timeout
**Solution**:
- Verify `MONGODB_URI` is correct
- Check IP whitelist includes `0.0.0.0/0`
- Ensure database user password is correct
- Check network access in MongoDB Atlas

### API Routes Not Working
**Error**: 404 on API routes
**Solution**:
- Verify API routes are in `app/api/` directory
- Check file structure matches Next.js App Router format
- Ensure `export const dynamic = 'force-dynamic'` in API routes

### Environment Variables Not Loading
**Error**: Undefined env variables
**Solution**:
- Restart deployment after adding env vars
- Check variable names match exactly (case-sensitive)
- Clear build cache and redeploy

---

## 📝 Quick Checklist

Before deploying:
- [ ] Code pushed to GitHub
- [ ] MongoDB Atlas cluster created
- [ ] Database user created
- [ ] IP whitelist configured
- [ ] Connection string copied

Vercel deployment:
- [ ] Account created and linked to GitHub
- [ ] Project imported
- [ ] Root directory configured correctly
- [ ] `MONGODB_URI` environment variable added
- [ ] Deployment successful
- [ ] Login tested

Render deployment:
- [ ] Account created and linked to GitHub
- [ ] Web service created
- [ ] Build and start commands configured
- [ ] `MONGODB_URI` and `NODE_ENV` added
- [ ] Deployment successful
- [ ] Login tested

---

## 🎉 Success!

Once deployed, your app will be available at:
- **Vercel**: `https://portfolio-dashboard-xxxxx.vercel.app`
- **Render**: `https://portfolio-dashboard.onrender.com`

Both platforms will auto-deploy when you push to the `main` branch!

