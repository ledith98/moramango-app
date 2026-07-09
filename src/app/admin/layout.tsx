import { requireAdmin } from '@/lib/roles';
import { AdminNav } from './AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <main className="min-h-screen bg-neutral-100 font-sans">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-black leading-none">Panel de Admin</h1>
            <p className="text-sm text-neutral-500 mt-1">Moramango — {session.user?.name}</p>
          </div>
          <AdminNav />
        </header>
        {children}
      </div>
    </main>
  );
}
