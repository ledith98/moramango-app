'use client';

/**
 * AdminShell.tsx
 *
 * El marco del panel: barra lateral a la izquierda y el contenido a la
 * derecha.
 *
 * Antes eran quince pestañas en una fila que se arrastraba de lado. En el
 * celular pasaba, pero en la tablet —que es donde de verdad se usa el
 * panel— quedaba un renglón largo arriba, con la mitad de las secciones
 * escondidas detrás de un arrastre que no se ve que exista. Leer una
 * lista vertical de quince cosas es inmediato; arrastrar una fila para
 * descubrir la décima no lo es.
 *
 * De 768 px para arriba la barra se queda fija y abierta. Abajo de eso no
 * cabe al lado del contenido, así que es la misma barra pero encima, con
 * el botón de menú de la esquina. No son dos menús: es el mismo, en dos
 * posiciones.
 */

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const TABS = [
  { href: '/admin/venta', label: 'Venta', icon: '💵' },
  { href: '/admin/pedidos', label: 'Pedidos', icon: '🧾' },
  { href: '/admin/metricas', label: 'Métricas', icon: '📊' },
  { href: '/admin/dinero', label: 'Dinero', icon: '💰' },
  { href: '/admin/productos', label: 'Productos', icon: '🥤' },
  { href: '/admin/insumos', label: 'Insumos', icon: '📦' },
  { href: '/admin/proveedores', label: 'Proveedores', icon: '🏪' },
  { href: '/admin/recetario', label: 'Recetario', icon: '📖' },
  { href: '/admin/usuarios', label: 'Usuarios', icon: '👥' },
  { href: '/admin/opiniones', label: 'Opiniones', icon: '⭐' },
  { href: '/admin/reactivacion', label: 'Reactivación', icon: '💛' },
  { href: '/admin/avisos', label: 'Avisos', icon: '🔔' },
  { href: '/admin/ajustes', label: 'Ajustes', icon: '⚙️' },
  { href: '/admin/app', label: 'APP', icon: '📱' },
  { href: '/admin/cartel', label: 'Cartel', icon: '🖨️' },
];

/** El nombre de la sección abierta, para el encabezado de la derecha. */
function tituloDe(pathname: string | null): string {
  const tab = TABS.find((t) => pathname?.startsWith(t.href));
  return tab?.label ?? 'Panel';
}

export function AdminShell({
  children,
  usuario,
}: {
  children: React.ReactNode;
  usuario: string;
}) {
  const pathname = usePathname();
  /** Solo manda en celular: de 768 px para arriba la barra siempre está */
  const [abierto, setAbierto] = useState(false);

  // Escape cierra el menú: en una tablet con teclado es lo que se intenta
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  const barra = (
    <>
      {/* La marca, arriba de todo */}
      <Link
        href="/"
        onClick={() => setAbierto(false)}
        className="flex items-center gap-3 px-5 py-5 shrink-0"
        title="Volver a la tienda"
      >
        <span className="w-10 h-10 rounded-xl bg-marron/10 flex items-center justify-center overflow-hidden shrink-0">
          <Image src="/logo.png" alt="" width={40} height={40} className="object-contain" />
        </span>
        <span className="min-w-0">
          <span className="block font-bold text-neutral-900 leading-tight truncate">
            Moramango
          </span>
          <span className="block text-[10px] font-semibold tracking-wide text-neutral-600 uppercase">
            Panel de control
          </span>
        </span>
      </Link>

      {/*
        La lista se desplaza sola, no la página.

        Son quince secciones; en una tablet acostada no caben todas de
        golpe. Si se desplazara la página entera, el contenido de la
        derecha se iría hacia arriba al buscar la última sección.
      */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-0.5">
        {TABS.map((tab) => {
          const activo = pathname?.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => setAbierto(false)}
              aria-current={activo ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                activo
                  ? 'bg-marron/10 text-marron font-bold'
                  : 'text-neutral-700 font-semibold hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              <span className="text-base leading-none shrink-0">{tab.icon}</span>
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Quién está dentro, y la salida a la tienda */}
      <div className="shrink-0 border-t border-neutral-200 p-3">
        <div className="rounded-xl bg-neutral-50 px-3 py-2.5">
          <p className="text-[10px] font-semibold tracking-wide text-neutral-600 uppercase">
            Sesión
          </p>
          <p className="text-sm font-bold text-neutral-900 truncate">{usuario}</p>
          <Link
            href="/"
            onClick={() => setAbierto(false)}
            className="mt-1 inline-block text-xs font-semibold text-marron underline underline-offset-2"
          >
            ← Volver a la tienda
          </Link>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-neutral-100 font-sans flex">
      {/* ── Tablet y escritorio: siempre a la vista ── */}
      <aside className="hidden md:flex md:flex-col w-60 lg:w-64 shrink-0 bg-white border-r border-neutral-200 h-screen sticky top-0">
        {barra}
      </aside>

      {/* ── Celular: la misma barra, encima del contenido ── */}
      {abierto && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="flex flex-col w-64 max-w-[80vw] bg-white h-full shadow-2xl"
            role="dialog"
            aria-label="Secciones del panel"
          >
            {barra}
          </div>
          {/* Tocar fuera cierra: es lo que la gente intenta primero */}
          <button
            onClick={() => setAbierto(false)}
            aria-label="Cerrar el menú"
            className="flex-1 bg-black/40"
          />
        </div>
      )}

      {/* ── El contenido ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-neutral-100/95 backdrop-blur border-b border-neutral-200">
          <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
            <button
              onClick={() => setAbierto(true)}
              aria-label="Abrir el menú"
              className="md:hidden w-10 h-10 shrink-0 rounded-xl bg-white border border-neutral-200 text-neutral-900 text-xl leading-none active:scale-90 transition-transform"
            >
              ☰
            </button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-black leading-tight truncate">
                {tituloDe(pathname)}
              </h1>
              <p className="text-xs text-neutral-700 truncate">Moramango — {usuario}</p>
            </div>
          </div>
        </header>

        <div className="flex-1 p-4 sm:p-6 max-w-6xl w-full">{children}</div>
      </div>
    </div>
  );
}
