/**
 * fusionCuentas.ts
 *
 * Junta la ficha que se creó en el mostrador con la cuenta de la app.
 *
 * Pasa seguido: alguien compra en el local y se le da de alta con nombre y
 * teléfono; semanas después se baja la app, entra con Google y captura el
 * mismo teléfono. Hasta ahora eso se rechazaba ("ese número ya está en otra
 * cuenta") y el cliente perdía de vista sus compras anteriores.
 *
 * Solo se fusiona hacia la cuenta de la app y solo desde una ficha SIN
 * correo: si la otra cuenta tiene correo es una cuenta de Google real, de
 * otra persona, y ahí sí hay que negarse.
 */

import { getSheetData, updateCeldas, updateCells } from './googleSheets';
import { META_ARTICULO, META_DESCUENTO } from './lealtad';

/** Columnas de USUARIOS */
const COL_TELEFONO = 3;
const COL_CICLO = 7;
const COL_HISTORICO = 8;
const COL_BENEFICIO = 9;
const COL_NOTAS = 10;
const COL_ACTIVO = 11;

/** Columna B de PEDIDOS */
const COL_PEDIDO_USUARIO = 2;

export interface ResultadoFusion {
  /** Compras que se le pasaron a su cuenta de la app */
  pedidosMovidos: number;
  cicloFinal: number;
  historicoFinal: number;
  beneficioFinal: string;
  nombreFicha: string;
}

const num = (v: unknown) => {
  const n = parseInt((v ?? '').toString(), 10);
  return isNaN(n) ? 0 : n;
};

/**
 * Qué beneficio queda al juntar los dos avances.
 *
 * Manda la regla de siempre —uno a la vez, y el artículo gratis le gana al
 * descuento—, pero además se revisa el ciclo ya sumado: si entre las dos
 * fichas junta 10 compras, el premio se le debe, aunque ninguna de las dos
 * llegara sola.
 */
export function beneficioAlFusionar(ciclo: number, a: string, b: string): string {
  const tiene = (x: string) => (x || '').trim();
  if (tiene(a) === 'Articulo Gratis' || tiene(b) === 'Articulo Gratis') return 'Articulo Gratis';
  if (ciclo >= META_ARTICULO) return 'Articulo Gratis';
  if (tiene(a) === '15% Descuento' || tiene(b) === '15% Descuento') return '15% Descuento';
  if (ciclo >= META_DESCUENTO) return '15% Descuento';
  // Un cupón de reactivación se conserva tal cual si es lo único que hay
  const suelto = tiene(a) !== '' && tiene(a) !== 'Ninguno' ? tiene(a) : tiene(b);
  return suelto && suelto !== 'Ninguno' ? suelto : 'Ninguno';
}

/**
 * Pasa el avance y las compras de `idFicha` (mostrador) a `idCuenta` (app).
 *
 * La ficha vieja NO se borra: se le quita el teléfono —para que no queden
 * dos cuentas con el mismo número— y se marca inactiva con una nota de a
 * dónde se fue. Los pedidos ya registrados siguen siendo válidos y ahora
 * cuelgan de la cuenta buena.
 */
export async function fusionarFichaDeMostrador(
  idCuenta: string,
  idFicha: string
): Promise<ResultadoFusion> {
  const usuarios = await getSheetData('USUARIOS');
  const iCuenta = usuarios.findIndex((u) => u.ID_Usuario === idCuenta);
  const iFicha = usuarios.findIndex((u) => u.ID_Usuario === idFicha);
  if (iCuenta === -1 || iFicha === -1) {
    throw new Error('No se encontró alguna de las dos cuentas');
  }

  const cuenta = usuarios[iCuenta];
  const ficha = usuarios[iFicha];
  const filaCuenta = iCuenta + 2;
  const filaFicha = iFicha + 2;

  const ciclo = num(cuenta.Ciclo_Actual) + num(ficha.Ciclo_Actual);
  const historico =
    num(cuenta.Total_Articulos_Historico) + num(ficha.Total_Articulos_Historico);
  const beneficio = beneficioAlFusionar(
    ciclo,
    cuenta.Beneficio_Disponible,
    ficha.Beneficio_Disponible
  );

  // Las compras del mostrador pasan a colgar de la cuenta de la app, para
  // que el cliente las vea en "Mis pedidos" y cuadren sus métricas.
  const pedidos = await getSheetData('PEDIDOS');
  const cambiosPedidos = pedidos
    .map((p, i) => ({ p, fila: i + 2 }))
    .filter(({ p }) => p.ID_Usuario === idFicha)
    .map(({ fila }) => ({ fila, col: COL_PEDIDO_USUARIO, valor: idCuenta }));

  if (cambiosPedidos.length > 0) {
    await updateCeldas('PEDIDOS', cambiosPedidos);
  }

  await updateCells('USUARIOS', filaCuenta, {
    [COL_CICLO]: ciclo,
    [COL_HISTORICO]: historico,
    [COL_BENEFICIO]: beneficio,
  });

  const notaPrevia = (ficha.Notas_Admin || '').trim();
  await updateCells('USUARIOS', filaFicha, {
    [COL_TELEFONO]: '', // libera el número: ya vive en la cuenta de la app
    [COL_ACTIVO]: 'no',
    [COL_NOTAS]: [notaPrevia, `Se unió a la cuenta ${idCuenta} desde la app`]
      .filter(Boolean)
      .join(' · '),
  });

  return {
    pedidosMovidos: cambiosPedidos.length,
    cicloFinal: ciclo,
    historicoFinal: historico,
    beneficioFinal: beneficio,
    nombreFicha: ficha.Nombre || idFicha,
  };
}
