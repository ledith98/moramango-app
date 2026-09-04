/**
 * unidades.ts
 *
 * Que no se pueda capturar "1 kilo = 100 gramos".
 *
 * La equivalencia dice cuántas unidades de receta trae una unidad de
 * compra: 1 Litro = 1000 ml. Es un número que se teclea, y cuando sale
 * mal no se nota: no hay pantalla roja, simplemente el costo y el
 * inventario de ese insumo quedan multiplicados o divididos por diez, y
 * eso se descubre semanas después cuadrando un margen que no da.
 *
 * Ya pasó dos veces en la hoja:
 *   Rajas de Jalapeño   1 kilo = 100 gramos   (son 1000)
 *   Avena               1 kg   = 500 g        (son 1000)
 *
 * Hay dos errores que sí se pueden atrapar sin adivinar nada:
 *
 *   1. Un par de unidades conocido con el número equivocado. Un kilo son
 *      mil gramos siempre, en cualquier insumo del mundo.
 *   2. La misma unidad de los dos lados con un número distinto de 1.
 *      "1 pieza = 500 piezas" no es una equivalencia, es un empaque mal
 *      nombrado: lo que se compra es un PAQUETE de 500 piezas.
 *
 * Lo que NO se revisa: los pares que no se pueden saber. Cuántas rebanadas
 * trae un kilo de queso depende del queso y del grosor, así que ahí el
 * número lo pone quien compra y el programa se calla.
 *
 * Módulo puro: lo usan el servidor al guardar y la pantalla al escribir.
 */

/** Un nombre de unidad, sin acentos, plurales ni mayúsculas. */
export function claveUnidad(u: string): string {
  const limpia = (u ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  // Los nombres largos en plural se singularizan; "kg" y "ml" se quedan.
  return limpia.length > 3 && limpia.endsWith('s') ? limpia.slice(0, -1) : limpia;
}

/** Familias de nombres que significan lo mismo. */
const FAMILIAS: Record<string, string[]> = {
  kg: ['kg', 'kilo', 'kilogramo', 'kgs'],
  g: ['g', 'gr', 'gramo'],
  l: ['l', 'lt', 'litro'],
  ml: ['ml', 'mililitro'],
};

/** A qué familia pertenece un nombre de unidad, o '' si no es de peso ni volumen. */
function familia(u: string): string {
  const c = claveUnidad(u);
  for (const [nombre, nombres] of Object.entries(FAMILIAS)) {
    if (nombres.includes(c)) return nombre;
  }
  return '';
}

/** Cuánto vale una unidad de compra en unidades de receta, cuando se sabe. */
const CONOCIDAS: Record<string, number> = {
  'kg->g': 1000,
  'kg->kg': 1,
  'l->ml': 1000,
  'l->l': 1,
  'g->g': 1,
  'ml->ml': 1,
};

export interface RevisionEquivalencia {
  ok: boolean;
  /** Qué debería decir, cuando se puede saber */
  esperado?: number;
  mensaje?: string;
}

/**
 * ¿Tiene sentido esta equivalencia?
 *
 * Devuelve ok cuando el par de unidades no se puede juzgar, que es la
 * mayoría de los casos: un paquete puede traer las piezas que sea.
 */
export function revisarEquivalencia(
  unidadCompra: string,
  unidadReceta: string,
  equivalencia: number
): RevisionEquivalencia {
  if (!(equivalencia > 0)) {
    return { ok: false, mensaje: 'La equivalencia tiene que ser mayor a 0.' };
  }

  const compra = (unidadCompra ?? '').toString().trim();
  const receta = (unidadReceta ?? '').toString().trim();
  if (!compra || !receta) return { ok: true };

  const fc = familia(compra);
  const fr = familia(receta);

  // Par conocido de peso o volumen: el número no es opinable
  if (fc && fr) {
    const esperado = CONOCIDAS[`${fc}->${fr}`];
    if (esperado !== undefined && Math.abs(equivalencia - esperado) > 0.0001) {
      return {
        ok: false,
        esperado,
        mensaje:
          esperado === 1
            ? `1 ${compra} es 1 ${receta}, no ${equivalencia}. Si lo que compras trae varios, escribe cómo se llama el bulto en «Se compra por» (paquete, caja, bote…).`
            : `1 ${compra} son ${esperado} ${receta}, no ${equivalencia}.`,
      };
    }
    return { ok: true };
  }

  /*
    Misma unidad de los dos lados. "1 pieza = 500 piezas" no existe: lo
    que se compra es un paquete de 500. Se atrapa aquí porque es el mismo
    error que el de arriba, pero con unidades que el programa no conoce
    (piezas, bolsas, hojas) y por eso no cabía en la tabla.
  */
  if (claveUnidad(compra) === claveUnidad(receta) && Math.abs(equivalencia - 1) > 0.0001) {
    return {
      ok: false,
      esperado: 1,
      mensaje: `Pusiste que 1 ${compra} son ${equivalencia} ${receta}. Si compras un paquete de ${equivalencia}, escribe «paquete» en «Se compra por» en vez de «${compra}».`,
    };
  }

  return { ok: true };
}

/**
 * Unidades que se cuentan de una en una, no se pesan.
 *
 * Sirven para atrapar el otro error de captura que ya se coló: una
 * presentación del plátano decía "trae 1000" cuando la receta lo pide por
 * pieza — alguien anotó los gramos. Nadie compra mil plátanos.
 */
const SE_CUENTAN = [
  'pieza',
  'rebanada',
  'hoja',
  'bolsa',
  'bote',
  'vaso',
  'tapa',
  'sobre',
  'cuchara',
  'bowl',
  'porcion',
  'paquete',
  'caja',
];

/** A partir de cuántas piezas el número deja de ser creíble. */
const DEMASIADAS = 500;

/**
 * ¿Este contenido parece gramos metidos donde van piezas?
 *
 * Es un AVISO, no un error: un paquete de mil servilletas existe. Solo
 * pide una segunda mirada antes de guardar.
 */
export function contenidoSospechoso(unidadReceta: string, contenido: number): string {
  const c = claveUnidad(unidadReceta);
  if (!SE_CUENTAN.includes(c)) return '';
  if (!(contenido >= DEMASIADAS)) return '';
  return `¿De verdad trae ${contenido} ${unidadReceta}? Es mucho para algo que se cuenta. Si anotaste los gramos, el número va en ${unidadReceta}.`;
}
