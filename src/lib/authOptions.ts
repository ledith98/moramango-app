/**
 * authOptions.ts
 *
 * Configura el login con Google (NextAuth).
 *
 * Qué hace cada vez que alguien inicia sesión:
 * 1. Busca su email en la hoja USUARIOS
 * 2. Si no existe → lo registra automáticamente como "cliente" activo
 * 3. Si existe pero está inactivo (Activo=no) → bloquea el acceso
 * 4. Actualiza su Ultimo_Acceso con la fecha/hora actual
 * 5. Lee su Rol (cliente / admin) y lo agrega a la sesión
 *
 * Orden EXACTO de columnas del sheet USUARIOS:
 * A: ID_Usuario
 * B: Nombre
 * C: Telefono
 * D: Rol
 * E: Email
 * F: Fecha_Registro
 * G: Ciclo_Actual
 * H: Total_Articulos_Historico
 * I: Beneficio_Disponible
 * J: Notas_Admin
 * K: Activo
 * L: Ultimo_Acceso
 */

import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { getSheetData, appendRow, findRow, updateCell } from './googleSheets';

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
        const ahora = new Date().toLocaleString('es-MX', {
          timeZone: 'America/Monterrey',
        });

        if (!existe) {
          // Usuario nuevo — se registra como cliente activo
          const nuevoId = `USR-${String(usuarios.length + 1).padStart(3, '0')}`;

          await appendRow('USUARIOS', [
            nuevoId,           // A - ID_Usuario
            user.name ?? '',   // B - Nombre
            '',                // C - Telefono (lo llena el usuario después en perfil)
            'cliente',         // D - Rol
            user.email ?? '',  // E - Email
            ahora,             // F - Fecha_Registro
            0,                 // G - Ciclo_Actual
            0,                 // H - Total_Articulos_Historico
            'Ninguno',         // I - Beneficio_Disponible
            '',                // J - Notas_Admin
            'si',              // K - Activo
            ahora,             // L - Ultimo_Acceso
          ]);
        } else {
          // Usuario existente — bloquear si Activo dice explícitamente 'no'
          if (existe.Activo?.toLowerCase() === 'no') {
            console.log(`Acceso bloqueado para ${user.email}: usuario inactivo`);
            return false;
          }

          // Actualizar Ultimo_Acceso — columna L = 12
          const usuarioRow = await findRow('USUARIOS', 'Email', user.email!);
          if (usuarioRow) {
            await updateCell('USUARIOS', usuarioRow.rowIndex, 12, ahora);
          }
        }

        return true;
      } catch (error) {
        console.error('Error en signIn:', error);
        // Si Sheets falla, dejamos entrar de todas formas
        // para no bloquear el acceso por un error de red
        return true;
      }
    },

    async jwt({ token }) {
      // Se ejecuta en cada request que valida sesión (incluyendo el
      // middleware vía getToken()). Sin esto, token.rol nunca existe y
      // el middleware bloquea a todos los admins sin importar el Sheet.
      if (!token.email) return token;

      try {
        const usuarios = await getSheetData('USUARIOS');
        const usuario = usuarios.find((u) => u.Email === token.email);
        if (usuario) {
          (token as any).rol = usuario.Rol || 'cliente';
          (token as any).id_usuario = usuario.ID_Usuario;
          (token as any).activo = usuario.Activo || 'si';
        }
      } catch (error) {
        console.error('Error en jwt callback:', error);
      }

      return token;
    },

    async session({ session }) {
      if (!session.user?.email) return session;

      try {
        const usuarios = await getSheetData('USUARIOS');
        const usuario = usuarios.find((u) => u.Email === session.user!.email);

        if (usuario) {
          (session.user as any).id_usuario = usuario.ID_Usuario;
          (session.user as any).rol = usuario.Rol || 'cliente';
          (session.user as any).beneficio = usuario.Beneficio_Disponible;
          (session.user as any).ciclo_actual = parseInt(usuario.Ciclo_Actual) || 0;
          (session.user as any).telefono = usuario.Telefono || '';
          (session.user as any).activo = usuario.Activo || 'si';
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
