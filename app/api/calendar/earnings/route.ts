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
  estimatedEPS?: string | null
  reportedEPS?: string | null
  isPast?: boolean
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

    const searchParams = request.nextUrl.searchParams
    const year = parseInt(searchParams.get('year') || '', 10)
    const month = parseInt(searchParams.get('month') || '', 10) // 1-indexed month

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: 'Valid year and month (1-12) are required' },
        { status: 400 }
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
        // Fetch earnings calendar data and earnings history in parallel
        const earningsCalendarUrl = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${ticker}&horizon=12month&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`
        const earningsUrl = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${ticker}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`
        
        const [earningsCalendarResponse, earningsResponse] = await Promise.all([
          fetch(earningsCalendarUrl),
          fetch(earningsUrl)
        ])
        
        const earningsCalendarText = await earningsCalendarResponse.text()
        const earningsData = await earningsResponse.json()

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
        // Try multiple possible column names for estimated EPS
        const estimatedEPSIdx = headers.findIndex(h => {
          const lower = h.toLowerCase()
          return lower === 'estimatedeps' || 
                 lower === 'estimated eps' || 
                 lower === 'estimate' ||
                 lower === 'estimated' ||
                 lower.includes('estimated') && lower.includes('eps')
        })

        if (reportDateIdx < 0 && fiscalDateIdx < 0) {
          return []
        }

        const events: EarningsEvent[] = []
        const now = new Date()
        now.setHours(0, 0, 0, 0)

        // Create a map of earnings data by fiscal date and report date for quick lookup
        // Also create a helper function to normalize dates for comparison
        const normalizeDate = (dateStr: string): string => {
          try {
            const date = new Date(dateStr)
            return date.toISOString().split('T')[0] // Returns YYYY-MM-DD
          } catch {
            return dateStr
          }
        }

        const earningsMapByFiscal: Record<string, { estimatedEPS?: string; reportedEPS?: string; reportDate?: string }> = {}
        const earningsMapByReportDate: Record<string, { estimatedEPS?: string; reportedEPS?: string; fiscalDateEnding?: string }> = {}
        // Also create a list of all earnings entries for future date matching and reportedEPS lookup
        const allEarningsEntries: Array<{
          fiscalDateEnding: string
          reportedDate: string
          estimatedEPS?: string
          reportedEPS?: string
          reportDate: string
        }> = []
        
        if (earningsData && !earningsData.error && !earningsData['Note'] && earningsData.quarterlyEarnings) {
          earningsData.quarterlyEarnings.forEach((earnings: any) => {
            const fiscalDate = earnings.fiscalDateEnding
            const reportedDate = earnings.reportedDate || earnings.fiscalDateEnding
            
            // Map by fiscal date ending (normalized)
            if (fiscalDate) {
              const normalizedFiscal = normalizeDate(fiscalDate)
              earningsMapByFiscal[normalizedFiscal] = {
                estimatedEPS: earnings.estimatedEPS,
                reportedEPS: earnings.reportedEPS,
                reportDate: reportedDate,
              }
            }
            
            // Map by report date (normalized)
            if (reportedDate) {
              const normalizedReport = normalizeDate(reportedDate)
              earningsMapByReportDate[normalizedReport] = {
                estimatedEPS: earnings.estimatedEPS,
                reportedEPS: earnings.reportedEPS,
                fiscalDateEnding: fiscalDate,
              }
            }

            // Store for future date matching and reportedEPS lookup
            if (fiscalDate || reportedDate) {
              allEarningsEntries.push({
                fiscalDateEnding: fiscalDate || '',
                reportedDate: reportedDate,
                estimatedEPS: earnings.estimatedEPS,
                reportedEPS: earnings.reportedEPS,
                reportDate: reportedDate,
              })
            }
          })
        }

        // First, add earnings from the EARNINGS endpoint (includes past earnings)
        const earningsFromHistory: EarningsEvent[] = []
        if (earningsData && !earningsData.error && !earningsData['Note'] && earningsData.quarterlyEarnings) {
          earningsData.quarterlyEarnings.forEach((earnings: any) => {
            if (earnings.reportedDate || earnings.fiscalDateEnding) {
              const dateStr = earnings.reportedDate || earnings.fiscalDateEnding
              const earningsDate = new Date(dateStr)
              earningsDate.setHours(0, 0, 0, 0)
              const isPast = earningsDate < now

              // Format label (Q{quarter} FY{year})
              const quarter = Math.floor(earningsDate.getMonth() / 3) + 1
              const fiscalYear = earningsDate.getFullYear().toString().slice(-2)
              const label = `Q${quarter} FY${fiscalYear}`

              earningsFromHistory.push({
                ticker,
                companyName: item.company_name,
                reportDate: dateStr,
                fiscalDateEnding: earnings.fiscalDateEnding,
                label,
                estimatedEPS: earnings.estimatedEPS || null,
                reportedEPS: earnings.reportedEPS || null,
                isPast,
              })
            }
          })
        }

        // Parse calendar data lines (skip header)
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

            // Include both past and future earnings dates
            const isPast = earningsDate < now

            // Format label (Q{quarter} FY{year})
            const quarter = Math.floor(earningsDate.getMonth() / 3) + 1
            const fiscalYear = earningsDate.getFullYear().toString().slice(-2)
            const label = `Q${quarter} FY${fiscalYear}`

            // Get estimated EPS and reported EPS from multiple sources (priority: calendar CSV > earnings history by report date > earnings history by fiscal date > nearest future quarter)
            let estimatedEPS: string | null = null
            let reportedEPS: string | null = null
            
            // Normalize dates for comparison
            const normalizedReportDate = normalizeDate(dateStr)
            const normalizedFiscalDate = fiscalDateStr ? normalizeDate(fiscalDateStr) : null
            
            // First, try to get from calendar CSV if available
            if (estimatedEPSIdx >= 0 && values[estimatedEPSIdx]) {
              const epsValue = values[estimatedEPSIdx].trim()
              if (epsValue && epsValue !== '' && epsValue !== 'N/A' && epsValue !== 'null') {
                estimatedEPS = epsValue
              }
            }
            
            // For past earnings, ALWAYS try to get reportedEPS from earnings history
            // Try to look up from earnings history by normalized report date
            if (normalizedReportDate && earningsMapByReportDate[normalizedReportDate]) {
              if (!estimatedEPS) {
                estimatedEPS = earningsMapByReportDate[normalizedReportDate].estimatedEPS || null
              }
              // Always get reportedEPS if available (for past earnings, this is required)
              reportedEPS = earningsMapByReportDate[normalizedReportDate].reportedEPS || null
            }
            
            // If still not found, try to look up by normalized fiscal date ending
            if (normalizedFiscalDate && earningsMapByFiscal[normalizedFiscalDate]) {
              if (!estimatedEPS) {
                estimatedEPS = earningsMapByFiscal[normalizedFiscalDate].estimatedEPS || null
              }
              // Always get reportedEPS if available (for past earnings, this is required)
              if (!reportedEPS) {
                reportedEPS = earningsMapByFiscal[normalizedFiscalDate].reportedEPS || null
              }
            }
            
            // For past earnings, if we still don't have reportedEPS, try to find it by searching all earnings entries
            // This ensures we don't miss reported earnings data
            if (isPast && !reportedEPS && allEarningsEntries.length > 0) {
              // Try to match by date (within a few days tolerance)
              const targetDate = new Date(dateStr)
              for (const entry of allEarningsEntries) {
                const entryDate = new Date(entry.reportDate)
                const daysDiff = Math.abs((targetDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))
                // If dates are within 5 days of each other, consider it a match
                if (daysDiff <= 5 && entry.reportedEPS && entry.reportedEPS !== 'None' && entry.reportedEPS !== 'null') {
                  reportedEPS = entry.reportedEPS
                  break
                }
              }
            }

            // If still not found and this is a future earnings date, try to find the nearest future quarter estimate
            // This handles cases where the calendar has a future date but EARNINGS endpoint hasn't been updated yet
            if (!estimatedEPS && !isPast && allEarningsEntries.length > 0) {
              // Sort by date and find the most recent entry with an estimatedEPS
              const sortedEntries = [...allEarningsEntries].sort((a, b) => {
                const dateA = new Date(a.reportDate)
                const dateB = new Date(b.reportDate)
                return dateB.getTime() - dateA.getTime() // Most recent first
              })
              
              // Find the first entry with estimatedEPS (prefer future dates, but take most recent if needed)
              for (const entry of sortedEntries) {
                if (entry.estimatedEPS && entry.estimatedEPS !== 'None' && entry.estimatedEPS !== 'null') {
                  const entryDate = new Date(entry.reportDate)
                  // Prefer estimates from future or very recent past quarters
                  if (entryDate >= now || (now.getTime() - entryDate.getTime() < 90 * 24 * 60 * 60 * 1000)) { // Within 90 days
                    estimatedEPS = entry.estimatedEPS
                    break
                  }
                }
              }
            }

            events.push({
              ticker,
              companyName: item.company_name,
              reportDate: dateStr,
              fiscalDateEnding: fiscalDateStr,
              label,
              estimatedEPS,
              reportedEPS,
              isPast,
            })
          }
        }

        // Filter earnings to only include those in the requested month
        const filteredEarnings = (earnings: EarningsEvent[]): EarningsEvent[] => {
          return earnings.filter(event => {
            const eventDate = new Date(event.reportDate)
            const eventYear = eventDate.getFullYear()
            const eventMonth = eventDate.getMonth() + 1 // getMonth() is 0-indexed
            return eventYear === year && eventMonth === month
          })
        }

        // Combine calendar events with historical earnings
        // Use a Map to track unique dates to avoid duplicates
        // Priority: calendar events (more up-to-date) > historical earnings
        const uniqueEvents = new Map<string, EarningsEvent>()
        
        // Add historical earnings first (they'll be overridden by calendar events if present)
        // Filter to only include earnings in the requested month
        filteredEarnings(earningsFromHistory).forEach(event => {
          const dateKey = normalizeDate(event.reportDate)
          const key = `${dateKey}-${event.ticker}`
          uniqueEvents.set(key, event)
        })

        // Add calendar events (override historical if same date/ticker, as calendar is more current)
        // Filter to only include earnings in the requested month
        // If calendar event doesn't have estimatedEPS or reportedEPS but historical does, merge them
        filteredEarnings(events).forEach(event => {
          const dateKey = normalizeDate(event.reportDate)
          const key = `${dateKey}-${event.ticker}`
          const existingEvent = uniqueEvents.get(key)
          
          // If calendar event doesn't have estimatedEPS but historical event does, use historical
          if (existingEvent && !event.estimatedEPS && existingEvent.estimatedEPS) {
            event.estimatedEPS = existingEvent.estimatedEPS
          }
          
          // If calendar event doesn't have reportedEPS but historical event does, use historical
          if (existingEvent && !event.reportedEPS && existingEvent.reportedEPS) {
            event.reportedEPS = existingEvent.reportedEPS
          }
          
          uniqueEvents.set(key, event)
        })

        return Array.from(uniqueEvents.values())
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

