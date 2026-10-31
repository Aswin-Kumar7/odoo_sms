import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { api, qs, type Paginated } from '../../api/client'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Table, Td } from '../../components/ui'
import { PasswordChecklist } from '../../components/PasswordChecklist'
import { useAuth, type Role } from '../../auth/AuthContext'
import { applyServerError } from '../../lib/forms'
import { date } from '../../lib/format'
import { emailSchema, passwordSchema } from '../../lib/validation'

interface UserRow {
  id: number
  email: string
  name: string
  role: Role
  isActive: boolean
  createdAt: string
}

export function UsersPage() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [adding, setAdding] = useState(false)

  const list = useQuery({
    queryKey: ['users', { page, q, role }],
    queryFn: () => api.get<Paginated<UserRow>>(`/users${qs({ page, pageSize: 20, q, role })}`),
    placeholderData: keepPreviousData,
  })

  const toggle = useMutation({
    mutationFn: (u: UserRow) => api.patch<UserRow>(`/users/${u.id}`, { isActive: !u.isActive }),
    onSuccess: (u) => {
      toast.success(`${u.name} ${u.isActive ? 'reactivated' : 'deactivated'}`)
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e) => applyServerError(e),
  })

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Admins manage staff accounts. Customers create their own accounts from the sign-up page."
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus className="h-4 w-4" /> Add staff
          </Button>
        }
      />
      <Card className="overflow-hidden" title={undefined}>
        <div className="-m-4">
          <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
            <Input
              placeholder="Search name or email"
              className="max-w-xs"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
            />
            <Select
              className="max-w-[10rem]"
              value={role}
              onChange={(e) => {
                setRole(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All roles</option>
              <option value="ADMIN">Admin</option>
              <option value="STAFF">Staff</option>
              <option value="CUSTOMER">Customer</option>
            </Select>
          </div>
          {list.isPending ? (
            <Spinner />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : list.data!.data.length === 0 ? (
            <EmptyState title="No users found" />
          ) : (
            <>
              <Table headers={['Name', 'Email', 'Role', 'Status', 'Created', '']}>
                {list.data!.data.map((u) => (
                  <tr key={u.id}>
                    <Td className="font-medium text-slate-900">{u.name}</Td>
                    <Td>{u.email}</Td>
                    <Td>
                      <Badge status={u.role} />
                    </Td>
                    <Td>{u.isActive ? <Badge status="ACTIVE" /> : <Badge status="CLOSED" label="Inactive" />}</Td>
                    <Td>{date(u.createdAt)}</Td>
                    <Td className="text-right">
                      {u.id !== me?.id && u.role !== 'CUSTOMER' && (
                        <Button variant="ghost" onClick={() => toggle.mutate(u)} disabled={toggle.isPending}>
                          {u.isActive ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
              <Pagination page={page} pageSize={20} total={list.data!.total} onPage={setPage} />
            </>
          )}
        </div>
      </Card>
      <AddStaffModal open={adding} onClose={() => setAdding(false)} />
    </>
  )
}

const staffSchema = z.object({ name: z.string().trim().min(2, 'Enter a name'), email: emailSchema, password: passwordSchema })
type StaffForm = z.infer<typeof staffSchema>

function AddStaffModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const {
    register,
    handleSubmit,
    setError,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StaffForm>({ resolver: zodResolver(staffSchema), defaultValues: { password: '' } })

  const close = () => {
    reset()
    onClose()
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api.post('/users', values)
      toast.success(`Staff account created for ${values.name}`)
      qc.invalidateQueries({ queryKey: ['users'] })
      close()
    } catch (err) {
      applyServerError(err, setError)
    }
  })

  return (
    <Modal
      open={open}
      title="Add staff member"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={isSubmitting}>
            Create account
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Name" error={errors.name?.message}>
          <Input autoFocus {...register('name')} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" {...register('email')} />
        </Field>
        <Field label="Temporary password" error={errors.password?.message} hint="Share it securely; they can change it via “Forgot password”.">
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <PasswordChecklist value={watch('password') ?? ''} />
      </form>
    </Modal>
  )
}
