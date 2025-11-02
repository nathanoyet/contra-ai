import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface WatchlistItem {
  ticker: string
  company_name: string
}

interface EarningsEvent {
  ticker: string
  companyName: string
  reportDate: string
  fiscalDateEnding: string | null
  label: string
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.ALPHA_VANTAGE_API_KEY) {
      return NextResponse.json(
        { error: 'Alpha Vantage API key not configured' },
        { status: 500 }
      )
    }

    // Fetch user's watchlist
    const { data: watchlistData, error: watchlistError } = await supabase
      .from('watchlist')
      .select('ticker, company_name')
      .eq('user_id', user.id)

    if (watchlistError) {
      return NextResponse.json(
        { error: 'Failed to fetch watchlist' },
        { status: 500 }
      )
    }

    if (!watchlistData || watchlistData.length === 0) {
      return NextResponse.json({ earnings: [] })
    }

    const watchlist: WatchlistItem[] = watchlistData.map(item => ({
      ticker: item.ticker,
      company_name: item.company_name,
    }))

    // Fetch earnings calendar for all watchlist stocks
    const earningsPromises = watchlist.map(async (item) => {
      const ticker = item.ticker

      try {
        // Fetch earnings calendar data
        const earningsCalendarUrl = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${ticker}&horizon=12month&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`
        const earningsCalendarResponse = await fetch(earningsCalendarUrl)
        const earningsCalendarText = await earningsCalendarResponse.text()

        // Handle rate limit or API errors
        if (earningsCalendarText.includes('Note') || earningsCalendarText.includes('Error Message')) {
          return []
        }

        if (!earningsCalendarText || earningsCalendarText.trim().length === 0) {
          return []
        }

        // Parse CSV response
        const lines = earningsCalendarText.trim().split('\n')
        if (lines.length <= 1) {
          return []
        }

        const headerLine = lines[0]
        const headers = headerLine.split(',').map(h => h.trim())
        const reportDateIdx = headers.findIndex(h => h.toLowerCase() === 'reportdate' || h.toLowerCase() === 'report date')
        const fiscalDateIdx = headers.findIndex(h => h.toLowerCase() === 'fiscaldateending' || h.toLowerCase() === 'fiscal date ending')

        if (reportDateIdx < 0 && fiscalDateIdx < 0) {
          return []
        }

        const events: EarningsEvent[] = []
        const now = new Date()
        now.setHours(0, 0, 0, 0)

        // Parse data lines (skip header)
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i]
          if (!line || line.trim().length === 0) continue

          // Parse CSV line (handle quoted values)
          const values = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)?.map(v => v.trim().replace(/^"|"$/g, '')) || []

          if (values.length === 0) continue

          // Get report date (preferred) or fiscal date ending
          const reportDateStr = reportDateIdx >= 0 && values[reportDateIdx] ? values[reportDateIdx] : null
          const fiscalDateStr = fiscalDateIdx >= 0 && values[fiscalDateIdx] ? values[fiscalDateIdx] : null
          const dateStr = reportDateStr || fiscalDateStr

          if (dateStr) {
            const earningsDate = new Date(dateStr)
            earningsDate.setHours(0, 0, 0, 0)

            // Only include future earnings dates
            if (earningsDate >= now) {
              // Format label (Q{quarter} FY{year})
              const quarter = Math.floor(earningsDate.getMonth() / 3) + 1
              const year = earningsDate.getFullYear().toString().slice(-2)
              const label = `Q${quarter} FY${year}`

              events.push({
                ticker,
                companyName: item.company_name,
                reportDate: dateStr,
                fiscalDateEnding: fiscalDateStr,
                label,
              })
            }
          }
        }

        return events
      } catch (error) {
        console.error(`Error fetching earnings calendar for ${ticker}:`, error)
        return []
      }
    })

    const allEarningsEvents = (await Promise.all(earningsPromises)).flat()

    // Group earnings by date
    const earningsByDate: Record<string, EarningsEvent[]> = {}
    allEarningsEvents.forEach(event => {
      const dateKey = event.reportDate.split('T')[0] // Get YYYY-MM-DD format
      if (!earningsByDate[dateKey]) {
        earningsByDate[dateKey] = []
      }
      earningsByDate[dateKey].push(event)
    })

    return NextResponse.json({ earnings: earningsByDate })
  } catch (error: any) {
    console.error('Error in calendar earnings:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

