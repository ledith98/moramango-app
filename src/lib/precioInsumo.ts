/**
 * precioInsumo.ts
 *
 * De qué precio sale el costo de un insumo.
 *
 * Un mismo insumo se compra de varias formas —el queso suizo viene por
 * kilo suelto y en caja Kirkland de 1.36 kg— y cada forma tiene su propio
 * precio. La pregunta "¿cuánto cuesta una rebanada?" no tiene una sola
 * respuesta, y hasta ahora el programa contestaba con la última compra
 * anotada en el insumo: un número suelto que envejecía por su cuenta y no
 * se enteraba de nada.
 *
 * Ahí estaba el error que se veía en pantalla. Se borró la presentación
 * vieja del queso, quedó solo la Kirkland a $2.21 la rebanada, y las
 * recetas seguían costeando a $17.10 porque ese número vivía aparte.
 *
 * Ahora el costo sale de las presentaciones, que es donde de verdad
 * vive el precio, y se puede elegir de cuál:
 *
 *   vacío       el más barato de los que se compran hoy. Es lo que casi
 *               siempre se quiere y no hay que configurar nada.
 *   PRE-xxxx    ese en concreto, cuando el barato no es el que se usa
 *               (viene de lejos, es de otra calidad, hay que pedirlo).
 *   ULTIMA      la última compra anotada en el insumo, ignorando las
 *               presentaciones. Es la salida de emergencia para cuando
 *               una presentación está mal capturada: el plátano tiene
 *               una que dice "trae 1000" cuando la receta lo pide por
 *               pieza, y con esa sale a 2 centavos el plátano. Mientras
 *               se corrige, se fija aquí y el costo no miente.
 *
 * La última compra también es el respaldo automático de los insumos que
 * todavía no tienen ninguna presentación anotada.
 *
 * Módulo puro a propósito: sin googleSheets, para que la pantalla pueda
 * enseñar de dónde sale cada costo sin pedírselo al servidor.
 */

/** Lo que hace falta de una presentación para poder cotizarla. */
export interface PresentacionPrecio {
  id: string;
  marca: string;
  unidadCompra: string;
  contenido: number;
  ultimoPrecio: number;
  activa: boolean;
  /** Precio por unidad de receta: es lo único comparable entre formas */
  porUnidad: number;
}

export type OrigenPrecio = 'presentacion' | 'ultimaCompra' | 'ninguno';

export interface PrecioElegido {
  /** Costo por unidad de receta, sin convertir a cocido */
  costoUnidad: number | null;
  origen: OrigenPrecio;
  /** Vacío si el precio no viene de una presentación */
  idPresentacion: string;
  /** Cómo llamarlo en pantalla: "Kirkland 1.36 kg", "última compra" */
  etiqueta: string;
  /** true = lo escogió el programa por barato, no la dueña */
  automatico: boolean;
}

/** "Kirkland 1.36 kg de 72" — lo justo para reconocerla en una lista. */
export function nombrarPresentacion(p: PresentacionPrecio): string {
  const marca = p.marca && p.marca.toLowerCase() !== 'no aplica' ? `${p.marca} ` : '';
  const unidad = p.unidadCompra || 'paquete';
  return `${marca}${unidad}${p.contenido > 0 ? ` de ${p.contenido}` : ''}`.trim();
}

/** Se puede cotizar: tiene precio y contenido, no importa si está activa. */
const cotizable = (p: PresentacionPrecio) => p.porUnidad > 0;

/** El valor que fija el costo a la última compra del insumo. */
export const USAR_ULTIMA_COMPRA = 'ULTIMA';

/**
 * El precio con el que se costea este insumo.
 *
 * `precioBase` es la elección guardada: vacío para automático, el id de
 * una presentación, o USAR_ULTIMA_COMPRA. Si apunta a una presentación
 * que ya no existe —se borró— no se queda pegado: cae al automático
 * solo, que es lo que hay que hacer cuando desaparece el precio elegido.
 */
export function elegirPrecio(
  precioBase: string,
  presentaciones: PresentacionPrecio[],
  ultimoPrecioCompra: number,
  equivalencia: number
): PrecioElegido {
  const porUltima = (automatico: boolean): PrecioElegido =>
    ultimoPrecioCompra > 0 && equivalencia > 0
      ? {
          costoUnidad: Math.round((ultimoPrecioCompra / equivalencia) * 10000) / 10000,
          origen: 'ultimaCompra',
          idPresentacion: '',
          etiqueta: 'última compra',
          automatico,
        }
      : {
          costoUnidad: null,
          origen: 'ninguno',
          idPresentacion: '',
          etiqueta: 'sin precio',
          automatico,
        };

  if (precioBase === USAR_ULTIMA_COMPRA) return porUltima(false);

  const elegida = precioBase
    ? presentaciones.find((p) => p.id === precioBase && cotizable(p))
    : undefined;

  if (elegida) {
    return {
      costoUnidad: elegida.porUnidad,
      origen: 'presentacion',
      idPresentacion: elegida.id,
      etiqueta: nombrarPresentacion(elegida),
      automatico: false,
    };
  }

  /*
   * Para el automático solo cuentan las que se compran hoy. Una marcada
   * como "ya no la compro así" suele ser justo la barata que dejó de
   * conseguirse; costear con ella daría un margen que no existe.
   */
  const candidatas = presentaciones.filter((p) => cotizable(p) && p.activa);
  if (candidatas.length > 0) {
    const barata = candidatas.reduce((a, b) => (b.porUnidad < a.porUnidad ? b : a));
    return {
      costoUnidad: barata.porUnidad,
      origen: 'presentacion',
      idPresentacion: barata.id,
      etiqueta: nombrarPresentacion(barata),
      automatico: true,
    };
  }

  // Respaldo: el insumo todavía no tiene presentaciones que cotizar
  return porUltima(true);
}

/**
 * Unidades chicas que se compran de a mil, con el nombre del bulto.
 *
 * La receta pide gramos porque es lo que lleva el platillo, pero el
 * aguacate se compra por kilo y nadie tiene en la cabeza cuánto es
 * "$0.093 el gramo". Son el mismo precio; uno se puede comparar contra el
 * letrero de la tienda y el otro no.
 */
const DE_A_MIL: { unidades: string[]; bulto: string }[] = [
  { unidades: ['g', 'gr', 'grs', 'gramo', 'gramos'], bulto: 'kg' },
  { unidades: ['ml', 'mililitro', 'mililitros'], bulto: 'litro' },
];

/**
 * Un precio por unidad de receta, escrito como se compra.
 *
 *   0.093  g          → "$93.00 el kg"
 *   0.0228 ml         → "$22.80 el litro"
 *   2.2083 Rebanadas  → "$2.21 por rebanada"
 *
 * Las unidades que ya se compran así se quedan como están: el pollo por
 * kilo es "$138.10 por kg" y no hay nada que convertir.
 */
export function precioLegible(porUnidad: number, unidadReceta: string): string {
  const u = (unidadReceta || '').trim();
  const bulto = DE_A_MIL.find((d) => d.unidades.includes(u.toLowerCase()))?.bulto;
  if (bulto) return `$${(porUnidad * 1000).toFixed(2)} el ${bulto}`;

  /*
    Las unidades vienen en plural en la hoja ("Rebanadas", "piezas") y
    "por Rebanadas" se lee mal. Quitar la -s final acierta en todas las
    que hay y en las que se puedan agregar en español; el mínimo de 4
    letras protege a "kg" y a cualquier abreviatura corta.
  */
  const singular = u.length > 3 && u.toLowerCase().endsWith('s') ? u.slice(0, -1) : u;
  const cifra = porUnidad >= 1 ? porUnidad.toFixed(2) : String(Math.round(porUnidad * 10000) / 10000);
  return `$${cifra} por ${singular.toLowerCase() || 'unidad'}`;
}
