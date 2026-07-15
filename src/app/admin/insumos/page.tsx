'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { CATEGORIAS_INSUMOS, DIAS_FRESCURA } from '@/lib/insumos';

interface Insumo {
  id: string;
  nombre: string;
  unidad: string;
  proveedor: string;
  categoria: string;
  stock: number;
  consumoDiario: number;
  diasRestantes: number | null;
  nivel: 'rojo' | 'amarillo' | 'verde' | 'gris';
  sugerenciaCompra: number;
  conteoFisico: number | null;
  fechaConteo: string;
  diferencia: number | null;
  fechaCompra: string;
  fechaCompraISO: string;
  diasDesdeCompra: number | null;
  fresco: boolean | null;
  enRecetas: boolean;
}

const PUNTO_NIVEL: Record<string, string> = {
  rojo: 'bg-red-500',
  amarillo: 'bg-amber-400',
  verde: 'bg-green-500',
  gris: 'bg-neutral-300',
};

const SIN_CATEGORIA = 'Sin categoría';

const ICONO_GRUPO: Record<string, string> = {
  'Verduras y frutas': '🥬',
  Pan: '🍞',
  'Jamón y queso': '🧀',
  'Leche y agua': '🥛',
  Complementos: '🍯',
  Empaque: '📦',
  Condimentos: '🥫',
  [SIN_CATEGORIA]: '❔',
};

const NIVELES_FILTRO = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'porAcabarse', etiqueta: '🔴 Por acabarse' },
  { valor: 'bajo', etiqueta: '🟡 Bajo' },
  { valor: 'bien', etiqueta: '🟢 Bien' },
  { valor: 'revisarFrescura', etiqueta: '🥬 Revisar frescura' },
];

export default function InsumosPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [diasAnalisis, setDiasAnalisis] = useState(7);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState('Todos');
  const [filtroNivel, setFiltroNivel] = useState('todos');
  const [listaCopiada, setListaCopiada] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    fetch('/api/admin/insumos')
      .then((res) => res.json())
      .then((data) => {
        setInsumos(data.insumos || []);
        if (data.diasAnalisis) setDiasAnalisis(data.diasAnalisis);
      })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const accion = async (idInsumo: string, tipo: string, cantidad?: number) => {
    setOcupado(true);
    try {
      const res = await fetch('/api/admin/insumos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idInsumo, accion: tipo, cantidad }),
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      cargar();
    } finally {
      setOcupado(false);
    }
  };

  const registrarCompra = (ins: Insumo) => {
    const valor = prompt(`¿Cuánto compraste de "${ins.nombre}"? (en ${ins.unidad || 'unidades'})`);
    if (valor === null) return;
    const num = parseFloat(valor.replace(',', '.'));
    if (isNaN(num) || num <= 0) {
      alert('Cantidad inválida');
      return;
    }
    accion(ins.id, 'restock', num);
  };

  const capturarConteo = (ins: Insumo) => {
    const valor = prompt(
      `Conteo físico de "${ins.nombre}": ¿cuánto hay realmente en el local? (en ${ins.unidad || 'unidades'})`
    );
    if (valor === null) return;
    const num = parseFloat(valor.replace(',', '.'));
    if (isNaN(num) || num < 0) {
      alert('Cantidad inválida');
      return;
    }
    accion(ins.id, 'conteo', num);
  };

  const ajustar = (ins: Insumo) => {
    if (
      !confirm(
        `¿Ajustar el stock de "${ins.nombre}" al conteo físico (${ins.conteoFisico} ${ins.unidad})? El stock teórico actual (${ins.stock}) se reemplaza.`
      )
    )
      return;
    accion(ins.id, 'ajustar');
  };

  const cambiarCategoria = async (ins: Insumo, valor: string) => {
    setInsumos((prev) => prev.map((x) => (x.id === ins.id ? { ...x, categoria: valor } : x)));
    setOcupado(true);
    try {
      await fetch('/api/admin/insumos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idInsumo: ins.id, accion: 'categoria', valor }),
      });
      cargar();
    } finally {
      setOcupado(false);
    }
  };

  const cambiarFechaCompra = async (ins: Insumo, valor: string) => {
    setOcupado(true);
    try {
      await fetch('/api/admin/insumos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idInsumo: ins.id, accion: 'fecha_compra', valor }),
      });
      cargar();
    } finally {
      setOcupado(false);
    }
  };

  const alertas = insumos
    .filter((i) => i.nivel === 'rojo' || i.nivel === 'amarillo')
    .sort((a, b) => (a.nivel === 'rojo' ? -1 : 1) - (b.nivel === 'rojo' ? -1 : 1));

  // Frescos comprados hace más del margen permitido
  const alertasFrescura = insumos.filter((i) => i.fresco === false);

  // ── Filtros ────────────────────────────────────────────────────────────────
  const coincideNivel = (i: Insumo) => {
    switch (filtroNivel) {
      case 'porAcabarse': return i.nivel === 'rojo';
      case 'bajo': return i.nivel === 'amarillo';
      case 'bien': return i.nivel === 'verde';
      case 'revisarFrescura': return i.fresco === false;
      default: return true;
    }
  };
  const termino = busqueda.trim().toLowerCase();
  const insumosFiltrados = insumos.filter(
    (i) =>
      (termino === '' || i.nombre.toLowerCase().includes(termino)) &&
      (filtroGrupo === 'Todos' || (i.categoria || SIN_CATEGORIA) === filtroGrupo) &&
      coincideNivel(i)
  );
  const hayFiltro = termino !== '' || filtroGrupo !== 'Todos' || filtroNivel !== 'todos';

  // Agrupar por categoría en el orden fijo, con "Sin categoría" al final
  const grupos = [...CATEGORIAS_INSUMOS, SIN_CATEGORIA]
    .map((cat) => ({
      categoria: cat,
      items: insumosFiltrados.filter((i) => (i.categoria || SIN_CATEGORIA) === cat),
    }))
    .filter((g) => g.items.length > 0);

  // Lista de compra: lo que hay que reabastecer, agrupado por proveedor,
  // en texto listo para pegar en WhatsApp al proveedor.
  const copiarListaCompra = async () => {
    const porProveedor = new Map<string, string[]>();
    for (const i of alertas) {
      if (i.sugerenciaCompra <= 0 && i.stock > 0) continue;
      const prov = i.proveedor || 'Sin proveedor';
      const cantidad = i.sugerenciaCompra > 0 ? `${i.sugerenciaCompra} ${i.unidad}` : 'reabastecer';
      if (!porProveedor.has(prov)) porProveedor.set(prov, []);
      porProveedor.get(prov)!.push(`• ${i.nombre}: ${cantidad}`);
    }
    if (porProveedor.size === 0) {
      alert('No hay insumos por reabastecer 🎉');
      return;
    }
    const texto = ['🛒 Lista de compra — Moramango', '']
      .concat(
        [...porProveedor.entries()].flatMap(([prov, lineas]) => [`${prov}:`, ...lineas, ''])
      )
      .join('\n')
      .trim();
    try {
      await navigator.clipboard.writeText(texto);
      setListaCopiada(true);
      setTimeout(() => setListaCopiada(false), 2000);
    } catch {
      alert(texto);
    }
  };

  return (
    <div className="space-y-6">
      {cargando ? (
        <p className="text-neutral-500 animate-pulse">Cargando inventario...</p>
      ) : (
        <>
          {alertas.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-bold text-neutral-900">⚠️ Por reabastecer</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {alertas.map((i) => (
                  <div
                    key={i.id}
                    className={`rounded-2xl p-4 border ${
                      i.nivel === 'rojo' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                    }`}
                  >
                    <p className="font-bold text-neutral-900">
                      {i.nivel === 'rojo' ? '🔴' : '🟡'} {i.nombre}
                    </p>
                    <p className="text-sm text-neutral-600 mt-1">
                      {i.stock <= 0
                        ? 'Sin stock registrado'
                        : `Queda para ~${i.diasRestantes} día${i.diasRestantes === 1 ? '' : 's'} (${i.stock} ${i.unidad})`}
                    </p>
                    {i.sugerenciaCompra > 0 && (
                      <p className="text-sm font-semibold text-neutral-800 mt-1">
                        Compra sugerida: {i.sugerenciaCompra} {i.unidad}
                      </p>
                    )}
                    {i.proveedor && (
                      <p className="text-xs text-neutral-500 mt-1">Proveedor: {i.proveedor}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {alertasFrescura.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-bold text-neutral-900">🥬 Revisar frescura</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {alertasFrescura.map((i) => (
                  <div key={i.id} className="rounded-2xl p-4 border bg-orange-50 border-orange-200">
                    <p className="font-bold text-neutral-900">🥬 {i.nombre}</p>
                    <p className="text-sm text-neutral-600 mt-1">
                      Comprado hace {i.diasDesdeCompra} día{i.diasDesdeCompra === 1 ? '' : 's'} — el
                      margen para frescos es de {DIAS_FRESCURA} días. Revisa si sigue en buen estado.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-neutral-900">Inventario</h2>
              <span className="text-xs text-neutral-500">
                Consumo calculado con las ventas de los últimos {diasAnalisis} días
              </span>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-2xl p-3 shadow-sm border border-neutral-100 mb-3 flex flex-wrap items-center gap-2">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="🔎 Buscar insumo..."
                className="flex-1 min-w-[160px] bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-black"
              />
              <select
                value={filtroGrupo}
                onChange={(e) => setFiltroGrupo(e.target.value)}
                className="bg-neutral-50 border border-neutral-200 rounded-xl px-2 py-2 text-sm text-neutral-700 focus:outline-none focus:border-black"
              >
                <option value="Todos">Todos los grupos</option>
                {[...CATEGORIAS_INSUMOS, SIN_CATEGORIA].map((c) => (
                  <option key={c} value={c}>
                    {ICONO_GRUPO[c] ?? ''} {c}
                  </option>
                ))}
              </select>
              <select
                value={filtroNivel}
                onChange={(e) => setFiltroNivel(e.target.value)}
                className="bg-neutral-50 border border-neutral-200 rounded-xl px-2 py-2 text-sm text-neutral-700 focus:outline-none focus:border-black"
              >
                {NIVELES_FILTRO.map((n) => (
                  <option key={n.valor} value={n.valor}>
                    {n.etiqueta}
                  </option>
                ))}
              </select>
              <button
                onClick={copiarListaCompra}
                className={`text-sm font-semibold px-3 py-2 rounded-xl active:scale-95 transition-transform ${
                  listaCopiada ? 'bg-green-600 text-white' : 'bg-black text-white'
                }`}
                title="Copia la lista de lo que hay que reabastecer, agrupada por proveedor"
              >
                {listaCopiada ? '✓ Copiada' : '🛒 Lista de compra'}
              </button>
              {hayFiltro && (
                <button
                  onClick={() => { setBusqueda(''); setFiltroGrupo('Todos'); setFiltroNivel('todos'); }}
                  className="text-sm font-semibold text-neutral-600 bg-neutral-100 px-3 py-2 rounded-xl active:scale-95 transition-transform"
                >
                  ✕ Limpiar
                </button>
              )}
              <span className="text-xs text-neutral-500 ml-auto">
                {insumosFiltrados.length} de {insumos.length}
              </span>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-500 border-b border-neutral-100">
                    <th className="p-3 font-semibold">Insumo</th>
                    <th className="p-3 font-semibold">Stock (app)</th>
                    <th className="p-3 font-semibold">Consumo/día</th>
                    <th className="p-3 font-semibold">Alcanza para</th>
                    <th className="p-3 font-semibold">Última compra</th>
                    <th className="p-3 font-semibold">Conteo físico</th>
                    <th className="p-3 font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {grupos.map((grupo) => (
                    <Fragment key={grupo.categoria}>
                      <tr className="bg-neutral-50">
                        <td colSpan={7} className="px-3 py-2 font-bold text-neutral-700 text-xs uppercase tracking-wide">
                          {ICONO_GRUPO[grupo.categoria] ?? '❔'} {grupo.categoria}
                          <span className="font-normal text-neutral-400 ml-1.5 normal-case tracking-normal">
                            ({grupo.items.length})
                          </span>
                        </td>
                      </tr>
                      {grupo.items.map((i) => (
                    <tr key={i.id} className="hover:bg-neutral-50">
                      <td className="p-3">
                        <p className="font-semibold text-neutral-900">{i.nombre}</p>
                        <p className="text-xs text-neutral-400">
                          {i.id}
                          {!i.enRecetas && ' · sin receta asociada'}
                        </p>
                        <select
                          value={i.categoria}
                          onChange={(e) => cambiarCategoria(i, e.target.value)}
                          className="mt-1 bg-neutral-50 border border-neutral-200 rounded-lg px-1.5 py-1 text-[11px] text-neutral-600 focus:outline-none focus:border-black"
                        >
                          <option value="">Sin categoría</option>
                          {CATEGORIAS_INSUMOS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3 font-semibold text-neutral-900 whitespace-nowrap">
                        {i.stock} {i.unidad}
                      </td>
                      <td className="p-3 text-neutral-600 whitespace-nowrap">
                        {i.consumoDiario > 0 ? `${i.consumoDiario} ${i.unidad}` : '—'}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${PUNTO_NIVEL[i.nivel]}`} />
                          {i.diasRestantes !== null ? (
                            <span className="text-neutral-700">
                              ~{i.diasRestantes} día{i.diasRestantes === 1 ? '' : 's'}
                            </span>
                          ) : (
                            <span className="text-neutral-400">sin datos</span>
                          )}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <input
                          type="date"
                          value={i.fechaCompraISO}
                          disabled={ocupado}
                          onChange={(e) => cambiarFechaCompra(i, e.target.value)}
                          className="bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1 text-xs text-neutral-700 focus:outline-none focus:border-black disabled:opacity-50"
                        />
                        <div className="mt-1">
                          {i.diasDesdeCompra !== null ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-[11px] text-neutral-500">
                                {i.diasDesdeCompra === 0
                                  ? 'Hoy'
                                  : `Hace ${i.diasDesdeCompra} día${i.diasDesdeCompra === 1 ? '' : 's'}`}
                              </span>
                              {i.fresco !== null && (
                                <span
                                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                    i.fresco
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-orange-100 text-orange-700'
                                  }`}
                                >
                                  {i.fresco ? '🟢 Fresco' : `⚠️ +${DIAS_FRESCURA} días`}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-[11px] text-neutral-400">Sin registrar</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {i.conteoFisico !== null ? (
                          <div>
                            <p className="text-neutral-700">
                              {i.conteoFisico} {i.unidad}
                              {i.diferencia !== null && i.diferencia !== 0 && (
                                <span
                                  className={`ml-1.5 text-xs font-semibold ${
                                    i.diferencia < 0 ? 'text-red-600' : 'text-green-600'
                                  }`}
                                >
                                  ({i.diferencia > 0 ? '+' : ''}
                                  {i.diferencia})
                                </span>
                              )}
                            </p>
                            {i.fechaConteo && (
                              <p className="text-[10px] text-neutral-400">{i.fechaConteo}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => registrarCompra(i)}
                            disabled={ocupado}
                            className="text-xs font-semibold text-neutral-700 bg-neutral-100 px-2.5 py-1.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50"
                          >
                            + Compra
                          </button>
                          <button
                            onClick={() => capturarConteo(i)}
                            disabled={ocupado}
                            className="text-xs font-semibold text-neutral-700 bg-neutral-100 px-2.5 py-1.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50"
                          >
                            Conteo
                          </button>
                          {i.diferencia !== null && i.diferencia !== 0 && (
                            <button
                              onClick={() => ajustar(i)}
                              disabled={ocupado}
                              className="text-xs font-semibold text-white bg-black px-2.5 py-1.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50"
                            >
                              Ajustar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {insumos.length === 0 && (
                <p className="p-6 text-neutral-500 text-center">
                  No hay insumos registrados en la hoja "Insumos".
                </p>
              )}
              {insumos.length > 0 && insumosFiltrados.length === 0 && (
                <p className="p-6 text-neutral-500 text-center">
                  Ningún insumo coincide con el filtro.
                </p>
              )}
            </div>
            <p className="text-xs text-neutral-400 mt-2">
              💡 "Stock (app)" es el teórico que la app descuenta con cada venta. Usa "Conteo" para
              capturar lo que hay físicamente y "Ajustar" para cuadrarlos si no coinciden.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
