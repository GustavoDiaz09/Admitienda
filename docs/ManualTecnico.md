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
| contraseñas SHA-256+salt | Web Crypto, mismo formato         |
| Swing / `Tema.java`    | React + Tailwind v4 + componentes `src/components/ui` |

## 2. Stack

- **React 19** + react-router-dom 7 + Zustand 5 (stores de sesión, sync y
  toasts).
- **Vite 8** con `@vitejs/plugin-react`, `@tailwindcss/vite` (Tailwind CSS v4,
  tokens en `src/index.css` con `@theme`) y `vite-plugin-pwa`
  (`registerType: 'autoUpdate'`, `generateSW`, precache de `dist/`).
- **Dexie 4** (base local `sistematienda`), **@supabase/supabase-js**,
  @phosphor-icons/react, @fontsource-variable/outfit.
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
  `actualizadoEn` renovado y `version` incrementado.
- `inicializarApp()` (en `App.tsx` en el arranque) abre la BD y siembra solo si
  está vacía: admin `admin`/`admin123` (indicio `Tienda`) y 35 productos de
  ejemplo (3 con stock bajo) más los movimientos ya transcurridos de la semana
  en curso.

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

## 5. Sincronización (Supabase)

- **Unidireccional por defecto:** los cambios locales suben solos; el pull
  total es manual y exclusivo del ADMIN.
- **Outbox:** clave `${tabla}:${registroId}`; `MAX_INTENTOS = 5`. El motor
  (`src/sync/syncEngine.ts`) reacciona a `online`/`offline` y corre en intervalo
  de 15 s: `sincronizarAhora()` sube los pendientes y actualiza el store Zustand
  (`enLinea`, `pendientes`, `sincronizando`, `ultimaSync`, `error`).
- **Pull (admin):** `traerDatosDelServidor()` descarga todo y hace *merge*
  local con LWW (`actualizadoEn`, en empate `version`). `respaldarTodoEnServidor()`
  sube la base completa (primer poblamiento de una tienda).
- **Mapeo de nombres:** en Dexie los campos base son camelCase y los de negocio
  con guion bajo (`nombre_producto`) igual que las columnas de Supabase. En
  `pull.ts`, `filaExtra()` convierte los campos base al subir y `filaLocal()`
  los recompone al bajar.
- **Esquema remoto:** `supabase/migracion.sql` crea las 4 tablas espejo con PK
  `id uuid` (blanco del `onConflict`) y políticas RLS abiertas a la clave anon
  (la autenticación es local; no se usa auth de Supabase).
- Fin de descarga manual: evento `datos:sincronizados` en `window` para que las
  vistas recarguen.

## 6. Autenticación

- **100 % local**: `hash = hex(SHA-256(contraseña + salt))` con Web Crypto
  (`src/lib/password.ts`); formato idéntico al `PasswordUtils` de Java, así un
  hash migrado de la BD del escritorio funciona igual.
- Sesión en store Zustand + sessionStorage (`sistematienda.sesion`), restaurada
  con `restaurarSesion()` al arrancar. `RequiereSesion`/`SoloAdministrador`
  protegen las rutas; invitado navega sin sesión a productos.
- Roles: `TIPO_ADMIN`, `TIPO_REGISTRADO`, `INVITADO`. Solicitudes de permiso en
  `solicitudes_admin` (pendiente/aprobada/rechazada).

## 7. Routing, layout y diseño

- Rutas en `src/App.tsx`: públicas `/ingreso`, `/registro`, `/recuperar`;
  protegidas `productos`, `movimientos`, `resumenes`, `usuarios`, `alertas`,
  con index que redirige por rol. Views cargadas con `React.lazy` + `Suspense`
  (code-splitting por ruta).
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
- Smoke tests en `src/test/inicializacion.test.ts`: arranque+seed, login
  `admin`/`admin123`, alta de ingreso con efecto en resúmenes, rechazo de datos
  inválidos. Aserciones **relativas** porque el seed sembra datos.
- PWA: `vite-plugin-pwa` genera `sw.js` (offline) y `manifest.webmanifest`
  (íconos SVG en `public/`, theme `#18181b`).

## 9. Pendientes conocidos

- Exportación CSV/PDF y gráfico SVG en Resúmenes son ideas futuras sin
  implementar.
- La migración remota (`supabase/migracion.sql`) se aplica con una sesión del
  MCP de Supabase o pegando el archivo en el SQL Editor del proyecto.