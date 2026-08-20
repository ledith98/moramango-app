'use client';

/**
 * Panel de insumos, dividido en dos pestañas:
 *
 *  · Biblioteca      → el catálogo: qué es cada insumo, cómo se compra,
 *                      en qué unidad lo usan las recetas y su costo.
 *  · Insumos activos → la operación: cuánto hay, cuánto se gasta al día,
 *                      para cuántos días alcanza y el conteo físico.
 *
 * El stock siempre se guarda en unidad de receta; la compra se captura en
 * unidad de compra y el backend la convierte con la equivalencia.
 */

import { Fragment, useCallback, useEffect, useState } from 'react';
import { CATEGORIAS_INSUMOS } from '@/lib/insumos';

interface ItemBiblioteca {
  id: string;
  nombre: string;
  unidadCompra: string;
  unidadReceta: string;
  equivalencia: number;
  ultimoPrecioCompra: number;
  costoPorUnidadReceta: number | null;
  categoria: string;
  proveedor: string;
  contacto: string;
  recetas: string[];
  ingredientes: string[];
  /** true = se une por nombre idéntico, sin vínculo declarado a mano */
  vinculoAutomatico: boolean;
  /** false = guardado para después, no aparece en Insumos activos */
  enUso: boolean;
}

interface IngredienteReceta {
  nombre: string;
  cantidad: string;
  unidad: string;
  /** Nombre del insumo que ya reclama este ingrediente, si hay otro */
  vinculadoA: string;
}

interface ProductoConReceta {
  id: string;
  nombre: string;
  categoria: string;
  disponible: boolean;
  ingredientes: IngredienteReceta[];
}

interface CompraRegistrada {
  fila: number;
  fecha: string;
  fechaISO: string;
  idBiblioteca: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  total: number;
  /** Donde se surtio; vacio si no se anoto */
  donde: string;
  /** Categoria del insumo, para filtrar por tipo */
  categoria: string;
}

interface ItemActivo {
  id: string;
  idBiblioteca: string;
  nombre: string;
  unidadCompra: string;
  unidadReceta: string;
  equivalencia: number;
  costoPorUnidadReceta: number | null;
  categoria: string;
  proveedor: string;
  stockActual: number;
  consumoPorDia: number;
  alcanzaParaDias: number | null;
  nivel: 'rojo' | 'amarillo' | 'verde' | 'gris';
  sugerenciaCompra: number;
  ultimaCompra: string;
  ultimaCompraISO: string;
  diasDesdeCompra: number | null;
  status: string;
  conteoFisico: number | null;
  fechaConteo: string;
  diferencia: number | null;
  /** Precio de la ultima compra, para comparar al registrar una nueva */
  ultimoPrecioCompra: number;
}

interface CompraHistorial {
  fila: number;
  fecha: string;
  cantidad: number;
  unidadCompra: string;
  precioTotal: number;
  precioUnidadCompra: number;
  costoUnidadReceta: number;
  /** Con quien se compro; vacio en las compras de antes del directorio */
  proveedor: string;
  /** Cuanto traia el paquete esa vez */
  contenido: number;
  quien: string;
}

const UNIDADES_COMPRA = ['Caja', 'Litro', 'Kilo', 'Pieza', 'Paquete', 'Bolsa'];
const UNIDADES_RECETA = ['ml', 'g', 'pieza'];
const STATUS = ['Fresco', 'Por caducar', 'Caducado'];
const NUEVA_CATEGORIA = '__nueva__';
const SIN_CATEGORIA = 'Sin categoría';

const PUNTO_NIVEL: Record<string, string> = {
  rojo: 'bg-red-500',
  amarillo: 'bg-amber-400',
  verde: 'bg-green-500',
  gris: 'bg-neutral-300',
};

const COLOR_STATUS: Record<string, string> = {
  Fresco: 'bg-green-100 text-green-700',
  'Por caducar': 'bg-amber-100 text-amber-700',
  Caducado: 'bg-red-100 text-red-700',
};

const ICONO_GRUPO: Record<string, string> = {
  'Frutas y verduras': '🥬',
  Pan: '🍞',
  'Jamón y queso': '🧀',
  'Leche y agua': '🥛',
  Complementos: '🍯',
  Empaque: '📦',
  Condimentos: '🥫',
  [SIN_CATEGORIA]: '❔',
};

const FORM_VACIO = {
  nombre: '',
  unidadCompra: 'Litro',
  unidadReceta: 'ml',
  equivalencia: '1000',
  categoria: '',
  proveedor: '',
  contacto: '',
  ultimoPrecioCompra: '',
};

/**
 * Sugerencia automática: un ingrediente de receta corresponde al insumo si
 * uno contiene al otro por palabras. "Lechuga" ↔ "Lechuga Italiana EVA".
 */
function sugiere(nombreInsumo: string, nombreIngrediente: string): boolean {
  const limpia = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((p) => p.length > 2);

  const a = limpia(nombreInsumo);
  const b = limpia(nombreIngrediente);
  if (a.length === 0 || b.length === 0) return false;
  return b.some((p) => a.includes(p)) || a.some((p) => b.includes(p));
}

const inputCls =
  'w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-marron';

/** Un dia de Monterrey, corrido N dias hacia atras. */
function diaISO(atras = 0): string {
  const p = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Monterrey',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.now() - atras * 86400000));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

/**
 * Atajos del filtro de compras. "Todo" existe porque las compras son
 * salteadas: sin el, un rango corto deja la lista vacia y parece que se
 * perdieron.
 */
const ATAJOS_COMPRAS: { etiqueta: string; rango: () => { desde: string; hasta: string } }[] = [
  { etiqueta: 'Hoy', rango: () => ({ desde: diaISO(0), hasta: diaISO(0) }) },
  { etiqueta: 'Ayer', rango: () => ({ desde: diaISO(1), hasta: diaISO(1) }) },
  { etiqueta: 'Ultimos 7 dias', rango: () => ({ desde: diaISO(6), hasta: diaISO(0) }) },
  { etiqueta: 'Este mes', rango: () => ({ desde: diaISO(0).slice(0, 8) + '01', hasta: diaISO(0) }) },
  { etiqueta: 'Todo', rango: () => ({ desde: '', hasta: '' }) },
];

/** "2026-08-15" -> "15 ago 2026" */
const fechaBonita = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${meses[m - 1] ?? ''} ${y}`;
};

/** Para que "Cafe" encuentre "Café" y al reves. */
const sinAcentos = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Hoy en Monterrey, en formato YYYY-MM-DD para el campo de fecha. */
function hoyISO(): string {
  const p = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Monterrey',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

export default function InsumosPage() {
  const [pestana, setPestana] = useState<'biblioteca' | 'activos' | 'compras'>('activos');
  /** Modo "voy a contar el local": se escriben las cantidades y se guardan juntas */
  const [contando, setContando] = useState(false);
  const [lecturas, setLecturas] = useState<Record<string, string>>({});
  const [guardandoConteo, setGuardandoConteo] = useState(false);
  const [compras, setCompras] = useState<CompraRegistrada[]>([]);
  const [cargandoCompras, setCargandoCompras] = useState(false);
  /** Rango de fechas de las compras; vacio = todas */
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [biblioteca, setBiblioteca] = useState<ItemBiblioteca[]>([]);
  const [activos, setActivos] = useState<ItemActivo[]>([]);
  const [categoriasEnUso, setCategoriasEnUso] = useState<string[]>([]);
  const [diasAnalisis, setDiasAnalisis] = useState(7);
  /** El directorio, para elegir el proveedor en vez de escribirlo */
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([]);
  /** true = se esta escribiendo un proveedor que no esta en el directorio */
  const [provNuevo, setProvNuevo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState('Todos');
  const [listaCopiada, setListaCopiada] = useState(false);
  // Lista de compras: se abre a mano, no depende de que haya alertas
  const [listaAbierta, setListaAbierta] = useState(false);
  const [seleccionCompra, setSeleccionCompra] = useState<string[]>([]);

  // Modales
  const [form, setForm] = useState({ ...FORM_VACIO });
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [modalInsumo, setModalInsumo] = useState(false);
  const [compraDe, setCompraDe] = useState<ItemActivo | null>(null);
  const [conteoDe, setConteoDe] = useState<ItemActivo | null>(null);
  const [conteoCantidad, setConteoCantidad] = useState('');
  /** Contar por paquetes en vez de por pieza suelta */
  const [conteoPorPaquete, setConteoPorPaquete] = useState(false);
  const [conteoPaquetes, setConteoPaquetes] = useState('');
  const [conteoSueltas, setConteoSueltas] = useState('');
  const [conteoTraeCada, setConteoTraeCada] = useState('');
  const [compraCantidad, setCompraCantidad] = useState('');
  const [compraPrecio, setCompraPrecio] = useState('');
  /** Lo que habia antes de la compra; vacio = lo que dice el sistema */
  const [compraPrevio, setCompraPrevio] = useState('');
  /** De donde salio el dinero: '' = no anotarlo como salida */
  const [compraPagadoCon, setCompraPagadoCon] = useState<'' | 'Efectivo' | 'Digital'>('');
  /** Cuando se hizo la compra; arranca en hoy pero se puede cambiar */
  const [compraFecha, setCompraFecha] = useState('');
  /** Cuanto trae el paquete ESTA VEZ; vacio = la presentacion de siempre */
  const [compraEquiv, setCompraEquiv] = useState('');
  /** Donde se surtio; arranca en el proveedor que ya tenia el insumo */
  const [compraDonde, setCompraDonde] = useState('');
  const [historial, setHistorial] = useState<CompraHistorial[] | null>(null);
  const [historialDe, setHistorialDe] = useState('');
  /** Unidad de receta del insumo del historial, para decir "$0.30 por pz" */
  const [historialUnidad, setHistorialUnidad] = useState('');
  const [historialId, setHistorialId] = useState('');
  const [recetasDe, setRecetasDe] = useState<{ id: string; nombre: string } | null>(null);
  const [productosCat, setProductosCat] = useState<ProductoConReceta[]>([]);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [buscaProducto, setBuscaProducto] = useState('');

  /** Todo lo comprado, para la pestaña de compras. */
  const cargarCompras = useCallback(async () => {
    setCargandoCompras(true);
    try {
      const r = await fetch('/api/admin/insumos?compras=1');
      const d = await r.json();
      setCompras(d.compras ?? []);
    } finally {
      setCargandoCompras(false);
    }
  }, []);

  /** Guarda de un jalón lo que se contó en el local. */
  const guardarConteo = async () => {
    const items = Object.entries(lecturas)
      .filter(([, v]) => v.trim() !== '')
      .map(([id, v]) => ({ id, cantidad: v }));
    if (items.length === 0) {
      alert('No capturaste ninguna cantidad.');
      return;
    }
    if (!confirm(`¿Guardar el conteo de ${items.length} insumo${items.length === 1 ? '' : 's'}?

El stock quedará igual a lo que contaste.`)) return;
    setGuardandoConteo(true);
    try {
      const r = await fetch('/api/admin/insumos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'conteoRapido', lecturas: items }),
      });
      const d = await r.json();
      if (!r.ok) {
        alert(d.error || 'No se pudo guardar el conteo');
        return;
      }
      setLecturas({});
      setContando(false);
      await cargar();
    } finally {
      setGuardandoConteo(false);
    }
  };

  const cargar = useCallback(async () => {
    try {
      const [rB, rA] = await Promise.all([
        fetch('/api/admin/biblioteca'),
        fetch('/api/admin/insumos'),
      ]);
      const dB = await rB.json();
      const dA = await rA.json();
      setBiblioteca(dB.items ?? []);
      setCategoriasEnUso(dB.categoriasEnUso ?? []);
      setActivos(dA.items ?? []);
      if (dA.diasAnalisis) setDiasAnalisis(dA.diasAnalisis);
      if (dA.proveedores) setProveedores(dA.proveedores);
    } catch {
      setError('No se pudo cargar el inventario');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const todasCategorias = [...new Set([...CATEGORIAS_INSUMOS, ...categoriasEnUso])].filter(Boolean);

  /**
   * Compras que se ven: por fecha, por nombre y por tipo. Se filtra aqui y
   * no en el servidor porque son unas decenas de renglones; pedirlas de
   * nuevo a Google por cada cambio de filtro tardaria mas que la pantalla.
   */
  const comprasVisibles = compras.filter((c) => {
    if (desde && (!c.fechaISO || c.fechaISO < desde)) return false;
    if (hasta && (!c.fechaISO || c.fechaISO > hasta)) return false;
    const q = sinAcentos(busqueda);
    if (q && !sinAcentos(c.nombre).includes(q) && !sinAcentos(c.donde).includes(q)) return false;
    if (filtroGrupo !== 'Todos' && (c.categoria || SIN_CATEGORIA) !== filtroGrupo) return false;
    return true;
  });
  const gastoVisible = comprasVisibles.reduce((t, c) => t + c.total, 0);

  /**
   * Los proveedores para elegir al anotar una compra.
   *
   * Sale del DIRECTORIO, no de lo que esté escrito en los insumos:
   * escribirlo a mano es lo que producía "CAG", "Gac" y "CAG Bodega 200"
   * como tres lugares distintos. Se le suma lo que ya tuvieran los insumos
   * y que aún no esté dado de alta, para no perder nada por el camino.
   */
  const lugaresConocidos = [
    ...new Set([
      ...proveedores.map((p) => p.nombre),
      ...activos.map((a) => a.proveedor),
      ...biblioteca.map((b) => b.proveedor),
    ]
      .map((p) => (p || '').trim())
      .filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'es'));

  // ── Biblioteca: crear / editar / eliminar ──────────────────────────────────
  function abrirNuevo() {
    setForm({ ...FORM_VACIO });
    setEditandoId(null);
    setError('');
    setModalInsumo(true);
  }

  function abrirEditar(b: ItemBiblioteca) {
    setForm({
      nombre: b.nombre,
      unidadCompra: b.unidadCompra,
      unidadReceta: b.unidadReceta,
      equivalencia: String(b.equivalencia),
      categoria: b.categoria,
      proveedor: b.proveedor,
      contacto: b.contacto,
      ultimoPrecioCompra: b.ultimoPrecioCompra ? String(b.ultimoPrecioCompra) : '',
    });
    setEditandoId(b.id);
    setError('');
    setModalInsumo(true);
  }

  async function guardarInsumo() {
    if (!form.nombre.trim()) return setError('El nombre es obligatorio');
    const equiv = parseFloat(form.equivalencia);
    if (isNaN(equiv) || equiv <= 0) return setError('La equivalencia debe ser mayor a 0');

    setOcupado(true);
    setError('');
    const res = editandoId
      ? await fetch('/api/admin/biblioteca', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editandoId, accion: 'editar', datos: form }),
        })
      : await fetch('/api/admin/biblioteca', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
    const data = await res.json();
    setOcupado(false);
    if (!res.ok) return setError(data.error || 'No se pudo guardar');
    setModalInsumo(false);
    await cargar();
  }

  async function eliminarInsumo(b: ItemBiblioteca) {
    if (!confirm(`¿Quitar "${b.nombre}" de la biblioteca? Su historial se conserva.`)) return;
    setOcupado(true);
    await fetch('/api/admin/biblioteca', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: b.id, accion: 'eliminar' }),
    });
    setOcupado(false);
    await cargar();
  }

  // ── Activos: compra / conteo / ajuste / status ─────────────────────────────
  async function accionActivo(id: string, cuerpo: Record<string, unknown>) {
    setOcupado(true);
    const res = await fetch('/api/admin/insumos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...cuerpo }),
    });
    const data = await res.json();
    setOcupado(false);
    if (!res.ok) {
      alert(data.error || 'No se pudo guardar');
      return false;
    }
    await cargar();
    return true;
  }

  function abrirCompra(a: ItemActivo) {
    setCompraDe(a);
    setCompraCantidad(a.sugerenciaCompra > 0 ? String(a.sugerenciaCompra) : '');
    setCompraPrecio('');
    setCompraPrevio('');
    setCompraPagadoCon('');
    setCompraFecha(hoyISO());
    setCompraEquiv('');
    setCompraDonde(a.proveedor || '');
    setProvNuevo(false);
    setError('');
  }

  async function registrarCompra() {
    if (!compraDe) return;
    const cant = parseFloat(compraCantidad);
    if (isNaN(cant) || cant <= 0) return setError('Escribe cuánto compraste');
    if (!compraFecha) return setError('Pon la fecha de la compra');
    const ok = await accionActivo(compraDe.id, {
      accion: 'compra',
      cantidadCompra: cant,
      precioTotal: compraPrecio,
      // Vacio = usar lo que el sistema ya tenia
      stockPrevio: compraPrevio.trim(),
      pagadoCon: compraPagadoCon,
      fechaCompraISO: compraFecha,
      equivalenciaCompra: compraEquiv.trim(),
      donde: compraDonde.trim(),
    });
    if (ok) setCompraDe(null);
  }

  /**
   * "Conté y tengo esto": se anota el conteo con su fecha Y el stock queda
   * en lo contado, que es lo que la persona quiere decir al contar. Antes
   * eran tres botones para el mismo número (Conteo solo anotaba, Stock lo
   * cambiaba, Ajustar igualaba uno al otro) y había que saber cuál usar.
   */
  function abrirConteo(a: ItemActivo) {
    setConteoDe(a);
    setConteoCantidad('');
    // Se arranca por unidad de receta: es como se cuenta casi todo. El
    // modo por paquete se elige cuando toca, y trae la presentación del
    // catálogo ya puesta.
    setConteoPorPaquete(false);
    setConteoPaquetes('');
    setConteoSueltas('');
    setConteoTraeCada(String(a.equivalencia));
    setError('');
  }

  /**
   * Lo contado, venga por pieza o por paquete.
   *
   * Contar 240 tenedores de uno en uno no lo hace nadie: se cuentan "6
   * paquetes y 12 sueltos". La multiplicación la hace la app, que es donde
   * no se equivoca.
   */
  function totalContado(): number | null {
    if (!conteoDe) return null;
    if (!conteoPorPaquete) {
      const n = parseFloat(conteoCantidad.replace(',', '.'));
      return isNaN(n) || n < 0 ? null : n;
    }
    const paq = parseFloat(conteoPaquetes.replace(',', '.'));
    const sueltas = parseFloat(conteoSueltas.replace(',', '.')) || 0;
    const cada = parseFloat(conteoTraeCada.replace(',', '.')) || conteoDe.equivalencia;
    if (isNaN(paq) || paq < 0 || cada <= 0) return null;
    return Math.round((paq * cada + sueltas) * 1000) / 1000;
  }

  async function guardarConteoDeUno() {
    if (!conteoDe) return;
    const num = totalContado();
    if (num === null) {
      setError('Escribe cuánto tienes');
      return;
    }
    setOcupado(true);
    setError('');
    try {
      const r = await fetch('/api/admin/insumos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'conteoRapido',
          lecturas: [{ id: conteoDe.id, cantidad: num }],
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'No se pudo guardar');
        return;
      }
      setConteoDe(null);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  // ── Vínculo insumo ↔ ingredientes de las recetas ──────────────────────────
  /**
   * Se abre desde las dos pestañas: en Biblioteca el id es el del insumo,
   * en Activos se usa el idBiblioteca, que es el mismo registro.
   */
  async function abrirRecetas(idBiblioteca: string, nombre: string) {
    const yaVinculados =
      biblioteca.find((b) => b.id === idBiblioteca)?.ingredientes ?? [];
    setRecetasDe({ id: idBiblioteca, nombre });
    setSeleccion(yaVinculados);
    setBuscaProducto('');
    setError('');
    const res = await fetch('/api/admin/biblioteca?ingredientes=1');
    const data = await res.json();
    setProductosCat(data.productos ?? []);
  }

  function alternarIngrediente(nombre: string) {
    setSeleccion((s) => (s.includes(nombre) ? s.filter((x) => x !== nombre) : [...s, nombre]));
  }

  /** Marca o desmarca de golpe toda la receta de un producto. */
  function alternarProducto(p: ProductoConReceta) {
    const nombres = p.ingredientes.map((i) => i.nombre);
    const todosMarcados = nombres.every((n) => seleccion.includes(n));
    setSeleccion((s) =>
      todosMarcados
        ? s.filter((x) => !nombres.includes(x))
        : [...new Set([...s, ...nombres])]
    );
  }

  /** Marca de golpe los ingredientes que se parecen al nombre del insumo. */
  function aplicarSugerencias() {
    if (!recetasDe) return;
    const sugeridos = productosCat
      .flatMap((p) => p.ingredientes.map((i) => i.nombre))
      .filter((n) => sugiere(recetasDe.nombre, n));
    setSeleccion((s) => [...new Set([...s, ...sugeridos])]);
  }

  async function guardarRecetas() {
    if (!recetasDe) return;
    setOcupado(true);
    const res = await fetch('/api/admin/biblioteca', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: recetasDe.id, accion: 'ingredientes', ingredientes: seleccion }),
    });
    setOcupado(false);
    if (!res.ok) return setError('No se pudo guardar el vínculo');
    setRecetasDe(null);
    await cargar();
  }

  /** Corrige el stock a mano cuando se capturó mal, sin tocar precios. */
  /** Mueve un insumo entre "Insumos activos" y "solo biblioteca". */
  async function cambiarUso(id: string, nombre: string, enUso: boolean) {
    if (
      !enUso &&
      !confirm(
        `¿Quitar "${nombre}" de los insumos activos? Se queda guardado en la biblioteca con todos sus datos y puedes reactivarlo cuando quieras.`
      )
    )
      return;
    await accionActivo(id, { accion: 'uso', valor: enUso });
  }

  async function verHistorial(idBiblioteca: string, nombre: string, unidad = '') {
    setHistorialDe(nombre);
    setHistorialUnidad(unidad);
    setHistorialId(idBiblioteca);
    setHistorial([]);
    const res = await fetch(`/api/admin/insumos?historial=${encodeURIComponent(idBiblioteca)}`);
    const data = await res.json();
    setHistorial(data.historial ?? []);
  }

  /** Borra una compra del historial. No devuelve el stock ni el precio;
   *  es solo para limpiar un registro capturado por error. */
  async function borrarCompra(h: CompraHistorial) {
    if (!confirm(`¿Borrar la compra de ${h.cantidad} ${h.unidadCompra} ($${h.precioTotal})?`)) return;
    setOcupado(true);
    await fetch('/api/admin/insumos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'borrarCompra', fila: h.fila }),
    });
    setOcupado(false);
    // Recargar el historial abierto y la tabla (precios/costos pudieron cambiar)
    if (historialId) await verHistorial(historialId, historialDe, historialUnidad);
    await cargar();
  }

  // ── Derivados ─────────────────────────────────────────────────────────────
  const coincide = (nombre: string, categoria: string) => {
    const q = busqueda.trim().toLowerCase();
    if (q && !nombre.toLowerCase().includes(q)) return false;
    if (filtroGrupo !== 'Todos' && (categoria || SIN_CATEGORIA) !== filtroGrupo) return false;
    return true;
  };

  // El buscador del modal mira nombre de producto e ingredientes, para
  // poder llegar por cualquiera de los dos.
  const qProducto = buscaProducto.trim().toLowerCase();
  const productosVisibles = qProducto
    ? productosCat.filter(
        (p) =>
          p.nombre.toLowerCase().includes(qProducto) ||
          p.ingredientes.some((i) => i.nombre.toLowerCase().includes(qProducto))
      )
    : productosCat;

  const activosFiltrados = activos.filter((a) => coincide(a.nombre, a.categoria));
  const bibliotecaFiltrada = biblioteca.filter((b) => coincide(b.nombre, b.categoria));

  /** Activos agrupados por categoría, para recorrerlos por pasillo. */
  const gruposActivos = [...new Set(activosFiltrados.map((a) => a.categoria || SIN_CATEGORIA))]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((categoria) => ({
      categoria,
      items: activosFiltrados.filter((a) => (a.categoria || SIN_CATEGORIA) === categoria),
    }));

  const alertas = activos
    .filter((a) => a.nivel === 'rojo' || a.nivel === 'amarillo')
    .sort((a, b) => (a.alcanzaParaDias ?? 99) - (b.alcanzaParaDias ?? 99));

  /**
   * Qué sugerir comprar. Las alertas por consumo necesitan historial de
   * ventas, así que antes de abrir no marcaban nada; el stock en cero
   * también cuenta para que la lista sirva desde el primer día.
   */
  const sugeridos = activos.filter(
    (a) => a.nivel === 'rojo' || a.nivel === 'amarillo' || a.stockActual <= 0
  );

  function abrirLista() {
    setSeleccionCompra(sugeridos.map((a) => a.id));
    setListaAbierta(true);
  }

  /** Agrupado por categoría: así se recorre la tienda por pasillos. */
  function textoLista(): string {
    const elegidos = activos.filter((a) => seleccionCompra.includes(a.id));
    const porCategoria = new Map<string, ItemActivo[]>();
    for (const a of elegidos) {
      const cat = a.categoria || SIN_CATEGORIA;
      if (!porCategoria.has(cat)) porCategoria.set(cat, []);
      porCategoria.get(cat)!.push(a);
    }
    const bloques = [...porCategoria.entries()].map(([cat, items]) => {
      const lineas = items.map((a) => {
        const cuanto = a.sugerenciaCompra > 0 ? `${a.sugerenciaCompra} ${a.unidadCompra || ''}`.trim() : '';
        return `  • ${a.nombre}${cuanto ? ` — ${cuanto}` : ''}`;
      });
      return `${ICONO_GRUPO[cat] ?? '·'} ${cat.toUpperCase()}\n${lineas.join('\n')}`;
    });
    return `🛒 LISTA DE COMPRAS — MORAMANGO\n\n${bloques.join('\n\n')}`;
  }

  function copiarLista() {
    navigator.clipboard.writeText(textoLista());
    setListaCopiada(true);
    setTimeout(() => setListaCopiada(false), 2000);
  }

  if (cargando) {
    return <p className="p-6 text-neutral-700">Cargando inventario…</p>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-neutral-900">📦 Insumos</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={abrirLista}
            className="bg-white border border-neutral-200 text-black text-sm font-semibold px-4 py-2 rounded-xl active:scale-95 whitespace-nowrap"
          >
            🛒 Lista de compras
            {sugeridos.length > 0 && (
              <span className="ml-1.5 text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                {sugeridos.length}
              </span>
            )}
          </button>
          <button
            onClick={abrirNuevo}
            className="bg-marron text-white text-sm font-semibold px-4 py-2 rounded-xl active:scale-95 whitespace-nowrap"
          >
            + Nuevo
          </button>
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded-2xl mb-4 w-fit max-w-full">
        {(
          [
            ['activos', `🧊 Lo que hay hoy (${activos.length})`],
            ['compras', '🧾 Lo que he comprado'],
            ['biblioteca', `📚 Catálogo (${biblioteca.length})`],
          ] as const
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            onClick={() => {
              setPestana(valor);
              // Las compras se piden solo al entrar: es otra hoja del Excel
              if (valor === 'compras' && compras.length === 0) cargarCompras();
            }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
              pestana === valor ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-700'
            }`}
          >
            {etiqueta}
          </button>
        ))}

        {/* Contar el local sin abrir insumo por insumo */}
        {pestana === 'activos' && !contando && activos.length > 0 && (
          <button
            onClick={() => setContando(true)}
            className="ml-2 px-4 py-2 rounded-xl text-sm font-semibold bg-marron text-white active:scale-95"
          >
            ✍️ Contar el local
          </button>
        )}
      </div>

      <p className="text-xs text-neutral-700 mb-4">
        {pestana === 'activos'
          ? 'Lo que tienes en el local ahora: cuánto queda, cuánto se gasta al día y qué hay que comprar.'
          : pestana === 'compras'
          ? 'Todo lo que has comprado, de lo más reciente a lo más viejo, y cuánto llevas gastado.'
          : 'Tu catálogo completo, incluidos los insumos guardados para después. Con "🧊 Usar ahora" vuelven a la operación diaria.'}
      </p>

      {biblioteca.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 text-sm text-amber-800">
          Tu biblioteca está vacía. Registra ahí cada insumo (cómo lo compras y en qué unidad lo
          usan las recetas) para que la app pueda descontar el stock con cada venta.
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={pestana === 'compras' ? 'Buscar insumo o lugar…' : 'Buscar insumo…'}
          className="flex-1 min-w-[180px] bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-marron text-neutral-900"
        />
        <select
          value={filtroGrupo}
          onChange={(e) => setFiltroGrupo(e.target.value)}
          className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-marron text-neutral-900"
        >
          <option value="Todos">Todas las categorías</option>
          {[...todasCategorias, SIN_CATEGORIA].map((c) => (
            <option key={c} value={c}>
              {ICONO_GRUPO[c] ?? '·'} {c}
            </option>
          ))}
        </select>
      </div>

      {pestana === 'compras' ? (
        <div className="space-y-3">
          {/* Rango de fechas: el gasto solo dice algo referido a un
              periodo. "Todo" queda a un toque porque las compras son
              salteadas y un rango corto puede dejar la lista vacia. */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {ATAJOS_COMPRAS.map((a) => {
                const r = a.rango();
                const activo = desde === r.desde && hasta === r.hasta;
                return (
                  <button
                    key={a.etiqueta}
                    onClick={() => {
                      setDesde(r.desde);
                      setHasta(r.hasta);
                    }}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
                      activo ? 'bg-marron text-white' : 'bg-neutral-100 text-neutral-800'
                    }`}
                  >
                    {a.etiqueta}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-semibold text-neutral-800">Del</label>
              <input
                type="date"
                value={desde}
                max={hasta || undefined}
                onChange={(e) => setDesde(e.target.value)}
                className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-marron"
              />
              <label className="text-sm font-semibold text-neutral-800">al</label>
              <input
                type="date"
                value={hasta}
                min={desde || undefined}
                onChange={(e) => setHasta(e.target.value)}
                className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-marron"
              />
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t border-neutral-100 pt-3">
              <div>
                <p className="text-xs text-neutral-700 font-medium uppercase tracking-wide">
                  {desde || hasta ? 'Gastado en lo que elegiste' : 'Total comprado'}
                </p>
                <p className="text-2xl font-bold text-neutral-900">${gastoVisible.toFixed(2)}</p>
                {(desde || hasta) && (
                  <p className="text-xs text-neutral-600">
                    {desde && hasta
                      ? desde === hasta
                        ? fechaBonita(desde)
                        : `${fechaBonita(desde)} al ${fechaBonita(hasta)}`
                      : desde
                      ? `desde el ${fechaBonita(desde)}`
                      : `hasta el ${fechaBonita(hasta)}`}
                  </p>
                )}
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-neutral-700 font-medium uppercase tracking-wide">
                  Compras
                </p>
                <p className="text-2xl font-bold text-neutral-900">
                  {comprasVisibles.length}
                  {comprasVisibles.length !== compras.length && (
                    <span className="text-sm font-semibold text-neutral-600"> de {compras.length}</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {cargandoCompras ? (
            <p className="text-neutral-700 animate-pulse">Cargando compras…</p>
          ) : compras.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
              Todavía no hay compras registradas. Se van guardando solas cada vez que le pones
              &ldquo;+ Compra&rdquo; a un insumo en la pestaña de al lado.
            </div>
          ) : comprasVisibles.length === 0 ? (
            /* Que quede claro que es el filtro, no que se hayan borrado */
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
              Ninguna compra cae en lo que elegiste. Tienes {compras.length} en total —
              <button
                onClick={() => {
                  setDesde('');
                  setHasta('');
                  setBusqueda('');
                  setFiltroGrupo('Todos');
                }}
                className="ml-1 font-bold underline"
              >
                quitar los filtros
              </button>
              .
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden divide-y divide-neutral-100">
              {comprasVisibles
                .map((c) => (
                  <div key={c.fila} className="flex items-center gap-3 p-3.5">
                    <span className="text-xs text-neutral-700 font-mono w-20 shrink-0">
                      {c.fechaISO ? c.fechaISO.slice(5) : '—'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-neutral-900 truncate">{c.nombre}</p>
                      <p className="text-xs text-neutral-700">
                        {c.cantidad} {c.unidad}
                        {c.donde && <span className="text-neutral-600"> · 🏪 {c.donde}</span>}
                      </p>
                    </div>
                    <span className="font-bold text-neutral-900 tabular-nums shrink-0">
                      ${c.total.toFixed(2)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : pestana === 'activos' && contando ? (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-4">
            <h2 className="font-bold text-neutral-900">✍️ Contando el local</h2>
            <p className="text-sm text-neutral-700 mt-1">
              Anota cuánto tienes de cada cosa. Lo que dejes vacío no se toca. Al guardar, el
              sistema <b>reemplaza</b> el número viejo por el que contaste.
            </p>
            {Object.values(lecturas).some((v) => v.trim() !== '') && (
              <button
                onClick={() => setLecturas({})}
                className="mt-3 text-xs font-bold px-3 py-2 rounded-lg bg-neutral-100 text-neutral-700 active:scale-95"
              >
                🧹 Borrar todo lo que llevo escrito
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden divide-y divide-neutral-100">
            {activosFiltrados.map((a) => {
              const escrito = lecturas[a.id] ?? '';
              const n = parseFloat(escrito.replace(',', '.'));
              const dif = escrito.trim() !== '' && !isNaN(n) ? n - a.stockActual : null;
              return (
                <div key={a.id} className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-neutral-900 truncate">{a.nombre}</p>
                    <p className="text-xs text-neutral-700">
                      el sistema dice {a.stockActual} {a.unidadReceta}
                      {dif !== null && dif !== 0 && (
                        <span className={dif > 0 ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                          {' '}· {dif > 0 ? 'sobran' : 'faltan'} {Math.abs(Math.round(dif * 1000) / 1000)}
                        </span>
                      )}
                    </p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={escrito}
                    onChange={(e) => setLecturas((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    placeholder="—"
                    className="w-24 shrink-0 bg-neutral-50 border border-neutral-200 rounded-xl px-2 py-2 text-right text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-marron"
                  />
                  <span className="text-xs text-neutral-700 w-10 shrink-0">{a.unidadReceta}</span>
                  <button
                    onClick={() =>
                      setLecturas((prev) => {
                        const copia = { ...prev };
                        // Vacio = "no lo conte", que no es lo mismo que cero
                        if (escrito === '') copia[a.id] = '0';
                        else delete copia[a.id];
                        return copia;
                      })
                    }
                    title={escrito === '' ? 'Marcar que se acabó' : 'Borrar lo que escribí'}
                    className="w-8 h-8 shrink-0 rounded-lg bg-neutral-100 text-neutral-700 text-xs font-bold active:scale-90"
                  >
                    {escrito === '' ? '0' : '×'}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="sticky bottom-3 flex gap-2 bg-white/95 backdrop-blur border border-neutral-200 rounded-2xl p-3 shadow-lg">
            <button
              onClick={() => {
                setContando(false);
                setLecturas({});
              }}
              className="flex-1 border border-neutral-200 text-neutral-700 font-semibold py-3 rounded-xl active:scale-95"
            >
              Cancelar
            </button>
            <button
              onClick={guardarConteo}
              disabled={guardandoConteo}
              className="flex-1 bg-marron text-white font-bold py-3 rounded-xl active:scale-95 disabled:opacity-50"
            >
              {guardandoConteo
                ? 'Guardando…'
                : `Guardar ${Object.values(lecturas).filter((v) => v.trim() !== '').length} conteo(s)`}
            </button>
          </div>
        </div>
      ) : pestana === 'activos' ? (
        <>
          {alertas.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-neutral-900">🛒 Hay que comprar</h2>
                <button
                  onClick={copiarLista}
                  className="text-xs font-semibold bg-neutral-100 px-3 py-1.5 rounded-lg active:scale-95"
                >
                  {listaCopiada ? '✅ Copiada' : 'Copiar lista'}
                </button>
              </div>
              <ul className="space-y-1 text-sm">
                {alertas.map((a) => (
                  <li key={a.id} className="text-neutral-700">
                    {a.nivel === 'rojo' ? '🔴' : '🟡'} <strong>{a.nombre}</strong> — queda para ~
                    {a.alcanzaParaDias ?? 0} día{a.alcanzaParaDias === 1 ? '' : 's'}
                    {a.sugerenciaCompra > 0 && (
                      <span className="text-neutral-700">
                        {' '}
                        · comprar {a.sugerenciaCompra} {a.unidadCompra || ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-neutral-600 mb-2">
            El consumo por día se calcula con las ventas de los últimos {diasAnalisis} días.
          </p>

          {/* Tarjetas, no tabla. Con 8 columnas y los botones al final, en
              tablet o celular el renglón se salía de la pantalla y las
              acciones quedaban cortadas. Así cada insumo se acomoda solo y
              nada depende del ancho. */}
          <div className="space-y-6">
            {gruposActivos.map((grupo) => (
              <section key={grupo.categoria}>
                <h3 className="font-bold text-neutral-700 text-xs uppercase tracking-wide mb-2">
                  {ICONO_GRUPO[grupo.categoria] ?? '·'} {grupo.categoria}
                  <span className="font-normal text-neutral-600 ml-1.5 normal-case tracking-normal">
                    ({grupo.items.length})
                  </span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {grupo.items.map((a) => (
                    <div
                      key={a.id}
                      className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-4 flex flex-col gap-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-neutral-900 leading-tight break-words">
                            {a.nombre}
                          </p>
                          <p className="text-xs text-neutral-600">{a.categoria || SIN_CATEGORIA}</p>
                        </div>
                        <span className="shrink-0 inline-flex items-center gap-1.5 text-xs">
                          <span className={`w-2.5 h-2.5 rounded-full ${PUNTO_NIVEL[a.nivel]}`} />
                          <span className="text-neutral-700 whitespace-nowrap">
                            {a.alcanzaParaDias !== null
                              ? `~${a.alcanzaParaDias} día${a.alcanzaParaDias === 1 ? '' : 's'}`
                              : 'sin datos'}
                          </span>
                        </span>
                      </div>

                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[11px] text-neutral-600 uppercase tracking-wide">
                            Cuánto queda
                          </p>
                          <p className="text-2xl font-bold text-neutral-900 leading-none">
                            {a.stockActual}{' '}
                            <span className="text-sm font-semibold text-neutral-700">
                              {a.unidadReceta}
                            </span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] text-neutral-600 uppercase tracking-wide">
                            Se gasta al día
                          </p>
                          <p className="font-semibold text-neutral-900">
                            {a.consumoPorDia > 0 ? `${a.consumoPorDia} ${a.unidadReceta}` : '—'}
                          </p>
                        </div>
                      </div>

                      {a.conteoFisico !== null && (
                        <p className="text-xs text-neutral-700">
                          Último conteo:{' '}
                          <b>
                            {a.conteoFisico} {a.unidadReceta}
                          </b>
                          {a.diferencia !== null && a.diferencia !== 0 && (
                            <span
                              className={`ml-1 font-bold ${
                                a.diferencia < 0 ? 'text-red-600' : 'text-green-600'
                              }`}
                            >
                              ({a.diferencia > 0 ? '+' : ''}
                              {a.diferencia})
                            </span>
                          )}
                          {a.fechaConteo && (
                            <span className="text-neutral-600"> · {a.fechaConteo}</span>
                          )}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="date"
                          value={a.ultimaCompraISO || ''}
                          disabled={ocupado}
                          onChange={(e) =>
                            accionActivo(a.id, { accion: 'fechaCompra', fechaISO: e.target.value })
                          }
                          title="Fecha de la última compra"
                          className="bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-marron disabled:opacity-50"
                        />
                        <select
                          value={a.status}
                          disabled={ocupado}
                          onChange={(e) =>
                            accionActivo(a.id, { accion: 'status', valor: e.target.value })
                          }
                          title="Cómo está el insumo"
                          className={`rounded-full px-2.5 py-1.5 text-[11px] font-semibold border-0 focus:outline-none ${
                            COLOR_STATUS[a.status] ?? 'bg-neutral-100 text-neutral-700'
                          }`}
                        >
                          <option value="">Cómo está</option>
                          {STATUS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        {a.diasDesdeCompra !== null && (
                          <span className="text-[11px] text-neutral-600">
                            {a.diasDesdeCompra === 0
                              ? 'comprado hoy'
                              : `hace ${a.diasDesdeCompra} d`}
                          </span>
                        )}
                      </div>

                      <div className="mt-auto pt-1 flex gap-2">
                        <button
                          onClick={() => abrirCompra(a)}
                          disabled={ocupado}
                          className="flex-1 bg-marron text-white text-sm font-bold py-2.5 rounded-xl active:scale-95 disabled:opacity-50"
                        >
                          🛒 Compré
                        </button>
                        <button
                          onClick={() => abrirConteo(a)}
                          disabled={ocupado}
                          className="flex-1 bg-neutral-200 text-black text-sm font-bold py-2.5 rounded-xl active:scale-95 disabled:opacity-50"
                        >
                          ✍️ Conté
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                        <button
                          onClick={() => verHistorial(a.idBiblioteca, a.nombre, a.unidadReceta)}
                          className="font-semibold text-neutral-700 underline decoration-neutral-300"
                        >
                          Ver compras
                        </button>
                        <button
                          onClick={() => abrirRecetas(a.idBiblioteca, a.nombre)}
                          className="font-semibold text-neutral-700 underline decoration-neutral-300"
                        >
                          En qué se usa
                        </button>
                        <button
                          onClick={() => cambiarUso(a.id, a.nombre, false)}
                          disabled={ocupado}
                          className="font-semibold text-neutral-700 underline decoration-neutral-300 disabled:opacity-50"
                        >
                          Ya no lo uso
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {activosFiltrados.length === 0 && (
              <p className="bg-white rounded-2xl border border-neutral-100 p-6 text-center text-neutral-600">
                No hay insumos que mostrar.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {bibliotecaFiltrada.map((b) => (
            <div
              key={b.id}
              className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-4 flex flex-col gap-3"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-neutral-900 leading-tight break-words min-w-0">
                    {b.nombre}
                  </p>
                  <span
                    className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      b.enUso ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-700'
                    }`}
                  >
                    {b.enUso ? '🧊 En uso' : '💤 Guardado'}
                  </span>
                </div>
                <p className="text-xs text-neutral-600">
                  {b.id} · {b.categoria || SIN_CATEGORIA}
                </p>
              </div>

              {b.recetas.length > 0 ? (
                <p className="text-[11px] text-green-700" title={b.recetas.join(', ')}>
                  🍹 En {b.recetas.length} producto{b.recetas.length === 1 ? '' : 's'}:{' '}
                  {b.recetas.slice(0, 2).join(', ')}
                  {b.recetas.length > 2 ? ` +${b.recetas.length - 2}` : ''}
                </p>
              ) : (
                <p className="text-[11px] text-amber-700">
                  ⚠️ Sin receta asociada — no se le descuenta stock
                </p>
              )}

              <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-sm">
                <div>
                  <p className="text-[11px] text-neutral-600 uppercase tracking-wide">
                    Se compra por
                  </p>
                  <p className="font-semibold text-neutral-900">{b.unidadCompra || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-600 uppercase tracking-wide">Equivale a</p>
                  <p className="font-semibold text-neutral-900">
                    {b.equivalencia} {b.unidadReceta}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-600 uppercase tracking-wide">
                    Último precio
                  </p>
                  <p className="font-semibold text-neutral-900">
                    {b.ultimoPrecioCompra > 0 ? (
                      <>
                        ${b.ultimoPrecioCompra}
                        <span className="text-neutral-600 text-xs font-normal">
                          {' '}
                          / {b.unidadCompra}
                        </span>
                      </>
                    ) : (
                      <span className="text-neutral-600 font-normal">—</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-600 uppercase tracking-wide">
                    Cuesta cada {b.unidadReceta}
                  </p>
                  <p className="font-semibold text-neutral-900">
                    {b.costoPorUnidadReceta !== null ? (
                      `$${b.costoPorUnidadReceta}`
                    ) : (
                      <span className="text-neutral-600 font-normal text-xs">
                        registra una compra
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {(b.proveedor || b.contacto) && (
                <p className="text-xs text-neutral-700">
                  🏪 {b.proveedor}
                  {b.contacto && <span className="text-neutral-600"> · {b.contacto}</span>}
                </p>
              )}

              <div className="mt-auto pt-1 flex flex-wrap gap-2">
                <button
                  onClick={() => cambiarUso(b.id, b.nombre, !b.enUso)}
                  disabled={ocupado}
                  className={`flex-1 min-w-[120px] text-sm font-bold py-2.5 rounded-xl active:scale-95 disabled:opacity-50 ${
                    b.enUso ? 'bg-neutral-100 text-neutral-700' : 'bg-green-600 text-white'
                  }`}
                >
                  {b.enUso ? '💤 Guardar' : '🧊 Usar ahora'}
                </button>
                <button
                  onClick={() => abrirEditar(b)}
                  className="flex-1 min-w-[120px] text-sm font-bold py-2.5 rounded-xl bg-neutral-200 text-black active:scale-95"
                >
                  ✏️ Editar
                </button>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                <button
                  onClick={() => abrirRecetas(b.id, b.nombre)}
                  className="font-semibold text-neutral-700 underline decoration-neutral-300"
                >
                  En qué se usa
                </button>
                <button
                  onClick={() => verHistorial(b.id, b.nombre, b.unidadReceta)}
                  className="font-semibold text-neutral-700 underline decoration-neutral-300"
                >
                  Ver compras
                </button>
                <button
                  onClick={() => eliminarInsumo(b)}
                  disabled={ocupado}
                  className="font-semibold text-red-600 underline decoration-red-200 disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}

          {bibliotecaFiltrada.length === 0 && (
            <p className="md:col-span-2 xl:col-span-3 bg-white rounded-2xl border border-neutral-100 p-6 text-center text-neutral-600">
              Aún no hay insumos en el catálogo.
            </p>
          )}
        </div>
      )}

      {/* ── Modal: nuevo / editar insumo de la biblioteca ── */}
      {modalInsumo && (
        <Modal
          titulo={editandoId ? 'Editar insumo' : 'Nuevo insumo'}
          onCerrar={() => setModalInsumo(false)}
        >
          <label className="block text-xs font-semibold text-neutral-700 mb-1">Nombre</label>
          <input
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Leche entera"
            className={inputCls}
          />

          <div className="grid grid-cols-2 gap-3 mt-3 text-neutral-900">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Se compra por
              </label>
              <input
                list="unidades-compra"
                value={form.unidadCompra}
                onChange={(e) => setForm({ ...form, unidadCompra: e.target.value })}
                className={inputCls}
              />
              <datalist id="unidades-compra">
                {UNIDADES_COMPRA.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Unidad en recetas
              </label>
              <input
                list="unidades-receta"
                value={form.unidadReceta}
                onChange={(e) => setForm({ ...form, unidadReceta: e.target.value })}
                className={inputCls}
              />
              <datalist id="unidades-receta">
                {UNIDADES_RECETA.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
          </div>

          <label className="block text-xs font-semibold text-neutral-700 mb-1 mt-3">
            Equivalencia
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-700 whitespace-nowrap">
              1 {form.unidadCompra || 'unidad'} =
            </span>
            <input
              type="number"
              value={form.equivalencia}
              onChange={(e) => setForm({ ...form, equivalencia: e.target.value })}
              className={inputCls}
            />
            <span className="text-sm text-neutral-700 text-neutral-900">{form.unidadReceta || 'u'}</span>
          </div>

          <label className="block text-xs font-semibold text-neutral-700 mb-1 mt-3">Categoría</label>
          <select
            value={form.categoria}
            onChange={(e) => {
              if (e.target.value === NUEVA_CATEGORIA) {
                const nueva = prompt('Nombre de la nueva categoría:');
                if (nueva?.trim()) setForm({ ...form, categoria: nueva.trim() });
              } else {
                setForm({ ...form, categoria: e.target.value });
              }
            }}
            className={inputCls}
          >
            <option value="">Sin categoría</option>
            {todasCategorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {form.categoria && !todasCategorias.includes(form.categoria) && (
              <option value={form.categoria}>{form.categoria}</option>
            )}
            <option value={NUEVA_CATEGORIA}>➕ Nueva categoría…</option>
          </select>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Proveedor de siempre
              </label>
              {/* Se elige del directorio, igual que al comprar: un nombre
                  escrito a mano aquí volvería a partir el historial. */}
              <input
                list="directorio-proveedores"
                value={form.proveedor}
                onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                placeholder="elige o escribe uno nuevo"
                className={inputCls}
              />
              <datalist id="directorio-proveedores">
                {lugaresConocidos.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1 text-neutral-900">Contacto</label>
              <input
                value={form.contacto}
                onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>

          {editandoId && (
            <>
              <label className="block text-xs font-semibold text-neutral-700 mb-1 mt-3">
                Último precio de compra (por {form.unidadCompra || 'unidad'})
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={form.ultimoPrecioCompra}
                onChange={(e) => setForm({ ...form, ultimoPrecioCompra: e.target.value })}
                className={inputCls}
              />
              <p className="text-[11px] text-neutral-600 mt-1 text-neutral-900">
                Corrige aquí un precio mal capturado. No registra una compra ni suma stock.
              </p>
            </>
          )}

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          <button
            onClick={guardarInsumo}
            disabled={ocupado}
            className="w-full bg-marron text-white font-semibold py-3 rounded-xl mt-4 active:scale-95 disabled:opacity-50"
          >
            {ocupado ? 'Guardando…' : 'Guardar'}
          </button>
        </Modal>
      )}

      {/* ── Modal: registrar compra ── */}
      {/* ── Registrar una compra ──
          La confusión de fondo: se compra por kilo/litro/caja pero el
          inventario vive en gramos/ml. Si no se ve la conversión mientras
          se escribe, el número final parece salido de la nada. */}
      {compraDe && (() => {
        const cant = parseFloat(compraCantidad.replace(',', '.')) || 0;
        // La presentación de esta compra manda sobre la del catálogo
        const eq = parseFloat(compraEquiv.replace(',', '.'));
        const equivUsada = !isNaN(eq) && eq > 0 ? eq : compraDe.equivalencia;
        const entra = cant * equivUsada;
        // Lo que había antes: normalmente lo del sistema, pero al llegar
        // mercancía es cuando se ve el estante y se puede corregir.
        const previoEscrito = compraPrevio.trim();
        const previoNum = parseFloat(previoEscrito.replace(',', '.'));
        const hayPrevio = previoEscrito !== '' && !isNaN(previoNum) && previoNum >= 0;
        const base = hayPrevio ? previoNum : compraDe.stockActual;
        const queda = base + entra;
        const pagado = parseFloat(compraPrecio.replace(',', '.')) || 0;
        const porUnidad = cant > 0 && pagado > 0 ? pagado / cant : 0;
        const antes = compraDe.ultimoPrecioCompra || 0;
        /**
         * Subió o bajó, medido POR PIEZA y no por paquete.
         *
         * Comparar paquetes engaña cuando cambia la presentación: 25 pz a
         * $8 contra 40 a $12 se ve como una baja del 33% y en realidad la
         * pieza subió de $0.30 a $0.32.
         */
        const antesPorPieza = compraDe.equivalencia > 0 ? antes / compraDe.equivalencia : 0;
        const ahoraPorPieza = equivUsada > 0 ? porUnidad / equivUsada : 0;
        const dif =
          ahoraPorPieza > 0 && antesPorPieza > 0
            ? ((ahoraPorPieza - antesPorPieza) / antesPorPieza) * 100
            : null;
        // Lo que costaría al precio de la vez pasada, para ofrecerlo de un toque
        const sugerido = antes > 0 && cant > 0 ? Math.round(antes * cant * 100) / 100 : 0;
        const yaEsElSugerido = sugerido > 0 && Math.abs(pagado - sugerido) < 0.005;
        const redondo = (n: number) => Math.round(n * 1000) / 1000;

        return (
          <Modal titulo={`🛒 Compré ${compraDe.nombre}`} onCerrar={() => setCompraDe(null)}>
            <label className="block text-sm font-semibold text-neutral-800 mb-1">
              ¿Qué día la compraste?
            </label>
            <input
              type="date"
              value={compraFecha}
              max={hoyISO()}
              onChange={(e) => setCompraFecha(e.target.value)}
              className={inputCls}
            />
            <p className="text-xs text-neutral-600 -mt-1 mb-4">
              Viene la de hoy. Cámbiala si la compra fue otro día, para que el gasto quede en el
              día que fue.
            </p>

            <label className="block text-sm font-semibold text-neutral-800 mb-1">
              ¿Cuánto tenías antes de esta compra?
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={compraPrevio}
                onChange={(e) => setCompraPrevio(e.target.value)}
                placeholder={String(compraDe.stockActual)}
                className={inputCls}
              />
              <span className="text-sm font-bold text-neutral-700 whitespace-nowrap">
                {compraDe.unidadReceta}
              </span>
            </div>
            <p className="text-xs text-neutral-600 -mt-1 mb-1">
              El sistema cree que hay {compraDe.stockActual} {compraDe.unidadReceta}. Si al guardar
              la mercancía ves que era otra cantidad, corrígela aquí y se cuenta como conteo.
            </p>

            <label className="block text-sm font-semibold text-neutral-800 mb-1 mt-4">
              ¿Cuántos {compraDe.unidadCompra || 'paquetes'} compraste?
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={compraCantidad}
                onChange={(e) => setCompraCantidad(e.target.value)}
                className={inputCls}
                autoFocus
              />
              <span className="text-sm font-bold text-neutral-700 whitespace-nowrap">
                {compraDe.unidadCompra}
              </span>
            </div>

            {/* ── La presentación de ESTA compra ──
                El mismo insumo viene en tamaños distintos según el lugar:
                40 tenedores en uno y 25 en otro. Antes había que ir a
                cambiar el insumo antes de registrar, y eso desajustaba
                todas las recetas. Aquí se dice y ya. */}
            <label className="block text-sm font-semibold text-neutral-800 mb-1 mt-4">
              ¿Cuánto trae cada {compraDe.unidadCompra || 'paquete'}?
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={compraEquiv}
                onChange={(e) => setCompraEquiv(e.target.value)}
                placeholder={String(compraDe.equivalencia)}
                className={inputCls}
              />
              <span className="text-sm font-bold text-neutral-700 whitespace-nowrap">
                {compraDe.unidadReceta}
              </span>
            </div>
            <p className="text-xs text-neutral-600 -mt-1 mb-1">
              {(() => {
                const e = parseFloat(compraEquiv.replace(',', '.'));
                const distinta = !isNaN(e) && e > 0 && e !== compraDe.equivalencia;
                if (!distinta) {
                  return `Normalmente trae ${compraDe.equivalencia} ${compraDe.unidadReceta}. Déjalo así si es el de siempre; cámbialo si este proveedor lo maneja de otro tamaño.`;
                }
                return `Ojo: el de siempre trae ${compraDe.equivalencia}. Se usará ${e} solo para esta compra — el insumo no se toca.`;
              })()}
            </p>

            <label className="block text-sm font-semibold text-neutral-800 mb-1 mt-4">
              ¿Cuánto pagaste en total?{' '}
              <span className="font-normal text-neutral-600">(opcional)</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-neutral-700">$</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={compraPrecio}
                onChange={(e) => setCompraPrecio(e.target.value)}
                placeholder="Por todo lo que compraste"
                className={inputCls}
              />
            </div>

            {/* ── El precio de la vez pasada ──
                Se ofrece, no se rellena solo: este número fija el costo de
                cada receta y, con él, el margen. Darlo por bueno sin que
                nadie lo mire propaga un precio viejo a toda la carta. */}
            {antes > 0 ? (
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-sm text-neutral-800">
                  La vez pasada te salió a <b className="text-neutral-900">${antes}</b> por{' '}
                  {compraDe.unidadCompra}
                  {compraDe.proveedor && <> en {compraDe.proveedor}</>}.
                </p>
                {sugerido > 0 && !yaEsElSugerido && (
                  <button
                    onClick={() => setCompraPrecio(String(sugerido))}
                    className="mt-2 w-full bg-white border border-blue-300 text-blue-900 font-bold text-sm py-2.5 rounded-lg active:scale-95"
                  >
                    Costó lo mismo → poner ${sugerido.toFixed(2)}
                  </button>
                )}
                <p className="text-xs text-neutral-700 mt-2">
                  {cant > 0
                    ? 'Si te salió en otro precio, escríbelo arriba y se actualiza.'
                    : 'Pon cuántos compraste y te digo cuánto sería al mismo precio.'}
                </p>
              </div>
            ) : (
              <p className="text-xs text-neutral-700 mt-2">
                Es la primera vez que le anotas precio. El que pongas queda de referencia para la
                próxima compra.
              </p>
            )}

            {/* ── Dónde se surtió ──
                Se ELIGE de la lista, no se escribe: escribirlo a mano es
                lo que producía "CAG", "Gac" y "CAG Bodega 200" como tres
                proveedores distintos, cada uno con su historia de precios
                partida. Se puede agregar uno nuevo, y entra al directorio. */}
            <label className="block text-sm font-semibold text-neutral-800 mb-1 mt-4">
              ¿Dónde la compraste?{' '}
              <span className="font-normal text-neutral-600">(opcional)</span>
            </label>

            {!provNuevo ? (
              <select
                value={lugaresConocidos.includes(compraDonde.trim()) ? compraDonde.trim() : ''}
                onChange={(e) => {
                  if (e.target.value === '__nuevo__') {
                    setProvNuevo(true);
                    setCompraDonde('');
                  } else {
                    setCompraDonde(e.target.value);
                  }
                }}
                className={inputCls}
              >
                <option value="">— elige un proveedor —</option>
                {lugaresConocidos.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
                <option value="__nuevo__">➕ Es uno nuevo…</option>
              </select>
            ) : (
              <div className="flex gap-2">
                <input
                  value={compraDonde}
                  onChange={(e) => setCompraDonde(e.target.value)}
                  placeholder="Nombre del proveedor nuevo"
                  className={inputCls}
                  autoFocus
                />
                <button
                  onClick={() => {
                    setProvNuevo(false);
                    setCompraDonde(compraDe.proveedor || '');
                  }}
                  className="text-xs font-semibold px-3 rounded-xl bg-neutral-100 text-neutral-800 active:scale-95 whitespace-nowrap"
                >
                  Cancelar
                </button>
              </div>
            )}

            <p className="text-xs text-neutral-600 mt-1.5">
              {provNuevo
                ? 'Al guardar la compra queda dado de alta en Proveedores, con su historial de precios.'
                : compraDe.proveedor
                  ? `Viene ${compraDe.proveedor}, que es donde lo compraste la última vez. Cámbialo si fue en otro lado.`
                  : 'Elígelo de la lista para que su precio se pueda comparar con el de otros.'}
            </p>

            {/* De dónde salió el dinero. Se pregunta aquí porque aquí ya
                está todo: qué insumo, cuánto y cuánto costó. Anotarlo por
                separado obligaría a capturar dos veces lo mismo. */}
            <div className="mt-4">
              <label className="block text-sm font-semibold text-neutral-800 mb-1">
                ¿Con qué lo pagaste?
              </label>
              <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded-xl">
                {(
                  [
                    ['Efectivo', '💵 Efectivo del cajón'],
                    ['Digital', '🏦 Dinero de la cuenta'],
                    ['', '🚫 No lo anotes'],
                  ] as const
                ).map(([v, etiqueta]) => (
                  <button
                    key={v || 'nada'}
                    onClick={() => setCompraPagadoCon(v)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold ${
                      compraPagadoCon === v
                        ? 'bg-white text-neutral-900 shadow-sm'
                        : 'text-neutral-700'
                    }`}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
              <p className="text-xs text-neutral-700 mt-1.5">
                {compraPagadoCon === 'Efectivo'
                  ? 'Se anota como salida del cajón, con la fecha de la compra, para que el corte cuadre y no aparezca como faltante.'
                  : compraPagadoCon === 'Digital'
                    ? 'Se anota como salida de la cuenta, así el saldo del banco cuadra con lo que ves en la app.'
                    : 'Elige “no lo anotes” si ya sacaste el dinero antes y lo anotaste aparte, o si lo pagaste de tu bolsa. Si no, se contaría dos veces.'}
              </p>
              {compraPagadoCon !== '' && !(parseFloat(compraPrecio.replace(',', '.')) > 0) && (
                <p className="text-xs text-amber-800 mt-1">
                  Ponle el precio arriba, si no no hay monto que descontar.
                </p>
              )}
            </div>

            {/* La cuenta completa, como se piensa: lo que había + lo que llegó */}
            {cant > 0 && (
              <div className="mt-4 bg-neutral-50 border border-neutral-200 rounded-2xl p-4 space-y-1.5">
                <p className="text-sm text-neutral-800">
                  {cant} {compraDe.unidadCompra} son{' '}
                  <b>
                    {redondo(entra)} {compraDe.unidadReceta}
                  </b>
                  <span className="text-neutral-600">
                    {' '}
                    (1 {compraDe.unidadCompra} = {equivUsada} {compraDe.unidadReceta})
                  </span>
                </p>
                <p className="text-base text-neutral-900 font-semibold">
                  {redondo(base)} que ya tenías + {redondo(entra)} que llegaron ={' '}
                  <b className="text-green-700">
                    {redondo(queda)} {compraDe.unidadReceta}
                  </b>
                </p>
                {hayPrevio && previoNum !== compraDe.stockActual && (
                  <p className="text-xs text-amber-800">
                    Ojo: corregiste lo que había ({compraDe.stockActual} →{' '}
                    {redondo(previoNum)} {compraDe.unidadReceta}). Queda anotado como conteo de hoy.
                  </p>
                )}
                {porUnidad > 0 && equivUsada > 0 && (
                  <p className="text-sm text-green-800 font-semibold pt-1">
                    Te sale a{' '}
                    {(() => {
                      const u = porUnidad / equivUsada;
                      return u >= 1 ? `$${u.toFixed(2)}` : `$${u.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
                    })()}{' '}
                    por {compraDe.unidadReceta} — con eso comparas contra otros proveedores
                  </p>
                )}
                {porUnidad > 0 && (
                  <p className="text-sm text-neutral-800 pt-1">
                    Te sale a <b>${(Math.round(porUnidad * 100) / 100).toFixed(2)}</b> por{' '}
                    {compraDe.unidadCompra}
                    {dif !== null && Math.abs(dif) >= 1 && (
                      <span className={`font-bold ${dif > 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {' '}
                        · por {compraDe.unidadReceta} {dif > 0 ? 'subió' : 'bajó'}{' '}
                        {Math.abs(Math.round(dif))}% contra la vez pasada
                      </span>
                    )}
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

            <button
              onClick={registrarCompra}
              disabled={ocupado || cant <= 0 || !compraFecha}
              className="w-full bg-marron text-white font-bold py-3.5 rounded-xl mt-4 active:scale-95 disabled:opacity-50"
            >
              {ocupado ? 'Guardando…' : !compraFecha ? 'Falta la fecha' : 'Guardar la compra'}
            </button>
            <p className="text-xs text-neutral-600 mt-2 text-center">
              Queda anotada en &ldquo;Lo que he comprado&rdquo; con la fecha que pusiste arriba.
            </p>
          </Modal>
        );
      })()}

      {/* ── Registrar un conteo ──
          Contar sirve para corregir: el sistema lleva una cuenta teórica y
          la realidad se le desvía por mermas, derrames o capturas que
          faltaron. Por eso lo importante es ver la diferencia. */}
      {conteoDe && (() => {
        // Vale igual si se contó por pieza o por paquete
        const total = totalContado();
        const escrito = conteoPorPaquete ? conteoPaquetes.trim() : conteoCantidad.trim();
        const valido = escrito !== '' && total !== null;
        const num = total ?? 0;
        const dif = valido ? num - conteoDe.stockActual : null;

        return (
          <Modal titulo={`✍️ Conté ${conteoDe.nombre}`} onCerrar={() => setConteoDe(null)}>
            <p className="text-sm text-neutral-700 mb-1">
              El sistema cree que hay{' '}
              <b className="text-neutral-900">
                {conteoDe.stockActual} {conteoDe.unidadReceta}
              </b>
              .
            </p>
            <p className="text-xs text-neutral-600 mb-4">
              El número que escribas <b>reemplaza</b> al de arriba: se borra lo que había y queda
              lo que tú cuentes.
            </p>

            {/* Contar por paquetes: nadie cuenta 240 tenedores de uno en
                uno, cuenta "6 paquetes y 12 sueltos". La cuenta la hace la
                app, que es donde no se equivoca. */}
            <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded-xl w-fit max-w-full mb-2">
              {(
                [
                  [false, `Por ${conteoDe.unidadReceta}`],
                  [true, `Por ${conteoDe.unidadCompra || 'paquete'}`],
                ] as const
              ).map(([v, etiqueta]) => (
                <button
                  key={String(v)}
                  onClick={() => {
                    setConteoPorPaquete(v);
                    if (v && !conteoTraeCada) setConteoTraeCada(String(conteoDe.equivalencia));
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    conteoPorPaquete === v ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-700'
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>

            {!conteoPorPaquete ? (
              <>
                <label className="block text-sm font-semibold text-neutral-800 mb-1">
                  ¿Cuánto tienes?
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={conteoCantidad}
                    onChange={(e) => setConteoCantidad(e.target.value)}
                    placeholder={String(conteoDe.stockActual)}
                    className={inputCls}
                    autoFocus
                  />
                  <span className="text-sm font-bold text-neutral-700 whitespace-nowrap">
                    {conteoDe.unidadReceta}
                  </span>
                </div>
              </>
            ) : (
              (() => {
                const paq = parseFloat(conteoPaquetes.replace(',', '.')) || 0;
                const sueltas = parseFloat(conteoSueltas.replace(',', '.')) || 0;
                const cada = parseFloat(conteoTraeCada.replace(',', '.')) || conteoDe.equivalencia;
                const total = Math.round((paq * cada + sueltas) * 1000) / 1000;
                return (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-neutral-800 mb-1">
                          {conteoDe.unidadCompra || 'Paquetes'} enteros
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          value={conteoPaquetes}
                          onChange={(e) => setConteoPaquetes(e.target.value)}
                          placeholder="0"
                          className={inputCls}
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-neutral-800 mb-1">
                          Cada uno trae
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          value={conteoTraeCada}
                          onChange={(e) => setConteoTraeCada(e.target.value)}
                          placeholder={String(conteoDe.equivalencia)}
                          className={inputCls}
                        />
                      </div>
                    </div>
                    <label className="block text-xs font-semibold text-neutral-800 mb-1 mt-2">
                      Y sueltos, fuera de paquete ({conteoDe.unidadReceta})
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={conteoSueltas}
                      onChange={(e) => setConteoSueltas(e.target.value)}
                      placeholder="0"
                      className={inputCls}
                    />
                    <p className="text-sm font-semibold text-neutral-900 mt-2 bg-neutral-50 rounded-xl px-3 py-2">
                      {paq} × {cada}
                      {sueltas > 0 ? ` + ${sueltas}` : ''} = <b>{total}</b> {conteoDe.unidadReceta}
                    </p>
                  </>
                );
              })()
            )}

            {/* Atajos para lo que más pasa: se acabó, o quedó vacío y hay
                que teclear de cero sin borrar dígito por dígito. */}
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={() => {
                  setConteoPorPaquete(false);
                  setConteoCantidad('0');
                }}
                className="text-xs font-bold px-3 py-2 rounded-lg bg-red-50 text-red-700 active:scale-95"
              >
                Se acabó (0)
              </button>
              <button
                onClick={() => setConteoCantidad(String(conteoDe.stockActual))}
                className="text-xs font-bold px-3 py-2 rounded-lg bg-neutral-100 text-neutral-700 active:scale-95"
              >
                Está bien como dice
              </button>
              {conteoCantidad !== '' && (
                <button
                  onClick={() => {
                    setConteoCantidad('');
                    setConteoPaquetes('');
                    setConteoSueltas('');
                  }}
                  className="text-xs font-bold px-3 py-2 rounded-lg bg-neutral-100 text-neutral-700 active:scale-95"
                >
                  🧹 Borrar y empezar de nuevo
                </button>
              )}
            </div>

            {valido && (
              <div
                className={`mt-4 rounded-2xl p-4 border ${
                  dif === 0
                    ? 'bg-green-50 border-green-200'
                    : dif! < 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-amber-50 border-amber-200'
                }`}
              >
                <p className="text-sm font-bold text-neutral-900">
                  {dif === 0
                    ? '✅ Coincide exacto con lo que decía el sistema.'
                    : dif! < 0
                    ? `Faltan ${Math.abs(Math.round(dif! * 1000) / 1000)} ${conteoDe.unidadReceta}`
                    : `Sobran ${Math.round(dif! * 1000) / 1000} ${conteoDe.unidadReceta}`}
                </p>
                {dif !== 0 && (
                  <p className="text-xs text-neutral-700 mt-1">
                    {dif! < 0
                      ? 'Puede ser merma, algo que se tiró o una venta que no se registró.'
                      : 'Puede ser una compra que no se capturó o una receta que descuenta de más.'}
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

            <button
              onClick={guardarConteoDeUno}
              disabled={ocupado || !valido}
              className="w-full bg-marron text-white font-bold py-3.5 rounded-xl mt-4 active:scale-95 disabled:opacity-50"
            >
              {ocupado ? 'Guardando…' : 'Guardar el conteo'}
            </button>
            <p className="text-xs text-neutral-600 mt-2 text-center">
              Tu inventario queda en {valido ? `${num} ${conteoDe.unidadReceta}` : 'lo que cuentes'},
              con la fecha de hoy.
            </p>
          </Modal>
        );
      })()}

      {/* ── Modal: lista de compras ── */}
      {listaAbierta && (
        <Modal titulo="🛒 Lista de compras" onCerrar={() => setListaAbierta(false)}>
          <p className="text-xs text-neutral-700 mb-3">
            Vienen marcados los que se están acabando o están en cero. Marca o desmarca lo que
            quieras y cópiala para llevarla al mercado.
          </p>

          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setSeleccionCompra(activos.map((a) => a.id))}
              className="flex-1 text-xs font-semibold text-black bg-neutral-200 py-2 rounded-xl active:scale-95"
            >
              Marcar todo
            </button>
            <button
              onClick={() => setSeleccionCompra([])}
              className="flex-1 text-xs font-semibold text-black bg-neutral-200 py-2 rounded-xl active:scale-95"
            >
              Quitar todo
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto -mx-1 px-1">
            {[...new Set(activos.map((a) => a.categoria || SIN_CATEGORIA))]
              .sort((a, b) => a.localeCompare(b, 'es'))
              .map((cat) => {
                const items = activos.filter((a) => (a.categoria || SIN_CATEGORIA) === cat);
                return (
                  <div key={cat} className="mb-3">
                    <p className="text-[11px] font-bold text-neutral-700 uppercase tracking-wide mb-1">
                      {ICONO_GRUPO[cat] ?? '·'} {cat}
                    </p>
                    {items.map((a) => (
                      <label key={a.id} className="flex gap-2 py-1 cursor-pointer items-start">
                        <input
                          type="checkbox"
                          checked={seleccionCompra.includes(a.id)}
                          onChange={() =>
                            setSeleccionCompra((s) =>
                              s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id]
                            )
                          }
                          className="mt-1 accent-[var(--marca-marron)] text-neutral-900"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="text-sm text-neutral-900">{a.nombre}</span>
                          <span className="block text-[11px] text-neutral-600">
                            quedan {a.stockActual} {a.unidadReceta}
                            {a.sugerenciaCompra > 0 &&
                              ` · comprar ${a.sugerenciaCompra} ${a.unidadCompra || ''}`}
                            {a.stockActual <= 0 && ' · ⚠️ en cero'}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                );
              })}
          </div>

          <button
            onClick={copiarLista}
            disabled={seleccionCompra.length === 0}
            className="w-full bg-marron text-white font-semibold py-3 rounded-xl mt-3 active:scale-95 disabled:opacity-50"
          >
            {listaCopiada ? '✅ Copiada' : `Copiar lista (${seleccionCompra.length})`}
          </button>
        </Modal>
      )}

      {/* ── Modal: vincular con las recetas de Productos ── */}
      {recetasDe && (
        <Modal titulo={`Recetas de ${recetasDe.nombre}`} onCerrar={() => setRecetasDe(null)}>
          <p className="text-xs text-neutral-700 mb-3">
            Marca los ingredientes de tus productos que salen de este insumo. Puedes marcar varios:
            así, cada venta descuenta del mismo stock.
          </p>

          <button
            onClick={aplicarSugerencias}
            className="w-full text-xs font-semibold text-black bg-neutral-200 py-2 rounded-xl mb-3 active:scale-95"
          >
            ✨ Marcar automáticamente los que se parecen
          </button>

          <input
            value={buscaProducto}
            onChange={(e) => setBuscaProducto(e.target.value)}
            placeholder="Buscar producto o ingrediente…"
            className={`${inputCls} mb-3`}
          />

          <div className="max-h-80 overflow-y-auto -mx-1 px-1 text-neutral-900">
            {productosVisibles.length === 0 && (
              <p className="text-sm text-neutral-600 py-4 text-center">
                Ningún producto coincide con “{buscaProducto}”.
              </p>
            )}

            {productosVisibles.map((p) => {
              const nombres = p.ingredientes.map((i) => i.nombre);
              const marcados = nombres.filter((n) => seleccion.includes(n)).length;
              return (
                <div key={p.id} className="border border-neutral-100 rounded-2xl p-3 mb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-neutral-900">{p.nombre}</p>
                      <p className="text-[11px] text-neutral-600">
                        {p.categoria}
                        {!p.disponible && ' · apagado en la tienda'}
                        {marcados > 0 && ` · ${marcados} marcado${marcados === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    {p.ingredientes.length > 0 && (
                      <button
                        onClick={() => alternarProducto(p)}
                        className="text-[11px] font-semibold text-black bg-neutral-200 px-2.5 py-1 rounded-lg active:scale-95 whitespace-nowrap shrink-0"
                      >
                        {marcados === nombres.length ? 'Quitar todo' : 'Marcar todo'}
                      </button>
                    )}
                  </div>

                  {p.ingredientes.length === 0 ? (
                    <p className="text-[11px] text-amber-700 mt-2">
                      Sin receta registrada en Catálogo — no hay nada que marcar todavía.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-0.5">
                      {p.ingredientes.map((ing) => {
                        const marcado = seleccion.includes(ing.nombre);
                        const ajeno = ing.vinculadoA && ing.vinculadoA !== recetasDe.nombre;
                        return (
                          <li key={ing.nombre}>
                            <label className="flex gap-2 py-1 cursor-pointer items-start">
                              <input
                                type="checkbox"
                                checked={marcado}
                                onChange={() => alternarIngrediente(ing.nombre)}
                                className="mt-1 accent-[var(--marca-marron)] text-neutral-900"
                              />
                              <span className="flex-1 min-w-0 text-neutral-900">
                                <span className="text-sm text-neutral-900">{ing.nombre}</span>
                                <span className="text-[11px] text-neutral-600 text-neutral-900">
                                  {' '}
                                  {ing.cantidad} {ing.unidad}
                                </span>
                                {sugiere(recetasDe.nombre, ing.nombre) && !marcado && (
                                  <span className="ml-1.5 text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                                    sugerido
                                  </span>
                                )}
                                {ajeno && (
                                  <span className="block text-[11px] text-amber-700">
                                    Ya está vinculado a {ing.vinculadoA}
                                  </span>
                                )}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-neutral-600 mt-3">
            El mismo ingrediente puede aparecer en varios productos: al marcarlo en uno queda
            marcado en todos, porque todos descuentan del mismo insumo. Si no marcas ninguno, se
            intenta unir por nombre idéntico.
          </p>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          <button
            onClick={guardarRecetas}
            disabled={ocupado}
            className="w-full bg-marron text-white font-semibold py-3 rounded-xl mt-3 active:scale-95 disabled:opacity-50"
          >
            {ocupado ? 'Guardando…' : `Guardar (${seleccion.length} marcados)`}
          </button>
        </Modal>
      )}

      {/* ── Modal: historial de precios ── */}
      {historial !== null && (
        <Modal titulo={`Precios de ${historialDe}`} onCerrar={() => setHistorial(null)}>
          {historial.length === 0 ? (
            <p className="text-sm text-neutral-700">Todavía no hay compras registradas.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {historial.map((h, k) => (
                <li key={k} className="py-2 flex justify-between gap-3 items-center">
                  <div className="min-w-0">
                    <p className="text-neutral-900 font-semibold">
                      {h.cantidad} {h.unidadCompra} · ${h.precioTotal}
                    </p>
                    {/* Con quién se compró: sin esto, el historial dice el
                        precio pero no de dónde salió, que es lo que hace
                        falta para saber si conviene volver ahí. */}
                    <p className="text-xs text-neutral-700">
                      {h.proveedor ? (
                        <span className="font-semibold">🏪 {h.proveedor}</span>
                      ) : (
                        <span className="text-neutral-500">sin proveedor anotado</span>
                      )}
                      {h.contenido > 1 && (
                        <span className="text-neutral-600"> · paquete de {h.contenido}</span>
                      )}
                    </p>
                    <p className="text-xs text-neutral-600">
                      {h.fecha}
                      {h.quien && ` · ${h.quien}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-neutral-600 text-right whitespace-nowrap">
                      ${h.precioUnidadCompra}
                      <span className="text-neutral-600 text-xs"> / {h.unidadCompra}</span>
                      {h.costoUnidadReceta > 0 && (
                        <span className="block text-[10px] font-semibold text-green-700">
                          {h.costoUnidadReceta >= 1
                            ? `$${h.costoUnidadReceta.toFixed(2)}`
                            : `$${h.costoUnidadReceta.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`}{' '}
                          por {historialUnidad}
                        </span>
                      )}
                    </p>
                    <button
                      onClick={() => borrarCompra(h)}
                      disabled={ocupado}
                      className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-lg active:scale-95 disabled:opacity-50"
                      title="Borrar esta compra"
                    >
                      🗑️
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}

function Modal({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-neutral-900">{titulo}</h2>
          <button onClick={onCerrar} className="text-neutral-600 text-xl leading-none px-2">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
