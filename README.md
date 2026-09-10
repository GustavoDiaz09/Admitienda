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
  solicitar permiso de admin), ADMINISTRADOR (acceso completo).
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
hasta que un administrador apruebe su permiso).

## Roles

- **Invitado:** puede ver la tabla de productos (solo lectura), sin iniciar sesión.
- **Registrado:** ve en solo lectura **Resúmenes**, **Productos** y **Deudas y
  pagos** (no puede crear, editar ni eliminar); puede solicitar el permiso de
  administrador.
- **Administrador:** acceso completo (productos, movimientos, resúmenes,
  gestión de usuarios, deudas y alertas de inventario).

## Estructura del proyecto

```
sistematienda-web/
├── src/
│   ├── model/           Tipos de dominio (Usuario, Producto, Movimiento…)
│   ├── dao/             Persistencia Dexie/IndexedDB por entidad
│   ├── controller/      Lógica de negocio (port de los controladores Java)
│   ├── lib/             db, bootstrap, contraseñas, supabase, utilidades
│   ├── sync/            Outbox, motor de sincronización, pull/respaldo
│   ├── components/      ui/ (Button, Campo, Tabla…), layout/, auth/
│   ├── views/           Páginas (Login, Productos, Resumenes, Alertas…)
│   ├── App.tsx          Rutas, guards y arranque de la app
│   └── test/            Pruebas Vitest
├── supabase/
│   └── migracion.sql    Esquema remoto (6 tablas espejo + permisos RLS)
├── public/              favicon, iconos PWA (SVG + PNG)
└── vite.config.ts       Vite + Tailwind v4 + vite-plugin-pwa
```

## Sincronización

- La **base local es la fuente de la verdad**; Supabase se usa solo para
  intercambiar datos.
- Los cambios se registran en una cola (outbox) y un motor los sube en cuanto
  hay conexión (eventos del navegador + intervalo de 15 s); hasta 5 intentos.
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

1. Crea un proyecto en Supabase y copia la URL y la clave anon a `.env`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
2. Ejecuta `supabase/migracion.sql` en el SQL Editor (crea las 6 tablas y sus
   políticas de seguridad). La autenticación es local, así que las políticas
   permiten leer/escribir con la clave anon del proyecto.
3. Abre la app en un segundo dispositivo con la misma config y usa **bajar
   todo** (admin) para traer los datos.