import { useEffect, useRef } from 'react'
import { useTheme } from '../lib/theme'

// The billing loop drawn in the product's own material: amounts and currency marks. It is the
// Brightloop mark at hero scale — an open ring with the "now" point sitting in its gap — set
// as a ledger of digits. Brightness picks the glyph; a few cells change slowly so it feels kept.

const GLYPHS = ' ..::-1774008%₹'
const CELL = 11

interface Palette {
  ink: string // the ring itself
  faint: string // the ledger behind it
  dot: string // the "now" point
}

const PALETTES: Record<'light' | 'dark', Palette> = {
  light: { ink: '#5c3d54', faint: '#b3aba1', dot: '#714b67' },
  dark: { ink: '#d9b8cf', faint: '#4a4740', dot: '#e9cfe0' },
}

function brightness(x: number, y: number, w: number, h: number) {
  const cx = w * 0.56
  const cy = h * 0.5
  const R = Math.min(w, h) * 0.32
  const dx = x - cx
  const dy = y - cy
  const d = Math.hypot(dx, dy)
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI // -180..180, negative is up
  // The gap at the top right, as in the logo.
  const inGap = angle > -78 && angle < -22
  const ring = inGap ? 0 : Math.exp(-((d - R) ** 2) / (2 * (R * 0.055) ** 2))
  // The point that marks "now", sitting in the gap.
  const pa = (-50 * Math.PI) / 180
  const pd = Math.hypot(x - (cx + R * Math.cos(pa)), y - (cy + R * Math.sin(pa)))
  const dot = 1.25 * Math.exp(-(pd ** 2) / (2 * (R * 0.085) ** 2))
  // Faint concentric periods behind it, like ruled lines of a ledger turned into a cycle.
  const echo = 0.16 * Math.max(0, Math.cos(((d - R) / (R * 0.16)) * Math.PI)) * Math.exp(-Math.abs(d - R) / (R * 0.9))
  return { ring, dot, echo }
}

export function LoopArt({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { theme } = useTheme()

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const palette = PALETTES[theme]
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let cells: { x: number; y: number; level: number; color: string; seed: number }[] = []
    let frame = 0
    let step = 0
    let last = 0
    let visible = true

    const layout = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = `500 ${CELL}px "Geist Mono Variable", ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      cells = []
      for (let y = CELL / 2; y < height; y += CELL) {
        for (let x = CELL / 2; x < width; x += CELL) {
          const b = brightness(x, y, width, height)
          const level = Math.max(b.ring, b.dot, b.echo)
          if (level < 0.06) continue
          const color = b.dot > 0.25 ? palette.dot : b.ring > b.echo ? palette.ink : palette.faint
          cells.push({ x, y, level, color, seed: Math.random() })
        }
      }
      draw()
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const c of cells) {
        const jitter = !reduced && Math.sin(c.seed * 997 + step * 0.6) > 0.94 ? 1 : 0
        const i = Math.min(GLYPHS.length - 1, Math.floor(c.level * (GLYPHS.length - 1)) + jitter)
        ctx.fillStyle = c.color
        ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, c.level * 1.4)
        ctx.fillText(GLYPHS[i], c.x, c.y)
      }
      ctx.globalAlpha = 1
    }

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      if (reduced || !visible || now - last < 125) return
      last = now
      step++
      draw()
    }

    const ro = new ResizeObserver(layout)
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(canvas)
    document.fonts?.ready.then(layout)
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      io.disconnect()
    }
  }, [theme])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
