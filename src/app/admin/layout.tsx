import { requireAdmin } from '@/lib/roles';
import { AdminShell } from './AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  /*
    El marco vive en un componente de cliente porque la barra del celular
    se abre y se cierra. La sesión se resuelve aquí, en el servidor, y
    baja ya resuelta: así el panel sigue sin poder abrirse sin permiso.
  */
  return (
    <AdminShell usuario={session.user?.name ?? 'Administradora'}>{children}</AdminShell>
  );
}
