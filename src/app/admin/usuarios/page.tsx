'use client';

import { useCallback, useEffect, useState } from 'react';

interface Usuario {
  ID_Usuario: string;
  Nombre: string;
  Telefono: string;
  Rol: string;
  Email: string;
  Activo: string;
}

interface PedidoHistorial {
  ID_Pedido: string;
  Fecha_Hora: string;
  Estado: string;
  Total_Final: string;
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [historialDe, setHistorialDe] = useState<Usuario | null>(null);
  const [pedidos, setPedidos] = useState<PedidoHistorial[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  const cargarUsuarios = useCallback(() => {
    setCargando(true);
    fetch('/api/admin/usuarios')
      .then((res) => res.json())
      .then((data) => setUsuarios(data.usuarios || []))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargarUsuarios();
  }, [cargarUsuarios]);

  const toggleActivo = async (u: Usuario) => {
    const nuevoValor = !(u.Activo?.toLowerCase() === 'si');
    setUsuarios((prev) =>
      prev.map((x) => (x.ID_Usuario === u.ID_Usuario ? { ...x, Activo: nuevoValor ? 'si' : 'no' } : x))
    );
    await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idUsuario: u.ID_Usuario, activo: nuevoValor }),
    });
  };

  const cambiarRol = async (u: Usuario, nuevoRol: string) => {
    if (nuevoRol === 'admin' && !confirm(`¿Convertir a ${u.Nombre} en admin? Tendrá acceso completo al panel.`)) {
      return;
    }
    setUsuarios((prev) => prev.map((x) => (x.ID_Usuario === u.ID_Usuario ? { ...x, Rol: nuevoRol } : x)));
    await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idUsuario: u.ID_Usuario, rol: nuevoRol }),
    });
  };

  const verHistorial = (u: Usuario) => {
    setHistorialDe(u);
    setCargandoHistorial(true);
    fetch(`/api/admin/usuarios/${u.ID_Usuario}/pedidos`)
      .then((res) => res.json())
      .then((data) => setPedidos(data.pedidos || []))
      .finally(() => setCargandoHistorial(false));
  };

  return (
    <div className="space-y-6">
      <span className="text-sm text-neutral-500">{usuarios.length} usuario{usuarios.length === 1 ? '' : 's'}</span>

      {cargando ? (
        <p className="text-neutral-500 animate-pulse">Cargando usuarios...</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-100">
                <th className="p-4 font-semibold">Nombre</th>
                <th className="p-4 font-semibold">Contacto</th>
                <th className="p-4 font-semibold">Rol</th>
                <th className="p-4 font-semibold">Activo</th>
                <th className="p-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {usuarios.map((u) => (
                <tr key={u.ID_Usuario} className="hover:bg-neutral-50">
                  <td className="p-4">
                    <button onClick={() => verHistorial(u)} className="font-semibold text-neutral-900 hover:underline text-left">
                      {u.Nombre}
                    </button>
                  </td>
                  <td className="p-4 text-neutral-500">
                    <p>{u.Email}</p>
                    {u.Telefono && <p className="text-xs">{u.Telefono}</p>}
                  </td>
                  <td className="p-4">
                    <select
                      value={u.Rol}
                      onChange={(e) => cambiarRol(u, e.target.value)}
                      className="bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-black"
                    >
                      <option value="cliente">cliente</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => toggleActivo(u)}
                      className={`w-11 h-6 rounded-full transition-colors relative ${
                        u.Activo?.toLowerCase() === 'si' ? 'bg-green-500' : 'bg-neutral-300'
                      }`}
                    >
                      <span
                        className={`absolute left-0 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          u.Activo?.toLowerCase() === 'si' ? 'translate-x-[22px]' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => verHistorial(u)}
                      className="text-sm font-semibold text-neutral-600 bg-neutral-100 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                    >
                      Historial
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {historialDe && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setHistorialDe(null)}
        >
          <div
            className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-neutral-100 shrink-0">
              <h2 className="text-lg font-bold text-black">Historial de {historialDe.Nombre}</h2>
              <p className="text-sm text-neutral-500">{historialDe.Email}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {cargandoHistorial ? (
                <p className="text-neutral-500 animate-pulse">Cargando...</p>
              ) : pedidos.length === 0 ? (
                <p className="text-neutral-500">Este cliente no tiene pedidos todavía.</p>
              ) : (
                pedidos.map((p) => (
                  <div key={p.ID_Pedido} className="flex justify-between items-center bg-neutral-50 rounded-xl p-3">
                    <div>
                      <p className="font-mono text-xs text-neutral-500">{p.ID_Pedido}</p>
                      <p className="text-sm text-neutral-700">{p.Estado}</p>
                    </div>
                    <span className="font-bold text-neutral-900">${parseFloat(p.Total_Final || '0').toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
