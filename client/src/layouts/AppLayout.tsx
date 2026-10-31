import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  BarChart3,
  Boxes,
  CalendarClock,
  FileText,
  LayoutTemplate,
  LogOut,
  Menu,
  Percent,
  Receipt,
  RefreshCcw,
  Repeat,
  UserCog,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Spinner } from '../components/ui'
import { Logo, ThemeSwitcher } from '../components/brand'

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

const initials = (name?: string) =>
  (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

function SidebarContent({ role, userName, onLogout, onNavigate }: { role: Role; userName?: string; onLogout?: () => void; onNavigate?: () => void }) {
  return (
    <>
      <div className="flex h-16 shrink-0 items-center px-5">
        <Logo />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map(({ section, items }) => {
          const visible = items.filter((i) => i.roles.includes(role))
          if (visible.length === 0) return null
          return (
            <div key={section} className="mt-5 first:mt-1">
              <p className="mb-1.5 px-2.5 text-xs text-slate-500">{section}</p>
              <div className="space-y-0.5">
                {visible.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      clsx(
                        'flex h-8 items-center gap-2.5 rounded-lg border px-2.5 text-sm transition-colors duration-150',
                        isActive
                          ? 'border-line bg-surface font-medium text-slate-900 shadow-[0_1px_2px_rgb(0_0_0/0.05)] dark:bg-slate-100 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]'
                          : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon className={clsx('h-4 w-4 shrink-0', isActive ? 'text-brand-600' : 'text-slate-400')} strokeWidth={1.75} />
                        {label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          )
        })}
      </nav>
      <div className="shrink-0 space-y-3 border-t border-line p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-xs font-medium text-slate-700">{initials(userName)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{userName ?? '—'}</p>
            <p className="text-xs text-slate-500">{role === 'ADMIN' ? 'Administrator' : 'Staff'}</p>
          </div>
          {onLogout && (
            <button onClick={onLogout} title="Sign out" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800">
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
              <span className="sr-only">Sign out</span>
            </button>
          )}
        </div>
        <ThemeSwitcher className="w-full justify-between [&>button]:flex-1" />
      </div>
    </>
  )
}

export function AppLayout({ role = 'ADMIN', userName, onLogout }: { role?: Role; userName?: string; onLogout?: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-full">
      <aside className="no-print sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-sunken md:flex">
        <SidebarContent role={role} userName={userName} onLogout={onLogout} />
      </aside>

      {/* Below md the sidebar becomes a slide-over drawer opened from the top bar. */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <aside className="animate-rise relative flex h-full w-[272px] flex-col border-r border-line bg-sunken">
            <button onClick={() => setMenuOpen(false)} className="absolute top-4 right-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            <SidebarContent role={role} userName={userName} onLogout={onLogout} onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur md:hidden">
          <button onClick={() => setMenuOpen(true)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <Logo />
        </header>
        <main className="mx-auto w-full max-w-[1440px] min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10">
          <Suspense fallback={<Spinner />}>
            <div key={pathname} className="animate-rise">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
