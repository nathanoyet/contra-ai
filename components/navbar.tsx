'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()
  }, [supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === '/' && !pathname.startsWith('/insights/')
    }
    return pathname === path || pathname.startsWith(path + '/')
  }

  return (
    <nav className="w-full fixed top-0 left-0 right-0 bg-white z-50 border-b">
      <div className="container mx-auto flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.png"
            alt="Contra AI"
            width={60}
            height={20}
            className="h-5 w-auto"
            priority
          />
        </Link>
        <div className="flex items-center gap-6">
          <Link 
            href="/" 
            className={`px-3 py-2 rounded-md transition-colors ${
              isActive('/') ? 'bg-gray-100' : 'hover:bg-gray-100'
            }`}
          >
            Insights
          </Link>
          <Link 
            href="/calendar" 
            className={`px-3 py-2 rounded-md transition-colors ${
              isActive('/calendar') ? 'bg-gray-100' : 'hover:bg-gray-100'
            }`}
          >
            Calendar
          </Link>
          <Link 
            href="/chart" 
            className={`px-3 py-2 rounded-md transition-colors ${
              isActive('/chart') ? 'bg-gray-100' : 'hover:bg-gray-100'
            }`}
          >
            Chart
          </Link>
          <Link 
            href="/watchlist" 
            className={`px-3 py-2 rounded-md transition-colors ${
              isActive('/watchlist') ? 'bg-gray-100' : 'hover:bg-gray-100'
            }`}
          >
            Watchlist
          </Link>
          {user ? (
            <button
              onClick={handleSignOut}
              className={`px-3 py-2 rounded-md transition-colors ${
                false ? 'bg-gray-100' : 'hover:bg-gray-100'
              }`}
            >
              Sign Out
            </button>
          ) : (
            <Link href="/login">
              <span className={`px-3 py-2 rounded-md transition-colors inline-block ${
                isActive('/login') ? 'bg-gray-100' : 'hover:bg-gray-100'
              }`}>
                Sign In
              </span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}

