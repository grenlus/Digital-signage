/**
 * Espejo en TypeScript de los DTOs del backend.
 *
 * No se generan solos: si alguien renombra un campo en el backend, acá no se
 * entera nadie hasta que algo aparece vacío en pantalla. Cuando el contrato se
 * estabilice conviene generarlos desde OpenAPI.
 */

export type Rol = "SUPER_ADMIN" | "ADMIN_CLIENTE" | "VISUALIZADOR_CLIENTE";

export type TipoContenido = "VIDEO" | "IMAGEN";

/** Derivado de ultimaConexion en el backend, no es una columna. */
export type EstadoPantalla = "ONLINE" | "OFFLINE";

export interface LoginResponse {
  token: string;
  email: string;
  rol: Rol;
  expiraEnMs: number;
}

/** Empresa que contrata el servicio. Solo la administra un SUPER_ADMIN. */
export interface Cliente {
  id: number;
  nombre: string;
  cuit: string | null;
  email: string | null;
  telefono: string | null;
  activo: boolean;
  fechaAlta: string;
}

/** Nunca trae la contraseña: el backend solo guarda su hash. */
export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  /** null para SUPER_ADMIN, que no pertenece a ningún cliente. */
  clienteId: number | null;
  clienteNombre: string | null;
}

export interface Sucursal {
  id: number;
  nombre: string;
  direccion: string | null;
  ciudad: string | null;
  provincia: string | null;
  activo: boolean;
  clienteId: number | null;
  clienteNombre: string | null;
}

export interface Pantalla {
  id: number;
  codigo: string;
  nombre: string;
  estado: EstadoPantalla;
  ultimaConexion: string | null;
  activo: boolean;
  /** false = la oficina la apagó: muestra negro pero sigue conectada. */
  encendida: boolean;
  sucursalId: number;
  sucursalNombre: string;
  playlistId: number | null;
  playlistNombre: string | null;
}

export interface Playlist {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  fechaCreacion: string;
  version: number;
  clienteId: number;
}

/** Forma unica de los errores de la API. */
export interface ErrorApi {
  momento: string;
  estado: number;
  error: string;
  mensaje: string;
  campos?: Record<string, string>;
}

export interface Contenido {
  id: number;
  nombre: string;
  tipo: TipoContenido;
  /** Ruta relativa de descarga. La ruta en disco del servidor no se expone. */
  url: string;
  nombreArchivo: string;
  tamanoBytes: number;
  duracionSegundos: number | null;
  fechaSubida: string;
  activo: boolean;
  clienteId: number;
}

/** Un contenido dentro de una playlist, con su posicion y duracion. */
export interface ItemPlaylist {
  id: number;
  playlistId: number;
  orden: number;
  duracionVisualizacion: number | null;
  activo: boolean;
  contenidoId: number;
  contenidoNombre: string;
  tipo: TipoContenido;
  url: string;
}

/**
 * Respuesta del alta de una pantalla. Es la unica vez que el token viaja en
 * claro: el backend solo guarda su hash.
 */
export interface PantallaCreada {
  pantalla: Pantalla;
  tokenAcceso: string;
  aviso: string;
}
