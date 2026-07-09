import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const pathname = req.nextUrl.pathname;

  // Aquí solo se exige estar logueado. El check de rol=admin se hace con
  // datos frescos del Sheet en requireAdmin() (páginas) y getAdminSession()
  // (API routes) — el token JWT de la cookie puede traer un rol viejo hasta
  // que el usuario re-inicie sesión, así que no es confiable para el rol.
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (!token) {
      if (pathname.startsWith('/api/admin')) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  if (pathname.startsWith('/pedidos') || pathname.startsWith('/perfil')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/pedidos/:path*', '/perfil/:path*'],
};