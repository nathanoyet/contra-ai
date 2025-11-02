'use client'

import { useState, useEffect, useRef, FormEvent } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowUp, Loader2, Copy, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isLoading?: boolean
}

export default function InsightsPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const ticker = params.ticker as string
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [detectedEarningsPeriod, setDetectedEarningsPeriod] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const statusPollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const currentRequestIdRef = useRef<string | null>(null)
  const supabase = createClient()
  
  // Get earnings period info from query params
  const earningsType = searchParams.get('type') // 'past' or 'future'
  const earningsPeriod = searchParams.get('period') // e.g., 'Q3 FY24'
  const reportDate = searchParams.get('reportDate')

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
    }
    checkUser()
  }, [supabase, router])

  useEffect(() => {
    if (ticker && messages.length === 0) {
      loadInitialInsights()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, earningsType, earningsPeriod, reportDate])

  useEffect(() => {
    // Auto-scroll to bottom when messages update
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (statusPollIntervalRef.current) {
        clearInterval(statusPollIntervalRef.current)
      }
    }
  }, [])

  const pollStatus = async (requestId: string) => {
    try {
      const response = await fetch(`/api/insights/status?requestId=${requestId}&t=${Date.now()}`)
      if (response.ok) {
        const data = await response.json()
        if (data.status && data.status.trim()) {
          setStatus(data.status)
        }
      }
    } catch (error) {
      console.error('Error polling status:', error)
    }
  }

  const loadInitialInsights = async () => {
    setLoading(true)
    
    // Generate a unique request ID
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    currentRequestIdRef.current = requestId
    
    // Set initial status
    setStatus('Starting analysis...')
    
    // Start polling for status updates immediately
    statusPollIntervalRef.current = setInterval(() => {
      if (currentRequestIdRef.current) {
        pollStatus(currentRequestIdRef.current)
      }
    }, 300) // Poll every 300ms for more responsive updates
    
    try {
      console.log(`Loading initial insights for ticker: ${ticker}`)
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ticker, 
          isInitial: true,
          earningsType,
          earningsPeriod,
          reportDate,
          requestId,
        }),
      })

      // Stop polling once we get a response
      if (statusPollIntervalRef.current) {
        clearInterval(statusPollIntervalRef.current)
        statusPollIntervalRef.current = null
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to fetch insights: ${response.status}`)
      }

      const data = await response.json()
      console.log('Response data:', { hasContent: !!data.content, contentLength: data.content?.length })

      if (data.error) {
        throw new Error(data.error)
      }

      if (!data.content || data.content.trim().length === 0) {
        throw new Error('No content received from server')
      }

      // Set the detected earnings period if available
      if (data.earningsPeriod) {
        setDetectedEarningsPeriod(data.earningsPeriod)
      }

      setStatus(null) // Clear status when done
      setMessages([
        {
          role: 'assistant',
          content: data.content,
        },
      ])
      setLoading(false)
    } catch (error: any) {
      console.error('Error loading insights:', error)
      
      // Stop polling on error
      if (statusPollIntervalRef.current) {
        clearInterval(statusPollIntervalRef.current)
        statusPollIntervalRef.current = null
      }
      
      const errorMessage = error?.message || 'Sorry, I encountered an error while analyzing this stock. Please try again.'
      setStatus(null)
      setMessages([
        {
          role: 'assistant',
          content: errorMessage,
        },
      ])
      setLoading(false)
    }
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage: Message = { role: 'user', content: input }
    const userInput = input
    setInput('')
    setLoading(true)
    
    // Generate a unique request ID for follow-up
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    currentRequestIdRef.current = requestId
    
    // Set initial status
    setStatus('Preparing response...')

    // Add user message and empty assistant message
    setMessages((prev: Message[]) => [
      ...prev,
      userMessage,
      { role: 'assistant', content: '' },
    ])

    // Start polling for status updates
    statusPollIntervalRef.current = setInterval(() => {
      if (currentRequestIdRef.current) {
        pollStatus(currentRequestIdRef.current)
      }
    }, 300) // Poll every 300ms

    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          message: userInput,
          conversationHistory: messages,
          isInitial: false,
          requestId,
        }),
      })

      // Stop polling once we get a response
      if (statusPollIntervalRef.current) {
        clearInterval(statusPollIntervalRef.current)
        statusPollIntervalRef.current = null
      }

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      setStatus(null) // Clear status when done
      
      // Update the assistant message with the full response
      setMessages((prev: Message[]) => {
        const newMessages = prev.slice(0, -1)
        return [
          ...newMessages,
          {
            role: 'assistant',
            content: data.content || '',
          },
        ]
      })
    } catch (error) {
      console.error('Error getting response:', error)
      
      // Stop polling on error
      if (statusPollIntervalRef.current) {
        clearInterval(statusPollIntervalRef.current)
        statusPollIntervalRef.current = null
      }
      
      setStatus(null)
      setMessages((prev: Message[]) => {
        const newMessages = prev.slice(0, -1)
        return [
          ...newMessages,
          {
            role: 'assistant',
            content: 'Sorry, I encountered an error. Please try again.',
          },
        ]
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 pt-36 pb-32">
        <h1 className="text-2xl font-medium mb-6">
          {earningsType === 'past' && earningsPeriod
            ? `${ticker} ${earningsPeriod} Earnings Analysis`
            : earningsType === 'future'
            ? `${ticker} Pre-Earnings Analysis`
            : detectedEarningsPeriod
            ? `${ticker} ${detectedEarningsPeriod} Earnings Analysis`
            : `${ticker} Earnings Analysis`}
        </h1>
        <div className="flex-1 overflow-y-auto pb-4 min-h-0">
          {loading && messages.length === 0 && (
            <div className="flex flex-col items-start py-12 gap-4">
              {status ? (
                <Badge variant="outline" className="inline-flex items-center gap-2 px-4 py-2 border-none">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-base">{status}</span>
                </Badge>
              ) : (
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              )}
            </div>
          )}
          {messages.map((message, index) => {
            if (message.role === 'user') {
              // User messages have lighter grey background, fit to content, left-aligned
              return (
                <div key={index} className="flex justify-end mb-9">
                  <div className="bg-gray-100 rounded-lg px-4 py-2 inline-block max-w-[80%]">
                    <div className="whitespace-pre-wrap text-left">{message.content}</div>
                  </div>
                </div>
              )
            }
            
            // Assistant messages
            return (
              <div key={index} className="relative group mb-9">
                <div className="relative">
                  <div className="whitespace-pre-wrap p-4 pb-10">
                    {message.content || (loading && index === messages.length - 1 && status ? (
                      <div className="flex flex-col items-start gap-4">
                        <Badge variant="outline" className="inline-flex items-center gap-2 px-4 py-2 border-none">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-base">{status}</span>
                        </Badge>
                      </div>
                    ) : loading && index === messages.length - 1 ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      </span>
                    ) : null)}
                  </div>
                  {message.content && (
                    <button
                      onClick={() => handleCopy(message.content, index)}
                      className="absolute bottom-2 right-2 p-1.5 rounded-md hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Copy to clipboard"
                    >
                      {copiedIndex === index ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4 text-gray-500" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>
      </main>
      <form onSubmit={handleSubmit} className="sticky bottom-0 bg-white max-w-4xl mx-auto w-full px-6 pt-4 pb-10 z-10">
        <div className="relative">
          <Input
            type="text"
            placeholder="Ask a follow-up question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full h-14 pl-6 pr-14 !text-base rounded-lg border-gray-200 focus-visible:ring-0 placeholder:text-gray-400"
            autoComplete="off"
            disabled={loading}
          />
          <Button
            type="submit"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 bg-gray-200 hover:bg-gray-400 text-black hover:text-white transition-colors"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-black" />
            ) : (
              <ArrowUp className="h-5 w-5" />
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

