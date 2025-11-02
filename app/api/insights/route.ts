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

    // Create a ReadableStream for streaming responses
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        let fullContent = ''

        try {
          if (isInitial) {
            // Try streaming first
            try {
              const streamGenerator = agent.generateInitialInsightsStream(ticker)
              
              for await (const chunk of streamGenerator) {
                fullContent += chunk
                const data = encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`)
                controller.enqueue(data)
              }
            } catch (streamError: any) {
              // If streaming fails (e.g., organization verification issue), fall back to non-streaming
              console.warn('Streaming failed, falling back to non-streaming:', streamError.message)
              
              // Get full response without streaming
              fullContent = await agent.generateInitialInsights(ticker)
              
              // Simulate streaming by sending in chunks with minimal delay
              const chunkSize = 100 // Larger chunks for better performance
              for (let i = 0; i < fullContent.length; i += chunkSize) {
                const chunk = fullContent.slice(i, i + chunkSize)
                const data = encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`)
                controller.enqueue(data)
                // Minimal delay to simulate real streaming but keep it fast
                await new Promise(resolve => setTimeout(resolve, 5))
              }
            }

            // Store analysis in database
            const { error: dbError } = await supabase
              .from('analyses')
              .insert({
                user_id: user.id,
                ticker: ticker.toUpperCase(),
                initial_insights: fullContent,
              })

            if (dbError) {
              console.error('Error storing analysis:', dbError)
            }

            // Send completion signal
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          } else {
            if (!message) {
              controller.error(new Error('Message is required'))
              return
            }

            // Try streaming first
            try {
              const streamGenerator = agent.handleFollowUpStream(
                ticker,
                message,
                (conversationHistory || []) as Array<{ role: string; content: string }>
              )
              
              for await (const chunk of streamGenerator) {
                fullContent += chunk
                const data = encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`)
                controller.enqueue(data)
              }
            } catch (streamError: any) {
              // If streaming fails, fall back to non-streaming
              console.warn('Streaming failed, falling back to non-streaming:', streamError.message)
              
              // Get full response without streaming
              fullContent = await agent.handleFollowUp(
                ticker,
                message,
                (conversationHistory || []) as Array<{ role: string; content: string }>
              )
              
              // Simulate streaming by sending in chunks with minimal delay
              const chunkSize = 100 // Larger chunks for better performance
              for (let i = 0; i < fullContent.length; i += chunkSize) {
                const chunk = fullContent.slice(i, i + chunkSize)
                const data = encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`)
                controller.enqueue(data)
                // Minimal delay to simulate real streaming but keep it fast
                await new Promise(resolve => setTimeout(resolve, 5))
              }
            }
            
            // Store conversation in database
            const { error: dbError } = await supabase
              .from('conversations')
              .insert({
                user_id: user.id,
                ticker: ticker.toUpperCase(),
                message,
                response: fullContent,
              })

            if (dbError) {
              console.error('Error storing conversation:', dbError)
            }

            // Send completion signal
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          }
        } catch (error: any) {
          console.error('Error in stream:', error)
          const errorData = encoder.encode(
            `data: ${JSON.stringify({ error: error.message || 'Internal server error' })}\n\n`
          )
          controller.enqueue(errorData)
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error: any) {
    console.error('Error in insights route:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

