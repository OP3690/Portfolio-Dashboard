# Vercel Deployment - Quick Start

## Your MongoDB Connection String

Use this exact connection string when deploying:

```
mongodb+srv://global5665:test123@cluster0.wigbba7.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0
```

**Note**: I've added the database name `OP_Portfolio_Dashboard` to your connection string.

---

## Step-by-Step Vercel Deployment

### 1. Go to Vercel
Visit: https://vercel.com

### 2. Sign In with GitHub
- Click "Sign Up" or "Log In"
- Choose "Continue with GitHub"
- Authorize Vercel

### 3. Import Your Project
1. Click **"Add New..."** → **"Project"**
2. Find **"Portfolio-Dashboard"** in the list
3. Click **"Import"**

### 4. Configure Project
**Root Directory**: `.` (default - leave as is)
- ✅ Framework will auto-detect as "Next.js"
- ✅ Build Command: `npm run build` (default)
- ✅ Output Directory: `.next` (default)
- ✅ Install Command: `npm install` (default)

### 5. Add Environment Variable ⚠️ IMPORTANT

**Before clicking Deploy**, add this environment variable:

1. Scroll down to **"Environment Variables"** section
2. Click to add a new variable:
   - **Key**: `MONGODB_URI`
   - **Value**: 
     ```
     mongodb+srv://global5665:test123@cluster0.wigbba7.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0
     ```
   - **Environment**: Select all (Production, Preview, Development)
   - Click **"Add"**

### 6. Deploy
1. Click **"Deploy"** button
2. Wait 2-3 minutes for build to complete
3. You'll see build progress in real-time
4. Once done, you'll get a URL like: `https://portfolio-dashboard-xxxxx.vercel.app`

### 7. Test
1. Visit your deployment URL
2. You should see the login page
3. Login with:
   - Email: `omprakashutaha@gmail.com`
   - Password: `123456`

---

## Render Deployment (Alternative)

If you want to deploy to Render as well:

### 1. Go to Render
Visit: https://render.com

### 2. Create Web Service
1. Click **"New +"** → **"Web Service"**
2. Connect **"Portfolio-Dashboard"** repository

### 3. Configure
- **Name**: `portfolio-dashboard`
- **Region**: Choose closest (e.g., Oregon)
- **Branch**: `main`
- **Root Directory**: Leave blank
- **Runtime**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

### 4. Environment Variables
Add these two:
1. **Key**: `MONGODB_URI`
   **Value**: `mongodb+srv://global5665:test123@cluster0.wigbba7.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0`

2. **Key**: `NODE_ENV`
   **Value**: `production`

### 5. Deploy
- Select **"Free"** plan
- Click **"Create Web Service"**
- Wait 5-10 minutes

---

## MongoDB Atlas Setup (Verify)

Make sure your MongoDB Atlas cluster is configured:

1. **Network Access**:
   - Go to MongoDB Atlas → Network Access
   - Ensure `0.0.0.0/0` is whitelisted (for Vercel/Render)

2. **Database User**:
   - Username: `global5665`
   - Password: `test123`
   - Ensure user has read/write permissions

3. **Database Name**:
   - Collections will be created in: `OP_Portfolio_Dashboard`

---

## Troubleshooting

### Connection Issues
- Verify IP whitelist includes `0.0.0.0/0` in MongoDB Atlas
- Check username/password are correct
- Ensure database name is `OP_Portfolio_Dashboard`

### Build Fails
- Check Vercel build logs
- Ensure all dependencies are in `package.json`
- Verify Node.js version (should be 18+)

---

## ✅ Success!

After deployment, your app will be live and accessible from anywhere!

**Vercel URL**: `https://portfolio-dashboard-xxxxx.vercel.app`
**Render URL**: `https://portfolio-dashboard.onrender.com`

Both will auto-deploy when you push to GitHub `main` branch!

