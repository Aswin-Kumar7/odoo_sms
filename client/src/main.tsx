import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { ApiError } from './api/client'
import { AuthProvider } from './auth/AuthContext'
import { ErrorBoundary, OutageBanner } from './components/resilience'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnWindowFocus: false,
      // Retry reads on network/5xx errors only; never retry 4xx (auth, validation, not found).
      retry: (count, error) => count < 3 && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500),
    },
    // Mutations are never retried automatically: a retried payment or transition could duplicate a side effect.
    mutations: { retry: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ErrorBoundary>
        <OutageBanner />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
