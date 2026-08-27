'use client';

import { useCallback, useEffect, useState } from 'react';
import { comisionDeVenta, METODOS_CON_COMISION } from '@/lib/comision';
import { fechaHoyMTY, parsearFechaHora } from '@/lib/pedidoFecha';
import {
  linkWhatsApp,
  mensajePagoRecibido,
  mensajePedidoListo,
  mensajeTransferencia,
  METODO_PAGO_EN_LINEA,
  normalizarMetodoPago,
  TRANSFERENCIA_HABILITADA,
  URL_PAGO_MP,
} from '@/lib/negocio';
import { TicketBotones } from '../TicketBotones';
import { horaBonita } from '@/lib/recoleccion';
import type { DatosTicket } from '@/lib/ticket';

const iconoMetodo = (m: string) =>
  m === 'Efectivo' ? '💵' : m === 'Transferencia' ? '📲' : m === METODO_PAGO_EN_LINEA ? '🛍️' : '💳';

interface Pedido {
  ID_Pedido: string;
  ID_Usuario: string;
  Nombre_Cliente_Snap: string;
  Fecha_Hora: string;
  Estado: string;
  Hora_Recoleccion: string;
  Total_Bruto: string;
  Total_Final: string;
  Notas_Pedido: string;
  Telefono: string;
  HoraLegible: string;
  Origen_Venta: string;
  Metodo_Pago?: string;
  Estado_Pago?: string;
  /** Folio del pago en Mercado Pago, para poder verlo allá */
  MP_Folio?: string;
  /** Enlace de cobro, por si el cliente dejó el pago a medias */
  Link_Pago?: string;
  /** Fecha en que el cliente avisó desde la app que ya está en el local */
  Aviso_Llegada?: string;
  /** Qué se llevó, para poder filtrar por producto */
  Productos?: { id: string; nombre: string; cantidad: number }[];
}

interface DetalleItem {
  Nombre_Producto_Snap: string;
  Cantidad: string;
  Precio_Unitario_Snap: string;
  Subtotal: string;
  Notas_Item: string;
}

interface Detalle {
  pedido: Pedido;
  items: DetalleItem[];
  cliente: { nombre: string; telefono: string; email: string } | null;
}

const FLUJO = ['Recibido', 'En preparación', 'Listo para recoger', 'Entregado'];
const METODOS_FILTRO = [
  'Todos',
  'Efectivo',
  'Terminal',
  'Transferencia',
  METODO_PAGO_EN_LINEA,
  'Sin registrar',
];

const ESTADOS_FILTRO = ['Todos', ...FLUJO, 'Cancelado'];

/** YYYY-MM-DD de hoy en Monterrey, desplazado N días hacia atrás. */
function fechaMTY(diasAtras = 0): string {
  const hoy = fechaHoyMTY();
  if (diasAtras === 0) return hoy;
  const [y, m, d] = hoy.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - diasAtras));
  return t.toISOString().slice(0, 10);
}

/** "2026-07-29" → "29 jul 2026" */
const fechaBonita = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${meses[m - 1] ?? ''} ${y}`;
};

/** Primer día del mes actual (en Monterrey). */
const primerDiaDelMes = () => fechaHoyMTY().slice(0, 8) + '01';

const ATAJOS_FECHA: { etiqueta: string; rango: () => { desde: string; hasta: string } }[] = [
  { etiqueta: 'Hoy', rango: () => ({ desde: fechaMTY(0), hasta: fechaMTY(0) }) },
  { etiqueta: 'Ayer', rango: () => ({ desde: fechaMTY(1), hasta: fechaMTY(1) }) },
  { etiqueta: 'Últimos 7 días', rango: () => ({ desde: fechaMTY(6), hasta: fechaMTY(0) }) },
  { etiqueta: 'Este mes', rango: () => ({ desde: primerDiaDelMes(), hasta: fechaMTY(0) }) },
];

/**
 * Lo que de verdad entra a la cuenta.
 *
 * Mercado Pago descuenta su comision antes de depositar, asi que el total
 * del pedido no es lo que se recibe. Verlo aqui evita cuadrar el dia con
 * un numero que nunca llego al banco. El efectivo y la transferencia
 * llegan completos y devuelven null, para no ensuciar la lista con un
 * dato que no aporta.
 */
function netoDelPedido(total: number, metodo: string): number | null {
  if (!METODOS_CON_COMISION.includes(metodo) || !(total > 0)) return null;
  return Math.round((total - comisionDeVenta(total, metodo)) * 100) / 100;
}

const colorEstado = (estado: string) => {
  switch (estado) {
    case 'Recibido':
      return 'bg-blue-100 text-blue-700';
    case 'En preparación':
      return 'bg-amber-100 text-amber-700';
    case 'Listo para recoger':
      return 'bg-green-100 text-green-700';
    case 'Entregado':
      return 'bg-neutral-200 text-neutral-600';
    case 'Cancelado':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-neutral-100 text-neutral-600';
  }
};

// Mensaje pre-escrito para el cliente según el estado actual del pedido.
// Se envía manualmente: el botón abre WhatsApp en el celular de Moramango
// con el chat del cliente y este texto listo, solo falta presionar enviar.
const mensajeWhatsApp = (estado: string, nombre: string, idPedido: string): string => {
  const primerNombre = (nombre || '').trim().split(' ')[0] || 'hola';
  switch (estado) {
    case 'Recibido':
      return `¡Hola ${primerNombre}! 👋 Recibimos tu pedido ${idPedido} en Moramango. Te avisaremos por aquí cuando esté listo. 🥭`;
    case 'En preparación':
      return `¡Hola ${primerNombre}! Tu pedido ${idPedido} ya está en preparación. 🥤`;
    case 'Listo para recoger':
      return `¡Hola ${primerNombre}! 🎉 Tu pedido ${idPedido} está listo para recoger en Moramango. ¡Te esperamos!`;
    case 'Entregado':
      return `¡Gracias por tu compra, ${primerNombre}! 💛 Esperamos que disfrutes tu pedido. ¡Vuelve pronto a Moramango!`;
    case 'Cancelado':
      return `Hola ${primerNombre}, lamentamos informarte que tu pedido ${idPedido} fue cancelado. Si tienes alguna duda, respóndenos por aquí. 🙏`;
    default:
      return `¡Hola ${primerNombre}! Te escribimos de Moramango sobre tu pedido ${idPedido}.`;
  }
};

/** Arma los datos del ticket a partir del detalle del pedido. */
const ticketDelPedido = (d: Detalle): DatosTicket => {
  const info = parsearFechaHora(d.pedido.Fecha_Hora);
  const bruto = parseFloat(d.pedido.Total_Bruto || '0') || 0;
  const total = parseFloat(d.pedido.Total_Final || '0') || 0;
  const base = bruto || total;
  return {
    idPedido: d.pedido.ID_Pedido,
    fecha: info ? `${info.fechaISO} ${info.horaLegible}` : d.pedido.Fecha_Hora,
    cliente: d.cliente?.nombre || d.pedido.Nombre_Cliente_Snap || undefined,
    items: d.items.map((i) => ({
      cantidad: parseInt(i.Cantidad) || 1,
      nombre: i.Nombre_Producto_Snap,
      subtotal: parseFloat(i.Subtotal || '0') || 0,
    })),
    totalBruto: base,
    descuento: Math.max(0, base - total),
    total,
    metodoPago: d.pedido.Metodo_Pago || undefined,
  };
};

export default function PedidosPage() {
  // Rango de fechas. Al inicio ambos = hoy, así se comporta como antes.
  const [desde, setDesde] = useState(fechaHoyMTY());
  const [hasta, setHasta] = useState(fechaHoyMTY());
  const [estadoFiltro, setEstadoFiltro] = useState('Todos');
  const [metodoFiltro, setMetodoFiltro] = useState('Todos');
  /** Filtrar por lo que se llevaron: '' = todo */
  const [productoFiltro, setProductoFiltro] = useState('');
  /** Buscar por cliente: nombre, telefono o numero de pedido */
  const [buscaCliente, setBuscaCliente] = useState('');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [telCopiado, setTelCopiado] = useState(false);
  // Historial de compras del cliente del pedido abierto
  const [historial, setHistorial] = useState<Pedido[] | null>(null);
  const [historialDe, setHistorialDe] = useState('');

  const cargarPedidos = useCallback(() => {
    setCargando(true);
    const params = new URLSearchParams({ desde, hasta });
    if (estadoFiltro !== 'Todos') params.set('estado', estadoFiltro);
    if (metodoFiltro !== 'Todos') params.set('metodo', metodoFiltro);
    fetch(`/api/admin/pedidos?${params}`)
      .then((res) => res.json())
      .then((data) => setPedidos(data.pedidos || []))
      .finally(() => setCargando(false));
  }, [desde, hasta, estadoFiltro, metodoFiltro]);

  useEffect(() => {
    cargarPedidos();
  }, [cargarPedidos]);


  // Historial del cliente: las canceladas no cuentan para el total
  const historialValidos = (historial ?? []).filter((p) => p.Estado !== 'Cancelado');
  const totalHistorial = historialValidos.reduce(
    (s, p) => s + (parseFloat(p.Total_Final) || 0),
    0
  );

  /** Todas las compras de ese cliente, para ver cuándo y qué ha pedido. */
  const verHistorialCliente = async (idUsuario: string, nombre: string) => {
    setHistorialDe(nombre);
    setHistorial([]);
    const res = await fetch(`/api/admin/usuarios/${encodeURIComponent(idUsuario)}/pedidos`);
    const data = await res.json();
    setHistorial(data.pedidos ?? []);
  };

  const abrirDetalle = (idPedido: string) => {
    setCargandoDetalle(true);
    setDetalle(null);
    setTelCopiado(false);
    fetch(`/api/admin/pedidos/${idPedido}`)
      .then((res) => res.json())
      .then((data) => setDetalle(data))
      .finally(() => setCargandoDetalle(false));
  };

  /**
   * El pedido al que le falta decir cómo se pagó, esperando respuesta.
   *
   * Los pedidos de la app que pagan al recoger nacen sin método. Si se
   * entregan sin anotarlo, la app los cuenta como efectivo y un cobro por
   * terminal acaba sumando al cajón: el corte del día deja de cuadrar sin
   * que nadie se entere. Por eso, al entregar, se pregunta.
   */
  const [faltaMetodo, setFaltaMetodo] = useState<{
    idPedido: string;
    nuevoEstado: string;
    metodos: string[];
  } | null>(null);

  const cambiarEstado = async (idPedido: string, nuevoEstado: string, metodoPago?: string) => {
    setActualizando(true);
    try {
      const res = await fetch('/api/admin/pedidos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPedido, nuevoEstado, ...(metodoPago ? { metodoPago } : {}) }),
      });
      const data = await res.json().catch(() => ({}) as { codigo?: string; metodos?: string[] });

      // El servidor no deja entregar sin saber cómo se pagó: se pregunta
      // y se reintenta con la respuesta, sin perder el clic.
      if (!res.ok && data.codigo === 'FALTA_METODO_PAGO') {
        setFaltaMetodo({
          idPedido,
          nuevoEstado,
          metodos: data.metodos ?? ['Efectivo', 'Terminal', 'Transferencia'],
        });
        return;
      }
      setFaltaMetodo(null);
      cargarPedidos();
      if (detalle) abrirDetalle(idPedido);
    } finally {
      setActualizando(false);
    }
  };

  const cancelarPedido = (idPedido: string) => {
    if (!confirm(`¿Cancelar el pedido ${idPedido}? Esta acción no se puede deshacer.`)) return;
    cambiarEstado(idPedido, 'Cancelado');
  };

  /** Para reenviarle el cobro por WhatsApp a quien dejó el pago a medias. */
  const [linkCopiado, setLinkCopiado] = useState(false);
  const copiarLinkPago = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2000);
    } catch {}
  };

  /**
   * Cobros iniciados que nadie confirmó. Se sacan del listado que ya está
   * en pantalla, así que respetan el rango de fechas que se esté viendo.
   */
  /**
   * Busca por nombre, telefono o numero de pedido. El telefono se compara
   * por digitos: quien lo tiene guardado con lada lo teclea sin ella, y
   * comparando texto no encontraria nada.
   */
  // Sin acentos: nadie escribe "Rocio" con acento al buscar, y con
  // comparacion literal su clienta mas frecuente no aparecia.
  const sinAcentos = (t: string) =>
    (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = sinAcentos(buscaCliente.trim());
  const digitos = q.replace(/\D/g, '');
  /**
   * Lo que se pidió en el periodo, con cuántas piezas de cada cosa.
   *
   * Sale de los pedidos que ya están en pantalla, no del catálogo: así la
   * lista solo ofrece lo que de verdad se vendió y nunca sale vacía al
   * elegir algo. Va ordenada por lo más pedido, que es lo que se busca.
   */
  const productosDelPeriodo = (() => {
    const m = new Map<string, { nombre: string; piezas: number; pedidos: number }>();
    for (const p of pedidos) {
      if (p.Estado === 'Cancelado') continue;
      for (const it of p.Productos ?? []) {
        const e = m.get(it.id) ?? { nombre: it.nombre, piezas: 0, pedidos: 0 };
        e.piezas += it.cantidad;
        e.pedidos += 1;
        m.set(it.id, e);
      }
    }
    return [...m].sort((a, b) => b[1].piezas - a[1].piezas);
  })();

  const visibles = pedidos.filter((p) => {
    if (productoFiltro && !(p.Productos ?? []).some((it) => it.id === productoFiltro)) return false;
    if (!q) return true;
    const enTexto = [p.Nombre_Cliente_Snap, p.ID_Pedido].some((c) =>
      sinAcentos(c || '').includes(q)
    );
    const enTel = digitos.length >= 3 && (p.Telefono || '').replace(/\D/g, '').includes(digitos);
    return enTexto || enTel;
  });
  // Sin cancelados: sumarlos inflaria el total y ese numero se usa
  // para cuadrar contra lo que de verdad entro.
  const totalVisibles = visibles
    .filter((p) => p.Estado !== 'Cancelado')
    .reduce((s, p) => s + (parseFloat(p.Total_Final) || 0), 0);
  // Lo que Mercado Pago se lleva de lo que hay en pantalla. Se calcula
  // cobro por cobro porque el pago en linea trae cargo fijo por venta.
  const comisionVisible = visibles
    .filter((p) => p.Estado !== 'Cancelado')
    .reduce(
      (s, p) =>
        s + comisionDeVenta(parseFloat(p.Total_Final) || 0, normalizarMetodoPago(p.Metodo_Pago)),
      0
    );

  // Piezas del producto elegido dentro de lo que está en pantalla: es la
  // pregunta de fondo ("cuántos croissants dulces se han pedido").
  const piezasDelFiltro = productoFiltro
    ? visibles
        .filter((p) => p.Estado !== 'Cancelado')
        .reduce(
          (s, p) => s + ((p.Productos ?? []).find((it) => it.id === productoFiltro)?.cantidad ?? 0),
          0
        )
    : 0;
  const nombreDelFiltro =
    productosDelPeriodo.find(([id]) => id === productoFiltro)?.[1].nombre ?? '';

  const porConfirmar = pedidos.filter(
    (p) => p.Estado_Pago === 'Pendiente' && p.Estado !== 'Cancelado'
  );

  const cambiarMetodo = async (idPedido: string, metodoPago: string) => {
    setActualizando(true);
    try {
      await fetch('/api/admin/pedidos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPedido, metodoPago }),
      });
      cargarPedidos();
      abrirDetalle(idPedido);
    } finally {
      setActualizando(false);
    }
  };

  const confirmarPago = async (idPedido: string) => {
    setActualizando(true);
    try {
      await fetch('/api/admin/pedidos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPedido, estadoPago: 'Pagado' }),
      });
      cargarPedidos();
      abrirDetalle(idPedido);
    } finally {
      setActualizando(false);
    }
  };

  /**
   * Marca un pedido como reembolsado. El dinero se devuelve en Mercado
   * Pago (o en efectivo); aquí solo se deja el registro. Se cancela el
   * pedido a la vez, porque una venta devuelta no debe contar.
   */
  const marcarReembolsado = async (idPedido: string) => {
    if (
      !confirm(
        `¿Marcar ${idPedido} como REEMBOLSADO?\n\nOjo: esto NO devuelve el dinero — eso se hace en Mercado Pago (o en efectivo). Aquí solo se registra, y el pedido dejará de contar en tus ventas.`
      )
    )
      return;

    setActualizando(true);
    try {
      await fetch('/api/admin/pedidos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPedido, estadoPago: 'Reembolsado', nuevoEstado: 'Cancelado' }),
      });
      cargarPedidos();
      abrirDetalle(idPedido);
    } finally {
      setActualizando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/*
        Preguntar cómo se pagó, justo antes de entregar.

        Aparece solo cuando el pedido no trae método —los de la app que
        pagan al recoger— y no se puede saltar: sin respuesta, el pedido
        no pasa a Entregado. Es el momento correcto para preguntarlo,
        porque es cuando se está cobrando.
      */}
      {faltaMetodo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm p-5 space-y-3">
            <h3 className="text-lg font-bold text-neutral-900">¿Cómo te pagó?</h3>
            <p className="text-sm text-neutral-700">
              Este pedido se hizo por la app para pagar al recoger, así que todavía no dice
              cómo se cobró. Sin eso, el corte del día no cuadra.
            </p>
            <div className="grid grid-cols-1 gap-2 pt-1">
              {faltaMetodo.metodos.map((m) => (
                <button
                  key={m}
                  onClick={() =>
                    cambiarEstado(faltaMetodo.idPedido, faltaMetodo.nuevoEstado, m)
                  }
                  disabled={actualizando}
                  className="w-full bg-marron text-white font-semibold py-3 rounded-xl active:scale-95 disabled:opacity-50"
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              onClick={() => setFaltaMetodo(null)}
              disabled={actualizando}
              className="w-full text-sm font-semibold text-neutral-700 py-2"
            >
              Ahorita no lo entrego
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {ATAJOS_FECHA.map((a) => {
            const r = a.rango();
            const activo = desde === r.desde && hasta === r.hasta;
            return (
              <button
                key={a.etiqueta}
                onClick={() => {
                  setDesde(r.desde);
                  setHasta(r.hasta);
                }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  activo ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-700'
                }`}
              >
                {a.etiqueta}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold text-neutral-700">Del</label>
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value)}
            className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-black"
          />
          <label className="text-sm font-semibold text-neutral-700">al</label>
          <input
            type="date"
            value={hasta}
            min={desde}
            onChange={(e) => setHasta(e.target.value)}
            className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-black"
          />
          <label className="text-sm font-semibold text-neutral-700 ml-2">Estado</label>
          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
            className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-black"
          >
            {ESTADOS_FILTRO.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <input
            value={buscaCliente}
            onChange={(e) => setBuscaCliente(e.target.value)}
            placeholder="Buscar cliente, teléfono o pedido…"
            className="flex-1 min-w-[190px] bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-black"
          />
          <label className="text-sm font-semibold text-neutral-700 ml-2">Cobro</label>
          <select
            value={metodoFiltro}
            onChange={(e) => setMetodoFiltro(e.target.value)}
            className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-black"
          >
            {METODOS_FILTRO.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <label className="text-sm font-semibold text-neutral-700 ml-2">Producto</label>
          <select
            value={productoFiltro}
            onChange={(e) => setProductoFiltro(e.target.value)}
            className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-black max-w-[220px]"
          >
            <option value="">Todos los productos</option>
            {productosDelPeriodo.map(([id, d]) => (
              <option key={id} value={id}>
                {d.nombre} ({d.piezas})
              </option>
            ))}
          </select>
          <span className="text-xs text-neutral-700 ml-auto text-right">
            <span className="block">
              {visibles.length} pedido{visibles.length === 1 ? '' : 's'}
              {' · '}${totalVisibles.toFixed(2)}
              {visibles.length !== pedidos.length && ` (de ${pedidos.length})`}
            </span>
            {comisionVisible > 0 && (
              <span className="block text-[11px] text-green-700 font-semibold">
                te quedan ${(totalVisibles - comisionVisible).toFixed(2)} · comisión $
                {comisionVisible.toFixed(2)}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* La respuesta a "cuántos croissants dulces se han pedido", en
          grande. El renglón de arriba dice cuántos PEDIDOS lo traen, que
          no es lo mismo: un pedido puede llevarse tres. */}
      {productoFiltro && (
        <div className="bg-marron/5 border border-marron/20 rounded-2xl p-4 flex flex-wrap items-center gap-3">
          <div>
            <p className="text-2xl font-bold text-neutral-900">
              {piezasDelFiltro}{' '}
              <span className="text-base font-semibold text-neutral-700">
                {piezasDelFiltro === 1 ? 'pieza' : 'piezas'}
              </span>
            </p>
            <p className="text-sm text-neutral-800">
              de <b>{nombreDelFiltro}</b>, en {visibles.filter((p) => p.Estado !== 'Cancelado').length}{' '}
              pedido
              {visibles.filter((p) => p.Estado !== 'Cancelado').length === 1 ? '' : 's'}
            </p>
            <p className="text-xs text-neutral-600 mt-0.5">
              {desde === hasta ? fechaBonita(desde) : `${fechaBonita(desde)} al ${fechaBonita(hasta)}`}
              {/* Los cancelados siguen en la lista pero no se cuentan; sin
                  decirlo, el numero de arriba parece no cuadrar con los
                  renglones que se ven. */}
              {(() => {
                const n = visibles.filter((p) => p.Estado === 'Cancelado').length;
                if (n === 0) return null;
                return ` · ${n} cancelado${n === 1 ? ' que no cuenta' : 's que no cuentan'}`;
              })()}
            </p>
          </div>
          <button
            onClick={() => setProductoFiltro('')}
            className="ml-auto text-xs font-bold px-3 py-2 rounded-lg bg-white border border-neutral-200 text-neutral-800 active:scale-95"
          >
            Ver todos
          </button>
        </div>
      )}

      {/* Cobros que se iniciaron y nadie confirmó. Van arriba porque es
          dinero que puede quedarse sin cobrar sin que nadie lo note. */}
      {porConfirmar.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-wrap items-center gap-3">
          <span className="text-xl leading-none">💸</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-amber-900">
              {porConfirmar.length} cobro{porConfirmar.length === 1 ? '' : 's'} por confirmar ·{' '}
              ${porConfirmar.reduce((s, p) => s + (parseFloat(p.Total_Final) || 0), 0).toFixed(2)}
            </p>
            <p className="text-xs text-amber-900">
              El cliente dijo que pagaría por transferencia o tarjeta. Revisa que el dinero haya
              caído y márcalo como recibido.
            </p>
          </div>
          <button
            onClick={() => abrirDetalle(porConfirmar[0].ID_Pedido)}
            className="shrink-0 bg-amber-500 text-white text-sm font-bold px-4 py-2 rounded-xl active:scale-95"
          >
            Revisar el primero
          </button>
        </div>
      )}

      {cargando ? (
        <p className="text-neutral-700 animate-pulse">Cargando pedidos...</p>
      ) : visibles.length === 0 ? (
        <p className="text-neutral-700">
          {buscaCliente.trim()
            ? `Ningún pedido de "${buscaCliente.trim()}" en estas fechas.`
            : 'No hay pedidos para este filtro.'}
        </p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 divide-y divide-neutral-100 overflow-hidden">
          {visibles.map((p) => (
            <button
              key={p.ID_Pedido}
              onClick={() => abrirDetalle(p.ID_Pedido)}
              className="w-full flex items-center gap-4 p-4 text-left hover:bg-neutral-50 transition-colors"
            >
              <span className="font-mono text-sm text-neutral-700 w-14 shrink-0">
                {p.HoraLegible}
                {/* Con rango de varios días, la hora sola no ubica el pedido */}
                {desde !== hasta && (
                  <span className="block text-[10px] text-neutral-500">
                    {parsearFechaHora(p.Fecha_Hora)?.fechaISO.slice(5) ?? ''}
                  </span>
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-neutral-900 truncate">
                  {p.Origen_Venta === 'Local' && <span title="Venta en local">🏪 </span>}
                  {p.Estado_Pago === 'Pagado' && <span title="Pagado">✅ </span>}
                  {/* Para cuándo lo quiere: es lo que decide el orden de
                      preparación cuando hay varios pedidos encimados. */}
                  {p.Hora_Recoleccion && (
                    <span className="text-amber-700" title="Hora de recolección">
                      ⏰ {horaBonita(p.Hora_Recoleccion)}{' '}
                    </span>
                  )}
                  {p.Nombre_Cliente_Snap}
                </p>
                <p className="text-xs text-neutral-700 font-mono flex items-center gap-1.5 flex-wrap">
                  <span>{p.ID_Pedido}</span>
                  {/* Con qué se pagó, a la vista en la lista. Antes había
                      que abrir cada pedido para saberlo, así que cuadrar
                      el día contra la terminal era abrir uno por uno. */}
                  {(() => {
                    const m = normalizarMetodoPago(p.Metodo_Pago);
                    if (!m) {
                      return (
                        <span className="font-sans text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                          sin registrar
                        </span>
                      );
                    }
                    return (
                      <span className="font-sans text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700">
                        {iconoMetodo(m)} {m}
                      </span>
                    );
                  })()}
                </p>
              </div>
              {(() => {
                const bruto = parseFloat(p.Total_Final || '0') || 0;
                const neto = netoDelPedido(bruto, normalizarMetodoPago(p.Metodo_Pago));
                return (
                  <span className="shrink-0 text-right">
                    <span className="block font-bold text-neutral-900">${bruto.toFixed(2)}</span>
                    {neto !== null && (
                      <span className="block text-[10px] font-semibold text-green-700 whitespace-nowrap">
                        te quedan ${neto.toFixed(2)}
                      </span>
                    )}
                  </span>
                );
              })()}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colorEstado(p.Estado)}`}>
                  {p.Estado}
                </span>
                {/* Pago iniciado (en línea o transferencia) que nunca se confirmó:
                    debe verse a simple vista para no preparar un pedido sin pagar. */}
                {p.Estado_Pago === 'Pendiente' && p.Estado !== 'Cancelado' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    🕓 SIN PAGAR
                  </span>
                )}
                {/* El cliente ya avisó desde la app que está afuera */}
                {p.Aviso_Llegada && p.Estado !== 'Entregado' && p.Estado !== 'Cancelado' && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700"
                    title={`Avisó a las ${p.Aviso_Llegada}`}
                  >
                    🚗 YA LLEGÓ
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {(cargandoDetalle || detalle) && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setDetalle(null)}
        >
          <div
            className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {cargandoDetalle && !detalle ? (
              <div className="p-8 text-center text-neutral-700 animate-pulse">Cargando pedido...</div>
            ) : detalle ? (
              <>
                <div className="p-5 border-b border-neutral-100 shrink-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-sm text-neutral-700">{detalle.pedido.ID_Pedido}</p>
                      <h2 className="text-lg font-bold text-black">{detalle.cliente?.nombre || detalle.pedido.Nombre_Cliente_Snap}</h2>
                      {detalle.cliente?.telefono && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(detalle.cliente!.telefono);
                            setTelCopiado(true);
                            setTimeout(() => setTelCopiado(false), 2000);
                          }}
                          className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-neutral-700 active:scale-95 transition-transform"
                          title="Copiar número para mandar el comprobante por WhatsApp"
                        >
                          📞 {detalle.cliente.telefono}
                          <span className="text-[11px] font-semibold text-marron bg-marron/10 px-1.5 py-0.5 rounded-md">
                            {telCopiado ? '✅ copiado' : '📋 copiar'}
                          </span>
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colorEstado(detalle.pedido.Estado)}`}>
                        {detalle.pedido.Estado}
                      </span>
                      <div className="flex gap-1.5">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
                          {detalle.pedido.Origen_Venta === 'Local' ? '🏪 Local' : '📱 App'}
                        </span>
                        {detalle.pedido.Metodo_Pago && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
                            {iconoMetodo(normalizarMetodoPago(detalle.pedido.Metodo_Pago))}{' '}
                            {normalizarMetodoPago(detalle.pedido.Metodo_Pago)}
                          </span>
                        )}
                      </div>
                      {detalle.pedido.MP_Folio && (
                        <a
                          href={`${URL_PAGO_MP}${detalle.pedido.MP_Folio}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800"
                          title={`Folio ${detalle.pedido.MP_Folio}`}
                        >
                          🔗 Ver en Mercado Pago
                        </a>
                      )}
                      {detalle.pedido.Link_Pago && detalle.pedido.Estado_Pago !== 'Pagado' && (
                        <button
                          onClick={() => copiarLinkPago(detalle.pedido.Link_Pago!)}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
                        >
                          {linkCopiado ? '✓ Enlace copiado' : '📋 Copiar enlace de cobro'}
                        </button>
                      )}
                      {detalle.pedido.Estado_Pago === 'Pagado' && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          ✅ Pagado
                        </span>
                      )}
                      {detalle.pedido.Estado_Pago === 'Pendiente' && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          🕓 Pago pendiente
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Todas las compras de este cliente */}
                  {detalle.pedido.ID_Usuario && (
                    <button
                      onClick={() =>
                        verHistorialCliente(
                          detalle.pedido.ID_Usuario,
                          detalle.cliente?.nombre || detalle.pedido.Nombre_Cliente_Snap
                        )
                      }
                      className="mt-3 w-full flex items-center justify-center gap-2 bg-neutral-100 text-neutral-900 font-semibold py-2.5 rounded-xl active:scale-95 transition-transform"
                    >
                      🧾 Ver sus compras anteriores
                    </button>
                  )}
                  {detalle.cliente?.telefono && (
                    <a
                      href={linkWhatsApp(
                        detalle.cliente.telefono,
                        mensajeWhatsApp(
                          detalle.pedido.Estado,
                          detalle.cliente?.nombre || detalle.pedido.Nombre_Cliente_Snap,
                          detalle.pedido.ID_Pedido
                        )
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 w-full flex items-center justify-center gap-2 bg-green-500 text-white font-semibold py-2.5 rounded-xl active:scale-95 transition-transform"
                    >
                      💬 Avisar por WhatsApp
                    </a>
                  )}
                  {detalle.cliente?.telefono && TRANSFERENCIA_HABILITADA && (
                    <a
                      href={linkWhatsApp(
                        detalle.cliente.telefono,
                        mensajeTransferencia(
                          detalle.cliente?.nombre || detalle.pedido.Nombre_Cliente_Snap,
                          parseFloat(detalle.pedido.Total_Final || '0') || 0
                        )
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 w-full flex items-center justify-center gap-2 bg-neutral-100 text-neutral-700 font-semibold py-2.5 rounded-xl active:scale-95 transition-transform"
                    >
                      📲 Enviar datos de transferencia
                    </a>
                  )}
                  <div className="mt-2">
                    <TicketBotones
                      datos={ticketDelPedido(detalle)}
                      compacto
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {detalle.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start bg-neutral-50 rounded-xl p-3">
                      <div>
                        <p className="font-semibold text-neutral-900 text-sm">
                          {item.Cantidad}× {item.Nombre_Producto_Snap}
                        </p>
                        {item.Notas_Item && (
                          <p className="text-xs text-neutral-700 mt-0.5">{item.Notas_Item}</p>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-neutral-700">${parseFloat(item.Subtotal || '0').toFixed(2)}</span>
                    </div>
                  ))}

                  {detalle.pedido.Notas_Pedido && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-amber-700 mb-1">Notas del pedido</p>
                      <p className="text-sm text-amber-900">{detalle.pedido.Notas_Pedido}</p>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2">
                    <span className="text-neutral-700 font-medium">Total</span>
                    <span className="text-xl font-bold text-black">${parseFloat(detalle.pedido.Total_Final || '0').toFixed(2)}</span>
                  </div>

                  {/* Lo que de verdad llega, cuando el cobro paga comisión */}
                  {(() => {
                    const bruto = parseFloat(detalle.pedido.Total_Final || '0') || 0;
                    const metodo = normalizarMetodoPago(detalle.pedido.Metodo_Pago);
                    const neto = netoDelPedido(bruto, metodo);
                    if (neto === null) return null;
                    return (
                      <div className="bg-neutral-50 rounded-xl p-3 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-red-700">
                            Comisión de {metodo === 'Terminal' ? 'la terminal' : 'Mercado Pago'}
                          </span>
                          <span className="font-semibold text-red-700 tabular-nums">
                            −${(bruto - neto).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-semibold text-neutral-900">
                            Lo que entra a tu cuenta
                          </span>
                          <span className="font-bold text-green-700 tabular-nums">
                            ${neto.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="p-5 border-t border-neutral-100 shrink-0 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-neutral-700">Método de pago</p>
                    <p className="text-[11px] text-neutral-600 mb-2">
                      ¿Te equivocaste al registrarlo? Tócale otro y se corrige — no hace falta
                      cancelar la venta.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {['Efectivo', 'Terminal', 'Transferencia', METODO_PAGO_EN_LINEA].map((m) => {
                        // Los pedidos viejos con 'Mercado Pago' cuentan como 'Pago en línea'
                        const activo = normalizarMetodoPago(detalle.pedido.Metodo_Pago) === m;
                        return (
                          <button
                            key={m}
                            onClick={() => !activo && cambiarMetodo(detalle.pedido.ID_Pedido, m)}
                            disabled={actualizando || activo}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                              activo
                                ? 'bg-black text-white'
                                : 'bg-neutral-100 text-neutral-600 active:scale-95'
                            } ${actualizando && !activo ? 'opacity-50' : ''}`}
                          >
                            {iconoMetodo(m)} {m}
                          </button>
                        );
                      })}
                    </div>
                    {detalle.pedido.Estado_Pago === 'Pendiente' && (
                      <button
                        onClick={() => confirmarPago(detalle.pedido.ID_Pedido)}
                        disabled={actualizando}
                        className="mt-2 w-full bg-green-600 text-white font-semibold py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                      >
                        ✅ Confirmar pago recibido
                      </button>
                    )}
                    {/* El aviso que más le importa al cliente. Aparece en
                        cuanto el pedido está listo, no solo si ya pagó. */}
                    {detalle.pedido.Estado === 'Listo para recoger' && detalle.pedido.Telefono && (
                      <a
                        href={linkWhatsApp(
                          detalle.pedido.Telefono,
                          mensajePedidoListo(
                            detalle.pedido.ID_Pedido,
                            horaBonita(detalle.pedido.Hora_Recoleccion || '')
                          )
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 w-full block text-center bg-green-600 text-white font-bold py-3 rounded-xl active:scale-95 transition-transform"
                      >
                        📲 Avisarle que ya está listo
                      </a>
                    )}

                    {/* Avisarle al cliente. Va por WhatsApp y a mano: la app
                        no puede mandarle notificaciones a su celular. */}
                    {detalle.pedido.Estado_Pago === 'Pagado' && detalle.pedido.Telefono && (
                      <a
                        href={linkWhatsApp(
                          detalle.pedido.Telefono,
                          mensajePagoRecibido(
                            detalle.pedido.ID_Pedido,
                            parseFloat(detalle.pedido.Total_Final) || 0
                          )
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 w-full block text-center bg-green-500 text-white font-semibold py-2.5 rounded-xl active:scale-95 transition-transform"
                      >
                        📲 Avisarle que ya recibimos su pago
                      </a>
                    )}
                    {detalle.pedido.Estado_Pago === 'Pagado' && (
                      <>
                        <p className="mt-2 text-xs font-semibold text-green-700">✅ Pago confirmado</p>
                        <button
                          onClick={() => marcarReembolsado(detalle.pedido.ID_Pedido)}
                          disabled={actualizando}
                          className="mt-2 w-full border border-red-200 text-red-600 text-sm font-semibold py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                        >
                          💸 Marcar como reembolsado
                        </button>
                      </>
                    )}
                    {detalle.pedido.Estado_Pago === 'Reembolsado' && (
                      <p className="mt-2 text-xs font-semibold text-red-700">
                        💸 Reembolsado — no cuenta en tus ventas
                      </p>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-neutral-700 mb-2">
                    {actualizando ? 'Actualizando...' : 'Cambiar estado'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[...FLUJO, 'Cancelado'].map((e) => {
                      const activo = detalle.pedido.Estado === e;
                      return (
                        <button
                          key={e}
                          onClick={() => {
                            if (activo) return;
                            if (e === 'Cancelado') {
                              cancelarPedido(detalle.pedido.ID_Pedido);
                            } else {
                              cambiarEstado(detalle.pedido.ID_Pedido, e);
                            }
                          }}
                          disabled={actualizando || activo}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-100 ${
                            activo
                              ? colorEstado(e) + ' ring-2 ring-offset-1 ring-neutral-300'
                              : e === 'Cancelado'
                              ? 'bg-red-50 text-red-600 border border-red-200 active:scale-95'
                              : 'bg-neutral-100 text-neutral-600 active:scale-95'
                          } ${actualizando && !activo ? 'opacity-50' : ''}`}
                        >
                          {e}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Historial de compras de un cliente */}
      {historial !== null && (
        <div
          className="fixed inset-0 bg-black/40 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setHistorial(null)}
        >
          <div
            className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-neutral-100 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-black truncate">{historialDe}</h2>
                <p className="text-sm text-neutral-700">
                  {historialValidos.length} compra{historialValidos.length === 1 ? '' : 's'}
                  {historialValidos.length > 0 && ` · $${totalHistorial.toFixed(2)} en total`}
                </p>
              </div>
              <button
                onClick={() => setHistorial(null)}
                className="text-neutral-600 text-xl leading-none px-2 shrink-0"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 pt-3">
              {historial.length === 0 ? (
                <p className="text-sm text-neutral-700 text-center py-6">
                  Este cliente todavía no tiene compras registradas.
                </p>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {historial.map((p) => {
                    const info = parsearFechaHora(p.Fecha_Hora);
                    const cancelado = p.Estado === 'Cancelado';
                    return (
                      <li key={p.ID_Pedido} className="py-2.5 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold ${cancelado ? 'text-neutral-600 line-through' : 'text-neutral-900'}`}>
                            {info ? fechaBonita(info.fechaISO) : p.Fecha_Hora}
                            {info && <span className="font-normal text-neutral-700"> · {info.horaLegible}</span>}
                          </p>
                          <p className="text-[11px] text-neutral-600 font-mono">
                            {p.ID_Pedido}
                            {p.Origen_Venta === 'Local' ? ' · 🏪 Local' : ' · 📱 App'}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${colorEstado(p.Estado)}`}
                        >
                          {p.Estado}
                        </span>
                        <span className="font-bold text-neutral-900 tabular-nums shrink-0">
                          ${(parseFloat(p.Total_Final) || 0).toFixed(2)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
