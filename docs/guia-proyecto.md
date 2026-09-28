# Grenlus Signage — Guía de proyecto

> Arquitectura, flujos y roadmap de desarrollo.
> MVP para administrar remotamente contenido en múltiples pantallas y sucursales.
> Documento de trabajo — v1.

**Objetivo principal:** desde una oficina, elegir qué videos o imágenes reproduce cada pantalla, aunque esté en otra sucursal y otra red Wi-Fi.

| Tecnología | Elección inicial |
| --- | --- |
| Backend | Spring Boot + Java 21 + PostgreSQL |
| Frontend | React + Vite |
| Player | Android / Android TV + Media3 |
| Comunicación | REST en MVP; WebSocket opcional más adelante |
| Archivos | Storage local al inicio; objeto cloud después |

---

## 1. Qué producto estamos construyendo

Grenlus Signage es un sistema de cartelería digital centralizada. Cada sucursal tiene una o varias pantallas conectadas a un dispositivo Android. Desde un panel web en la oficina se decide qué contenido debe reproducir cada pantalla.

```
OFICINA
  React (panel web)
       |
       v
  Spring Boot (API + lógica)
       |
       +---- PostgreSQL
       +---- Archivos / videos / imágenes
       |
     INTERNET
   /      |       \
  v       v        v
Android Android  Android
  |       |        |
 TV      TV       TV
Sucursal A      Sucursal C
```

La oficina **NO** hace streaming en vivo hacia cada TV. Cambia la configuración deseada en el servidor. El Android detecta esa configuración, descarga el contenido, lo guarda localmente y lo reproduce. Esto permite seguir mostrando publicidad aunque se corte Internet.

---

## 2. Responsabilidad de cada parte

| Componente | Responsabilidad | No debería hacer |
| --- | --- | --- |
| React | Administrar clientes, sucursales, pantallas, contenidos y playlists. | Reproducir contenido en la TV o hablar directamente con Android. |
| Spring Boot | Ser el cerebro: reglas, relaciones, configuración del player, persistencia y API. | Depender de que React esté abierto para que las TVs funcionen. |
| PostgreSQL | Guardar estructura y estado del sistema. | Guardar archivos MP4 grandes dentro de columnas. |
| Storage | Guardar videos e imágenes. | Decidir qué pantalla reproduce qué. |
| Android Player | Identificarse, consultar configuración, descargar, reproducir y reportar estado. | Administrar clientes o playlists. |

---

## 3. Modelo de datos: entidades del MVP

Para el MVP conviene mantener pocas entidades y que cada una tenga una responsabilidad clara. Estas siete alcanzan para construir el corazón del producto.

| Entidad | Qué representa | Relación principal |
| --- | --- | --- |
| Cliente | Empresa que contrata el servicio. | 1 Cliente → N Sucursales / Contenidos / Playlists / Usuarios |
| Sucursal | Ubicación física del cliente. | N Sucursales → 1 Cliente |
| Pantalla | Dispositivo lógico asociado a una TV, monitor, LED o tótem. | N Pantallas → 1 Sucursal; N Pantallas → 1 Playlist |
| Contenido | Archivo multimedia: VIDEO o IMAGEN. | N Contenidos → 1 Cliente |
| Playlist | Lista lógica de contenidos a reproducir. | N Playlists → 1 Cliente |
| PlaylistContenido | Entidad intermedia con orden y duración. | N registros → 1 Playlist y 1 Contenido |
| Usuario | Persona que accede al panel. | N Usuarios → 1 Cliente (o SUPER_ADMIN global) |

### Cliente

Representa la empresa dueña de las sucursales y contenidos.

- `id: Long`
- `nombre: String`
- `cuit: String` (opcional)
- `email: String`
- `telefono: String`
- `activo: Boolean`
- `fechaAlta: LocalDateTime`

### Sucursal

Representa un local físico. Una sucursal pertenece a un solo cliente.

- `id: Long`
- `nombre: String`
- `direccion: String`
- `ciudad: String`
- `provincia: String`
- `activo: Boolean`
- `cliente: Cliente`

### Pantalla

No llamarla *TV* permite soportar monitores, LED, tótems o proyectores. ONLINE/OFFLINE se calcula desde `ultimaConexion`.

- `id: Long`
- `codigo: String` único, ej. `GRN-A8K91X`
- `nombre: String`, ej. `TV Entrada`
- `ultimaConexion: LocalDateTime`
- `activo: Boolean`
- `sucursal: Sucursal`
- `playlist: Playlist`

### Contenido

Guardar metadatos en BD; el archivo físico va al storage.

- `id: Long`
- `nombre: String`
- `tipo: TipoContenido`
- `rutaArchivo: String`
- `nombreArchivo: String`
- `tamanoBytes: Long`
- `duracionSegundos: Integer/Long`
- `fechaSubida: LocalDateTime`
- `activo: Boolean`
- `cliente: Cliente`

### Playlist

La `version` cambia cuando se modifica la playlist y ayuda al Android a detectar cambios.

- `id: Long`
- `nombre: String`
- `descripcion: String`
- `activo: Boolean`
- `fechaCreacion: LocalDateTime`
- `version: Long`
- `cliente: Cliente`

### PlaylistContenido

Permite ordenar y definir cuánto tiempo mostrar imágenes. Es mejor que un `ManyToMany` simple.

- `id: Long`
- `playlist: Playlist`
- `contenido: Contenido`
- `orden: Integer`
- `duracionVisualizacion: Integer`

### Usuario

Se agrega seguridad después de validar el flujo principal.

- `id: Long`
- `nombre: String`
- `email: String`
- `passwordHash: String`
- `rol: Rol`
- `activo: Boolean`
- `cliente: Cliente` — nullable para `SUPER_ADMIN`; obligatorio para roles de cliente

---

## 4. Enums recomendados

```java
public enum TipoContenido {
    VIDEO,
    IMAGEN
}

public enum Rol {
    SUPER_ADMIN,
    ADMIN_CLIENTE,
    VISUALIZADOR_CLIENTE
}
```

`SUPER_ADMIN` administra clientes y usuarios. `ADMIN_CLIENTE` administra los
recursos de su empresa. `VISUALIZADOR_CLIENTE` solo puede consultar sucursales,
pantallas y la vista previa del contenido asignado; no puede modificar datos.

No es necesario guardar `EstadoPantalla` como enum en el MVP. Si el Android manda heartbeat cada 20 segundos, se puede considerar ONLINE si `ultimaConexion` está dentro del último minuto; caso contrario, OFFLINE.

---

## 5. Relaciones entre entidades

```
CLIENTE
  |-- 1:N --> SUCURSAL
  |               |
  |               +-- 1:N --> PANTALLA -- N:1 --> PLAYLIST
  |
  |-- 1:N --> CONTENIDO <--- N:1 --- PLAYLIST_CONTENIDO --- N:1 ---> PLAYLIST
  |
  +-- 1:N --> USUARIO
```

**Regla útil:** para el MVP una Pantalla tiene una Playlist activa. Una Playlist puede ser compartida por muchas pantallas. Una playlist de un solo archivo también es válida, así no existen dos sistemas distintos de asignación.

---

## 6. Flujos funcionales principales

### 6.1 Alta e instalación de una pantalla

1. Instalar Grenlus Player en un Android TV Box homologado.
2. La app genera o recibe un código único, por ejemplo `GRN-X92ABC`.
3. En el panel web aparece el dispositivo o se ingresa ese código.
4. El administrador lo asocia a Cliente → Sucursal → nombre de pantalla.
5. Desde ese momento el backend sabe qué dispositivo físico corresponde a esa pantalla.

### 6.2 Cargar contenido desde la oficina

1. Usuario selecciona "Subir contenido" en React.
2. React envía metadata + archivo al backend.
3. Spring valida tipo/tamaño y guarda el archivo en storage.
4. PostgreSQL guarda un registro `Contenido` con ruta y metadata.

### 6.3 Crear una playlist

1. Usuario crea Playlist.
2. Agrega videos/imágenes y define el orden.
3. Para imágenes define duración de visualización.
4. Al guardar, se incrementa `Playlist.version`.

### 6.4 Asignar contenido a una pantalla

```
Oficina
  -> abre Sucursal Lomas
  -> elige TV Entrada
  -> asigna Playlist "Promos Septiembre"
  -> Spring guarda pantalla.playlist_id
  -> Android consulta config
  -> detecta versión nueva
  -> descarga archivos faltantes
  -> cuando terminó, cambia a la nueva playlist
```

### 6.5 Heartbeat / online-offline

```
Android cada 20s
  POST /api/player/{codigo}/heartbeat

Spring
  ultimaConexion = ahora

React
  si ultimaConexion < 60s -> ONLINE
  si no -> OFFLINE
```

### 6.6 Funcionamiento sin Internet

1. Android siempre reproduce desde almacenamiento local.
2. Si se corta Internet, sigue con la última playlist válida.
3. Cuando vuelve la conexión, consulta config.
4. Si la versión cambió, sincroniza archivos y luego cambia de playlist.

---

## 7. Estructura del backend Spring Boot

```
com.grenlus.signage
|-- controller/
|-- service/
|-- repository/
|-- entity/
|-- dto/
|-- enums/
|-- exception/
|-- config/
+-- SignageApplication.java
```

| Capa | Qué hace |
| --- | --- |
| entity | Representa datos persistidos y relaciones JPA. |
| repository | Acceso a PostgreSQL mediante `JpaRepository`. |
| service | Reglas de negocio. Es donde debe vivir la lógica. |
| controller | Expone endpoints HTTP y delega al service. |
| dto | Define qué recibe/envía cada caso de uso sin exponer entidades JPA. |
| config | CORS, storage, seguridad y otras configuraciones. |

---

## 8. API inicial recomendada

**Administración — consumida por React**

```
/api/clientes
/api/sucursales
/api/pantallas
/api/contenidos
/api/playlists
```

**Player — consumida por Android**

```
GET  /api/player/{codigo}/config
POST /api/player/{codigo}/heartbeat
```

Separar `/api/player` del resto permite aplicar autenticación y políticas específicas más adelante.

---

## 9. Contrato clave: configuración que recibe Android

```json
{
  "pantalla": "GRN-X92ABC",
  "playlistId": 3,
  "playlistVersion": 5,
  "contenidos": [
    {
      "id": 12,
      "tipo": "VIDEO",
      "url": "/media/promo1.mp4"
    },
    {
      "id": 21,
      "tipo": "IMAGEN",
      "url": "/media/menu.jpg",
      "duracion": 10
    }
  ]
}
```

El player compara `playlistVersion` con su versión local. Si son iguales no hace nada. Si son distintas, descarga lo que falta y **cambia recién cuando la nueva playlist está completa**.

---

## 10. Qué debe hacer el Android Player

| Módulo / tarea | Responsabilidad |
| --- | --- |
| Identidad | Guardar código único del dispositivo. |
| API client | Consultar config y enviar heartbeat. |
| Downloader | Descargar archivos sin duplicarlos. |
| Cache local | Mantener contenidos necesarios para reproducir offline. |
| Player | Reproducir video con Media3 y mostrar imágenes por tiempo definido. |
| Sync manager | Comparar versiones y activar playlist solo cuando esté completa. |
| Boot/Kiosk — después | Autoarranque y modo kiosco cuando el MVP ya funcione. |

---

## 11. Pantallas mínimas del frontend React

| Pantalla web | Objetivo |
| --- | --- |
| Dashboard | Resumen de clientes, sucursales, pantallas online/offline. |
| Clientes | CRUD básico. |
| Sucursales | Ver/crear sucursales de un cliente. |
| Pantallas | Ver estado, playlist asignada, última conexión y vista previa; también permite administrar pantallas según el rol. |
| Contenidos | Subir y listar imágenes/videos. |
| Playlists | Crear, ordenar contenidos y asignar a pantallas. |
| Detalle de sucursal | Controlar rápidamente todas las pantallas de ese local. |

---

## 12. Roadmap por etapas

| Etapa | Resultado esperado |
| --- | --- |
| ETAPA 0 — Base | Proyecto Spring + PostgreSQL + React levantando. Repositorio Git y ramas definidas. |
| ETAPA 1 — Modelo | Cliente, Sucursal y Pantalla + repositories + prueba de tablas. |
| ETAPA 2 — Media | Contenido + upload de archivos + endpoint para servir/descargar. |
| ETAPA 3 — Playlist | Playlist + PlaylistContenido + versionado. |
| ETAPA 4 — API Player | GET config + heartbeat. Probarlo con Postman/curl. |
| ETAPA 5 — Android mínimo | Consultar config, descargar un MP4 y reproducirlo en loop. |
| ETAPA 6 — Sincronización | Múltiples contenidos, imágenes, cache local y cambio por version. |
| ETAPA 7 — Control web | React administra contenidos, playlists y asignación a pantallas. |
| ETAPA 8 — Prueba remota | Notebook en una red y Android en otra red. Cambiar contenido remotamente. |
| ETAPA 9 — Robustez | Offline, recuperación de errores, logs, límites de storage. |
| ETAPA 10 — Seguridad | JWT, roles SUPER_ADMIN / ADMIN_CLIENTE / VISUALIZADOR_CLIENTE, tokens de dispositivo. |
| ETAPA 11 — Producto | Autoarranque, kiosco, despliegue cloud, backups y monitoreo. |

---

## 13. Cómo dividirse el trabajo entre dos

La división debe permitir que ambos entiendan el producto. Una buena primera división es backend/modelo por un lado y player/frontend por el otro, pero intercambiando revisiones y contratos.

| Persona A | Persona B | Punto de integración |
| --- | --- | --- |
| Modelo JPA + PostgreSQL | Investigar y crear Android Player base | Definir código único de pantalla |
| Contenido + storage | React: layout + pantallas iniciales | Contrato DTO de Contenido |
| Playlist + PlaylistContenido | Android: API client + Media3 | `GET /player/{codigo}/config` |
| Heartbeat + lógica online | React: detalle de sucursal/pantalla | POST heartbeat y visualización estado |
| API asignación playlist | Android: sync/cache local | Cambio de playlist de extremo a extremo |

**Regla de equipo:** antes de implementar un endpoint, acuerden request/response. Antes de tocar una entidad compartida, avisen y hagan commit pequeño.

---

## 14. Organización de Git y ramas

```
main            -> versión estable
develop         -> integración
feature/cliente
feature/player-config
feature/android-player
feature/playlists
feature/frontend-pantallas
```

- Un feature por rama.
- Commits chicos y descriptivos.
- Pull request o revisión del otro antes de integrar cambios grandes.
- No trabajar ambos sobre la misma clase sin coordinar.
- No subir passwords, `.env`, `application.properties` con secretos ni archivos grandes de videos al repositorio.

---

## 15. Primera meta funcional: Definition of Done

No consideren que el MVP funciona por tener CRUDs. El primer hito real se completa cuando puedan demostrar esto:

- [ ] Backend desplegado o accesible desde Internet.
- [ ] Android conectado desde una red diferente a la notebook.
- [ ] Pantalla registrada con un código único.
- [ ] Desde React se cambia la playlist de esa pantalla.
- [ ] Android detecta la versión nueva.
- [ ] Descarga el contenido.
- [ ] Reproduce video e imagen correctamente.
- [ ] Si se corta Internet, sigue reproduciendo.
- [ ] Al volver Internet, sincroniza los cambios.
- [ ] React muestra última conexión / online-offline.

---

## 16. Tareas concretas para empezar ahora

Estas son las tareas que haría en orden. **No avancen a la siguiente etapa si la anterior no funciona.**

| # | Tarea | Quién | Listo cuando... |
| --- | --- | --- | --- |
| 1 | Crear DB `signage` y configurar `application.properties` | Backend | Spring levanta sin errores y conecta PostgreSQL. |
| 2 | Crear Cliente, Sucursal, Pantalla | Backend | Hibernate crea tablas y FKs correctas. |
| 3 | Crear repositories de esas entidades | Backend | Se puede guardar/consultar desde prueba o service. |
| 4 | Crear proyecto Android Player | Player | La app abre en un Android/emulador. |
| 5 | Definir código único `GRN-XXXX` | Ambos | Backend y Player usan el mismo formato/contrato. |
| 6 | Crear Contenido + upload | Backend | Se sube un MP4 y se puede descargar por URL. |
| 7 | Crear Playlist + PlaylistContenido | Backend | Se arma una lista ordenada y versionada. |
| 8 | Crear `GET player/config` | Backend | Postman devuelve JSON correcto para una pantalla. |
| 9 | Consumir config desde Android | Player | Android muestra/loguea config real del backend. |
| 10 | Reproducir un MP4 | Player | Media3 reproduce archivo remoto descargado/local. |
| 11 | Crear heartbeat | Ambos | `ultimaConexion` cambia automáticamente. |
| 12 | React detalle de pantalla | Frontend | Se ve playlist y estado. |
| 13 | Asignar playlist desde React | Ambos | Cambio persiste en backend. |
| 14 | Sync Android por version | Player | Cambio en oficina modifica TV sin tocarla. |
| 15 | Probar en dos redes | Ambos | Funciona fuera de la LAN local. |

---

## 17. Qué NO construir todavía

- WebSocket si polling simple funciona para el MVP.
- Captura en vivo de la TV.
- Control remoto completo del Android.
- Autoactualización de APK.
- Programación horaria compleja.
- Grupos avanzados de pantallas.
- Facturación / Mercado Pago.
- Analítica detallada de reproducciones.
- Multi-región cloud.
- Modo kiosco antes de que el player básico sea estable.

Estas funciones son válidas, pero agregarlas antes de probar el circuito completo aumenta mucho el riesgo de quedarse con un sistema grande que todavía no resuelve el problema principal.

---

## 18. Funciones para V2 / V3

| Función | Para qué sirve |
| --- | --- |
| Programación | Mostrar promociones según día y horario. |
| GrupoPantallas | Cambiar muchas pantallas juntas. |
| ComandoRemoto | Reiniciar player, refrescar, pausar temporalmente. |
| Screenshot | Comprobar visualmente qué está mostrando la pantalla. |
| Logs reproducción | Auditar qué se reprodujo y cuándo. |
| Storage cloud | Escalar archivos y descargas. |
| Kiosco / autoarranque | Eliminar dependencia de empleados. |
| Actualización remota | Mantener Player actualizado sin visitar sucursal. |
| Alertas | Avisar si una pantalla lleva X minutos offline. |

---

## 19. Checklist de sesión de desarrollo

- [ ] Elegir UNA tarea concreta.
- [ ] Definir qué entrada recibe y qué salida debe producir.
- [ ] Escribir o revisar el modelo/DTO antes del controller.
- [ ] Probar el endpoint aislado.
- [ ] Integrar con el otro componente.
- [ ] Probar caso feliz y al menos un error.
- [ ] Commit pequeño.
- [ ] Actualizar lista de tareas.

---

## 20. Regla de arquitectura que deben recordar

> **La oficina define el ESTADO DESEADO. El backend lo guarda. Cada Android converge hacia ese estado cuando puede conectarse.**

Ejemplo: la oficina asigna Playlist 12 a `GRN-0004`. Si esa TV está offline, la orden no se pierde porque no era una orden instantánea: `playlist_id=12` queda persistido. Cuando el Android vuelve, consulta la configuración y sincroniza. Esta decisión hace al sistema mucho más robusto.

```
OFICINA
   | asigna Playlist 12
   v
BACKEND: pantalla.playlist = 12
   ^
   | consulta cuando tiene Internet
ANDROID
   | descarga + cachea
   v
TV reproduce Playlist 12
```

**Próximo paso recomendado:** implementar ETAPA 1 completa (Cliente, Sucursal, Pantalla y repositories) y, en paralelo, crear el proyecto Android Player vacío para empezar a validar comunicación con el backend.
