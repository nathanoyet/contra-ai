'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface EarningsEvent {
  ticker: string
  companyName: string
  reportDate: string
  fiscalDateEnding: string | null
  label: string
}

interface EarningsByDate {
  [date: string]: EarningsEvent[]
}

export default function CalendarPage() {
  const router = useRouter()
  const supabase = createClient()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [earningsByDate, setEarningsByDate] = useState<EarningsByDate>({})
  const [loading, setLoading] = useState(true)
  const [logoCache, setLogoCache] = useState<Record<string, string>>({})

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
  }, [])

  const loadEarningsData = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/calendar/earnings')
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
      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-12">
        <div className="w-full max-w-6xl">
          {/* Calendar Header */}
          <div className="flex items-center justify-center mb-8">
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
              <div className="text-gray-400">Loading earnings calendar...</div>
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
                          return (
                            <div
                              key={`${event.ticker}-${eventIndex}`}
                              className="relative group"
                              title={`${event.companyName} (${event.ticker}) - ${event.label}`}
                            >
                              <div className="relative w-12 h-12 rounded border border-gray-200 bg-white hover:border-blue-400 transition-colors flex items-center justify-center overflow-hidden">
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
                              {/* Tooltip */}
                              <div className="absolute z-10 bottom-full left-1/2 transform -translate-x-1/2 mb-1 hidden group-hover:block pointer-events-none">
                                <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg">
                                  {event.companyName} ({event.ticker})
                                  <br />
                                  {event.label}
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
    </div>
  )
}

