/**
 * roles.ts
 *
 * Funciones para verificar permisos en el servidor.
 *
 * Úsalas en páginas de Next.js (Server Components) para
 * bloquear el acceso antes de que la página cargue.
 *
 * Ejemplo de uso en una página de admin:
 *
 *   export default async function AdminPage() {
 *     await requireAdmin(); // Si no es admin, redirige automáticamente
 *     return <div>Panel de Admin</div>;
 *   }
 */

import { getServerSession } from 'next-auth';
import { authOptions } from './authOptions';
import { redirect } from 'next/navigation';

// Bloquea el acceso si no es admin
// Redirige al inicio sin dar explicación (por seguridad)
export async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session) redirect('/login');
  if ((session.user as any).rol !== 'admin') redirect('/');

  return session;
}

// Bloquea el acceso si no está logueado
export async function requireAuth() {
  const session = await getServerSession(authOptions);

  if (!session) redirect('/login');

  return session;
}

// Verificación rápida sin redirigir
// Útil dentro de componentes para mostrar/ocultar elementos
export function esAdmin(session: any): boolean {
  return session?.user?.rol === 'admin';
}
