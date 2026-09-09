import type { Producto } from '../model/types'
import type { TonoInsignia } from '../components/ui/Insignia'

/** Valor del stock de un producto convertido a "estado" visible. */
export function estadoDeProducto(p: Producto): { texto: string; tono: TonoInsignia } {
  if (p.cantidad_stock <= 0) return { texto: 'Agotado', tono: 'rojo' }
  if (p.cantidad_stock < p.stock_minimo) return { texto: 'Stock bajo', tono: 'ambar' }
  return { texto: 'Disponible', tono: 'esmeralda' }
}