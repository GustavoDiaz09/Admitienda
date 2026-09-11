# Manual Técnico — AdmiTienda (Web / PWA)

## 1. Visión general

Aplicación web **offline-first** que migra el sistema de escritorio
`SistemaTienda` (Java 17 + Swing + SQLite) a React + TypeScript. Mantiene la
misma arquitectura por capas del original (vista → controller → dao →
persistencia) y las mismas reglas de negocio, pero cambia la persistencia:

| Original (Java)        | Web (PWA)                          |
|------------------------|------------------------------------|
| SQLite (JDBC)          | IndexedDB vía **Dexie** (local)    |
| hoja única local       | IndexedDB local + **Supabase** (sync) |
| contraseñas PBKDF2+salt  | Web Crypto, formato versionado      |
| Swing / `Tema.java`    | React + Tailwind v4 + componentes `src/components/ui` |

## 2. Stack

- **React 19** + react-router-dom 7 + Zustand 5 (stores de sesión, sync y
  toasts).
- **Vite 8** con `@vitejs/plugin-react`, `@tailwindcss/vite` (Tailwind CSS v4,
  tokens en `src/index.css` con `@theme`) y `vite-plugin-pwa`
  (`registerType: 'autoUpdate'`, `generateSW`, precache de `dist/`).
- **Dexie 4** (base local `sistematienda`), @phosphor-icons/react,
  @fontsource-variable/outfit. Sin dependencia de Supabase en el cliente: el
  transporte a la nube es `fetch` directo a la Edge Function `sync`.
- **Vitest 5** + **fake-indexeddb** + jsdom (`vitest.config.ts`).
- **oxlint** (`npm run lint`).

## 3. Arquitectura por capas

```
src/views/*                    (páginas y lógica de UI, render)
   │
   ├─ src/components/*         (ui/, layout/, auth/ — no tocan BD)
   │
   ▼
src/controller/*               (Usuario/Producto/Movimiento/Session)
   │   Devuelven Resultado(exito, mensaje). Errores esperados ≠ excepciones.
   ▼
src/dao/*                      (Dexie por entidad; filtran eliminado)
   ▼
src/lib/db.ts                  (Dexie: usuarios, productos, movimientos,
                                solicitudes_admin, outbox, metadatos)
```

- Los DAO escriben la fila **y** encolan la sincronización mediante
  `src/lib/mutaciones.ts` (persistir + `encolar` a la outbox), con
  `actualizadoEn` renovado y `version` incrementado. Las operaciones aceptan un
  `ContextoEscritura` opcional (`ahora`, `dispositivo`, `silencioso`) para
  componer varias escrituras dentro de una sola transacción Dexie: cuando el
  contexto es `silencioso`, el disparo de `sincronizarAhora()` se aplaza hasta
  el commit del conjunto. `DeudaController.registrarAbono` y `eliminarDeuda`
  ejecutan sus escrituras (pago, deuda, movimiento + encolados) dentro de
  `db.transaction(...)`: o se aplican todas atómicamente, o ninguna.
- `inicializarApp()` (en `App.tsx` en el arranque) abre la BD, deja listo el
  identificador de dispositivo y reanuda la sincronización. **No se crean
  cuentas ni datos por defecto**: el primer usuario registrado asume el rol de
  administrador (ver `registrarUsuario` en `src/controller/UsuarioController.ts`)

## 4. Modelo de datos

Cada tabla local comparte campos base (camelCase, de sincronización):

| Campo          | Tipo    | Uso                                     |
|----------------|---------|-----------------------------------------|
| `id`           | string  | UUID generado en el cliente (PK)        |
| `creadoEn`     | number  | epoch ms de creación                    |
| `actualizadoEn`| number  | epoch ms del último cambio (LWW)        |
| `version`      | number  | se incrementa en cada cambio (empates)  |
| `eliminado`    | boolean | borrado lógico; se filtra en JS, **no es índice** |
| `dispositivo`  | string  | tag del cliente que hace el cambio      |

Tablas: `usuarios`, `productos`, `movimientos`, `solicitudes_admin` (+ `outbox`
y `metadatos`).

Reglas de negocio de integridad:

- **`usuarios.nombre_usuario` es único** dentro del dispositivo (índice Dexie
  `&nombre_usuario`, esquema v3) y en la nube (`create unique index
  uq_usuarios_nombre on usuarios (lower(nombre_usuario))`). La Edge Function
  devuelve **409** cuando un `subir` choca con el índice (~ código 23505) para
  distinguir el conflicto de un error transitorio.
- **Importes en formato es-CO:** `src/lib/validaciones.ts` (`normalizarMonto`)
  interpreta el punto como separador de miles y la coma como decimal
  ("2.500" → 2500, "1.250,50" → 1250.5, "1234,56" → 1234.56). Lo usan
  `montoPositivo` y `aDouble`.
- **Fechas en hora de Colombia (UTC-5, sin DST):** `src/lib/fecha.ts` guarda y
  lee las fechas como "yyyy-MM-dd HH:mm" colombiana mediante aritmética UTC
  (`OFFSET_COLOMBIA_MS`), de modo que un movimiento se lee igual desde
  cualquier zona horaria; los resúmenes semanal/mensual de
  `MovimientoController` se centran en el calendario de Colombia.

## 5. Sincronización (Supabase)

- **Outbox:** clave `${tabla}:${registroId}`; `MAX_INTENTOS = 5`. El motor
  (`src/sync/syncEngine.ts`) reacciona a `online`/`offline` y corre en intervalo
  de 15 s: `sincronizarAhora()` sube los pendientes y actualiza el store Zustand
  (`enLinea`, `pendientes`, `sincronizando`, `bajando`, `ultimaSync`, `error`).
- **Bidireccional automático:** además del push del outbox, el motor baja cambios
  de la nube con `sincronizarBajando()` en el arranque, al volver a línea y como
  máximo cada 30 s (constante `INTERVALO_PULL_AUTO_MS`, módulo `ultimoPullAuto`).
  Solo opera si hay llave configurada (`hayLlaveConfigurada()`), hay conexión y
  no hay ya un push (`sincronizando`) ni un pull (`bajando`) en curso, para no
  solaparse. Los errores de segundo plano solo marcan `enLinea = false`.
- **Pull incremental con cursor:** `traerDatosDelServidor({ completo? })`
  (`src/sync/pull.ts`) baja solo lo modificado después del cursor
  (`metadatos.ultima_descarga`, helpers `obtenerCursorDescarga()` /
  `guardarCursorDescarga()`); sin cursor previo (o con `{ completo: true }`,
  que usa la acción manual "Descargar todo" del ADMIN) baja la base completa.
  El cursor se avanza a `Date.now()` **al inicio** de cada descarga, no al final:
  cualquier fila tocada durante la bajada queda `> cursor` y se repite en el
  siguiente ciclo (la fusión LWW es idempotente). El cursor vive en `metadatos`,
  así que se borra junto con la base (nueva restauración).
- **Fusión LWW:** `aplicarRemotos()` fusiona las filas bajadas en la base local:
  en cada registro gana la versión más reciente (`actualizadoEn`, en empate
  `version`). Si gana la nube, la copia local se reemplaza **y se cancela** la
  edición local pendiente de ese registro en la outbox; si gana el dispositivo,
  su copia y su entrada de cola se conservan y se re-intentan al final. No se
  descartan datos locales. Los choques con la restricción local de unicidad se
  omiten y se cuentan como `conflictos`. `respaldarTodoEnServidor()` sube la
  base completa (primer poblamiento de una tienda).
- **Mapeo de nombres:** en Dexie los campos base son camelCase y los de negocio
  con guion bajo (`nombre_producto`) igual que las columnas de Supabase. En
  `pull.ts`, `filaExtra()` convierte los campos base al subir y `filaLocal()`
  los recompone al bajar.
- **Transporte (Edge Function `sync`, `supabase/functions/sync/`):** la app
  no usa la clave anon. `src/lib/remoto.ts` llama a
  `…/functions/v1/sync?accion=ping|descargar|subir` con la cabecera
  `x-llave-sincronizacion`; la función valida la llave contra
  `llaves_sincronizacion` (PBKDF2-HMAC-SHA-256, 210.000 iteraciones) y recién
  entonces lee/escribe con service_role. La llave de cada dispositivo vive solo
  en su `localStorage` (`src/lib/llave.ts`); se configura una vez en el panel
  de sincronización. `llamar()` admite además query params
  (`descargarRemoto(desde?)` pasa `desde` únicamente si `> 0`) y lanza
  `ErrorRemoto` con `estado` HTTP y `definitivo` (los 4xx no se reintentan).
- **Validación de carga en la nube:** la acción `subir` valida cada lote antes
  de tocar la BD — numerosos campos por tabla (allow-list `ESQUEMAS` en la
  Edge Function), tipos/rangos/enumerados espejo del cliente (`esMonto` exige
  hasta 2 decimales), formato de fechas `yyyy-MM-dd HH:mm`, UIDs válidos,
  `version >= 1` y límites por petición (`MAX_FILAS`, `MAX_TAMANO_CUERPO`).
  Un lote inválido responde **400** con el id de la fila y el campo; uno que
  excede límites responde **413**; una violación de unicidad sigue en **409**.
  Nada basura puede entrar a la fuente compartida que cada dispositivo fusiona.
- **Esquema remoto:** `supabase/migracion.sql` crea las 7 tablas espejo
  (PK `id uuid`, blanco del `onConflict`) y `llaves_sincronizacion`. El acceso
  de `anon`/`authenticated` está revocado y RLS activado sin políticas abiertas,
  de modo que aun filtrándose la clave pública del proyecto nadie puede leer
  los datos.
- **Integridad del outbox:** `src/sync/outbox.ts` clavea la cola por
  `(tabla, id)`; al re-modificar un registro se reemplaza la versión pendiente
  y se reinician los intentos. Al subir, `eliminarItemSiSigueIgual()` borra
  la entrada **solo si sigue conteniendo la versión que se subió** (si cambió
  durante la subida, la versión nueva queda pendiente y no se pierde). Las
  entradas que agotan `MAX_INTENTOS=5` se dejan en espera y se retoman tras
  `TIEMPO_REINTENTO_MS` (60 s).
- **Rechazos definitivos no se reintentan:** si `subirRemoto` responde un
  `ErrorRemoto` **4xx** (400/409/413/422), la entrada sale de la cola con
  `descartarItem()` (solo si sigue conteniendo la versión rechazada) y el
  motivo queda visible en el `error` del store de sincronización; el registro
  local se conserva. Los 5xx, los fallos de red y los 401 (`ErrorRemoto` con
  `definitivo=false`) se comportan como antes (intento, espera y reintento).
- **Descarga paginada e incremental en la nube:** la acción `descargar` de la
  Edge Function itera con `.order('id').range(...)` en lotes de 1000 para no
  truncar tablas grandes; si viene el query param `desde` (epoch ms finito y
  `> 0`) aplica `.gt('actualizado_en', desde)` para devolver solo lo cambiado
  desde el cursor del dispositivo. Sin `desde` devuelve la tabla completa
  (restauración). El botón "Descargar todo" (panel de sync y Resúmenes) pide
  confirmación y fusiona la nube con el dispositivo sin descartar datos locales.
- Fin de descarga manual: evento `datos:sincronizados` en `window` para que las
  vistas recarguen.

## 6. Autenticación

- **100 % local**: `hash = pbkdf2$<iteraciones>$hex(<PBKDF2-HMAC-SHA-256>)` de
  `contraseña + salt` con Web Crypto (`src/lib/password.ts`, 210.000
  iteraciones). Los hashes legacy SHA-256 (formato Java) se siguen verificando
  y se **re-hashan con PBKDF2 la primera vez que el usuario inicia sesión**
  (migración progresiva).
- Sesión en store Zustand + sessionStorage (`sistematienda.sesion`), restaurada
  con `restaurarSesion()` al arrancar. `RequiereSesion`/`SoloAdministrador`/
  `SoloConCuenta` protegen las rutas; invitado navega sin sesión a productos.
- Roles: `TIPO_ADMIN` (edita todo), `TIPO_REGISTRADO` (solo lectura en
  resumen/productos/movimientos/deudas) e `INVITADO` (solo consulta
  productos). Guardas en
  `src/App.tsx`: `SoloAdministrador` en usuarios/alertas;
  `SoloConCuenta` en movimientos/resumenes/deudas; los botones de modificación
  se ocultan
  según `esAdmin` en las vistas. Solicitudes de permiso en `solicitudes_admin`
  (pendiente/aprobada/rechazada).
- **Decisión global del administrador (AL-05):** el primer admin no se decide
  por dispositivo. Al registrarse, `UsuarioController` consulta la Edge
  Function (`accion=hay_admin`) y solo promueve si la nube confirma que NO hay
  ningún administrador. Si la nube ya tiene uno, o no se puede confirmar (sin
  llave / sin conexión), el usuario queda `REGISTRADO` y su solicitud queda
  pendiente de aprobación. (`verificarAdminRemoto` se inyecta en los tests.)
- Campo de seguridad: cada usuario registra **palabras clave** (`indicio_usuario`)
  que se usan en el flujo de recuperación (`RecuperarContrasena`). En el
  registro y edición de usuario se muestra la advertencia de que deben ser
  personales y no evidentes.

## 7. Routing, layout y diseño

- Rutas en `src/App.tsx`: públicas `/ingreso`, `/registro`, `/recuperar`;
  protegidas con `SoloAdministrador` (movimientos, usuarios, alertas y resumen
  solo para admin en versiones previas) o `SoloConCuenta` (resumenes y deudas,
  visibles en lectura para cualquier usuario con cuenta); `productos` abierta a
  todos (lectura sin sesión). Index redirige por rol, con invitados a
  `productos`. Views cargadas con `React.lazy` + `Suspense` (code-splitting por
  ruta).
- `AppShell`: sidebar oscuro (`zinc-950`), drawer móvil, header con
  `SyncIndicator`, chip de usuario, acción *Solicitar permiso* (REGISTRADO) y
  cerrar sesión.
- Sistema de diseño en `src/index.css`: acento **esmeralda**, neutros **zinc**,
  tarjetas `rounded-2xl`, botones pill, foco visible, animaciones solo
  transform/opacity con `prefers-reduced-motion`; componentes en
  `src/components/ui/`.

## 8. Calidad y verificación

- `npm.cmd run lint` (oxlint), `npx.cmd tsc -b`, `npm.cmd test` (Vitest +
  fake-indexeddb), `npm.cmd run build`.
- Smoke tests en `src/test/inicializacion.test.ts`: arranque con la BD vacía
  (sin cuentas ni datos por defecto), promoción del primer usuario registrado a
  administrador, registros que quedan como REGISTRADO cuando ya hay admin,
  seguridad de promoción (solicitud pendiente, no segundo admin directo), alta
  de ingreso con efecto en resúmenes y rechazo de datos inválidos.
  `src/test/deudas.test.ts` prueba el CRM de deudas sobre BD aislada.
  `src/test/validaciones.test.ts` y `fechas.test.ts` cubren `normalizarMonto` y
  el round-trip UTC de Colombia; `resumen.test.ts` valida la semana en hora de
  Colombia; `pull.test.ts` cubre la fusión LWW (nube más reciente, local más
  reciente, empate y tumbas) contra la outbox y el cursor de descarga
  incremental (`obtenerCursorDescarga`/`guardarCursorDescarga`).
  `outbox.test.ts` cubre también `descartarItem` (rechazo definitivo) y
  `remoto.test.ts` la clasificación de `ErrorRemoto` (4xx definitivo vs
  transitorio).
- PWA: `vite-plugin-pwa` genera `sw.js` (offline) y `manifest.webmanifest`
  (íconos SVG en `public/`, theme `#18181b`).

## 9. Pendientes conocidos

- Exportación CSV/PDF y gráfico SVG en Resúmenes son ideas futuras sin
  implementar.
- La migración remota (`supabase/migracion.sql`) se aplica con una sesión del
  MCP de Supabase o pegando el archivo en el SQL Editor del proyecto.
- La Edge Function `sync` se despliega con el MCP de Supabase
  (`supabase_deploy_edge_function`, `verify_jwt=false`; el código del repo es
  la fuente de verdad) y se prueba vía HTTP: `ping` con llave válida debe
  responder 200, con llave inválida/ausente 401, y el acceso REST directo con
  la clave anon debe quedar en 401.