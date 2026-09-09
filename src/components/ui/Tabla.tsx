import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface Props {
  encabezados: string[]
  children: ReactNode
  minimo?: string
}

/** Tabla base con encabezados consistentes y desplazamiento horizontal. */
export function Tabla({ encabezados, children, minimo = 'min-w-[640px]' }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-left', minimo)}>
        <thead>
          <tr className="border-b border-zinc-200">
            {encabezados.map((encabezado) => (
              <th
                key={encabezado}
                scope="col"
                className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase"
              >
                {encabezado}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">{children}</tbody>
      </table>
    </div>
  )
}

/** Celda de texto estándar. */
export function Celda({ className, children }: { className?: string; children: ReactNode }) {
  return <td className={cn('px-4 py-3 text-sm text-zinc-700', className)}>{children}</td>
}

/** Celda con un monto centrado en la derecha (tabular-nums). */
export function CeldaNumerica({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <td className={cn('px-4 py-3 text-right text-sm tabular-nums text-zinc-700', className)}>
      {children}
    </td>
  )
}