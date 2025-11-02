# Watchlist Feature Setup

## Database Migration

A new migration file has been created: `supabase/migrations/002_watchlist_schema.sql`

### Supabase Setup Instructions

1. **Go to your Supabase Dashboard**
   - Navigate to your project
   - Go to the SQL Editor

2. **Run the Migration**
   - Copy the contents of `supabase/migrations/002_watchlist_schema.sql`
   - Paste it into the SQL Editor
   - Execute the query

3. **Verify the Migration**
   - Go to the Table Editor
   - You should see a new `watchlist` table with the following structure:
     - `id` (UUID, Primary Key)
     - `user_id` (UUID, Foreign Key to auth.users)
     - `ticker` (VARCHAR(10))
     - `company_name` (TEXT)
     - `created_at` (TIMESTAMP)
     - `updated_at` (TIMESTAMP)
     - Unique constraint on (`user_id`, `ticker`)

4. **Verify Row Level Security (RLS)**
   - Go to Authentication > Policies
   - You should see 4 policies for the `watchlist` table:
     - Users can view their own watchlist
     - Users can insert their own watchlist items
     - Users can update their own watchlist items
     - Users can delete their own watchlist items

## Features Implemented

✅ Watchlist table with user-specific data
✅ Add stock dialog with autosuggestion (same as landing page)
✅ Remove stock with confirmation dialog
✅ Empty state with 4 grey rows and centered text
✅ Real-time price and earnings data from Alpha Vantage
✅ Auto-refresh of watchlist data every 30 seconds
✅ Table centered on page
✅ Trash can icon in last column (no header)

## API Routes

- `GET /api/watchlist` - Fetch user's watchlist
- `POST /api/watchlist` - Add stock to watchlist
- `DELETE /api/watchlist?ticker=XXX` - Remove stock from watchlist
- `POST /api/watchlist/data` - Fetch price and earnings data for watchlist items

## Page Route

- `/watchlist` - Main watchlist page (already linked in navbar)

## Data Display

The watchlist displays:
- Company Name
- Ticker
- Current Price (from Alpha Vantage GLOBAL_QUOTE)
- Next Earnings Date and Label (from Alpha Vantage EARNINGS)

