import { NavLink, Outlet } from "react-router-dom";
import { useSesion } from "../auth/SesionContext";

/** Marco comun del panel: navegacion y sesion. */
export default function Layout() {
  const { sesion, salir } = useSesion();

  return (
    <div className="contenedor">
      <header className="barra">
        <nav className="nav">
          {/* El backend igual rechaza a los demás con 403: esto solo evita
              mostrar un enlace que no les sirve. */}
          {sesion?.rol === "SUPER_ADMIN" && (
            <>
              <NavLink to="/clientes">Clientes</NavLink>
              <NavLink to="/usuarios">Usuarios</NavLink>
            </>
          )}
          {sesion?.rol !== "VISUALIZADOR_CLIENTE" && (
            <NavLink to="/sucursales">Sucursales</NavLink>
          )}
          <NavLink to="/pantallas">Pantallas</NavLink>
          {sesion?.rol !== "VISUALIZADOR_CLIENTE" && (
            <>
              <NavLink to="/contenidos">Contenidos</NavLink>
              <NavLink to="/playlists">Playlists</NavLink>
            </>
          )}
        </nav>
        <div className="barra-derecha">
          <span className="sutil">{sesion?.email}</span>
          <button className="secundario" onClick={salir}>
            Salir
          </button>
        </div>
      </header>

      <Outlet />
    </div>
  );
}
