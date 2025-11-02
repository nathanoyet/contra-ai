'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { CommandList, CommandItem } from '@/components/ui/command'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface TickerMatch {
  symbol: string
  name: string
  type: string
  region: string
  currency: string
  matchScore: string
}

interface WatchlistItem {
  id: string
  ticker: string
  company_name: string
  created_at: string
}

interface WatchlistData {
  ticker: string
  companyName: string
  price: number | null
  changePercent: string | null
  nextEarningsDate: string | null
  nextEarningsLabel: string | null
}

export default function WatchlistPage() {
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [watchlistData, setWatchlistData] = useState<WatchlistData[]>([])
  const [loading, setLoading] = useState(true)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [stockToDelete, setStockToDelete] = useState<string | null>(null)
  const [ticker, setTicker] = useState('')
  const [suggestions, setSuggestions] = useState<TickerMatch[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isAdding, setIsAdding] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
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
    loadWatchlist()
  }, [])

  useEffect(() => {
    if (watchlist.length > 0) {
      loadWatchlistData()
    } else {
      setWatchlistData([])
    }
  }, [watchlist])

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

  const loadWatchlist = async () => {
    try {
      const response = await fetch('/api/watchlist')
      if (response.ok) {
        const data = await response.json()
        setWatchlist(data.watchlist || [])
      }
    } catch (error) {
      console.error('Error loading watchlist:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadWatchlistData = async () => {
    try {
      const response = await fetch('/api/watchlist/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchlist }),
      })
      if (response.ok) {
        const data = await response.json()
        setWatchlistData(data.data || [])
      }
    } catch (error) {
      console.error('Error loading watchlist data:', error)
    }
  }

  const searchTickers = useCallback(async (keywords: string) => {
    if (!keywords.trim()) {
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
        setShowSuggestions(true)
      }
    } catch (error) {
      console.error('Error searching tickers:', error)
      setSuggestions([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setTicker(value)
    setSelectedTicker(null)
    setSelectedIndex(-1)

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
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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

  const handleAddStock = async () => {
    if (!selectedTicker) return

    // Check if stock is already in watchlist
    const existingStock = watchlist.find(item => item.ticker.toUpperCase() === selectedTicker.toUpperCase())
    if (existingStock) {
      setAddDialogOpen(false)
      setTicker('')
      setSelectedTicker(null)
      setSuggestions([])
      toast({
        title: "Stock already in watchlist",
        description: `${selectedTicker.toUpperCase()} is already in your watchlist`,
      })
      return
    }

    const match = suggestions.find(m => m.symbol === selectedTicker)
    if (!match) return

    setIsAdding(true)
    try {
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: selectedTicker,
          companyName: match.name,
        }),
      })

      if (response.ok) {
        setAddDialogOpen(false)
        setTicker('')
        setSelectedTicker(null)
        setSuggestions([])
        await loadWatchlist()
      } else {
        const error = await response.json()
        toast({
          title: "Error",
          description: error.error || 'Failed to add stock',
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error adding stock:', error)
      toast({
        title: "Error",
        description: 'Failed to add stock',
        variant: "destructive",
      })
    } finally {
      setIsAdding(false)
    }
  }

  const handleDeleteClick = (ticker: string) => {
    setStockToDelete(ticker)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!stockToDelete) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/watchlist?ticker=${stockToDelete}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setDeleteDialogOpen(false)
        setStockToDelete(null)
        await loadWatchlist()
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to remove stock')
      }
    } catch (error) {
      console.error('Error deleting stock:', error)
      alert('Failed to remove stock')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true)
    }
  }

  const getDataForTicker = (ticker: string): WatchlistData | null => {
    return watchlistData.find(d => d.ticker === ticker) || null
  }

  const formatEarningsDate = (dateStr: string | null, label: string | null): string => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    // Format as "29 Dec 2025"
    const day = date.getDate()
    const month = date.toLocaleDateString('en-US', { month: 'short' })
    const year = date.getFullYear()
    const formattedDate = `${day} ${month} ${year}`
    return label ? `${formattedDate} (${label})` : formattedDate
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center px-6 pt-[216px] pb-12">
        <div className="w-full max-w-6xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-medium">Earnings Watchlist</h2>
            <Button
              onClick={() => setAddDialogOpen(true)}
              variant="outline"
              className="flex items-center gap-2 bg-white border-gray-300 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
              Add Stock
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden relative">
            <Table className={`text-base ${watchlist.length === 0 ? "[&_td]:border-r-0 [&_th]:border-r-0" : ""}`} style={watchlist.length === 0 ? { borderCollapse: 'separate', borderSpacing: 0 } : undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead style={watchlist.length === 0 ? { borderRight: 'none' } : undefined}>Company</TableHead>
                  <TableHead className="text-center" style={watchlist.length === 0 ? { borderRight: 'none' } : undefined}>Ticker</TableHead>
                  <TableHead className="text-center" style={watchlist.length === 0 ? { borderRight: 'none' } : undefined}>Price</TableHead>
                  <TableHead className="text-center" style={watchlist.length === 0 ? { borderRight: 'none' } : undefined}>Change %</TableHead>
                  <TableHead className="text-center" style={watchlist.length === 0 ? { borderRight: 'none' } : undefined}>Next Earnings</TableHead>
                  <TableHead className="w-[6.25%]" style={watchlist.length === 0 ? { borderRight: 'none' } : undefined}></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {watchlist.length === 0 ? (
                  <>
                    {[...Array(4)].map((_, index) => (
                      <TableRow key={`empty-${index}`} className="bg-gray-50">
                        <TableCell style={{ borderRight: 'none' }}></TableCell>
                        <TableCell className="text-center" style={{ borderRight: 'none' }}></TableCell>
                        <TableCell className="text-center" style={{ borderRight: 'none' }}></TableCell>
                        <TableCell className="text-center" style={{ borderRight: 'none' }}></TableCell>
                        <TableCell className="text-center" style={{ borderRight: 'none' }}></TableCell>
                        <TableCell className="w-[6.25%]" style={{ borderRight: 'none' }}></TableCell>
                      </TableRow>
                    ))}
                  </>
                ) : (
                  watchlist.map((item) => {
                    const data = getDataForTicker(item.ticker)
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.company_name}
                        </TableCell>
                        <TableCell className="text-center">{item.ticker}</TableCell>
                        <TableCell className="text-center">
                          {data?.price !== null && data?.price !== undefined ? (
                            `$${data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          ) : (
                            <div className="flex justify-center">
                              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {data?.changePercent !== null && data?.changePercent !== undefined ? (
                            (() => {
                              // Parse the percentage value (e.g., "1.25%" or "-2.50%")
                              const changeValue = parseFloat(data.changePercent.replace('%', ''))
                              // Round down to 2 decimal places
                              const roundedDown = Math.floor(Math.abs(changeValue) * 100) / 100
                              const formatted = roundedDown.toFixed(2)
                              const isPositive = changeValue >= 0
                              return (
                                <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
                                  {isPositive ? '+' : '-'}{formatted}%
                                </span>
                              )
                            })()
                          ) : data?.price !== null && data?.price !== undefined ? (
                            'N/A'
                          ) : (
                            <div className="flex justify-center">
                              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {data?.nextEarningsDate
                            ? formatEarningsDate(data.nextEarningsDate, data.nextEarningsLabel)
                            : 'N/A'}
                        </TableCell>
                        <TableCell className="w-[6.25%]">
                          <button
                            onClick={() => handleDeleteClick(item.ticker)}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
            {/* Overlay text for empty watchlist */}
            {watchlist.length === 0 && (
              <div 
                className="absolute left-0 right-0 flex items-center justify-center pointer-events-none bg-gray-50/0"
                style={{ 
                  top: '48px', // Header height
                  bottom: 0,
                }}
              >
                <p className="text-gray-400">
                  Add stocks to watchlist
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add Stock Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Stock to Watchlist</DialogTitle>
            <DialogDescription>
              Enter a stock ticker or company name to add to your watchlist
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="relative" ref={suggestionsRef}>
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
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setAddDialogOpen(false)
                  setTicker('')
                  setSelectedTicker(null)
                  setSuggestions([])
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddStock}
                disabled={!selectedTicker || isAdding}
              >
                {isAdding ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Stock'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Remove Stock</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {stockToDelete} from your watchlist?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false)
                setStockToDelete(null)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              variant="destructive"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

