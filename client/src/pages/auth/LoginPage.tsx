import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Field, Input } from '../../components/ui'
import { homeFor, useAuth, WrongEntranceError } from '../../auth/AuthContext'
import { applyServerError } from '../../lib/forms'
import { emailSchema } from '../../lib/validation'

const schema = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password') })
type Form = z.infer<typeof schema>

/**
 * Customers sign in here by default. The team (admins and staff) use the same accounts API
 * through a quieter entrance at the bottom, which only accepts team accounts.
 */
export function LoginPage({ team = false }: { team?: boolean }) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async ({ email, password }) => {
    try {
      const user = await login(email, password, team ? ['ADMIN', 'STAFF'] : undefined)
      navigate(from && !from.startsWith('/login') ? from : homeFor(user.role), { replace: true })
    } catch (err) {
      if (err instanceof WrongEntranceError) setError('email', { message: err.message })
      else applyServerError(err, setError)
    }
  })

  return (
    <div>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <h1 className="text-2xl font-medium tracking-[-0.015em] text-slate-900">{team ? 'Team sign in' : 'Sign in'}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{team ? 'For Brightloop administrators and staff' : 'See your subscriptions, invoices and payments'}</p>
        </div>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" autoFocus placeholder={team ? 'name@brightloop.test' : 'you@company.com'} {...register('email')} />
        </Field>
        <div className="space-y-1.5">
          <Field label="Password" error={errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...register('password')} />
          </Field>
          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-[13px] text-slate-500 transition-colors hover:text-slate-900">
              Forgot password
            </Link>
          </div>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
        {!team && (
          <p className="text-center text-sm text-slate-500">
            New to Brightloop?{' '}
            <Link to="/signup" className="font-medium text-brand-600 hover:underline">
              Create an account
            </Link>
          </p>
        )}
      </form>
    </div>
  )
}
