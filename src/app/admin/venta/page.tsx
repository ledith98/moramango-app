'use client';

import { useEffect, useRef, useState } from 'react';
import { TicketBotones } from '../TicketBotones';
import type { DatosTicket } from '@/lib/ticket';
import { esBeneficioReactivacion, montoReactivacion } from '@/lib/beneficioCliente';

/** Fecha/hora en formato de ticket: 2026-07-14 16:25:30 (zona Monterrey) */
const fechaTicket = () => {
  const p = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Monterrey',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
};

interface Producto {
  ID_Producto: string;
  Nombre: string;
  Categoría: string;
  Precio_Venta: string;
  Disponible: string;
}

interface ItemVenta {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  ciclo: number;
  beneficio: string;
  faltanParaDescuento: number;
  faltanParaArticulo: number;
}

const ESTADOS = ['Recibido', 'En preparación', 'Listo para recoger', 'Entregado', 'Cancelado'];
const METODOS = ['Efectivo', 'Terminal', 'Transferencia'];

const etiquetaBeneficio = (b: string) =>
  esBeneficioReactivacion(b) ? `$${montoReactivacion(b)} de descuento` : b;

const ICONO_METODO: Record<string, string> = {
  Efectivo: '💵',
  Terminal: '💳',
  Transferencia: '📲',
};

export default function VentaPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [items, setItems] = useState<ItemVenta[]>([]);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [estado, setEstado] = useState('Recibido');
  const [notas, setNotas] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState('');
  const [ventaOk, setVentaOk] = useState<string | null>(null);
  const [ultimoTicket, setUltimoTicket] = useState<DatosTicket | null>(null);
  const [ultimoTelefono, setUltimoTelefono] = useState('');
  // Cobro en terminal Point
  const [esperandoTerminal, setEsperandoTerminal] = useState(false);
  const [mensajeTerminal, setMensajeTerminal] = useState('');
  const [terminalTerminado, setTerminalTerminado] = useState(false); // true = ya no seguir esperando
  const intentoRef = useRef<{ intentId: string; deviceId: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registrandoRef = useRef(false);
  // Cliente identificado (para acumular lealtad en ventas de mostrador)
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [aplicarBeneficio, setAplicarBeneficio] = useState(false);

  useEffect(() => {
    fetch('/api/admin/productos')
      .then((res) => res.json())
      .then((data) => {
        const disponibles = (data.productos || []).filter(
          (p: Producto) => p.Disponible === 'TRUE' || p.Disponible === 'true'
        );
        setProductos(disponibles);
      })
      .finally(() => setCargando(false));
  }, []);

  // Detener el polling si se sale de la página con un cobro en curso
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  // Buscar cliente (con pequeña espera para no consultar en cada tecla)
  useEffect(() => {
    if (cliente) return; // ya hay uno elegido
    const q = busquedaCliente.trim();
    if (q.length < 3) {
      setResultados([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/clientes?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((data) => setResultados(data.clientes || []))
        .catch(() => setResultados([]));
    }, 350);
    return () => clearTimeout(t);
  }, [busquedaCliente, cliente]);

  const elegirCliente = (c: Cliente) => {
    setCliente(c);
    setNombre(c.nombre);
    if (c.telefono) setTelefono(c.telefono);
    setResultados([]);
    setBusquedaCliente('');
    setAplicarBeneficio(false);
  };

  const quitarCliente = () => {
    setCliente(null);
    setAplicarBeneficio(false);
  };

  const cantidadDe = (idProducto: string) =>
    items.find((i) => i.id === idProducto)?.cantidad ?? 0;

  const agregar = (p: Producto) => {
    setVentaOk(null);
    setItems((prev) => {
      const existe = prev.find((i) => i.id === p.ID_Producto);
      if (existe) {
        return prev.map((i) =>
          i.id === p.ID_Producto ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }
      return [
        ...prev,
        {
          id: p.ID_Producto,
          nombre: p.Nombre,
          precio: parseFloat(p.Precio_Venta) || 0,
          cantidad: 1,
        },
      ];
    });
  };

  const quitar = (idProducto: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === idProducto);
      if (!item) return prev;
      if (item.cantidad > 1) {
        return prev.map((i) => (i.id === idProducto ? { ...i, cantidad: i.cantidad - 1 } : i));
      }
      return prev.filter((i) => i.id !== idProducto);
    });
  };

  const totalBruto = items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  // Solo 15% y reactivación se descuentan automático; el artículo gratis se elige a mano
  const beneficioCanjeado =
    aplicarBeneficio && cliente ? cliente.beneficio : 'Ninguno';
  const descuento =
    beneficioCanjeado === '15% Descuento'
      ? totalBruto * 0.15
      : esBeneficioReactivacion(beneficioCanjeado)
      ? Math.min(montoReactivacion(beneficioCanjeado), totalBruto)
      : 0;
  const total = totalBruto - descuento;

  // Registra la venta en el sheet. estadoPago='Pagado' cuando el cobro ya
  // se aprobó (ej. terminal). Limpia el formulario al terminar.
  const registrarVenta = async (estadoPago?: string) => {
    const res = await fetch('/api/admin/ventas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        metodoPago,
        estado,
        notas: notas.trim(),
        items,
        estadoPago,
        idUsuario: cliente?.id,
        beneficioCanjeado,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Error al registrar');

    // Guardar el ticket ANTES de limpiar el formulario
    const faltan = cliente ? Math.max(0, 5 - (cliente.ciclo + 1)) : 0;
    setUltimoTelefono(telefono.trim());
    setUltimoTicket({
      idPedido: data.idPedido,
      fecha: fechaTicket(),
      cliente: nombre.trim() || undefined,
      items: items.map((i) => ({
        cantidad: i.cantidad,
        nombre: i.nombre,
        subtotal: i.precio * i.cantidad,
      })),
      totalBruto,
      descuento,
      total,
      metodoPago,
      lealtad:
        cliente && faltan > 0
          ? `Llevas ${cliente.ciclo + 1} de 5 pedidos para tu 15% de descuento`
          : undefined,
    });

    setVentaOk(data.idPedido);
    setItems([]);
    setNombre('');
    setTelefono('');
    setMetodoPago('Efectivo');
    setEstado('Recibido');
    setNotas('');
    setCliente(null);
    setAplicarBeneficio(false);
    setBusquedaCliente('');
  };

  const detenerPoll = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  };

  const cerrarTerminal = () => {
    detenerPoll();
    setEsperandoTerminal(false);
    setTerminalTerminado(false);
    intentoRef.current = null;
  };

  // Consulta el estado del cobro; se re-agenda hasta que haya resultado.
  const pollTerminal = async () => {
    const intento = intentoRef.current;
    if (!intento) return;
    try {
      const res = await fetch(
        `/api/admin/ventas/terminal?intentId=${encodeURIComponent(intento.intentId)}`
      );
      const data = await res.json();

      if (data.resultado === 'aprobado') {
        if (registrandoRef.current) return;
        registrandoRef.current = true;
        detenerPoll();
        setMensajeTerminal('Pago aprobado ✅ Registrando venta...');
        try {
          await registrarVenta('Pagado');
          cerrarTerminal();
        } catch {
          setTerminalTerminado(true);
          setMensajeTerminal('El pago se aprobó, pero falló el registro. Revisa el pedido antes de reintentar.');
        } finally {
          registrandoRef.current = false;
        }
        return;
      }

      if (['rechazado', 'cancelado', 'error'].includes(data.resultado)) {
        detenerPoll();
        setTerminalTerminado(true);
        setMensajeTerminal(
          data.resultado === 'rechazado'
            ? '❌ Pago rechazado. La venta no se registró.'
            : data.resultado === 'cancelado'
            ? 'Cobro cancelado. La venta no se registró.'
            : '⚠️ Hubo un error con la terminal. La venta no se registró.'
        );
        return;
      }

      // pendiente → seguir esperando
      pollRef.current = setTimeout(pollTerminal, 2500);
    } catch {
      pollRef.current = setTimeout(pollTerminal, 3000);
    }
  };

  const iniciarCobroTerminal = async () => {
    setEsperandoTerminal(true);
    setTerminalTerminado(false);
    registrandoRef.current = false;
    setMensajeTerminal('Enviando el monto a la terminal...');
    try {
      const res = await fetch('/api/admin/ventas/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'No se pudo iniciar el cobro');

      intentoRef.current = { intentId: data.intentId, deviceId: data.deviceId };
      setMensajeTerminal('Esperando que el cliente pague en la terminal...');
      pollRef.current = setTimeout(pollTerminal, 2500);
    } catch (err: any) {
      detenerPoll();
      setTerminalTerminado(true);
      setMensajeTerminal(err.message || 'No se pudo iniciar el cobro');
    }
  };

  const cancelarCobroTerminal = async () => {
    const intento = intentoRef.current;
    detenerPoll();
    if (intento) {
      try {
        await fetch(
          `/api/admin/ventas/terminal?intentId=${encodeURIComponent(intento.intentId)}&deviceId=${encodeURIComponent(intento.deviceId)}`,
          { method: 'DELETE' }
        );
      } catch {}
    }
    cerrarTerminal();
  };

  const registrar = async () => {
    setError('');
    if (items.length === 0) {
      setError('Agrega al menos un producto');
      return;
    }
    if (!nombre.trim()) {
      setError('Escribe el nombre del cliente');
      return;
    }

    // Terminal: primero se cobra en la Point; la venta se registra solo si
    // el pago se aprueba (dentro del polling).
    if (metodoPago === 'Terminal') {
      await iniciarCobroTerminal();
      return;
    }

    setRegistrando(true);
    try {
      await registrarVenta();
    } catch (err: any) {
      setError(err.message || 'Error al registrar la venta');
    } finally {
      setRegistrando(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Columna 1: productos */}
      <div>
        <h2 className="font-bold text-neutral-900 mb-3">Productos</h2>
        {cargando ? (
          <p className="text-neutral-500 animate-pulse">Cargando productos...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {productos.map((p) => {
              const cant = cantidadDe(p.ID_Producto);
              return (
                <div
                  key={p.ID_Producto}
                  className={`relative bg-white rounded-2xl p-3 shadow-sm border text-left ${
                    cant > 0 ? 'border-black' : 'border-neutral-100'
                  }`}
                >
                  <button onClick={() => agregar(p)} className="w-full text-left active:scale-95 transition-transform">
                    <p className="text-[10px] text-neutral-400 uppercase tracking-wide">{p.Categoría}</p>
                    <p className="font-semibold text-neutral-900 text-sm leading-tight">{p.Nombre}</p>
                    <p className="font-bold text-black mt-1">${parseFloat(p.Precio_Venta || '0').toFixed(2)}</p>
                  </button>
                  {cant > 0 && (
                    <div className="mt-2 flex items-center justify-between bg-neutral-100 rounded-lg p-1">
                      <button
                        onClick={() => quitar(p.ID_Producto)}
                        className="w-7 h-7 flex items-center justify-center bg-white rounded-md font-bold text-neutral-900 shadow-sm active:scale-90"
                      >
                        −
                      </button>
                      <span className="font-bold text-sm text-neutral-900 tabular-nums">{cant}</span>
                      <button
                        onClick={() => agregar(p)}
                        className="w-7 h-7 flex items-center justify-center bg-black text-white rounded-md font-medium active:scale-90"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Columna 2: datos de la venta */}
      <div className="space-y-4">
        <h2 className="font-bold text-neutral-900">Datos de la venta</h2>

        {items.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 space-y-2">
            {items.map((i) => (
              <div key={i.id} className="flex justify-between text-sm">
                <span className="text-neutral-900 font-medium">
                  {i.cantidad}× {i.nombre}
                </span>
                <span className="font-semibold text-neutral-900">
                  ${(i.precio * i.cantidad).toFixed(2)}
                </span>
              </div>
            ))}
            {descuento > 0 && (
              <>
                <div className="flex justify-between text-sm pt-2 border-t border-neutral-100">
                  <span className="text-neutral-700">Subtotal</span>
                  <span className="text-neutral-700">${totalBruto.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-green-600 font-medium">
                  <span>🎁 Descuento 15% (lealtad)</span>
                  <span>−${descuento.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-neutral-100">
              <span className="font-medium text-neutral-500">Total</span>
              <span className="text-xl font-bold text-black">${total.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Cliente registrado — para que la venta sume a su lealtad */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 space-y-3">
          <label className="text-sm font-semibold text-neutral-700">
            Cliente registrado{' '}
            <span className="font-normal text-neutral-400">(opcional, para su lealtad)</span>
          </label>

          {!cliente ? (
            <>
              <input
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                placeholder="🔎 Buscar por teléfono, nombre o código..."
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
              />
              {resultados.length > 0 && (
                <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100 overflow-hidden">
                  {resultados.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => elegirCliente(c)}
                      className="w-full text-left p-3 hover:bg-neutral-50 transition-colors"
                    >
                      <p className="font-semibold text-neutral-900 text-sm">{c.nombre}</p>
                      <p className="text-xs text-neutral-500">
                        {c.telefono || 'sin teléfono'} · {c.ciclo} pedido{c.ciclo === 1 ? '' : 's'}
                        {c.beneficio !== 'Ninguno' && (
                          <span className="text-green-600 font-semibold"> · 🎁 {etiquetaBeneficio(c.beneficio)}</span>
                        )}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {busquedaCliente.trim().length >= 3 && resultados.length === 0 && (
                <p className="text-xs text-neutral-400">
                  Sin coincidencias. Puedes seguir sin identificarlo (venta normal).
                </p>
              )}
            </>
          ) : (
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-neutral-900">👤 {cliente.nombre}</p>
                  <p className="text-xs text-neutral-500">
                    {cliente.telefono} · {cliente.ciclo} pedido{cliente.ciclo === 1 ? '' : 's'} acumulados
                  </p>
                </div>
                <button
                  onClick={quitarCliente}
                  className="text-xs font-semibold text-neutral-500 bg-neutral-200 px-2 py-1 rounded-lg active:scale-95"
                >
                  Quitar
                </button>
              </div>

              {cliente.beneficio !== 'Ninguno' ? (
                <button
                  onClick={() => setAplicarBeneficio((v) => !v)}
                  className={`mt-2 w-full text-sm font-bold py-2.5 rounded-xl transition-colors ${
                    aplicarBeneficio ? 'bg-green-600 text-white' : 'bg-black text-white'
                  }`}
                >
                  {aplicarBeneficio
                    ? `✓ Aplicado: ${etiquetaBeneficio(cliente.beneficio)}`
                    : `🎁 Aplicar ${etiquetaBeneficio(cliente.beneficio)}`}
                </button>
              ) : (
                <p className="text-xs text-neutral-500 mt-2">
                  Le faltan {cliente.faltanParaDescuento} pedido
                  {cliente.faltanParaDescuento === 1 ? '' : 's'} para su 15% de descuento.
                </p>
              )}
              {aplicarBeneficio && cliente.beneficio === 'Articulo Gratis' && (
                <p className="text-xs text-amber-700 mt-2">
                  ⚠️ El artículo gratis (≤$35) no se descuenta solo: quítalo del total tú al cobrar.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-neutral-700">Nombre del cliente</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Ana"
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-neutral-700">
              Teléfono <span className="font-normal text-neutral-400">(opcional, para avisos por WhatsApp)</span>
            </label>
            <input
              type="tel"
              inputMode="numeric"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value.replace(/[^\d+]/g, '').slice(0, 16))}
              placeholder="+528186003207"
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-neutral-700">Método de pago</label>
            <div className="flex gap-2">
              {METODOS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMetodoPago(m)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    metodoPago === m ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {ICONO_METODO[m]} {m}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-neutral-700">Estado inicial</label>
            <div className="flex flex-wrap gap-2">
              {ESTADOS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEstado(e)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    estado === e ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-neutral-700">Notas</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Ej: Sin azúcar, extra hielo..."
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-sm text-neutral-900 focus:outline-none focus:border-black resize-none"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {ventaOk && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3">
            <div className="text-center">
              <p className="text-green-700 font-semibold">✅ Venta registrada</p>
              <p className="font-mono text-sm text-green-800 mt-1">{ventaOk}</p>
            </div>
            {ultimoTicket && <TicketBotones datos={ultimoTicket} telefono={ultimoTelefono} />}
          </div>
        )}

        <button
          onClick={registrar}
          disabled={registrando || esperandoTerminal}
          className="w-full bg-black text-white font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform shadow-md disabled:opacity-50 disabled:scale-100"
        >
          {registrando
            ? 'Registrando...'
            : metodoPago === 'Terminal'
            ? `Cobrar en terminal${total > 0 ? ` — $${total.toFixed(2)}` : ''}`
            : `Registrar venta${total > 0 ? ` — $${total.toFixed(2)}` : ''}`}
        </button>
      </div>

      {/* Modal: cobro en la terminal Point */}
      {esperandoTerminal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center">
            <div className="text-5xl mb-3">{terminalTerminado ? '💳' : '⏳'}</div>
            <p className="text-lg font-bold text-black mb-1">Cobro en terminal</p>
            <p className="text-2xl font-bold text-black mb-3">${total.toFixed(2)}</p>
            <p className="text-sm text-neutral-600 mb-6 min-h-[40px]">{mensajeTerminal}</p>

            {!terminalTerminado ? (
              <>
                <div className="flex justify-center mb-4">
                  <div className="w-8 h-8 border-4 border-neutral-200 border-t-black rounded-full animate-spin" />
                </div>
                <button
                  onClick={cancelarCobroTerminal}
                  className="w-full border border-red-200 text-red-600 font-semibold py-3 rounded-2xl active:scale-95 transition-transform"
                >
                  Cancelar cobro
                </button>
              </>
            ) : (
              <button
                onClick={cerrarTerminal}
                className="w-full bg-black text-white font-semibold py-3 rounded-2xl active:scale-95 transition-transform"
              >
                Cerrar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
