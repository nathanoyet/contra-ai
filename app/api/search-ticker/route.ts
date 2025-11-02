import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const keywords = searchParams.get('keywords')

    if (!keywords) {
      return NextResponse.json({ error: 'Keywords are required' }, { status: 400 })
    }

    if (!process.env.ALPHA_VANTAGE_API_KEY) {
      return NextResponse.json({ error: 'Alpha Vantage API key not configured' }, { status: 500 })
    }

    // Alpha Vantage SYMBOL_SEARCH API
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(keywords)}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`

    const response = await fetch(url)
    const data = await response.json()

    // Handle Alpha Vantage rate limit
    if (data['Note']) {
      return NextResponse.json({ error: 'API rate limit exceeded. Please try again later.' }, { status: 429 })
    }

    // Handle API error
    if (data['Error Message']) {
      return NextResponse.json({ error: data['Error Message'] }, { status: 400 })
    }

    // Return best matches (limit to 10)
    const matches = data.bestMatches || []
    const limitedMatches = matches.slice(0, 10).map((match: any) => ({
      symbol: match['1. symbol'],
      name: match['2. name'],
      type: match['3. type'],
      region: match['4. region'],
      marketOpen: match['5. marketOpen'],
      marketClose: match['6. marketClose'],
      timezone: match['7. timezone'],
      currency: match['8. currency'],
      matchScore: match['9. matchScore'],
    }))

    return NextResponse.json({ matches: limitedMatches })
  } catch (error: any) {
    console.error('Error searching ticker:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

