'use client';

/**
 * Recetario: qué lleva cada producto y cuánto cuesta hacerlo.
 *
 * Sustituye a editar la hoja Catalogo a mano. Las dos reglas que evitan
 * que se vuelva a ensuciar:
 *  · el insumo se elige de una lista, no se escribe
 *  · la unidad la pone el insumo, no se teclea
 */

import { useCallback, useEffect, useState } from 'react';
import { precioLegible } from '@/lib/precioInsumo';

interface LineaReceta {
  id: string;
  /** 'producto' = este renglon es otro producto del menu (combos) */
  tipo?: 'insumo' | 'producto';
  idComponente?: string;
  idBiblioteca: string;
  insumo: string;
  unidad: string;
  cantidad: number;
  /** De qué precio sale el costo de este renglón */
  precio?: {
    origen: 'presentacion' | 'ultimaCompra' | 'ninguno';
    etiqueta: string;
    /** true = lo eligió el programa por barato, no la dueña */
    automatico: boolean;
    idPresentacion: string;
    porUnidad: number | null;
  } | null;
  /** Las formas de comprar el insumo, para poder cambiar de precio aquí */
  opcionesPrecio?: { id: string; etiqueta: string; porUnidad: number; activa: boolean }[];
  /** Cuánto queda de 100 al cocinar; '' si el insumo no cambia de peso */
  rendimientoPct?: string;
  /** Lo crudo que hay que ocupar para servir `cantidad`; null si no aplica */
  cantidadCruda?: number | null;
  merma: string;
  nota: string;
  costo: number | null;
  huerfano: boolean;
}

interface ProductoReceta {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  emoji: string;
  lineas: LineaReceta[];
  costoTotal: number | null;
}

interface InsumoOpcion {
  id: string;
  nombre: string;
  unidad: string;
  categoria: string;
  tienePrecio: boolean;
}

export default function RecetarioPage() {
  const [items, setItems] = useState<ProductoReceta[]>([]);
  const [insumos, setInsumos] = useState<InsumoOpcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [soloSinReceta, setSoloSinReceta] = useState(false);

  // Alta de un insumo dentro de una receta
  const [nuevoInsumo, setNuevoInsumo] = useState('');
  /** Un renglon puede ser un insumo o, en los combos, otro producto */
  const [modoAgregar, setModoAgregar] = useState<'insumo' | 'producto'>('insumo');
  const [nuevoComponente, setNuevoComponente] = useState('');
  const [nuevaCantidad, setNuevaCantidad] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const res = await fetch('/api/admin/recetario');
    const data = await res.json();
    setItems(data.items ?? []);
    setInsumos(data.insumos ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function llamar(metodo: string, cuerpo?: unknown, query = '') {
    setOcupado(true);
    setError('');
    const res = await fetch(`/api/admin/recetario${query}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setOcupado(false);
    if (!res.ok) {
      setError(data.error || 'No se pudo guardar');
      return false;
    }
    await cargar();
    return true;
  }

  /**
   * Cambia de qué presentación se costea un insumo.
   *
   * Pega al insumo y no a la receta: el precio es del insumo, así que la
   * elección vale para TODOS los productos que lo lleven. Cambiarla aquí
   * mueve el costo del sándwich y del combo al mismo tiempo, que es lo
   * que se quiere — un mismo queso no cuesta dos cosas distintas según en
   * qué platillo caiga.
   */
  async function cambiarPrecioBase(idBiblioteca: string, precioBase: string) {
    setOcupado(true);
    setError('');
    const res = await fetch('/api/admin/biblioteca', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: idBiblioteca, accion: 'precioBase', datos: { precioBase } }),
    });
    const data = await res.json().catch(() => ({}));
    setOcupado(false);
    if (!res.ok) {
      setError(data.error || 'No se pudo cambiar el precio');
      return;
    }
    await cargar();
  }

  /**
   * Qué presentación tiene marcada el selector.
   *
   * Solo cuenta como elegida cuando NO fue automática: si el programa
   * escogió la más barata, el selector debe seguir en "El más barato"
   * para que al cambiar los precios siga siguiéndolos, en vez de quedar
   * clavado en la que resultó barata ese día.
   */
  const precioBaseDe = (l: LineaReceta) => {
    if (!l.precio || l.precio.automatico) return '';
    return l.precio.origen === 'ultimaCompra' ? 'ULTIMA' : l.precio.idPresentacion;
  };

  async function agregar(idProducto: string) {
    const esProducto = modoAgregar === 'producto';
    if (esProducto && !nuevoComponente) return setError('Elige el producto');
    if (!esProducto && !nuevoInsumo) return setError('Elige el ingrediente');
    const cant = parseFloat(nuevaCantidad.replace(',', '.'));
    if (isNaN(cant) || cant <= 0) return setError('Escribe cuántos lleva');
    const ok = await llamar('POST', {
      idProducto,
      ...(esProducto ? { idComponente: nuevoComponente } : { idBiblioteca: nuevoInsumo }),
      cantidad: cant,
    });
    if (ok) {
      setNuevoInsumo('');
      setNuevoComponente('');
      setNuevaCantidad('');
    }
  }

  async function editarCantidad(l: LineaReceta) {
    const valor = prompt(`¿Cuánto ${l.insumo} lleva? (en ${l.unidad})`, String(l.cantidad));
    if (valor === null) return;
    const cant = parseFloat(valor.replace(',', '.'));
    if (isNaN(cant) || cant <= 0) return alert('Cantidad inválida');
    await llamar('PATCH', { id: l.id, cantidad: cant });
  }

  async function quitar(l: LineaReceta) {
    if (!confirm(`¿Quitar ${l.insumo} de esta receta?`)) return;
    await llamar('DELETE', undefined, `?id=${encodeURIComponent(l.id)}`);
  }

  const q = busqueda.trim().toLowerCase();
  const visibles = items
    .filter((p) => (soloSinReceta ? p.lineas.length === 0 : true))
    .filter(
      (p) =>
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        p.lineas.some((l) => l.insumo.toLowerCase().includes(q))
    );

  const sinReceta = items.filter((p) => p.lineas.length === 0).length;
  const porRevisar = items.reduce((n, p) => n + p.lineas.filter((l) => l.nota).length, 0);

  if (cargando) return <p className="text-neutral-700 animate-pulse">Cargando recetario…</p>;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-neutral-700">
          Qué lleva cada producto. El insumo se elige de tu biblioteca y la unidad la pone él, para
          que las cuentas de stock y costo siempre cuadren.
        </p>
      </div>

      {(sinReceta > 0 || porRevisar > 0) && (
        <div className="flex flex-wrap gap-2">
          {sinReceta > 0 && (
            <button
              onClick={() => setSoloSinReceta((v) => !v)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
                soloSinReceta ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800'
              }`}
            >
              ⚠️ {sinReceta} sin receta
            </button>
          )}
          {porRevisar > 0 && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-600">
              📝 {porRevisar} renglones marcados para revisar
            </span>
          )}
        </div>
      )}

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar producto o insumo…"
        className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-marron text-neutral-900"
      />

      <div className="space-y-3 text-neutral-900">
        {visibles.map((p) => {
          const activo = abierto === p.id;
          const margen = p.costoTotal !== null && p.precio > 0
            ? Math.round(((p.precio - p.costoTotal) / p.precio) * 100)
            : null;

          return (
            <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-neutral-100">
              <button
                onClick={() => {
                  setAbierto(activo ? null : p.id);
                  setNuevoInsumo('');
                  setNuevaCantidad('');
                  setError('');
                }}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <span className="text-2xl shrink-0">{p.emoji || '🍽️'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-neutral-900 truncate">{p.nombre}</p>
                  <p className="text-xs text-neutral-600">
                    {p.lineas.length === 0 ? (
                      <span className="text-amber-700 font-semibold">Sin receta</span>
                    ) : (
                      (() => {
                          const prods = p.lineas.filter((l) => l.tipo === 'producto').length;
                          const ings = p.lineas.length - prods;
                          // Un combo se describe por sus productos, no por 'insumos'
                          return [
                            prods > 0 ? `${prods} producto${prods === 1 ? '' : 's'}` : '',
                            ings > 0 ? `${ings} ingrediente${ings === 1 ? '' : 's'}` : '',
                          ]
                            .filter(Boolean)
                            .join(' + ');
                        })()
                    )}
                    {' · '}
                    {p.categoria}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-neutral-900">${p.precio.toFixed(2)}</p>
                  {p.costoTotal !== null ? (
                    <p className="text-[11px] text-neutral-700">
                      cuesta ${p.costoTotal.toFixed(2)}
                      {margen !== null && (
                        <span className={margen < 30 ? 'text-red-600 font-semibold' : 'text-green-700'}>
                          {' '}· {margen}%
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-[11px] text-neutral-600">costo incompleto</p>
                  )}
                </div>
                <span className="text-neutral-600 shrink-0">{activo ? '▴' : '▾'}</span>
              </button>

              {activo && (
                <div className="border-t border-neutral-100 p-4 space-y-2">
                  {p.lineas.length === 0 && (
                    <p className="text-sm text-neutral-600">
                      Todavía no tiene receta. Si es un combo, agrégale los productos que lo
                      forman; si no, sus ingredientes.
                    </p>
                  )}

                  {p.lineas.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center gap-2 py-1.5 border-b border-neutral-50 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-neutral-900">
                          {l.tipo === 'producto' && (
                            <span
                              className="text-[10px] font-bold bg-marron/10 text-marron px-1.5 py-0.5 rounded mr-1.5"
                              title="Es otro producto del menú, no un ingrediente"
                            >
                              PRODUCTO
                            </span>
                          )}
                          {l.insumo}
                          {l.huerfano && <span className="text-red-600"> (ya no existe)</span>}
                        </p>
                        {/*
                          El aviso de crudo va ARRIBA de la nota y no
                          abajo: es lo que hay que leer con las manos en
                          la tabla, mientras que la nota es contexto.
                          La cantidad de la derecha es la servida, que es
                          la que define la receta; esto es la traducción.
                        */}
                        {l.cantidadCruda != null && (
                          <p className="text-[11px] font-semibold text-orange-800">
                            🔥 En crudo son {l.cantidadCruda} {l.unidad}
                            <span className="font-normal text-neutral-700">
                              {' '}· de cada 100 quedan {l.rendimientoPct}
                            </span>
                          </p>
                        )}
                        {/*
                          De qué precio sale el costo, y cómo cambiarlo.

                          Se enseña siempre —aunque haya una sola forma de
                          comprarlo— porque el problema que esto resuelve
                          es invisible: el costo salía de un precio viejo
                          y nada en pantalla lo decía. Con la etiqueta a la
                          vista, un número raro se explica solo.
                        */}
                        {l.tipo !== 'producto' && l.precio && (
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-[11px] text-neutral-700">💲</span>
                            {l.opcionesPrecio && l.opcionesPrecio.length > 0 ? (
                              <select
                                value={
                                  /* El valor guardado, no el resuelto: si está
                                     en automático debe verse "el más barato"
                                     aunque hoy resuelva a la Kirkland. */
                                  precioBaseDe(l) === 'ULTIMA' ||
                                  l.opcionesPrecio.some((o) => o.id === precioBaseDe(l))
                                    ? precioBaseDe(l)
                                    : ''
                                }
                                onChange={(e) => cambiarPrecioBase(l.idBiblioteca, e.target.value)}
                                disabled={ocupado}
                                className="text-[11px] font-semibold text-neutral-900 bg-neutral-100 border border-neutral-300 rounded-lg px-1.5 py-0.5 max-w-[15rem] disabled:opacity-50"
                              >
                                <option value="">
                                  El más barato
                                  {l.precio.automatico &&
                                  l.precio.origen === 'presentacion' &&
                                  l.precio.porUnidad !== null
                                    ? ` — ${l.precio.etiqueta}, ${precioLegible(l.precio.porUnidad, l.unidad)}`
                                    : ''}
                                </option>
                                {l.opcionesPrecio.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {/* El precio como se compra, no por
                                        unidad de receta: "$93.00 el kg" se
                                        compara contra el letrero de la
                                        tienda, "$0.093 el gramo" no. */}
                                    {o.etiqueta} · {precioLegible(o.porUnidad, l.unidad)}
                                    {o.activa ? '' : ' (ya no la compras)'}
                                  </option>
                                ))}
                                {/* Salida de emergencia: cuando una
                                    presentación está mal capturada, esto
                                    fija el costo a la última compra
                                    mientras se corrige. */}
                                <option value="ULTIMA">La última compra que anotaste</option>
                              </select>
                            ) : (
                              <span className="text-[11px] font-semibold text-amber-800">
                                {l.precio.origen === 'ultimaCompra'
                                  ? 'Sale de la última compra — anota cómo lo compras para afinarlo'
                                  : 'Sin precio: anota una compra o una presentación'}
                              </span>
                            )}
                          </div>
                        )}
                        {l.nota && <p className="text-[11px] text-amber-700">📝 {l.nota}</p>}
                      </div>
                      <span className="text-sm font-semibold text-neutral-900 whitespace-nowrap">
                        {l.cantidad} {l.unidad}
                      </span>
                      <span className="text-xs text-neutral-600 w-16 text-right shrink-0">
                        {l.costo !== null ? `$${l.costo.toFixed(2)}` : '—'}
                      </span>
                      <button
                        onClick={() => editarCantidad(l)}
                        disabled={ocupado}
                        className="text-xs font-semibold text-black bg-neutral-200 px-2 py-1 rounded-lg active:scale-95 disabled:opacity-50"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => quitar(l)}
                        disabled={ocupado}
                        className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-lg active:scale-95 disabled:opacity-50"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}

                  {/* Dos maneras de armar la receta.
                      Un combo se declara con los PRODUCTOS que lo forman;
                      recapturar los ingredientes del sándwich y del jugo
                      dentro del combo es duplicar trabajo, y cuando cambie
                      la receta del sándwich el combo se queda viejo. */}
                  <div className="pt-2 space-y-2">
                    <div className="flex gap-1 bg-neutral-100 p-1 rounded-xl w-fit">
                      {(
                        [
                          ['insumo', '🥭 Un ingrediente'],
                          ['producto', '🍽️ Un producto del menú'],
                        ] as const
                      ).map(([v, etiqueta]) => (
                        <button
                          key={v}
                          onClick={() => {
                            setModoAgregar(v);
                            setNuevoInsumo('');
                            setNuevoComponente('');
                            setError('');
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            modoAgregar === v
                              ? 'bg-white text-neutral-900 shadow-sm'
                              : 'text-neutral-700'
                          }`}
                        >
                          {etiqueta}
                        </button>
                      ))}
                    </div>

                    {modoAgregar === 'producto' &&
                      (() => {
                        const disponibles = items.filter(
                          (o) => o.id !== p.id && !p.lineas.some((l) => l.idComponente === o.id)
                        );
                        // Un selector vacio sin explicacion deja a la
                        // persona esperando una lista que no va a llegar
                        return disponibles.length === 0 ? (
                          <p className="text-xs text-amber-700">
                            Ya le agregaste todos los productos que se pueden. Un producto no puede
                            llevarse a sí mismo ni repetirse.
                          </p>
                        ) : (
                          <p className="text-xs text-neutral-700">
                            Para combos: elige de qué productos se compone y el costo se saca solo
                            sumando lo que cuesta cada uno.
                          </p>
                        );
                      })()}

                    <div className="flex flex-wrap gap-2">
                      {modoAgregar === 'insumo' ? (
                        <select
                          value={nuevoInsumo}
                          onChange={(e) => setNuevoInsumo(e.target.value)}
                          className="flex-1 min-w-[160px] bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-marron"
                        >
                          <option value="">Elige el ingrediente…</option>
                          {insumos
                            .filter((i) => !p.lineas.some((l) => l.idBiblioteca === i.id))
                            .map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.nombre} ({i.unidad}){i.tienePrecio ? '' : ' — sin precio'}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <select
                          value={nuevoComponente}
                          onChange={(e) => setNuevoComponente(e.target.value)}
                          className="flex-1 min-w-[160px] bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-marron"
                        >
                          <option value="">Elige el producto…</option>
                          {items
                            .filter(
                              (o) =>
                                o.id !== p.id &&
                                !p.lineas.some((l) => l.idComponente === o.id)
                            )
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nombre}
                                {o.costoTotal !== null
                                  ? ` — cuesta $${o.costoTotal.toFixed(2)}`
                                  : ' — sin receta todavía'}
                              </option>
                            ))}
                        </select>
                      )}

                      <input
                        value={nuevaCantidad}
                        onChange={(e) => setNuevaCantidad(e.target.value)}
                        inputMode="decimal"
                        placeholder={modoAgregar === 'producto' ? 'Cuántos' : 'Cantidad'}
                        className="w-28 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-marron"
                      />
                      <span className="self-center text-sm text-neutral-900">
                        {modoAgregar === 'producto'
                          ? 'piezas'
                          : insumos.find((i) => i.id === nuevoInsumo)?.unidad || ''}
                      </span>
                      <button
                        onClick={() => agregar(p.id)}
                        disabled={ocupado}
                        className="bg-marron text-white text-sm font-semibold px-4 py-2 rounded-xl active:scale-95 disabled:opacity-50"
                      >
                        Agregar
                      </button>
                    </div>
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
              )}
            </div>
          );
        })}

        {visibles.length === 0 && (
          <p className="text-center text-neutral-600 py-8">Ningún producto coincide.</p>
        )}
      </div>
    </div>
  );
}
