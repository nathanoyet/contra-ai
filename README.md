# Contra AI - Stock Earnings Analysis

An AI-powered application for analyzing post-earnings market sentiment of US stocks with comprehensive features for tracking and visualizing stock data.

## Features

### Core Features
- 🔐 **User Authentication** - Secure authentication with Supabase
- 📊 **AI-Powered Earnings Analysis** - Comprehensive earnings insights using GPT-4o
- 💬 **Interactive Chat Interface** - Ask follow-up questions about earnings data
- 🔍 **Real-time Stock Data** - Live data from Alpha Vantage API

### Additional Features
- 📈 **Stock Price Charts** - Interactive line charts with earnings markers
  - Multiple time periods: 1 day, 1 week, 1 month, 6 months, 1 year, 3 years
  - Earnings announcement markers with hover details
  - Google Finance-style tooltips
- 📅 **Earnings Calendar** - Monthly calendar view showing upcoming earnings dates
  - Company logos displayed on earnings dates
  - Filtered by your watchlist stocks only
- 📋 **Watchlist** - Track your favorite stocks
  - Add/remove stocks with autosuggestion
  - Real-time price and change percentage
  - Next earnings date tracking
  - Color-coded price changes (green/red)
- 🎨 **Modern UI** - Built with shadcn/ui components and Tailwind CSS
- 🔎 **Smart Autosuggestion** - Stock ticker search with autocomplete

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Supabase account and project
- OpenAI API key
- Alpha Vantage API key
- (Optional) Logo.dev API key for company logos (falls back to Clearbit if not provided)

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Set up environment variables:

Create a `.env.local` file in the root directory and add:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key

# Optional: For company logos (falls back to Clearbit if not provided)
NEXT_PUBLIC_LOGO_DEV_API_KEY=your_logo_dev_publishable_key
```

3. Set up Supabase database:

In your Supabase dashboard, go to SQL Editor and run the migrations in order:

- Run `supabase/migrations/001_initial_schema.sql` - Creates `analyses` and `conversations` tables
- Run `supabase/migrations/002_watchlist_schema.sql` - Creates `watchlist` table

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
contra/
├── app/
│   ├── api/
│   │   ├── insights/              # API route for AI analysis
│   │   ├── chart-data/            # API route for price chart data
│   │   ├── earnings-dates/        # API route for earnings markers
│   │   ├── search-ticker/         # API route for ticker autosuggestion
│   │   ├── watchlist/             # API routes for watchlist CRUD
│   │   └── logo/                  # API route for company logos
│   ├── insights/[ticker]/        # Chat interface for stock analysis
│   ├── chart/                     # Stock price chart page
│   ├── calendar/                  # Earnings calendar page
│   ├── watchlist/                 # Watchlist management page
│   ├── login/                     # Authentication page
│   ├── page.tsx                   # Landing page (Insights entry point)
│   ├── layout.tsx                 # Root layout
│   └── globals.css                # Global styles
├── components/
│   ├── ui/                        # shadcn/ui components
│   ├── navbar.tsx                 # Navigation component
│   └── toaster.tsx                # Toast notifications
├── lib/
│   ├── ai/agent.ts                # LangChain AI agent
│   ├── supabase/                  # Supabase client utilities
│   └── utils.ts                   # Utility functions
└── supabase/
    └── migrations/                # Database migrations
        ├── 001_initial_schema.sql
        └── 002_watchlist_schema.sql
```

## Technologies Used

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Supabase** - Authentication and database (PostgreSQL with RLS)
- **LangChain** - AI agent framework
- **OpenAI GPT-4o** - LLM for earnings analysis
- **Alpha Vantage** - Stock market data API
- **Recharts** - Interactive charts for stock prices
- **shadcn/ui** - UI component library
- **Tailwind CSS** - Styling
- **Logo.dev / Clearbit** - Company logos

## Usage

### 1. Earnings Insights
1. Sign up or log in to your account
2. On the Insights page (landing page), enter a stock ticker using the autosuggestion
3. View the initial AI-generated earnings insights
4. Ask follow-up questions in the chat interface

### 2. Stock Price Charts
1. Navigate to the Chart page
2. Enter a stock ticker and select a time period (1D, 1W, 1M, 6M, 1Y, 3Y)
3. View the price chart with earnings announcement markers
4. Hover over points to see price and timestamp details
5. Hover over earnings markers to see earnings data (EPS, surprise, etc.)

### 3. Earnings Calendar
1. Navigate to the Calendar page
2. View upcoming earnings dates for stocks in your watchlist
3. Company logos are displayed on dates with earnings announcements
4. Use navigation buttons to browse different months

### 4. Watchlist
1. Navigate to the Watchlist page
2. Click "Add Stock" to add stocks to your watchlist
3. View real-time prices, change percentages, and next earnings dates
4. Remove stocks using the trash icon

## API Routes

- `POST /api/insights` - Generate earnings insights or handle follow-up questions
- `GET /api/chart-data` - Fetch stock price data for charts
- `GET /api/earnings-dates` - Fetch earnings dates and markers for charts
- `GET /api/search-ticker` - Search for stock tickers (autosuggestion)
- `GET /api/watchlist` - Fetch user's watchlist
- `POST /api/watchlist` - Add stock to watchlist
- `DELETE /api/watchlist` - Remove stock from watchlist
- `POST /api/watchlist/data` - Fetch price and earnings data for watchlist items
- `GET /api/logo/[ticker]` - Fetch company logo (proxies to Logo.dev/Clearbit)
- `GET /api/calendar/earnings` - Fetch earnings calendar data for watchlist stocks

## Database Schema

### Tables
- **analyses** - Stores initial earnings insights
- **conversations** - Stores follow-up Q&A conversations
- **watchlist** - User-specific stock watchlists with company names

All tables use Row Level Security (RLS) to ensure users can only access their own data.

## Configuration

### Logo Service
The application uses Logo.dev API (with Clearbit as fallback) for company logos. If you have a Logo.dev account:
1. Get your publishable key from [logo.dev](https://logo.dev/dashboard/api-keys)
2. Add `NEXT_PUBLIC_LOGO_DEV_API_KEY` to your `.env.local`

If not provided, the app will automatically use Clearbit's free logo service.

### Model Configuration
The application uses GPT-4o for analysis. The model can be changed in `lib/ai/agent.ts` if needed.

## Notes

- Alpha Vantage free tier has rate limits (5 API calls per minute, 500 calls per day)
- Ensure Row Level Security (RLS) policies are enabled in Supabase for proper data access control
- Company logos are cached for better performance
- Earnings calendar uses Alpha Vantage's EARNINGS_CALENDAR endpoint for accurate dates

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```
