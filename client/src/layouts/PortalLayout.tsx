import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { LogOut } from 'lucide-react'
import { Spinner } from '../components/ui'
import { Logo, ThemeSwitcher } from '../components/brand'

const LINKS = [
  { to: '/portal', label: 'Overview', end: true },
  { to: '/portal/subscriptions', label: 'Subscriptions', end: false },
  { to: '/portal/invoices', label: 'Invoices', end: false },
]

export function PortalLayout({ userName, onLogout }: { userName?: string; onLogout?: () => void }) {
  const { pathname } = useLocation()
  const link = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'relative flex h-14 items-center text-sm transition-colors duration-150',
      isActive ? 'font-medium text-slate-900 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-600' : 'text-slate-500 hover:text-slate-900',
    )
  return (
    <div className="min-h-full">
      <header className="no-print sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-8 px-4 sm:px-6">
          <div className="flex h-14 items-center">
            <Logo />
          </div>
          <nav className="order-last flex w-full gap-6 border-t border-line sm:order-none sm:w-auto sm:border-0">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={link}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex h-14 items-center gap-3">
            <div className="hidden sm:block">
              <ThemeSwitcher />
            </div>
            <span className="hidden text-sm text-slate-600 lg:inline">{userName}</span>
            {onLogout && (
              <button onClick={onLogout} title="Sign out" className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
                <LogOut className="h-4 w-4" strokeWidth={1.75} />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10">
        <Suspense fallback={<Spinner />}>
          <div key={pathname} className="animate-rise">
            <Outlet />
          </div>
        </Suspense>
        <div className="mt-12 flex justify-center sm:hidden">
          <ThemeSwitcher />
        </div>
      </main>
    </div>
  )
}
