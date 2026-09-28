import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ErrorHttp } from "../api/cliente";
import type { Cliente, Rol, Usuario } from "../api/tipos";
import { useSesion } from "../auth/SesionContext";

/** Valor del selector para el equipo de Grenlus, que no es un cliente. */
const EQUIPO = "grenlus";

/**
 * Quién puede entrar al panel.
 *
 * Se elige primero de quién son los usuarios: el equipo de Grenlus
 * (SUPER_ADMIN, ven todo) o un cliente (ADMIN_CLIENTE o VISUALIZADOR_CLIENTE,
 * ven solo lo suyo). El cliente sale de esa elección para no colgar un usuario
 * del cliente equivocado.
 *
 * Solo la ve un SUPER_ADMIN, igual que el endpoint.
 */
export default function Usuarios() {
  const { sesion } = useSesion();
  const [parametros, setParametros] = useSearchParams();
  const grupo = parametros.get("cliente") ?? EQUIPO;

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [error, setError] = useState<string | null>(null);
  // La contraseña va aparte porque es la única vez que se puede ver: el
  // formulario se limpia al guardar y el backend solo guarda su hash.
  const [aviso, setAviso] = useState<{ texto: string; password?: string } | null>(null);

  const [editando, setEditando] = useState<Usuario | null>(null);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rolCliente, setRolCliente] = useState<Rol>("ADMIN_CLIENTE");

  const esEquipo = grupo === EQUIPO;
  const clienteId = esEquipo ? null : Number(grupo);
  const clienteElegido = clientes.find((c) => c.id === clienteId);

  useEffect(() => {
    api
      .get<Cliente[]>("/api/clientes?incluirInactivos=true")
      .then(setClientes)
      .catch(mostrarError);
  }, []);

  useEffect(() => {
    limpiar();
    setError(null);
    setAviso(null);
    recargar();
  }, [grupo]);

  function recargar() {
    const ruta = esEquipo
      ? "/api/usuarios?superAdmins=true"
      : `/api/usuarios?clienteId=${clienteId}`;
    return api.get<Usuario[]>(ruta).then(setUsuarios).catch(mostrarError);
  }

  function mostrarError(err: unknown) {
    setError(
      err instanceof ErrorHttp ? err.mensaje : "No se pudo conectar con el servidor",
    );
  }

  function limpiar() {
    setEditando(null);
    setNombre("");
    setEmail("");
    setPassword("");
    setRolCliente("ADMIN_CLIENTE");
  }

  function editar(usuario: Usuario) {
    setEditando(usuario);
    setNombre(usuario.nombre);
    setEmail(usuario.email);
    setPassword("");
    setRolCliente(usuario.rol === "VISUALIZADOR_CLIENTE" ? usuario.rol : "ADMIN_CLIENTE");
    setAviso(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);

    const rol: Rol = esEquipo ? "SUPER_ADMIN" : rolCliente;
    const cuerpo = {
      nombre,
      email,
      // Al editar, vacía significa "no cambiar la contraseña".
      password: password || null,
      rol,
      clienteId,
    };

    try {
      if (editando) {
        await api.put<Usuario>(`/api/usuarios/${editando.id}`, cuerpo);
        setAviso(
          password
            ? { texto: `Se cambió la contraseña de ${email}.`, password }
            : { texto: `Se guardaron los cambios de ${email}.` },
        );
      } else {
        await api.post<Usuario>("/api/usuarios", cuerpo);
        setAviso({ texto: `Se creó ${email}.`, password });
      }
      limpiar();
      await recargar();
    } catch (err) {
      mostrarError(err);
    }
  }

  async function alternarActivo(usuario: Usuario) {
    if (
      usuario.activo &&
      !window.confirm(
        `¿Dar de baja a ${usuario.email}? No va a poder entrar al panel. Se puede reactivar.`,
      )
    ) {
      return;
    }
    setError(null);
    setAviso(null);
    try {
      if (usuario.activo) {
        await api.del(`/api/usuarios/${usuario.id}`);
      } else {
        await api.post(`/api/usuarios/${usuario.id}/reactivar`);
      }
      await recargar();
    } catch (err) {
      mostrarError(err);
    }
  }

  const soyYo = (u: Usuario) => u.email.toLowerCase() === sesion?.email.toLowerCase();

  return (
    <>
      <h1>Usuarios</h1>

      <label className="selector">
        Usuarios de
        <select
          value={grupo}
          onChange={(e) =>
            setParametros(e.target.value === EQUIPO ? {} : { cliente: e.target.value })
          }
        >
          <option value={EQUIPO}>Equipo Grenlus (ven todos los clientes)</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
              {c.cuit ? ` — ${c.cuit}` : ""}
              {c.activo ? "" : " (inactivo)"}
            </option>
          ))}
        </select>
      </label>

      <p className="sutil ayuda">
        {esEquipo
          ? "Administradores de Grenlus: crean clientes y usuarios, y ven los datos de todos."
          : "Elegí si la cuenta podrá administrar las pantallas de este cliente o solo consultar qué se está mostrando."}
      </p>

      {clienteElegido && !clienteElegido.activo && (
        <p className="error">
          Este cliente está dado de baja: sus usuarios no pueden entrar al panel
          hasta que se lo reactive.
        </p>
      )}

      {error && <p className="error">{error}</p>}
      {aviso && (
        <div className="aviso">
          <p>{aviso.texto}</p>
          {aviso.password && (
            <p>
              Contraseña: <strong className="mono">{aviso.password}</strong> — pasásela
              por un canal privado. Cuando cierres este aviso no se puede volver a ver.
            </p>
          )}
          <button type="button" className="enlace" onClick={() => setAviso(null)}>
            Cerrar
          </button>
        </div>
      )}

      <form className="tarjeta fila-form" onSubmit={guardar}>
        <label className="crecer">
          Nombre
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ana Pérez"
            maxLength={150}
            required
          />
        </label>
        <label className="crecer">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ana@empresa.com"
            maxLength={150}
            required
          />
        </label>
        <label className="crecer">
          {editando ? "Contraseña nueva (vacía = no cambiar)" : "Contraseña inicial"}
          <input
            className="mono"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required={!editando}
            autoComplete="new-password"
          />
        </label>
        {!esEquipo && (
          <label className="crecer">
            Acceso
            <select
              value={rolCliente}
              onChange={(e) =>
                setRolCliente(
                  e.target.value === "VISUALIZADOR_CLIENTE"
                    ? "VISUALIZADOR_CLIENTE"
                    : "ADMIN_CLIENTE",
                )
              }
            >
              <option value="ADMIN_CLIENTE">Administrador — puede modificar pantallas</option>
              <option value="VISUALIZADOR_CLIENTE">Solo lectura — ver pantallas</option>
            </select>
          </label>
        )}
        <button
          type="button"
          className="secundario"
          onClick={() => setPassword(generarPassword())}
          title="Generar una contraseña al azar"
        >
          ↻
        </button>
        <button type="submit">{editando ? "Guardar" : "Crear"}</button>
        {editando && (
          <button type="button" className="secundario" onClick={limpiar}>
            Cancelar
          </button>
        )}
      </form>

      {usuarios.length === 0 ? (
        <div className="tarjeta vacio">
          <p>
            {esEquipo
              ? "No hay administradores de Grenlus."
              : "Este cliente todavía no tiene usuarios."}
          </p>
          {!esEquipo && (
            <p className="sutil">
              Creale uno arriba para que pueda entrar a administrar sus pantallas.
            </p>
          )}
        </div>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Estado</th>
              <th>Nombre</th>
              <th>Email</th>
              {!esEquipo && <th>Acceso</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className={u.activo ? "" : "inactiva"}>
                <td>
                  <span className={`estado ${u.activo ? "online" : "offline"}`}>
                    {u.activo ? "ACTIVO" : "INACTIVO"}
                  </span>
                </td>
                <td>
                  {u.nombre}
                  {soyYo(u) && <span className="etiqueta separada">VOS</span>}
                </td>
                <td className="sutil">{u.email}</td>
                {!esEquipo && (
                  <td>
                    {u.rol === "VISUALIZADOR_CLIENTE" ? "Solo lectura" : "Administrador"}
                  </td>
                )}
                <td className="acciones">
                  <button className="secundario" onClick={() => editar(u)}>
                    Editar
                  </button>
                  {/* Darse de baja a uno mismo lo rechaza el backend; acá
                      directamente no se ofrece. */}
                  {!soyYo(u) && (
                    <button className="secundario" onClick={() => alternarActivo(u)}>
                      {u.activo ? "Dar de baja" : "Reactivar"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/**
 * Contraseña inicial al azar, sin caracteres que se confunden al dictarla o
 * copiarla a mano (0/O, 1/l/I).
 */
function generarPassword() {
  const alfabeto = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const valores = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(valores, (v) => alfabeto[v % alfabeto.length]).join("");
}
