import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

interface SSEOptions {
  onMessage?: (data: { type: string; path?: string }) => void
  onError?: (error: Event) => void
  enabled?: boolean
}

export function useSSE(options: SSEOptions = {}) {
  const { onMessage, onError, enabled = true } = options
  const eventSourceRef = useRef<EventSource | null>(null)
  const queryClient = useQueryClient()

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)

        // Invalidate relevant queries based on file change type
        if (data.type === 'plans') {
          queryClient.invalidateQueries({ queryKey: ['plans'] })
        } else if (data.type === 'tasks') {
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
        } else if (data.type === 'todos') {
          queryClient.invalidateQueries({ queryKey: ['todos'] })
        } else if (data.type === 'stats') {
          queryClient.invalidateQueries({ queryKey: ['stats'] })
        } else if (data.type === 'sessions') {
          queryClient.invalidateQueries({ queryKey: ['sessions'] })
          queryClient.invalidateQueries({ queryKey: ['projects'] })
        }

        onMessage?.(data)
      } catch (e) {
        console.error('Failed to parse SSE message:', e)
      }
    },
    [queryClient, onMessage]
  )

  useEffect(() => {
    if (!enabled) return

    const eventSource = new EventSource('/api/events')
    eventSourceRef.current = eventSource

    eventSource.onmessage = handleMessage
    eventSource.onerror = (e) => {
      console.error('SSE error:', e)
      onError?.(e)
    }

    return () => {
      eventSource.close()
      eventSourceRef.current = null
    }
  }, [enabled, handleMessage, onError])

  return {
    isConnected: !!eventSourceRef.current,
  }
}
