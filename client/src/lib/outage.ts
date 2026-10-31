// Tiny store for "the server or database is unreachable". The API client raises it on the
// first failed request; the outage banner clears it once /health answers again.
let down = false
const listeners = new Set<() => void>()

export const outage = {
  get: () => down,
  set(value: boolean) {
    if (down === value) return
    down = value
    listeners.forEach((l) => l())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
