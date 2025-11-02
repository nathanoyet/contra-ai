import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type TimePeriod = '1d' | '1w' | '1m' | '6m' | '1y' | '3y'

interface ChartDataPoint {
  date: string
  price: number
  timestamp: number
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

function filterTimeSeriesByPeriod(timeSeries: any, period: TimePeriod, interval: string = 'daily'): ChartDataPoint[] {
  const { startDate, endDate } = getDateRange(period)
  const data: ChartDataPoint[] = []

  // Determine the time series key based on interval
  let timeSeriesKey: string
  if (interval === '5min') {
    timeSeriesKey = 'Time Series (5min)'
  } else if (interval === '30min') {
    timeSeriesKey = 'Time Series (30min)'
  } else if (interval === '60min') {
    timeSeriesKey = 'Time Series (60min)'
  } else {
    timeSeriesKey = 'Time Series (Daily)'
  }
  
  if (!timeSeries || !timeSeries[timeSeriesKey]) {
    return []
  }

  const seriesData = timeSeries[timeSeriesKey]
  const entries = Object.entries(seriesData)
    .map(([datetime, values]: [string, any]) => {
      // For intraday data, format is "2025-01-15 10:00:00", convert to ISO format
      let dateStr = datetime
      if (interval !== 'daily') {
        // Convert "2025-01-15 10:00:00" to ISO format "2025-01-15T10:00:00"
        dateStr = datetime.replace(' ', 'T')
        // Remove seconds if present to normalize format
        if (dateStr.includes(':00:00')) {
          dateStr = dateStr.replace(':00', '')
        }
      }
      return {
        date: dateStr,
        price: parseFloat(values['4. close']),
        timestamp: new Date(dateStr).getTime(),
      }
    })
    .filter((point) => {
      const pointDate = new Date(point.timestamp)
      return pointDate >= startDate && pointDate <= endDate
    })
    .sort((a, b) => a.timestamp - b.timestamp)

  // For daily data, use all points (already sampled by the API)
  // For intraday data, use all points since we're using the appropriate interval
  return entries
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

    // Determine which data source to use based on period
    // 1 day: 5 minute intervals
    // 1 week: 30 minute intervals
    // 1 month, 6 months, 1 year, 3 years: daily intervals
    let interval: string
    let functionName: string
    let apiUrl: string

    if (period === '1d') {
      interval = '5min'
      functionName = 'TIME_SERIES_INTRADAY'
      apiUrl = `https://www.alphavantage.co/query?function=${functionName}&symbol=${ticker}&interval=5min&apikey=${process.env.ALPHA_VANTAGE_API_KEY}&outputsize=full`
    } else if (period === '1w') {
      interval = '30min'
      functionName = 'TIME_SERIES_INTRADAY'
      apiUrl = `https://www.alphavantage.co/query?function=${functionName}&symbol=${ticker}&interval=30min&apikey=${process.env.ALPHA_VANTAGE_API_KEY}&outputsize=full`
    } else {
      // 1 month, 6 months, 1 year, 3 years: use daily data
      interval = 'daily'
      functionName = 'TIME_SERIES_DAILY'
      apiUrl = `https://www.alphavantage.co/query?function=${functionName}&symbol=${ticker}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}&outputsize=full`
    }

    const response = await fetch(apiUrl)
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

    // Filter and format data
    const chartData = filterTimeSeriesByPeriod(data, period, interval)

    return NextResponse.json({ data: chartData })
  } catch (error: any) {
    console.error('Error fetching chart data:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

