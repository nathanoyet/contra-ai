import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type TimePeriod = '1d' | '1w' | '1m' | '6m' | '1y' | '3y'

interface EarningsMarker {
  date: string
  label: string
  price: number
  timestamp: number
  reportedEPS?: string
  estimatedEPS?: string
  surprise?: string
  surprisePercentage?: string
}

function getDateRange(period: TimePeriod): { startDate: Date; endDate: Date } {
  const endDate = new Date()
  const startDate = new Date()

  switch (period) {
    case '1d':
      startDate.setDate(startDate.getDate() - 1)
      break
    case '1w':
      startDate.setDate(startDate.getDate() - 7)
      break
    case '1m':
      startDate.setMonth(startDate.getMonth() - 1)
      break
    case '6m':
      startDate.setMonth(startDate.getMonth() - 6)
      break
    case '1y':
      startDate.setFullYear(startDate.getFullYear() - 1)
      break
    case '3y':
      startDate.setFullYear(startDate.getFullYear() - 3)
      break
  }

  return { startDate, endDate }
}

function formatEarningsLabel(fiscalDateEnding: string): string {
  const date = new Date(fiscalDateEnding)
  const quarter = Math.floor(date.getMonth() / 3) + 1
  const year = date.getFullYear()
  const fiscalYear = year.toString().slice(-2)
  return `Q${quarter} FY${fiscalYear}`
}

export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const ticker = searchParams.get('ticker')
    const period = searchParams.get('period') as TimePeriod

    if (!ticker || !period) {
      return NextResponse.json(
        { error: 'Ticker and period are required' },
        { status: 400 }
      )
    }

    if (!process.env.ALPHA_VANTAGE_API_KEY) {
      return NextResponse.json(
        { error: 'Alpha Vantage API key not configured' },
        { status: 500 }
      )
    }

    // Fetch earnings data
    const earningsUrl = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${ticker}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`

    const response = await fetch(earningsUrl)
    const data = await response.json()

    // Handle rate limit
    if (data['Note']) {
      return NextResponse.json(
        { error: 'API rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    // Handle API error
    if (data['Error Message']) {
      return NextResponse.json(
        { error: data['Error Message'] },
        { status: 400 }
      )
    }

    // Fetch time series to get prices for earnings dates
    const timeSeriesUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}&outputsize=full`
    const timeSeriesResponse = await fetch(timeSeriesUrl)
    const timeSeriesData = await timeSeriesResponse.json()

    const { startDate, endDate } = getDateRange(period)
    const markers: EarningsMarker[] = []

    if (data.quarterlyEarnings && Array.isArray(data.quarterlyEarnings)) {
      const timeSeries = timeSeriesData['Time Series (Daily)'] || {}

      for (const earnings of data.quarterlyEarnings) {
        const earningsDate = new Date(earnings.fiscalDateEnding)
        
        // Check if earnings date is within the selected period
        if (earningsDate >= startDate && earningsDate <= endDate) {
          // Find the closest trading day price (look both before and after earnings date)
          let price = 0
          let closestDate = earningsDate.toISOString().split('T')[0]
          let closestDiff = Infinity

          // Check dates around earnings date (±5 days)
          for (let i = -5; i <= 5; i++) {
            const checkDate = new Date(earningsDate)
            checkDate.setDate(checkDate.getDate() + i)
            const dateStr = checkDate.toISOString().split('T')[0]
            
            if (timeSeries[dateStr]) {
              const diff = Math.abs(checkDate.getTime() - earningsDate.getTime())
              if (diff < closestDiff) {
                closestDiff = diff
                price = parseFloat(timeSeries[dateStr]['4. close'])
                closestDate = dateStr
              }
            }
          }

          if (price > 0) {
            markers.push({
              date: closestDate,
              label: formatEarningsLabel(earnings.fiscalDateEnding),
              price: price,
              timestamp: new Date(closestDate).getTime(),
              reportedEPS: earnings.reportedEPS || undefined,
              estimatedEPS: earnings.estimatedEPS || undefined,
              surprise: earnings.surprise || undefined,
              surprisePercentage: earnings.surprisePercentage || undefined,
            })
          }
        }
      }
    }

    // Sort by date
    markers.sort((a, b) => a.timestamp - b.timestamp)

    return NextResponse.json({ markers })
  } catch (error: any) {
    console.error('Error fetching earnings dates:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

