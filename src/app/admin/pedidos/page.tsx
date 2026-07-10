'use client';

import { useCallback, useEffect, useState } from 'react';

interface Pedido {
  ID_Pedido: string;
  ID_Usuario: string;
  Nombre_Cliente_Snap: string;
  Fecha_Hora: string;
  Estado: string;
  Hora_Recoleccion: string;
  Total_Final: string;
  Notas_Pedido: string;
  Telefono: string;
  HoraLegible: string;
  Origen_Venta: string;
  Metodo_Pago?: string;
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
const ESTADOS_FILTRO = ['Todos', ...FLUJO, 'Cancelado'];

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

const linkWhatsApp = (telefono: string, mensaje: string): string => {
  const digitos = telefono.replace(/\D/g, '');
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensaje)}`;
};

const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function PedidosPage() {
  const [fecha, setFecha] = useState(hoyISO());
  const [estadoFiltro, setEstadoFiltro] = useState('Todos');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [actualizando, setActualizando] = useState(false);

  const cargarPedidos = useCallback(() => {
    setCargando(true);
    const params = new URLSearchParams({ fecha });
    if (estadoFiltro !== 'Todos') params.set('estado', estadoFiltro);
    fetch(`/api/admin/pedidos?${params}`)
      .then((res) => res.json())
      .then((data) => setPedidos(data.pedidos || []))
      .finally(() => setCargando(false));
  }, [fecha, estadoFiltro]);

  useEffect(() => {
    cargarPedidos();
  }, [cargarPedidos]);

  const abrirDetalle = (idPedido: string) => {
    setCargandoDetalle(true);
    setDetalle(null);
    fetch(`/api/admin/pedidos/${idPedido}`)
      .then((res) => res.json())
      .then((data) => setDetalle(data))
      .finally(() => setCargandoDetalle(false));
  };

  const cambiarEstado = async (idPedido: string, nuevoEstado: string) => {
    setActualizando(true);
    try {
      await fetch('/api/admin/pedidos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPedido, nuevoEstado }),
      });
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

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-neutral-700">Fecha</label>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
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
        <span className="text-xs text-neutral-500 ml-auto">{pedidos.length} pedido{pedidos.length === 1 ? '' : 's'}</span>
      </div>

      {cargando ? (
        <p className="text-neutral-500 animate-pulse">Cargando pedidos...</p>
      ) : pedidos.length === 0 ? (
        <p className="text-neutral-500">No hay pedidos para este filtro.</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 divide-y divide-neutral-100 overflow-hidden">
          {pedidos.map((p) => (
            <button
              key={p.ID_Pedido}
              onClick={() => abrirDetalle(p.ID_Pedido)}
              className="w-full flex items-center gap-4 p-4 text-left hover:bg-neutral-50 transition-colors"
            >
              <span className="font-mono text-sm text-neutral-500 w-14 shrink-0">{p.HoraLegible}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-neutral-900 truncate">
                  {p.Origen_Venta === 'Local' && <span title="Venta en local">🏪 </span>}
                  {p.Nombre_Cliente_Snap}
                </p>
                <p className="text-xs text-neutral-500 font-mono">{p.ID_Pedido}</p>
              </div>
              <span className="font-bold text-neutral-900 shrink-0">${parseFloat(p.Total_Final || '0').toFixed(2)}</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${colorEstado(p.Estado)}`}>
                {p.Estado}
              </span>
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
              <div className="p-8 text-center text-neutral-500 animate-pulse">Cargando pedido...</div>
            ) : detalle ? (
              <>
                <div className="p-5 border-b border-neutral-100 shrink-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-sm text-neutral-500">{detalle.pedido.ID_Pedido}</p>
                      <h2 className="text-lg font-bold text-black">{detalle.cliente?.nombre || detalle.pedido.Nombre_Cliente_Snap}</h2>
                      {detalle.cliente?.telefono && (
                        <p className="text-sm text-neutral-500">📞 {detalle.cliente.telefono}</p>
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
                            {detalle.pedido.Metodo_Pago === 'Efectivo' ? '💵' : '💳'} {detalle.pedido.Metodo_Pago}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
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
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {detalle.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start bg-neutral-50 rounded-xl p-3">
                      <div>
                        <p className="font-semibold text-neutral-900 text-sm">
                          {item.Cantidad}× {item.Nombre_Producto_Snap}
                        </p>
                        {item.Notas_Item && (
                          <p className="text-xs text-neutral-500 mt-0.5">{item.Notas_Item}</p>
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
                    <span className="text-neutral-500 font-medium">Total</span>
                    <span className="text-xl font-bold text-black">${parseFloat(detalle.pedido.Total_Final || '0').toFixed(2)}</span>
                  </div>
                </div>

                <div className="p-5 border-t border-neutral-100 shrink-0">
                  <p className="text-xs font-semibold text-neutral-500 mb-2">
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
    </div>
  );
}
