import type { ComponentType, ReactNode } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { Spinner } from './Base'

export type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro'

const variantes: Record<VarianteBoton, string> = {
  primario:
    'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-300',
  secundario:
    'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 active:bg-zinc-100 disabled:text-zinc-400',
  fantasma:
    'text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 active:bg-zinc-200 disabled:text-zinc-400',
  peligro: 'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 disabled:bg-red-300',
}

const tamanios = {
  sm: 'h-8 px-3.5 text-[13px]',
  md: 'h-10 px-5 text-sm',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton
  tamanio?: 'sm' | 'md'
  cargando?: boolean
  icono?: ComponentType<{ size?: number; weight?: 'bold' | 'regular' | 'fill' }>
  children?: ReactNode
}

/** Botón del sistema (pill, un solo radio para controles de acción). */
export function Button({
  variante = 'primario',
  tamanio = 'md',
  cargando = false,
  icono: Icono,
  className,
  children,
  disabled,
  type = 'button',
  ...resto
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={cn(
        'focus-ring inline-flex select-none items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors duration-150 active:scale-[0.98] disabled:cursor-not-allowed',
        variantes[variante],
        tamanios[tamanio],
        className,
      )}
      {...resto}
    >
      {cargando ? <Spinner /> : Icono ? <Icono size={16} weight="bold" /> : null}
      {children}
    </button>
  )
}