import type { ComponentType } from 'react'
import { cn } from '../../lib/cn'

export type TonoInsignia = 'esmeralda' | 'ambar' | 'rojo' | 'gris' | 'azul' | 'zinc'

const tonos: Record<TonoInsignia, string> = {
  esmeralda: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  ambar: 'border-amber-200 bg-amber-50 text-amber-700',
  rojo: 'border-red-200 bg-red-50 text-red-700',
  azul: 'border-sky-200 bg-sky-50 text-sky-700',
  gris: 'border-zinc-200 bg-zinc-100 text-zinc-600',
  zinc: 'border-zinc-200 bg-zinc-50 text-zinc-700',
}

interface Props {
  tono?: TonoInsignia
  children: React.ReactNode
  icono?: ComponentType<{ size?: number; weight?: 'bold' | 'regular' | 'fill' }>
  className?: string
}

/** Chip compacto para estados y roles (pill, radio consistente). */
export function Insignia({ tono = 'gris', children, icono: Icono, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        tonos[tono],
        className,
      )}
    >
      {Icono ? <Icono size={12} weight="bold" /> : null}
      {children}
    </span>
  )
}