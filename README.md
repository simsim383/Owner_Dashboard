# ShopMate Sales Dashboard

Owner-facing daily sales dashboard powered by ShopMate EPOS data exports.

## Features
- **Upload** — Drag & drop ShopMate `.xls` Item Sales Reports
- **Dashboard** — Revenue, Profit, Margin KPIs with trend charts
- **Categories** — Full breakdown with top/bottom 5 per category
- **Trending** — Products selling 40%+ more than previous period
- **Review** — Low margin items to consider repricing
- **Margin Erosion** — Items below 5% margin / selling at a loss
- **Top Sellers** — Sort by profit, revenue, or margin
- **Hidden Profit** — Items with no cost data entered in ShopMate
- **Operations** — Daily revenue patterns, busiest/quietest days
- **Coming Up** — AI-powered upcoming events for your area
- **AI Assistant** — Ask questions about your sales data
- **News** — Live UK convenience retail news
- **Day/Week/Month** toggle for all views

## Tech Stack
- React 18 + Vite
- Recharts for charts
- SheetJS (xlsx) for Excel parsing
- Supabase for data persistence
- Claude API for AI features

## Setup
```bash
npm install
npm run dev
```

## Deploy to Vercel
1. Push to GitHub
2. Connect repo in Vercel
3. Framework: Vite → auto-detected
4. Deploy

## Usage
1. Open ShopMate Portal → Reports → Item Sales Report
2. Generate and download the `.xls` file
3. Open the app → tap Upload → select file
4. Dashboard updates instantly
5. Upload multiple days for trending and operations views
