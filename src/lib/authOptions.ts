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
import { enviarTelegram } from './telegram';

// Cada cuánto se relee el rol/beneficio desde la hoja USUARIOS. Entre
// refrescos, el dato viaja en la cookie de sesión sin tocar el Sheet.
const REFRESCO_ROL_MS = 3 * 60 * 1000;

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

          // Aviso de cliente nuevo. Va por Telegram y nunca rompe el
          // registro: si el aviso falla, la persona igual entra.
          try {
            await enviarTelegram(
              `🎉 <b>Cliente nuevo en Moramango</b>
` +
                `👤 ${user.name || 'Sin nombre'}
` +
                `✉️ ${user.email || '—'}
` +
                `<i>Todavía no captura su teléfono</i>`
            );
          } catch (error) {
            console.error('Error avisando de cliente nuevo:', error);
          }
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
      // El token (cookie firmada) es la ÚNICA fuente que lee la hoja
      // USUARIOS; session() solo lo copia. Antes ambos leían la hoja en
      // cada request = 2 lecturas por petición, y bajo uso intenso se
      // topaba la cuota de Google (429) → el rol quedaba vacío → se
      // expulsaba al admin al inicio.
      //
      // El rol se refresca a lo más cada REFRESCO_ROL_MS, no en cada
      // request: un cambio de rol/beneficio aplica en minutos, sin
      // martillar el Sheet.
      if (!token.email) return token;

      const t = token as any;
      const ahora = Date.now();
      const vencido = !t.rolLeidoEn || ahora - t.rolLeidoEn > REFRESCO_ROL_MS;
      if (t.rol && !vencido) return token;

      try {
        const usuarios = await getSheetData('USUARIOS');
        const usuario = usuarios.find((u) => u.Email === token.email);
        if (usuario) {
          t.rol = usuario.Rol || 'cliente';
          t.id_usuario = usuario.ID_Usuario;
          t.activo = usuario.Activo || 'si';
          t.beneficio = usuario.Beneficio_Disponible || '';
          t.ciclo_actual = parseInt(usuario.Ciclo_Actual) || 0;
          t.telefono = usuario.Telefono || '';
          t.rolLeidoEn = ahora;
        }
      } catch (error) {
        console.error('Error en jwt callback:', error);
      }

      return token;
    },

    async session({ session, token }) {
      // Copia desde el token; NO lee la hoja (ver jwt callback arriba)
      const t = token as any;
      if (session.user) {
        (session.user as any).id_usuario = t.id_usuario;
        (session.user as any).rol = t.rol;
        (session.user as any).beneficio = t.beneficio;
        (session.user as any).ciclo_actual = t.ciclo_actual ?? 0;
        (session.user as any).telefono = t.telefono || '';
        (session.user as any).activo = t.activo || 'si';
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
