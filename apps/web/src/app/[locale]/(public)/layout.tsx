import { Header } from '@/components/layout/header'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="relative flex-1">{children}</main>
    </div>
  )
}
