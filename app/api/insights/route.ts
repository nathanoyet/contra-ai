import { NextRequest } from 'next/server'
import { StockAnalysisAgent } from '@/lib/ai/agent'
import { createClient } from '@/lib/supabase/server'
import { setStatus, deleteStatus } from '@/lib/status-store'

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
    const { ticker, message, conversationHistory, isInitial, earningsType, earningsPeriod, reportDate, requestId } = body

    if (!ticker) {
      return new Response(JSON.stringify({ error: 'Ticker is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const agent = new StockAnalysisAgent()
    let content = ''
    let earningsPeriodForTitle: string | null = null

    try {
      if (isInitial) {
        console.log(`Generating initial insights for ticker: ${ticker}, type: ${earningsType}, period: ${earningsPeriod}`)
        
        // Set initial status immediately
        if (requestId) {
          setStatus(requestId, 'Starting analysis...')
        }
        
        // Create status callback for progress updates
        const onStatusUpdate = (status: string) => {
          if (requestId) {
            setStatus(requestId, status)
            console.log(`Status update: ${status}`)
          }
        }
        
        // Check if this is a specific earnings event analysis (past or future)
        if (earningsType === 'past' && earningsPeriod && reportDate) {
          // Generate analysis for a specific past earnings event
          content = await agent.generateSpecificEarningsAnalysis(ticker, earningsPeriod, reportDate, onStatusUpdate)
          earningsPeriodForTitle = earningsPeriod
        } else if (earningsType === 'future' && reportDate) {
          // Generate pre-earnings analysis for upcoming earnings
          content = await agent.generatePreEarningsAnalysis(ticker, reportDate, onStatusUpdate)
          // For future earnings, try to determine the period from the report date
          try {
            const date = new Date(reportDate)
            const quarter = Math.floor(date.getMonth() / 3) + 1
            const year = date.getFullYear()
            const fiscalYear = year.toString().slice(-2)
            earningsPeriodForTitle = `Q${quarter} FY${fiscalYear}`
          } catch (error) {
            console.log('Could not determine period from report date:', error)
          }
        } else {
          // Generate general initial insights
          const result = await agent.generateInitialInsights(ticker, onStatusUpdate)
          content = result.content
          earningsPeriodForTitle = result.earningsPeriod
        }
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
        
        // Clear status after completion
        if (requestId) {
          deleteStatus(requestId)
        }
      } else {
        if (!message) {
          return new Response(JSON.stringify({ error: 'Message is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        console.log(`Handling follow-up for ticker: ${ticker}`)
        
        // Set initial status immediately
        if (requestId) {
          setStatus(requestId, 'Preparing response...')
        }
        
        // Create status callback for progress updates
        const onStatusUpdate = (status: string) => {
          if (requestId) {
            setStatus(requestId, status)
            console.log(`Status update: ${status}`)
          }
        }
        
        // Handle follow-up question
        content = await agent.handleFollowUp(
          ticker,
          message,
          (conversationHistory || []) as Array<{ role: string; content: string }>,
          onStatusUpdate
        )
        
        // Clear status after completion
        if (requestId) {
          deleteStatus(requestId)
        }

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

      return new Response(JSON.stringify({ content, earningsPeriod: earningsPeriodForTitle }), {
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

