import { Link } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { homeFor, useAuth } from '../auth/AuthContext'
import { Logo, LogoMark, ThemeSwitcher } from '../components/brand'
import { InvoicePaper } from '../components/InvoicePaper'
import { buttonClass } from '../components/ui'

// One page for everyone who reaches Brightloop billing: customers coming to their portal and
// the team coming to work. It describes only what the product does today.

const CYCLE = [
  { step: 'Quote', text: 'Start from a template. Prices, brand variants and GST fill themselves in, and the quote stays valid for as long as the template says' },
  { step: 'Confirm', text: 'The plan sets the rhythm: daily, weekly, monthly, every quarter or yearly, with its own rules for pausing, closing and renewing' },
  { step: 'Invoice', text: 'Each period is billed exactly once, with discounts and tax worked out. A missed day is caught up on the next run' },
  { step: 'Paid', text: 'Payments by UPI, card, bank transfer, cheque or online. Part payments add up, and anything past due shows as overdue' },
]

const CUSTOMER_POINTS = [
  'Every subscription with what the next invoice will be and when',
  'Pause, resume, renew or close when your plan allows it',
  'Invoices to view, print and pay online',
]

const TEAM_POINTS = [
  'Products, variants, recurring plans and tax rules',
  'Quotes from templates, with discounts that stop on their own',
  'Billing runs, payments, MRR and overdue invoices on one dashboard',
]

function Points({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((p) => (
        <li key={p} className="flex gap-3 text-[15px] text-slate-700">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} />
          {p}
        </li>
      ))}
    </ul>
  )
}

export function LandingPage() {
  const { user } = useAuth()

  return (
    <div className="min-h-full bg-slate-50">
      <header className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-4 sm:px-6">
        <Link to="/" aria-label="Brightloop home">
          <Logo />
        </Link>
        <nav className="hidden gap-6 text-sm text-slate-600 md:flex">
          <a href="#cycle" className="transition-colors hover:text-slate-900">
            How billing works
          </a>
          <a href="#who" className="transition-colors hover:text-slate-900">
            Customers and team
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <div className="hidden sm:block">
              <ThemeSwitcher />
            </div>
          {user ? (
            <Link
              to={homeFor(user.role)}
              className={buttonClass()}
            >
              {user.role === 'CUSTOMER' ? 'Your portal' : 'Dashboard'}
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-sm whitespace-nowrap text-slate-600 transition-colors hover:text-slate-900">
                Log in
              </Link>
              <Link
                to="/signup"
                className={buttonClass()}
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero: text on the left, the product's own object on the right */}
      <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-6 pt-12 pb-20 lg:min-h-[calc(100vh-64px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pt-0 lg:pb-16">
        <div className="animate-rise max-w-[560px]">
          <h1 className="text-[40px] leading-[1.05] font-medium tracking-[-0.025em] text-slate-900 sm:text-[56px] lg:text-[64px]">Every Brightloop subscription, from quote to paid</h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-[1.6] text-slate-600">
            Customers see their plans and invoices, change them when the plan allows and pay online. The Brightloop team quotes, bills each period exactly once and knows what is overdue.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              to={user ? homeFor(user.role) : '/login'}
              className={buttonClass('primary', 'lg')}
            >
              {user ? 'Continue' : 'Sign in to your account'}
              <ArrowRight className="h-4 w-4" />
            </Link>
            {!user && (
              <Link
                to="/signup"
                className={buttonClass('secondary', 'lg')}
              >
                Create an account
              </Link>
            )}
          </div>
        </div>

        <div className="relative flex justify-center lg:justify-end">
          <div className="relative flex h-[520px] w-full max-w-[520px] items-center justify-center overflow-hidden rounded-2xl border border-line bg-sunken">
            <div
              className="absolute inset-0 opacity-70"
              style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 31px, var(--color-line) 31px 32px)' }}
            />
            <InvoicePaper className="relative scale-[0.92] sm:scale-100" />
          </div>
        </div>
      </section>

      {/* The billing cycle, as a ruled line with four stops */}
      <section id="cycle" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <div className="max-w-[560px]">
            <p className="font-mono text-xs text-slate-500">How billing works</p>
            <h2 className="mt-3 text-[32px] leading-tight font-medium tracking-[-0.02em] text-slate-900">One cycle, repeated every period without anyone remembering it</h2>
          </div>
          <ol className="relative mt-14 grid gap-10 md:grid-cols-4 md:gap-8">
            <div className="absolute top-[11px] right-0 left-0 hidden h-px bg-line-strong md:block" aria-hidden="true" />
            {CYCLE.map((c, i) => (
              <li key={c.step} className="relative">
                <span className="relative flex h-6 w-6 items-center justify-center rounded-full border border-line-strong bg-surface font-mono text-[11px] text-slate-600">
                  {i === CYCLE.length - 1 ? <span className="h-2 w-2 rounded-full bg-brand-600" /> : i + 1}
                </span>
                <h3 className="mt-5 text-base font-medium text-slate-900">{c.step}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{c.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Two audiences, one product */}
      <section id="who" className="border-t border-line">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-6 py-24 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-8">
            <p className="font-mono text-xs text-slate-500">For customers</p>
            <h2 className="mt-3 text-2xl font-medium tracking-[-0.015em] text-slate-900">Manage your subscriptions without emailing anyone</h2>
            <Points items={CUSTOMER_POINTS} />
            <Link to="/login" className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
              Sign in to the portal <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-8">
            <p className="font-mono text-xs text-slate-500">For the Brightloop team</p>
            <h2 className="mt-3 text-2xl font-medium tracking-[-0.015em] text-slate-900">Know what is billed, paid and late, every day</h2>
            <Points items={TEAM_POINTS} />
            <Link to="/login/team" className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
              Team sign in <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-8">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <LogoMark className="h-5 w-5" /> Brightloop Software · Subscription billing
          </div>
          <ThemeSwitcher />
        </div>
      </footer>
    </div>
  )
}
