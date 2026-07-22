import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Moramango — Blend to Go',
  description: 'Pide en línea y recoge sin filas. San Nicolás de los Garza.',
  manifest: '/manifest.json',
  // El ícono de la pestaña lo resuelve Next con src/app/icon.png; aquí van
  // los que el sistema operativo necesita al "Instalar aplicación".
  icons: {
    icon: [
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    // iOS ignora el manifest: sin esta etiqueta pone una captura de la
    // pantalla en vez del logo.
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Moramango',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  // Pinta la barra del navegador con el café de la marca
  themeColor: '#5c3a21',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}