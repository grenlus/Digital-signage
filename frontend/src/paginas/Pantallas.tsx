import { useEffect, useState } from "react";
import { api, ErrorHttp } from "../api/cliente";
import type { Pantalla, PantallaCreada, Playlist, Sucursal } from "../api/tipos";
import { useSesion } from "../auth/SesionContext";
import TokenPantalla from "../componentes/TokenPantalla";
import MiniReproductor from "../componentes/MiniReproductor";

/**
 * Detalle de sucursal: todas las pantallas de un local, su estado y que
 * reproduce cada una.
 *
 * Es la pantalla que la guia marca como la mas util del panel (seccion 11):
 * permite controlar rapido todas las TVs de una sucursal.
 */
export default function Pantallas() {
  const { sesion } = useSesion();
  const soloLectura = sesion?.rol === "VISUALIZADOR_CLIENTE";
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState<number | null>(null);
  const [pantallas, setPantallas] = useState<Pantalla[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const [nombreNueva, setNombreNueva] = useState("");
  const [codigoNueva, setCodigoNueva] = useState(sugerirCodigo);
  const [creada, setCreada] = useState<PantallaCreada | null>(null);

  useEffect(() => {
    api
      .get<Sucursal[]>("/api/sucursales")
      .then((datos) => {
        const activas = datos.filter((s) => s.activo);
        setSucursales(activas);
        if (activas.length > 0) setSucursalId(activas[0].id);
      })
      .catch(mostrarError)
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (sucursalId === null) return;

    const sucursal = sucursales.find((s) => s.id === sucursalId);

    function cargarPantallas() {
      return api
        .get<Pantalla[]>(`/api/pantallas?sucursalId=${sucursalId}`)
        .then(setPantallas)
        .catch(mostrarError);
    }

    cargarPantallas();
    const intervalo = soloLectura
      ? window.setInterval(cargarPantallas, 30000)
      : undefined;

    // Las playlists son del cliente, no de la sucursal: se piden segun a quien
    // pertenece el local que se esta mirando.
    if (!soloLectura && sucursal?.clienteId != null) {
      api
        .get<Playlist[]>(`/api/playlists?clienteId=${sucursal.clienteId}`)
        .then(setPlaylists)
        .catch(mostrarError);
    }

    return () => {
      if (intervalo) window.clearInterval(intervalo);
    };
  }, [sucursalId, sucursales, soloLectura]);

  function mostrarError(err: unknown) {
    setError(
      err instanceof ErrorHttp ? err.mensaje : "No se pudo conectar con el servidor",
    );
  }

  async function crearPantalla(e: import("react").FormEvent) {
    e.preventDefault();
    if (sucursalId === null) return;
    setError(null);
    try {
      const respuesta = await api.post<PantallaCreada>("/api/pantallas", {
        codigo: codigoNueva.trim().toUpperCase(),
        nombre: nombreNueva,
        sucursalId,
      });
      setPantallas((previas) => [...previas, respuesta.pantalla]);
      setCreada(respuesta);
      setNombreNueva("");
      setCodigoNueva(sugerirCodigo());
    } catch (err) {
      mostrarError(err);
    }
  }

  /**
   * Prende o apaga la pantalla. No toca la playlist: al volver a prenderla
   * retoma lo que tenía. El player lo aplica en su próxima consulta, hasta 30
   * segundos después.
   */
  async function alternarEncendido(pantalla: Pantalla) {
    setError(null);
    try {
      const actualizada = await api.put<Pantalla>(
        `/api/pantallas/${pantalla.id}/encendida`,
        { encendida: !pantalla.encendida },
      );
      setPantallas((previas) =>
        previas.map((p) => (p.id === actualizada.id ? actualizada : p)),
      );
    } catch (err) {
      mostrarError(err);
    }
  }

  /** Invalida el token anterior en el acto. Sirve si se reemplaza el aparato. */
  async function regenerarToken(pantalla: Pantalla) {
    setError(null);
    try {
      const r = await api.post<{ tokenAcceso: string }>(
        `/api/pantallas/${pantalla.id}/token`,
      );
      setCreada({ pantalla, tokenAcceso: r.tokenAcceso, aviso: "" });
    } catch (err) {
      mostrarError(err);
    }
  }

  /**
   * Aplica una playlist a todas las pantallas del local de una vez.
   *
   * No crea una relación entre sucursal y playlist: escribe la misma playlist
   * en cada pantalla. Por eso después se puede cambiar una sola, y la tabla
   * sigue mostrando qué reproduce cada una.
   */
  async function asignarATodas(playlistId: string) {
    if (sucursalId === null || playlistId === "__") return;
    setError(null);
    try {
      const actualizadas = await api.put<Pantalla[]>(
        `/api/pantallas/sucursal/${sucursalId}/playlist`,
        { playlistId: playlistId === "" ? null : Number(playlistId) },
      );
      const porId = new Map(actualizadas.map((p) => [p.id, p]));
      setPantallas((previas) => previas.map((p) => porId.get(p.id) ?? p));
    } catch (err) {
      mostrarError(err);
    }
  }

  /**
   * Define el estado deseado de la pantalla. No le avisa a la TV: el player lo
   * descubre la proxima vez que consulte su configuracion, por eso funciona
   * aunque este apagada.
   */
  async function asignarPlaylist(pantallaId: number, playlistId: string) {
    setError(null);
    try {
      const actualizada = await api.put<Pantalla>(
        `/api/pantallas/${pantallaId}/playlist`,
        { playlistId: playlistId === "" ? null : Number(playlistId) },
      );
      setPantallas((previas) =>
        previas.map((p) => (p.id === actualizada.id ? actualizada : p)),
      );
    } catch (err) {
      mostrarError(err);
    }
  }

  if (cargando) return <p className="sutil">Cargando…</p>;

  return (
    <>
      <h1>Pantallas</h1>

      {soloLectura && (
        <p className="ayuda">
          Acceso de solo lectura: podés consultar el estado y la vista previa del
          contenido asignado a las pantallas, pero no modificarlas.
        </p>
      )}

      {error && <p className="error">{error}</p>}

      {sucursales.length === 0 ? (
        <div className="tarjeta vacio">
          <p>
            {soloLectura
              ? "Este cliente todavía no tiene sucursales para consultar."
              : "Todavía no hay sucursales cargadas."}
          </p>
          {!soloLectura && (
            <p className="sutil">
              Una pantalla siempre pertenece a una sucursal, así que hay que crear
              una antes de poder darla de alta.
            </p>
          )}
        </div>
      ) : (
        <>
          <label className="selector">
            Sucursal
            <select
              value={sucursalId ?? ""}
              onChange={(e) => setSucursalId(Number(e.target.value))}
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                  {s.ciudad ? ` — ${s.ciudad}` : ""}
                </option>
              ))}
            </select>
          </label>

          {!soloLectura && (
            <form className="tarjeta fila-form" onSubmit={crearPantalla}>
              <label className="crecer">
                Nombre de la pantalla
                <input
                  value={nombreNueva}
                  onChange={(e) => setNombreNueva(e.target.value)}
                  placeholder="TV Entrada"
                  required
                />
              </label>
              <label className="crecer">
                Código del dispositivo
                <input
                  className="mono"
                  value={codigoNueva}
                  onChange={(e) => setCodigoNueva(e.target.value)}
                  required
                />
              </label>
              <button
                type="button"
                className="secundario"
                onClick={() => setCodigoNueva(sugerirCodigo())}
                title="Sugerir otro código"
              >
                ↻
              </button>
              <button type="submit">Dar de alta</button>
            </form>
          )}

          {pantallas.length === 0 ? (
            <div className="tarjeta vacio">
              <p>
                {soloLectura
                  ? "Esta sucursal todavía no tiene pantallas."
                  : "Esta sucursal no tiene pantallas."}
              </p>
            </div>
          ) : (
            <>
              {!soloLectura && pantallas.length > 1 && (
                <div className="tarjeta fila-form">
                  <label className="crecer">
                    Aplicar a las {pantallas.length} pantallas del local
                    <select
                      value="__"
                      onChange={(e) => asignarATodas(e.target.value)}
                    >
                      <option value="__">— elegir playlist —</option>
                      <option value="">— sin contenido —</option>
                      {playlists.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </>
          )}

          {pantallas.length > 0 && (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Pantalla</th>
                  <th>Encendida</th>
                  <th>Código</th>
                  <th>Última conexión</th>
                  <th>Playlist</th>
                  <th>Vista previa</th>
                  {!soloLectura && <th></th>}
                </tr>
              </thead>
              <tbody>
                {pantallas.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className={`estado ${p.estado.toLowerCase()}`}>
                        {p.estado}
                      </span>
                    </td>
                    <td>{p.nombre}</td>
                    <td>
                      {soloLectura ? (p.encendida ? "Sí" : "No") : (
                        <button
                          className={`interruptor ${p.encendida ? "prendido" : ""}`}
                          onClick={() => alternarEncendido(p)}
                          title={p.encendida ? "Apagar la pantalla" : "Prender la pantalla"}
                          aria-pressed={p.encendida}
                        >
                          <span className="perilla" />
                        </button>
                      )}
                    </td>
                    <td className="mono">{p.codigo}</td>
                    <td className="sutil">{formatearFecha(p.ultimaConexion)}</td>
                    <td>
                      {soloLectura ? p.playlistNombre ?? "— sin contenido —" : (
                        <select
                          value={p.playlistId ?? ""}
                          onChange={(e) => asignarPlaylist(p.id, e.target.value)}
                        >
                          <option value="">— sin contenido —</option>
                          {playlists.map((pl) => (
                            <option key={pl.id} value={pl.id}>
                              {pl.nombre}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      <MiniReproductor playlistId={p.playlistId} encendida={p.encendida} />
                    </td>
                    {!soloLectura && (
                      <td>
                        <button
                          className="secundario"
                          onClick={() => regenerarToken(p)}
                          title="Genera un token nuevo e invalida el anterior"
                        >
                          Token
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {creada && (
        <TokenPantalla
          codigo={creada.pantalla.codigo}
          token={creada.tokenAcceso}
          onCerrar={() => setCreada(null)}
        />
      )}
    </>
  );
}

/**
 * Propone un codigo libre con el formato GRN-XXXXXX.
 *
 * Lo sugiere el panel y no el dispositivo: asi el instalador copia el codigo y
 * el token juntos de la misma pantalla, en vez de leer un codigo de una TV a
 * tres metros de altura y despues volver al panel a buscar el token.
 */
function sugerirCodigo() {
  const hex = Array.from({ length: 3 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0"),
  ).join("");
  return `GRN-${hex.toUpperCase()}`;
}

function formatearFecha(fecha: string | null) {
  // null significa que nunca se conecto, que no es lo mismo que hace mucho.
  if (!fecha) return "nunca";
  return new Date(fecha).toLocaleString("es-AR");
}
