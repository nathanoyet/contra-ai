'use client'

import { useState, useEffect, useRef, FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
  const ticker = params.ticker as string
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

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
  }, [ticker])

  useEffect(() => {
    // Auto-scroll to bottom when messages update (including during streaming)
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadInitialInsights = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, isInitial: true }),
      })

      if (!response.ok) {
        throw new Error('Failed to fetch insights')
      }

      // Add assistant message with empty content
      setMessages([
        {
          role: 'assistant',
          content: '',
        },
      ])

      // Handle streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let content = ''
      let buffer = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            // Process remaining buffer
            if (buffer) {
              const line = buffer.trim()
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data && data !== '[DONE]') {
                  try {
                    const parsed = JSON.parse(data)
                    if (parsed.chunk) {
                      content += parsed.chunk
                      setMessages([
                        {
                          role: 'assistant',
                          content: content,
                        },
                      ])
                    }
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
              }
            }
            setLoading(false)
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep the last incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') {
                setLoading(false)
                return
              }

              if (data) {
                try {
                  const parsed = JSON.parse(data)
                  if (parsed.error) {
                    throw new Error(parsed.error)
                  }
                  if (parsed.chunk) {
                    content += parsed.chunk
                    setMessages([
                      {
                        role: 'assistant',
                        content: content,
                      },
                    ])
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading insights:', error)
      setMessages([
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error while analyzing this stock. Please try again.',
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

    // Add user message and empty assistant message
    setMessages((prev: Message[]) => [
      ...prev,
      userMessage,
      { role: 'assistant', content: '' },
    ])

    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          message: userInput,
          conversationHistory: messages,
          isInitial: false,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let content = ''
      let buffer = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            // Process remaining buffer
            if (buffer) {
              const line = buffer.trim()
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data && data !== '[DONE]') {
                  try {
                    const parsed = JSON.parse(data)
                    if (parsed.chunk) {
                      content += parsed.chunk
                      setMessages((prev: Message[]) => {
                        const newMessages = prev.slice(0, -1)
                        return [
                          ...newMessages,
                          {
                            role: 'assistant',
                            content: content,
                          },
                        ]
                      })
                    }
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
              }
            }
            setLoading(false)
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep the last incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') {
                setLoading(false)
                return
              }

              if (data) {
                try {
                  const parsed = JSON.parse(data)
                  if (parsed.error) {
                    throw new Error(parsed.error)
                  }
                  if (parsed.chunk) {
                    content += parsed.chunk
                    setMessages((prev: Message[]) => {
                      const newMessages = prev.slice(0, -1)
                      return [
                        ...newMessages,
                        {
                          role: 'assistant',
                          content: content,
                        },
                      ]
                    })
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error getting response:', error)
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
      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 pt-24 pb-32">
        <h1 className="text-2xl font-medium mb-6">{ticker} Earnings Analysis</h1>
        <div className="flex-1 overflow-y-auto pb-4 min-h-0">
          {loading && messages.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
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
                    {message.content || (loading && index === messages.length - 1 ? (
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

