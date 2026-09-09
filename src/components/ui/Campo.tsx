import type { ComponentType, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

/** Campo de formulario: etiqueta arriba, control, ayuda y error debajo. */
export function Campo({
  etiqueta,
  htmlFor,
  error,
  ayuda,
  children,
}: {
  etiqueta: string
  htmlFor?: string
  error?: string | null
  ayuda?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-zinc-700">
        {etiqueta}
      </label>
      {children}
      {ayuda && !error ? <p className="text-xs leading-relaxed text-zinc-500">{ayuda}</p> : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface EntradaProps extends InputHTMLAttributes<HTMLInputElement> {
  icono?: ComponentType<{ size?: number; weight?: 'bold' | 'regular' | 'fill' }>
}

/** Entrada de texto estándar del sistema (radio 12px). */
export function Entrada({ className, icono: Icono, ...resto }: EntradaProps) {
  return (
    <div className="relative">
      {Icono ? (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
          <Icono size={16} weight="regular" />
        </span>
      ) : null}
      <input className={cn('campo-base', Icono ? 'pl-9' : '', className)} {...resto} />
    </div>
  )
}

/** Lista desplegable estándar del sistema. */
export function Selector({
  className,
  children,
  ...resto
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('campo-base appearance-none pr-9', className)} {...resto}>
      {children}
    </select>
  )
}

/** Cuadro de error global de una operación (Resultado.error). */
export function AlertaDeError({ mensaje }: { mensaje: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
    >
      {mensaje}
    </div>
  )
}