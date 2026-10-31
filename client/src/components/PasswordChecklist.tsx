import { Check, X } from 'lucide-react'
import { clsx } from 'clsx'
import { PASSWORD_RULES } from '../lib/validation'

export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {PASSWORD_RULES.map(({ label, test }) => {
        const ok = test(value)
        return (
          <li key={label} className={clsx('flex items-center gap-1', ok ? 'text-emerald-700' : 'text-slate-500')}>
            {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {label}
          </li>
        )
      })}
    </ul>
  )
}
