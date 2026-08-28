import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';
import { normalizarUrlImagen } from '@/lib/imagenes';
import { leerAjustes, posicionCategoria } from '@/lib/ajustes';
import { estadoTienda } from '@/lib/horario';
import { horariosDisponibles } from '@/lib/recoleccion';
import { parsearTamanos } from '@/lib/tamanos';
import { parsearOpciones } from '@/lib/opciones';
import { agotadasDeGrupos, claveNombre, comboImposible } from '@/lib/opcionesAgotadas';
import { parsearExtras } from '@/lib/extras';

export async function GET() {
  try {
    // Las dos lecturas van juntas: en fila, el menú tardaba lo de una más
    // lo de la otra sin que ninguna dependa de la anterior.
    //
    // crudo: con el locale es_ES un precio de 52.50 se leía "52,50" y
    // parseFloat lo truncaba a 52. Hoy todos son enteros y nadie lo notó,
    // pero el primer precio con centavos habría cobrado de menos.
    const [{ ordenCategorias, horario, direccion, mapa }, todos] = await Promise.all([
      leerAjustes(),
      getSheetData('Productos', { crudo: true }),
    ]);

    // Qué productos NO se pueden preparar hoy. Se calcula sobre TODOS,
    // incluidos los ocultos: un jugo sacado del menú tampoco se puede
    // servir dentro de un combo, y desde la lista pública no se vería.
    const agotados = new Set(
      todos
        .filter((p) => (p.Eliminado || '').toUpperCase() !== 'TRUE')
        .filter((p) => {
          if ((p.Oculto || '').toUpperCase() === 'TRUE') return true;
          if ((p.Disponible ?? '').toString().toUpperCase() === 'FALSE') return true;
          const ex = (p.Existencias ?? '').toString().trim();
          return ex !== '' && (parseFloat(ex) || 0) <= 0;
        })
        .map((p) => claveNombre(p.Nombre))
    );

    /**
     * Los nombres de todo el menú, para poder ligar una opción de combo
     * con su producto aunque esté escrita corta ("Plátano" por "Licuado
     * de Plátano").
     */
    const nombresDelMenu = todos
      .filter((p) => (p.Eliminado || '').toUpperCase() !== 'TRUE')
      .map((p) => (p.Nombre || '').trim())
      .filter(Boolean);

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
        // Cuáles de esas opciones no se pueden preparar hoy
        opcionesAgotadas: agotadasDeGrupos(
          parsearOpciones(p.Opciones ?? ''),
          agotados,
          nombresDelMenu
        ),
        // Toppings opcionales que suman al precio
        extras: parsearExtras(p.Extras ?? ''),
        // Existencias por producto: solo se usa en los de reventa (conchas,
        // galletas…). Los elaborados la dejan vacía y NO muestran "últimas
        // piezas". Vacío = sin control de existencias, sin límite.
        disponibles: (p.Existencias ?? '').toString().trim() === ''
          ? null
          : Math.max(0, Math.floor(parseFloat(p.Existencias) || 0)),
        /**
         * false = pausado a mano desde el panel, se ve pero no se vende.
         * Un combo también se apaga si algún grupo se quedó sin una sola
         * opción posible: sin bebida no hay Combo 1, aunque el combo en sí
         * esté marcado disponible.
         */
        disponible:
          (p.Disponible ?? '').toString().toUpperCase() !== 'FALSE' &&
          !comboImposible(
            parsearOpciones(p.Opciones ?? ''),
            agotadasDeGrupos(parsearOpciones(p.Opciones ?? ''), agotados, nombresDelMenu)
          ),
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
      local: { direccion, mapa },
      // A qué horas puede pasar hoy por su pedido
      horariosRecoleccion: horariosDisponibles(horario),
    });
  } catch (error) {
    console.error('Error en /api/productos:', error);
    return NextResponse.json(
      { error: 'No se pudo cargar el catálogo' },
      { status: 500 }
    );
  }
}