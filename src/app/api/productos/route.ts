import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';
import { normalizarUrlImagen } from '@/lib/imagenes';
import { leerAjustes, posicionCategoria } from '@/lib/ajustes';
import { estadoTienda } from '@/lib/horario';
import { parsearTamanos } from '@/lib/tamanos';
import { parsearOpciones } from '@/lib/opciones';
import { parsearExtras } from '@/lib/extras';

export async function GET() {
  try {
    // Las dos lecturas van juntas: en fila, el menú tardaba lo de una más
    // lo de la otra sin que ninguna dependa de la anterior.
    //
    // crudo: con el locale es_ES un precio de 52.50 se leía "52,50" y
    // parseFloat lo truncaba a 52. Hoy todos son enteros y nadie lo notó,
    // pero el primer precio con centavos habría cobrado de menos.
    const [{ ordenCategorias, horario }, todos] = await Promise.all([
      leerAjustes(),
      getSheetData('Productos', { crudo: true }),
    ]);

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
        // Tamaños con precio propio. Vacío = un solo precio, como siempre.
        tamanos: parsearTamanos(p.Tamanos ?? ''),
        // Lo que el cliente elige dentro del producto: queso, sabor…
        opciones: parsearOpciones(p.Opciones ?? ''),
        // Toppings opcionales que suman al precio
        extras: parsearExtras(p.Extras ?? ''),
        // Existencias por producto: solo se usa en los de reventa (conchas,
        // galletas…). Los elaborados la dejan vacía y NO muestran "últimas
        // piezas". Vacío = sin control de existencias, sin límite.
        disponibles: (p.Existencias ?? '').toString().trim() === ''
          ? null
          : Math.max(0, Math.floor(parseFloat(p.Existencias) || 0)),
        /** false = pausado a mano desde el panel, se ve pero no se vende */
        disponible: (p.Disponible ?? '').toString().toUpperCase() !== 'FALSE',
        orden: parseInt(p.Orden_Menu) || 999,
      }))
      // Primero manda el grupo (Combos, Comida salada…) y ya dentro de cada
      // grupo el orden del producto. La tienda arma las secciones siguiendo
      // este arreglo, así que ordenar aquí es lo que mueve el menú.
      .sort(
        (a, b) =>
          posicionCategoria(a.categoria, ordenCategorias) -
            posicionCategoria(b.categoria, ordenCategorias) || a.orden - b.orden
      );

    // El estado se calcula aquí y no en el celular del cliente: si lo tiene
    // en otra hora o con la fecha mal, vería la tienda abierta a deshoras.
    return NextResponse.json({
      productos: publicos,
      ordenCategorias,
      tienda: estadoTienda(horario),
      horario,
    });
  } catch (error) {
    console.error('Error en /api/productos:', error);
    return NextResponse.json(
      { error: 'No se pudo cargar el catálogo' },
      { status: 500 }
    );
  }
}