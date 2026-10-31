import type { Discount } from '../api/types'
import { date, money, percent } from './format'

/** "10% off" / "₹500 off" */
export const discountValue = (d: Pick<Discount, 'kind' | 'value'>) => (d.kind === 'PERCENT' ? `${percent(d.value)} off` : `${money(d.value)} off`)

/** Human summary of when a discount applies, e.g. "Brightloop CRM · min 5 units · until 31 Dec 2026". */
export function discountConditions(d: Discount) {
  const parts = [d.scope === 'PRODUCT' ? (d.product?.name ?? 'One product') : 'Whole subscription']
  if (d.minQuantity) parts.push(`min ${d.minQuantity} units`)
  if (d.minPurchase) parts.push(`min ${money(d.minPurchase)}`)
  if (d.startsOn && d.endsOn) parts.push(`${date(d.startsOn)} – ${date(d.endsOn)}`)
  else if (d.startsOn) parts.push(`from ${date(d.startsOn)}`)
  else if (d.endsOn) parts.push(`until ${date(d.endsOn)}`)
  return parts.join(' · ')
}

export const discountUsage = (d: Pick<Discount, 'usageCount' | 'usageLimit'>) => (d.usageLimit ? `${d.usageCount} / ${d.usageLimit}` : `${d.usageCount} / ∞`)
