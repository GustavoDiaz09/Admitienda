# AdmiTienda (Web — PWA offline-first)

> **Documentación interna del proyecto.** Este README muestra rutas y
> credenciales locales de ejemplo; la documentación completa de trabajo
> (AGENTS.md) queda solo en local y NO se sube a GitHub.

Aplicación web para administrar una tienda: usuarios, productos, ingresos y
egresos, resúmenes financieros y alertas de inventario bajo. Es una versión web
de la app de escritorio `SistemaTienda` (Java + Swing), con lo novedoso de que
**funciona sin conexión** y sincroniza entre dispositivos.

## Características

- **Offline-first:** todos los datos viven en el dispositivo (IndexedDB); la
  app se abre y opera sin internet.
- **PWA instalable:** se instala desde el navegador y abre en modo standalone.
- **Sincronización con la nube:** los cambios se suben automáticamente cuando
  hay conexión; un administrador puede descargar/sobrescribir desde un
  dispositivo nuevo (botones en el panel de sincronización).
- **CRM de deudas:** ventas fiadas por cliente, abonos parciales y un
  historial por cliente con sus deudas y pagos realizados (cada abono se
  registra como ingreso en la caja).
- **Roles:** INVITADO (solo ver productos), REGISTRADO (ver productos +
  solicitar permiso de admin), ADMINISTRADOR (acceso completo) y SUPERADMIN
  (cuenta única del dueño, por encima del admin: da/quita el rol de
  administrador directamente y puede eliminar administradores incluso al
  último; la suya jamás se elimina).
- **Autenticación local** (por dispositivo) compatible con la app de escritorio.

## Requisitos

- Node.js (v24 usado en el desarrollo) y npm.

## Comandos

```bat
npm.cmd install        :: instala dependencias
npm.cmd run dev        :: servidor de desarrollo (HMR)
npm.cmd run build      :: compila a dist\ (tsc + vite + service worker)
npm.cmd run lint       :: oxlint
npm.cmd test           :: pruebas Vitest (fake-indexeddb)
```

> En Windows usar `npm.cmd`, porque PowerShell bloquea `npm.ps1`.

## Credenciales

No existen credenciales ni datos por defecto: cada cuenta se crea desde
*Crear cuenta*. La **primera persona registrada** asume automáticamente el rol
de administrador; las siguientes quedan como usuarios registrados (solo lectura
hasta que un administrador apruebe su permiso). El **rol SUPERADMIN** no se
registra: es la cuenta única del dueño, promovida una sola vez en la nube
(migración `superadmin_unico_y_promocion_dueno`) y distribuida a todos los
dispositivos por sincronización.

**Inicio de sesión híbrido:** un dispositivo nuevo puede entrar con su usuario y
contraseña **sin tener aún la llave** (la aplicación pregunta primero a la nube;
si responde, siembra la cuenta localmente y guarda la llave del dueño cuando
viene; si la nube está caída, cae al inicio de sesión local). La **llave de
sincronización** solo se necesita para que los datos de la tienda viajen entre
dispositivos; solo el SUPERADMIN puede generar llaves nuevas para otros
dispositivos.

## Roles

- **Invitado:** puede ver la tabla de productos (solo lectura), sin iniciar sesión.
- **Registrado:** ve en solo lectura **Resúmenes**, **Productos** y **Deudas y
  pagos** (no puede crear, editar ni eliminar); puede solicitar el permiso de
  administrador.
- **Administrador:** acceso completo (productos, movimientos, resúmenes,
  gestión de usuarios, deudas y alertas de inventario).
- **Superadministrador:** cuenta única del dueño (nombre fijo reservado). Queda
  por encima del administrador: da y quita el rol de administrador directamente
  (sin solicitudes) y puede eliminar administradores incluso al último. Su
  propia cuenta es inamovible: no se elimina, no se renombra y no cambia de rol.
  Se otorga una sola vez en la nube y llega a los dispositivos por
  sincronización.

## Estructura del proyecto

```
sistematienda-web/
├── src/
│   ├── model/           Tipos de dominio (Usuario, Producto, Movimiento…)
│   ├── dao/             Persistencia Dexie/IndexedDB por entidad
│   ├── controller/      Lógica de negocio (port de los controladores Java)
│   ├── lib/             db, bootstrap, contraseñas (PBKDF2), llave, remoto, utilidades
│   ├── sync/            Outbox, motor de sincronización, pull/respaldo
│   ├── components/      ui/ (Button, Campo, Tabla…), layout/, auth/
│   ├── views/           Páginas (Login, Productos, Resumenes, Alertas…)
│   ├── App.tsx          Rutas, guards y arranque de la app
│   └── test/            Pruebas Vitest
├── supabase/
│   ├── migracion.sql    Esquema remoto (7 tablas espejo + llaves + RLS)
│   └── functions/sync/  Edge Function: puerta única a la nube (una por llave)
├── public/              favicon, iconos PWA (SVG + PNG)
└── vite.config.ts       Vite + Tailwind v4 + vite-plugin-pwa
```

## Sincronización

- La **base local es la fuente de la verdad**; Supabase se usa solo para
  intercambiar datos, **a través de la Edge Function `sync`** que exige la
  llave de sincronización de cada dispositivo (configurable en el panel de
  sincronización; se guarda solo en el propio dispositivo). El inicio de sesión
  en un dispositivo nuevo verifica primero en la nube y solo usa la llave para
  sincronizar los datos.
- Los cambios se registran en una cola (outbox) y un motor los sube en cuanto
  hay conexión (eventos del navegador + reintento cada 60 s, hasta 5 intentos);
  los datos nuevos que otros dispositivos subieron se bajan solos al arrancar,
  al volver a estar en línea y aproximadamente cada 30 s.
- Conflicto entre versiones: gana la modificación más reciente ("último write
  gana").
- El administrador ve el panel de sincronización (estado, pendientes y última
  sincronización) con tres acciones: **sincronizar** (sube pendientes),
  **subir todo** (respalda la base completa a la nube; se usa la primera vez en
  cada tienda) y **bajar todo** (trae la nube al dispositivo).

## Documentación

- `AGENTS.md` — memoria de contexto del proyecto (convenciones, decisiones).
- `docs/ManualUsuario.md` — cómo usar cada función.
- `docs/ManualTecnico.md` — arquitectura, sincronización y decisiones técnicas.

## Configuración de la nube (administrador)

1. Crea un proyecto en Supabase y copia la URL a `.env`
   (`VITE_SUPABASE_URL`). No se usa la clave anon: los datos solo se tocan con
   la llave de sincronización por dispositivo.
2. Ejecuta `supabase/migracion.sql` en el SQL Editor (crea las 7 tablas
   espejo, `llaves_sincronizacion` y revoca el acceso de anon/authenticated).
3. Despliega la Edge Function `sync` (código en `supabase/functions/sync/`) y
   deja `verify_jwt` desactivado: la autenticación la hace la propia llave.
4. Crea la primera llave insertando su hash PBKDF2 en `llaves_sincronizacion`
   (la llave en claro se entrega solo al administrador). En cada dispositivo,
   el propietario la escribe en el panel de sincronización. Lo más cómodo:
   con la BD de llaves vacía la acción `crear_llave` arranca por sí sola (la
   primera llave queda como maestra del dueño) y, cuando el SUPERADMIN inicia
   sesión en un dispositivo sin llave, esta se **auto-enrola** sola.
5. Abre la app en un segundo dispositivo con la misma URL: quien entre con su
   cuenta (login híbrido) llega así; un administrador puede usar **bajar todo**
   para traer los datos.