import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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

/** Diálogo modal accesible (esc cierra, foco de cierre en apertura, trampa de Tab). */
export function Modal({ abierto, titulo, descripcion, onCerrar, children, ancho = 'md' }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const contenedor = contenedorRef.current
    const elementoPrevio = document.activeElement as HTMLElement | null
    contenedor?.focus()

    const manejarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        onCerrar()
        return
      }
      if (evento.key !== 'Tab' || !contenedor) return
      const enfocables = contenedor.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (enfocables.length === 0) return
      const primero = enfocables[0]
      const ultimo = enfocables[enfocables.length - 1]
      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault()
        primero.focus()
      }
    }
    document.addEventListener('keydown', manejarTecla)
    return () => {
      document.removeEventListener('keydown', manejarTecla)
      elementoPrevio?.focus()
    }
  }, [abierto, onCerrar])

  if (!abierto) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className="fixed inset-0 bg-zinc-950/40 backdrop-blur-[2px]"
        aria-hidden="true"
        onMouseDown={onCerrar}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          ref={contenedorRef}
          tabIndex={-1}
          className={cn(
            'relative z-10 w-full rounded-2xl border border-zinc-200 bg-white shadow-pop focus:outline-none',
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
    </div>,
    document.body,
  )
}