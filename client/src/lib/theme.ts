import { useSyncExternalStore } from 'react'

// Light, dark or follow the system. The choice is remembered per browser; index.html applies
// it before the first paint so pages never flash the wrong theme.
export type ThemePreference = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

const KEY = 'bl-theme'
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
const listeners = new Set<() => void>()

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let preference = readPreference()

const resolve = (p: ThemePreference): Theme => (p === 'system' ? (media?.matches ? 'dark' : 'light') : p)

function apply() {
  document.documentElement.classList.toggle('dark', resolve(preference) === 'dark')
  listeners.forEach((l) => l())
}

media?.addEventListener('change', () => preference === 'system' && apply())

export function setThemePreference(p: ThemePreference) {
  preference = p
  try {
    if (p === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, p)
  } catch {
    // storage unavailable (private mode): the choice lasts for this page only
  }
  apply()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useTheme() {
  const pref = useSyncExternalStore(subscribe, () => preference)
  return { preference: pref, theme: resolve(pref) }
}
