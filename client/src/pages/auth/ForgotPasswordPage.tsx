import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '../../api/client'
import { Button, Field, Input } from '../../components/ui'
import { applyServerError } from '../../lib/forms'
import { emailSchema } from '../../lib/validation'

const schema = z.object({ email: emailSchema })
type Form = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api.post('/auth/forgot-password', values)
      setSent(true)
    } catch (err) {
      applyServerError(err, setError)
    }
  })

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold text-slate-900">Check your email</h2>
        <p className="text-sm text-slate-600">If an account exists for that address, we have sent a link to reset your password. It expires in 30 minutes.</p>
        <Link to="/login" className="text-sm font-medium text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h2 className="text-lg font-semibold text-slate-900">Reset your password</h2>
      <p className="text-sm text-slate-600">Enter your registered email and we'll send you a reset link.</p>
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" autoFocus {...register('email')} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Send reset link
      </Button>
      <p className="text-center text-sm">
        <Link to="/login" className="text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  )
}
