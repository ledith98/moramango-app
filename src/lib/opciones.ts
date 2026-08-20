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

/** "queso, bebida y tostado" — para enumerar lo que falta sin sonar a robot. */
export function enumerar(cosas: string[]): string {
  if (cosas.length <= 1) return cosas[0] ?? '';
  return `${cosas.slice(0, -1).join(', ')} y ${cosas[cosas.length - 1]}`;
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
    .map((g) => {
      const valor = limpio(eleccion?.[g.nombre] ?? '');
      // Con el nombre del grupo delante. Sin él, "Mango · No" no dice si
      // el mango es el licuado o el chile, ni qué se contestó que no; y
      // quien prepara el pedido lee justo esta línea.
      return valor ? `${g.nombre}: ${valor}` : '';
    })
    .filter(Boolean)
    .join(' · ');
}

/**
 * Recupera lo que se eligió a partir del nombre guardado del renglón.
 *
 * El pedido guarda "Combo 1 (Queso: Panela · Bebida: Jugo de Mango)", y
 * para repetirlo hay que volver a esas decisiones. Antes no se leían y
 * cualquier producto con opciones se declaraba imposible de repetir, que
 * es justo lo que más se repite: los combos.
 *
 * Los pedidos viejos se guardaron sin el nombre del grupo (solo
 * "Panela · Jugo de Mango"), así que si no aparece la etiqueta se busca
 * el valor entre las opciones que ese grupo ofrece.
 *
 * Devuelve null si alguna decisión no se puede recuperar: es preferible
 * mandar a elegir de nuevo que servir algo distinto a lo que se pidió.
 */
export function eleccionDesdeNombre(grupos: GrupoOpcion[], nombre: string): Eleccion | null {
  if (grupos.length === 0) return {};
  const m = /\(([^()]*)\)\s*$/.exec((nombre ?? '').trim());
  const partes = (m?.[1] ?? '')
    .split('·')
    .map((x) => x.trim())
    .filter(Boolean);

  const eleccion: Eleccion = {};
  for (const g of grupos) {
    const etiqueta = partes.find((x) => limpio(x).toLowerCase().startsWith(`${g.nombre.toLowerCase()}:`));
    let valor = etiqueta ? etiqueta.slice(etiqueta.indexOf(':') + 1).trim() : '';
    // Formato viejo: sin etiqueta, se busca el valor entre lo que ofrece
    // el grupo. Los tamaños y los extras ("+ Chía") nunca coinciden.
    if (!valor) valor = partes.find((x) => g.opciones.some((o) => o.toLowerCase() === x.toLowerCase())) ?? '';
    // Tiene que seguir ofreciéndose hoy: un sabor que se dejó de vender
    // no se puede repetir a ciegas.
    const vigente = g.opciones.find((o) => o.toLowerCase() === valor.toLowerCase());
    if (!vigente) return null;
    eleccion[g.nombre] = vigente;
  }
  return eleccion;
}

/** Lo elegido como renglones sueltos, para listarlo uno debajo de otro. */
export function lineasEleccion(
  grupos: GrupoOpcion[],
  eleccion: Eleccion | undefined
): { grupo: string; valor: string }[] {
  return grupos
    .map((g) => ({ grupo: g.nombre, valor: limpio(eleccion?.[g.nombre] ?? '') }))
    .filter((x) => x.valor);
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
