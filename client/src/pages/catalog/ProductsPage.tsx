import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { api, qs, type Paginated } from '../../api/client'
import { PRODUCT_TYPES, type Product } from '../../api/types'
import { useIsAdmin } from '../../auth/AuthContext'
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Pagination, Select, Spinner, Table, Td } from '../../components/ui'
import { money } from '../../lib/format'

const typeLabel = Object.fromEntries(PRODUCT_TYPES.map((t) => [t.value, t.label]))

export function ProductsPage() {
  const isAdmin = useIsAdmin()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const list = useQuery({
    queryKey: ['products', { page, q, type, showInactive }],
    queryFn: () => api.get<Paginated<Product>>(`/products${qs({ page, pageSize: 20, q, type, includeInactive: showInactive })}`),
    placeholderData: keepPreviousData,
  })

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="What Brightloop sells. Variants add a price extra on top of the sales price."
        actions={
          isAdmin && (
            <Button onClick={() => navigate('/products/new')}>
              <Plus className="h-4 w-4" /> New product
            </Button>
          )
        }
      />
      <Card>
        <div className="-m-4">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
            <Input placeholder="Search products" className="max-w-xs" value={q} onChange={(e) => reset(setQ)(e.target.value)} />
            <Select className="max-w-[12rem]" value={type} onChange={(e) => reset(setType)(e.target.value)}>
              <option value="">All types</option>
              {PRODUCT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showInactive} onChange={(e) => reset(setShowInactive)(e.target.checked)} />
              Show archived
            </label>
          </div>
          {list.isLoading ? (
            <Spinner />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : list.data!.data.length === 0 ? (
            <EmptyState title="No products found" description={isAdmin ? 'Create your first product to start building plans and quotes.' : undefined} />
          ) : (
            <>
              <Table headers={['Product', 'Type', 'Sales price', 'Cost price', 'Margin', 'Tax', 'Variants', '']}>
                {list.data!.data.map((p) => {
                  const margin = p.salesPrice > 0 ? Math.round(((p.salesPrice - p.costPrice) / p.salesPrice) * 100) : 0
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <Td className="font-medium">
                        <Link to={`/products/${p.id}`} className="text-brand-700 hover:underline">
                          {p.name}
                        </Link>
                      </Td>
                      <Td>{typeLabel[p.type]}</Td>
                      <Td>{money(p.salesPrice)}</Td>
                      <Td className="text-slate-500">{money(p.costPrice)}</Td>
                      <Td className={margin < 0 ? 'text-red-600' : 'text-slate-600'}>{margin}%</Td>
                      <Td>{p.tax?.name ?? <span className="text-slate-400">None</span>}</Td>
                      <Td>{p.variants.length || <span className="text-slate-400">—</span>}</Td>
                      <Td>{!p.isActive && <Badge status="CLOSED" label="Archived" />}</Td>
                    </tr>
                  )
                })}
              </Table>
              <Pagination page={page} pageSize={20} total={list.data!.total} onPage={setPage} />
            </>
          )}
        </div>
      </Card>
    </>
  )
}
