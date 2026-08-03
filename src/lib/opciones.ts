/**
 * opciones.ts
 *
 * Opciones a elegir dentro de un producto: el Combo 1 lleva queso suizo o
 * panela, y una bebida entre los jugos y licuados de la casa.
 *
 * Van en una sola columna `Opciones` de la hoja Productos:
 *
 *   Queso=Queso suizo;Queso panela~Bebida=Jugo de Mango;Licuado de Fresa
 *
 * Un grupo por cada decisión que toma el cliente, separados por "~"; el
 * nombre del grupo va antes del "=" y sus opciones separadas por ";".
 * Así se agregan sabores nuevos sin tocar la estructura del Sheet.
 *
 * Lógica pura, sin Google Sheets: la usan la tienda y el mostrador (que
 * corren en el navegador) y también el servidor al cobrar.
 */

export interface GrupoOpcion {
  /** Lo que se le pregunta al cliente: "Queso", "Bebida" */
  nombre: string;
  opciones: string[];
}

/** Lo que eligió el cliente: { Queso: 'Queso suizo', Bebida: 'Jugo de Mango' } */
export type Eleccion = Record<string, string>;

const SEP_GRUPO = '~';
const SEP_NOMBRE = '=';
const SEP_OPCION = ';';

const limpio = (t: string) => (t ?? '').toString().trim();
const igual = (a: string, b: string) => limpio(a).toLowerCase() === limpio(b).toLowerCase();

/** Un producto sin opciones se vende como siempre: lista vacía. */
export function parsearOpciones(crudo: string): GrupoOpcion[] {
  const texto = limpio(crudo);
  if (!texto) return [];

  const grupos: GrupoOpcion[] = [];
  for (const tramo of texto.split(SEP_GRUPO)) {
    const corte = tramo.indexOf(SEP_NOMBRE);
    if (corte === -1) continue;
    const nombre = limpio(tramo.slice(0, corte));
    if (!nombre) continue;

    const opciones: string[] = [];
    for (const o of tramo.slice(corte + 1).split(SEP_OPCION)) {
      const op = limpio(o);
      // Repetir una opción solo confunde al elegir
      if (op && !opciones.some((x) => igual(x, op))) opciones.push(op);
    }
    // Un grupo sin opciones no se le puede preguntar a nadie
    if (opciones.length === 0) continue;
    if (grupos.some((g) => igual(g.nombre, nombre))) continue;
    grupos.push({ nombre, opciones });
  }
  return grupos;
}

export function serializarOpciones(grupos: GrupoOpcion[]): string {
  return grupos
    .map((g) => ({
      nombre: limpio(g.nombre),
      opciones: g.opciones.map(limpio).filter(Boolean),
    }))
    .filter((g) => g.nombre && g.opciones.length > 0)
    .map((g) => `${g.nombre}${SEP_NOMBRE}${g.opciones.join(SEP_OPCION)}`)
    .join(SEP_GRUPO);
}

/**
 * Comprueba que el cliente haya elegido algo válido en cada grupo.
 * Devuelve la elección ya normalizada (con el texto tal como está en el
 * catálogo) o el error a mostrar.
 */
export function validarEleccion(
  grupos: GrupoOpcion[],
  elegido: Eleccion | undefined
): { ok: true; eleccion: Eleccion } | { ok: false; error: string } {
  const eleccion: Eleccion = {};
  for (const g of grupos) {
    const valor = limpio(elegido?.[g.nombre] ?? '');
    if (!valor) return { ok: false, error: `Falta elegir ${g.nombre.toLowerCase()}` };
    const real = g.opciones.find((o) => igual(o, valor));
    if (!real) {
      return { ok: false, error: `No tenemos "${valor}" como ${g.nombre.toLowerCase()}` };
    }
    eleccion[g.nombre] = real;
  }
  return { ok: true, eleccion };
}

/** Elección de arranque: la primera opción de cada grupo. */
export function eleccionInicial(grupos: GrupoOpcion[]): Eleccion {
  const e: Eleccion = {};
  for (const g of grupos) e[g.nombre] = g.opciones[0];
  return e;
}

/** "Queso suizo · Jugo de Mango" — para el nombre del renglón y el ticket. */
export function resumenEleccion(grupos: GrupoOpcion[], eleccion: Eleccion | undefined): string {
  return grupos
    .map((g) => limpio(eleccion?.[g.nombre] ?? ''))
    .filter(Boolean)
    .join(' · ');
}

/**
 * Parte de la llave del renglón del carrito. Dos combos con distinto queso
 * son dos renglones, no uno con cantidad 2.
 */
export function claveEleccion(grupos: GrupoOpcion[], eleccion: Eleccion | undefined): string {
  return grupos
    .map((g) => `${g.nombre.toLowerCase()}:${limpio(eleccion?.[g.nombre] ?? '').toLowerCase()}`)
    .join('|');
}
