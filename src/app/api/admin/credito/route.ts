/**
 * app/api/admin/credito/route.ts
 *
 * La línea de crédito del local.
 *
 * GET    → cómo va: disponible, cuánto hay que pagar y para cuándo
 * POST   → anota un cargo o un pago
 * PATCH  → corrige uno, o cambia el límite y las fechas de la tarjeta
 * DELETE → borra uno mal anotado
 */

import { NextRequest, NextResponse } from 'next/server';
import { anotar } from '@/lib/bitacora';
import { getSheetData } from '@/lib/googleSheets';
import { guardarAjuste } from '@/lib/ajustes';
import {
  anotarMovimiento,
  borrarMovimiento,
  calcularEstado,
  CATEGORIAS,
  CLAVE_DIA_CORTE,
  CLAVE_DIA_PAGO,
  CLAVE_LIMITE,
  editarMovimiento,
  leerMovimientos,
  LIMITE_DEFAULT,
  prepararCredito,
  TIPOS,
  type TipoMovimiento,
} from '@/lib/credito';
import { getAdminSession } from '@/lib/roles';

const quienDe = (s: { user?: { name?: string | null; email?: string | null } } | null) =>
  s?.user?.name || s?.user?.email || '';

/**
 * Los ajustes de la tarjeta se leen de la hoja directamente y no con
 * leerAjustes(): esa función se llama en cada carga del menú de la
 * tienda y trae su propio caché, así que meterle campos que solo usa el
 * panel sería cobrarle a cada cliente una lectura que no le sirve.
 */
async function leerConfig(): Promise<{ limite: number; diaCorte: number; diaPago: number }> {
  try {
    const filas = await getSheetData('Ajustes_Tienda', { crudo: true });
    const valor = (clave: string) => {
      const f = filas.find((x) => (x.Clave || '').toString().trim() === clave);
      const n = parseFloat((f?.Valor ?? '').toString().replace(',', '.'));
      return isNaN(n) ? 0 : n;
    };
    const limite = valor(CLAVE_LIMITE);
    return {
      limite: limite > 0 ? limite : LIMITE_DEFAULT,
      diaCorte: valor(CLAVE_DIA_CORTE),
      diaPago: valor(CLAVE_DIA_PAGO),
    };
  } catch {
    return { limite: LIMITE_DEFAULT, diaCorte: 0, diaPago: 0 };
  }
}

const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat((v ?? '').toString().replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

/** Un día del mes válido, o 0 si viene vacío. */
function leerDia(v: unknown): number | null {
  const t = (v ?? '').toString().trim();
  if (t === '') return 0;
  const n = numero(t);
  if (!Number.isInteger(n) || n < 1 || n > 31) return null;
  return n;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Valida lo que llega del formulario, para no guardar basura. */
function leerDatos(cuerpo: Record<string, unknown>):
  | { error: string }
  | {
      fecha: string;
      tipo: TipoMovimiento;
      concepto: string;
      monto: number;
      categoria: string;
      notas: string;
    } {
  const fecha = (cuerpo.fecha ?? '').toString().trim();
  if (!FECHA.test(fecha)) return { error: 'Falta la fecha del movimiento.' };

  const tipo = (cuerpo.tipo ?? '').toString().trim() as TipoMovimiento;
  if (!TIPOS.includes(tipo)) return { error: 'Di si es un cargo o un pago.' };

  const concepto = (cuerpo.concepto ?? '').toString().trim().slice(0, 120);
  if (!concepto) return { error: 'Escribe en qué se usó.' };

  const monto = numero(cuerpo.monto);
  if (!(monto > 0)) return { error: 'El monto tiene que ser mayor a 0.' };

  /*
    Un cargo siempre lleva categoría; un pago no, porque un abono a la
    tarjeta no se gasta "en" nada. Forzarle una la contaría dos veces al
    sumar por categoría.
  */
  const categoria = (cuerpo.categoria ?? '').toString().trim();
  if (tipo === 'Cargo' && !CATEGORIAS.includes(categoria as (typeof CATEGORIAS)[number])) {
    return { error: 'Elige en qué se usó: insumos, servicios u otro.' };
  }

  return {
    fecha,
    tipo,
    concepto,
    monto,
    categoria: tipo === 'Cargo' ? categoria : '',
    notas: (cuerpo.notas ?? '').toString().trim().slice(0, 300),
  };
}

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await prepararCredito();

  const [movimientos, config] = await Promise.all([leerMovimientos(), leerConfig()]);
  return NextResponse.json({
    ...calcularEstado(movimientos, config.limite, config.diaCorte, config.diaPago),
    categorias: CATEGORIAS,
  });
}

export async function POST(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const cuerpo = await req.json();
  const datos = leerDatos(cuerpo);
  if ('error' in datos) return NextResponse.json({ error: datos.error }, { status: 400 });

  const id = await anotarMovimiento({ ...datos, quien: quienDe(sesion) });
  await anotar(
    quienDe(sesion),
    'Cuenta',
    `${datos.tipo === 'Pago' ? 'Abonó a' : 'Cargó a'} la tarjeta del local`,
    `${datos.concepto} · $${datos.monto}`
  );
  return NextResponse.json({ success: true, id });
}

export async function PATCH(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { accion, id, datos } = await req.json();

  // ── Límite de la línea y fechas de la tarjeta ──
  if (accion === 'config') {
    const limite = numero(datos?.limite);
    if (!(limite > 0)) {
      return NextResponse.json({ error: 'La línea tiene que ser mayor a 0.' }, { status: 400 });
    }
    const diaCorte = leerDia(datos?.diaCorte);
    const diaPago = leerDia(datos?.diaPago);
    if (diaCorte === null || diaPago === null) {
      return NextResponse.json(
        { error: 'Los días de corte y de pago van del 1 al 31.' },
        { status: 400 }
      );
    }
    await guardarAjuste(CLAVE_LIMITE, limite, 'Línea de crédito del local');
    await guardarAjuste(CLAVE_DIA_CORTE, diaCorte, 'Día del mes en que corta la tarjeta');
    await guardarAjuste(CLAVE_DIA_PAGO, diaPago, 'Día del mes en que se paga la tarjeta');
    await anotar(
      quienDe(sesion),
      'Cuenta',
      'Cambió los datos de la tarjeta del local',
      `línea $${limite}, corte ${diaCorte || '—'}, pago ${diaPago || '—'}`
    );
    return NextResponse.json({ success: true });
  }

  // ── Corregir un movimiento ──
  if (!id) return NextResponse.json({ error: 'Falta el movimiento' }, { status: 400 });
  const leidos = leerDatos(datos ?? {});
  if ('error' in leidos) return NextResponse.json({ error: leidos.error }, { status: 400 });

  if (!(await editarMovimiento(id, leidos))) {
    return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 });
  }
  await anotar(quienDe(sesion), 'Cuenta', `Corrigió un movimiento de la tarjeta (${id})`);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta el movimiento' }, { status: 400 });

  if (!(await borrarMovimiento(id))) {
    return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 });
  }
  await anotar(quienDe(sesion), 'Cuenta', `Borró un movimiento de la tarjeta (${id})`);
  return NextResponse.json({ success: true });
}
