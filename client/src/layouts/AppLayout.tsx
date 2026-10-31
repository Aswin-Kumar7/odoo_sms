import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  BarChart3,
  Boxes,
  CalendarClock,
  FileText,
  LayoutTemplate,
  Percent,
  Receipt,
  RefreshCcw,
  Repeat,
  Users,
  UserCog,
  Wallet,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react'

export type Role = 'ADMIN' | 'STAFF' | 'CUSTOMER'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles: Role[]
}

// Menu entries are filtered by role; the API enforces the same rules independently.
const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: BarChart3, roles: ['ADMIN', 'STAFF'] }],
  },
  {
    section: 'Sales',
    items: [
      { to: '/subscriptions', label: 'Subscriptions', icon: Repeat, roles: ['ADMIN', 'STAFF'] },
      { to: '/customers', label: 'Customers', icon: Users, roles: ['ADMIN', 'STAFF'] },
      { to: '/templates', label: 'Quotation templates', icon: LayoutTemplate, roles: ['ADMIN', 'STAFF'] },
    ],
  },
  {
    section: 'Billing',
    items: [
      { to: '/invoices', label: 'Invoices', icon: FileText, roles: ['ADMIN', 'STAFF'] },
      { to: '/payments', label: 'Payments', icon: Wallet, roles: ['ADMIN', 'STAFF'] },
      { to: '/billing', label: 'Billing runs', icon: RefreshCcw, roles: ['ADMIN', 'STAFF'] },
    ],
  },
  {
    section: 'Configuration',
    items: [
      { to: '/products', label: 'Products', icon: Boxes, roles: ['ADMIN', 'STAFF'] },
      { to: '/plans', label: 'Recurring plans', icon: CalendarClock, roles: ['ADMIN', 'STAFF'] },
      { to: '/taxes', label: 'Taxes', icon: Receipt, roles: ['ADMIN', 'STAFF'] },
      { to: '/discounts', label: 'Discounts', icon: Percent, roles: ['ADMIN', 'STAFF'] },
      { to: '/users', label: 'Users', icon: UserCog, roles: ['ADMIN'] },
    ],
  },
]

function SidebarContent({ role, userName, onLogout, onNavigate }: { role: Role; userName?: string; onLogout?: () => void; onNavigate?: () => void }) {
  return (
    <>
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-5">
        <div className="h-7 w-7 rounded-full bg-brand-600" />
        <span className="font-semibold text-slate-900">Brightloop</span>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV.map(({ section, items }) => {
          const visible = items.filter((i) => i.roles.includes(role))
          if (visible.length === 0) return null
          return (
            <div key={section}>
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{section}</p>
              {visible.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm',
                      isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-100',
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>
      <div className="border-t border-slate-200 px-4 py-3 text-sm">
        <p className="font-medium text-slate-800">{userName ?? '—'}</p>
        <p className="text-xs text-slate-500">{role}</p>
        {onLogout && (
          <button onClick={onLogout} className="mt-2 text-xs font-medium text-brand-600 hover:underline">
            Sign out
          </button>
        )}
      </div>
    </>
  )
}

export function AppLayout({ role = 'ADMIN', userName, onLogout }: { role?: Role; userName?: string; onLogout?: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="flex min-h-full">
      <aside className="no-print hidden w-60 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
        <SidebarContent role={role} userName={userName} onLogout={onLogout} />
      </aside>

      {/* Below md the sidebar becomes a slide-over drawer opened from the top bar. */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMenuOpen(false)} />
          <aside className="relative flex h-full w-64 flex-col bg-white shadow-xl">
            <button onClick={() => setMenuOpen(false)} className="absolute right-3 top-4 rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            <SidebarContent role={role} userName={userName} onLogout={onLogout} onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
          <button onClick={() => setMenuOpen(true)} className="rounded p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="h-6 w-6 rounded-full bg-brand-600" />
          <span className="font-semibold text-slate-900">Brightloop</span>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
