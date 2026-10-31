import { clsx } from 'clsx'

// A paper invoice drawn in code, with next month's invoice tucked behind it. It is a physical
// object, so it keeps its paper and ink colours in both themes. The figures are the demo
// customer's real October invoice.

const INK = '#2b2622'
const MUTED = '#8a8178'
const RULE = 'rgb(43 38 34 / 0.12)'

const LINES = [
  { item: 'Brightloop CRM', note: 'Brand: Odoo · 3 seats', amount: '₹6,180.00' },
  { item: 'Support Plus', note: '1 × ₹999.00', amount: '₹999.00' },
]

/** Torn-off bottom edge, as a mask so the paper's own shadow follows it. */
const zigzag = {
  WebkitMaskImage: 'linear-gradient(#000 0 0), conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg)',
  WebkitMaskSize: '100% calc(100% - 7px), 14px 7px',
  WebkitMaskPosition: 'top, bottom',
  WebkitMaskRepeat: 'no-repeat, repeat-x',
  maskImage: 'linear-gradient(#000 0 0), conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg)',
  maskSize: '100% calc(100% - 7px), 14px 7px',
  maskPosition: 'top, bottom',
  maskRepeat: 'no-repeat, repeat-x',
} as const

function Sheet({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={clsx('absolute w-[320px] bg-paper px-6 pt-6 pb-8 font-sans', className)} style={{ ...zigzag, color: INK }}>
      {children}
    </div>
  )
}

export function InvoicePaper({ className }: { className?: string }) {
  return (
    <div className={clsx('relative h-[460px] w-[340px] select-none', className)} aria-hidden="true">
      {/* Next period, already issued and waiting behind this one */}
      <div className="absolute top-0 left-8 drop-shadow-[0_12px_24px_rgb(40_30_20/0.14)]">
        <Sheet className="relative h-[380px] rotate-[5deg] opacity-95">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-medium">Brightloop Software</span>
            <span className="font-mono text-[11px]" style={{ color: MUTED }}>
              INV-2026-000213
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px]" style={{ color: MUTED }}>
            30 Nov – 30 Dec 2026
          </p>
        </Sheet>
      </div>

      {/* This period: paid */}
      <div className="absolute top-10 left-0 drop-shadow-[0_18px_36px_rgb(40_30_20/0.2)]">
        <Sheet className="relative -rotate-[2deg] pb-20">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="h-4 w-4" style={{ color: '#714b67' }}>
                <path d="M19.52 9.26A8 8 0 1 1 12 4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="16.59" cy="5.45" r="1.75" fill="currentColor" />
              </svg>
              <span className="text-[13px] font-medium">Brightloop Software</span>
            </div>
            <div className="text-right">
              <p className="text-[11px]" style={{ color: MUTED }}>
                Tax invoice
              </p>
              <p className="font-mono text-[11px]">INV-2026-000184</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <p style={{ color: MUTED }}>Billed to</p>
              <p className="mt-0.5 font-medium">Corner Shop Pvt Ltd</p>
            </div>
            <div className="text-right">
              <p style={{ color: MUTED }}>Service period</p>
              <p className="mt-0.5 font-mono">31 Oct – 29 Nov</p>
            </div>
          </div>

          <div className="mt-5" style={{ borderTop: `1px solid ${RULE}` }}>
            {LINES.map((l) => (
              <div key={l.item} className="flex items-baseline justify-between py-2.5 text-[12px]" style={{ borderBottom: `1px solid ${RULE}` }}>
                <div>
                  <p>{l.item}</p>
                  <p className="text-[11px]" style={{ color: MUTED }}>
                    {l.note}
                  </p>
                </div>
                <span className="font-mono">{l.amount}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 text-[11px]" style={{ color: MUTED }}>
              <span>GST 18%</span>
              <span className="font-mono">₹1,292.22</span>
            </div>
          </div>

          <div className="mt-1 flex items-baseline justify-between pt-3" style={{ borderTop: `1.5px solid ${INK}` }}>
            <span className="text-[12px] font-medium">Total</span>
            <span className="font-mono text-[18px] font-medium">₹8,471.22</span>
          </div>
          <p className="mt-1 text-right font-mono text-[10px]" style={{ color: MUTED }}>
            Due 15 Nov 2026
          </p>

          {/* The stamp: inked, slightly crooked, a little uneven */}
          <div
            className="absolute bottom-6 left-6 -rotate-[8deg] rounded-md px-3 py-1.5 text-center"
            style={{ border: '2px solid rgb(47 122 85 / 0.8)', color: 'rgb(47 122 85 / 0.85)', mixBlendMode: 'multiply' }}
          >
            <p className="text-[15px] leading-none font-medium tracking-[0.04em]">Paid</p>
            <p className="mt-1 font-mono text-[9px] leading-none">31 Oct · UPI</p>
          </div>
        </Sheet>
      </div>
    </div>
  )
}
