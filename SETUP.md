# Setup Instructions

## 1. Install Dependencies

```bash
npm install
```

## 2. Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key
```

### Getting API Keys:

1. **Supabase:**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Navigate to Settings > API
   - Copy the Project URL and anon public key

2. **OpenAI:**
   - Go to [platform.openai.com](https://platform.openai.com)
   - Navigate to API Keys section
   - Create a new API key

3. **Alpha Vantage:**
   - Go to [alphavantage.co](https://www.alphavantage.co/support/#api-key)
   - Request a free API key

## 3. Set Up Supabase Database

1. In your Supabase dashboard, go to the SQL Editor
2. Run the SQL script from `supabase/migrations/001_initial_schema.sql`
3. This will create the necessary tables and security policies

## 4. Run the Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## 5. First Time Use

1. Sign up for an account at `/login`
2. Check your email and confirm your account (if email confirmation is enabled)
3. Sign in with your credentials
4. Enter a stock ticker on the landing page (e.g., "AAPL", "MSFT", "GOOGL")
5. View the initial earnings insights
6. Ask follow-up questions in the chat interface

## Notes

- The application uses GPT-4o as GPT-5 is not yet available. Update the model name in `lib/ai/agent.ts` when GPT-5 becomes available.
- Alpha Vantage free tier has rate limits (5 API calls per minute, 500 calls per day)
- Make sure to enable Row Level Security (RLS) policies in Supabase for proper data access control

