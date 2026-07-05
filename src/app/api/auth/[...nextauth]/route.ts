/**
 * app/api/auth/[...nextauth]/route.ts
 *
 * Conecta NextAuth con Next.js.
 * Los corchetes capturan todas las rutas de auth:
 * /api/auth/signin, /api/auth/signout, /api/auth/session, etc.
 *
 * No necesitas modificar este archivo.
 */

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/authOptions';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
