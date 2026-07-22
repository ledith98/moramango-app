import Link from 'next/link';
import { requireAdmin } from '@/lib/roles';
import { AdminNav } from './AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <main className="min-h-screen bg-neutral-100 font-sans">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-10 h-10 flex items-center justify-center bg-marron/15 text-marron rounded-full font-bold text-2xl leading-none shadow-sm active:scale-90 transition-transform shrink-0"
              title="Volver a la tienda"
            >
              ←
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-black leading-none">Panel de Admin</h1>
              <p className="text-sm text-neutral-500 mt-1">Moramango — {session.user?.name}</p>
            </div>
          </div>
          <AdminNav />
        </header>
        {children}
      </div>
    </main>
  );
}
