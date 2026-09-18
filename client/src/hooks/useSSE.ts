import { useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

interface SSEOptions {
  onMessage?: (data: { type: string; path?: string }) => void
  onError?: (error: Event) => void
  enabled?: boolean
}

export function useSSE(options: SSEOptions = {}) {
  const { onMessage, onError, enabled = true } = options
  const queryClient = useQueryClient()

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)

        // Invalidate relevant queries based on file change type
        if (data.type === 'usage') {
          queryClient.invalidateQueries({ queryKey: ['usage'] })
          queryClient.invalidateQueries({ queryKey: ['stats'] })
        } else if (data.type === 'plans') {
          queryClient.invalidateQueries({ queryKey: ['plans'] })
        } else if (data.type === 'tasks') {
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
        } else if (data.type === 'todos') {
          queryClient.invalidateQueries({ queryKey: ['todos'] })
        } else if (data.type === 'memory') {
          queryClient.invalidateQueries({ queryKey: ['memory'] })
        } else if (data.type === 'subagents') {
          queryClient.invalidateQueries({ queryKey: ['subagents'] })
        } else if (data.type === 'sessions') {
          queryClient.invalidateQueries({ queryKey: ['sessions'] })
          queryClient.invalidateQueries({ queryKey: ['session'] })
          queryClient.invalidateQueries({ queryKey: ['projects'] })
          queryClient.invalidateQueries({ queryKey: ['project'] })
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

    eventSource.onmessage = handleMessage
    eventSource.onerror = (e) => {
      console.error('SSE error:', e)
      onError?.(e)
    }

    // Page teardown aborts an open connection, which fires a spurious error
    // event in the dying page; closing first keeps onerror for real failures.
    // A bfcache freeze (persisted) must keep the stream, or a restored page
    // would never reconnect because the effect does not re-run.
    const handlePageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) eventSource.close()
    }
    window.addEventListener('pagehide', handlePageHide as EventListener)

    return () => {
      window.removeEventListener('pagehide', handlePageHide as EventListener)
      eventSource.close()
    }
  }, [enabled, handleMessage, onError])
}
