-- Migración de Sistema Tienda Web para Supabase (SQL Editor)
-- Crea las 4 tablas espejo usadas por la sincronización offline-first.
-- Ejecutar en el SQL Editor del proyecto sdhtlbtpwzbkbrqekzkb.

-- ============================================================
-- usuarios
-- ============================================================
create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre_usuario text not null,
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
-- Índices para las búsquedas más frecuentes
-- ============================================================
create index if not exists idx_productos_nombre on public.productos (nombre_producto);
create index if not exists idx_movimientos_fecha on public.movimientos (fecha);
create index if not exists idx_usuarios_nombre on public.usuarios (nombre_usuario);
create index if not exists idx_solicitudes_usuario on public.solicitudes_admin (usuario_id);

-- ============================================================
-- Seguridad: la autenticación es local (cada dispositivo), por lo que
-- la app accede a estas tablas con la clave anon. RLS se habilita con
-- políticas que permiten leer/escribir a cualquier cliente autenticado
-- o anónimo de este proyecto (sync sin servidor propio).
-- NOTA: si prefieres restringir, ajusta las políticas a tu caso.
-- ============================================================
alter table public.usuarios enable row level security;
alter table public.productos enable row level security;
alter table public.movimientos enable row level security;
alter table public.solicitudes_admin enable row level security;

create policy "usuarios_lectura" on public.usuarios for select to anon using (true);
create policy "usuarios_escritura" on public.usuarios for insert to anon with check (true);
create policy "usuarios_actualizacion" on public.usuarios for update to anon using (true) with check (true);

create policy "productos_lectura" on public.productos for select to anon using (true);
create policy "productos_escritura" on public.productos for insert to anon with check (true);
create policy "productos_actualizacion" on public.productos for update to anon using (true) with check (true);

create policy "movimientos_lectura" on public.movimientos for select to anon using (true);
create policy "movimientos_escritura" on public.movimientos for insert to anon with check (true);
create policy "movimientos_actualizacion" on public.movimientos for update to anon using (true) with check (true);

create policy "solicitudes_lectura" on public.solicitudes_admin for select to anon using (true);
create policy "solicitudes_escritura" on public.solicitudes_admin for insert to anon with check (true);
create policy "solicitudes_actualizacion" on public.solicitudes_admin for update to anon using (true) with check (true);

-- Nota: la clave primaria de cada tabla (id uuid) es la referencia de
-- conflicto del upsert; NO eliminar estas restricciones.