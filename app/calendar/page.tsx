'use client'

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { CommandList, CommandItem } from '@/components/ui/command'
import { ChevronLeft, ChevronRight, Loader2, ArrowUp, Plus, Check } from 'lucide-react'

interface EarningsEvent {
  ticker: string
  companyName: string
  reportDate: string
  fiscalDateEnding: string | null
  label: string
  estimatedEPS?: string | null
  reportedEPS?: string | null
  isPast?: boolean
}

interface EarningsByDate {
  [date: string]: EarningsEvent[]
}

interface TickerMatch {
  symbol: string
  name: string
  type: string
  region: string
  currency: string
  matchScore: string
}

interface EarningsLookupResult {
  ticker: string
  companyName: string
  nextEarningsDate: string | null
  previousEarningsDate: string | null
}

export default function CalendarPage() {
  const router = useRouter()
  const supabase = createClient()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [earningsByDate, setEarningsByDate] = useState<EarningsByDate>({})
  const [loading, setLoading] = useState(true)
  const [logoCache, setLogoCache] = useState<Record<string, string>>({})
  const [ticker, setTicker] = useState('')
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<TickerMatch[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const [earningsDialogOpen, setEarningsDialogOpen] = useState(false)
  const [earningsLookupData, setEarningsLookupData] = useState<EarningsLookupResult | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [isInWatchlist, setIsInWatchlist] = useState(false)
  const [isAddingToWatchlist, setIsAddingToWatchlist] = useState(false)
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

  useEffect(() => {
    loadEarningsData()
  }, [currentMonth])

  useEffect(() => {
    console.log('Dialog state changed:', earningsDialogOpen)
  }, [earningsDialogOpen])

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
    setSelectedTicker(null)

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchTickers(value)
    }, 300)
  }

  const handleSuggestionClick = (match: TickerMatch) => {
    setTicker(match.symbol)
    setSelectedTicker(match.symbol)
    setShowSuggestions(false)
    setSelectedIndex(-1)
    // Auto-submit after selecting a ticker
    setTimeout(() => {
      handleSubmit()
    }, 100)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedTicker) {
        handleSubmit()
        return
      }
      if (showSuggestions && suggestions.length > 0 && selectedIndex >= 0 && selectedIndex < suggestions.length) {
        handleSuggestionClick(suggestions[selectedIndex])
        return
      }
      return
    }

    if (!showSuggestions || suggestions.length === 0) {
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
      case 'Escape':
        setShowSuggestions(false)
        break
    }
  }

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true)
    }
  }

  const handleSubmit = async (e?: FormEvent<HTMLFormElement> | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault()
    }
    if (!selectedTicker) {
      console.log('No ticker selected, cannot submit')
      return
    }

    console.log('Opening dialog for ticker:', selectedTicker)
    setEarningsDialogOpen(true)
    setLookupLoading(true)
    setEarningsLookupData(null) // Reset data when opening new dialog
    setIsInWatchlist(false) // Reset watchlist status
    
    try {
      const [earningsResponse, watchlistResponse] = await Promise.all([
        fetch(`/api/earnings-lookup?ticker=${encodeURIComponent(selectedTicker)}`),
        fetch('/api/watchlist')
      ])
      
      // Check if stock is in watchlist
      if (watchlistResponse.ok) {
        const watchlistData = await watchlistResponse.json()
        const isInWatchlist = watchlistData.watchlist?.some(
          (item: any) => item.ticker.toUpperCase() === selectedTicker.toUpperCase()
        )
        setIsInWatchlist(isInWatchlist || false)
      }
      
      // Get earnings data
      if (earningsResponse.ok) {
        const data = await earningsResponse.json()
        setEarningsLookupData(data)
      } else {
        const errorData = await earningsResponse.json()
        setEarningsLookupData({
          ticker: selectedTicker,
          companyName: 'N/A',
          nextEarningsDate: null,
          previousEarningsDate: null,
        })
      }
    } catch (error) {
      console.error('Error fetching earnings lookup:', error)
      setEarningsLookupData({
        ticker: selectedTicker,
        companyName: 'N/A',
        nextEarningsDate: null,
        previousEarningsDate: null,
      })
    } finally {
      setLookupLoading(false)
    }
  }

  const handleAddToWatchlist = async () => {
    if (!earningsLookupData || !selectedTicker) return

    setIsAddingToWatchlist(true)
    try {
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: selectedTicker,
          companyName: earningsLookupData.companyName,
        }),
      })

      if (response.ok) {
        setIsInWatchlist(true)
        // Reload earnings data to show the new stock on the calendar
        await loadEarningsData()
      } else {
        const error = await response.json()
        console.error('Error adding to watchlist:', error.error)
        // Could show a toast here if needed
      }
    } catch (error) {
      console.error('Error adding stock to watchlist:', error)
    } finally {
      setIsAddingToWatchlist(false)
    }
  }

  const formatDateForDisplay = (dateStr: string | null): string => {
    if (!dateStr) return 'N/A'
    try {
      const date = new Date(dateStr)
      const day = date.getDate()
      const month = date.toLocaleDateString('en-US', { month: 'short' })
      const year = date.getFullYear()
      return `${day} ${month} ${year}`
    } catch {
      return 'N/A'
    }
  }

  const loadEarningsData = async () => {
    try {
      setLoading(true)
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth() + 1 // Month is 1-indexed for API
      const response = await fetch(`/api/calendar/earnings?year=${year}&month=${month}`)
      if (response.ok) {
        const data = await response.json()
        setEarningsByDate(data.earnings || {})
      }
    } catch (error) {
      console.error('Error loading earnings data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getLogoUrl = (ticker: string): string => {
    // Use logo.dev API for logos (proxied through our API route)
    return `/api/logo/${ticker.toLowerCase()}`
  }

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    return { daysInMonth, startingDayOfWeek, lastDay }
  }

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const goToToday = () => {
    setCurrentMonth(new Date())
  }

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const formatDateKey = (year: number, month: number, day: number): string => {
    const date = new Date(year, month, day)
    return date.toISOString().split('T')[0]
  }

  const getEarningsForDate = (dateKey: string): EarningsEvent[] => {
    return earningsByDate[dateKey] || []
  }

  const { daysInMonth, startingDayOfWeek, lastDay } = getDaysInMonth(currentMonth)
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Check if current month/year matches today
  const today = new Date()
  const isCurrentMonth = currentMonth.getMonth() === today.getMonth() && 
                         currentMonth.getFullYear() === today.getFullYear()

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center px-6 pt-24 pb-12">
        <div className="w-full max-w-6xl mt-16">
          {/* Search and Calendar Header */}
          <div className="flex items-center justify-between mb-8">
            {/* Input Form - Left Aligned */}
            <div className="w-[50%] relative" ref={suggestionsRef}>
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
                  disabled={!selectedTicker || lookupLoading}
                  onClick={(e) => {
                    if (!selectedTicker) {
                      e.preventDefault()
                      return
                    }
                    // Form onSubmit will handle it, but we ensure it triggers
                  }}
                >
                  {lookupLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-5 w-5" />
                  )}
                </Button>
              </form>
              {isSearching && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                </div>
              )}
              {showSuggestions && suggestions.length > 0 && !isSearching && (
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

            {/* Month Selection - Right Aligned */}
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={previousMonth}
                className="h-9 w-9 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <span className="text-base font-medium min-w-[200px] text-center">
                  {formatMonthYear(currentMonth)}
                </span>
              </div>
              <Button
                variant="outline"
                onClick={nextMonth}
                className="h-9 w-9 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={goToToday}
                className="ml-2"
              >
                Today
              </Button>
            </div>
          </div>

          {/* Calendar Grid */}
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <Badge variant="outline" className="flex items-center gap-2 px-4 py-2 border-none">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-base">Generating Calendar</span>
              </Badge>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              {/* Day Headers */}
              <div className="grid grid-cols-7 border-b border-gray-200">
                {dayNames.map((day) => (
                  <div
                    key={day}
                    className="p-3 text-center text-sm font-medium text-gray-600 bg-gray-50"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7">
                {/* Empty cells for days before the first day of the month */}
                {Array.from({ length: startingDayOfWeek }).map((_, index) => (
                  <div
                    key={`empty-${index}`}
                    className="min-h-[120px] border-b border-r border-gray-200 bg-gray-50"
                  />
                ))}

                {/* Days of the month */}
                {Array.from({ length: daysInMonth }).map((_, index) => {
                  const day = index + 1
                  const dateKey = formatDateKey(year, month, day)
                  const earnings = getEarningsForDate(dateKey)
                  const isToday = isCurrentMonth && day === today.getDate()
                  const isPast = new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate())

                  return (
                    <div
                      key={day}
                      className={`min-h-[120px] border-b border-r border-gray-200 p-2 ${
                        isPast ? 'bg-gray-50' : 'bg-white'
                      } ${isToday ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
                    >
                      <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
                        {day}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {earnings.slice(0, 3).map((event, eventIndex) => {
                          const logoUrl = getLogoUrl(event.ticker)
                          const isPast = event.isPast || false
                          const handleLogoClick = () => {
                            // Navigate to insights page with earnings period info
                            const params = new URLSearchParams()
                            if (isPast) {
                              params.set('period', event.label)
                              params.set('reportDate', event.reportDate)
                              params.set('type', 'past')
                            } else {
                              params.set('reportDate', event.reportDate)
                              params.set('type', 'future')
                            }
                            router.push(`/insights/${event.ticker}?${params.toString()}`)
                          }
                          return (
                            <div
                              key={`${event.ticker}-${eventIndex}`}
                              className="relative group"
                            >
                              <div 
                                onClick={handleLogoClick}
                                className={`relative w-12 h-12 rounded border border-gray-200 bg-white hover:border-blue-400 transition-colors flex items-center justify-center overflow-hidden cursor-pointer ${isPast ? 'opacity-60' : ''}`}
                              >
                                <img
                                  src={logoUrl}
                                  alt={event.ticker}
                                  width={48}
                                  height={48}
                                  className="object-contain"
                                  onError={(e) => {
                                    // If logo fails to load, show ticker text instead
                                    const target = e.target as HTMLImageElement
                                    target.style.display = 'none'
                                    const parent = target.parentElement
                                    if (parent) {
                                      parent.classList.add('items-center', 'justify-center')
                                      if (!parent.querySelector('.ticker-fallback')) {
                                        const fallback = document.createElement('div')
                                        fallback.className = 'ticker-fallback text-[9px] font-semibold text-gray-600'
                                        fallback.textContent = event.ticker
                                        parent.appendChild(fallback)
                                      }
                                    }
                                  }}
                                />
                              </div>
                              {/* Hover Tooltip */}
                              <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block pointer-events-none">
                                <div className="w-64 p-3 bg-gray-900 text-white text-xs rounded shadow-lg">
                                  <div className="space-y-2">
                                    <div>
                                      <div className="font-semibold text-sm text-white">
                                        {event.companyName}
                                      </div>
                                      <div className="text-xs text-gray-300 mt-0.5">
                                        {event.ticker}
                                      </div>
                                    </div>
                                    <div className="pt-2 border-t border-gray-700">
                                      <div className="text-xs text-gray-200">
                                        <span className="font-medium">Reporting Period:</span> {event.label}
                                      </div>
                                      {event.isPast ? (
                                        // Past earnings: Show reported EPS (or N/A), and estimated if available
                                        <>
                                          <div className="text-xs text-gray-200 mt-1">
                                            <span className="font-medium">Reported Earnings:</span>{' '}
                                            {event.reportedEPS !== null && 
                                             event.reportedEPS !== undefined && 
                                             event.reportedEPS !== '' && 
                                             event.reportedEPS !== 'None' &&
                                             event.reportedEPS.toLowerCase() !== 'none' ? (
                                              `$${event.reportedEPS}`
                                            ) : (
                                              <span className="text-gray-400">N/A</span>
                                            )}
                                          </div>
                                          {event.estimatedEPS !== null && 
                                           event.estimatedEPS !== undefined && 
                                           event.estimatedEPS !== '' &&
                                           event.estimatedEPS !== 'None' &&
                                           event.estimatedEPS.toLowerCase() !== 'none' && (
                                            <div className="text-xs text-gray-300 mt-1">
                                              <span className="font-medium">Estimated:</span> ${event.estimatedEPS}
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        // Future earnings: Show expected EPS (or N/A)
                                        <div className="text-xs text-gray-200 mt-1">
                                          <span className="font-medium">Expected Earnings:</span>{' '}
                                          {event.estimatedEPS !== null && 
                                           event.estimatedEPS !== undefined && 
                                           event.estimatedEPS !== '' &&
                                           event.estimatedEPS !== 'None' &&
                                           event.estimatedEPS.toLowerCase() !== 'none' ? (
                                            `$${event.estimatedEPS}`
                                          ) : (
                                            <span className="text-gray-400">N/A</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        {earnings.length > 3 && (
                          <div className="text-xs text-gray-500 font-medium px-1.5 py-0.5 bg-gray-100 rounded flex items-center">
                            +{earnings.length - 3}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Empty cells for days after the last day of the month */}
                {Array.from({ length: (7 - ((startingDayOfWeek + daysInMonth) % 7)) % 7 }).map((_, index) => (
                  <div
                    key={`empty-end-${index}`}
                    className="min-h-[120px] border-b border-r border-gray-200 bg-gray-50"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Earnings Lookup Dialog */}
      <Dialog 
        open={earningsDialogOpen} 
        onOpenChange={(open) => {
          setEarningsDialogOpen(open)
          // Clear input form when dialog closes
          if (!open) {
            setTicker('')
            setSelectedTicker(null)
            setSuggestions([])
            setShowSuggestions(false)
            setEarningsLookupData(null)
            setIsInWatchlist(false)
            setIsAddingToWatchlist(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-[375px]">
          {lookupLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : earningsLookupData ? (
            <div className="space-y-4 py-4">
              <div>
                <div className="text-base font-semibold text-gray-900">
                  {earningsLookupData.companyName}
                </div>
                <div className="text-sm text-gray-500 mt-0.5">
                  {earningsLookupData.ticker}
                </div>
              </div>
              <div className="pt-4 border-t border-gray-200 space-y-3">
                <div>
                  <div className="text-sm font-medium text-gray-600 mb-1">
                    Next Earnings Date
                  </div>
                  <div className="text-base text-gray-900">
                    {formatDateForDisplay(earningsLookupData.nextEarningsDate)}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-600 mb-1">
                    Previous Earnings Date
                  </div>
                  <div className="text-base text-gray-900">
                    {formatDateForDisplay(earningsLookupData.previousEarningsDate)}
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-200">
                {isInWatchlist ? (
                  <div className="flex items-center gap-2 text-base text-gray-600">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Added to watchlist</span>
                  </div>
                ) : (
                  <Button
                    onClick={handleAddToWatchlist}
                    disabled={isAddingToWatchlist}
                    className="w-full flex items-center justify-center gap-2"
                    variant="outline"
                  >
                    {isAddingToWatchlist ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        Add to Watchlist
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">
              No earnings data available
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

