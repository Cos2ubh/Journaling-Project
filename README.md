# News Filtering Website 📰

A modern, AI-powered news aggregation and filtering platform that helps you discover credible news while filtering out misinformation.

![PS5-Inspired Dark Theme](https://img.shields.io/badge/Theme-PS5%20Inspired-0070D1?style=for-the-badge)
![Auto Updates](https://img.shields.io/badge/Updates-Automatic-00D26A?style=for-the-badge)
![AI Powered](https://img.shields.io/badge/AI-OpenAI%20GPT-412991?style=for-the-badge)

## ✨ Features

### 🔍 Multi-Layer Filtering System
- **Keyword Filter**: Detects clickbait and sensational content
- **Source Credibility**: Rates news sources based on reliability
- **AI Analysis**: OpenAI GPT analyzes quality, bias, and credibility
- **Manual Curation**: Admin review for flagged articles

### 📡 Viral News Detection
- Real-time detection of trending stories
- Fact-checking and claim verification
- Misinformation alerts
- Cross-source validation

### 🛡️ News Verifier
- **Verify by URL**: Analyze any news article instantly
- **Verify by Keywords**: Search and compare multiple sources
- Get credibility scores, bias analysis, and recommendations

### 🎨 Modern UI
- PS5-inspired dark theme
- Glassmorphism effects
- Smooth animations
- Fully responsive design

### ⚙️ Automatic Updates
- News fetching every hour
- Viral detection every 2 hours
- Daily database cleanup

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- MongoDB (local or Atlas)
- NewsAPI key (free tier available)
- OpenAI API key (for AI analysis)

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
- **OpenAI** - AI analysis
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
OPENAI_API_KEY=your_openai_key
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

## 🔄 Automatic Update Schedule

| Task | Frequency | Description |
|------|-----------|-------------|
| US/International News | Every hour | Fetches latest news from NewsAPI |
| Indian News | Every hour | Fetches India-specific news |
| Viral Detection | Every 2 hours | Detects and verifies trending stories |
| Database Cleanup | Daily | Removes old articles (keeps 30 days) |

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
- AI analysis powered by OpenAI
- Fact-checking sources: Alt News, Boom Live, Snopes, PolitiFact

## 📧 Support

For issues and questions:
- Create an issue on GitHub
- Email: your-email@example.com

---

Built with ❤️ using React, Node.js, and AI
