import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'

export type Role = 'ADMIN' | 'STAFF' | 'CUSTOMER'

export interface User {
  id: number
  email: string
  name: string
  role: Role
  customerId: number | null
}

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  signup: (input: { name: string; company?: string; email: string; password: string }) => Promise<User>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)
const ME_KEY = ['auth', 'me']

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()

  // The session lives in an httpOnly cookie; /auth/me tells us who it belongs to.
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>('/auth/me')).user
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  // Switch the session user, then drop every other cached query so no data from the
  // previous session can be shown. The 'me' query itself is updated, not removed:
  // removing it would put the provider back into "loading" and unmount the current page.
  const setSessionUser = useCallback(
    (user: User | null) => {
      qc.setQueryData(ME_KEY, user)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] })
    },
    [qc],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const { user } = await api.post<{ user: User }>('/auth/login', { email, password })
      setSessionUser(user)
      return user
    },
    [setSessionUser],
  )

  const signup = useCallback(
    async (input: { name: string; company?: string; email: string; password: string }) => {
      const { user } = await api.post<{ user: User }>('/auth/signup', input)
      setSessionUser(user)
      return user
    },
    [setSessionUser],
  )

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined)
    setSessionUser(null)
  }, [setSessionUser])

  return (
    <AuthContext.Provider value={{ user: me.data ?? null, loading: me.isLoading, login, signup, logout }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/** UI convenience only — the API enforces the same rule on every write. */
export function useIsAdmin() {
  return useAuth().user?.role === 'ADMIN'
}

/** Where each role lands after signing in. */
export const homeFor = (role: Role) => (role === 'CUSTOMER' ? '/portal' : '/dashboard')
