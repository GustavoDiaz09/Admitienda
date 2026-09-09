import { useEffect, type ReactNode } from 'react'
import { X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'

interface Props {
  abierto: boolean
  titulo: string
  descripcion?: string
  onCerrar: () => void
  children: ReactNode
  ancho?: 'md' | 'lg'
}

const anchos = {
  md: 'max-w-md',
  lg: 'max-w-lg',
}

/** Diálogo modal accesible (esc cierra, foco de cierre en apertura). */
export function Modal({ abierto, titulo, descripcion, onCerrar, children, ancho = 'md' }: Props) {
  useEffect(() => {
    if (!abierto) return
    const manejarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', manejarTecla)
    return () => document.removeEventListener('keydown', manejarTecla)
  }, [abierto, onCerrar])

  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) onCerrar()
      }}
    >
      <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]" aria-hidden="true" />
      <div
        className={cn(
          'relative z-10 w-full rounded-2xl border border-zinc-200 bg-white shadow-pop',
          anchos[ancho],
        )}
      >
        <div className="animate-aparecer">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-zinc-900">{titulo}</h2>
              {descripcion ? <p className="mt-0.5 text-sm text-zinc-500">{descripcion}</p> : null}
            </div>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="focus-ring rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  )
}