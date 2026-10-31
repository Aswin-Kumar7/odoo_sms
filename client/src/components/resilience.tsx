import { Component, useEffect, useSyncExternalStore, type ErrorInfo, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { outage } from '../lib/outage'

// ── Outage banner ─────────────────────────────────────────────────────────────
// Any request that fails because the server or database is unreachable (network error or
// 503) raises the banner (see api/client.ts). It then polls /health and, once the service
// is back, hides itself and refetches what is on screen. Mutations are never replayed.

export function OutageBanner() {
  const isDown = useSyncExternalStore(outage.subscribe, outage.get)
  const qc = useQueryClient()

  useEffect(() => {
    if (!isDown) return
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/health')
        if (res.ok) {
          outage.set(false)
          qc.invalidateQueries()
        }
      } catch {
        // still down; keep polling
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [isDown, qc])

  if (!isDown) return null
  return (
    <div role="status" className="no-print fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow">
      <Loader2 className="h-4 w-4 animate-spin" /> Service temporarily unavailable — retrying. Nothing you saved is lost.
    </div>
  )
}

// ── Error boundary ────────────────────────────────────────────────────────────

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">Something went wrong on this page</h1>
          <p className="mt-1 text-sm text-slate-500">Reloading usually fixes it. Your saved data is safe.</p>
          <button onClick={() => window.location.reload()} className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Reload
          </button>
        </div>
      </div>
    )
  }
}
