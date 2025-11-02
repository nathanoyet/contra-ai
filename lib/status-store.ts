// Shared in-memory store for status updates
// In production, use Redis or a similar distributed cache
const statusStore = new Map<string, string>()

export function setStatus(requestId: string, status: string): void {
  statusStore.set(requestId, status)
}

export function getStatus(requestId: string): string | undefined {
  return statusStore.get(requestId)
}

export function deleteStatus(requestId: string): void {
  statusStore.delete(requestId)
}

