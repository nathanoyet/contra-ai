import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface WatchlistItem {
  ticker: string
  company_name: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { watchlist } = body as { watchlist: WatchlistItem[] }

    if (!watchlist || !Array.isArray(watchlist)) {
      return NextResponse.json(
        { error: 'Watchlist array is required' },
        { status: 400 }
      )
    }

    if (!process.env.ALPHA_VANTAGE_API_KEY) {
      return NextResponse.json(
        { error: 'Alpha Vantage API key not configured' },
        { status: 500 }
      )
    }

    // Fetch data for all tickers in parallel
    const dataPromises = watchlist.map(async (item) => {
      const ticker = item.ticker

      try {
        // Fetch current price (GLOBAL_QUOTE)
        const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`
        const quoteResponse = await fetch(quoteUrl)
        const quoteData = await quoteResponse.json()

        // Fetch earnings calendar data for next earnings date
        const earningsCalendarUrl = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${ticker}&horizon=12month&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`
        const earningsCalendarResponse = await fetch(earningsCalendarUrl)
        const earningsCalendarText = await earningsCalendarResponse.text()

        // Extract price data and change percentage
        let price: number | null = null
        let changePercent: string | null = null
        
        if (quoteData['Note'] || quoteData['Error Message']) {
          // Handle rate limit or API errors - skip price
        } else if (quoteData['Global Quote']) {
          const globalQuote = quoteData['Global Quote']
          if (globalQuote['05. price']) {
            price = parseFloat(globalQuote['05. price'])
          }
          if (globalQuote['10. change percent']) {
            changePercent = globalQuote['10. change percent']
          }
        }

        // Extract next earnings date from earnings calendar (CSV format)
        let nextEarningsDate: string | null = null
        let nextEarningsLabel: string | null = null

        // Handle rate limit or API errors
        if (earningsCalendarText.includes('Note') || earningsCalendarText.includes('Error Message')) {
          // Skip earnings data if API error
        } else if (earningsCalendarText && earningsCalendarText.trim().length > 0) {
          try {
            // Parse CSV response
            const lines = earningsCalendarText.trim().split('\n')
            if (lines.length > 1) {
              // First line is header, skip it
              // Find header indices
              const headerLine = lines[0]
              const headers = headerLine.split(',').map(h => h.trim())
              const reportDateIdx = headers.findIndex(h => h.toLowerCase() === 'reportdate' || h.toLowerCase() === 'report date')
              const fiscalDateIdx = headers.findIndex(h => h.toLowerCase() === 'fiscaldateending' || h.toLowerCase() === 'fiscal date ending')
              
              if (reportDateIdx >= 0 || fiscalDateIdx >= 0) {
                const now = new Date()
                now.setHours(0, 0, 0, 0) // Set to start of day for accurate comparison
                
                // Parse data lines (skip header)
                for (let i = 1; i < lines.length; i++) {
                  const line = lines[i]
                  if (!line || line.trim().length === 0) continue
                  
                  // Parse CSV line (handle quoted values)
                  const values = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)?.map(v => v.trim().replace(/^"|"$/g, '')) || []
                  
                  if (values.length === 0) continue
                  
                  // Get report date (preferred) or fiscal date ending
                  const dateStr = reportDateIdx >= 0 && values[reportDateIdx] 
                    ? values[reportDateIdx] 
                    : (fiscalDateIdx >= 0 && values[fiscalDateIdx] ? values[fiscalDateIdx] : null)
                  
                  if (dateStr) {
                    const earningsDate = new Date(dateStr)
                    earningsDate.setHours(0, 0, 0, 0)
                    
                    // If this earnings date is in the future, it's the next one
                    if (earningsDate > now) {
                      nextEarningsDate = dateStr
                      
                      // Format label (Q{quarter} FY{year})
                      const quarter = Math.floor(earningsDate.getMonth() / 3) + 1
                      const year = earningsDate.getFullYear().toString().slice(-2)
                      nextEarningsLabel = `Q${quarter} FY${year}`
                      break
                    }
                  }
                }
              }
            }
          } catch (parseError) {
            console.error(`Error parsing earnings calendar CSV for ${ticker}:`, parseError)
            // If CSV parsing fails, leave as null
          }
        }

        return {
          ticker,
          companyName: item.company_name,
          price,
          changePercent,
          nextEarningsDate,
          nextEarningsLabel,
        }
      } catch (error) {
        console.error(`Error fetching data for ${ticker}:`, error)
        return {
          ticker,
          companyName: item.company_name,
          price: null,
          changePercent: null,
          nextEarningsDate: null,
          nextEarningsLabel: null,
        }
      }
    })

    const results = await Promise.all(dataPromises)

    return NextResponse.json({ data: results })
  } catch (error: any) {
    console.error('Error in watchlist data:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

