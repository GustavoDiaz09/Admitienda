import { CheckCircle, Info, Warning, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { useToastStore, type TipoAlerta } from '../../lib/toast'

const estilos: Record<TipoAlerta, string> = {
  exito: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
}

const iconos = {
  exito: CheckCircle,
  error: Warning,
  info: Info,
}

/** Pila de notificaciones transitorias (esquina inferior derecha). */
export function Toasts() {
  const avisos = useToastStore((estado) => estado.avisos)
  const descartar = useToastStore((estado) => estado.descartar)

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-6 sm:w-96">
      {avisos.map((aviso) => {
        const Icono = iconos[aviso.tipo]
        return (
          <div
            key={aviso.id}
            role="status"
            className={cn(
              'pointer-events-auto animate-aparecer flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-card',
              estilos[aviso.tipo],
            )}
          >
            <Icono size={20} weight="fill" className="mt-0.5 shrink-0" />
            <p className="flex-1 text-sm font-medium leading-snug">{aviso.mensaje}</p>
            <button
              type="button"
              onClick={() => descartar(aviso.id)}
              aria-label="Descartar aviso"
              className="rounded-full p-1 opacity-60 transition-opacity hover:opacity-100"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        )
      })}
    </div>
  )
}