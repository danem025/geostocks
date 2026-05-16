# GeoStocks

Market intelligence platform — geopolitical events → stock cascade visualization.

## Deploy in 3 steps

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "GeoStocks v1"
git remote add origin https://github.com/YOUR_USERNAME/geostocks.git
git push -u origin main
```

### 2. Deploy on Vercel
1. Go to vercel.com → New Project
2. Import your GitHub repo
3. Add environment variable:
   - `FINNHUB_KEY` = `d847u89r01qutij88epgd847u89r01qutij88eq0`
4. Click Deploy

### 3. Done
Your app is live at `https://geostocks.vercel.app`

## API Routes
- `GET /api/news` — Live news from Finnhub + GDELT + 10 RSS feeds
- `GET /api/prices` — Live prices for all tracked stocks
- `GET /api/prices?ticker=NVDA` — Detailed quote + analyst recommendations
- `GET /api/predictions` — Live Polymarket + Kalshi prediction markets

## Stack
- **Frontend**: Vanilla HTML/JS/CSS (no framework)
- **Backend**: Vercel serverless functions (Node.js)
- **Data**: Finnhub, GDELT, RSS feeds, Polymarket, Kalshi
- **Cost**: $0 (all free tiers)

## Local Development
```bash
npm install -g vercel
npm install
vercel dev
```
Open http://localhost:3000
