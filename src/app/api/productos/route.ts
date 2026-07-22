import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';

export async function GET() {
  try {
    // crudo: con el locale es_ES un precio de 52.50 se leía "52,50" y
    // parseFloat lo truncaba a 52. Hoy todos son enteros y nadie lo notó,
    // pero el primer precio con centavos habría cobrado de menos.
    const todos = await getSheetData('Productos', { crudo: true });

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