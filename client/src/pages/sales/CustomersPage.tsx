import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { api, qs, type Paginated } from '../../api/client'
import type { Customer } from '../../api/types'
import { Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, Spinner, Table, Td, Textarea } from '../../components/ui'
import { applyServerError } from '../../lib/forms'
import { date } from '../../lib/format'
import { emailSchema } from '../../lib/validation'

export function CustomersPage() {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Customer | 'new' | null>(null)

  const list = useQuery({
    queryKey: ['customers', { page, q }],
    queryFn: () => api.get<Paginated<Customer>>(`/customers${qs({ page, pageSize: 20, q })}`),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Businesses Brightloop bills. Customers who sign up themselves appear here with portal access."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> New customer
          </Button>
        }
      />
      <Card>
        <div className="-m-5">
          <div className="border-b border-line p-4">
            <Input
              placeholder="Search name or email"
              className="max-w-xs"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
            />
          </div>
          {list.isPending ? (
            <Spinner />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : list.data!.data.length === 0 ? (
            <EmptyState title="No customers found" />
          ) : (
            <>
              <Table headers={['Customer', 'Email', 'Phone', 'GSTIN', 'Subscriptions', 'Portal', 'Since', '']}>
                {list.data!.data.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-medium text-slate-900">{c.name}</Td>
                    <Td>{c.email}</Td>
                    <Td>{c.phone ?? '—'}</Td>
                    <Td>{c.taxId ?? '—'}</Td>
                    <Td>
                      {c._count?.subscriptions ? (
                        <Link to={`/subscriptions?customerId=${c.id}`} className="text-brand-700 hover:underline">
                          {c._count.subscriptions}
                        </Link>
                      ) : (
                        0
                      )}
                    </Td>
                    <Td>{c.hasPortalAccess ? 'Yes' : <span className="text-slate-400">No</span>}</Td>
                    <Td>{date(c.createdAt)}</Td>
                    <Td className="text-right">
                      <Button variant="ghost" onClick={() => setEditing(c)}>
                        Edit
                      </Button>
                    </Td>
                  </tr>
                ))}
              </Table>
              <Pagination page={page} pageSize={20} total={list.data!.total} onPage={setPage} />
            </>
          )}
        </div>
      </Card>
      {editing && <CustomerModal customer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name'),
  email: emailSchema,
  phone: z.string().trim().optional(),
  taxId: z.string().trim().optional(),
  address: z.string().trim().optional(),
})
type Form = z.infer<typeof schema>

export function CustomerModal({ customer, onClose, onCreated }: { customer: Customer | null; onClose: () => void; onCreated?: (c: Customer) => void }) {
  const qc = useQueryClient()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: customer?.name ?? '', email: customer?.email ?? '', phone: customer?.phone ?? '', taxId: customer?.taxId ?? '', address: customer?.address ?? '' },
  })

  const onSubmit = handleSubmit(async (f) => {
    const body = { ...f, phone: f.phone || null, taxId: f.taxId || null, address: f.address || null }
    try {
      const saved = customer ? await api.patch<Customer>(`/customers/${customer.id}`, body) : await api.post<Customer>('/customers', body)
      toast.success(customer ? 'Customer updated' : 'Customer created')
      qc.invalidateQueries({ queryKey: ['customers'] })
      if (!customer) onCreated?.(saved)
      onClose()
    } catch (err) {
      applyServerError(err, setError)
    }
  })

  return (
    <Modal
      open
      title={customer ? `Edit ${customer.name}` : 'New customer'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={isSubmitting}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Business name" error={errors.name?.message}>
          <Input autoFocus {...register('name')} />
        </Field>
        <Field label="Billing email" error={errors.email?.message}>
          <Input type="email" {...register('email')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" error={errors.phone?.message}>
            <Input {...register('phone')} />
          </Field>
          <Field label="GSTIN" error={errors.taxId?.message}>
            <Input {...register('taxId')} />
          </Field>
        </div>
        <Field label="Address" error={errors.address?.message}>
          <Textarea {...register('address')} />
        </Field>
      </form>
    </Modal>
  )
}
