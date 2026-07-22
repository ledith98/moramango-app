import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';
import { disponibilidadPorProducto, type DisponibilidadProducto } from '@/lib/disponibilidad';
import { normalizarUrlImagen } from '@/lib/imagenes';
import { HOJA_ACTIVOS, HOJA_BIBLIOTECA } from '@/lib/inventario';

/** Vacío si el inventario aún no está armado: la tienda no debe caerse. */
async function calcularDisponibilidad(): Promise<Map<string, DisponibilidadProducto>> {
  try {
    const [catalogo, biblioteca, activos] = await Promise.all([
      getSheetData('Catalogo'),
      getSheetData(HOJA_BIBLIOTECA, { crudo: true }),
      getSheetData(HOJA_ACTIVOS, { crudo: true }),
    ]);
    return disponibilidadPorProducto(catalogo, biblioteca, activos);
  } catch {
    return new Map();
  }
}

export async function GET() {
  try {
    // crudo: con el locale es_ES un precio de 52.50 se leía "52,50" y
    // parseFloat lo truncaba a 52. Hoy todos son enteros y nadie lo notó,
    // pero el primer precio con centavos habría cobrado de menos.
    const todos = await getSheetData('Productos', { crudo: true });

    // El inventario puede no existir todavía: si falla, la tienda sigue
    // funcionando sin límites de stock (que es como estaba antes).
    const disponibilidad = await calcularDisponibilidad();

    const publicos = todos
      // Tres estados, no dos:
      //   Oculto=TRUE            → ni siquiera aparece
      //   Disponible=FALSE       → aparece, pero no se puede comprar
      //   Disponible=TRUE        → normal
      // Así se puede pausar la venta de algo sin borrarlo del menú: el
      // cliente ve que existe y que hoy no hay.
      .filter((p) => (p.Oculto || '').toUpperCase() !== 'TRUE')
      .filter((p) => (p.Eliminado || '').toUpperCase() !== 'TRUE')
      .map((p) => ({
        id: p.ID_Producto,
        nombre: p.Nombre,
        categoria: p.Categoria ?? p['Categoría'] ?? 'Otros',
        descripcion: p.Descripcion ?? '',
        precio: parseFloat(p.Precio_Venta) || 0,
        // Se normaliza también al leer: cubre las URLs que ya estaban
        // guardadas antes de que existiera la traducción
        imagen: normalizarUrlImagen(p.Imagen_URL ?? ''),
        emoji: (p.Emoji ?? '').trim(),
        disponibles: disponibilidad.get(p.ID_Producto)?.disponibles ?? null,
        /** false = pausado a mano desde el panel, se ve pero no se vende */
        disponible: (p.Disponible ?? '').toString().toUpperCase() !== 'FALSE',
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