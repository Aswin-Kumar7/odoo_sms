import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { api } from '../../api/client'
import { Button, Field, Input } from '../../components/ui'
import { PasswordChecklist } from '../../components/PasswordChecklist'
import { applyServerError } from '../../lib/forms'
import { passwordSchema } from '../../lib/validation'

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type Form = z.infer<typeof schema>

export function ResetPasswordPage() {
  const token = useSearchParams()[0].get('token')
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { password: '' } })

  if (!token) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-red-600">This reset link is missing its token.</p>
        <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">
          Request a new link
        </Link>
      </div>
    )
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await api.post('/auth/reset-password', { token, password })
      toast.success('Password updated. Please sign in.')
      navigate('/login', { replace: true })
    } catch (err) {
      applyServerError(err, setError)
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h2 className="text-lg font-semibold text-slate-900">Choose a new password</h2>
      <Field label="New password" error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" autoFocus {...register('password')} />
      </Field>
      <PasswordChecklist value={watch('password') ?? ''} />
      <Field label="Confirm password" error={errors.confirm?.message}>
        <Input type="password" autoComplete="new-password" {...register('confirm')} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Update password
      </Button>
    </form>
  )
}
