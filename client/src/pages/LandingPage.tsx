import { Link } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { homeFor, useAuth } from '../auth/AuthContext'
import { Logo, LogoMark, ThemeSwitcher } from '../components/brand'
import { InvoicePaper } from '../components/InvoicePaper'
import { LoopArt } from '../components/LoopArt'
import { ProductWindow } from '../components/ProductWindow'
import { buttonClass } from '../components/ui'

// One page for everyone who reaches Brightloop billing: customers on their way to the portal
// and the team on their way to work. Every claim on it is something the product does today.

const fragment = 'rounded-xl border border-cream-line bg-cream-raised p-4 shadow-card'

function QuoteFragment() {
  return (
    <div className={fragment}>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-slate-900">Brightloop CRM</span>
        <span className="font-mono text-slate-900">₹6,180.00</span>
      </div>
      <p className="mt-0.5 font-mono text-[11px] text-slate-500">Brand: Odoo · 3 × ₹2,060.00 · GST 18%</p>
      <div className="mt-3 flex items-center justify-between border-t border-cream-line pt-3 font-mono text-[11px] text-slate-500">
        <span>SMB Starter template</span>
        <span>Valid until 14 Nov</span>
      </div>
    </div>
  )
}

function ConfirmFragment() {
  const steps = ['Draft', 'Quotation', 'Confirmed', 'Active']
  return (
    <div className={fragment}>
      <ol className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2.5 text-[13px]">
            <span
              className={
                i < 3
                  ? 'flex h-4 w-4 items-center justify-center rounded-full border border-line-strong bg-slate-100 text-slate-600'
                  : 'flex h-4 w-4 items-center justify-center rounded-full border border-brand-600 bg-brand-600'
              }
            >
              {i < 3 ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-cream-raised" />}
            </span>
            <span className={i === 3 ? 'font-medium text-slate-900' : 'text-slate-600'}>{s}</span>
            {i === 3 && <span className="ml-auto font-mono text-[11px] text-slate-500">Monthly · pausable</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}

function InvoiceFragment() {
  return (
    <div className={fragment}>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[12px] text-slate-900">INV-2026-000184</span>
        <span className="inline-flex h-5 items-center gap-1.5 rounded border border-cream-line px-1.5 text-[11px] text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" /> Confirmed
        </span>
      </div>
      <p className="mt-1 font-mono text-[11px] text-slate-500">31 Oct – 29 Nov · due 15 Nov</p>
      <div className="mt-3 flex items-baseline justify-between border-t border-cream-line pt-3">
        <span className="text-[12px] text-slate-500">Total with GST</span>
        <span className="font-mono text-[15px] text-slate-900">₹8,471.22</span>
      </div>
    </div>
  )
}

function PaidFragment() {
  return (
    <div className={`${fragment} flex items-center justify-between`}>
      <div>
        <p className="text-[12px] text-slate-500">Paid online · UPI</p>
        <p className="mt-1 font-mono text-[15px] text-slate-900">₹8,471.22</p>
        <p className="mt-1 font-mono text-[11px] text-slate-500">31 Oct 2026</p>
      </div>
      <div className="-rotate-[8deg] rounded-md border-2 border-emerald-700/70 px-2.5 py-1 text-center text-emerald-700">
        <p className="text-[14px] leading-none font-medium">Paid</p>
        <p className="mt-1 font-mono text-[9px] leading-none">in full</p>
      </div>
    </div>
  )
}

const CYCLE = [
  { step: 'Quote', text: 'Start from a template. Prices, brand variants and GST fill themselves in, and the quote is valid for as long as the template says', fragment: <QuoteFragment /> },
  { step: 'Confirm', text: 'The plan sets the rhythm, from daily to yearly, and whether a customer may pause, close or renew', fragment: <ConfirmFragment /> },
  { step: 'Invoice', text: 'Every period is billed exactly once, with discounts and tax worked out. A missed day is caught up on the next run', fragment: <InvoiceFragment /> },
  { step: 'Paid', text: 'UPI, card, bank transfer, cheque or online through the portal. Part payments add up; anything past due shows as overdue', fragment: <PaidFragment /> },
]

const GUARANTEES = [
  { title: 'Billed once', text: 'The database refuses a second invoice for the same period, even if two billing runs start together' },
  { title: 'Never skipped', text: 'If the server was off for days, the next run bills every period it missed, in order' },
  { title: 'Discounts keep their limits', text: 'A code with five uses is redeemed five times, however many invoices are issued at once' },
  { title: 'Every change on record', text: 'Quotes, confirmations, pauses, payments and cancellations each leave a line on the timeline' },
]

function NextInvoicePreview() {
  const r = 40
  const c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-5 rounded-xl border border-cream-line bg-cream-raised p-5 shadow-card" aria-hidden="true">
      <svg viewBox="0 0 96 96" className="h-20 w-20 shrink-0">
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--color-line-strong)" strokeWidth="5" />
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--color-brand-600)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * 0.62} ${c}`} transform="rotate(-90 48 48)" />
        <text x="48" y="47" textAnchor="middle" className="fill-slate-900 font-mono text-[17px]">
          18
        </text>
        <text x="48" y="61" textAnchor="middle" className="fill-slate-500 font-mono text-[9px]">
          of 29 days
        </text>
      </svg>
      <div>
        <p className="text-[12px] text-slate-500">Next invoice</p>
        <p className="mt-1 text-[22px] leading-none font-medium tracking-[-0.01em] text-slate-900">₹8,471.22</p>
        <p className="mt-2 text-[12px] text-slate-600">On 30 Nov for Monthly SUB-000001</p>
      </div>
    </div>
  )
}

function OverduePreview() {
  const rows = [
    ['INV-2026-003892', 'Granite Logistics', '₹4,836.40', '350'],
    ['INV-2026-006029', 'Neem Hotels', '₹12,620.00', '322'],
    ['INV-2026-002303', 'Saffron Studios', '₹2,850.18', '318'],
  ]
  return (
    <div className="overflow-hidden rounded-xl border border-cream-line bg-cream-raised shadow-card" aria-hidden="true">
      <p className="border-b border-cream-line px-4 py-2.5 text-[12px] font-medium text-slate-900">Oldest overdue invoices</p>
      {rows.map(([n, c, a, d]) => (
        <div key={n} className="flex items-center gap-3 border-b border-cream-line px-4 py-2.5 text-[12px] last:border-0">
          <span className="font-mono text-slate-900">{n}</span>
          <span className="hidden flex-1 truncate text-slate-600 sm:block">{c}</span>
          <span className="ml-auto font-mono text-red-600 sm:ml-0">{d} days</span>
          <span className="w-24 text-right font-mono text-slate-900">{a}</span>
        </div>
      ))}
    </div>
  )
}

function Points({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((p) => (
        <li key={p} className="flex gap-3 text-[15px] text-slate-700">
          <Check className="mt-1 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2} />
          {p}
        </li>
      ))}
    </ul>
  )
}

export function LandingPage() {
  const { user } = useAuth()
  const home = user ? homeFor(user.role) : null

  return (
    <div className="min-h-full bg-cream">
      {/* Hero: the headline sits on calm space, the loop is the scene, the product rises from below */}
      <section className="relative overflow-hidden border-b border-cream-line">
        <LoopArt className="pointer-events-none absolute top-0 right-[-12%] h-[560px] w-[90%] opacity-50 [mask-image:radial-gradient(closest-side,#000_78%,transparent)] sm:right-[-6%] sm:h-[640px] sm:w-[70%] sm:opacity-100 lg:right-[-4%] lg:h-[700px] lg:w-[62%]" />

        <header className="relative mx-auto flex h-16 max-w-[1240px] items-center gap-8 px-4 sm:px-6">
          {/* Flex so the mark centres on the nav line; -ml-1 cancels the mark's inner padding so it aligns with the hero text */}
          <Link to="/" aria-label="Brightloop home" className="-ml-1 flex items-center">
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
            {home ? (
              <Link to={home} className={buttonClass()}>
                {user!.role === 'CUSTOMER' ? 'Your portal' : 'Dashboard'}
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-sm whitespace-nowrap text-slate-600 transition-colors hover:text-slate-900">
                  Log in
                </Link>
                <Link to="/signup" className={buttonClass()}>
                  Create account
                </Link>
              </>
            )}
          </div>
        </header>

        <div className="relative mx-auto max-w-[1240px] px-4 pt-14 sm:px-6 sm:pt-20 lg:pt-24">
          <div className="animate-rise max-w-[640px]">
            <p className="font-mono text-xs text-slate-500">Brightloop Software · subscription billing</p>
            <h1 className="mt-5 max-w-[640px] text-[40px] text-balance leading-[1.04] font-medium tracking-[-0.03em] text-slate-900 sm:text-[56px] lg:text-[64px]">Every subscription, billed on time, every period</h1>
            <p className="mt-6 max-w-[34rem] text-[17px] leading-[1.6] text-slate-600 sm:text-lg">
              Quotes, recurring invoices with GST and payments for Brightloop's customers. They pause, renew and pay from their own portal; the team sees what is paid and what is late.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to={home ?? '/login'} className={buttonClass('primary', 'lg')}>
                {home ? 'Continue' : 'Sign in'} <ArrowRight />
              </Link>
              {!home && (
                <Link to="/signup" className={buttonClass('secondary', 'lg', 'bg-cream-raised')}>
                  Create an account
                </Link>
              )}
            </div>
          </div>

          {/* The product, rising from the bottom edge, with this month's invoice resting on it */}
          <div className="relative mt-16 sm:mt-20">
            <ProductWindow className="relative mx-auto max-w-[1080px]" />
            <div className="absolute -top-24 right-[2%] hidden origin-top-right scale-[0.72] rotate-[4deg] lg:block xl:right-[4%]">
              <InvoicePaper />
            </div>
          </div>
        </div>
      </section>

      {/* From quote to paid: each stop shows the piece of the product it produces */}
      <section id="cycle" className="mx-auto max-w-[1240px] scroll-mt-8 px-4 py-24 sm:px-6 lg:py-32">
        <div className="max-w-[620px]">
          <p className="font-mono text-xs text-slate-500">How billing works</p>
          <h2 className="mt-4 text-[32px] leading-[1.1] font-medium tracking-[-0.025em] text-slate-900 sm:text-[40px]">From quote to paid, then again next period without anyone remembering</h2>
        </div>
        <ol className="relative mt-16 grid grid-cols-1 gap-12 md:grid-cols-2 xl:grid-cols-4 xl:gap-8">
          <div className="absolute top-3 right-0 left-0 hidden h-px bg-cream-line xl:block" aria-hidden="true" />
          {CYCLE.map((c, i) => (
            <li key={c.step} className="relative flex flex-col">
              <span className="relative flex h-6 w-6 items-center justify-center rounded-full border border-line-strong bg-cream font-mono text-[11px] text-slate-600">
                {i === CYCLE.length - 1 ? <span className="h-2 w-2 rounded-full bg-brand-600" /> : i + 1}
              </span>
              <h3 className="mt-6 text-lg font-medium text-slate-900">{c.step}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{c.text}</p>
              <div className="mt-6">{c.fragment}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* Two audiences, one product */}
      <section id="who" className="scroll-mt-8 border-y border-cream-line bg-cream-raised/60">
        <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-16 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:py-32">
          <div className="flex flex-col">
            <p className="font-mono text-xs text-slate-500">For customers</p>
            <h2 className="mt-4 text-[28px] leading-tight font-medium tracking-[-0.02em] text-slate-900 sm:text-[32px]">Manage your subscriptions without emailing anyone</h2>
            <Points items={['See each subscription and what the next invoice will be', 'Pause, resume, renew or close when your plan allows it', 'View, print and pay invoices online']} />
            <div className="mt-10">
              <NextInvoicePreview />
            </div>
            <Link to="/login" className="mt-8 inline-flex items-center gap-1.5 self-start text-sm font-medium text-brand-600 hover:underline">
              Sign in to the portal <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="flex flex-col">
            <p className="font-mono text-xs text-slate-500">For the Brightloop team</p>
            <h2 className="mt-4 text-[28px] leading-tight font-medium tracking-[-0.02em] text-slate-900 sm:text-[32px]">Know what is billed, paid and late, every day</h2>
            <Points items={['Products, brand variants, recurring plans and GST rules', 'Quotes from templates, with discounts that stop on their own', 'Billing runs, payments, MRR and overdue invoices on one dashboard']} />
            <div className="mt-10">
              <OverduePreview />
            </div>
            <Link to="/login/team" className="mt-8 inline-flex items-center gap-1.5 self-start text-sm font-medium text-brand-600 hover:underline">
              Team sign in <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* What the system guarantees, stated plainly */}
      <section className="mx-auto max-w-[1240px] px-4 py-24 sm:px-6 lg:py-32">
        <div className="max-w-[620px]">
          <p className="font-mono text-xs text-slate-500">Built for money</p>
          <h2 className="mt-4 text-[32px] leading-[1.1] font-medium tracking-[-0.025em] text-slate-900 sm:text-[40px]">The numbers on an invoice are numbers you can trust</h2>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-x-8 gap-y-10 border-t border-cream-line pt-10 sm:grid-cols-2 xl:grid-cols-4">
          {GUARANTEES.map((g) => (
            <div key={g.title}>
              <h3 className="text-base font-medium text-slate-900">{g.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{g.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-cream-line">
        <div className="mx-auto flex max-w-[1240px] flex-col items-start gap-8 px-4 py-20 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="max-w-[560px] text-[28px] leading-tight font-medium tracking-[-0.02em] text-slate-900 sm:text-[32px]">Your invoices and subscriptions are one sign-in away</h2>
          <div className="flex flex-wrap gap-3">
            <Link to={home ?? '/login'} className={buttonClass('primary', 'lg')}>
              {home ? 'Continue' : 'Sign in'} <ArrowRight />
            </Link>
            {!home && (
              <Link to="/signup" className={buttonClass('secondary', 'lg', 'bg-cream-raised')}>
                Create an account
              </Link>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-cream-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <LogoMark className="h-5 w-5" /> Brightloop Software · Subscription billing
          </div>
          <div className="flex items-center gap-6">
            <Link to="/login/team" className="text-[13px] text-slate-500 transition-colors hover:text-slate-900">
              Team sign in
            </Link>
            <ThemeSwitcher />
          </div>
        </div>
      </footer>
    </div>
  )
}
