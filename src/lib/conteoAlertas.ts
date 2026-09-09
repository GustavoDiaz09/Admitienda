import { create } from 'zustand'
import { ProductoController } from '../controller/ProductoController'

/** Conteo global de productos con stock bajo (badge de alertas en la barra). */
interface EstadoConteoAlertas {
  count: number
  fijar: (count: number) => void
}

export const useAlertasStore = create<EstadoConteoAlertas>((set) => ({
  count: 0,
  fijar: (count) => set({ count }),
}))

/** Recarga el conteo de productos con stock bajo. */
export async function actualizarConteoAlertas(): Promise<void> {
  const controlador = new ProductoController()
  const lista = await controlador.obtenerStockBajo()
  useAlertasStore.getState().fijar(lista.length)
}