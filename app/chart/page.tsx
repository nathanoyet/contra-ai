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
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [earningsMarkers, setEarningsMarkers] = useState<EarningsMarker[]>([])
  const [loading, setLoading] = useState(false)
  const [hoveredEarningsDate, setHoveredEarningsDate] = useState<string | null>(null)
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
      return
    }

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
      const [priceResponse, earningsResponse] = await Promise.all([
        fetch(`/api/chart-data?ticker=${selectedTicker}&period=${timePeriod}`),
        fetch(`/api/earnings-dates?ticker=${selectedTicker}&period=${timePeriod}`),
      ])

      if (priceResponse.ok) {
        const priceData = await priceResponse.json()
        setChartData(priceData.data || [])
      }

      if (earningsResponse.ok) {
        const earningsData = await earningsResponse.json()
        setEarningsMarkers(earningsData.markers || [])
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
        tickCount = 8
      } else if (timePeriod === '6m') {
        tickCount = 6
      } else if (timePeriod === '1y') {
        tickCount = 8
      } else {
        tickCount = 6 // 3y
      }
      const ticks: string[] = []
      
      // Always include first
      ticks.push(chartData[0].date)
      
      // Calculate evenly spaced intervals
      // We want tickCount ticks total, so we need (tickCount - 2) intermediate ticks
      // (excluding first and last)
      if (chartData.length > 1) {
        const totalTicks = tickCount
        const intermediateTicks = totalTicks - 2 // Excluding first and last
        const interval = intermediateTicks > 0 
          ? Math.floor((chartData.length - 1) / (intermediateTicks + 1))
          : chartData.length - 1
        
        // Add evenly spaced intermediate ticks
        for (let i = interval; i < chartData.length - 1; i += interval) {
          if (ticks.length < totalTicks - 1) { // Leave room for last tick
            ticks.push(chartData[i].date)
          }
        }
        
        // Always include last
        ticks.push(chartData[chartData.length - 1].date)
        
        // Ensure we have exactly the desired number of ticks by adjusting if needed
        if (ticks.length < tickCount && chartData.length >= tickCount) {
          // If we have fewer ticks than desired, add more evenly spaced ones
          const additionalInterval = Math.floor(chartData.length / tickCount)
          const additionalTicks: string[] = [chartData[0].date]
          
          for (let i = additionalInterval; i < chartData.length; i += additionalInterval) {
            if (additionalTicks.length < tickCount) {
              additionalTicks.push(chartData[i].date)
            }
          }
          
          // Ensure last is included
          if (!additionalTicks.includes(chartData[chartData.length - 1].date)) {
            additionalTicks[additionalTicks.length - 1] = chartData[chartData.length - 1].date
          }
          
          ticks.splice(0, ticks.length, ...additionalTicks.slice(0, tickCount))
        } else if (ticks.length > tickCount) {
          // If we have more ticks, select evenly spaced subset
          const filtered: string[] = [ticks[0]] // First
          
          const step = Math.floor((ticks.length - 2) / (tickCount - 2))
          for (let i = step; i < ticks.length - 1; i += step) {
            if (filtered.length < tickCount - 1) {
              filtered.push(ticks[i])
            }
          }
          
          filtered.push(ticks[ticks.length - 1]) // Last
          ticks.splice(0, ticks.length, ...filtered)
        }
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
                <p className="text-xs text-gray-600">Surprise %: {earningsMarker.surprisePercentage}%</p>
              )}
            </div>
          )}
        </div>
      )
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
      const withinRange = Math.abs(pointTimestamp - markerTimestamp) < 86400000 * 3 // Within 3 days
      
      if (sameDay || (timePeriod !== '1d' && timePeriod !== '1w' && withinRange)) {
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
          {earningsPoint?.earningsLabel && isHovered && (
            <text
              x={cx}
              y={cy - 18}
              textAnchor="middle"
              fontSize="11"
              fill="#2563eb"
              fontWeight="600"
              className="pointer-events-none"
            >
              {earningsPoint.earningsLabel}
            </text>
          )}
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
                      px-4 py-2 rounded-md text-sm font-medium transition-colors
                      ${isSelected 
                        ? 'bg-gray-900 text-white' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }
                    `}
                  >
                    {labels[period]}
                  </Button>
                )
              })}
            </div>
          </div>

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
                  <LineChart data={chartData} margin={{ top: 20, right: 20, left: 50, bottom: 80 }}>
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
                      tickFormatter={(value) => Math.round(value).toString()}
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

