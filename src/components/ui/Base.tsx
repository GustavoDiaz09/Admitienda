import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** Indicador de carga tipo anillo (solo transform + rotate). */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent',
        className,
      )}
    />
  )
}

/** Bloque esqueleto para estados de carga. */
export function Esqueleto({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-zinc-200/80', className)} />
}

/** Encabezado de sección pequeño (título + descripción opcional). */
export function EncabezadoSeccion({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string
  descripcion?: string
  acciones?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">{titulo}</h1>
        {descripcion ? <p className="mt-0.5 text-sm text-zinc-500">{descripcion}</p> : null}
      </div>
      {acciones ? <div className="flex flex-wrap items-center gap-2">{acciones}</div> : null}
    </div>
  )
}

/** Estado vacío: icono, título, descripción y acción opcional. */
export function EstadoVacio({
  icono,
  titulo,
  descripcion,
  accion,
}: {
  icono: ReactNode
  titulo: string
  descripcion: string
  accion?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-400">
        {icono}
      </span>
      <h2 className="text-base font-semibold text-zinc-900">{titulo}</h2>
      <p className="max-w-sm text-sm text-zinc-500">{descripcion}</p>
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  )
}