/**
 * tamanos.ts
 *
 * Tamaños con precio propio (500 ml / 1 litro) para jugos y licuados.
 *
 * Van en una sola columna `Tamanos` de la hoja Productos, con el formato
 * `500 ml:45|1 litro:80`, en vez de una columna por tamaño: así se puede
 * agregar un tamaño nuevo sin tocar la estructura del Sheet.
 *
 * Lógica pura, sin Google Sheets, porque la usan la tienda y el punto de
 * venta (que corren en el navegador) y también el servidor al cobrar.
 */

export interface Tamano {
  nombre: string;
  precio: number;
}

/** Lo que se ofrece al configurar un jugo o licuado por primera vez. */
export const TAMANOS_SUGERIDOS = ['500 ml', '1 litro'];

const SEPARADOR = '|';

/**
 * Un producto sin tamaños se sigue vendiendo con su Precio_Venta de
 * siempre; devolver una lista vacía es lo que mantiene ese caso intacto.
 */
export function parsearTamanos(crudo: string): Tamano[] {
  const texto = (crudo ?? '').toString().trim();
  if (!texto) return [];

  const tamanos: Tamano[] = [];
  for (const tramo of texto.split(SEPARADOR)) {
    // Se corta en el ÚLTIMO ":" por si el nombre llevara uno
    const corte = tramo.lastIndexOf(':');
    if (corte === -1) continue;
    const nombre = tramo.slice(0, corte).trim();
    // La hoja está en es_ES: un precio con centavos puede venir con coma
    const precio = parseFloat(tramo.slice(corte + 1).trim().replace(',', '.'));
    if (!nombre || isNaN(precio) || precio < 0) continue;
    if (tamanos.some((t) => iguales(t.nombre, nombre))) continue;
    tamanos.push({ nombre, precio });
  }
  return tamanos;
}

export function serializarTamanos(tamanos: Tamano[]): string {
  return tamanos
    .filter((t) => t.nombre.trim() && !isNaN(t.precio) && t.precio >= 0)
    .map((t) => `${t.nombre.trim()}:${Math.round(t.precio * 100) / 100}`)
    .join(SEPARADOR);
}

/** "1 Litro" y "1 litro" son el mismo tamaño. */
export function iguales(a: string, b: string): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

/**
 * Precio real de un tamaño. Devuelve null si ese tamaño no existe, para
 * que quien cobra pueda rechazar la venta en vez de inventar un precio.
 */
export function precioDeTamano(tamanos: Tamano[], nombre: string): number | null {
  const t = tamanos.find((x) => iguales(x.nombre, nombre));
  return t ? t.precio : null;
}

/** El más barato: es el que se muestra como "desde $X" en el menú. */
export function precioDesde(tamanos: Tamano[], precioBase: number): number {
  if (tamanos.length === 0) return precioBase;
  return Math.min(...tamanos.map((t) => t.precio));
}

/**
 * Identifica un renglón del carrito. No basta el id del producto: el mismo
 * jugo puede ir en 500 ml y en 1 litro, y son dos renglones con precios
 * distintos. `extra` sirve para lo que también separa renglones sin
 * cambiar el precio, como el queso elegido en un combo.
 */
export function claveLinea(id: string, tamano?: string, extra?: string): string {
  return `${id}::${(tamano ?? '').trim().toLowerCase()}::${(extra ?? '').trim().toLowerCase()}`;
}

/** "Jugo de Mango (1 litro)" para el ticket y la hoja de pedidos. */
export function nombreConTamano(nombre: string, tamano?: string): string {
  return tamano?.trim() ? `${nombre} (${tamano.trim()})` : nombre;
}
