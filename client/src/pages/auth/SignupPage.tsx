import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Field, Input } from '../../components/ui'
import { PasswordChecklist } from '../../components/PasswordChecklist'
import { homeFor, useAuth } from '../../auth/AuthContext'
import { applyServerError } from '../../lib/forms'
import { emailSchema, passwordSchema } from '../../lib/validation'

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter your name'),
    company: z.string().trim().optional(),
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type Form = z.infer<typeof schema>

export function SignupPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { password: '' } })

  const onSubmit = handleSubmit(async ({ confirm: _confirm, ...input }) => {
    try {
      const user = await signup(input)
      navigate(homeFor(user.role), { replace: true })
    } catch (err) {
      applyServerError(err, setError)
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h2 className="text-lg font-semibold text-slate-900">Create your account</h2>
      <Field label="Your name" error={errors.name?.message}>
        <Input autoComplete="name" autoFocus {...register('name')} />
      </Field>
      <Field label="Company (optional)" error={errors.company?.message}>
        <Input autoComplete="organization" {...register('company')} />
      </Field>
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register('email')} />
      </Field>
      <Field label="Password" error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...register('password')} />
      </Field>
      <PasswordChecklist value={watch('password') ?? ''} />
      <Field label="Confirm password" error={errors.confirm?.message}>
        <Input type="password" autoComplete="new-password" {...register('confirm')} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Create account
      </Button>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
