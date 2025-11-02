'use client'

import { useState, FormEvent, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Navbar } from '@/components/navbar'
import { ArrowUp, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CommandList, CommandItem } from '@/components/ui/command'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface TickerMatch {
  symbol: string
  name: string
  type: string
  region: string
  currency: string
  matchScore: string
}

interface ChartDataPoint {
  date: string
  price: number
  timestamp: number
}

interface EarningsMarker {
  date: string
  label: string
  price: number
  timestamp: number
  reportedEPS?: string
  estimatedEPS?: string
  surprise?: string
  surprisePercentage?: string
}

type TimePeriod = '1d' | '1w' | '1m' | '6m' | '1y' | '3y'

export default function ChartPage() {
  const [ticker, setTicker] = useState('')
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('6m')
  const [suggestions, setSuggestions] = useState<TickerMatch[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [earningsMarkers, setEarningsMarkers] = useState<EarningsMarker[]>([])
  const [loading, setLoading] = useState(false)
  const [hoveredEarningsDate, setHoveredEarningsDate] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [stockInfo, setStockInfo] = useState<{
    price: number | null
    changePercent: string | null
    date: string | null
  }>({ price: null, changePercent: null, date: null })
  const [hoveredPoint, setHoveredPoint] = useState<ChartDataPoint | null>(null)
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

  useEffect(() => {
    if (selectedTicker && timePeriod) {
      loadChartData()
    } else {
      setChartData([])
      setEarningsMarkers([])
      setStockInfo({ price: null, changePercent: null, date: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicker, timePeriod])

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
      setIsSearching(false)
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
    setCompanyName(match.name)
    setShowSuggestions(false)
    setSelectedIndex(-1)
    // Chart will load automatically via useEffect
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault()
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
    if (selectedTicker) {
      loadChartData()
    }
  }

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true)
    }
  }

  const loadChartData = async () => {
    if (!selectedTicker || !timePeriod) return

    setLoading(true)
    try {
      const [priceResponse, earningsResponse, quoteResponse] = await Promise.all([
        fetch(`/api/chart-data?ticker=${selectedTicker}&period=${timePeriod}`),
        fetch(`/api/earnings-dates?ticker=${selectedTicker}&period=${timePeriod}`),
        fetch(`/api/stock-quote?ticker=${selectedTicker}`),
      ])

      if (priceResponse.ok) {
        const priceData = await priceResponse.json()
        setChartData(priceData.data || [])
        
        // Get latest date from chart data
        if (priceData.data && priceData.data.length > 0) {
          const latestPoint = priceData.data[priceData.data.length - 1]
          const date = new Date(latestPoint.timestamp)
          const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
          const day = date.getDate()
          const month = date.toLocaleDateString('en-US', { month: 'short' })
          const year = date.getFullYear()
          const formattedDate = `${dayName} ${day} ${month} ${year}`
          
          setStockInfo(prev => ({ ...prev, date: formattedDate }))
        }
      }

      if (earningsResponse.ok) {
        const earningsData = await earningsResponse.json()
        setEarningsMarkers(earningsData.markers || [])
      }

      if (quoteResponse.ok) {
        const quoteData = await quoteResponse.json()
        if (quoteData.price !== null && quoteData.changePercent !== null) {
          setStockInfo(prev => ({
            ...prev,
            price: quoteData.price,
            changePercent: quoteData.changePercent,
          }))
        }
      }
    } catch (error) {
      console.error('Error loading chart data:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string, period: TimePeriod) => {
    const date = new Date(dateStr)
    const month = date.toLocaleDateString('en-US', { month: 'short' })
    const year = date.getFullYear()
    
    switch (period) {
      case '1d':
        // For 5-minute interval data, show time
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
        const day = date.getDate()
        const hour = date.getHours().toString().padStart(2, '0')
        const minute = date.getMinutes().toString().padStart(2, '0')
        // Check if this is intraday data (has time component)
        if (dateStr.includes('T') || dateStr.includes(' ')) {
          return `${dayName} ${day} ${month} ${hour}:${minute}`
        }
        return `${dayName} ${day} ${month} 12:00`
      case '1w':
        const dayW = date.getDate()
        return `${dayW} ${month} ${year}`
      case '1m':
        const dayM = date.getDate()
        return `${dayM} ${month} ${year}`
      case '6m':
      case '1y':
      case '3y':
        // Only show month and year for longer periods
        return `${month} ${year}`
      default:
        const dayNameD = date.toLocaleDateString('en-US', { weekday: 'short' })
        const dayD = date.getDate()
        return `${dayNameD} ${dayD} ${month} ${year}`
    }
  }

  // Generate explicit ticks for all periods to ensure labels appear evenly spaced and deduplicated
  // Also create a map of which ticks should show labels (deduplicating consecutive duplicates)
  const { xAxisTicks, tickVisibilityMap } = useMemo(() => {
    if (chartData.length === 0) return { xAxisTicks: undefined, tickVisibilityMap: new Map<string, boolean>() }
    
    // For 1w, 1m, 6m, 1y, 3y periods, generate explicit ticks at evenly spaced intervals
    if (timePeriod === '1w' || timePeriod === '1m' || timePeriod === '6m' || timePeriod === '1y' || timePeriod === '3y') {
      // Determine tick count based on period
      let tickCount: number
      if (timePeriod === '1w') {
        tickCount = 7 // One per day
      } else if (timePeriod === '1m') {
        tickCount = 10 // More ticks for 1-month to ensure even spacing
      } else if (timePeriod === '6m') {
        tickCount = 6
      } else if (timePeriod === '1y') {
        tickCount = 8
      } else {
        tickCount = 6 // 3y
      }
      
      const ticks: string[] = []
      
      if (chartData.length === 0) {
        return { xAxisTicks: undefined, tickVisibilityMap: new Map<string, boolean>() }
      }
      
      if (chartData.length === 1) {
        ticks.push(chartData[0].date)
      } else {
        // Generate evenly spaced ticks across the entire data range
        // Always include first and last, then space the rest evenly
        const targetTicks = Math.min(tickCount, chartData.length)
        
        // Use a simple approach: divide the data range into (targetTicks - 1) equal segments
        const step = (chartData.length - 1) / (targetTicks - 1)
        
        // Always add first point
        ticks.push(chartData[0].date)
        
        // Add evenly spaced intermediate points
        for (let i = 1; i < targetTicks - 1; i++) {
          const index = Math.round(i * step)
          const safeIndex = Math.min(Math.max(index, 1), chartData.length - 2) // Ensure we're not at edges
          ticks.push(chartData[safeIndex].date)
        }
        
        // Always add last point
        ticks.push(chartData[chartData.length - 1].date)
        
        // Remove duplicates while preserving order
        const uniqueTicks: string[] = []
        const seen = new Set<string>()
        for (const tick of ticks) {
          if (!seen.has(tick)) {
            seen.add(tick)
            uniqueTicks.push(tick)
          }
        }
        
        ticks.splice(0, ticks.length, ...uniqueTicks)
      }
      
      // Create visibility map - only show rightmost of consecutive duplicates
      const visibilityMap = new Map<string, boolean>()
      let lastFormatted = ''
      
      for (let i = ticks.length - 1; i >= 0; i--) {
        const tick = ticks[i]
        const formatted = formatDate(tick, timePeriod)
        
        if (formatted !== lastFormatted) {
          visibilityMap.set(tick, true)
          lastFormatted = formatted
        } else {
          visibilityMap.set(tick, false)
        }
      }
      
      return { 
        xAxisTicks: ticks.length > 0 ? ticks : undefined, 
        tickVisibilityMap: visibilityMap 
      }
    }
    
    return { xAxisTicks: undefined, tickVisibilityMap: new Map<string, boolean>() }
  }, [chartData, timePeriod])

  // Custom tick formatter that deduplicates consecutive duplicate labels
  const formatDateWithDedup = useCallback((value: string) => {
    const formatted = formatDate(value, timePeriod)
    
    // For periods with explicit ticks (1w, 1m, 6m, 1y, 3y), use the visibility map
    if (timePeriod === '1w' || timePeriod === '1m' || timePeriod === '6m' || timePeriod === '1y' || timePeriod === '3y') {
      const shouldShow = tickVisibilityMap.get(value) !== false
      if (!shouldShow) {
        return ''
      }
      return formatted
    }
    
    // For 1d period with auto-generated ticks, return formatted as-is (no deduplication needed for 5-min intervals)
    return formatted
  }, [timePeriod, tickVisibilityMap])

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      
      // Update hovered point when tooltip is active
      if (data && data.price !== undefined && data.timestamp !== undefined) {
        setHoveredPoint(data as ChartDataPoint)
      }
      
      const date = new Date(data.timestamp)
      const price = payload[0].value.toFixed(2)
      
      // Format date similar to Google Finance: "190.90 USD Mon 27 Oct 12:00"
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
      const day = date.getDate()
      const month = date.toLocaleDateString('en-US', { month: 'short' })
      
      // Get actual time from the date (for hourly data)
      const hour = date.getHours().toString().padStart(2, '0')
      const minute = date.getMinutes().toString().padStart(2, '0')
      const timeStr = `${hour}:${minute}`
      
      const formattedDate = `${dayName} ${day} ${month} ${timeStr}`
      
      // Check if this is an earnings date - show earnings info when hovering over earnings points
      const earningsMarker = earningsMarkers.find((m) => {
        const markerDate = new Date(m.date).getTime()
        const pointDate = new Date(data.date).getTime()
        return Math.abs(markerDate - pointDate) < 86400000 // Within 1 day
      })
      
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-base">{`${price} USD`}</p>
          <p className="text-sm text-gray-600 mt-1">{formattedDate}</p>
          {earningsMarker && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="font-semibold text-sm mb-2">{earningsMarker.label}</p>
              {earningsMarker.reportedEPS && (
                <p className="text-xs text-gray-600">Reported EPS: {earningsMarker.reportedEPS}</p>
              )}
              {earningsMarker.estimatedEPS && (
                <p className="text-xs text-gray-600">Expected EPS: {earningsMarker.estimatedEPS}</p>
              )}
              {earningsMarker.surprise && (
                <p className="text-xs text-gray-600">Surprise: {earningsMarker.surprise}</p>
              )}
              {earningsMarker.surprisePercentage && (
                <p className="text-xs text-gray-600">
                  Surprise %: {(() => {
                    const percentage = parseFloat(earningsMarker.surprisePercentage)
                    if (isNaN(percentage)) return earningsMarker.surprisePercentage + '%'
                    return (Math.ceil(percentage * 100) / 100).toFixed(2) + '%'
                  })()}
                </p>
              )}
            </div>
          )}
        </div>
      )
    } else {
      // Reset hovered point when tooltip is not active
      setHoveredPoint(null)
    }
    return null
  }

  // Find matching chart data points for earnings markers
  const earningsDataPoints = earningsMarkers.map((marker) => {
    // For intraday data (1d, 1w), we need to find points on the same day
    // For daily data (1m, 6m, 1y, 3y), we can match by exact date
    const markerDateStr = marker.date.split('T')[0] // Get just the date part
    const markerDate = new Date(markerDateStr)
    
    let closestPoint: ChartDataPoint | null = null
    let closestDiff = Infinity
    
    for (const point of chartData) {
      const pointDateStr = point.date.includes('T') 
        ? point.date.split('T')[0] 
        : point.date.split(' ')[0] // Handle both "2025-01-15T10:30:00" and "2025-01-15 10:30:00"
      const pointDate = new Date(pointDateStr)
      const pointTimestamp = new Date(point.date).getTime()
      const markerTimestamp = marker.timestamp
      
      // For intraday periods, check if same day; for daily periods, check within range
      const sameDay = pointDateStr === markerDateStr
      // Expand range for all periods to ensure we catch recent earnings
      const withinRange = Math.abs(pointTimestamp - markerTimestamp) < 86400000 * 7 // Within 7 days
      
      // For intraday (1d, 1w), match same day OR very close (within 1 day for recent earnings)
      // For daily periods, match same day OR within 7 days
      const isIntraday = timePeriod === '1d' || timePeriod === '1w'
      const withinOneDay = Math.abs(pointTimestamp - markerTimestamp) < 86400000
      
      if (sameDay || (isIntraday && withinOneDay) || (!isIntraday && withinRange)) {
        const diff = Math.abs(pointTimestamp - markerTimestamp)
        if (diff < closestDiff) {
          closestDiff = diff
          closestPoint = point
        }
      }
    }
    
    return closestPoint ? {
      ...closestPoint,
      earningsLabel: marker.label,
      earningsMarker: marker,
    } : null
  }).filter(Boolean) as any[]

  const CustomDot = ({ cx, cy, payload }: any) => {
    // Check if this point has earnings - only show dot for earnings dates
    const hasEarnings = earningsDataPoints.some(
      (ep: any) => ep.date === payload.date
    )
    if (hasEarnings) {
      const earningsPoint = earningsDataPoints.find(
        (ep: any) => ep.date === payload.date
      )
      const isHovered = hoveredEarningsDate === payload.date
      
      return (
        <g>
          <circle 
            cx={cx} 
            cy={cy} 
            r={6} 
            fill="#2563eb" 
            stroke="#2563eb" 
            strokeWidth={2}
            onMouseEnter={() => setHoveredEarningsDate(payload.date)}
            onMouseLeave={() => setHoveredEarningsDate(null)}
            style={{ cursor: 'pointer' }}
          />
        </g>
      )
    }
    // Return null for non-earnings points - no dot will show
    return null
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-12">
        <div className="w-full max-w-5xl">
          <div className="flex justify-between items-start mb-6 gap-4">
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
                  disabled={!selectedTicker}
                >
                  <ArrowUp className="h-5 w-5" />
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
            <div className="flex items-center gap-2">
              {(['1d', '1w', '1m', '6m', '1y', '3y'] as TimePeriod[]).map((period) => {
                const labels: Record<TimePeriod, string> = {
                  '1d': '1D',
                  '1w': '1W',
                  '1m': '1M',
                  '6m': '6M',
                  '1y': '1Y',
                  '3y': '3Y',
                }
                const isSelected = timePeriod === period
                return (
                  <Button
                    key={period}
                    type="button"
                    onClick={() => setTimePeriod(period)}
                    className={`
                      px-4 py-2 rounded-md text-sm font-medium transition-colors border
                      ${isSelected 
                        ? 'bg-gray-200 text-gray-700 border-gray-300 hover:bg-gray-200' 
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }
                    `}
                  >
                    {labels[period]}
                  </Button>
                )
                  })}
                </div>
              </div>

              {/* Stock Info Card */}
              {selectedTicker && chartData.length > 0 && (
                <div className="mb-6">
                  <div className="bg-white rounded-lg p-6">
                    {(() => {
                      // Use hovered point if available, otherwise use latest point
                      const activePoint = hoveredPoint || chartData[chartData.length - 1]
                      const firstPoint = chartData[0]
                      const changePercent = firstPoint && activePoint 
                        ? (((activePoint.price - firstPoint.price) / firstPoint.price) * 100).toFixed(2)
                        : null
                      
                      const date = new Date(activePoint.timestamp)
                      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
                      const day = date.getDate()
                      const month = date.toLocaleDateString('en-US', { month: 'short' })
                      const year = date.getFullYear()
                      const formattedDate = `${dayName} ${day} ${month} ${year}`
                      
                      return (
                        <>
                          <div className="flex items-baseline gap-2 mb-3">
                            <span className="text-xl font-bold text-gray-900">{selectedTicker}</span>
                            <span className="text-sm text-gray-600">{companyName || selectedTicker}</span>
                          </div>
                          <div className="flex items-baseline gap-3 mb-2">
                            <div className="flex items-baseline gap-2">
                              <span className="text-3xl font-bold text-gray-900">
                                ${activePoint.price.toFixed(2)}
                              </span>
                              <span className="text-base text-gray-600">USD</span>
                            </div>
                            {changePercent && (
                              <span
                                className={`text-base font-medium ${
                                  parseFloat(changePercent) >= 0
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {parseFloat(changePercent) >= 0 ? '+' : ''}
                                {changePercent}%
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">{formattedDate}</div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}

              <div className="w-full h-[500px]">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-gray-400">Enter a stock ticker and select a time period to view the chart</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    data={chartData} 
                    margin={{ top: 20, right: 40, left: 50, bottom: 100 }}
                    onMouseMove={(state: any) => {
                      if (state && state.activePayload && state.activePayload.length > 0) {
                        const activePoint = state.activePayload[0].payload as ChartDataPoint
                        if (activePoint && activePoint.price !== undefined && activePoint.timestamp !== undefined) {
                          setHoveredPoint(activePoint)
                        }
                      }
                    }}
                    onMouseLeave={() => setHoveredPoint(null)}
                  >
                    <CartesianGrid 
                      stroke="#e5e7eb" 
                      strokeOpacity={0.5}
                      horizontal={true}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateWithDedup}
                      ticks={xAxisTicks}
                      stroke="#9ca3af"
                      style={{ fontSize: '12px', fontWeight: '400' }}
                      tick={{ fill: '#6b7280' }}
                      axisLine={{ stroke: '#e5e7eb' }}
                      tickLine={false}
                      interval={xAxisTicks ? 0 : 'preserveStartEnd'}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tickFormatter={(value, index, ticks) => {
                        // Hide the first (bottom) tick label
                        if (index === 0) return ''
                        return Math.round(value).toString()
                      }}
                      stroke="#9ca3af"
                      style={{ fontSize: '12px', fontWeight: '400' }}
                      tick={{ fill: '#6b7280' }}
                      axisLine={{ stroke: '#e5e7eb' }}
                      width={50}
                      orientation="left"
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={<CustomDot />}
                      activeDot={{ r: 6, fill: '#2563eb' }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
          </div>
        </div>
      </main>
    </div>
  )
}

