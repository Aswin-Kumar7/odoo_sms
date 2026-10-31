import { Link, Outlet, useLocation } from 'react-router-dom'
import { Logo, ThemeSwitcher } from '../components/brand'
import { InvoicePaper } from '../components/InvoicePaper'

export function AuthLayout() {
  const { pathname } = useLocation()
  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-h-full flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Brightloop home">
            <Logo />
          </Link>
          <ThemeSwitcher />
        </div>
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="animate-rise w-full max-w-[360px]">
            <Outlet />
          </div>
        </div>
        {/* The team entrance stays deliberately quiet: customers are the ones who sign in here most */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-mono text-slate-400">Brightloop Software · Subscription billing</span>
          {pathname === '/login' && (
            <Link to="/login/team" className="text-slate-400 transition-colors hover:text-slate-700">
              Login as Admin
            </Link>
          )}
          {pathname === '/login/team' && (
            <Link to="/login" className="text-slate-400 transition-colors hover:text-slate-700">
              Customer sign in
            </Link>
          )}
        </div>
      </div>

      <div className="relative hidden overflow-hidden border-l border-line bg-sunken lg:flex lg:items-center lg:justify-center">
        {/* Ruled lines, like the ledger the invoices come from */}
        <div
          className="absolute inset-0 opacity-60"
          style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 31px, var(--color-line) 31px 32px)' }}
        />
        <div className="relative flex flex-col items-center">
          <InvoicePaper />
          <p className="mt-6 max-w-[300px] text-center text-sm text-slate-500">Every period billed once, with tax and discounts worked out, and paid from the portal</p>
        </div>
      </div>
    </div>
  )
}
