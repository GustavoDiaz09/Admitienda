import type { ReactNode } from 'react'
import { Storefront } from '@phosphor-icons/react'

/**
 * Lienzo de las pantallas de autenticación (login, registro, recuperar).
 * Fondo cálido con centrado asimétrico y marca a la izquierda.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-[100dvh] w-full">
      <div className="hidden w-1/2 flex-col justify-between overflow-hidden bg-zinc-950 p-10 lg:flex">
        <div className="flex items-center gap-2.5 text-white">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-500 text-zinc-950">
            <Storefront size={20} weight="bold" />
          </span>
          <span className="text-lg font-semibold tracking-tight">AdmiTienda</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Su inventario y finanzas, disponibles incluso sin conexión.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Productos, ingresos y egresos, resúmenes y alertas de stock. Los datos
            se guardan localmente y se sincronizan con la nube cuando hay red.
          </p>
        </div>
        <p className="text-xs text-zinc-600">Gestión de tienda · v1.1</p>
      </div>
      <div className="flex w-full flex-col items-center justify-center px-4 py-12 lg:w-1/2">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-500 text-zinc-950">
            <Storefront size={20} weight="bold" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-zinc-900">AdmiTienda</span>
        </div>
        <div className="w-full max-w-sm animate-desvanecer">{children}</div>
      </div>
    </div>
  )
}