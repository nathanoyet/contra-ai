'use client'

import { useState, FormEvent, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Navbar } from '@/components/navbar'
import { ArrowUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CommandList, CommandItem } from '@/components/ui/command'

interface TickerMatch {
  symbol: string
  name: string
  type: string
  region: string
  currency: string
  matchScore: string
}

export default function InsightsPage() {
  const [ticker, setTicker] = useState('')
  const [suggestions, setSuggestions] = useState<TickerMatch[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
      }
    }
    checkUser()
  }, [supabase, router])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const searchTickers = useCallback(async (keywords: string) => {
    if (!keywords.trim() || keywords.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(`/api/search-ticker?keywords=${encodeURIComponent(keywords)}`)
      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.matches || [])
        setShowSuggestions(data.matches && data.matches.length > 0)
        setSelectedIndex(-1)
      } else {
        setSuggestions([])
        setShowSuggestions(false)
      }
    } catch (error) {
      console.error('Error searching tickers:', error)
      setSuggestions([])
      setShowSuggestions(false)
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setTicker(value)
    setSelectedTicker(null) // Reset selected ticker when user types

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(() => {
      searchTickers(value)
    }, 300)
  }

  const handleSuggestionClick = (match: TickerMatch) => {
    setTicker(match.symbol)
    setSelectedTicker(match.symbol)
    setShowSuggestions(false)
    setSelectedIndex(-1)
    router.push(`/insights/${match.symbol}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault()
        // Do nothing if no ticker is selected
        return
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSuggestionClick(suggestions[selectedIndex])
        } else if (selectedTicker) {
          // If a ticker is already selected, navigate
          router.push(`/insights/${selectedTicker}`)
        }
        break
      case 'Escape':
        setShowSuggestions(false)
        setSelectedIndex(-1)
        break
    }
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Only allow submission if a ticker was selected from suggestions
    if (selectedTicker) {
      router.push(`/insights/${selectedTicker}`)
    }
    // If user just typed and pressed enter without selecting, do nothing
  }

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-6 relative pt-16">
        <h1 className="text-5xl font-normal mb-16 text-center">
          What stock do you want to analyse?
        </h1>
        <div className="relative max-w-xl mx-auto w-full" ref={suggestionsRef}>
          <form onSubmit={handleSubmit} className="relative">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Enter stock ticker or company name"
              value={ticker}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              className="w-full h-14 pl-6 pr-14 !text-base rounded-lg border-gray-200 focus-visible:ring-0 placeholder:text-gray-400"
              autoComplete="off"
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 bg-gray-200 hover:bg-gray-400 text-black hover:text-white transition-colors"
              disabled={!selectedTicker}
            >
              <ArrowUp className="h-5 w-5" />
            </Button>
          </form>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
              <CommandList className="max-h-[300px]">
                {suggestions.map((match, index) => (
                  <CommandItem
                    key={`${match.symbol}-${index}`}
                    className={`
                      cursor-pointer px-4 py-3 border-b border-gray-100 last:border-b-0
                      ${selectedIndex === index ? 'bg-gray-100' : 'hover:bg-gray-50'}
                    `}
                    onClick={() => handleSuggestionClick(match)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{match.symbol}</span>
                        <span className="text-xs text-gray-500">{match.region}</span>
                      </div>
                      <span className="text-xs text-gray-600 mt-0.5">{match.name}</span>
                      <span className="text-xs text-gray-400">{match.type}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandList>
            </div>
          )}
        </div>
        <p className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-sm text-gray-400 text-center">
          Analyse the post earnings market sentiment of any US stock
        </p>
      </main>
    </div>
  )
}

