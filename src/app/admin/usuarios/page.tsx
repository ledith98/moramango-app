'use client';

import { useCallback, useEffect, useState } from 'react';

interface Usuario {
  ID_Usuario: string;
  Nombre: string;
  Telefono: string;
  Rol: string;
  Email: string;
  Activo: string;
  Notas_Admin?: string;
  Total_Articulos_Historico?: string;
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
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [form, setForm] = useState({ nombre: '', telefono: '', notas: '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

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

  const abrirEditar = (u: Usuario) => {
    setEditando(u);
    setForm({
      nombre: u.Nombre || '',
      telefono: u.Telefono || '',
      notas: u.Notas_Admin || '',
    });
    setError('');
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    if (!form.nombre.trim()) {
      setError('El nombre no puede quedar vacío');
      return;
    }
    setGuardando(true);
    setError('');
    const res = await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idUsuario: editando.ID_Usuario,
        nombre: form.nombre,
        telefono: form.telefono,
        notas: form.notas,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setGuardando(false);
    if (!res.ok) {
      // El caso típico: el teléfono ya está en otra cuenta
      setError(data.error || 'No se pudo guardar');
      return;
    }
    setUsuarios((prev) =>
      prev.map((x) =>
        x.ID_Usuario === editando.ID_Usuario
          ? { ...x, Nombre: form.nombre.trim(), Telefono: form.telefono.trim(), Notas_Admin: form.notas.trim() }
          : x
      )
    );
    setEditando(null);
  };

  /**
   * Busca por nombre, teléfono o correo. El teléfono se compara por sus
   * dígitos: quien lo tiene guardado como "+52 811..." lo teclea sin lada
   * y con comparación de texto no encontraría nada.
   */
  const q = busqueda.trim().toLowerCase();
  const soloDigitos = q.replace(/\D/g, '');
  const visibles = usuarios.filter((u) => {
    if (!q) return true;
    const enTexto = [u.Nombre, u.Email, u.ID_Usuario]
      .some((c) => (c || '').toLowerCase().includes(q));
    const enTelefono =
      soloDigitos.length >= 3 && (u.Telefono || '').replace(/\D/g, '').includes(soloDigitos);
    return enTexto || enTelefono;
  });

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
      <div className="space-y-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, teléfono o correo…"
          className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2.5 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-black"
        />
        <span className="text-sm text-neutral-700">
          {busqueda.trim()
            ? `${visibles.length} de ${usuarios.length} usuario${usuarios.length === 1 ? '' : 's'}`
            : `${usuarios.length} usuario${usuarios.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {cargando ? (
        <p className="text-neutral-700 animate-pulse">Cargando usuarios...</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-700 border-b border-neutral-100">
                <th className="p-4 font-semibold">Nombre</th>
                <th className="p-4 font-semibold">Contacto</th>
                <th className="p-4 font-semibold">Rol</th>
                <th className="p-4 font-semibold">Activo</th>
                <th className="p-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {visibles.map((u) => (
                <tr key={u.ID_Usuario} className="hover:bg-neutral-50">
                  <td className="p-4">
                    <button onClick={() => verHistorial(u)} className="font-semibold text-neutral-900 hover:underline text-left">
                      {u.Nombre}
                    </button>
                  </td>
                  <td className="p-4 text-neutral-700">
                    <p>{u.Email}</p>
                    {u.Telefono && <p className="text-xs">{u.Telefono}</p>}
                  </td>
                  <td className="p-4">
                    <select
                      value={u.Rol}
                      onChange={(e) => cambiarRol(u, e.target.value)}
                      className="bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-black text-neutral-900"
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
                    <button
                      onClick={() => abrirEditar(u)}
                      className="ml-2 text-sm font-semibold text-neutral-600 bg-neutral-100 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibles.length === 0 && (
            <p className="p-6 text-center text-neutral-700">
              Nadie coincide con “{busqueda.trim()}”.
            </p>
          )}
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
              <p className="text-sm text-neutral-700">{historialDe.Email}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {cargandoHistorial ? (
                <p className="text-neutral-700 animate-pulse">Cargando...</p>
              ) : pedidos.length === 0 ? (
                <p className="text-neutral-700">Este cliente no tiene pedidos todavía.</p>
              ) : (
                pedidos.map((p) => (
                  <div key={p.ID_Pedido} className="flex justify-between items-center bg-neutral-50 rounded-xl p-3">
                    <div>
                      <p className="font-mono text-xs text-neutral-700">{p.ID_Pedido}</p>
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

      {/* Editar datos de contacto */}
      {editando && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setEditando(null)}
        >
          <form
            onSubmit={guardar}
            className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[92dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-3 shrink-0">
              <h2 className="text-lg font-bold text-black">Editar usuario</h2>
              <p className="text-xs text-neutral-600 mt-0.5">{editando.ID_Usuario}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-neutral-700">Nombre</label>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-neutral-700">Teléfono</label>
                <input
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  inputMode="tel"
                  placeholder="8117850462"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-black"
                />
                <p className="text-xs text-neutral-600">
                  Con este número se le encuentra en el mostrador y se le acumulan sus compras. No
                  puede estar en dos cuentas.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-neutral-700">
                  Correo <span className="font-normal text-neutral-600">(no se puede cambiar)</span>
                </label>
                <p className="w-full bg-neutral-100 border border-neutral-200 rounded-xl p-3 text-neutral-700 break-all">
                  {editando.Email || '— entró desde el mostrador, sin cuenta de Google —'}
                </p>
                <p className="text-xs text-neutral-600">
                  Es la cuenta de Google con la que inicia sesión. Cambiarla lo dejaría sin poder
                  entrar.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-neutral-700">
                  Notas <span className="font-normal text-neutral-600">(solo tú las ves)</span>
                </label>
                <textarea
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  rows={2}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-black"
                  placeholder="Ej. prefiere sin hielo"
                />
              </div>
              <div className="h-2" />
            </div>

            <div className="shrink-0 border-t border-neutral-100 px-6 py-4 space-y-3 bg-white sm:rounded-b-3xl">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditando(null)}
                  className="flex-1 border border-neutral-200 text-neutral-600 font-semibold py-3 rounded-2xl active:scale-95 transition-transform"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 bg-black text-white font-semibold py-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
