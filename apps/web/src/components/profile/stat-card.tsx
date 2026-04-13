export interface StatCardProps {
  label: string
  value: number
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div data-testid="stat-card" className="rounded-lg border bg-card p-4 text-center">
      <div className="text-3xl font-bold">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  )
}
