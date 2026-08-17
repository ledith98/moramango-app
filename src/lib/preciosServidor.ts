/**
 * preciosServidor.ts
 *
 * Resuelve el precio real de lo que se está vendiendo leyéndolo de la hoja
 * Productos, en vez de creerle al navegador.
 *
 * Hasta ahora el total se calculaba con el precio que mandaba el cliente,
 * así que un pedido armado a mano podía pagar lo que quisiera. Con precios
 * por tamaño el riesgo crece —hay más de un precio válido por producto— y
 * es justo el lugar donde conviene cerrarlo.
 */

import { getSheetData } from './googleSheets';
import {
  claveEleccion,
  type Eleccion,
  parsearOpciones,
  resumenEleccion,
  validarEleccion,
} from './opciones';
import { claveLinea, nombreConTamano, parsearTamanos, precioDeTamano } from './tamanos';
import { claveNombre } from './opcionesAgotadas';
import {
  claveExtras,
  type Extra,
  parsearExtras,
  precioExtras,
  resumenExtras,
  validarExtras,
} from './extras';

export interface ItemEntrante {
  id?: string;
  nombre?: string;
  precio?: number | string;
  cantidad?: number | string;
  /** Nombre del tamaño elegido ("1 litro"); vacío si el producto no tiene */
  tamano?: string;
  /** Lo elegido en cada grupo: { Queso: 'Queso suizo' } */
  opciones?: Eleccion;
  /** Toppings elegidos; cada uno suma a lo que se cobra */
  extras?: unknown;
}

export interface ItemValidado {
  id: string;
  /** Ya con el tamaño entre paréntesis, listo para el ticket y la hoja */
  nombre: string;
  precio: number;
  cantidad: number;
  tamano: string;
  opciones: Eleccion;
  extras: Extra[];
  /** Identifica el renglón: mismo producto con distinto queso son dos */
  clave: string;
  categoria: string;
}

export type ResultadoValidacion =
  | { ok: true; items: ItemValidado[]; total: number }
  | { ok: false; error: string };

/**
 * Devuelve los items con el precio que manda la hoja. Si algo no cuadra
 * —producto que no existe, tamaño que no se ofrece— falla en vez de
 * cobrar un importe inventado.
 */
export async function validarItems(items: ItemEntrante[]): Promise<ResultadoValidacion> {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'El carrito está vacío' };
  }

  const productos = await getSheetData('Productos', { crudo: true });
  const porId = new Map(productos.map((p) => [p.ID_Producto, p]));

  // Productos que hoy no se pueden preparar. Sirve para frenar un combo
  // que pide un jugo agotado: la tienda ya no deja elegirlo, pero quien
  // dejó la ficha abierta desde antes sí podría mandarlo.
  const agotados = new Set(
    productos
      .filter((p) => (p.Eliminado || '').toUpperCase() !== 'TRUE')
      .filter((p) => {
        if ((p.Oculto || '').toUpperCase() === 'TRUE') return true;
        if ((p.Disponible ?? '').toString().toUpperCase() === 'FALSE') return true;
        const ex = (p.Existencias ?? '').toString().trim();
        return ex !== '' && (parseFloat(ex) || 0) <= 0;
      })
      .map((p) => claveNombre(p.Nombre))
  );

  const validados: ItemValidado[] = [];
  for (const item of items) {
    const p = porId.get((item.id ?? '').toString());
    if (!p) {
      return { ok: false, error: `Ya no tenemos "${item.nombre ?? item.id}" en el menú` };
    }
    if ((p.Eliminado || '').toUpperCase() === 'TRUE') {
      return { ok: false, error: `"${p.Nombre}" ya no está en el menú` };
    }

    const cantidad = Math.floor(Number(item.cantidad));
    if (!Number.isFinite(cantidad) || cantidad < 1) {
      return { ok: false, error: `Cantidad inválida en "${p.Nombre}"` };
    }

    const tamanos = parsearTamanos(p.Tamanos ?? '');
    let precio: number;
    let tamano = '';

    if (tamanos.length > 0) {
      tamano = (item.tamano ?? '').toString().trim();
      if (!tamano) {
        return { ok: false, error: `Elige el tamaño de "${p.Nombre}"` };
      }
      const encontrado = precioDeTamano(tamanos, tamano);
      if (encontrado === null) {
        return { ok: false, error: `"${tamano}" ya no está disponible en "${p.Nombre}"` };
      }
      precio = encontrado;
    } else {
      precio = parseFloat((p.Precio_Venta ?? '').toString().replace(',', '.'));
      if (isNaN(precio) || precio < 0) {
        return { ok: false, error: `"${p.Nombre}" no tiene precio configurado` };
      }
    }

    // Opciones a elegir dentro del producto (queso, sabor de la bebida…).
    // No cambian el precio, pero sí lo que hay que preparar, así que se
    // exigen igual que el tamaño.
    const grupos = parsearOpciones(p.Opciones ?? '');
    const revision = validarEleccion(grupos, item.opciones);
    if (!revision.ok) {
      return { ok: false, error: `${revision.error} en "${p.Nombre}"` };
    }
    const eleccion = revision.eleccion;

    // Lo elegido tiene que poder prepararse: de nada sirve aceptar un
    // Combo 1 con jugo de mango si el mango se acabó hace dos horas.
    for (const [grupo, valor] of Object.entries(eleccion)) {
      if (agotados.has(claveNombre(valor))) {
        return {
          ok: false,
          error: `Se nos acabó "${valor}" (${grupo.toLowerCase()}). Elige otra opción en "${p.Nombre}".`,
        };
      }
    }

    // Toppings: son opcionales, pero el que se pida tiene que existir y
    // se cobra con el precio de la hoja, no con el que mande el navegador.
    const revisionExtras = validarExtras(parsearExtras(p.Extras ?? ''), item.extras);
    if (!revisionExtras.ok) {
      return { ok: false, error: `${revisionExtras.error} en "${p.Nombre}"` };
    }
    const extras = revisionExtras.extras;

    // "Combo 1 (Queso suizo · Jugo de Mango)" o "Licuado (1 litro · + Chía)"
    const detalle = [tamano, resumenEleccion(grupos, eleccion), resumenExtras(extras)]
      .filter(Boolean)
      .join(' · ');

    validados.push({
      id: p.ID_Producto,
      nombre: nombreConTamano(p.Nombre, detalle),
      precio: precio + precioExtras(extras),
      cantidad,
      tamano,
      opciones: eleccion,
      extras,
      clave: claveLinea(
        p.ID_Producto,
        tamano,
        `${claveEleccion(grupos, eleccion)}#${claveExtras(extras)}`
      ),
      categoria: (p['Categoría'] ?? p.Categoria ?? '').toString(),
    });
  }

  const total = validados.reduce((s, i) => s + i.precio * i.cantidad, 0);
  return { ok: true, items: validados, total };
}
