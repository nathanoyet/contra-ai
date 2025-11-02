import { NextRequest } from 'next/server'
import { StockAnalysisAgent } from '@/lib/ai/agent'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await request.json()
    const { ticker, message, conversationHistory, isInitial } = body

    if (!ticker) {
      return new Response(JSON.stringify({ error: 'Ticker is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const agent = new StockAnalysisAgent()
    let content = ''

    try {
      if (isInitial) {
        // Generate initial insights
        content = await agent.generateInitialInsights(ticker)

        // Store analysis in database
        const { error: dbError } = await supabase
          .from('analyses')
          .insert({
            user_id: user.id,
            ticker: ticker.toUpperCase(),
            initial_insights: content,
          })

        if (dbError) {
          console.error('Error storing analysis:', dbError)
        }
      } else {
        if (!message) {
          return new Response(JSON.stringify({ error: 'Message is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Handle follow-up question
        content = await agent.handleFollowUp(
          ticker,
          message,
          (conversationHistory || []) as Array<{ role: string; content: string }>
        )

        // Store conversation in database
        const { error: dbError } = await supabase
          .from('conversations')
          .insert({
            user_id: user.id,
            ticker: ticker.toUpperCase(),
            message,
            response: content,
          })

        if (dbError) {
          console.error('Error storing conversation:', dbError)
        }
      }

      return new Response(JSON.stringify({ content }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error: any) {
      console.error('Error generating insights:', error)
      return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch (error: any) {
    console.error('Error in insights route:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

