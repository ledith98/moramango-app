import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';

export async function GET() {
  try {
    const todos = await getSheetData('Productos');

    const publicos = todos
      .filter((p) => p.Disponible === 'TRUE' || p.Disponible === 'true')
      .map((p) => ({
        id: p.ID_Producto,
        nombre: p.Nombre,
        categoria: p.Categoria ?? p['Categoría'] ?? 'Otros',
        descripcion: p.Descripcion ?? '',
        precio: parseFloat(p.Precio_Venta) || 0,
        imagen: p.Imagen_URL ?? '',
        emoji: (p.Emoji ?? '').trim(),
        orden: parseInt(p.Orden_Menu) || 999,
      }))
      .sort((a, b) => a.orden - b.orden);

    return NextResponse.json({ productos: publicos });
  } catch (error) {
    console.error('Error en /api/productos:', error);
    return NextResponse.json(
      { error: 'No se pudo cargar el catálogo' },
      { status: 500 }
    );
  }
}