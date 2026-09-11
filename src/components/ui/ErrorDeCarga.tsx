import { Warning } from '@phosphor-icons/react'
import { Button } from './Button'

/** Error de carga de una vista: mensaje + botón para reintentar. */
export function ErrorDeCarga({
  mensaje,
  alReintentar,
}: {
  mensaje: string
  alReintentar: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-red-50 text-red-600">
        <Warning size={24} weight="fill" />
      </span>
      <h2 className="text-base font-semibold text-zinc-900">No se pudieron cargar los datos</h2>
      <p className="max-w-sm text-sm text-zinc-500">{mensaje}</p>
      <div className="mt-2">
        <Button variante="secundario" onClick={alReintentar}>
          Reintentar
        </Button>
      </div>
    </div>
  )
}