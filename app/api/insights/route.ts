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
        console.log(`Generating initial insights for ticker: ${ticker}`)
        // Generate initial insights
        content = await agent.generateInitialInsights(ticker)
        console.log(`Generated insights length: ${content?.length || 0}`)

        if (!content || content.trim().length === 0) {
          console.error('Empty content received from agent')
          return new Response(JSON.stringify({ error: 'Failed to generate insights. Please try again.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

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
          // Don't fail the request if DB save fails
        }
      } else {
        if (!message) {
          return new Response(JSON.stringify({ error: 'Message is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        console.log(`Handling follow-up for ticker: ${ticker}`)
        // Handle follow-up question
        content = await agent.handleFollowUp(
          ticker,
          message,
          (conversationHistory || []) as Array<{ role: string; content: string }>
        )

        if (!content || content.trim().length === 0) {
          console.error('Empty content received from agent for follow-up')
          return new Response(JSON.stringify({ error: 'Failed to generate response. Please try again.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

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
          // Don't fail the request if DB save fails
        }
      }

      return new Response(JSON.stringify({ content }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error: any) {
      console.error('Error generating insights:', error)
      console.error('Error stack:', error.stack)
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

