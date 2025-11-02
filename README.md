# Contra AI - Stock Earnings Analysis

An AI-powered application for analyzing post-earnings market sentiment of US stocks.

## Features

- 🔐 User authentication with Supabase
- 📊 Stock earnings analysis using AI
- 💬 Interactive chat interface for follow-up questions
- 🔍 Real-time stock data from Alpha Vantage
- 🎨 Modern UI built with shadcn/ui components

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Supabase account and project
- OpenAI API key
- Alpha Vantage API key

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
```

3. Set up Supabase database:

- In your Supabase dashboard, go to SQL Editor
- Run the SQL from `supabase/migrations/001_initial_schema.sql` to create the necessary tables

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
contra/
├── app/
│   ├── analyze/[ticker]/    # Chat interface for stock analysis
│   ├── login/               # Authentication page
│   ├── api/analyze/         # API route for AI analysis
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Landing page
│   └── globals.css          # Global styles
├── components/
│   ├── ui/                  # shadcn/ui components
│   └── navbar.tsx           # Navigation component
├── lib/
│   ├── ai/agent.ts          # LangChain AI agent
│   ├── supabase/            # Supabase client utilities
│   └── utils.ts             # Utility functions
└── supabase/
    └── migrations/          # Database migrations
```

## Technologies Used

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Supabase** - Authentication and database
- **LangChain** - AI agent framework
- **OpenAI GPT-4o** - LLM for analysis
- **Alpha Vantage** - Stock market data API
- **shadcn/ui** - UI component library
- **Tailwind CSS** - Styling

## Usage

1. Sign up or log in to your account
2. On the landing page, enter a stock ticker (e.g., "AAPL")
3. View the initial earnings insights
4. Ask follow-up questions in the chat interface

## Note on GPT-5

The application is configured to use GPT-4o as GPT-5 is not yet available. When GPT-5 becomes available, update the model name in `lib/ai/agent.ts`.

