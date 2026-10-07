import { useEffect, useState, type FormEvent } from "react";
import { api, ErrorHttp } from "../api/cliente";
import type { Contenido, ItemPlaylist, Playlist } from "../api/tipos";
import { useClientes } from "../hooks/useClientes";

/**
 * Armado de playlists: crear, y componer que contenidos van y en que orden.
 *
 * Cada cambio en la composicion incrementa Playlist.version del lado del
 * backend, y esa version es lo unico que hace que las pantallas se enteren.
 * Por eso se muestra: es el numero que dice si el cambio va a llegar.
 */
export default function Playlists() {
  const { clientes, clienteId, setClienteId, cargando } = useClientes();

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [seleccionada, setSeleccionada] = useState<Playlist | null>(null);
  const [items, setItems] = useState<ItemPlaylist[]>([]);
  const [contenidos, setContenidos] = useState<Contenido[]>([]);
  const [nombreNueva, setNombreNueva] = useState("");
  const [contenidoAAgregar, setContenidoAAgregar] = useState("");
  const [duracion, setDuracion] = useState("10");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clienteId === null) return;
    setSeleccionada(null);
    setItems([]);

    api
      .get<Playlist[]>(`/api/playlists?clienteId=${clienteId}`)
      .then(setPlaylists)
      .catch(mostrarError);

    api
      .get<Contenido[]>(`/api/contenidos?clienteId=${clienteId}`)
      .then(setContenidos)
      .catch(mostrarError);
  }, [clienteId]);

  function mostrarError(err: unknown) {
    setError(
      err instanceof ErrorHttp ? err.mensaje : "No se pudo conectar con el servidor",
    );
  }

  async function abrir(playlist: Playlist) {
    setSeleccionada(playlist);
    setError(null);
    try {
      setItems(
        await api.get<ItemPlaylist[]>(
          `/api/playlist-contenidos/playlist/${playlist.id}`,
        ),
      );
    } catch (err) {
      mostrarError(err);
    }
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (clienteId === null) return;
    setError(null);
    try {
      const nueva = await api.post<Playlist>("/api/playlists", {
        nombre: nombreNueva,
        clienteId,
      });
      setPlaylists((previas) => [...previas, nueva]);
      setNombreNueva("");
      abrir(nueva);
    } catch (err) {
      mostrarError(err);
    }
  }

  async function agregarItem(e: FormEvent) {
    e.preventDefault();
    if (!seleccionada || !contenidoAAgregar) return;
    setError(null);
    try {
      const contenido = contenidos.find((c) => c.id === Number(contenidoAAgregar));

      const item = await api.post<ItemPlaylist>("/api/playlist-contenidos", {
        playlistId: seleccionada.id,
        contenidoId: Number(contenidoAAgregar),
        orden: items.length + 1,
        // Un video dura lo que dura el archivo; la duracion solo aplica a
        // imagenes.
        duracionVisualizacion:
          contenido?.tipo === "IMAGEN" ? Number(duracion) : null,
      });
      setItems((previos) => [...previos, item]);
      setContenidoAAgregar("");
      await refrescarVersion();
    } catch (err) {
      mostrarError(err);
    }
  }

  async function quitarItem(id: number) {
    setError(null);
    try {
      await api.del(`/api/playlist-contenidos/${id}`);
      setItems((previos) => previos.filter((i) => i.id !== id));
      await refrescarVersion();
    } catch (err) {
      mostrarError(err);
    }
  }

  async function desactivar(playlist: Playlist) {
    if (
      !window.confirm(
        `¿Dar de baja a ${playlist.nombre}? Las pantallas que ya la tienen asignada seguirán reproduciéndola.`,
      )
    ) {
      return;
    }

    setError(null);
    try {
      await api.del(`/api/playlists/${playlist.id}`);
      setPlaylists((previas) => previas.filter((p) => p.id !== playlist.id));
      setSeleccionada(null);
      setItems([]);
    } catch (err) {
      mostrarError(err);
    }
  }

  /** La version la calcula el backend; se relee para mostrarla al dia. */
  async function refrescarVersion() {
    if (!seleccionada) return;
    const actualizada = await api.get<Playlist>(`/api/playlists/${seleccionada.id}`);
    setSeleccionada(actualizada);
    setPlaylists((previas) =>
      previas.map((p) => (p.id === actualizada.id ? actualizada : p)),
    );
  }

  if (cargando) return <p className="sutil">Cargando…</p>;

  if (clientes.length === 0) {
    return (
      <div className="tarjeta vacio">
        <p>No hay clientes con sucursales cargadas.</p>
      </div>
    );
  }

  return (
    <>
      <h1>Playlists</h1>

      <label className="selector">
        Cliente
        <select
          value={clienteId ?? ""}
          onChange={(e) => setClienteId(Number(e.target.value))}
        >
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="error">{error}</p>}

      <form className="tarjeta fila-form" onSubmit={crear}>
        <label className="crecer">
          Nueva playlist
          <input
            value={nombreNueva}
            onChange={(e) => setNombreNueva(e.target.value)}
            placeholder="Promos de octubre"
            required
          />
        </label>
        <button type="submit">Crear</button>
      </form>

      <div className="dos-columnas">
        <div>
          {playlists.length === 0 ? (
            <div className="tarjeta vacio">
              <p>Todavía no hay playlists.</p>
            </div>
          ) : (
            <ul className="lista">
              {playlists.map((p) => (
                <li key={p.id}>
                  <button
                    className={`item-lista ${seleccionada?.id === p.id ? "activo" : ""}`}
                    onClick={() => abrir(p)}
                  >
                    <span>{p.nombre}</span>
                    <span className="etiqueta">v{p.version}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {!seleccionada ? (
            <div className="tarjeta vacio">
              <p className="sutil">Elegí una playlist para ver su contenido.</p>
            </div>
          ) : (
            <div className="tarjeta">
              <div className="barra">
                <div>
                  <h2>{seleccionada.nombre}</h2>
                  <p className="sutil">
                    versión {seleccionada.version} — es lo que compara el player
                    para decidir si resincroniza
                  </p>
                </div>
                <button
                  className="secundario"
                  onClick={() => desactivar(seleccionada)}
                >
                  Dar de baja
                </button>
              </div>

              <form className="fila-form" onSubmit={agregarItem}>
                <label className="crecer">
                  Contenido
                  <select
                    value={contenidoAAgregar}
                    onChange={(e) => setContenidoAAgregar(e.target.value)}
                    required
                  >
                    <option value="">— elegir —</option>
                    {contenidos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({c.tipo})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="angosto">
                  Segundos
                  <input
                    type="number"
                    min="1"
                    value={duracion}
                    onChange={(e) => setDuracion(e.target.value)}
                  />
                </label>
                <button type="submit">Agregar</button>
              </form>

              {items.length === 0 ? (
                <p className="sutil">Esta playlist está vacía.</p>
              ) : (
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Contenido</th>
                      <th>Tipo</th>
                      <th>Duración</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id}>
                        <td className="sutil">{i.orden}</td>
                        <td>{i.contenidoNombre}</td>
                        <td>
                          <span className="etiqueta">{i.tipo}</span>
                        </td>
                        <td className="sutil">
                          {i.duracionVisualizacion
                            ? `${i.duracionVisualizacion}s`
                            : "lo que dure el video"}
                        </td>
                        <td>
                          <button
                            className="secundario"
                            onClick={() => quitarItem(i.id)}
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
