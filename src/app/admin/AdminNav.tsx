'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/venta', label: 'Venta', icon: '💵' },
  { href: '/admin/pedidos', label: 'Pedidos', icon: '🧾' },
  { href: '/admin/metricas', label: 'Métricas', icon: '📊' },
  { href: '/admin/productos', label: 'Productos', icon: '🥤' },
  { href: '/admin/insumos', label: 'Insumos', icon: '📦' },
  { href: '/admin/usuarios', label: 'Usuarios', icon: '👥' },
  { href: '/admin/avisos', label: 'Avisos', icon: '🔔' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const activo = pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
              activo ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
