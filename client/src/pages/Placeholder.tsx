import { useQuery } from '@tanstack/react-query'
import { Card, PageHeader } from '../components/ui'

// Temporary page used for routes whose module is not built yet.
export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} subtitle="This section is coming soon." />
      <SystemStatus />
    </>
  )
}

function SystemStatus() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/health')
      return (await res.json()) as { status: string; db: string }
    },
    retry: false,
  })
  const db = health.data?.db
  return (
    <Card title="System status">
      <p className="text-sm">
        API:{' '}
        <span className={health.isError ? 'text-red-600' : 'text-emerald-700'}>{health.isError ? 'unreachable' : health.isLoading ? 'checking…' : 'up'}</span>
        {' · '}Database: <span className={db === 'up' ? 'text-emerald-700' : 'text-red-600'}>{db ?? '—'}</span>
      </p>
    </Card>
  )
}
