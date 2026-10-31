import { useQuery } from '@tanstack/react-query'
import { api, qs, type Paginated } from './client'
import type { Plan, Product, QuotationTemplate, Tax } from './types'

// Catalogue look-ups used by pickers. Catalogue data changes rarely, so it is cached for a minute.
const STALE = 60_000

export function useActiveProducts() {
  return useQuery({
    queryKey: ['products', 'picker'],
    queryFn: () => api.get<Paginated<Product>>('/products?pageSize=100').then((r) => r.data),
    staleTime: STALE,
  })
}

export function useActivePlans(availableOn?: string) {
  return useQuery({
    queryKey: ['plans', 'picker', availableOn ?? ''],
    queryFn: () => api.get<{ data: Plan[] }>(`/plans${qs({ availableOn })}`).then((r) => r.data),
    staleTime: STALE,
  })
}

export function useActiveTaxes() {
  return useQuery({
    queryKey: ['taxes', 'active'],
    queryFn: () => api.get<{ data: Tax[] }>('/taxes').then((r) => r.data),
    staleTime: STALE,
  })
}

export function useActiveTemplates() {
  return useQuery({
    queryKey: ['templates', 'active'],
    queryFn: () => api.get<{ data: QuotationTemplate[] }>('/templates').then((r) => r.data),
    staleTime: STALE,
  })
}
