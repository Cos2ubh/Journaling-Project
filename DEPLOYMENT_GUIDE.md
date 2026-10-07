# Deployment Guide - Veritas Daily

## Quick checklist (current setup)

The rest of this guide is the detailed walkthrough. This is the short version for the current code.

1. **Database: MongoDB Atlas.** Create a free cluster, a database user, and allow network access from anywhere (Render's IPs change). Copy the connection string.
2. **API: Render.** New > Blueprint > pick this repo. `render.yaml` creates `veritas-daily-api` (free plan, Singapore region, `server/` folder) and generates `JWT_SECRET` and `JOB_SECRET`. In the dashboard, fill in: `MONGODB_URI`, `NEWSAPI_KEY`, `ANTHROPIC_API_KEY`, `FRONTEND_URL` (your Vercel URL), `API_URL` (this service's URL), and the `SMTP_*` / `FROM_EMAIL` values if you want the morning email.
3. **Web app: Vercel.** Import the repo with root directory `client`. Set `VITE_API_URL` to `<API_URL>/api` and, optionally, `VITE_POSTHOG_KEY`. `client/vercel.json` makes routes like `/today` work on refresh.
4. **Scheduled jobs: GitHub Actions.** The free Render plan sleeps, so `.github/workflows/scheduled-jobs.yml` wakes it and triggers jobs. Add repository secrets `API_URL` and `JOB_SECRET` (copy the value Render generated). Run the workflow once by hand (Actions > Scheduled jobs > Run workflow > `fetch-news`) to load the first stories.
5. **Admin account.** Register in the app, then from `server/` with `MONGODB_URI` pointing at Atlas: `npm run make-admin -- you@example.com`.

Notes:
- GitHub can delay scheduled workflows by several minutes, and pauses them after 60 days without repository activity.
- Check NewsAPI's terms for your plan before going public: the free Developer plan may be limited to development use.
- AI costs: each new story is analysed once and enriched once (Claude Haiku). Set a monthly spend limit in the Claude Console.


## Overview
This guide will help you deploy your news filtering website online with automatic updates.

---

## Prerequisites
1. GitHub account
2. MongoDB Atlas account (free tier available)
3. Render account (for backend - free tier available)
4. Vercel account (for frontend - free tier available)

---

## Step 1: Prepare for Deployment

### 1.1 Create `.gitignore` (if not exists)
```
# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/

# Production
build/
dist/

# Environment variables
.env
.env.local
.env.production.local

# Logs
*.log
npm-debug.log*
logs/

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo
```

### 1.2 Update Backend for Production

Create `server/.env.example`:
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_very_long_random_secret_key_here
JWT_EXPIRE=7d

# API Keys
NEWSAPI_KEY=your_newsapi_key
ANTHROPIC_API_KEY=your_anthropic_key

# Frontend URL (update after Vercel deployment)
FRONTEND_URL=https://your-app.vercel.app
```

---

## Step 2: Deploy Database (MongoDB Atlas)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free account
3. Create a new cluster (free M0 tier)
4. Click "Connect" → "Connect your application"
5. Copy the connection string
6. Replace `<password>` with your database password
7. Save this connection string for later

**Example Connection String:**
```
mongodb+srv://username:<password>@cluster0.xxxxx.mongodb.net/news-filter?retryWrites=true&w=majority
```

---

## Step 3: Deploy Backend (Render)

### 3.1 Push Code to GitHub
```bash
# Navigate to project root
cd path\to\your\project

# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit - News filtering website"

# Create GitHub repository and push
git remote add origin https://github.com/yourusername/news-filter.git
git branch -M main
git push -u origin main
```

### 3.2 Deploy on Render
1. Go to [Render.com](https://render.com)
2. Sign up with GitHub
3. Click "New +" → "Web Service"
4. Connect your GitHub repository
5. Configure:
   - **Name**: `news-filter-backend`
   - **Root Directory**: `server`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

6. Add Environment Variables (in Render dashboard):
   ```
   NODE_ENV=production
   MONGODB_URI=your_mongodb_atlas_connection_string
   JWT_SECRET=generate_a_long_random_string_here
   JWT_EXPIRE=7d
   NEWSAPI_KEY=your_newsapi_key
   ANTHROPIC_API_KEY=your_anthropic_key
   FRONTEND_URL=https://your-app.vercel.app
   ```

7. Click "Create Web Service"
8. Wait for deployment (5-10 minutes)
9. Copy your backend URL (e.g., `https://news-filter-backend.onrender.com`)

**Important**: Free tier Render services go to sleep after 15 minutes of inactivity. Add a health check service or upgrade to paid tier for 24/7 availability.

---

## Step 4: Deploy Frontend (Vercel)

### 4.1 Update Frontend Configuration

Create `client/.env.production`:
```env
VITE_API_URL=https://news-filter-backend.onrender.com/api
```

### 4.2 Deploy on Vercel
1. Go to [Vercel.com](https://vercel.com)
2. Sign up with GitHub
3. Click "Add New" → "Project"
4. Import your GitHub repository
5. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

6. Add Environment Variable:
   - Key: `VITE_API_URL`
   - Value: `https://news-filter-backend.onrender.com/api`

7. Click "Deploy"
8. Wait for deployment (2-3 minutes)
9. Copy your frontend URL (e.g., `https://news-filter.vercel.app`)

### 4.3 Update Backend with Frontend URL
1. Go back to Render dashboard
2. Update `FRONTEND_URL` environment variable with your Vercel URL
3. Restart the backend service

---

## Step 5: Configure Automatic Updates

Your app already has automatic updates configured via cron jobs:
- ✅ News fetch every hour
- ✅ Viral detection every 2 hours
- ✅ Database cleanup daily

**For free tier Render**: The service sleeps after 15 minutes of inactivity, stopping cron jobs.

### Solutions:

#### Option 1: Keep Service Awake (Free)
Use an external ping service:
1. [UptimeRobot](https://uptimerobot.com) - Free tier
2. Add monitor: `https://news-filter-backend.onrender.com/health`
3. Set interval: Every 14 minutes
4. This keeps your service awake 24/7

#### Option 2: Upgrade to Paid Tier
- Render Starter Plan: $7/month
- Always-on service with cron jobs running 24/7

---

## Step 6: Verify Deployment

### 6.1 Test Backend
```bash
# Health check
curl https://news-filter-backend.onrender.com/health

# Expected response:
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2026-01-28T..."
}
```

### 6.2 Test Frontend
1. Visit your Vercel URL
2. Register a new account
3. Login
4. Verify news articles are loading
5. Test News Verifier feature
6. Check Viral News section

---

## Step 7: Get API Keys (Required for Full Functionality)

### NewsAPI (News Fetching)
1. Go to [NewsAPI.org](https://newsapi.org)
2. Sign up for free account
3. Copy your API key
4. Add to Render environment variables: `NEWSAPI_KEY`
5. Free tier: 100 requests/day (sufficient for testing)
6. Paid tier: $449/month (for production scale)

### Claude (AI Analysis)
1. Sign in to the Claude Console and add credits
2. Create an API key
3. Add to Render environment variables: `ANTHROPIC_API_KEY`
4. Optional: set `ANTHROPIC_MODEL` to override the default (Claude Haiku 4.5)
5. Costs: pay-per-use; Haiku is the lowest-cost model. Check current pricing in the Console

---

## Monitoring & Maintenance

### Check Logs
**Render Dashboard:**
- Go to your service
- Click "Logs" tab
- Monitor news fetching and cron jobs

**MongoDB Atlas:**
- Monitor database size
- Free tier: 512MB limit
- Track article count

### Scheduled Tasks Status
Check if cron jobs are running:
```bash
# Check recent logs for:
[CRON] Starting hourly news fetch...
[CRON] Hourly fetch complete: X new articles
[CRON] Starting viral news detection...
```

---

## Cost Summary

### Free Tier (Testing)
- **MongoDB Atlas**: Free (512MB)
- **Render**: Free (service sleeps after 15 min)
- **Vercel**: Free (100GB bandwidth/month)
- **NewsAPI**: Free (100 requests/day)
- **Claude API**: Pay-per-use (small for testing)
- **Total**: Free + Claude API usage

### Production Tier
- **MongoDB Atlas**: $9/month (2GB shared cluster)
- **Render**: $7/month (always-on service)
- **Vercel**: Free or $20/month (Pro)
- **NewsAPI**: $449/month (unlimited requests)
- **Claude API**: Pay-per-use (depends on volume)
- **Total**: ~$465-485/month + Claude API usage

---

## Alternative Free Deployment (For Learning)

### Option: Railway (Alternative to Render)
- [Railway.app](https://railway.app)
- $5 free credit per month
- Similar setup to Render
- Better free tier for cron jobs

### Option: Netlify (Alternative to Vercel)
- [Netlify.com](https://netlify.com)
- Free tier similar to Vercel
- Automatic deploys from GitHub

---

## Troubleshooting

### Articles Not Loading
1. Check backend logs in Render
2. Verify MONGODB_URI is correct
3. Check CORS settings in backend (FRONTEND_URL)
4. Verify frontend API URL in .env.production

### Automatic Updates Not Working
1. Check if Render service is asleep
2. Add UptimeRobot monitor
3. Check cron job logs
4. Verify NEWSAPI_KEY is valid

### Authentication Issues
1. Verify JWT_SECRET is set
2. Check browser console for errors
3. Clear localStorage and re-login
4. Verify backend URL in frontend

---

## Security Checklist

- [ ] Never commit `.env` files to GitHub
- [ ] Use strong JWT_SECRET (minimum 64 characters)
- [ ] Enable MongoDB Atlas IP whitelist (or allow all for Render: 0.0.0.0/0)
- [ ] Use HTTPS for all connections (Vercel and Render provide this)
- [ ] Regularly rotate API keys
- [ ] Monitor API usage and costs
- [ ] Set up rate limiting for API endpoints

---

## Next Steps After Deployment

1. **Custom Domain** (Optional)
   - Buy domain from Namecheap, GoDaddy, etc.
   - Point to Vercel deployment
   - Configure in Vercel dashboard

2. **Email Notifications**
   - Set up SendGrid or Mailgun
   - Send verification emails
   - Daily news digest emails

3. **Analytics**
   - Add Google Analytics
   - Monitor user behavior
   - Track popular articles

4. **Backup Strategy**
   - MongoDB Atlas automated backups
   - Export database regularly
   - Version control for code

---

## Support

If you encounter issues:
1. Check Render/Vercel logs
2. Review MongoDB Atlas metrics
3. Test API endpoints individually
4. Check GitHub Issues for common problems

---

## Quick Deploy Checklist

- [ ] MongoDB Atlas cluster created
- [ ] GitHub repository created
- [ ] Backend deployed on Render
- [ ] Environment variables added
- [ ] Frontend deployed on Vercel
- [ ] CORS configured correctly
- [ ] Test registration and login
- [ ] Verify news articles loading
- [ ] Check automatic updates working
- [ ] Add UptimeRobot monitor (if using free tier)
- [ ] API keys added and working

---

**Your app will be live at:**
- Frontend: `https://your-app.vercel.app`
- Backend: `https://news-filter-backend.onrender.com`
- Database: MongoDB Atlas Cloud

**Automatic Updates:**
- News fetching runs every hour
- Viral detection runs every 2 hours
- Database cleanup runs daily

🎉 **Congratulations! Your news filtering website is now online and updating automatically!**
