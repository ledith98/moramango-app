'use client';

import { useEffect, useRef, useState } from 'react';
import { claveLinea, parsearTamanos, precioDesde, precioDeTamano } from '@/lib/tamanos';
import {
  claveEleccion,
  type Eleccion,
  enumerar,
  parsearOpciones,
  resumenEleccion,
} from '@/lib/opciones';
import { claveExtras, type Extra, parsearExtras, precioExtras, resumenExtras } from '@/lib/extras';
import { claveCategoria, posicionCategoria } from '@/lib/categorias';
import { claveNombre } from '@/lib/opcionesAgotadas';
import { TicketBotones } from '../TicketBotones';
import type { DatosTicket } from '@/lib/ticket';
import { esBeneficioReactivacion, montoReactivacion } from '@/lib/beneficioCliente';
import { comisionDeVenta } from '@/lib/comision';

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
  Emoji?: string;
  Tamanos?: string;
  Opciones?: string;
  Extras?: string;
  Orden_Menu?: string;
  Oculto?: string;
  Existencias?: string;
}

interface ItemVenta {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
  /** Vacío si el producto se vende con un solo precio */
  tamano: string;
  /** Lo elegido dentro del producto: { Queso: 'Queso suizo' } */
  opciones: Eleccion;
  /** Toppings; su costo ya viene sumado en `precio` */
  extras: Extra[];
  /** Identifica el renglón: mismo combo con distinto queso son dos */
  clave: string;
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
  /** Producto al que hay que elegirle tamaño y/u opciones antes de agregarlo */
  const [configurando, setConfigurando] = useState<Producto | null>(null);
  const [tamanoTemp, setTamanoTemp] = useState('');
  const [opcionesTemp, setOpcionesTemp] = useState<Eleccion>({});
  const [extrasTemp, setExtrasTemp] = useState<Extra[]>([]);
  /** Grupo que se está reabriendo para cambiar la respuesta */
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null);
  /** Descuento fuera de lo normal, a criterio de quien cobra */
  /** Transferencia: si ya se vio el dinero en la cuenta al cobrar */
  const [transferenciaRecibida, setTransferenciaRecibida] = useState(false);
  const [descuentoManual, setDescuentoManual] = useState('');
  const [motivoDescuento, setMotivoDescuento] = useState('');
  const [cargando, setCargando] = useState(true);
  const [items, setItems] = useState<ItemVenta[]>([]);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  // Con cuánto pagó el cliente en efectivo, para calcular el cambio
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  /** false = se la lleva fiada; el cobro queda pendiente */
  const [yaPago, setYaPago] = useState(true);
  const [estado, setEstado] = useState('Recibido');
  const [notas, setNotas] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState('');
  const [ventaOk, setVentaOk] = useState<string | null>(null);
  const [ultimoTicket, setUltimoTicket] = useState<DatosTicket | null>(null);
  // Teléfono capturado en la venta recién registrada, para copiarlo y
  // pegarlo en WhatsApp al mandar el ticket
  const [ultimoTelefono, setUltimoTelefono] = useState('');
  const [telCopiado, setTelCopiado] = useState(false);
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
  // Artículo gratis de la décima compra: cuál del carrito se regala
  const [articuloGratisId, setArticuloGratisId] = useState('');
  const [topeArticulo, setTopeArticulo] = useState(35);
  /** Orden de los grupos, el mismo del panel y de la tienda */
  const [ordenCategorias, setOrdenCategorias] = useState<string[]>([]);

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

    // Tope del artículo gratis, configurable desde Ajustes
    fetch('/api/admin/ajustes')
      .then((res) => res.json())
      .then((d) => {
        if (d?.topeArticuloGratis) setTopeArticulo(d.topeArticuloGratis);
        setOrdenCategorias(d?.ordenCategorias || []);
      })
      .catch(() => {});
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
    setArticuloGratisId('');
  };

  const quitarCliente = () => {
    setCliente(null);
    setAplicarBeneficio(false);
    setDescuentoManual('');
    setMotivoDescuento('');
    setTransferenciaRecibida(false);
    setArticuloGratisId('');
  };

  // Suma todos los tamaños: el mismo jugo puede ir en 500 ml y en 1 litro
  const cantidadDe = (idProducto: string) =>
    items.filter((i) => i.id === idProducto).reduce((n, i) => n + i.cantidad, 0);

  /**
   * Productos que hoy no se pueden preparar. El mostrador ya tiene la
   * lista completa (incluidos los ocultos), así que se calcula aquí sin
   * pedirle nada más al servidor.
   */
  const agotados = new Set(
    productos
      .filter((p) => {
        if ((p.Oculto || '').toUpperCase() === 'TRUE') return true;
        if ((p.Disponible || '').toUpperCase() === 'FALSE') return true;
        const ex = (p.Existencias ?? '').toString().trim();
        return ex !== '' && (parseFloat(ex) || 0) <= 0;
      })
      .map((p) => claveNombre(p.Nombre))
  );

  /**
   * Mismo acomodo que en Productos y en la tienda: por grupo y, dentro de
   * cada grupo, en el orden que se les dio. Antes salían en el orden de
   * las filas del Excel, así que buscar un producto al cobrar era una
   * cacería y los nuevos aparecían hasta el final.
   */
  const gruposProductos = Array.from(
    new Set(productos.map((p) => (p.Categoría || 'Otros').trim() || 'Otros'))
  )
    .sort(
      (a, b) =>
        posicionCategoria(a, ordenCategorias) - posicionCategoria(b, ordenCategorias) ||
        a.localeCompare(b, 'es')
    )
    .map((cat) => ({
      cat,
      items: productos
        .filter((p) => claveCategoria(p.Categoría || 'Otros') === claveCategoria(cat))
        .sort((a, b) => (parseInt(a.Orden_Menu ?? '') || 9999) - (parseInt(b.Orden_Menu ?? '') || 9999)),
    }));

  const agregar = (p: Producto, tamano?: string, eleccion?: Eleccion, extras?: Extra[]) => {
    setVentaOk(null);
    const tamanos = parsearTamanos(p.Tamanos ?? '');
    const grupos = parsearOpciones(p.Opciones ?? '');
    const extrasProducto = parsearExtras(p.Extras ?? '');
    // Hay decisiones que las toma el cliente: se abre el selector en vez
    // de adivinar el tamaño, el sabor o si quiere algún topping
    if (
      (tamanos.length > 0 && !tamano) ||
      (grupos.length > 0 && grupos.some((g) => !eleccion?.[g.nombre])) ||
      (extrasProducto.length > 0 && extras === undefined)
    ) {
      setConfigurando(p);
      setTamanoTemp(tamanos[0]?.nombre ?? '');
      setOpcionesTemp({});
      setGrupoAbierto(null);
      setExtrasTemp([]);
      return;
    }
    const elegidos = extras ?? [];
    const base = tamano
      ? precioDeTamano(tamanos, tamano) ?? 0
      : parseFloat(p.Precio_Venta) || 0;
    const precio = base + precioExtras(elegidos);
    const clave = claveLinea(
      p.ID_Producto,
      tamano,
      `${claveEleccion(grupos, eleccion)}#${claveExtras(elegidos)}`
    );
    setConfigurando(null);
    setItems((prev) => {
      if (prev.some((i) => i.clave === clave)) {
        return prev.map((i) => (i.clave === clave ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [
        ...prev,
        {
          id: p.ID_Producto,
          nombre: p.Nombre,
          precio,
          cantidad: 1,
          tamano: tamano ?? '',
          opciones: eleccion ?? {},
          extras: elegidos,
          clave,
        },
      ];
    });
  };

  const quitar = (clave: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.clave === clave);
      if (!item) return prev;
      if (item.cantidad > 1) {
        return prev.map((i) => (i.clave === clave ? { ...i, cantidad: i.cantidad - 1 } : i));
      }
      return prev.filter((i) => i.clave !== clave);
    });
  };

  const totalBruto = items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  const beneficioCanjeado =
    aplicarBeneficio && cliente ? cliente.beneficio : 'Ninguno';

  // Productos del carrito que pueden regalarse (dentro del tope)
  const candidatosGratis = items.filter((i) => i.precio <= topeArticulo);
  const articuloGratis =
    beneficioCanjeado === 'Articulo Gratis'
      ? candidatosGratis.find((i) => i.clave === articuloGratisId)
      : undefined;

  const descuentoLealtad =
    beneficioCanjeado === '15% Descuento'
      ? totalBruto * 0.15
      : esBeneficioReactivacion(beneficioCanjeado)
      ? Math.min(montoReactivacion(beneficioCanjeado), totalBruto)
      : articuloGratis
      ? articuloGratis.precio // solo una pieza, aunque lleve varias
      : 0;
  // Descuento manual: se suma al de lealtad, nunca lo reemplaza
  const descuentoManualNum = parseFloat(descuentoManual.replace(',', '.')) || 0;
  const descuentoExcedido = descuentoLealtad + descuentoManualNum > totalBruto + 0.001;
  const descuento = descuentoLealtad + (descuentoExcedido ? 0 : descuentoManualNum);
  const total = Math.max(0, totalBruto - descuento);
  // Cambio en efectivo: solo tiene sentido si el cliente da de más
  const recibidoNum = parseFloat(efectivoRecibido.replace(',', '.')) || 0;
  const cambio = metodoPago === 'Efectivo' && recibidoNum > total ? recibidoNum - total : 0;

  // Registra la venta en el sheet. estadoPago='Pagado' cuando el cobro ya
  // se aprobó (ej. terminal). Limpia el formulario al terminar.
  const registrarVenta = async (estadoPago?: string) => {
    if (descuentoExcedido) {
      throw new Error('El descuento no puede ser mayor que el total de la venta');
    }
    if (descuentoManualNum > 0 && !motivoDescuento.trim()) {
      throw new Error('Escribe el motivo del descuento manual');
    }
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
        articuloGratisId: articuloGratis?.clave,
        descuentoManual: descuentoManualNum > 0 ? descuentoManualNum : undefined,
        motivoDescuento: motivoDescuento.trim() || undefined,
        // Solo para efectivo con cambio; queda de registro en el pedido
        yaPago,
        efectivoRecibido:
          metodoPago === 'Efectivo' && yaPago && recibidoNum > 0 ? recibidoNum : undefined,
        cambio: cambio > 0 ? cambio : undefined,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Error al registrar');

    // Guardar el ticket ANTES de limpiar el formulario
    const faltan = cliente ? Math.max(0, 5 - (cliente.ciclo + 1)) : 0;
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
      efectivoRecibido: cambio > 0 ? recibidoNum : undefined,
      cambio: cambio > 0 ? cambio : undefined,
      lealtad:
        cliente && faltan > 0
          ? `Llevas ${cliente.ciclo + 1} de 5 pedidos para tu 15% de descuento`
          : undefined,
    });

    setVentaOk(data.idPedido);
    setUltimoTelefono(telefono.trim());
    setTelCopiado(false);
    setItems([]);
    setNombre('');
    setTelefono('');
    setMetodoPago('Efectivo');
    setEfectivoRecibido('');
    setYaPago(true);
    setEstado('Recibido');
    setNotas('');
    setCliente(null);
    setAplicarBeneficio(false);
    setArticuloGratisId('');
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
    // En efectivo es obligatorio capturar con cuánto pagó (o "Justo"), para
    // que el corte de caja cuadre y quede el registro del cambio.
    if (metodoPago === 'Efectivo' && yaPago) {
      if (efectivoRecibido.trim() === '') {
        setError('Registra con cuánto paga el cliente (o toca "Justo" si dio el monto exacto).');
        return;
      }
      if (recibidoNum < total) {
        setError(`El efectivo recibido no cubre el total de $${total.toFixed(2)}.`);
        return;
      }
    }

    // Terminal: primero se cobra en la Point; la venta se registra solo si
    // el pago se aprueba (dentro del polling).
    if (metodoPago === 'Terminal') {
      await iniciarCobroTerminal();
      return;
    }

    setRegistrando(true);
    try {
      await registrarVenta(
        metodoPago === 'Transferencia' && transferenciaRecibida ? 'Pagado' : undefined
      );
    } catch (err: any) {
      setError(err.message || 'Error al registrar la venta');
    } finally {
      setRegistrando(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Elegir tamaño y opciones antes de agregar */}
      {configurando && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setConfigurando(null)}
        >
          <div
            className="bg-white rounded-3xl p-5 w-full max-w-sm space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="text-xs text-neutral-600 uppercase tracking-wide font-semibold">
                {configurando.Categoría}
              </p>
              <h3 className="font-bold text-lg text-neutral-900 leading-tight">
                {configurando.Nombre}
              </h3>
            </div>

            {parsearOpciones(configurando.Opciones ?? '').map((g) => {
              const elegido = opcionesTemp[g.nombre];
              const abierto = !elegido || grupoAbierto === g.nombre;

              // Contestada, la lista se recoge: en el mostrador se cobra
              // rápido y ocho sabores a la vista estorban más que ayudan.
              if (!abierto) {
                return (
                  <button
                    key={g.nombre}
                    onClick={() => setGrupoAbierto(g.nombre)}
                    className="w-full flex items-center justify-between gap-3 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-left active:scale-[0.99]"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs text-neutral-700 font-medium">{g.nombre}</span>
                      <span className="block font-bold text-neutral-900 truncate">✓ {elegido}</span>
                    </span>
                    <span className="text-sm font-bold text-neutral-700 shrink-0">Cambiar</span>
                  </button>
                );
              }

              return (
                <div key={g.nombre}>
                  <p className="text-sm font-semibold text-neutral-800 mb-2">{g.nombre}</p>
                  <div className="flex flex-wrap gap-2">
                    {g.opciones.map((o) => {
                      const activo = elegido === o;
                      // Se marca, pero NO se bloquea: en el mostrador tú
                      // sabes si de verdad queda algo, y a veces sí.
                      const agotada = agotados.has(claveNombre(o));
                      return (
                        <button
                          key={o}
                          onClick={() => {
                            setOpcionesTemp((prev) => ({ ...prev, [g.nombre]: o }));
                            setGrupoAbierto(null);
                          }}
                          className={`px-3 py-2 rounded-xl border-2 text-sm font-semibold active:scale-95 ${
                            activo
                              ? 'border-black bg-neutral-100 text-neutral-900'
                              : agotada
                              ? 'border-red-200 bg-red-50 text-red-800'
                              : 'border-neutral-200 bg-white text-neutral-800'
                          }`}
                        >
                          {o}
                          {agotada && <span className="block text-[10px] font-bold">agotado</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {parsearExtras(configurando.Extras ?? '').length > 0 && (
              <div>
                <p className="text-sm font-semibold text-neutral-800 mb-2">
                  Extras <span className="font-normal text-neutral-600">(opcional)</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {parsearExtras(configurando.Extras ?? '').map((e) => {
                    const activo = extrasTemp.some((x) => x.nombre === e.nombre);
                    return (
                      <button
                        key={e.nombre}
                        onClick={() =>
                          setExtrasTemp((prev) =>
                            activo ? prev.filter((x) => x.nombre !== e.nombre) : [...prev, e]
                          )
                        }
                        className={`px-3 py-2 rounded-xl border-2 text-sm font-semibold active:scale-95 ${
                          activo
                            ? 'border-black bg-neutral-100 text-neutral-900'
                            : 'border-neutral-200 bg-white text-neutral-800'
                        }`}
                      >
                        {activo ? '✓ ' : '+ '}
                        {e.nombre} <span className="font-bold">${e.precio.toFixed(2)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {parsearTamanos(configurando.Tamanos ?? '').length > 0 && (
              <div>
                <p className="text-sm font-semibold text-neutral-800 mb-2">Tamaño</p>
                <div className="grid grid-cols-2 gap-2">
                  {parsearTamanos(configurando.Tamanos ?? '').map((t) => {
                    const activo = tamanoTemp === t.nombre;
                    return (
                      <button
                        key={t.nombre}
                        onClick={() => setTamanoTemp(t.nombre)}
                        className={`border-2 rounded-2xl p-3 text-left active:scale-95 ${
                          activo ? 'border-black bg-neutral-100' : 'border-neutral-200'
                        }`}
                      >
                        <span className="block font-bold text-neutral-900 text-sm">{t.nombre}</span>
                        <span className="block text-lg font-bold text-black">
                          ${t.precio.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(() => {
              const faltan = parsearOpciones(configurando.Opciones ?? '')
                .filter((g) => !opcionesTemp[g.nombre])
                .map((g) => g.nombre.toLowerCase());
              return (
                <button
                  onClick={() => agregar(configurando, tamanoTemp, opcionesTemp, extrasTemp)}
                  disabled={faltan.length > 0}
                  className="w-full py-3.5 rounded-xl bg-black text-white font-bold active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                >
                  {faltan.length > 0
                    ? `Falta elegir ${enumerar(faltan)}`
                    : `Agregar a la venta${[
                        tamanoTemp,
                        resumenEleccion(parsearOpciones(configurando.Opciones ?? ''), opcionesTemp),
                        resumenExtras(extrasTemp),
                      ]
                        .filter(Boolean)
                        .map((t) => ` · ${t}`)
                        .join('')}`}
                </button>
              );
            })()}
            <button
              onClick={() => setConfigurando(null)}
              className="w-full py-3 rounded-xl bg-neutral-100 font-semibold text-neutral-800 active:scale-95"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Columna 1: productos */}
      <div>
        <h2 className="font-bold text-neutral-900 mb-3">Productos</h2>
        {cargando ? (
          <p className="text-neutral-700 animate-pulse">Cargando productos...</p>
        ) : (
          <div className="space-y-5">
            {gruposProductos.map(({ cat, items }) => (
              <section key={cat}>
                <h3 className="text-xs font-bold text-neutral-600 uppercase tracking-wide mb-2">
                  {cat}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((p) => {
              const cant = cantidadDe(p.ID_Producto);
              const tamanosP = parsearTamanos(p.Tamanos ?? '');
              const gruposP = parsearOpciones(p.Opciones ?? '');
              const extrasP = parsearExtras(p.Extras ?? '');
              const hayQueElegir =
                tamanosP.length > 0 || gruposP.length > 0 || extrasP.length > 0;
              return (
                <div
                  key={p.ID_Producto}
                  className={`relative bg-white rounded-2xl p-3 shadow-sm border text-left ${
                    cant > 0 ? 'border-black' : 'border-neutral-100'
                  }`}
                >
                  <button onClick={() => agregar(p)} className="w-full text-left active:scale-95 transition-transform">
                    <p className="font-semibold text-neutral-900 text-sm leading-tight">
                      {p.Emoji && <span className="mr-1">{p.Emoji}</span>}
                      {p.Nombre}
                    </p>
                    <p className="font-bold text-black mt-1">
                      {tamanosP.length > 0 && (
                        <span className="text-[10px] font-semibold text-neutral-700 mr-1">desde</span>
                      )}
                      ${precioDesde(tamanosP, parseFloat(p.Precio_Venta || '0')).toFixed(2)}
                    </p>
                    {tamanosP.length > 0 && (
                      <p className="text-[10px] font-semibold text-neutral-700 mt-0.5">
                        {tamanosP.map((t) => t.nombre).join(' · ')}
                      </p>
                    )}
                    {gruposP.length > 0 && (
                      <p className="text-[10px] font-semibold text-neutral-700 mt-0.5">
                        a elegir: {gruposP.map((g) => g.nombre.toLowerCase()).join(', ')}
                      </p>
                    )}
                  </button>
                  {cant > 0 && hayQueElegir && (
                    <div className="mt-2 text-center bg-neutral-100 rounded-lg py-1">
                      <span className="font-bold text-sm text-neutral-900 tabular-nums">
                        {cant} en la venta
                      </span>
                    </div>
                  )}
                  {cant > 0 && !hayQueElegir && (
                    <div className="mt-2 flex items-center justify-between bg-neutral-100 rounded-lg p-1">
                      <button
                        onClick={() => quitar(claveLinea(p.ID_Producto))}
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
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Columna 2: datos de la venta */}
      <div className="space-y-4">
        <h2 className="font-bold text-neutral-900">Datos de la venta</h2>

        {items.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 space-y-2">
            {items.map((i) => (
              <div key={i.clave} className="flex justify-between items-center text-sm gap-2">
                <span className="text-neutral-900 font-medium flex-1 min-w-0">
                  {i.cantidad}× {i.nombre}
                  {[i.tamano, ...Object.values(i.opciones ?? {}), resumenExtras(i.extras ?? [])]
                    .filter(Boolean).length > 0 && (
                    <span className="text-neutral-700 font-semibold">
                      {' '}
                      (
                      {[
                        i.tamano,
                        ...Object.values(i.opciones ?? {}),
                        resumenExtras(i.extras ?? []),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      )
                    </span>
                  )}
                </span>
                <span className="font-semibold text-neutral-900 shrink-0">
                  ${(i.precio * i.cantidad).toFixed(2)}
                </span>
                <button
                  onClick={() => quitar(i.clave)}
                  aria-label={`Quitar uno de ${i.nombre}`}
                  className="w-6 h-6 shrink-0 rounded-md bg-neutral-100 text-neutral-700 font-bold active:scale-90"
                >
                  −
                </button>
              </div>
            ))}
            {descuento > 0 && (
              <>
                <div className="flex justify-between text-sm pt-2 border-t border-neutral-100">
                  <span className="text-neutral-700">Subtotal</span>
                  <span className="text-neutral-700">${totalBruto.toFixed(2)}</span>
                </div>
                {descuentoLealtad > 0 && (
                  <div className="flex justify-between text-sm text-green-600 font-medium">
                    <span>
                      {articuloGratis
                        ? `🎁 Gratis: ${articuloGratis.nombre}`
                        : beneficioCanjeado === '15% Descuento'
                        ? '🎁 Descuento 15% (lealtad)'
                        : '🎁 Descuento (lealtad)'}
                    </span>
                    <span>−${descuentoLealtad.toFixed(2)}</span>
                  </div>
                )}
                {!descuentoExcedido && descuentoManualNum > 0 && (
                  <div className="flex justify-between text-sm text-green-600 font-medium">
                    <span>🏷️ Descuento manual</span>
                    <span>−${descuentoManualNum.toFixed(2)}</span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-neutral-100">
              <span className="font-medium text-neutral-700">Total</span>
              <span className="text-xl font-bold text-black">${total.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Descuento manual — para casos fuera de lo normal */}
        {items.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 space-y-3">
            <div>
              <label className="text-sm font-semibold text-neutral-700">
                Descuento manual{' '}
                <span className="font-normal text-neutral-600">(opcional)</span>
              </label>
              <p className="text-xs text-neutral-600 mt-0.5">
                Solo para casos fuera de lo normal. Se suma al de lealtad si el cliente ya traía
                uno, y queda anotado en el pedido con su motivo.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-neutral-700">$</span>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={descuentoManual}
                onChange={(e) => setDescuentoManual(e.target.value)}
                placeholder="0"
                className="w-28 bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-black"
              />
              <input
                value={motivoDescuento}
                onChange={(e) => setMotivoDescuento(e.target.value)}
                placeholder="Motivo (ej. se tardó el pedido)"
                className="flex-1 min-w-0 bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-black"
              />
            </div>

            {descuentoExcedido && (
              <p className="text-sm text-red-600 font-semibold">
                El descuento no puede ser mayor que el total de la venta (${totalBruto.toFixed(2)}).
              </p>
            )}
            {!descuentoExcedido && descuentoManualNum > 0 && !motivoDescuento.trim() && (
              <p className="text-sm text-amber-700 font-semibold">
                Escribe el motivo para poder registrarlo.
              </p>
            )}
          </div>
        )}

        {/* Cliente registrado — para que la venta sume a su lealtad */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 space-y-3">
          <label className="text-sm font-semibold text-neutral-700">
            Cliente registrado{' '}
            <span className="font-normal text-neutral-600">(opcional, para su lealtad)</span>
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
                <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100 overflow-hidden text-neutral-900">
                  {resultados.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => elegirCliente(c)}
                      className="w-full text-left p-3 hover:bg-neutral-50 transition-colors"
                    >
                      <p className="font-semibold text-neutral-900 text-sm">{c.nombre}</p>
                      <p className="text-xs text-neutral-700">
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
                <p className="text-xs text-neutral-600">
                  Sin coincidencias. Puedes seguir sin identificarlo (venta normal).
                </p>
              )}
            </>
          ) : (
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-neutral-900">👤 {cliente.nombre}</p>
                  <p className="text-xs text-neutral-700">
                    {cliente.telefono} · {cliente.ciclo} pedido{cliente.ciclo === 1 ? '' : 's'} acumulados
                  </p>
                </div>
                <button
                  onClick={quitarCliente}
                  className="text-xs font-semibold text-neutral-700 bg-neutral-200 px-2 py-1 rounded-lg active:scale-95"
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
                <p className="text-xs text-neutral-700 mt-2">
                  Le faltan {cliente.faltanParaDescuento} pedido
                  {cliente.faltanParaDescuento === 1 ? '' : 's'} para su 15% de descuento.
                </p>
              )}
              {aplicarBeneficio && cliente.beneficio === 'Articulo Gratis' && (
                <div className="mt-2 space-y-1.5">
                  <label className="block text-xs font-semibold text-neutral-700">
                    ¿Cuál se lleva gratis? (hasta ${topeArticulo})
                  </label>
                  {candidatosGratis.length === 0 ? (
                    <p className="text-xs text-amber-700">
                      {items.length === 0
                        ? 'Agrega productos a la venta para elegir cuál va gratis.'
                        : `Ningún producto de esta venta cuesta $${topeArticulo} o menos.`}
                    </p>
                  ) : (
                    <>
                      <select
                        value={articuloGratisId}
                        onChange={(e) => setArticuloGratisId(e.target.value)}
                        className="w-full bg-white border border-neutral-200 rounded-xl p-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black"
                      >
                        <option value="">Elige el producto…</option>
                        {candidatosGratis.map((i) => (
                          <option key={i.clave} value={i.clave}>
                            {i.nombre}
                            {[
                              i.tamano,
                              ...Object.values(i.opciones ?? {}),
                              resumenExtras(i.extras ?? []),
                            ].filter(Boolean).length > 0
                              ? ` (${[
                                  i.tamano,
                                  ...Object.values(i.opciones ?? {}),
                                  resumenExtras(i.extras ?? []),
                                ]
                                  .filter(Boolean)
                                  .join(' · ')})`
                              : ''}{' '}
                            — ${i.precio.toFixed(2)}
                          </option>
                        ))}
                      </select>
                      {articuloGratis ? (
                        <p className="text-xs font-semibold text-green-700">
                          ✓ Se descuenta ${articuloGratis.precio.toFixed(2)} del total
                        </p>
                      ) : (
                        <p className="text-xs text-amber-700">
                          Elige cuál va gratis para que se descuente.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 space-y-4">
          <h3 className="font-bold text-neutral-900">👤 Datos del cliente</h3>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-neutral-700">Nombre del cliente</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Ana"
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
            />
          </div>

          <div className="space-y-1.5 text-neutral-900">
            <label className="text-sm font-semibold text-neutral-700">
              Teléfono <span className="font-normal text-neutral-600">(opcional, para avisos por WhatsApp)</span>
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

        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 space-y-4">
          <h3 className="font-bold text-neutral-900">💵 Cobro</h3>
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

          {/* Terminal: lo que de verdad va a caer en la cuenta. Se ve
              ANTES de cobrar, que es cuando todavia se puede ofrecer
              efectivo o transferencia si la venta es chica. */}
          {metodoPago === 'Terminal' && total > 0 && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-red-700">Comisión de la terminal</span>
                <span className="font-semibold text-red-700 tabular-nums">
                  −${comisionDeVenta(total, 'Terminal').toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="font-semibold text-neutral-900">Entra a tu cuenta</span>
                <span className="font-bold text-green-700 tabular-nums">
                  ${(total - comisionDeVenta(total, 'Terminal')).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Transferencia: ¿ya cayó el dinero o queda pendiente de revisar? */}
          {metodoPago === 'Transferencia' && (
            <label className="flex items-start gap-3 bg-neutral-50 border border-neutral-200 rounded-xl p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={transferenciaRecibida}
                onChange={(e) => setTransferenciaRecibida(e.target.checked)}
                className="mt-0.5 w-5 h-5 accent-black"
              />
              <span>
                <span className="font-semibold text-neutral-900 block">
                  Ya vi la transferencia en mi cuenta
                </span>
                <span className="text-xs text-neutral-700">
                  Si no la marcas, la venta queda como <b>cobro por confirmar</b> y te aparece
                  arriba en Pedidos hasta que la des por recibida.
                </span>
              </span>
            </label>
          )}

          {/* ¿Ya pagó o se la lleva fiada? Registrar la venta y cobrarla
              no siempre pasan al mismo tiempo, y forzar un monto obligaba
              a inventar una cifra que después descuadraba la caja. */}
          {metodoPago === 'Efectivo' && (
            <div className="flex gap-1 bg-neutral-100 p-1 rounded-xl w-fit">
              {(
                [
                  [true, '✅ Ya pagó'],
                  [false, '🕓 Queda a deber'],
                ] as const
              ).map(([v, etiqueta]) => (
                <button
                  key={String(v)}
                  onClick={() => setYaPago(v)}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
                    yaPago === v ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-700'
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          )}

          {metodoPago === 'Efectivo' && !yaPago && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
              La venta queda como <b>cobro por confirmar</b> y te aparece arriba en Pedidos hasta
              que la marques como pagada. Ese dinero no cuenta para el corte de caja de hoy.
            </p>
          )}

          {/* Cambio en efectivo: con cuánto pagó → cuánto se le regresa */}
          {metodoPago === 'Efectivo' && yaPago && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700">
                ¿Con cuánto paga? <span className="font-normal text-red-600">(obligatorio)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {[50, 100, 200, 500].map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setEfectivoRecibido(String(b))}
                    className="px-3 py-2 rounded-lg text-sm font-semibold bg-neutral-100 text-neutral-700 active:scale-95"
                  >
                    ${b}
                  </button>
                ))}
                {total > 0 && (
                  <button
                    type="button"
                    onClick={() => setEfectivoRecibido(total.toFixed(2))}
                    className="px-3 py-2 rounded-lg text-sm font-semibold bg-neutral-100 text-neutral-700 active:scale-95"
                  >
                    Justo
                  </button>
                )}
              </div>
              <input
                type="number"
                inputMode="decimal"
                value={efectivoRecibido}
                onChange={(e) => setEfectivoRecibido(e.target.value)}
                placeholder="Cantidad recibida"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-black"
              />
              {recibidoNum > 0 && recibidoNum < total && (
                <p className="text-xs text-amber-700 font-semibold">
                  Faltan ${(total - recibidoNum).toFixed(2)} para cubrir el total.
                </p>
              )}
              {cambio > 0 && (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <span className="text-sm font-semibold text-green-800">Cambio a devolver</span>
                  <span className="text-2xl font-bold text-green-700 tabular-nums">
                    ${cambio.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 space-y-4">
          <h3 className="font-bold text-neutral-900">📝 Preparación</h3>
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
            {/* Copiar el número del cliente para pegarlo en WhatsApp y
                mandarle el ticket */}
            {ultimoTelefono && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(ultimoTelefono);
                  setTelCopiado(true);
                  setTimeout(() => setTelCopiado(false), 2000);
                }}
                className="w-full flex items-center justify-center gap-2 bg-white border border-green-300 text-green-800 text-sm font-semibold py-2.5 rounded-xl active:scale-95 transition-transform"
              >
                {telCopiado ? '✅ Número copiado' : `📋 Copiar número · ${ultimoTelefono}`}
              </button>
            )}
            {ultimoTicket && <TicketBotones datos={ultimoTicket} />}
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
