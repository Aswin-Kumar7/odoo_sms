import { NavLink, Outlet } from 'react-router-dom'
import { clsx } from 'clsx'

export function PortalLayout({ userName, onLogout }: { userName?: string; onLogout?: () => void }) {
  const link = ({ isActive }: { isActive: boolean }) =>
    clsx('rounded-md px-3 py-1.5 text-sm', isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-100')
  return (
    <div className="min-h-full">
      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-brand-600" />
              <span className="font-semibold text-slate-900">Brightloop</span>
              <span className="text-sm text-slate-400">Customer portal</span>
            </div>
            <nav className="flex gap-1">
              <NavLink to="/portal/subscriptions" className={link}>
                My subscriptions
              </NavLink>
              <NavLink to="/portal/invoices" className={link}>
                My invoices
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">{userName}</span>
            {onLogout && (
              <button onClick={onLogout} className="font-medium text-brand-600 hover:underline">
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
