# Veritas Daily 📰

Credibility-scored news. Veritas Daily collects stories from trusted sources, scores each one for credibility with a multi-layer AI pipeline, and helps you check any story before you trust it.

![PS5-Inspired Dark Theme](https://img.shields.io/badge/Theme-PS5%20Inspired-0070D1?style=for-the-badge)
![Auto Updates](https://img.shields.io/badge/Updates-Automatic-00D26A?style=for-the-badge)
![AI Powered](https://img.shields.io/badge/AI-Claude-D97757?style=for-the-badge)

## ✨ Features

### ☀️ Daily briefing
- Pick up to 3 topics; each morning you get the **5 most credible stories** in them
- Every story shows a **credibility meter** (source reliability + language signals + AI review)
- Claude writes a short, neutral summary of each story (generated once per article, shared by all readers)
- Max 2 stories per outlet and no duplicate coverage of the same event

### ✅ Quick check and streaks
- A 3-question check at the end of the briefing, grounded in the day's articles
- Instant feedback with the reason from the article; answers are verified on the server
- Daily streak and a 14-day activity strip

### 🛡️ Story checker
- Paste any link or claim to see how it scores, with cross-checks against other sources
- Free plan: 5 checks a day (Pro waitlist when you hit the limit)

### ✉️ Morning email
- Optional 7 am email with the same 5 stories and a link back to the quick check
- One-click unsubscribe

### 🔍 Multi-layer scoring
- **Keyword filter**: clickbait and sensational language
- **Source credibility**: reliability ratings for 80+ outlets
- **AI analysis**: Claude rates quality, bias and credibility (article text is treated as untrusted input)

### 🧪 Built to learn from usage
- PostHog events for the whole funnel, an A/B test on the credibility meter, and a fake-door test for a paid plan (see **Product analytics**)

Hidden behind flags: viral-story detection and the X/Twitter feed.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- MongoDB (local or Atlas)
- NewsAPI key (free tier available)
- Anthropic API key (optional, for Claude AI analysis)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/news-filter.git
   cd news-filter
   ```

2. **Set up Backend**
   ```bash
   cd server
   npm install
   cp .env.example .env
   # Edit .env with your API keys
   npm run dev
   ```

3. **Set up Frontend**
   ```bash
   cd client
   npm install
   cp .env.example .env
   npm run dev
   ```

4. **Access the app**
   - Frontend: http://localhost:5173
   - Backend: http://localhost:5000

## 📦 Tech Stack

### Frontend
- **React** - UI framework
- **Vite** - Build tool
- **Axios** - HTTP client
- **React Router** - Routing

### Backend
- **Node.js + Express** - Server framework
- **MongoDB + Mongoose** - Database
- **JWT** - Authentication
- **node-cron** - Scheduled jobs
- **Claude (Anthropic API)** - AI analysis
- **NewsAPI** - News aggregation

### Optional Services
- **Redis** - Caching
- **Elasticsearch** - Advanced search

## 🌐 Deployment

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed instructions on deploying to:
- **Frontend**: Vercel
- **Backend**: Render
- **Database**: MongoDB Atlas

## 📊 Project Structure

```
news-filter/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── contexts/      # React contexts
│   │   ├── hooks/         # Custom hooks
│   │   ├── services/      # API services
│   │   └── styles/        # CSS files
│   └── package.json
│
├── server/                # Node.js backend
│   ├── src/
│   │   ├── controllers/  # Route controllers
│   │   ├── models/       # Mongoose models
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   ├── jobs/         # Cron jobs
│   │   └── middleware/   # Express middleware
│   └── package.json
│
└── DEPLOYMENT_GUIDE.md   # Deployment instructions
```

## 🔑 Environment Variables

### Backend (.env)
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/news-filter
JWT_SECRET=your_secret_key
NEWSAPI_KEY=your_newsapi_key
ANTHROPIC_API_KEY=your_anthropic_key
FRONTEND_URL=http://localhost:5173
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:5000/api
```

## 📱 Screenshots

### Dashboard
![Dashboard](docs/screenshots/dashboard.png)

### News Verifier
![Verifier](docs/screenshots/verifier.png)

### Viral News
![Viral News](docs/screenshots/viral.png)

## 🔄 Background Jobs

| Job | Default schedule | What it does |
|-----|------------------|--------------|
| `fetch-news` | every 3 hours (UTC) | International news, 7 NewsAPI requests |
| `fetch-india` | every 3 hours, offset 30 min | Indian news, 2 requests |
| `enrich` | every 3 hours, offset 45 min | Pre-generate summaries + questions for top new stories |
| `digest` | 07:00 `APP_TIMEZONE` | Morning email to opted-in users |
| `cleanup` | daily 00:00 UTC | Remove non-approved articles older than 30 days |

About 72 NewsAPI requests a day, within the free tier. Run any job once with `npm run job -- <name>` (`npm run job -- list` shows all).
Locally, jobs run in-process. On a host that sleeps, set `ENABLE_CRON=false` and trigger them through the protected `POST /api/internal/jobs/:name` endpoint.

## 🛠️ API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Articles
- `GET /api/articles` - Get filtered articles (paginated)
- `GET /api/articles/:id` - Get single article
- `GET /api/articles/search` - Search articles
- `GET /api/articles/trending` - Trending articles
- `GET /api/articles/categories` - List categories
- `GET /api/articles/sources` - List sources
- `GET /api/articles/stats` - Article statistics
- `GET /api/articles/india` - Indian news feed
- `GET /api/articles/x/news` - X/Twitter news (also `/x/search`, `/x/trending`)

### Viral News
- `GET /api/viral/trending` - Get trending stories
- `GET /api/viral/misinformation` - Get fake news alerts

### Verification
- `POST /api/verification/url` - Verify article by URL
- `POST /api/verification/keywords` - Verify by keywords

### Me
- `GET /api/me` - Profile, preferences, streak, checks left today
- `PUT /api/me/preferences` - Topics (free: up to 3) and morning email
- `GET /api/me/activity` - Last 14 days
- `POST /api/me/pro-interest` - Join the Pro waitlist (fake door; nothing is charged)
- `GET|POST /api/me/unsubscribe?token=` - Unsubscribe from the morning email

### Briefing
- `GET /api/briefing/today` - Today's briefing (built on first request)
- `POST /api/briefing/today/answers` - Answer a quick-check question `{ index, choice }`
- `POST /api/briefing/today/done` - Finish a day that has no quick check

## 📈 Product analytics

Analytics is optional: set `VITE_POSTHOG_KEY` in `client/.env` to turn it on. Autocapture and session recording are off, and the text or links people check are never sent.

**Funnel events:** `landing_viewed`, `signed_up`, `onboarding_started`, `onboarding_completed`, `briefing_viewed`, `story_opened`, `credibility_revealed`, `quiz_started`, `quiz_answered`, `quiz_completed`, `streak_extended`, `verifier_opened`, `verification_submitted`, `verification_completed`, `verification_failed`, `verification_limit_hit`, `pro_cta_viewed`, `pro_waitlist_joined`, `digest_toggled`, `page_viewed`.

**Experiment:** create a multivariate feature flag `briefing-credibility-display` in PostHog with variants `visible` (control) and `on-tap`, 50/50. Without the flag everyone gets `visible`.

**SQL:** `analytics/hogql-queries.sql` has ready-to-paste queries for the activation funnel, next-day retention, the experiment, Pro demand by entry point, and quick-check difficulty.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Design inspired by PlayStation 5 UI
- News data from NewsAPI.org
- AI analysis powered by Claude
- Fact-checking sources: Alt News, Boom Live, Snopes, PolitiFact

## 📧 Support

For issues and questions:
- Create an issue on GitHub
- Email: your-email@example.com

---

Built with ❤️ using React, Node.js, and AI
