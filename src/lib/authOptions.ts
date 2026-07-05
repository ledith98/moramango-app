/**
 * authOptions.ts
 *
 * Configura el login con Google (NextAuth).
 *
 * Qué hace cada vez que alguien inicia sesión:
 * 1. Busca su email en la hoja USUARIOS de tu Sheet
 * 2. Si no existe → lo registra automáticamente como "cliente"
 * 3. Lee su Rol (cliente / admin) y lo agrega a la sesión
 *
 * Resultado: la app sabe quién es el usuario y qué puede hacer,
 * sin que tú tengas que registrar a nadie manualmente.
 */

import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { getSheetData, appendRow } from './googleSheets';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      try {
        const usuarios = await getSheetData('USUARIOS');
        const existe = usuarios.find((u) => u.Email === user.email);

        if (!existe) {
          // Usuario nuevo: lo registramos automáticamente
          const nuevoId = `USR-${String(usuarios.length + 1).padStart(3, '0')}`;
          const ahora = new Date().toLocaleString('es-MX', {
            timeZone: 'America/Monterrey',
          });

          await appendRow('USUARIOS', [
            nuevoId,
            user.name ?? '',
            '',              // Telefono — lo llena el usuario en su perfil
            user.email ?? '',
            ahora,           // Fecha_Registro
            0,               // Ciclo_Actual
            0,               // Total_Articulos_Historico
            'Ninguno',       // Beneficio_Disponible
            'cliente',       // Rol — todos los nuevos entran como cliente
            '',              // Notas_Admin
          ]);
        }

        return true;
      } catch (error) {
        console.error('Error en signIn:', error);
        // Si Sheets falla, dejamos entrar de todas formas
        // para no bloquear el acceso por un error de red
        return true;
      }
    },

    async session({ session }) {
      if (!session.user?.email) return session;

      try {
        const usuarios = await getSheetData('USUARIOS');
        const usuario = usuarios.find((u) => u.Email === session.user!.email);

        if (usuario) {
          // Estos datos estarán disponibles en toda la app
          // con useSession() o getServerSession()
          (session.user as any).id_usuario = usuario.ID_Usuario;
          (session.user as any).rol = usuario.Rol || 'cliente';
          (session.user as any).beneficio = usuario.Beneficio_Disponible;
          (session.user as any).ciclo_actual = parseInt(usuario.Ciclo_Actual) || 0;
          (session.user as any).telefono = usuario.Telefono || '';
        }
      } catch (error) {
        console.error('Error leyendo sesión:', error);
      }

      return session;
    },
  },

  pages: {
    signIn: '/login',
  },

  session: {
    strategy: 'jwt',
  },
};
