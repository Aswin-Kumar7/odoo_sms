import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { FileText, Loader2, Repeat, Search, Users } from 'lucide-react'
import { api, qs, type Paginated } from '../api/client'
import type { Customer, InvoiceListItem, SubscriptionListItem } from '../api/types'
import { money } from '../lib/format'
import { Badge } from './ui'

interface Result {
  key: string
  to: string
  icon: typeof Search
  title: string
  meta: string
  badge?: { status: string; overdue?: boolean }
}

/** Jump to any subscription, invoice or customer by number or name. Ctrl/⌘ K or "/" focuses it. */
export function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 220)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        input.current?.focus()
        setOpen(true)
      }
    }
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [])

  const enabled = debounced.length >= 2
  const results = useQuery({
    queryKey: ['search', debounced],
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<Result[]> => {
      const p = qs({ q: debounced, pageSize: 4 })
      const [subs, invs, custs] = await Promise.all([
        api.get<Paginated<SubscriptionListItem>>(`/subscriptions${p}`),
        api.get<Paginated<InvoiceListItem>>(`/invoices${p}`),
        api.get<Paginated<Customer>>(`/customers${p}`),
      ])
      return [
        ...subs.data.map((s) => ({ key: `s${s.id}`, to: `/subscriptions/${s.id}`, icon: Repeat, title: s.number, meta: `${s.customer.name} · ${s.plan.name}`, badge: { status: s.status } })),
        ...invs.data.map((i) => ({
          key: `i${i.id}`,
          to: `/invoices/${i.id}`,
          icon: FileText,
          title: i.number,
          meta: `${i.customer.name} · ${money(i.total)}`,
          badge: { status: i.status, overdue: i.overdue },
        })),
        ...custs.data.map((c) => ({ key: `c${c.id}`, to: `/subscriptions?customerId=${c.id}`, icon: Users, title: c.name, meta: `${c.email} · ${c._count?.subscriptions ?? 0} subscriptions` })),
      ]
    },
  })
  const items = enabled ? (results.data ?? []) : []

  const go = (r: Result) => {
    navigate(r.to)
    setOpen(false)
    setQ('')
    input.current?.blur()
  }

  return (
    <div ref={box} className="relative w-full max-w-[420px]">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.75} />
      <input
        ref={input}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            input.current?.blur()
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(items.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter' && items[active]) {
            go(items[active])
          }
        }}
        placeholder="Search"
        aria-label="Search subscriptions, invoices and customers"
        role="combobox"
        aria-expanded={open && enabled}
        className="h-9 w-full rounded-lg border border-line bg-slate-100/70 pr-16 pl-9 text-sm text-slate-900 placeholder:text-slate-400 transition-[border-color,background-color] duration-150 focus:border-brand-500 focus:bg-surface focus:outline-none"
      />
      <span className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 gap-1 sm:flex">
        <kbd className="rounded border border-line-strong bg-surface px-1.5 font-mono text-[10px] leading-4 text-slate-500">Ctrl</kbd>
        <kbd className="rounded border border-line-strong bg-surface px-1.5 font-mono text-[10px] leading-4 text-slate-500">K</kbd>
      </span>

      {open && enabled && (
        <div className="animate-rise absolute top-11 right-0 left-0 z-40 overflow-hidden rounded-xl border border-line bg-surface shadow-float" role="listbox">
          {results.isPending ? (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">Nothing matches “{debounced}”</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto p-1.5">
              {items.map((r, i) => (
                <li key={r.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={clsx('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left', i === active && 'bg-slate-100')}
                  >
                    <r.icon className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-900">{r.title}</span>
                      <span className="block truncate text-xs text-slate-500">{r.meta}</span>
                    </span>
                    {r.badge && <Badge status={r.badge.overdue ? 'OVERDUE' : r.badge.status} label={r.badge.overdue ? 'Overdue' : undefined} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
