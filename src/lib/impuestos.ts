/**
 * impuestos.ts
 *
 * Cuánto de cada precio es tuyo y cuánto es del SAT.
 *
 * El precio del menú trae el IVA adentro: un licuado de $55 son $47.41
 * tuyos y $7.59 que cobras para el SAT. Hasta ahora el recetario comparaba
 * el costo contra los $55 completos, así que el margen se veía mejor de lo
 * que es — y es justo el error que hace subir mal los precios.
 *
 * El ISR va sobre la utilidad, no sobre la venta, y su tasa es progresiva
 * y anual. Aquí se aplica un porcentaje estimado, configurable en Ajustes,
 * solo para ver el pedido completo; la cifra fina la da el contador.
 *
 * Lógica pura, sin Google Sheets: la usan el recetario, el catálogo y
 * cualquier pantalla que enseñe un precio.
 */

/** Alimentos preparados en México. */
export const IVA_DEFAULT = 16;

/**
 * ISR estimado sobre la utilidad. 6.4% es el tramo en el que cae hoy una
 * utilidad como la del local; cámbialo en Ajustes cuando el contador dé
 * el suyo.
 */
export const ISR_DEFAULT = 6.4;

/**
 * Cuánto quieres que te quede de cada venta, ya pagando IVA, insumos e
 * ISR. 40% es lo que sostiene renta, luz, agua y un sueldo.
 *
 * Se piensa en ganancia y no en "los insumos no deben pasar del 33%"
 * porque es la pregunta que de verdad se hace: cuánto me queda y a cómo
 * tengo que venderlo.
 */
export const GANANCIA_DEFAULT = 40;

export interface TasasImpuesto {
  ivaPct: number;
  isrPct: number;
}

export interface Desglose {
  /** Lo que paga el cliente, con IVA adentro */
  precio: number;
  /** Lo que entra al negocio */
  sinIva: number;
  /** Lo que se le entrega al SAT */
  iva: number;
  costo: number;
  /** Precio menos costo, sin contar impuestos: lo que se veía antes */
  margenBruto: number;
  margenBrutoPct: number;
  /** Utilidad después del IVA y del ISR estimado */
  margenNeto: number;
  /** El neto sobre lo que paga el cliente */
  margenNetoPct: number;
  isr: number;
  /** Qué tanto del precio sin IVA se va en insumos */
  insumoPct: number;
}

const redondear = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Reparte un precio de menú entre costo, impuestos y ganancia. */
export function desglosar(precio: number, costo: number, tasas: TasasImpuesto): Desglose {
  const iva = Math.max(0, tasas.ivaPct) / 100;
  const sinIva = precio / (1 + iva);
  const antesIsr = sinIva - costo;
  // Sin ganancia no hay ISR que pagar: sobre pérdida no se cobra.
  const isr = antesIsr > 0 ? antesIsr * (Math.max(0, tasas.isrPct) / 100) : 0;
  return {
    precio: redondear(precio),
    sinIva: redondear(sinIva),
    iva: redondear(precio - sinIva),
    costo: redondear(costo),
    margenBruto: redondear(precio - costo),
    margenBrutoPct: precio > 0 ? redondear(((precio - costo) / precio) * 100, 1) : 0,
    isr: redondear(isr),
    margenNeto: redondear(antesIsr - isr),
    margenNetoPct: precio > 0 ? redondear(((antesIsr - isr) / precio) * 100, 1) : 0,
    insumoPct: sinIva > 0 ? redondear((costo / sinIva) * 100, 1) : 0,
  };
}

/**
 * A cuánto hay que venderlo para que quede la ganancia que se pide.
 *
 * Se despeja de la misma cuenta del desglose: de lo que paga el cliente
 * sale primero el IVA, luego los insumos y al final el ISR de lo que
 * sobra. Se redondea hacia ARRIBA a los $5 — la diferencia entre $48 y
 * $50 no la nota nadie y al mes son cientos de pesos.
 *
 * Devuelve null cuando la ganancia pedida es imposible: con IVA del 16%
 * no se puede quedar con el 90% de lo que cobras, por caro que lo pongas.
 */
export function precioParaGanancia(
  costo: number,
  gananciaPct: number,
  tasas: TasasImpuesto
): number | null {
  if (!(costo > 0)) return null;
  const iva = Math.max(0, tasas.ivaPct) / 100;
  const isr = Math.max(0, tasas.isrPct) / 100;
  const m = Math.max(0, Math.min(99, gananciaPct)) / 100;
  const denominador = (1 - isr) / (1 + iva) - m;
  if (denominador <= 0.01) return null;
  return Math.ceil(((costo * (1 - isr)) / denominador) / 5) * 5;
}

/** El techo de ganancia posible: lo que queda después del IVA y del ISR. */
export function gananciaMaxima(tasas: TasasImpuesto): number {
  const iva = Math.max(0, tasas.ivaPct) / 100;
  const isr = Math.max(0, tasas.isrPct) / 100;
  return Math.floor(((1 - isr) / (1 + iva)) * 100) - 1;
}
