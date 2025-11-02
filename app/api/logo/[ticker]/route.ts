import { NextRequest, NextResponse } from 'next/server'

// Map of common ticker symbols to their company domains
// This helps logo.dev and clearbit find the right logo
const tickerToDomain: Record<string, string> = {
  'aapl': 'apple.com',
  'msft': 'microsoft.com',
  'googl': 'google.com',
  'amzn': 'amazon.com',
  'meta': 'meta.com',
  'tsla': 'tesla.com',
  'nvda': 'nvidia.com',
  'nflx': 'netflix.com',
  'mcd': 'mcdonalds.com',
  'abnb': 'airbnb.com',
  'csco': 'cisco.com',
  'hd': 'homedepot.com',
  'dell': 'dell.com',
  // Add more mappings as needed
}

export async function GET(
  request: NextRequest,
  { params }: { params: { ticker: string } }
) {
  try {
    const { ticker } = params

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 })
    }

    const tickerLower = ticker.toLowerCase()
    
    // Get domain from mapping, or construct from ticker
    const domain = tickerToDomain[tickerLower] || `${tickerLower}.com`

    // Try logo.dev first if API key is configured
    if (process.env.NEXT_PUBLIC_LOGO_DEV_API_KEY) {
      const logoUrl = `https://img.logo.dev/${domain}?token=${process.env.NEXT_PUBLIC_LOGO_DEV_API_KEY}`
      const response = await fetch(logoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      })

      if (response.ok) {
        const imageBuffer = await response.arrayBuffer()
        const contentType = response.headers.get('content-type') || 'image/png'

        return new NextResponse(imageBuffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }
    }

    // Fallback to Clearbit (free, no API key required)
    const clearbitUrl = `https://logo.clearbit.com/${domain}`
    const clearbitResponse = await fetch(clearbitUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    })

    if (clearbitResponse.ok) {
      const imageBuffer = await clearbitResponse.arrayBuffer()
      return new NextResponse(imageBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // If both fail, return error
    return NextResponse.json(
      { error: 'Failed to fetch logo' },
      { status: 404 }
    )
  } catch (error: any) {
    console.error('Error fetching logo:', error)
    
    // Final fallback attempt
    try {
      const { ticker } = params
      const tickerLower = ticker.toLowerCase()
      const domain = tickerToDomain[tickerLower] || `${tickerLower}.com`
      const clearbitUrl = `https://logo.clearbit.com/${domain}`
      const fallbackResponse = await fetch(clearbitUrl)
      
      if (fallbackResponse.ok) {
        const imageBuffer = await fallbackResponse.arrayBuffer()
        return new NextResponse(imageBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }
    } catch (fallbackError) {
      // Ignore fallback errors
    }
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

