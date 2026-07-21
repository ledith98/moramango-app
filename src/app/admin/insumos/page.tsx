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
  recetas: string[];
  costoUnitario: number | null;
  contacto: string;
  oculto: boolean;
}

interface CompraHistorial {
  fecha: string;
  fechaISO: string;
  cantidad: number;
  precioTotal: number;
  precioUnitario: number;
}

const NUEVA_CATEGORIA = '__nueva__';

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
  const [categoriasEnUso, setCategoriasEnUso] = useState<string[]>([]);
  const [diasAnalisis, setDiasAnalisis] = useState(7);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState('Todos');
  const [filtroNivel, setFiltroNivel] = useState('todos');
  const [listaCopiada, setListaCopiada] = useState(false);
  const [verOcultos, setVerOcultos] = useState(false);
  // Formulario de insumo nuevo
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevaUnidad, setNuevaUnidad] = useState('');
  const [nuevaCategoria, setNuevaCategoria] = useState('');
  const [nuevoProveedor, setNuevoProveedor] = useState('');
  // Editar insumo
  const [editando, setEditando] = useState<Insumo | null>(null);
  const [edNombre, setEdNombre] = useState('');
  const [edUnidad, setEdUnidad] = useState('');
  const [edProveedor, setEdProveedor] = useState('');
  const [edContacto, setEdContacto] = useState('');
  // Historial de precios
  const [historialDe, setHistorialDe] = useState<Insumo | null>(null);
  const [historial, setHistorial] = useState<CompraHistorial[]>([]);
  const [cargandoHist, setCargandoHist] = useState(false);

  /**
   * Recarga el inventario. Con `silencioso` los datos se refrescan sin
   * desmontar la tabla (no se muestra "Cargando..."): así el scroll se
   * queda exactamente donde estaba después de editar un insumo.
   */
  const cargar = useCallback((silencioso = false) => {
    if (!silencioso) setCargando(true);
    fetch('/api/admin/insumos')
      .then((res) => res.json())
      .then((data) => {
        setInsumos(data.insumos || []);
        setCategoriasEnUso(data.categoriasEnUso || []);
        if (data.diasAnalisis) setDiasAnalisis(data.diasAnalisis);
      })
      .finally(() => {
        if (!silencioso) setCargando(false);
      });
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const accion = async (
    idInsumo: string,
    tipo: string,
    cantidad?: number,
    extra?: Record<string, unknown>
  ) => {
    setOcupado(true);
    try {
      const res = await fetch('/api/admin/insumos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idInsumo, accion: tipo, cantidad, ...extra }),
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      cargar(true);
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
    // Precio total pagado (opcional) — para guardar el costo y el historial
    const precioStr = prompt(
      `¿Cuánto pagaste EN TOTAL por esos ${num} ${ins.unidad || 'unidades'}? (opcional, deja vacío para omitir)`
    );
    const extra: Record<string, unknown> = {};
    if (precioStr !== null && precioStr.trim() !== '') {
      const precio = parseFloat(precioStr.replace(',', '.'));
      if (isNaN(precio) || precio < 0) {
        alert('Precio inválido');
        return;
      }
      extra.precioTotal = precio;
    }
    accion(ins.id, 'restock', num, extra);
  };

  const abrirEditar = (ins: Insumo) => {
    setEditando(ins);
    setEdNombre(ins.nombre);
    setEdUnidad(ins.unidad);
    setEdProveedor(ins.proveedor);
    setEdContacto(ins.contacto);
  };

  const guardarEdicion = async () => {
    if (!editando) return;
    if (!edNombre.trim()) {
      alert('El nombre es obligatorio');
      return;
    }
    const renombra = edNombre.trim().toLowerCase() !== editando.nombre.toLowerCase();
    if (
      renombra &&
      editando.recetas.length > 0 &&
      !confirm(
        `Vas a renombrar "${editando.nombre}" a "${edNombre.trim()}". Se actualizará también en sus ${editando.recetas.length} receta(s) para no romper la conexión. ¿Continuar?`
      )
    )
      return;

    setOcupado(true);
    try {
      const res = await fetch('/api/admin/insumos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idInsumo: editando.id,
          accion: 'editar',
          datos: {
            nombre: edNombre.trim(),
            unidad: edUnidad.trim(),
            proveedor: edProveedor.trim(),
            contacto: edContacto.trim(),
          },
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      setEditando(null);
      cargar(true);
    } finally {
      setOcupado(false);
    }
  };

  const verHistorial = (ins: Insumo) => {
    setHistorialDe(ins);
    setHistorial([]);
    setCargandoHist(true);
    fetch(`/api/admin/insumos?historial=${encodeURIComponent(ins.id)}`)
      .then((res) => res.json())
      .then((data) => setHistorial(data.historial || []))
      .finally(() => setCargandoHist(false));
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

  const cambiarCategoria = async (ins: Insumo, seleccion: string) => {
    let valor = seleccion;
    if (seleccion === NUEVA_CATEGORIA) {
      const nueva = prompt('Nombre de la nueva categoría:');
      if (nueva === null || !nueva.trim()) return;
      valor = nueva.trim();
      setCategoriasEnUso((prev) => (prev.includes(valor) ? prev : [...prev, valor]));
    }
    setInsumos((prev) => prev.map((x) => (x.id === ins.id ? { ...x, categoria: valor } : x)));
    setOcupado(true);
    try {
      await fetch('/api/admin/insumos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idInsumo: ins.id, accion: 'categoria', valor }),
      });
      cargar(true);
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
      cargar(true);
    } finally {
      setOcupado(false);
    }
  };

  const alternarOculto = async (ins: Insumo) => {
    setOcupado(true);
    try {
      await fetch('/api/admin/insumos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idInsumo: ins.id, accion: 'ocultar', valor: ins.oculto ? 'no' : 'si' }),
      });
      cargar(true);
    } finally {
      setOcupado(false);
    }
  };

  const eliminarInsumo = async (ins: Insumo) => {
    if (
      !confirm(
        `¿Eliminar "${ins.nombre}"? Desaparece del panel (su historial se conserva en el Sheet). Si solo dejaste de usarlo por temporada, mejor usa Ocultar.`
      )
    )
      return;
    setOcupado(true);
    try {
      await fetch('/api/admin/insumos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idInsumo: ins.id, accion: 'eliminar' }),
      });
      cargar(true);
    } finally {
      setOcupado(false);
    }
  };

  const crearInsumo = async () => {
    if (!nuevoNombre.trim()) {
      alert('Escribe el nombre del insumo');
      return;
    }
    setOcupado(true);
    try {
      const res = await fetch('/api/admin/insumos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nuevoNombre.trim(),
          unidad: nuevaUnidad.trim(),
          categoria: nuevaCategoria,
          proveedor: nuevoProveedor.trim(),
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      setMostrarNuevo(false);
      setNuevoNombre('');
      setNuevaUnidad('');
      setNuevaCategoria('');
      setNuevoProveedor('');
      cargar(true);
    } finally {
      setOcupado(false);
    }
  };

  // Los ocultos no generan alertas ni entran a la lista de compra
  const activos = insumos.filter((i) => !i.oculto);

  const alertas = activos
    .filter((i) => i.nivel === 'rojo' || i.nivel === 'amarillo')
    .sort((a, b) => (a.nivel === 'rojo' ? -1 : 1) - (b.nivel === 'rojo' ? -1 : 1));

  // Frescos comprados hace más del margen permitido
  const alertasFrescura = activos.filter((i) => i.fresco === false);

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
      (verOcultos || !i.oculto) &&
      (termino === '' || i.nombre.toLowerCase().includes(termino)) &&
      (filtroGrupo === 'Todos' || (i.categoria || SIN_CATEGORIA) === filtroGrupo) &&
      coincideNivel(i)
  );
  const hayFiltro = termino !== '' || filtroGrupo !== 'Todos' || filtroNivel !== 'todos';
  const cuantosOcultos = insumos.filter((i) => i.oculto).length;

  // Todas las categorías para los desplegables: las fijas + las que ya
  // se usan en la hoja (las nuevas que haya creado la usuaria).
  const todasCategorias = [...new Set([...CATEGORIAS_INSUMOS, ...categoriasEnUso])];

  // Agrupar por categoría (fijas primero, luego las nuevas), con "Sin
  // categoría" al final. Incluye las categorías custom para que ningún
  // insumo con categoría nueva desaparezca de la tabla.
  const grupos = [...todasCategorias, SIN_CATEGORIA]
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
                {[...todasCategorias, SIN_CATEGORIA].map((c) => (
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
              <button
                onClick={() => setMostrarNuevo(true)}
                className="text-sm font-semibold px-3 py-2 rounded-xl bg-marron text-white active:scale-95 transition-transform"
              >
                + Nuevo insumo
              </button>
              {cuantosOcultos > 0 && (
                <button
                  onClick={() => setVerOcultos((v) => !v)}
                  className={`text-xs font-semibold px-3 py-2 rounded-xl transition-colors ${
                    verOcultos ? 'bg-neutral-700 text-white' : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  👁 Ocultos ({cuantosOcultos})
                </button>
              )}
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
                    <tr key={i.id} className={`hover:bg-neutral-50 ${i.oculto ? 'opacity-45' : ''}`}>
                      <td className="p-3">
                        <p className="font-semibold text-neutral-900">
                          {i.oculto && <span title="Insumo oculto">🚫 </span>}
                          {i.nombre}
                        </p>
                        <p className="text-xs text-neutral-400">
                          {i.id}
                          {i.oculto && ' · oculto'}
                        </p>
                        {i.recetas.length > 0 ? (
                          <p className="text-[11px] text-green-700 mt-0.5" title={i.recetas.join(', ')}>
                            🍹 En: {i.recetas.slice(0, 3).join(', ')}
                            {i.recetas.length > 3 ? ` +${i.recetas.length - 3}` : ''}
                          </p>
                        ) : (
                          <p className="text-[11px] text-amber-600 mt-0.5">⚠️ Sin receta asociada</p>
                        )}
                        <div className="flex gap-1 mt-1">
                          <select
                            value={i.categoria}
                            onChange={(e) => cambiarCategoria(i, e.target.value)}
                            className="bg-neutral-50 border border-neutral-200 rounded-lg px-1.5 py-1 text-[11px] text-neutral-600 focus:outline-none focus:border-black"
                          >
                            <option value="">Sin categoría</option>
                            {todasCategorias.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                            <option value={NUEVA_CATEGORIA}>➕ Nueva categoría…</option>
                          </select>
                          <button
                            onClick={() => abrirEditar(i)}
                            className="text-[11px] font-semibold text-neutral-600 bg-neutral-100 px-2 py-1 rounded-lg active:scale-95"
                            title="Editar nombre y datos"
                          >
                            ✏️
                          </button>
                        </div>
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
                          <button
                            onClick={() => verHistorial(i)}
                            disabled={ocupado}
                            title="Historial de precios de compra"
                            className="text-xs font-semibold text-neutral-700 bg-neutral-100 px-2.5 py-1.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50"
                          >
                            💲{i.costoUnitario ? ` ${i.costoUnitario}` : ''}
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
                          <button
                            onClick={() => alternarOculto(i)}
                            disabled={ocupado}
                            title={i.oculto ? 'Volver a mostrar' : 'Ocultar (sale de la vista y las alertas)'}
                            className="text-xs font-semibold text-neutral-600 bg-neutral-100 px-2 py-1.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50"
                          >
                            {i.oculto ? '👁 Mostrar' : '🚫'}
                          </button>
                          <button
                            onClick={() => eliminarInsumo(i)}
                            disabled={ocupado}
                            title="Eliminar insumo"
                            className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50"
                          >
                            🗑
                          </button>
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

      {/* Modal: nuevo insumo */}
      {mostrarNuevo && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setMostrarNuevo(false)}
        >
          <div
            className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-black">Nuevo insumo</h2>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700">Nombre</label>
              <input
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder="Ej. Fresa"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
              />
              <p className="text-xs text-neutral-400">
                Si va en recetas, escríbelo igual que en la columna Ingrediente de Catalogo.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700">Unidad de medida</label>
              <input
                value={nuevaUnidad}
                onChange={(e) => setNuevaUnidad(e.target.value)}
                placeholder="Ej. kg, L, pz"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700">Grupo</label>
              <select
                value={nuevaCategoria}
                onChange={(e) => {
                  if (e.target.value === NUEVA_CATEGORIA) {
                    const nueva = prompt('Nombre de la nueva categoría:');
                    if (nueva && nueva.trim()) {
                      setCategoriasEnUso((prev) => (prev.includes(nueva.trim()) ? prev : [...prev, nueva.trim()]));
                      setNuevaCategoria(nueva.trim());
                    }
                  } else {
                    setNuevaCategoria(e.target.value);
                  }
                }}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-700 focus:outline-none focus:border-black"
              >
                <option value="">Sin categoría</option>
                {todasCategorias.map((c) => (
                  <option key={c} value={c}>
                    {ICONO_GRUPO[c] ?? ''} {c}
                  </option>
                ))}
                <option value={NUEVA_CATEGORIA}>➕ Nueva categoría…</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700">
                Proveedor <span className="font-normal text-neutral-400">(opcional)</span>
              </label>
              <input
                value={nuevoProveedor}
                onChange={(e) => setNuevoProveedor(e.target.value)}
                placeholder="Ej. Frutería Don Beto"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setMostrarNuevo(false)}
                className="flex-1 border border-neutral-200 text-neutral-600 font-semibold py-3 rounded-2xl active:scale-95 transition-transform"
              >
                Cancelar
              </button>
              <button
                onClick={crearInsumo}
                disabled={ocupado}
                className="flex-1 bg-marron text-white font-semibold py-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
              >
                {ocupado ? 'Guardando...' : 'Crear insumo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: editar insumo */}
      {editando && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setEditando(null)}
        >
          <div
            className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-black">Editar insumo</h2>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700">Nombre</label>
              <input
                value={edNombre}
                onChange={(e) => setEdNombre(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
              />
              {editando.recetas.length > 0 && (
                <p className="text-xs text-amber-600">
                  ⚠️ Está en {editando.recetas.length} receta(s). Al renombrarlo se actualizará también ahí.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700">Unidad de medida</label>
              <input
                value={edUnidad}
                onChange={(e) => setEdUnidad(e.target.value)}
                placeholder="kg, L, pz"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700">Proveedor</label>
              <input
                value={edProveedor}
                onChange={(e) => setEdProveedor(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700">Contacto del proveedor</label>
              <input
                value={edContacto}
                onChange={(e) => setEdContacto(e.target.value)}
                placeholder="Tel / WhatsApp"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setEditando(null)}
                className="flex-1 border border-neutral-200 text-neutral-600 font-semibold py-3 rounded-2xl active:scale-95 transition-transform"
              >
                Cancelar
              </button>
              <button
                onClick={guardarEdicion}
                disabled={ocupado}
                className="flex-1 bg-marron text-white font-semibold py-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
              >
                {ocupado ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: historial de precios */}
      {historialDe && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setHistorialDe(null)}
        >
          <div
            className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[80vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-neutral-100 shrink-0">
              <h2 className="text-lg font-bold text-black">💲 Historial de precios</h2>
              <p className="text-sm text-neutral-500">{historialDe.nombre}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {cargandoHist ? (
                <p className="text-neutral-500 animate-pulse">Cargando...</p>
              ) : historial.length === 0 ? (
                <p className="text-neutral-500 text-sm">
                  Aún no hay compras con precio registrado. Cuando registres una compra con "+ Compra",
                  te preguntará el precio y aquí verás cómo va cambiando.
                </p>
              ) : (
                <div className="space-y-2">
                  {historial.map((h, idx) => {
                    const anterior = historial[idx + 1];
                    const subio = anterior && h.precioUnitario > anterior.precioUnitario;
                    const bajo = anterior && h.precioUnitario < anterior.precioUnitario;
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-neutral-50 rounded-xl p-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">
                            ${h.precioUnitario.toFixed(2)} / {historialDe.unidad || 'u'}
                            {subio && <span className="text-red-600 text-xs ml-1.5">▲</span>}
                            {bajo && <span className="text-green-600 text-xs ml-1.5">▼</span>}
                          </p>
                          <p className="text-[11px] text-neutral-400">
                            {h.fechaISO || h.fecha} · {h.cantidad} {historialDe.unidad} por ${h.precioTotal.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-neutral-100 shrink-0">
              <button
                onClick={() => setHistorialDe(null)}
                className="w-full bg-neutral-100 text-neutral-700 font-semibold py-2.5 rounded-xl active:scale-95 transition-transform"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
