# Retail Intelligence

Owner-facing business intelligence dashboard powered by EPOS sales data.

## Features
- **Upload** — Drag & drop EPOS Item Sales Reports (.xls)
- **Dashboard** — Revenue, Profit, Margin KPIs with trend charts
- **Categories** — Full breakdown with top/bottom 5 per category
- **Trending** — Products selling 40%+ more than previous period
- **Review** — Low margin items to consider repricing
- **Margin Erosion** — Items below 5% margin / selling at a loss
- **Top Sellers** — Sort by profit, revenue, or margin
- **Hidden Profit** — Items with no cost data entered in EPOS
- **Operations** — Daily revenue patterns, busiest/quietest days
- **Weather Intelligence** — 7-day forecast with personalised stock prep
- **Coming Up** — AI-powered upcoming events for your area
- **Promotions** — Scan supplier leaflets and generate order lists
- **Social Media** — Viral product trends for UK convenience stores
- **AI Assistant** — Ask questions about your sales data
- **News** — Live UK convenience & retail news
- **Day/Week/Month** toggle for all views
- **Offline capable** — works without internet connection

## Tech Stack
- React 18 + Vite
- Recharts for charts
- SheetJS (xlsx) for Excel parsing
- Supabase for data persistence
- Claude API for AI features
- Open-Meteo for weather data

## Setup
```bash
npm install
npm run dev
```

## Deploy to Vercel
1. Push to GitHub
2. Connect repo in Vercel
3. Framework: Vite → auto-detected
4. Add environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_KEY, VITE_ANTHROPIC_KEY
5. Deploy
