import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError } from '../api/client'

/**
 * Shows a server error on the form: field-level validation errors go next to their
 * inputs, anything else becomes a toast.
 */
export function applyServerError<T extends FieldValues>(err: unknown, setError?: UseFormSetError<T>) {
  if (err instanceof ApiError) {
    const fields = Object.entries(err.fieldErrors)
    if (setError && fields.length > 0) {
      for (const [name, messages] of fields) setError(name as Path<T>, { message: messages[0] })
      return
    }
    toast.error(err.message)
    return
  }
  toast.error('Something went wrong')
}
