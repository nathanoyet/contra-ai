import { NextRequest, NextResponse } from 'next/server'
import { getStatus } from '@/lib/status-store'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const requestId = searchParams.get('requestId')

  if (!requestId) {
    return NextResponse.json({ error: 'Missing requestId' }, { status: 400 })
  }

  const status = getStatus(requestId) || ''
  return NextResponse.json({ status })
}

