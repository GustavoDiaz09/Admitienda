-- Migración de Sistema Tienda Web para Supabase (SQL Editor)
-- Crea las 7 tablas espejo usadas por la sincronización offline-first y la
-- tabla de llaves de sincronización. Ejecutar en el SQL Editor del proyecto.
--
-- ACCESO: la app NO usa la clave anon para los datos. Toda lectura/escritura
-- pasa por la Edge Function `sync` (supabase/functions/sync), que usa
-- service_role (omite RLS) y exige una llave de sincronización válida
-- (PBKDF2, ver tabla `llaves_sincronizacion`). Por eso las políticas de RLS
-- abiertas se eliminan y se revoca el acceso de anon/authenticated.

-- ============================================================
-- usuarios
-- ============================================================
create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre_usuario text not null unique,
  tipo_usuario text not null,
  contrasena_hash text not null,
  salt text not null,
  indicio_usuario text not null,
  fecha_registro text not null,
  creado_en bigint not null default 0,
  actualizado_en bigint not null default 0,
  version integer not null default 1,
  eliminado boolean not null default false,
  dispositivo text not null default ''
);

-- ============================================================
-- productos
-- ============================================================
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  tipo_producto text,
  nombre_producto text not null,
  precio_neto double precision not null default 0,
  ganancia double precision not null default 0,
  precio_venta double precision not null default 0,
  cantidad_stock integer not null default 0,
  stock_minimo integer not null default 0,
  creado_en bigint not null default 0,
  actualizado_en bigint not null default 0,
  version integer not null default 1,
  eliminado boolean not null default false,
  dispositivo text not null default ''
);

-- ============================================================
-- movimientos
-- ============================================================
create table if not exists public.movimientos (
  id uuid primary key default gen_random_uuid(),
  tipo_movimiento text not null,
  monto double precision not null default 0,
  descripcion text,
  fecha text not null,
  creado_en bigint not null default 0,
  actualizado_en bigint not null default 0,
  version integer not null default 1,
  eliminado boolean not null default false,
  dispositivo text not null default ''
);

-- ============================================================
-- solicitudes_admin
-- ============================================================
create table if not exists public.solicitudes_admin (
  id uuid primary key default gen_random_uuid(),
  usuario_id text not null,
  estado text not null,
  fecha_solicitud text not null,
  creado_en bigint not null default 0,
  actualizado_en bigint not null default 0,
  version integer not null default 1,
  eliminado boolean not null default false,
  dispositivo text not null default ''
);

-- ============================================================
-- deudas (CRM: ventas fiadas por cliente)
-- ============================================================
create table if not exists public.deudas (
  id uuid primary key default gen_random_uuid(),
  cliente_nombre text not null,
  monto double precision not null default 0,
  saldo double precision not null default 0,
  descripcion text,
  fecha text not null,
  deudor_id uuid not null,
  creado_en bigint not null default 0,
  actualizado_en bigint not null default 0,
  version integer not null default 1,
  eliminado boolean not null default false,
  dispositivo text not null default ''
);

-- ============================================================
-- pagos_deuda (abonos aplicados a las deudas)
-- ============================================================
create table if not exists public.pagos_deuda (
  id uuid primary key default gen_random_uuid(),
  deuda_id text not null,
  monto double precision not null default 0,
  descripcion text,
  fecha text not null,
  creado_en bigint not null default 0,
  actualizado_en bigint not null default 0,
  version integer not null default 1,
  eliminado boolean not null default false,
  dispositivo text not null default ''
);

-- ============================================================
-- deudores (maestro de clientes fiados: un deudor único por nombre,
-- insensible a mayúsculas/espacios vía nombre_normalizado)
-- ============================================================
create table if not exists public.deudores (
  id uuid primary key default gen_random_uuid(),
  nombre_deudor text not null,
  nombre_normalizado text not null,
  creado_en bigint not null default 0,
  actualizado_en bigint not null default 0,
  version integer not null default 1,
  eliminado boolean not null default false,
  dispositivo text not null default ''
);

-- `deudor_id` en deudas NO está en el create si la tabla ya existía de una
-- versión previa del script; se añade, se hace backfill y se fija NOT NULL.
alter table public.deudas add column if not exists deudor_id uuid;

-- Backfill idempotente: si quedaron deudas huérfanas (base migrada desde el
-- esquema de 6 tablas), se crea un deudor por nombre normalizado y se enlaza.
insert into public.deudores (id, nombre_deudor, nombre_normalizado, creado_en, actualizado_en, version, eliminado, dispositivo)
select gen_random_uuid(),
  hu.nombre_deudor,
  hu.nombre_normalizado,
  hu.creado_en,
  hu.actualizado_en,
  1,
  false,
  ''
from (
  select distinct on (lower(cliente_nombre))
    cliente_nombre as nombre_deudor,
    lower(cliente_nombre) as nombre_normalizado,
    creado_en,
    actualizado_en
  from public.deudas
  where cliente_nombre is not null and cliente_nombre <> ''
    and deudor_id is null
  order by lower(cliente_nombre), creado_en, id
) hu;

update public.deudas d
set deudor_id = deu.id
from public.deudores deu
where d.deudor_id is null
  and lower(d.cliente_nombre) = deu.nombre_normalizado;

alter table public.deudas alter column deudor_id set not null;

-- ============================================================
-- llaves_sincronizacion (llave única por dispositivo que valida la Edge
-- Function `sync`). `llave_hash` = pbkdf2$<iter>$<hex> de (llave + salt);
-- la llave en claro no se guarda en ningún lado.
-- ============================================================
create table if not exists public.llaves_sincronizacion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Dispositivo',
  llave_salt text not null,
  llave_hash text not null unique,
  fecha_creacion date not null default current_date
);

-- ============================================================
-- Índices para las búsquedas más frecuentes
-- ============================================================
create index if not exists idx_productos_nombre on public.productos (nombre_producto);
create index if not exists idx_movimientos_fecha on public.movimientos (fecha);
-- Nombre de usuario único sin distinción de mayúsculas/minúsculas
-- (regla de negocio: una cuenta usable por ese nombre en toda la nube).
-- Si la tabla se creó antes con data duplicada, esta instrucción falla y
-- hay que limpiar los duplicados primero.
create unique index if not exists uq_usuarios_nombre on public.usuarios (lower(nombre_usuario));
-- El índice simple por nombre pasa a ser redundante; se mantiene solo como
-- índice no único de respaldo en caso de que la migración se interrumpa.
create index if not exists idx_solicitudes_usuario on public.solicitudes_admin (usuario_id);
create index if not exists idx_deudas_cliente on public.deudas (cliente_nombre);
create index if not exists idx_deudas_deudor on public.deudas (deudor_id);
create index if not exists idx_pagos_deuda on public.pagos_deuda (deuda_id);
-- Deudor único por nombre sin distinción de mayúsculas (regla de negocio:
-- "no varias al mismo nombre"). Si la tabla se creó antes con duplicados,
-- esta instrucción falla y hay que limpiarlos primero.
create unique index if not exists uq_deudores_nombre on public.deudores (lower(nombre_deudor));
create index if not exists idx_deudores_normalizado on public.deudores (nombre_normalizado);

-- ============================================================
-- Seguridad
-- ============================================================
alter table public.usuarios enable row level security;
alter table public.productos enable row level security;
alter table public.movimientos enable row level security;
alter table public.solicitudes_admin enable row level security;
alter table public.deudores enable row level security;
alter table public.deudas enable row level security;
alter table public.pagos_deuda enable row level security;
alter table public.llaves_sincronizacion enable row level security;

-- Sin políticas para anon/authenticated en ninguna tabla: el único acceso es
-- por service_role desde la Edge Function `sync` (que valida la llave).
-- Si existieran políticas abiertas previas, eliminarlas:
drop policy if exists "usuarios_lectura" on public.usuarios;
drop policy if exists "usuarios_escritura" on public.usuarios;
drop policy if exists "usuarios_actualizacion" on public.usuarios;
drop policy if exists "productos_lectura" on public.productos;
drop policy if exists "productos_escritura" on public.productos;
drop policy if exists "productos_actualizacion" on public.productos;
drop policy if exists "movimientos_lectura" on public.movimientos;
drop policy if exists "movimientos_escritura" on public.movimientos;
drop policy if exists "movimientos_actualizacion" on public.movimientos;
drop policy if exists "solicitudes_lectura" on public.solicitudes_admin;
drop policy if exists "solicitudes_escritura" on public.solicitudes_admin;
drop policy if exists "solicitudes_actualizacion" on public.solicitudes_admin;
drop policy if exists "deudores_lectura" on public.deudores;
drop policy if exists "deudores_escritura" on public.deudores;
drop policy if exists "deudores_actualizacion" on public.deudores;
drop policy if exists "deudas_lectura" on public.deudas;
drop policy if exists "deudas_escritura" on public.deudas;
drop policy if exists "deudas_actualizacion" on public.deudas;
drop policy if exists "pagos_lectura" on public.pagos_deuda;
drop policy if exists "pagos_escritura" on public.pagos_deuda;
drop policy if exists "pagos_actualizacion" on public.pagos_deuda;

-- La clave anon/authenticated no tiene permisos sobre los datos.
revoke all on public.usuarios, public.productos, public.movimientos,
  public.solicitudes_admin, public.deudores, public.deudas, public.pagos_deuda,
  public.llaves_sincronizacion from anon, authenticated;

-- Nota: la clave primaria de cada tabla (id uuid) es la referencia de
-- conflicto del upsert; NO eliminar estas restricciones.