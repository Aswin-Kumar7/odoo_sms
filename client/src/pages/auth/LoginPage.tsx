import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Field, Input } from '../../components/ui'
import { homeFor, useAuth } from '../../auth/AuthContext'
import { applyServerError } from '../../lib/forms'
import { emailSchema } from '../../lib/validation'

const schema = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password') })
type Form = z.infer<typeof schema>

export function LoginPage() {
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
      const user = await login(email, password)
      navigate(from && from !== '/login' ? from : homeFor(user.role), { replace: true })
    } catch (err) {
      applyServerError(err, setError)
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" autoFocus {...register('email')} />
      </Field>
      <Field label="Password" error={errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...register('password')} />
      </Field>
      <div className="flex justify-end">
        <Link to="/forgot-password" className="text-sm text-brand-600 hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Sign in
      </Button>
      <p className="text-center text-sm text-slate-500">
        New to Brightloop?{' '}
        <Link to="/signup" className="font-medium text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  )
}
