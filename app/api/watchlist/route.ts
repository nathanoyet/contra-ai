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

    const { data: watchlist, error } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching watchlist:', error)
      return NextResponse.json(
        { error: 'Failed to fetch watchlist' },
        { status: 500 }
      )
    }

    return NextResponse.json({ watchlist: watchlist || [] })
  } catch (error: any) {
    console.error('Error in watchlist GET:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
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
    const { ticker, companyName } = body

    if (!ticker || !companyName) {
      return NextResponse.json(
        { error: 'Ticker and company name are required' },
        { status: 400 }
      )
    }

    // Check if already in watchlist
    const { data: existing } = await supabase
      .from('watchlist')
      .select('id')
      .eq('user_id', user.id)
      .eq('ticker', ticker.toUpperCase())
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'Stock already in watchlist' },
        { status: 400 }
      )
    }

    // Insert into watchlist
    const { data, error } = await supabase
      .from('watchlist')
      .insert({
        user_id: user.id,
        ticker: ticker.toUpperCase(),
        company_name: companyName,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding to watchlist:', error)
      return NextResponse.json(
        { error: 'Failed to add stock to watchlist' },
        { status: 500 }
      )
    }

    return NextResponse.json({ watchlistItem: data })
  } catch (error: any) {
    console.error('Error in watchlist POST:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
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

    const { error } = await supabase
      .from('watchlist')
      .delete()
      .eq('user_id', user.id)
      .eq('ticker', ticker.toUpperCase())

    if (error) {
      console.error('Error removing from watchlist:', error)
      return NextResponse.json(
        { error: 'Failed to remove stock from watchlist' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in watchlist DELETE:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

