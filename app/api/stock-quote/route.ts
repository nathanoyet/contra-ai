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

    // Fetch current price and change percentage
    const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`
    const response = await fetch(quoteUrl)
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

    // Extract price and change percentage
    let price: number | null = null
    let changePercent: string | null = null

    if (data['Global Quote']) {
      const globalQuote = data['Global Quote']
      if (globalQuote['05. price']) {
        price = parseFloat(globalQuote['05. price'])
      }
      if (globalQuote['10. change percent']) {
        changePercent = globalQuote['10. change percent']
      }
    }

    return NextResponse.json({ price, changePercent })
  } catch (error: any) {
    console.error('Error fetching stock quote:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

