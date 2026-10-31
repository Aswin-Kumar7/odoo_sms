// Shapes returned by the API. Money is integer minor units (paise); rates are basis points.

export interface Tax {
  id: number
  name: string
  rateBp: number
  isActive: boolean
  _count?: { products: number }
}

export type ProductType = 'SERVICE' | 'SOFTWARE_LICENSE' | 'ADDON' | 'GOODS'

export const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: 'SOFTWARE_LICENSE', label: 'Software licence' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'ADDON', label: 'Add-on' },
  { value: 'GOODS', label: 'Goods' },
]

export interface ProductVariant {
  id: number
  name: string
  attributes: Record<string, string>
  priceExtra: number
  isActive: boolean
}

export interface Product {
  id: number
  name: string
  type: ProductType
  salesPrice: number
  costPrice: number
  notes: string | null
  taxId: number | null
  isActive: boolean
  tax: Pick<Tax, 'id' | 'name' | 'rateBp'> | null
  variants: ProductVariant[]
}

export type BillingPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

export interface Plan {
  id: number
  name: string
  price: number
  taxId: number | null
  billingPeriod: BillingPeriod
  billingInterval: number
  minQuantity: number
  availableFrom: string | null
  availableTo: string | null
  termLength: number | null
  autoClose: boolean
  closable: boolean
  pausable: boolean
  renewable: boolean
  isActive: boolean
  _count?: { subscriptions: number }
}

const PERIOD_UNIT: Record<BillingPeriod, [string, string]> = {
  DAILY: ['day', 'days'],
  WEEKLY: ['week', 'weeks'],
  MONTHLY: ['month', 'months'],
  YEARLY: ['year', 'years'],
}

export function periodLabel(period: BillingPeriod, interval = 1) {
  const [one, many] = PERIOD_UNIT[period]
  return interval === 1 ? `Every ${one}` : `Every ${interval} ${many}`
}

export interface Customer {
  id: number
  name: string
  email: string
  phone: string | null
  address: string | null
  taxId: string | null
  createdAt: string
  hasPortalAccess?: boolean
  _count?: { subscriptions: number; invoices?: number }
}

export interface TemplateLine {
  id: number
  productId: number
  variantId: number | null
  quantity: number
  product: { id: number; name: string; salesPrice: number }
  variant: { id: number; name: string; priceExtra: number } | null
}

export interface QuotationTemplate {
  id: number
  name: string
  planId: number
  validityDays: number
  notes: string | null
  isActive: boolean
  plan: Pick<Plan, 'id' | 'name' | 'billingPeriod' | 'billingInterval' | 'minQuantity' | 'price'>
  lines: TemplateLine[]
  _count?: { subscriptions: number }
}

export type SubscriptionStatus = 'DRAFT' | 'QUOTATION' | 'CONFIRMED' | 'ACTIVE' | 'PAUSED' | 'CLOSED'
export const SUBSCRIPTION_FLOW: SubscriptionStatus[] = ['DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'CLOSED']

export interface SubscriptionListItem {
  id: number
  number: string
  status: SubscriptionStatus
  startDate: string
  expiryDate: string | null
  nextBillingDate: string | null
  quoteExpiresAt: string | null
  customer: { id: number; name: string }
  plan: Pick<Plan, 'id' | 'name' | 'billingPeriod' | 'billingInterval'>
  _count: { lines: number }
}

export interface SubscriptionLine {
  id: number
  productId: number
  variantId: number | null
  description: string
  quantity: number
  unitPrice: number
  taxId: number | null
  product: { id: number; name: string }
  variant: { id: number; name: string } | null
  tax: Pick<Tax, 'id' | 'name' | 'rateBp'> | null
}

export interface PricedLine {
  key: string
  productId: number | null
  description: string
  quantity: number
  unitPrice: number
  taxRateBp: number
  base: number
  discountAmount: number
  taxAmount: number
  lineTotal: number
}

export interface DiscountOutcome {
  discountId: number
  code: string
  amount: number
  reason: string | null
}

export interface Totals {
  lines: PricedLine[]
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  discounts?: DiscountOutcome[]
}

export type DiscountStatus = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'USED_UP' | 'INACTIVE'

export interface Discount {
  id: number
  name: string
  code: string
  kind: 'FIXED' | 'PERCENT'
  value: number
  scope: 'PRODUCT' | 'SUBSCRIPTION'
  productId: number | null
  minPurchase: number | null
  minQuantity: number | null
  startsOn: string | null
  endsOn: string | null
  usageLimit: number | null
  usageCount: number
  isActive: boolean
  status?: DiscountStatus
  product?: { id: number; name: string } | null
  _count?: { subscriptions: number; invoices: number }
}

export type SubscriptionAction = 'send_quote' | 'confirm' | 'activate' | 'pause' | 'resume' | 'close' | 'cancel' | 'renew'

export interface ActivityEntry {
  id: number
  action: string
  fromStatus: string | null
  toStatus: string | null
  meta: Record<string, unknown> | null
  createdAt: string
  user: { name: string; role: string } | null
}

export interface InvoiceSummary {
  id: number
  number: string
  status: string
  periodStart: string
  periodEnd: string
  dueDate: string
  total: number
  amountPaid: number
}

export interface Subscription {
  id: number
  number: string
  status: SubscriptionStatus
  customerId: number
  planId: number
  quoteExpiresAt: string | null
  startDate: string
  expiryDate: string | null
  nextBillingDate: string | null
  paymentTermDays: number
  notes: string | null
  pausedAt: string | null
  closedAt: string | null
  closeReason: string | null
  version: number
  createdAt: string
  customer: { id: number; name: string; email: string }
  plan: Plan & { tax: Pick<Tax, 'id' | 'name' | 'rateBp'> | null }
  template: { id: number; name: string; validityDays: number } | null
  createdBy: { id: number; name: string } | null
  lines: SubscriptionLine[]
  discounts: { discountId: number; attachedAt: string; discount: Discount }[]
  invoices: InvoiceSummary[]
  pricedOn: string
  totals: Totals
  actions: { action: SubscriptionAction; label: string; blockedReason: string | null }[]
  editable: boolean
  timeline: ActivityEntry[]
}
