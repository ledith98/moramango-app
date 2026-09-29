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
 * Cuánto del precio SIN IVA puede irse en insumos. 33% es lo que deja el
 * resto para renta, luz, agua y sueldo.
 */
export const OBJETIVO_INSUMO_DEFAULT = 33;

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
 * Lo que debería costar en el menú para que los insumos no pasen del
 * objetivo. Se redondea hacia ARRIBA a los $5: la diferencia entre $48 y
 * $50 no la nota nadie y al mes son cientos de pesos.
 */
export function precioSugerido(costo: number, objetivoPct: number, ivaPct: number): number | null {
  const objetivo = Math.max(1, Math.min(99, objetivoPct)) / 100;
  if (!(costo > 0)) return null;
  const conIva = (costo / objetivo) * (1 + Math.max(0, ivaPct) / 100);
  return Math.ceil(conIva / 5) * 5;
}
