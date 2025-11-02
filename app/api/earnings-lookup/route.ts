import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const ticker = searchParams.get('ticker')

    if (!ticker) {
      return NextResponse.json(
        { error: 'Ticker is required' },
        { status: 400 }
      )
    }

    if (!process.env.ALPHA_VANTAGE_API_KEY) {
      return NextResponse.json(
        { error: 'Alpha Vantage API key not configured' },
        { status: 500 }
      )
    }

    // Fetch company overview for company name
    const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`
    const earningsUrl = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${ticker}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`
    const earningsCalendarUrl = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${ticker}&horizon=12month&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`

    const [overviewResponse, earningsResponse, earningsCalendarResponse] = await Promise.all([
      fetch(overviewUrl),
      fetch(earningsUrl),
      fetch(earningsCalendarUrl),
    ])

    const overviewData = await overviewResponse.json()
    const earningsData = await earningsResponse.json()
    const earningsCalendarText = await earningsCalendarResponse.text()

    // Handle errors
    if (overviewData['Note'] || earningsData['Note'] || earningsCalendarText.includes('Note')) {
      return NextResponse.json(
        { error: 'API rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    if (overviewData['Error Message'] || earningsData['Error Message'] || earningsCalendarText.includes('Error Message')) {
      return NextResponse.json(
        { error: 'Failed to fetch earnings data' },
        { status: 400 }
      )
    }

    const companyName = overviewData.Name || ticker

    // Get previous earnings date from EARNINGS endpoint
    let previousEarningsDate: string | null = null
    if (earningsData.quarterlyEarnings && Array.isArray(earningsData.quarterlyEarnings) && earningsData.quarterlyEarnings.length > 0) {
      // Get the most recent past earnings
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      
      const pastEarnings = earningsData.quarterlyEarnings
        .filter((earnings: any) => {
          const earningsDate = new Date(earnings.reportedDate || earnings.fiscalDateEnding)
          earningsDate.setHours(0, 0, 0, 0)
          return earningsDate < now
        })
        .sort((a: any, b: any) => {
          const dateA = new Date(a.reportedDate || a.fiscalDateEnding)
          const dateB = new Date(b.reportedDate || b.fiscalDateEnding)
          return dateB.getTime() - dateA.getTime()
        })

      if (pastEarnings.length > 0) {
        previousEarningsDate = pastEarnings[0].reportedDate || pastEarnings[0].fiscalDateEnding
      }
    }

    // Get next earnings date from EARNINGS_CALENDAR
    let nextEarningsDate: string | null = null
    if (earningsCalendarText && earningsCalendarText.trim().length > 0 && !earningsCalendarText.includes('Error')) {
      try {
        const lines = earningsCalendarText.trim().split('\n')
        if (lines.length > 1) {
          const headerLine = lines[0]
          const headers = headerLine.split(',').map(h => h.trim())
          const reportDateIdx = headers.findIndex(h => h.toLowerCase() === 'reportdate' || h.toLowerCase() === 'report date')
          const fiscalDateIdx = headers.findIndex(h => h.toLowerCase() === 'fiscaldateending' || h.toLowerCase() === 'fiscal date ending')

          if (reportDateIdx >= 0 || fiscalDateIdx >= 0) {
            const now = new Date()
            now.setHours(0, 0, 0, 0)

            for (let i = 1; i < lines.length; i++) {
              const line = lines[i]
              if (!line || line.trim().length === 0) continue

              const values = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)?.map(v => v.trim().replace(/^"|"$/g, '')) || []
              if (values.length === 0) continue

              const reportDateStr = reportDateIdx >= 0 && values[reportDateIdx] ? values[reportDateIdx] : null
              const fiscalDateStr = fiscalDateIdx >= 0 && values[fiscalDateIdx] ? values[fiscalDateIdx] : null
              const dateStr = reportDateStr || fiscalDateStr

              if (dateStr) {
                const earningsDate = new Date(dateStr)
                earningsDate.setHours(0, 0, 0, 0)

                if (earningsDate > now) {
                  nextEarningsDate = dateStr
                  break
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error parsing earnings calendar:', error)
      }
    }

    return NextResponse.json({
      ticker: ticker.toUpperCase(),
      companyName,
      nextEarningsDate,
      previousEarningsDate,
    })
  } catch (error: any) {
    console.error('Error in earnings lookup:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

