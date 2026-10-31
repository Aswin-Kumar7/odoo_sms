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
