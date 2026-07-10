'use client';

import { useCallback, useEffect, useState } from 'react';

interface Insumo {
  id: string;
  nombre: string;
  unidad: string;
  proveedor: string;
  stock: number;
  consumoDiario: number;
  diasRestantes: number | null;
  nivel: 'rojo' | 'amarillo' | 'verde' | 'gris';
  sugerenciaCompra: number;
  conteoFisico: number | null;
  fechaConteo: string;
  diferencia: number | null;
  enRecetas: boolean;
}

const PUNTO_NIVEL: Record<string, string> = {
  rojo: 'bg-red-500',
  amarillo: 'bg-amber-400',
  verde: 'bg-green-500',
  gris: 'bg-neutral-300',
};

export default function InsumosPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [diasAnalisis, setDiasAnalisis] = useState(7);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);

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

  const alertas = insumos
    .filter((i) => i.nivel === 'rojo' || i.nivel === 'amarillo')
    .sort((a, b) => (a.nivel === 'rojo' ? -1 : 1) - (b.nivel === 'rojo' ? -1 : 1));

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

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-neutral-900">Inventario</h2>
              <span className="text-xs text-neutral-500">
                Consumo calculado con las ventas de los últimos {diasAnalisis} días
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
                    <th className="p-3 font-semibold">Conteo físico</th>
                    <th className="p-3 font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {insumos.map((i) => (
                    <tr key={i.id} className="hover:bg-neutral-50">
                      <td className="p-3">
                        <p className="font-semibold text-neutral-900">{i.nombre}</p>
                        <p className="text-xs text-neutral-400">
                          {i.id}
                          {!i.enRecetas && ' · sin receta asociada'}
                        </p>
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
                </tbody>
              </table>
              {insumos.length === 0 && (
                <p className="p-6 text-neutral-500 text-center">
                  No hay insumos registrados en la hoja "Insumos".
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
