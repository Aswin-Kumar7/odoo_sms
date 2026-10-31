import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { api } from '../../api/client'
import type { Tax } from '../../api/types'
import { useIsAdmin } from '../../auth/AuthContext'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Spinner, Table, Td } from '../../components/ui'
import { applyServerError } from '../../lib/forms'
import { percent } from '../../lib/format'

export function TaxesPage() {
  const isAdmin = useIsAdmin()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Tax | 'new' | null>(null)

  const taxes = useQuery({
    queryKey: ['taxes', 'all'],
    queryFn: () => api.get<{ data: Tax[] }>('/taxes?includeInactive=true').then((r) => r.data),
  })

  const toggle = useMutation({
    mutationFn: (t: Tax) => api.patch<Tax>(`/taxes/${t.id}`, { isActive: !t.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxes'] }),
    onError: (e) => applyServerError(e),
  })

  return (
    <>
      <PageHeader
        title="Taxes"
        subtitle="Tax rules applied automatically to subscription and invoice lines. Issued invoices keep the rate they were created with."
        actions={
          isAdmin && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> New tax
            </Button>
          )
        }
      />
      <Card>
        <div className="-m-4">
          {taxes.isPending ? (
            <Spinner />
          ) : taxes.isError ? (
            <ErrorState error={taxes.error} onRetry={() => taxes.refetch()} />
          ) : taxes.data!.length === 0 ? (
            <EmptyState title="No taxes yet" description="Add a tax rule such as GST 18% so it can be applied to products." />
          ) : (
            <Table headers={['Name', 'Rate', 'Products using it', 'Status', '']}>
              {taxes.data!.map((t) => (
                <tr key={t.id}>
                  <Td className="font-medium text-slate-900">{t.name}</Td>
                  <Td>{percent(t.rateBp)}</Td>
                  <Td>{t._count?.products ?? 0}</Td>
                  <Td>{t.isActive ? <Badge status="ACTIVE" /> : <Badge status="CLOSED" label="Inactive" />}</Td>
                  <Td className="text-right">
                    {isAdmin && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => setEditing(t)}>
                          Edit
                        </Button>
                        <Button variant="ghost" onClick={() => toggle.mutate(t)} disabled={toggle.isPending}>
                          {t.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
      {editing && <TaxModal tax={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name'),
  rate: z.coerce.number({ invalid_type_error: 'Enter a rate' }).min(0, 'Rate cannot be negative').max(100, 'Rate cannot exceed 100%'),
})
type Form = z.infer<typeof schema>

function TaxModal({ tax, onClose }: { tax: Tax | null; onClose: () => void }) {
  const qc = useQueryClient()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: tax?.name ?? '', rate: tax ? tax.rateBp / 100 : undefined } })

  const onSubmit = handleSubmit(async ({ name, rate }) => {
    const body = { name, rateBp: Math.round(rate * 100) }
    try {
      if (tax) await api.patch(`/taxes/${tax.id}`, body)
      else await api.post('/taxes', body)
      toast.success(tax ? 'Tax updated' : 'Tax created')
      qc.invalidateQueries({ queryKey: ['taxes'] })
      onClose()
    } catch (err) {
      applyServerError(err, setError)
    }
  })

  return (
    <Modal
      open
      title={tax ? 'Edit tax' : 'New tax'}
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
        <Field label="Name" error={errors.name?.message}>
          <Input autoFocus placeholder="GST 18%" {...register('name')} />
        </Field>
        <Field label="Rate (%)" error={errors.rate?.message} hint="Up to two decimals, e.g. 18 or 12.5">
          <Input type="number" step="0.01" min="0" max="100" {...register('rate')} />
        </Field>
      </form>
    </Modal>
  )
}
