# AGENTS.md — Memoria del proyecto: AdmiTienda (Web / PWA)

> Marca: **AdmiTienda** (antes «Sistema Tienda»). El nombre debe usarse
> renombrado en la UI y el manifest; `sistematienda` solo sobrevive en la BD
> Dexie (id del indexado local) y en la ruta de la app de escritorio.

Archivo de contexto para futuras sesiones de trabajo con IA sobre este proyecto.

## ⚙️ PARÁMETRO PRINCIPAL — qué hacer cuando el usuario diga «lee memory»

Seguir SIEMPRE este flujo al empezar a trabajar, y en especial en la **primera
sesión después de reiniciar el asistente**:

1. Leer este `AGENTS.md` y revisar la checklist de pendientes de la sección
   «Estado actual».
2. Si en esta sesión está cargado el **MCP de Supabase** (proyecto remoto
   `sdhtlbtpwzbkbrqekzkb`) y la migración sigue como pendiente:
   **aplicar `supabase/migracion.sql`** ejecutándola por la herramienta de SQL
   del MCP (`mcp__supabase__query`). Si un lote completo es rechazado en bloque,
   ejecutar las sentencias una a una.
3. **Verificar** que existan las 6 tablas en `public` con:
   `select tablename from pg_tables where schemaname = 'public';`
   → esperado: `usuarios`, `productos`, `movimientos`, `solicitudes_admin`,
   `deudas`, `pagos_deuda`.
4. **PROHIBIDO**: ejecutar `drop`, borrar tablas/PKs, eliminar políticas RLS ni
   tocar datos que el usuario viva usando. La PK `id` es el blanco del upsert:
   nunca se elimina.
5. No subir ni descargar datos reales desde el asistente: eso se hace desde la
   app (login `admin`, panel de sincronización → «Subir todo»), solo con tu
   consentimiento explícito.
6. Cerrar con un resumen breve del estado y el siguiente paso propuesto.

## Qué es

Versión **web (PWA offline-first)** del sistema de gestión de tienda que
existe como app de escritorio en `C:\Users\gusta\Downloads\proyectos serios\
SistemaTienda` (Java 17 + Swing + SQLite). Respeta los mismos roles, reglas de
negocio y credenciales que el original, con **IndexedDB como fuente de datos
local** y sincronización hacia Supabase (push automático, pull manual solo del
administrador).

> IMPORTANTE: NO es la app "FERREACCOUN/ferretería". El usuario pidió la app de
> la **tienda** genérica. No usar branding de ferretería.

## Stack y construcción

- React + TypeScript + Vite 8, Tailwind CSS v4 (vía plugin `@tailwindcss/vite`),
  **Dexie** (IndexedDB), **Zustand** (estado), react-router-dom 7,
  `@supabase/supabase-js`, `vite-plugin-pwa`, `@phosphor-icons/react` y fuente
  autohospedada `@fontsource-variable/outfit`.
- Windows: PowerShell bloquea `npm.ps1` → usar **`npm.cmd`** siempre. Node v24.
- Servidor/build/test/lint:
  - `npm.cmd run dev` — desarrollo (HMR).
  - `npm.cmd run build` — `tsc -b && vite build` (genera `dist/` + service worker).
  - `npm.cmd run lint` — oxlint.
  - `npm.cmd test` — Vitest + fake-indexeddb (jsdom).
- tsconfig (NO saltarse): `erasableSyntaxOnly` (sin enums), `noUnusedLocals` /
  `noUnusedParameters`, `verbatimModuleSyntax` (imports de tipos con
  `import type`). `React.*` como UMD global NO compila en módulos (TS2686):
  importar `FormEvent`, `ReactNode`, etc. desde `react`.

## Arquitectura de datos y sincronización (decisiones del usuario)

- La **base local (IndexedDB, Dexie, BD `sistematienda`) es la fuente de la
  verdad**; la app funciona 100 % sin conexión. Supabase es solo sincronización.
- **Sincronización unidireccional** en producción: los cambios locales se suben
  (push) solos; la descarga desde la nube (pull de todo) es **solo del admin**,
  manual, para un dispositivo nuevo.
- Conflictos: **"último write gana"** (LWW) comparando `actualizadoEn` (ms) y,
  en empate, `version`.
- Campos comunes de cada registro: `id` (UUID generado en el cliente),
  `creadoEn`, `actualizadoEn` (ms epoch), `version` (entero, se incrementa en
  cada cambio), `eliminado` (borrado lógico), `dispositivo` (tag del cliente).
  `eliminado` **no es índice** en Dexie: se filtra en JS. Los campos de negocio
  usan nombres con guion bajo (estilo del modelo Java): `nombre_producto`,
  `tipo_usuario`, `contrasena_hash`, etc.
- Cola de sincronización (**outbox**): clave `${tabla}:${registroId}`,
  `MAX_INTENTOS = 5` (syncEngine.ts:7). El motor de sync corre online/offline
  (eventos del navegador) con intervalo de 15 s y sube los pendientes. Tras
  subir/descargar todo, se emite el evento `datos:sincronizados` en `window`
  para que las vistas activas se recarguen.

## Autenticación y roles

- **Autenticación 100 % local** (proceso por dispositivo), compatible con los
  hashes del Java: `hash = SHA-256(contraseña + salt)` en hex, Web Crypto
  (`src/lib/password.ts`). Las credenciales se sincronizan como datos normales.
- Roles (constantes en `src/model/types.ts`): `TIPO_ADMIN` (todo),
  `TIPO_REGISTRADO` (solo ver productos + solicitar permiso de admin),
  `INVITADO` (solo lectura de productos). Un usuario registrado puede solicitar
  permiso; el administrador lo aprueba.
- Admin inicial sembrado en el primer arranque: **`admin` / `admin123`**,
  indicio `Tienda`. Si se registra alguien antes de que exista un admin, ese
  primer usuario asume el rol ADMIN.

## Estructura

- `src/model/` — tipos de dominio (`Usuario`, `Producto`, `Movimiento`,
  `SolicitudAdmin`, `RegistroBase`, `TablaSync`) y constantes.
- `src/dao/` — persistencia Dexie por entidad (`*Dao`); toman/cambian filas
  completas y se ocupan del filtrado de `eliminado`.
- `src/controller/` — port de los controladores Java (`UsuarioController`,
  `ProductoController`, `MovimientoController`, `SessionController` con store
  Zustand + `restaurarSesion()`, `Resultado`). **Devuelven `Resultado(exito,
  mensaje)`, nunca lanzan excepciones por errores esperados.** Vistas nunca
  tocan la BD directo.
- `src/lib/` — `db.ts` (Dexie), `inicializacion.ts` (bootstrap), `mutaciones.ts`
  (persistir + encolar en outbox), `password.ts`, `supabase.ts` (cliente null si
  faltan env), `fecha.ts`, `validaciones.ts` + utilidades de UI (cn, formato,
  toast, conteoAlertas, estadoProducto, syncAcciones).
- `src/seed/` — `DatosEjemplo.ts` (admin inicial + 35 productos de ejemplo con
  3 de stock bajo + movimientos de la semana) y `constantes.ts`.
- `src/sync/` — `outbox.ts`, `syncEngine.ts` (motor + store), `pull.ts`
  (subir/descargar todo, mapeo camelCase↔snake_case).
- `src/components/` — `ui/` (Button, Campo, Modal, Tabla, Card, Insignia,
  Toasts, ConfirmButton, Base), `layout/` (AppShell, SyncIndicator), `auth/`.
- `src/views/` — Login, Registro, RecuperarContrasena, Productos, Movimientos,
  Deudas (CRM de ventas fiadas), Resumenes, Usuarios, Alertas. Rutas en
  `src/App.tsx` (lazy + Suspense, `RequiereSesion` y `SoloAdministrador`,
  bootstrap `inicializarApp() → restaurarSesion() → iniciarMotorDeSync()`).
- `public/` — `favicon.svg`, `icons.svg` (PWA).
- `supabase/migracion.sql` — crea las 6 tablas espejo + permisos RLS.

## Supabase

- La clave anon está en `.env` (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`). **No commitear `.env`.**
- Las 6 tablas remotas replican el esquema local (mismo nombre, columnas
  snake_case, PK `id uuid`). La PK es la referencia `onConflict` del upsert:
  **no eliminar las PKs ni las políticas RLS** de `supabase/migracion.sql`.
- El clon de SQL se ejecuta con el MCP de Supabase (proyecto
  `sdhtlbtpwzbkbrqekzkb`) o pegando el archivo en el SQL Editor.

## Convenciones de código (mantener SIEMPRE)

- Comentarios/doc de funciones: en español, `/** ... */`. Identificadores en
  español (pero imports/router en inglés cuando son librerías).
- Atributos de negocio: guiones bajos como en el modelo Java. Bases de sync
  (sync de entidades): camelCase (`creadoEn`, `actualizadoEn`).
- UI en español, sistema de diseño en `src/index.css`: acento esmeralda +
  neutros zinc, tarjetas redondeadas, botones pill, fuente Outfit. Usar los
  componentes de `src/components/ui/`, no re-inventar. Iconos Phosphor.
- No usar `any` en lo posible; respetar `import type`. No añadir dependencias
  sin necesidad (verificar que no exista una utilidad propia).

## Cómo verificar cambios

- `npm.cmd run lint` && `npx.cmd tsc -b` && `npm.cmd test` && `npm.cmd run build`.
- Tests: `src/test/*`, Vitest + fake-indexeddb. OJO: el seed siembra productos
  y movimientos de ejemplo, así que las aserciones sobre totales deben ser
  **relativas** (capturar el valor anterior y comparar el delta).
- La UI se verifica a mano con `npm.cmd run dev` (login `admin`/`admin123`).

## Estado actual

- Fases 0–6 completas (scaffolding, auth+BD, controladores, sync, vistas con
  rediseño moderno, PWA, tests de humo y documentación). Se añadió el **CRM de
  deudas** (v7): ventas fiadas por cliente con abonos parciales; cada abono
  registra un ingreso en caja y cada deuda/pago se sincroniza con Supabase
  (tablas `deudas` y `pagos_deuda`). `tsc`, lint y build limpios.
- El CRM de deudas se **probó a mano** con `npm.cmd run dev`
  (admin/admin123) el 09/09/2026 y quedó funcionando correctamente.
- **Docs locales:** `README.md` y `AGENTS.md` son documentación interna del
  proyecto (rutas locales, credenciales de ejemplo). NO se suben a GitHub; el
  repositorio remoto solo contiene el código. `git push` se hace SOLO con el
  consentimiento explícito del usuario.
- Checklist de pendientes (ver «PARÁMETRO PRINCIPAL»):
  - [x] Aplicar `supabase/migracion.sql` en el proyecto remoto vía MCP
        (hecho el 09/09/2026; las 6 tablas + RLS están en `public`).
  - [ ] (Opcional, con tu visto bueno) Poblar la nube desde la app con «Subir
        todo» para que otro dispositivo pueda hacer pull.
- Ideas futuras: exportación CSV/PDF, gráfico SVG en Resúmenes, verificación
  visual de cada pantalla en un dispositivo real.
- Iconos PWA: SVG (`icons.svg`) + PNG generados con
  `@vite-pwa/assets-generator` (`public/pwa-*.png`, `maskable-icon`, 
  `apple-touch-icon-180x180.png`). Regenerar con:
  `npx.cmd pwa-assets-generator --preset minimal --manifest false public/icons.svg`.