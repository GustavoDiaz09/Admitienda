import type { ComponentType, ReactNode } from 'react'
import { useState } from 'react'
import { Warning } from '@phosphor-icons/react'
import { Button } from './Button'
import { Modal } from './Modal'

interface Props {
  /** Texto visible del botón que abre la confirmación. */
  accion: ReactNode
  titulo: string
  mensaje: ReactNode
  confirmar: () => void | Promise<void>
  variante?: 'peligro' | 'secundario'
  tamanio?: 'sm' | 'md'
  icono?: ComponentType<{ size?: number; weight?: 'bold' | 'regular' | 'fill' }>
  ariaLabel?: string
  disabled?: boolean
  className?: string
}

/**
 * Botón que abre un diálogo de confirmación antes de ejecutar una acción
 * destructiva o no reversible (eliminar producto / movimiento / usuario).
 */
export function ConfirmButton({
  accion,
  titulo,
  mensaje,
  confirmar,
  variante = 'peligro',
  tamanio = 'sm',
  icono: Icono,
  ariaLabel,
  disabled,
  className,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)

  const ejecutar = async () => {
    setCargando(true)
    try {
      await confirmar()
      setAbierto(false)
    } finally {
      setCargando(false)
    }
  }

  return (
    <>
      <Button
        variante={variante}
        tamanio={tamanio}
        icono={Icono}
        disabled={disabled}
        aria-label={ariaLabel ?? titulo}
        className={className}
        onClick={() => setAbierto(true)}
      >
        {accion}
      </Button>
      <Modal abierto={abierto} titulo={titulo} onCerrar={() => setAbierto(false)}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
            <Warning size={20} weight="fill" />
          </span>
          <div className="pt-0.5">
            <p className="text-sm leading-relaxed text-zinc-600">{mensaje}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variante="fantasma" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button variante="peligro" cargando={cargando} onClick={ejecutar}>
            Confirmar
          </Button>
        </div>
      </Modal>
    </>
  )
}